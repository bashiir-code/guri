// Pre-launch: delete all uploaded content objects (photos, documents,
// agreements) from the storage bucket. Keeps backups/. Dev-only helper.
// Usage: cd apps/api && node --env-file=../../.env scripts/clear-bucket.mjs
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'auto',
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
});
const Bucket = process.env.S3_BUCKET ?? 'guri';
const PREFIXES = ['photos/', 'owner-docs/', 'customer-docs/', 'agreements/', 'intake-photos/', 'intake-docs/'];

let deleted = 0;
for (const Prefix of PREFIXES) {
  let token;
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken: token }));
    for (const obj of res.Contents ?? []) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: obj.Key }));
      deleted++;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
}
console.log(`cleared ${deleted} content objects (backups/ kept)`);
