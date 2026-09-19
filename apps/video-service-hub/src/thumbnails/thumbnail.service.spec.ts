import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ThumbnailService } from './thumbnail.service';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// Same rationale as transcoding.service.spec.ts: a hand-rolled SOI/EOI byte
// pair is not decodable video, so a real ffmpeg-produced JPEG is required to
// exercise actual frame scaling/extraction.
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgKCgsKCw0NDQ0NDRAPEBAQEBAQEBAQEBASEhIVFRUSEhIQEBISFBQVFRcXFxUVFRUXFxkZGR4eHBwjIyQrKzP/xABNAAEBAAAAAAAAAAAAAAAAAAAABwEBAQEAAAAAAAAAAAAAAAAAAAUHEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAGAAgAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AjgDf0sAAAAAB/9k=';

// A real 300ms mono WAV at 4kHz with a near-silent (-64dB peak) sine tone,
// rendered by ffmpeg (`sine=frequency=300:duration=0.3` at `volume=0.005`).
// Stands in for room-tone/white-noise: a clip with no real recorded signal.
const QUIET_WAV_BASE64 =
  'UklGRqYJAABXQVZFZm10IBAAAAABAAEAoA8AAEAfAAACABAATElTVBoAAABJTkZPSVNGVA4AAABMYXZmNjAuMTYuMTAwAGRhdGFgCQAAAgAJABEAFAAUAA4ABgD9//T/7v/s/+7/9P/9/wYADgATABQAEQAJAAAA9//v/+z/7f/y//r/AwAMABIAFAASAAwAAwD6//L/7f/s/+//9/8AAAkAEQAUABMADgAGAP3/9P/u/+z/7v/0//3/BgAOABMAFAARAAkAAAD3/+//7P/t//L/+v8DAAwAEgAUABIADAADAPr/8v/t/+z/7//3/wAACQARABQAEwAOAAYA/f/0/+7/7P/u//T//f8GAA4AEwAUABEACQAAAPf/7//s/+3/8v/6/wMADAASABQAEgAMAAMA+v/y/+3/7P/v//f/AAAJABEAFAATAA4ABgD9//T/7v/s/+7/9P/9/wYADgATABQAEQAJAAAA9//v/+z/7f/y//r/AwAMABIAFAASAAwAAwD6//L/7f/s/+//9/8AAAkAEQAUABMADgAGAP3/9P/u/+z/7v/0//3/BgAOABMAFAARAAkAAAD3/+//7P/t//L/+v8DAAwAEgAUABIADAADAPr/8v/t/+z/7//3/wAACQARABQAEwAOAAYA/f/0/+7/7P/u//T//f8GAA4AEwAUABEACQAAAPf/7//s/+3/8v/6/wMADAASABQAEgAMAAMA+v/y/+3/7P/v//f/AAAJABEAFAATAA4ABgD9//T/7v/s/+7/9P/9/wYADgATABQAEQAJAAAA9//v/+z/7f/y//r/AwAMABIAFAASAAwAAwD6//L/7f/s/+//9/8AAAkAEQAUABMADgAGAP3/9P/u/+z/7v/0//3/BgAOABMAFAARAAkAAAD3/+//7P/t//L/+v8DAAwAEgAUABIADAADAPr/8v/t/+z/7//3/wAACQARABQAEwAOAAYA/f/0/+7/7P/u//T//f8GAA4AEwAUABEACQAAAPf/7//s/+3/8v/6/wMADAASABQAEgAMAAMA+v/y/+3/7P/v//f/AAAJABEAFAATAA4ABgD9//T/7v/s/+7/9P/9/wYADgATABQAEQAJAAAA9//v/+z/7f/y//r/AwAMABIAFAASAAwAAwD6//L/7f/s/+//9/8AAAkAEQAUABMADgAGAP3/9P/u/+z/7v/0//3/BgAOABMAFAARAAkAAAD3/+//7P/t//L/+v8DAAwAEgAUABIADAADAPr/8v/t/+z/7//3/wAACQARABQAEwAOAAYA/f/0/+7/7P/u//T//f8GAA4AEwAUABEACQAAAPf/7//s/+3/8v/6/wMADAASABQAEgAMAAMA+v/y/+3/7P/v//f/AAAJABEAFAATAA4ABgD9//T/7v/s/+7/9P/9/wYADgATABQAEQAJAAAA9//v/+z/7f/y//r/AwAMABIAFAASAAwAAwD6//L/7f/s/+//9/8AAAkAEQAUABMADgAGAP3/9P/u/+z/7v/0//3/BgAOABMAFAARAAkAAAD3/+//7P/t//L/+v8DAAwAEgAUABIADAADAPr/8v/t/+z/7//3/wAACQARABQAEwAOAAYA/f/0/+7/7P/u//T//f8GAA4AEwAUABEACQAAAPf/7//s/+3/8v/6/wMADAASABQAEgAMAAMA+v/y/+3/7P/v//f/AAAJABEAFAATAA4ABgD9//T/7v/s/+7/9P/9/wYADgATABQAEQAJAAAA9//v/+z/7f/y//r/AwAMABIAFAASAAwAAwD6//L/7f/s/+//9/8AAAkAEQAUABMADgAGAP3/9P/u/+z/7v/0//3/BgAOABMAFAARAAkAAAD3/+//7P/t//L/+v8DAAwAEgAUABIADAADAPr/8v/t/+z/7//3/wAACQARABQAEwAOAAYA/f/0/+7/7P/u//T//f8GAA4AEwAUABEACQAAAPf/7//s/+3/8v/6/wMADAASABQAEgAMAAMA+v/y/+3/7P/v//f/AAAJABEAFAATAA4ABgD9//T/7v/s/+7/9P/9/wYADgATABQAEQAJAAAA9//v/+z/7f/y//r/AwAMABIAFAASAAwAAwD6//L/7f/s/+//9/8AAAkAEQAUABMADgAGAP3/9P/u/+z/7v/0//3/BgAOABMAFAARAAkAAAD3/+//7P/t//L/+v8DAAwAEgAUABIADAADAPr/8v/t/+z/7//3/wAACQARABQAEwAOAAYA/f/0/+7/7P/u//T//f8GAA4AEwAUABEACQAAAPf/7//s/+3/8v/6/wMADAASABQAEgAMAAMA+v/y/+3/7P/v//f/AAAJABEAFAATAA4ABgD9//T/7v/s/+7/9P/9/wYADgATABQAEQAJAAAA9//v/+z/7f/y//r/AwAMABIAFAASAAwAAwD6//L/7f/s/+//9/8AAAkAEQAUABMADgAGAP3/9P/u/+z/7v/0//3/BgAOABMAFAARAAkAAAD3/+//7P/t//L/+v8DAAwAEgAUABIADAADAPr/8v/t/+z/7//3/wAACQARABQAEwAOAAYA/f/0/+7/7P/u//T//f8GAA4AEwAUABEACQAAAPf/7//s/+3/8v/6/wMADAASABQAEgAMAAMA+v/y/+3/7P/v//f/AAAJABEAFAATAA4ABgD9//T/7v/s/+7/9P/9/wYADgATABQAEQAJAAAA9//v/+z/7f/y//r/AwAMABIAFAASAAwAAwD6//L/7f/s/+//9/8AAAkAEQAUABMADgAGAP3/9P/u/+z/7v/0//3/BgAOABMAFAARAAkAAAD3/+//7P/t//L/+v8DAAwAEgAUABIADAADAPr/8v/t/+z/7//3/wAACQARABQAEwAOAAYA/f/0/+7/7P/u//T//f8GAA4AEwAUABEACQAAAPf/7//s/+3/8v/6/wMADAASABQAEgAMAAMA+v/y/+z/7P/v//f/';

