/**
 * Seeds a running video-service-hub with realistic media across every kind
 * (captures, timelapses, recordings, audio, live), using real multi-part
 * uploads with real SHA256 content, against the actual ingest endpoints --
 * there is no physical camera available in dev, so this script is the
 * closest thing to an end-to-end fixture and the source of the dataset used
 * for a live dashboard check.
 *
 * Usage:
 *   pnpm --filter @cloudless/video-service-hub exec ts-node scripts/seed-media.ts
 *
 * Env overrides:
 *   SEED_HUB_URL           default http://localhost:10322
 *   SEED_CAMERA_ID         default a1b2c3
 *   SEED_CAMERA_NAME       default front       (registers the camera with this displayName)
 *   SEED_CAMERA_IP         default 192.168.1.205
 */
import { createHash } from 'node:crypto';

const HUB_URL = process.env.SEED_HUB_URL ?? 'http://localhost:10322';
const CAMERA_ID = process.env.SEED_CAMERA_ID ?? 'a1b2c3';
const CAMERA_NAME = process.env.SEED_CAMERA_NAME ?? 'front';
const CAMERA_IP = process.env.SEED_CAMERA_IP ?? '192.168.1.205';

// A real, tiny, ffmpeg-decodable JPEG (see thumbnail.service.spec.ts for why
// a hand-rolled SOI/EOI byte pair is not enough to exercise real generation).
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgKCgsKCw0NDQ0NDRAPEBAQEBAQEBAQEBASEhIVFRUSEhIQEBISFBQVFRcXFxUVFRUXFxkZGR4eHBwjIyQrKzP/xABNAAEBAAAAAAAAAAAAAAAAAAAABwEBAQEAAAAAAAAAAAAAAAAAAAUHEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAGAAgAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AjgDf0sAAAAAB/9k=';
const TINY_WAV_BASE64 =
  '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';
const BOUNDARY = 'unitcams3-frame';

const jpeg = Buffer.from(TINY_JPEG_BASE64, 'base64');
const wav = Buffer.from(TINY_WAV_BASE64, 'base64');

function multipartFrame(): Buffer {
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\nContent-Type: image/jpeg\r\n\r\n`),
    jpeg,
    Buffer.from('\r\n'),
  ]);
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function post(
  path: string,
  body: Buffer,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${HUB_URL}${path}`, {
    method: 'POST',
    headers,
    body: new Uint8Array(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${path} -> ${response.status}: ${text}`);
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function registerCamera(): Promise<void> {
  const baseUrl = `http://${CAMERA_IP}`;
  const createResponse = await fetch(`${HUB_URL}/api/v1/camera-registry/${CAMERA_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl, displayName: CAMERA_NAME }),
  });
  if (createResponse.status === 409) {
    await fetch(`${HUB_URL}/api/v1/camera-registry/${CAMERA_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, displayName: CAMERA_NAME }),
    });
  } else if (!createResponse.ok && createResponse.status !== 409) {
    throw new Error(`camera-registry create -> ${createResponse.status}: ${await createResponse.text()}`);
  }
  console.log(`registered camera ${CAMERA_ID} as "${CAMERA_NAME}" (${baseUrl})`);
}

async function seedCapture(requestId: string): Promise<void> {
  await post(`/api/v1/cameras/${CAMERA_ID}/captures/${requestId}`, jpeg, {
    'Content-Type': 'image/jpeg',
    'X-Resolution': 'UXGA',
    'X-Sha256': sha256(jpeg),
  });
}

async function seedTimelapse(requestId: string, frameCount: number): Promise<void> {
  for (let part = 0; part < frameCount; part += 1) {
    await post(
      `/api/v1/cameras/${CAMERA_ID}/timelapses/${requestId}/parts/${part}`,
      jpeg,
      {
        'Content-Type': 'image/jpeg',
        'X-Resolution': 'VGA',
        'X-Total-Parts': String(frameCount),
        'X-Sha256': sha256(jpeg),
      },
    );
  }
}

async function seedRecording(requestId: string, partCount: number): Promise<void> {
  for (let part = 0; part < partCount; part += 1) {
    const frame = multipartFrame();
    await post(
      `/api/v1/cameras/${CAMERA_ID}/recordings/${requestId}/parts/${part}`,
      frame,
      {
        'Content-Type': 'multipart/x-mixed-replace; boundary=' + BOUNDARY,
        'X-Resolution': 'VGA',
        'X-Total-Parts': String(partCount),
        'X-Requested-Duration-Seconds': '4',
        'X-Total-Frames': String(partCount),
        'X-Sha256': sha256(frame),
      },
    );
  }
}

async function seedAudio(requestId: string, partCount: number): Promise<void> {
  for (let part = 0; part < partCount; part += 1) {
    await post(`/api/v1/cameras/${CAMERA_ID}/audio/${requestId}/parts/${part}`, wav, {
      'Content-Type': 'audio/wav',
      'X-Total-Parts': String(partCount),
      'X-Duration-Seconds': '2',
      'X-Sha256': sha256(wav),
    });
  }
}

async function seedLive(requestId: string, frameCount: number): Promise<void> {
  const body = Buffer.concat(Array.from({ length: frameCount }, () => multipartFrame()));
  await post(`/api/v1/cameras/${CAMERA_ID}/live`, body, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=' + BOUNDARY,
    'X-Request-Id': requestId,
    'X-Resolution': 'VGA',
  });
}

async function main(): Promise<void> {
  await registerCamera();

  // 25 captures across a single day to exercise the day-grouped _00x
  // counter, including the page-boundary case (item 21 must read _021, not
  // restart at _001) for the dashboard's default 20-per-page list.
  console.log('seeding 25 captures...');
  for (let index = 0; index < 25; index += 1) {
    await seedCapture(`seed-capture-${String(index).padStart(3, '0')}`);
  }

  console.log('seeding 3 timelapses...');
  for (let index = 0; index < 3; index += 1) {
    await seedTimelapse(`seed-timelapse-${index}`, 3 + index);
  }

  console.log('seeding 3 recordings...');
  for (let index = 0; index < 3; index += 1) {
    await seedRecording(`seed-recording-${index}`, 2 + index);
  }

  console.log('seeding 3 audio clips...');
  for (let index = 0; index < 3; index += 1) {
    await seedAudio(`seed-audio-${index}`, 1 + index);
  }

  console.log('seeding 1 live recording...');
  await seedLive('seed-live-0', 3);

  console.log('done.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
