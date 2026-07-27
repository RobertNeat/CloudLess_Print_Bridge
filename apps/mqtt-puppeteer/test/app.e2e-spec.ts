import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('mqtt-puppeteer (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('exposes an initially empty raw printer state', () => {
    return request(app.getHttpServer())
      .get('/printer/state/raw')
      .expect(200)
      .expect({});
  });

  it('keeps the PoC raw-state endpoint as a compatibility alias', () => {
    return request(app.getHttpServer())
      .get('/json_model')
      .expect(200)
      .expect({});
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
      .get('/filaments')
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

  it('previews a parameterized command without an MQTT connection', () => {
    return request(app.getHttpServer())
      .post('/commands/set-bed-temperature/preview')
      .send({ celsius: 50 })
      .expect(201)
      .expect({
        commandId: 'set-bed-temperature',
        payload: {
          print: {
            sequence_id: '0',
            command: 'gcode_line',
            param: 'M140 S50\n',
          },
        },
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
