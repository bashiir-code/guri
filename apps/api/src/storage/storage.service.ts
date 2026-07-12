import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';

export const PHOTO_URL_TTL_SECONDS = 15 * 60;
export const DOCUMENT_URL_TTL_SECONDS = 5 * 60; // short-lived per §9

// Cap decoded input at 50 megapixels. Multer already bounds the *file* size
// (15 MB photos / 20 MB docs), but a small file can still decode into a huge
// raster (a "decompression bomb") that would pin a worker's CPU/RAM. sharp's
// own default ceiling is ~268 MP; 50 MP is generous for phone cameras and
// rejects abuse well before it hurts. (§9 hardening)
export const MAX_INPUT_PIXELS = 50_000_000;

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const endpoint = config.get<string>('S3_ENDPOINT');
    const accessKeyId = config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('S3_SECRET_ACCESS_KEY');
    this.bucket = config.get<string>('S3_BUCKET') ?? 'guri';
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error('S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY must be set');
    }
    this.client = new S3Client({
      endpoint,
      region: config.get<string>('S3_REGION') ?? 'auto',
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: config.get<string>('S3_FORCE_PATH_STYLE') === 'true',
    });
  }

  // Cheap reachability probe for /health (§9 monitoring): confirms the bucket
  // is reachable and credentials are valid without transferring any object.
  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  // Fetch an object's bytes directly (server-side). Used by the backup RESTORE
  // test to pull the nightly dump back out of the bucket, and safe for any
  // trusted server path — end users still only ever get short-lived presigned
  // URLs (§9), never this.
  async getObject(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const body = res.Body as unknown as { transformToByteArray: () => Promise<Uint8Array> };
    return Buffer.from(await body.transformToByteArray());
  }

  // Encryption at rest is enforced at the bucket (MinIO SSE-KMS locally,
  // R2 default encryption in prod), so presigned GETs stay usable (§9).
  async presignGet(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  // §8/§9: retention purge + orphan cleanup delete objects from the bucket.
  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  // Lists object keys under a prefix (weekly orphan sweep, §8).
  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  // §11: photos resized server-side to ≤1280px WebP regardless of what the
  // client sends (clients also compress before upload to save data).
  //
  // Anything sharp can't decode — a truncated/corrupt file, a PDF or SVG, an
  // empty buffer, or an image over MAX_INPUT_PIXELS — is turned into a clean
  // 400 (`invalid_image`) instead of a raw throw that would surface as a 500
  // or, worse, take the worker down. The whole pipeline is wrapped so no sharp
  // failure ever escapes uncaught. (§9 hardening)
  async processPhotoToWebp(input: Buffer): Promise<Buffer> {
    if (!input || input.length === 0) throw new BadRequestException('invalid_image');
    try {
      return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
        .rotate() // honor EXIF orientation
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      throw new BadRequestException('invalid_image');
    }
  }
}
