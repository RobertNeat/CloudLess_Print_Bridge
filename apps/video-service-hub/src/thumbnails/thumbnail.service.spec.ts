import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ThumbnailService } from './thumbnail.service';

// Same rationale as transcoding.service.spec.ts: a hand-rolled SOI/EOI byte
// pair is not decodable video, so a real ffmpeg-produced JPEG is required to
// exercise actual frame scaling/extraction.
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgKCgsKCw0NDQ0NDRAPEBAQEBAQEBAQEBASEhIVFRUSEhIQEBISFBQVFRcXFxUVFRUXFxkZGR4eHBwjIyQrKzP/xABNAAEBAAAAAAAAAAAAAAAAAAAABwEBAQEAAAAAAAAAAAAAAAAAAAUHEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAGAAgAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AjgDf0sAAAAAB/9k=';

// A real, minimal mono PCM WAV (~100ms at 8kHz) rendered by ffmpeg
// (`-f lavfi -i sine=frequency=440:duration=0.1 -ac 1 -ar 8000`). showwavespic
// needs at least as many samples as the requested picture width (320px), so
// a shorter clip fails with ffmpeg's "Too few samples" and produces nothing.
const TINY_WAV_BASE64 =
  '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';

const BOUNDARY = 'unitcams3-frame';

function multipartOf(jpeg: Buffer, frameCount: number): Buffer {
  const chunks: Buffer[] = [];
  for (let index = 0; index < frameCount; index += 1) {
    chunks.push(
      Buffer.from(`--${BOUNDARY}\r\nContent-Type: image/jpeg\r\n\r\n`),
      jpeg,
      Buffer.from('\r\n'),
    );
  }
  return Buffer.concat(chunks);
}

describe('ThumbnailService', () => {
  let root: string;
  let service: ThumbnailService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'video-service-hub-thumb-'));
    service = new ThumbnailService();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('generates a JPEG thumbnail from a still image', async () => {
    const sourcePath = join(root, 'source.jpg');
    await writeFile(sourcePath, Buffer.from(TINY_JPEG_BASE64, 'base64'));
    const thumbnailPath = join(root, 'thumbnail.jpg');

    await service.ensureFromImage(sourcePath, thumbnailPath);

    expect(existsSync(thumbnailPath)).toBe(true);
    const bytes = await readFile(thumbnailPath);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
  }, 30_000);

  it('is idempotent: does not regenerate an already-existing thumbnail', async () => {
    const sourcePath = join(root, 'source.jpg');
    await writeFile(sourcePath, Buffer.from(TINY_JPEG_BASE64, 'base64'));
    const thumbnailPath = join(root, 'thumbnail.jpg');

    await service.ensureFromImage(sourcePath, thumbnailPath);
    const firstBytes = await readFile(thumbnailPath);
    await rm(sourcePath, { force: true });

    await expect(
      service.ensureFromImage(sourcePath, thumbnailPath),
    ).resolves.toBeUndefined();
    const secondBytes = await readFile(thumbnailPath);
    expect(secondBytes).toEqual(firstBytes);
  }, 30_000);

  it('does not leave a .tmp file behind after generating', async () => {
    const sourcePath = join(root, 'source.jpg');
    await writeFile(sourcePath, Buffer.from(TINY_JPEG_BASE64, 'base64'));
    const thumbnailPath = join(root, 'thumbnail.jpg');

    await service.ensureFromImage(sourcePath, thumbnailPath);

    const leftovers = (await readdir(root)).filter((name) =>
      name.endsWith('.tmp'),
    );
    expect(leftovers).toEqual([]);
  }, 30_000);

  it('skips ahead past likely firmware-initialization frames when the source has enough frames', async () => {
    const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
    const sourcePath = join(root, 'part-0000.mjpeg');
    await writeFile(sourcePath, multipartOf(jpeg, 5));
    const thumbnailPath = join(root, 'thumbnail.jpg');

    await service.ensureFromMjpeg(sourcePath, thumbnailPath);

    expect(existsSync(thumbnailPath)).toBe(true);
    const bytes = await readFile(thumbnailPath);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
  }, 30_000);

  it('falls back to frame 0 when the MJPEG source is too short to skip ahead', async () => {
    const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
    const sourcePath = join(root, 'part-short.mjpeg');
    await writeFile(sourcePath, multipartOf(jpeg, 1));
    const thumbnailPath = join(root, 'thumbnail.jpg');

    await service.ensureFromMjpeg(sourcePath, thumbnailPath);

    expect(existsSync(thumbnailPath)).toBe(true);
    const bytes = await readFile(thumbnailPath);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
  }, 30_000);

  it('renders a waveform PNG from a WAV via showwavespic', async () => {
    const sourcePath = join(root, 'audio.wav');
    await writeFile(sourcePath, Buffer.from(TINY_WAV_BASE64, 'base64'));
    const thumbnailPath = join(root, 'waveform.png');

    await service.ensureWaveform(sourcePath, thumbnailPath);

    expect(existsSync(thumbnailPath)).toBe(true);
    const bytes = await readFile(thumbnailPath);
    // PNG signature.
    expect(bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }, 30_000);

  it('leaves no thumbnail behind when the source is undecodable', async () => {
    const sourcePath = join(root, 'not-really.jpg');
    await writeFile(sourcePath, Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]));
    const thumbnailPath = join(root, 'thumbnail.jpg');

    await expect(
      service.ensureFromImage(sourcePath, thumbnailPath),
    ).resolves.toBeUndefined();

    expect(existsSync(thumbnailPath)).toBe(false);
    const leftovers = (await readdir(root)).filter((name) =>
      name.endsWith('.tmp'),
    );
    expect(leftovers).toEqual([]);
  }, 30_000);

  it('serializes concurrent generation for the same thumbnail path', async () => {
    const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
    const sourcePath = join(root, 'source.jpg');
    await writeFile(sourcePath, jpeg);
    const thumbnailPath = join(root, 'thumbnail.jpg');

    await Promise.all([
      service.ensureFromImage(sourcePath, thumbnailPath),
      service.ensureFromImage(sourcePath, thumbnailPath),
      service.ensureFromImage(sourcePath, thumbnailPath),
    ]);

    expect(existsSync(thumbnailPath)).toBe(true);
    const leftovers = (await readdir(root)).filter((name) =>
      name.endsWith('.tmp'),
    );
    expect(leftovers).toEqual([]);
  }, 30_000);
});
