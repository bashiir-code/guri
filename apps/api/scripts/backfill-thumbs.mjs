// One-time backfill: generate the ≤800px card thumbnail for listing photos that
// predate the thumbnail feature, and set each listing's `photoThumbs` parallel
// to its `photos`. Idempotent and self-correcting: the thumb key is a pure
// function of the photo key (`…/<uuid>.webp` → `…/<uuid>.thumb.webp`), so it
// rebuilds `photoThumbs` from `photos` every run, creating any missing thumb
// object in the bucket and leaving existing ones untouched. Safe to re-run.
//
// The resize params mirror StorageService.processPhotoToThumbWebp — keep them in
// sync if that method changes.
//
// Local:  cd apps/api && node --env-file=../../.env scripts/backfill-thumbs.mjs [--dry-run]
// Railway: railway run --service <api> -- pnpm --filter @guri/api backfill:thumbs
import { PrismaClient } from '@prisma/client';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';

const DRY_RUN = process.argv.includes('--dry-run');
const THUMB_MAX_DIMENSION = 800; // matches storage.service.ts

const prisma = new PrismaClient();
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'auto',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
});
const Bucket = process.env.S3_BUCKET ?? 'guri';

// `…/<uuid>.webp` → `…/<uuid>.thumb.webp` — the exact convention addPhotos uses.
function deriveThumbKey(photoKey) {
  if (photoKey.endsWith('.thumb.webp')) return photoKey; // already a thumb key
  if (!photoKey.endsWith('.webp')) return null; // unexpected shape — skip safely
  return photoKey.replace(/\.webp$/, '.thumb.webp');
}

async function objectExists(Key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket, Key }));
    return true;
  } catch {
    return false;
  }
}

async function getBytes(Key) {
  const res = await s3.send(new GetObjectCommand({ Bucket, Key }));
  return Buffer.from(await res.Body.transformToByteArray());
}

async function makeThumb(fullBytes) {
  return sharp(fullBytes, { failOn: 'error' })
    .rotate()
    .resize({
      width: THUMB_MAX_DIMENSION,
      height: THUMB_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 72 })
    .toBuffer();
}

const listings = await prisma.listing.findMany({
  where: { photos: { isEmpty: false } },
  select: { id: true, photos: true, photoThumbs: true },
});

let scanned = 0;
let listingsUpdated = 0;
let thumbsCreated = 0;
let thumbsExisting = 0;
let skippedKeys = 0;
let errors = 0;

for (const l of listings) {
  scanned++;
  const desired = l.photos.map(deriveThumbKey);
  const currentThumbs = l.photoThumbs ?? [];
  const alreadyAligned =
    currentThumbs.length === desired.length &&
    desired.every((k, i) => k !== null && currentThumbs[i] === k);

  for (let i = 0; i < l.photos.length; i++) {
    const thumbKey = desired[i];
    if (thumbKey === null) {
      console.warn(`  ! ${l.id} photo[${i}] "${l.photos[i]}" is not a .webp key — skipped`);
      skippedKeys++;
      continue;
    }
    try {
      if (await objectExists(thumbKey)) {
        thumbsExisting++;
        continue;
      }
      if (DRY_RUN) {
        thumbsCreated++; // would create
        continue;
      }
      const full = await getBytes(l.photos[i]);
      const thumb = await makeThumb(full);
      await s3.send(
        new PutObjectCommand({ Bucket, Key: thumbKey, Body: thumb, ContentType: 'image/webp' }),
      );
      thumbsCreated++;
    } catch (e) {
      console.error(`  ✗ ${l.id} photo[${i}] "${l.photos[i]}": ${String(e)}`);
      errors++;
    }
  }

  // Set photoThumbs = derived (drop any nulls → those photos keep the full-size
  // fallback). Only write when it actually changes.
  const nextThumbs = desired.filter((k) => k !== null);
  const needsWrite = !alreadyAligned && nextThumbs.length === l.photos.length;
  if (needsWrite) {
    if (!DRY_RUN) {
      await prisma.listing.update({ where: { id: l.id }, data: { photoThumbs: nextThumbs } });
    }
    listingsUpdated++;
  }
}

console.log(
  `${DRY_RUN ? '[dry-run] ' : ''}listings scanned=${scanned} updated=${listingsUpdated} | ` +
    `thumbs created=${thumbsCreated} existing=${thumbsExisting} | ` +
    `skipped non-webp=${skippedKeys} errors=${errors}`,
);
await prisma.$disconnect();
process.exit(errors > 0 ? 1 : 0);
