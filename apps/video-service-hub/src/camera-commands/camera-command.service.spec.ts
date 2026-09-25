import { Test } from '@nestjs/testing';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { CameraRegistryService } from '../camera-registry/camera-registry.service';
import { SERVICE_CONFIG } from '../config/config.module';
import { loadServiceConfig } from '../config/service-config';
import { JobRegistryService } from '../jobs/job-registry.service';
import { MediaStorageService } from '../storage/media-storage.service';
import { CameraCommandService } from './camera-command.service';

describe('CameraCommandService', () => {
  let service: CameraCommandService;
  let jobs: JobRegistryService;
  let storage: {
    setLivePersistIntent: jest.Mock;
    clearLivePersistIntent: jest.Mock;
  };

  beforeEach(async () => {
    storage = {
      setLivePersistIntent: jest.fn(),
      clearLivePersistIntent: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        CameraCommandService,
        JobRegistryService,
        { provide: SERVICE_CONFIG, useValue: loadServiceConfig({}) },
        { provide: MediaStorageService, useValue: storage },
        {
          provide: CameraRegistryService,
          useValue: { tryGet: () => undefined },
        },
      ],
    }).compile();
    service = module.get(CameraCommandService);
    jobs = module.get(JobRegistryService);
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it('records a stream-only intent and strips persist from the outbound start-live body', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await service.execute('cam-1', 'start-live', {
      cameraBaseUrl: 'http://192.168.1.231',
      requestId: 'live-001',
      resolution: 'VGA',
      persist: false,
    });

    expect(storage.setLivePersistIntent).toHaveBeenCalledWith(
      'cam-1',
      'live-001',
      false,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.231/api/v1/video-service/live/start',
      expect.objectContaining({
        body: JSON.stringify({ requestId: 'live-001', resolution: 'VGA' }),
      }),
    );
  });

  it('defaults the persist intent to true when the field is omitted, preserving existing behavior', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await service.execute('cam-1', 'start-live', {
      cameraBaseUrl: 'http://192.168.1.231',
      requestId: 'live-002',
      resolution: 'VGA',
    });

    expect(storage.setLivePersistIntent).toHaveBeenCalledWith(
      'cam-1',
      'live-002',
      true,
    );
  });

  it('clears the persist intent on stop-live', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await service.execute('cam-1', 'stop-live', {
      cameraBaseUrl: 'http://192.168.1.231',
      requestId: 'live-001',
    });

    expect(storage.clearLivePersistIntent).toHaveBeenCalledWith(
      'cam-1',
      'live-001',
    );
  });

  it('queues a second tracked command for a busy camera without contacting the camera', async () => {
    let resolveFirst: (value: Response) => void = () => undefined;
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const firstCall = service.execute('cam-1', 'record-audio', {
      cameraBaseUrl: 'http://192.168.1.231',
      requestId: 'audio-first',
      durationSeconds: 5,
    });

    const secondResult = await service.execute('cam-1', 'record-audio', {
      cameraBaseUrl: 'http://192.168.1.231',
      requestId: 'audio-second',
      durationSeconds: 5,
    });

    expect(secondResult.status).toBe(202);
    expect(secondResult.body).toMatchObject({
      status: 'queued',
      requestId: 'audio-second',
      position: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFirst(new Response('{}', { status: 200 }));
    await firstCall;
  });

  it('promotes the next queued job once the running job for that camera is marked done', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('{}', { status: 200 })),
      );

    await service.execute('cam-1', 'timed-recording', {
      cameraBaseUrl: 'http://192.168.1.231',
      requestId: 'rec-first',
      resolution: 'VGA',
      durationMs: 5_000,
    });
    await service.execute('cam-1', 'timed-recording', {
      cameraBaseUrl: 'http://192.168.1.231',
      requestId: 'rec-second',
      resolution: 'VGA',
      durationMs: 5_000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      jobs.list({ cameraId: 'cam-1' }).find((j) => j.requestId === 'rec-second')
        ?.status,
    ).toBe('queued');

    // timed-recording only completes via ingest finalize, not the initial
    // response -- simulate that completion signal directly.
    jobs.markDone('rec-first');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      jobs.list({ cameraId: 'cam-1' }).find((j) => j.requestId === 'rec-second')
        ?.status,
    ).toBe('running');
  });

  it('dispatches a stop command immediately even while a recording job is running for that camera', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('{}', { status: 200 })),
      );

    await service.execute('cam-1', 'start-recording', {
      cameraBaseUrl: 'http://192.168.1.231',
      requestId: 'rec-running',
      resolution: 'VGA',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await service.execute('cam-1', 'stop-recording', {
      cameraBaseUrl: 'http://192.168.1.231',
      requestId: 'rec-running',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://192.168.1.231/api/v1/video-service/recordings/stop',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects a duplicate active requestId with a conflict before contacting the camera', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await service.execute('cam-1', 'start-recording', {
      cameraBaseUrl: 'http://192.168.1.231',
      requestId: 'dup-1',
      resolution: 'VGA',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(
      service.execute('cam-1', 'start-recording', {
        cameraBaseUrl: 'http://192.168.1.231',
        requestId: 'dup-1',
        resolution: 'VGA',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('marks a tracked job failed when the camera responds with a non-2xx status', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{"error":"busy"}', { status: 500 }));

    await service.execute('cam-1', 'record-audio', {
      cameraBaseUrl: 'http://192.168.1.231',
      requestId: 'audio-fail',
      durationSeconds: 5,
    });

    const job = jobs
      .list({ cameraId: 'cam-1' })
      .find((j) => j.requestId === 'audio-fail');
    expect(job?.status).toBe('failed');
  });

  it('marks a tracked job failed and propagates BadGatewayException when the fetch itself rejects', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      service.execute('cam-1', 'record-audio', {
        cameraBaseUrl: 'http://192.168.1.231',
        requestId: 'audio-reject',
        durationSeconds: 5,
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);

    const job = jobs
      .list({ cameraId: 'cam-1' })
      .find((j) => j.requestId === 'audio-reject');
    expect(job?.status).toBe('failed');
  });
});
