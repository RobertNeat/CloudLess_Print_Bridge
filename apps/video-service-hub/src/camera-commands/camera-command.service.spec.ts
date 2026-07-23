import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SERVICE_CONFIG } from '../config/config.module';
import { loadServiceConfig } from '../config/service-config';
import { CameraCommandService } from './camera-command.service';

describe('CameraCommandService', () => {
  let service: CameraCommandService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CameraCommandService,
        { provide: SERVICE_CONFIG, useValue: loadServiceConfig({}) },
      ],
    }).compile();
    service = module.get(CameraCommandService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('forwards a validated audio command without cameraBaseUrl', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ status: 'accepted', requestId: 'audio-001' }),
          { status: 202, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    await expect(
      service.execute('a1b2c3', 'record-audio', {
        cameraBaseUrl: 'http://192.168.1.231',
        requestId: 'audio-001',
        durationSeconds: 8,
      }),
    ).resolves.toMatchObject({
      status: 202,
      body: { status: 'accepted', requestId: 'audio-001' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.231/api/v1/video-service/audio',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ requestId: 'audio-001', durationSeconds: 8 }),
      }),
    );
  });

  it('rejects invalid firmware parameters before making a request', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(
      service.execute('camera-1', 'periodic-capture', {
        cameraBaseUrl: 'http://192.168.1.231',
        requestId: 'periodic-1',
        resolution: 'VGA',
        intervalMs: 100,
        durationMs: 10_000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