// A real, minimal WAV with a constant DC bias (~0.0355 of full scale,
// crest factor ~1.03 -- essentially no dynamic range) and no other signal,
// rendered by ffmpeg (`aevalsrc=0.0355+0.001*sin(2*PI*997*t)`). This
// reproduces the actual defect found in this project's camera-mic
// recordings (verified via `ffmpeg -af astats`): every real clip captured
// by the hardware carries this exact bias regardless of whether anything
// was recorded, which defeated the original peak/RMS-normalizing gain (see
// WAVEFORM_FIXED_GAIN_DB doc in thumbnail.service.ts) by making every clip
// measure as equally "loud."
const DC_BIASED_WAV_BASE64 =
  'UklGRqYJAABXQVZFZm10IBAAAAABAAEAoA8AAEAfAAACABAATElTVBoAAABJTkZPSVNGVA4AAABMYXZmNjAuMTYuMTAwAGRhdGFgCQAAiwSsBIwEagSLBKwEjARrBIoErASNBGsEiQSsBI0EawSJBKwEjgRrBIgErASPBGsEiASsBI8EawSHBKwEkARrBIYErASQBGsEhgSsBJEEawSFBKsEkgRrBIUEqwSSBGsEhASrBJMEawSDBKsElARsBIMEqwSUBGwEggSrBJUEbASCBKsElQRsBIEEqgSWBGwEgASqBJYEbQSABKoElwRtBH8EqgSYBG0EfwSpBJgEbQR+BKkEmQRtBH0EqQSZBG4EfQSpBJoEbgR8BKgEmgRuBHwEqASbBG8EewSoBJsEbwR7BKcEnARvBHoEpwSdBHAEegSnBJ0EcAR5BKcEngRwBHkEpgSeBHEEeASmBJ8EcQR4BKUEnwRxBHcEpQSgBHIEdwSlBKAEcgR2BKQEoQRyBHYEpAShBHMEdQSjBKEEcwR1BKMEogR0BHQEowSiBHQEdASiBKMEdQR0BKIEowR1BHMEoQSkBHUEcwShBKQEdgRyBKAEpAR2BHIEoASlBHcEcQSfBKUEdwRxBJ8EpgR4BHEEngSmBHgEcASeBKYEeQRwBJ0EpwR5BHAEnQSnBHoEbwScBKcEegRvBJwEqAR7BG8EmwSoBHwEbgSbBKgEfARuBJoEqQR9BG4EmgSpBH0EbgSZBKkEfgRtBJkEqQR+BG0EmASqBH8EbQSXBKoEfwRtBJcEqgSABGwElgSqBIEEbASWBKoEgQRsBJUEqwSCBGwElASrBIIEbASUBKsEgwRsBJMEqwSEBGsEkwSrBIQEawSSBKsEhQRrBJEEqwSFBGsEkQSsBIYEawSQBKwEhwRrBJAErASHBGsEjwSsBIgEawSOBKwEiARrBI4ErASJBGsEjQSsBIoEawSNBKwEigRrBIwErASLBGoEiwSsBIwEagSLBKwEjARrBIoErASNBGsEiQSsBI0EawSJBKwEjgRrBIgErASPBGsEiASsBI8EawSHBKwEkARrBIYErASQBGsEhgSsBJEEawSFBKsEkgRrBIUEqwSSBGsEhASrBJMEawSDBKsEkwRsBIMEqwSUBGwEggSrBJUEbASCBKsElQRsBIEEqgSWBGwEgASqBJYEbQSABKoElwRtBH8EqgSYBG0EfwSpBJgEbQR+BKkEmQRtBH4EqQSZBG4EfQSpBJoEbgR8BKgEmwRvBHsEqASbBG8EewSoBJsEbwR7BKgEnARvBHoEpwSdBG8EegSnBJ0EcAR5BKcEngRwBHkEpgSeBHEEeASmBJ8EcQR4BKUEnwRxBHcEpQSgBHIEdwSlBKAEcgR2BKQEoQRyBHYEpAShBHMEdQSkBKEEcwR1BKMEogR0BHQEowSiBHQEdASiBKMEdQR0BKIEowR1BHMEoQSkBHUEcwShBKQEdgRyBKAEpAR2BHIEoASlBHcEcgSfBKUEdwRxBJ8EpgR4BHEEngSmBHgEcASeBKYEeQRwBJ0EpwR5BHAEnQSnBHoEbwScBKcEegRvBJwEqAR7BG8EmwSoBHsEbgSbBKgEfARuBJoEqAR9BG4EmgSpBH0EbgSZBKkEfgRtBJkEqQR+BG0EmASpBH8EbQSXBKoEfwRtBJcEqgSABGwElgSqBIEEbASWBKoEgQRsBJUEqwSCBGwElQSrBIIEbASUBKsEgwRsBJMEqwSDBGsEkwSrBIQEawSSBKsEhQRrBJIEqwSFBGsEkQSsBIYEawSQBKwEhgRrBJAErASHBGsEjwSsBIgEawSPBKwEiARrBI4ErASJBGsEjQSsBIoEawSNBKwEigRrBIwErASLBGoEiwSsBIsEagSLBKwEjARrBIoErASNBGsEigSsBI0EawSJBKwEjgRrBIgErASPBGsEiASsBI8EawSHBKwEkARrBIYErASQBGsEhgSsBJEEawSFBKsEkgRrBIUEqwSSBGsEhASrBJMEawSDBKsEkwRsBIMEqwSUBGwEggSrBJUEbASCBKsElQRsBIEEqgSWBGwEgQSqBJYEbASABKoElwRtBH8EqgSXBG0EfwSpBJgEbQR+BKkEmQRtBH4EqQSZBG4EfQSpBJoEbgR9BKgEmgRuBHwEqASbBG4EewSoBJsEbwR7BKgEnARvBHoEpwScBG8EegSnBJ0EcAR5BKcEnQRwBHkEpgSeBHAEeASmBJ4EcQR4BKYEnwRxBHcEpQSfBHIEdwSlBKAEcgR2BKQEoARyBHYEpAShBHMEdQSkBKEEcwR1BKMEogR0BHQEowSiBHQEdASiBKMEdAR0BKIEowR1BHMEoQSkBHUEcwShBKQEdgRyBKAEpAR2BHIEoASlBHcEcgSgBKUEdwRxBJ8EpQR4BHEE';

