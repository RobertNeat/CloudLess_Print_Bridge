import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Video Service Hub (e2e)', () => {
  let app: INestApplication<App>;
  let storageRoot: string;
  const previousEnvironment = {
    storagePath: process.env.STORAGE_PATH,
    mqttPort: process.env.MQTT_PORT,
  };

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'video-service-hub-e2e-'));
    process.env.STORAGE_PATH = storageRoot;
    process.env.MQTT_PORT = '0';
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await rm(storageRoot, { recursive: true, force: true });
    restoreEnvironment('STORAGE_PATH', previousEnvironment.storagePath);
    restoreEnvironment('MQTT_PORT', previousEnvironment.mqttPort);
  });

  it('reports healthy storage and MQTT runtime', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      storage: { ready: true },
      mqtt: { mode: 'embedded', observer: { connected: true } },
    });
  });

  it('accepts a firmware-compatible JPEG upload', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const response = await request(app.getHttpServer())
      .post('/api/v1/cameras/a1b2c3/captures')
      .set('Content-Type', 'image/jpeg')
      .set('X-Request-Id', 'capture-001')
      .set('X-Resolution', 'UXGA')
      .set('X-Capture-Sequence', '0')
      .send(jpeg)
      .expect(201);
    expect(response.body).toMatchObject({
      stored: true,
      duplicate: false,
      cameraId: 'a1b2c3',
      requestId: 'capture-001',
      resolution: 'UXGA',
      sequence: 0,
    });
  });

  it('rejects a media type that only starts like image/jpeg', () =>
    request(app.getHttpServer())
      .post('/api/v1/cameras/a1b2c3/captures')
      .set('Content-Type', 'image/jpeg-invalid')
      .set('X-Request-Id', 'capture-002')
      .set('X-Resolution', 'VGA')
      .send(Buffer.from('not-a-jpeg'))
      .expect(400));
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
