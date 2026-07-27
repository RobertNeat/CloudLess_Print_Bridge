import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
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

  it('exposes the printer profile and AMS topology', async () => {
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

  afterEach(async () => {
    await app.close();
  });
});