// A real 300ms mono WAV at 4kHz with a moderate (-28dB peak) sine tone,
// rendered by ffmpeg (`sine=frequency=440:duration=0.3` at `volume=0.3`).
// Stands in for a clip with real recorded signal, but not close/loud.
const LOUD_WAV_BASE64 =
  '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';

// A real 300ms mono WAV at 4kHz with a near-full-scale (-19dB peak) sine
// tone, rendered by ffmpeg (`sine=frequency=440:duration=0.3` at
// `volume=0.9`). Stands in for real loud/close speech.
const NEAR_FULL_SCALE_WAV_BASE64 =
  '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';

const BOUNDARY = 'unitcams3-frame';

/**
 * Loads a generated PNG's alpha channel (the spectrogram-derived intensity
 * mask, pre-gradient) as raw pixels, used to verify content without trusting
 * visual inspection -- see thumbnail generation findings: several ffmpeg
 * filter chains here silently produced different-looking-but-wrong output
 * (e.g. a dropped highpass reintroducing a DC bias band), so assertions are
 * made on raw decoded pixels, not on how the PNG looks.
 */
async function loadAlphaChannel(
  pngPath: string,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const width = 640;
  const height = 360;
  const rawPath = `${pngPath}.rgba.raw`;
  await new Promise<void>((resolvePromise, reject) => {
    ffmpeg(pngPath)
      .outputOptions(['-pix_fmt', 'rgba'])
      .format('rawvideo')
      .on('error', reject)
      .on('end', () => resolvePromise())
      .save(rawPath);
  });
  const rgba = await readFile(rawPath);
  await rm(rawPath, { force: true });
  const alpha = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i += 1) alpha[i] = rgba[i * 4 + 3];
  return { buffer: alpha, width, height };
}

