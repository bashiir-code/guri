import { describe, expect, it, beforeAll } from 'vitest';
import sharp from 'sharp';
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  StorageService,
  MAX_INPUT_PIXELS,
  THUMB_MAX_DIMENSION,
} from '../src/storage/storage.service';

// The photo pipeline is the pilot's heaviest path. These tests prove that
// hostile or broken input is rejected as a clean 400 — never a raw throw that
// would surface as a 500 or crash the worker. Only the pure sharp step runs;
// S3 is never touched, so a stub config is enough.
const stubConfig = {
  get: (key: string) =>
    ({
      S3_ENDPOINT: 'http://localhost:9000',
      S3_ACCESS_KEY_ID: 'test',
      S3_SECRET_ACCESS_KEY: 'test',
      S3_BUCKET: 'guri',
      S3_REGION: 'auto',
      S3_FORCE_PATH_STYLE: 'true',
    })[key],
} as unknown as ConfigService;

const storage = new StorageService(stubConfig);

describe('processPhotoToWebp — clean rejection, no crash', () => {
  it('rejects an empty buffer with a 400, not a crash', async () => {
    await expect(storage.processPhotoToWebp(Buffer.alloc(0))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects random/garbage bytes (not an image) with a 400', async () => {
    const garbage = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 37) % 256));
    await expect(storage.processPhotoToWebp(garbage)).rejects.toMatchObject({
      response: { message: 'invalid_image' },
    });
  });

  it('rejects a truncated JPEG (valid header, cut off mid-stream) with a 400', async () => {
    const jpeg = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#4477aa' },
    })
      .jpeg()
      .toBuffer();
    const truncated = jpeg.subarray(0, Math.floor(jpeg.length / 2));
    await expect(storage.processPhotoToWebp(truncated)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a decompression bomb (tiny file, >50 MP decoded) with a 400', async () => {
    // 8000×7000 = 56 MP > MAX_INPUT_PIXELS, but a solid color compresses to a
    // few KB on disk — exactly the small-file / huge-raster abuse we guard.
    expect(8000 * 7000).toBeGreaterThan(MAX_INPUT_PIXELS);
    const bomb = await sharp({
      create: { width: 8000, height: 7000, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    await expect(storage.processPhotoToWebp(bomb)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('processPhotoToWebp — valid images still succeed', () => {
  let big: Buffer;
  beforeAll(async () => {
    big = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#173a31' },
    })
      .jpeg()
      .toBuffer();
  });

  it('re-encodes a normal 12 MP photo to WebP ≤1280px', async () => {
    const out = await storage.processPhotoToWebp(big);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1280);
    // WebP of a downsized image should be far smaller than the source JPEG.
    expect(out.length).toBeLessThan(big.length);
  });

  it('makes a card thumbnail that is WebP, ≤800px, and lighter than the full image', async () => {
    const [full, thumb] = await Promise.all([
      storage.processPhotoToWebp(big),
      storage.processPhotoToThumbWebp(big),
    ]);
    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(THUMB_MAX_DIMENSION);
    // The whole point: the card cover ships fewer bytes than the full image.
    expect(thumb.length).toBeLessThan(full.length);
  });

  it('rejects broken input for the thumbnail path too (clean 400)', async () => {
    await expect(storage.processPhotoToThumbWebp(Buffer.alloc(0))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
