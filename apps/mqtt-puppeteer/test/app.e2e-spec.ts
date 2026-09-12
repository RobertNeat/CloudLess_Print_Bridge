import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { firstValueFrom } from 'rxjs';
import { AppModule } from './../src/app.module';
import { BridgeEventsService } from './../src/events/bridge-events.service';

describe('mqtt-puppeteer (e2e)', () => {
  let app: INestApplication<App>;
  let events: BridgeEventsService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    events = moduleFixture.get(BridgeEventsService);
    app = moduleFixture.createNestApplication();
    app.enableCors({ origin: ['http://localhost:4200'], credentials: true });
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('mqtt-puppeteer')
        .setVersion('0.0.1')
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
    await app.init();
  });

  it('exposes an initially empty raw printer state', () => {
    return request(app.getHttpServer())
      .get('/device_config/state/merged')
      .expect(200)
      .expect({});
  });

  it('exposes the domain state separately from the merged protocol state', async () => {
    const response = await request(app.getHttpServer())
      .get('/device_config/state/domain')
      .expect(200);

    expect(response.body).not.toHaveProperty('raw');
    expect(response.body).not.toHaveProperty('domain');
  });

  it.each([
    ['get', '/printer/state'],
    ['get', '/printer/state/raw'],
    ['get', '/printer/state/domain'],
    ['get', '/json_model'],
    ['get', '/domain_model'],
    ['post', '/mqtt/commands/raw'],
    ['post', '/mqtt/command'],
    ['post', '/mqtt/request'],
    ['get', '/mqtt/config'],
    ['get', '/mqtt/status'],
    ['get', '/mqtt/reports/latest'],
    ['get', '/commands/profile'],
    ['post', '/commands/move-absolute/preview'],
    ['get', '/filaments'],
    ['get', '/filaments/catalog'],
    ['get', '/filaments/generic-pla'],
  ] as const)('removes the legacy %s %s endpoint', (method, path) => {
    return request(app.getHttpServer())[method](path).expect(404);
  });

  it('groups bridge configuration and status under service', async () => {
    const [configuration, status] = await Promise.all([
      request(app.getHttpServer()).get('/service/config').expect(200),
      request(app.getHttpServer()).get('/service/status').expect(200),
      request(app.getHttpServer()).get('/service/reports/latest').expect(200),
    ]);

    expect(configuration.body).not.toHaveProperty('password');
    expect(configuration.body).toHaveProperty(
      'passwordConfigured',
      expect.any(Boolean),
    );
    expect(status.body).toHaveProperty('connected', expect.any(Boolean));
    expect(status.body).toHaveProperty('configured', expect.any(Boolean));
  });

  it('lists the built-in A1 command profile', async () => {
    const response = await request(app.getHttpServer())
      .get('/commands')
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'fetch-status' }),
        expect.objectContaining({ id: 'pause-print' }),
        expect.objectContaining({ id: 'load-filament' }),
        expect.objectContaining({ id: 'set-filament' }),
        expect.objectContaining({ id: 'move-absolute' }),
      ]),
    );
  });

  it('exposes resolved filament definitions', async () => {
    const response = await request(app.getHttpServer())
      .get('/filament/definitions')
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'generic-pla',
          trayInfoIdx: 'GFL99',
          trayType: 'PLA',
        }),
      ]),
    );
  });

  it('filters resolved filament definitions by manufacturer', async () => {
    const response = await request(app.getHttpServer())
      .get('/filament/manufacturers/Generic/definitions')
      .expect(200);
    const definitions = response.body as Array<{
      id: string;
      filamentBrand: string;
    }>;

    expect(definitions).not.toHaveLength(0);
    expect(definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'generic-pla',
          filamentBrand: 'Generic',
        }),
      ]),
    );
    expect(
      definitions.every((definition) => definition.filamentBrand === 'Generic'),
    ).toBe(true);
  });

  it('exposes the printer profile, AMS topology and machine envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/device_config/profile')
      .expect(200);

    expect(response.body).toEqual({
      id: 'bambu-lab-a1',
      topology: {
        unitCount: 1,
        slotsPerUnit: 4,
        externalSpool: true,
      },
      machineEnvelope: {
        x: { minimum: 0, maximum: 256 },
        y: { minimum: 0, maximum: 256 },
        z: { minimum: 20, maximum: 240 },
      },
    });
  });

  it('simulates absolute movement with a correlated operation id', async () => {
    const response = await request(app.getHttpServer())
      .post('/movement/absolute/simulate')
      .send({ x: 125, y: 125, z: 20 })
      .expect(200);
    const body = response.body as {
      operationId: string;
      commandId: string;
      payload: {
        print: {
          sequence_id: string;
          command: string;
          param: string;
        };
      };
    };

    expect(typeof body.operationId).toBe('string');
    expect(body).toEqual({
      operationId: body.operationId,
      commandId: 'move-absolute',
      payload: {
        print: {
          sequence_id: body.operationId,
          command: 'gcode_line',
          param: 'G90\nG1 X125 Y125 Z20 F3000\n',
        },
      },
    });
  });

  it('returns the operation id in failed command responses through service errors', async () => {
    const publication = firstValueFrom(events.mqttPublications$);
    const operationResult = firstValueFrom(events.operationResults$);
    const serviceError = firstValueFrom(events.serviceErrors$);
    const response = await request(app.getHttpServer())
      .post('/commands/raw')
      .send({ print: { command: 'test' } })
      .expect(503);
    const body = response.body as {
      statusCode: number;
      message: string;
      operationId: string;
    };

    expect(typeof body.operationId).toBe('string');
    expect(body).toMatchObject({
      statusCode: 503,
      message: 'MQTT client is not connected',
    });
    await expect(publication).resolves.toMatchObject({
      operationId: body.operationId,
      status: 'failed',
    });
    await expect(operationResult).resolves.toMatchObject({
      operationId: body.operationId,
      status: 'rejected',
    });
    await expect(serviceError).resolves.toMatchObject({
      operationId: body.operationId,
      statusCode: 503,
    });
  });

  it('keeps raw publishing only under commands', async () => {
    await request(app.getHttpServer())
      .post('/commands/raw')
      .send({ print: { command: 'test' } })
      .expect(503);
  });

  it('rejects an out-of-bounds move through the generic command endpoint', async () => {
    const response = await request(app.getHttpServer())
      .post('/commands/move-absolute')
      .send({ z: 500 })
      .expect(400);

    expect((response.body as { message: string }).message).toContain(
      'z must be at most 240',
    );
  });

  it('rejects an out-of-bounds move sent through the raw passthrough escape hatch', async () => {
    // The catalog's parameter validation cannot see this payload at all —
    // this is the bypass the profile's inspectPayload() hook exists to close.
    const response = await request(app.getHttpServer())
      .post('/commands/raw')
      .send({ print: { command: 'gcode_line', param: 'G90\nG1 Z500 F3000\n' } })
      .expect(400);

    expect((response.body as { message: string }).message).toContain(
      'Axis Z target 500 is outside the safe range 20..240',
    );
  });

  it('rejects an out-of-bounds move through the dedicated movement endpoint', async () => {
    await request(app.getHttpServer())
      .post('/movement/absolute')
      .send({ x: -5 })
      .expect(400);
  });

  it('exposes a dead-reckoned, initially unknown position in the domain state', async () => {
    const response = await request(app.getHttpServer())
      .get('/device_config/state/domain')
      .expect(200);

    expect(response.body).toMatchObject({
      position: {
        x: null,
        y: null,
        z: null,
        homed: false,
        source: 'unknown',
        updatedAt: null,
      },
    });
  });

  it('routes quick-control endpoints to their catalog commands', async () => {
    const light = await request(app.getHttpServer())
      .post('/printer-controls/light')
      .send({ enabled: true })
      .expect(503); // no MQTT connection in tests, proves the command still reached publish
    expect((light.body as { message: string }).message).toBe(
      'MQTT client is not connected',
    );

    await request(app.getHttpServer())
      .post('/printer-controls/fan')
      .send({ percent: 50 })
      .expect(503);

    await request(app.getHttpServer())
      .post('/printer-controls/print-speed')
      .send({ mode: 'sport' })
      .expect(503);

    await request(app.getHttpServer())
      .post('/printer-controls/temperature/bed')
      .send({ celsius: 55 })
      .expect(503);

    await request(app.getHttpServer())
      .post('/printer-controls/temperature/nozzle')
      .send({ celsius: 220 })
      .expect(503);
  });

  it('rejects out-of-range quick-control parameters before ever publishing', async () => {
    await request(app.getHttpServer())
      .post('/printer-controls/fan')
      .send({ percent: 150 })
      .expect(400);

    await request(app.getHttpServer())
      .post('/printer-controls/temperature/nozzle')
      .send({ celsius: 1000 })
      .expect(400);
  });

  it('seeds the telemetry history buffer from startup state and accepts a clear request', async () => {
    // PrinterStateService publishes its initial (empty) domain snapshot on
    // module init, so the buffer already holds one all-null sample by the
    // time the app is ready — this asserts the buffer is wired end-to-end,
    // not that it starts literally empty.
    const history = await request(app.getHttpServer())
      .get('/telemetry/history')
      .expect(200);
    const body = history.body as {
      capacity: number;
      samples: Array<{ progressPercent: number | null }>;
    };

    expect(typeof body.capacity).toBe('number');
    expect(body.samples.length).toBeGreaterThan(0);
    expect(body.samples[0]).toMatchObject({ progressPercent: null });

    await request(app.getHttpServer()).delete('/telemetry/history').expect(204);

    const cleared = await request(app.getHttpServer())
      .get('/telemetry/history')
      .expect(200);
    expect((cleared.body as { samples: unknown[] }).samples).toEqual([]);
  });

  it('reflects the configured dashboard origin in CORS headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/service/status')
      .set('Origin', 'http://localhost:4200')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:4200',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('serves the generated Swagger document', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const document = response.body as {
      info: { title: string };
      paths: Record<string, unknown>;
    };

    expect(document).toMatchObject({ info: { title: 'mqtt-puppeteer' } });
    expect(document.paths).toHaveProperty('/commands');
    expect(document.paths).toHaveProperty('/movement/absolute');
    expect(document.paths).toHaveProperty('/telemetry/history');
  });

  afterEach(async () => {
    await app.close();
  });
});