/** Highest alpha (spectrogram intensity) value anywhere in the image -- the brightest frequency/time bin. */
async function maxIntensity(pngPath: string): Promise<number> {
  const { buffer } = await loadAlphaChannel(pngPath);
  let max = 0;
  for (const value of buffer) if (value > max) max = value;
  return max;
}

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

  describe('ensureWaveforms', () => {
    function pngSignature(bytes: Buffer): Buffer {
      return bytes.subarray(0, 8);
    }

    it('generates both a dark-mode and light-mode gradient PNG', async () => {
      const sourcePath = join(root, 'audio.wav');
      await writeFile(sourcePath, Buffer.from(LOUD_WAV_BASE64, 'base64'));
      const darkPath = join(root, 'waveform-dark.png');
      const lightPath = join(root, 'waveform-light.png');

      await service.ensureWaveforms(sourcePath, {
        dark: darkPath,
        light: lightPath,
      });

      expect(existsSync(darkPath)).toBe(true);
      expect(existsSync(lightPath)).toBe(true);
      expect(pngSignature(await readFile(darkPath))).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      expect(pngSignature(await readFile(lightPath))).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    }, 30_000);

    it('is idempotent and does not leave .tmp files behind', async () => {
      const sourcePath = join(root, 'audio.wav');
      await writeFile(sourcePath, Buffer.from(LOUD_WAV_BASE64, 'base64'));
      const darkPath = join(root, 'waveform-dark.png');
      const lightPath = join(root, 'waveform-light.png');

      await service.ensureWaveforms(sourcePath, {
        dark: darkPath,
        light: lightPath,
      });
      const firstDarkBytes = await readFile(darkPath);
      await rm(sourcePath, { force: true });

      await service.ensureWaveforms(sourcePath, {
        dark: darkPath,
        light: lightPath,
      });

      expect(await readFile(darkPath)).toEqual(firstDarkBytes);
      const leftovers = (await readdir(root)).filter((name) =>
        name.endsWith('.tmp'),
      );
      expect(leftovers).toEqual([]);
    }, 30_000);

    it('renders a near-full-scale (loud/close speech) clip with a much brighter spectrogram than near-silence', async () => {
      const loudPath = join(root, 'near-full.wav');
      await writeFile(
        loudPath,
        Buffer.from(NEAR_FULL_SCALE_WAV_BASE64, 'base64'),
      );
      const loudDarkPath = join(root, 'near-full-dark.png');
      await service.ensureWaveforms(loudPath, {
        dark: loudDarkPath,
        light: join(root, 'near-full-light.png'),
      });

      const quietPath = join(root, 'quiet.wav');
      await writeFile(quietPath, Buffer.from(QUIET_WAV_BASE64, 'base64'));
      const quietDarkPath = join(root, 'quiet-dark.png');
      await service.ensureWaveforms(quietPath, {
        dark: quietDarkPath,
        light: join(root, 'quiet-light.png'),
      });

      const loudMax = await maxIntensity(loudDarkPath);
      const quietMax = await maxIntensity(quietDarkPath);
      // A distinct tone occupies one narrow, near-full-brightness frequency
      // bin; broadband noise stays dim everywhere. This is the case this
      // feature needs to get right: real, audible-volume content must read
      // as clearly louder than near-silence -- see the module doc comment
      // in thumbnail.service.ts for why a spectrogram, not a plain
      // amplitude waveform, is used to tell them apart.
      expect(loudMax).toBeGreaterThan(quietMax + 100);
    }, 30_000);

    it("regression: a clip whose only content is the camera mic's constant DC bias does not paint an artificial bright band into every thumbnail", async () => {
      // This is the actual defect found in this project's real camera
      // recordings: every clip -- silent or not -- carries the same ~0.0355
      // DC bias (see DC_BIASED_WAV_BASE64 and SPECTROGRAM_HIGHPASS_HZ in
      // thumbnail.service.ts). Un-removed, that bias shows up as an
      // identical bright low-frequency band in every spectrogram, which
      // would make every clip look like it contains the same "content"
      // regardless of what was actually recorded. With the bias removed,
      // this DC-only clip should look about as dim as genuine near-silence,
      // not brighter.
      const dcBiasedPath = join(root, 'dc-biased.wav');
      await writeFile(
        dcBiasedPath,
        Buffer.from(DC_BIASED_WAV_BASE64, 'base64'),
      );
      const dcBiasedDarkPath = join(root, 'dc-biased-dark.png');
      await service.ensureWaveforms(dcBiasedPath, {
        dark: dcBiasedDarkPath,
        light: join(root, 'dc-biased-light.png'),
      });

      const quietPath = join(root, 'quiet.wav');
      await writeFile(quietPath, Buffer.from(QUIET_WAV_BASE64, 'base64'));
      const quietDarkPath = join(root, 'quiet-dark.png');
      await service.ensureWaveforms(quietPath, {
        dark: quietDarkPath,
        light: join(root, 'quiet-light.png'),
      });

      const dcBiasedMax = await maxIntensity(dcBiasedDarkPath);
      const quietMax = await maxIntensity(quietDarkPath);
      // A wide margin: the un-fixed bug produced a bright band pinned near
      // 199-209 (see git history) regardless of quietMax, so this only
      // needs to rule out that magnitude of artifact, not assert the two
      // clips are pixel-identical.
      expect(dcBiasedMax).toBeLessThan(quietMax + 100);
    }, 30_000);

    it('renders the dark variant lighter near the top of the frame and the light variant darker near the top (gradient direction)', async () => {
      const sourcePath = join(root, 'audio.wav');
      await writeFile(
        sourcePath,
        Buffer.from(NEAR_FULL_SCALE_WAV_BASE64, 'base64'),
      );
      const darkPath = join(root, 'waveform-dark.png');
      const lightPath = join(root, 'waveform-light.png');

      await service.ensureWaveforms(sourcePath, {
        dark: darkPath,
        light: lightPath,
      });

      // Find the brightest row (the tone's frequency bin) in the dark
      // variant's alpha/intensity channel, then compare that row's opaque
      // color against a row near the bottom of the frame, for both
      // variants -- rather than assuming any particular row index, since
      // that depends on the tone's exact frequency.
      const findBrightestRow = (
        alpha: Buffer,
        width: number,
        height: number,
      ): number => {
        let bestRow = 0;
        let bestValue = -1;
        for (let y = 0; y < height; y += 1) {
          let sum = 0;
          for (let x = 0; x < width; x += 1) sum += alpha[y * width + x];
          if (sum > bestValue) {
            bestValue = sum;
            bestRow = y;
          }
        }
        return bestRow;
      };
      const loadRgba = async (pngPath: string): Promise<Buffer> => {
        const rawPath = `${pngPath}.raw`;
        await new Promise<void>((resolvePromise, reject) => {
          ffmpeg(pngPath)
            .outputOptions(['-pix_fmt', 'rgba'])
            .format('rawvideo')
            .on('error', reject)
            .on('end', () => resolvePromise())
            .save(rawPath);
        });
        const buffer = await readFile(rawPath);
        await rm(rawPath, { force: true });
        return buffer;
      };
      const width = 640;
      const height = 360;
      const redAt = (buffer: Buffer, x: number, y: number) =>
        buffer[(y * width + x) * 4];

      const { buffer: darkAlpha } = await loadAlphaChannel(darkPath);
      const darkRgba = await loadRgba(darkPath);
      const lightRgba = await loadRgba(lightPath);
      const brightRow = findBrightestRow(darkAlpha, width, height);
      const bottomRow = height - 10;

      // Dark-mode gradient is white (bright) near the top of the frame,
      // fading to darkgrey toward the bottom.
      expect(redAt(darkRgba, 0, brightRow)).toBeGreaterThan(
        redAt(darkRgba, 0, bottomRow),
      );
      // Light-mode gradient is black (dark) near the top, fading to
      // darkgrey toward the bottom -- the opposite direction from dark-mode.
      expect(redAt(lightRgba, 0, brightRow)).toBeLessThan(
        redAt(lightRgba, 0, bottomRow),
      );
    }, 30_000);
  });

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
