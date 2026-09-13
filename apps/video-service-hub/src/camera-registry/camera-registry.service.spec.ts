import { ConflictException, NotFoundException } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadServiceConfig } from '../config/service-config';
import { CameraRegistryService } from './camera-registry.service';

describe('CameraRegistryService', () => {
  let storageRoot: string;
  let service: CameraRegistryService;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'video-service-hub-registry-'));
    service = new CameraRegistryService(
      loadServiceConfig({
        VIDEO_SERVICE_HUB_STORAGE_PATH: storageRoot,
        VIDEO_SERVICE_HUB_MQTT_PORT: '0',
      }),
    );
    await service.initialize();
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('creates a camera and rejects duplicate registration', async () => {
    const entry = await service.create('camera-1', {
      baseUrl: 'http://192.168.1.50',
      displayName: 'Workshop',
    });

    expect(entry).toMatchObject({
      cameraId: 'camera-1',
      baseUrl: 'http://192.168.1.50',
      displayName: 'Workshop',
    });
    await expect(
      service.create('camera-1', { baseUrl: 'http://192.168.1.51' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an invalid base URL', async () => {
    await expect(
      service.create('camera-1', { baseUrl: 'not-a-url' }),
    ).rejects.toThrow();
  });

  it('updates only the provided fields', async () => {
    await service.create('camera-1', {
      baseUrl: 'http://192.168.1.50',
      displayName: 'Workshop',
      locationCode: 'A1',
    });
    const updated = await service.update('camera-1', {
      displayName: 'Workshop Camera',
    });

    expect(updated).toMatchObject({
      baseUrl: 'http://192.168.1.50',
      displayName: 'Workshop Camera',
      locationCode: 'A1',
    });
  });

  it('removes a registered camera', async () => {
    await service.create('camera-1', { baseUrl: 'http://192.168.1.50' });
    await service.remove('camera-1');
    expect(() => service.get('camera-1')).toThrow(NotFoundException);
  });

  it('rejects updating or removing an unknown camera', async () => {
    await expect(
      service.update('missing', { displayName: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('persists registered cameras across a restart', async () => {
    await service.create('camera-1', {
      baseUrl: 'http://192.168.1.50',
      displayName: 'Workshop',
    });

    const restarted = new CameraRegistryService(
      loadServiceConfig({
        VIDEO_SERVICE_HUB_STORAGE_PATH: storageRoot,
        VIDEO_SERVICE_HUB_MQTT_PORT: '0',
      }),
    );
    await restarted.initialize();

    expect(restarted.list()).toEqual([
      expect.objectContaining({
        cameraId: 'camera-1',
        displayName: 'Workshop',
      }),
    ]);
  });
});
