import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PrinterCommand } from '../printer-command.port';
import { CommandExecutionError } from './http-error-mapping';
import { HttpPrinterCommandAdapter } from './http-printer-command.adapter';

/**
 * setCoordinates awaits the machine-envelope fetch before issuing the
 * movement request, adding more microtask hops than a single synchronous
 * `flush()` drains before the next assertion runs. A macrotask tick
 * reliably lets every pending microtask (including HttpClient's internal
 * interceptor chain) settle before we look for the follow-up request.
 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('HttpPrinterCommandAdapter', () => {
  let httpMock: HttpTestingController;
  let adapter: HttpPrinterCommandAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    adapter = TestBed.inject(HttpPrinterCommandAdapter);
  });

  afterEach(() => httpMock.verify());

  describe('set-control', () => {
    it('turns the light on', async () => {
      const promise = adapter.execute({ type: 'set-control', key: 'lightEnabled', value: true });

      const request = httpMock.expectOne('http://localhost:10320/printer-controls/light');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ enabled: true });
      request.flush({});

      await expect(promise).resolves.toBeUndefined();
    });

    it('sets fan speed by percent', async () => {
      const promise = adapter.execute({ type: 'set-control', key: 'fanSpeed', value: 70 });

      const request = httpMock.expectOne('http://localhost:10320/printer-controls/fan');
      expect(request.request.body).toEqual({ percent: 70 });
      request.flush({});

      await promise;
    });

    it('maps fansEnabled=true to resending the last known nonzero fan speed', async () => {
      const seedPromise = adapter.execute({ type: 'set-control', key: 'fanSpeed', value: 45 });
      httpMock.expectOne('http://localhost:10320/printer-controls/fan').flush({});
      await seedPromise;

      const promise = adapter.execute({ type: 'set-control', key: 'fansEnabled', value: true });
      const request = httpMock.expectOne('http://localhost:10320/printer-controls/fan');
      expect(request.request.body).toEqual({ percent: 45 });
      request.flush({});

      await promise;
    });

    it('maps fansEnabled=false to percent 0', async () => {
      const promise = adapter.execute({ type: 'set-control', key: 'fansEnabled', value: false });

      const request = httpMock.expectOne('http://localhost:10320/printer-controls/fan');
      expect(request.request.body).toEqual({ percent: 0 });
      request.flush({});

      await promise;
    });

    it('sets print speed mode', async () => {
      const promise = adapter.execute({ type: 'set-control', key: 'printSpeed', value: 'sport' });

      const request = httpMock.expectOne('http://localhost:10320/printer-controls/print-speed');
      expect(request.request.body).toEqual({ mode: 'sport' });
      request.flush({});

      await promise;
    });

    it('maps a 400 response to a validation CommandExecutionError', async () => {
      const promise = adapter.execute({ type: 'set-control', key: 'fanSpeed', value: 150 });

      httpMock
        .expectOne('http://localhost:10320/printer-controls/fan')
        .flush(
          { statusCode: 400, message: 'percent must be at most 100' },
          { status: 400, statusText: 'Bad Request' },
        );

      await expect(promise).rejects.toMatchObject({
        error: { kind: 'validation', message: 'percent must be at most 100' },
      });
    });

    it('maps a 503 response to an unavailable CommandExecutionError', async () => {
      const promise = adapter.execute({ type: 'set-control', key: 'lightEnabled', value: true });

      httpMock
        .expectOne('http://localhost:10320/printer-controls/light')
        .flush(
          { statusCode: 503, message: 'MQTT client is not connected' },
          { status: 503, statusText: 'Service Unavailable' },
        );

      await expect(promise).rejects.toMatchObject({
        error: { kind: 'unavailable', message: 'MQTT client is not connected' },
      });
    });

    it('maps a network failure to a network CommandExecutionError', async () => {
      const promise = adapter.execute({ type: 'set-control', key: 'lightEnabled', value: true });

      httpMock
        .expectOne('http://localhost:10320/printer-controls/light')
        .error(new ProgressEvent('error'), { status: 0 });

      const rejection = await promise.catch((error: unknown) => error);
      expect(rejection).toBeInstanceOf(CommandExecutionError);
      expect((rejection as CommandExecutionError).error.kind).toBe('network');
    });
  });

  describe('set-print-status', () => {
    it.each([
      ['paused', '/print_job/pause'],
      ['printing', '/print_job/resume'],
      ['cancelled', '/print_job/cancel'],
    ] as const)('maps status %s to POST %s', async (status, path) => {
      const promise = adapter.execute({ type: 'set-print-status', status });

      const request = httpMock.expectOne(`http://localhost:10320${path}`);
      expect(request.request.method).toBe('POST');
      request.flush({});

      await promise;
    });

    it.each(['completed', 'error'] as const)(
      'rejects the backend-observed status %s locally without any HTTP call',
      async (status) => {
        await expect(adapter.execute({ type: 'set-print-status', status })).rejects.toMatchObject({
          error: { kind: 'validation' },
        });
        httpMock.expectNone(() => true);
      },
    );
  });

  describe('set-temperature', () => {
    it('sets the bed target temperature', async () => {
      const promise = adapter.execute({
        type: 'set-temperature',
        change: { sensor: 'bed', value: 60 },
      });

      const request = httpMock.expectOne('http://localhost:10320/printer-controls/temperature/bed');
      expect(request.request.body).toEqual({ celsius: 60 });
      request.flush({});

      await promise;
    });

    it('sets the nozzle target temperature', async () => {
      const promise = adapter.execute({
        type: 'set-temperature',
        change: { sensor: 'nozzle', value: 220 },
      });

      const request = httpMock.expectOne(
        'http://localhost:10320/printer-controls/temperature/nozzle',
      );
      expect(request.request.body).toEqual({ celsius: 220 });
      request.flush({});

      await promise;
    });

    it('rejects a chamber temperature change locally without any HTTP call', async () => {
      await expect(
        adapter.execute({ type: 'set-temperature', change: { sensor: 'chamber', value: 35 } }),
      ).rejects.toMatchObject({ error: { kind: 'validation' } });
      httpMock.expectNone(() => true);
    });
  });

  describe('set-coordinates', () => {
    const validEnvelope = {
      id: 'bambu-lab-a1',
      topology: { unitCount: 1, slotsPerUnit: 4, externalSpool: true },
      machineEnvelope: {
        x: { minimum: 0, maximum: 256 },
        y: { minimum: 0, maximum: 256 },
        z: { minimum: 20, maximum: 240 },
      },
    };

    it('moves to an in-bounds absolute target', async () => {
      const promise = adapter.execute({
        type: 'set-coordinates',
        coordinates: { X: 125, Y: 125, Z: 20 },
      });

      httpMock.expectOne('http://localhost:10320/device_config/profile').flush(validEnvelope);
      await flushMicrotasks();
      const request = httpMock.expectOne('http://localhost:10320/movement/absolute');
      expect(request.request.body).toEqual({ x: 125, y: 125, z: 20 });
      request.flush({});

      await promise;
    });

    it('rejects a Z target below the real minimum with zero movement HTTP call (mirrors the server-side bound)', async () => {
      const promise = adapter.execute({
        type: 'set-coordinates',
        coordinates: { X: 100, Y: 100, Z: 0 },
      });

      httpMock.expectOne('http://localhost:10320/device_config/profile').flush(validEnvelope);

      await expect(promise).rejects.toMatchObject({ error: { kind: 'validation' } });
      httpMock.expectNone((req) => req.url.includes('/movement/'));
    });

    it('rejects a Z target above the real maximum with zero movement HTTP call', async () => {
      const promise = adapter.execute({
        type: 'set-coordinates',
        coordinates: { X: 100, Y: 100, Z: 500 },
      });

      httpMock.expectOne('http://localhost:10320/device_config/profile').flush(validEnvelope);

      await expect(promise).rejects.toMatchObject({ error: { kind: 'validation' } });
      httpMock.expectNone((req) => req.url.includes('/movement/'));
    });

    it('rejects the move entirely (fail closed) when the machine envelope cannot be verified', async () => {
      const promise = adapter.execute({
        type: 'set-coordinates',
        coordinates: { X: 100, Y: 100, Z: 100 },
      });

      httpMock
        .expectOne('http://localhost:10320/device_config/profile')
        .flush({ statusCode: 503, message: 'x' }, { status: 503, statusText: 'x' });

      await expect(promise).rejects.toMatchObject({ error: { kind: 'unavailable' } });
      httpMock.expectNone((req) => req.url.includes('/movement/'));
    });

    it('maps a server-side rejection of an in-envelope-looking move to a validation error with the message preserved', async () => {
      const promise = adapter.execute({
        type: 'set-coordinates',
        coordinates: { X: 125, Y: 125, Z: 20 },
      });

      httpMock.expectOne('http://localhost:10320/device_config/profile').flush(validEnvelope);
      await flushMicrotasks();
      httpMock
        .expectOne('http://localhost:10320/movement/absolute')
        .flush(
          { statusCode: 400, message: 'z must be at most 240' },
          { status: 400, statusText: 'Bad Request' },
        );

      await expect(promise).rejects.toMatchObject({
        error: { kind: 'validation', message: 'z must be at most 240' },
      });
    });

    it('maps a 503 from the movement endpoint to unavailable', async () => {
      const promise = adapter.execute({
        type: 'set-coordinates',
        coordinates: { X: 125, Y: 125, Z: 20 },
      });

      httpMock.expectOne('http://localhost:10320/device_config/profile').flush(validEnvelope);
      await flushMicrotasks();
      httpMock
        .expectOne('http://localhost:10320/movement/absolute')
        .flush(
          { statusCode: 503, message: 'MQTT client is not connected' },
          { status: 503, statusText: 'Service Unavailable' },
        );

      await expect(promise).rejects.toMatchObject({
        error: { kind: 'unavailable', message: 'MQTT client is not connected' },
      });
    });

    it('maps a network failure from the movement endpoint to network', async () => {
      const promise = adapter.execute({
        type: 'set-coordinates',
        coordinates: { X: 125, Y: 125, Z: 20 },
      });

      httpMock.expectOne('http://localhost:10320/device_config/profile').flush(validEnvelope);
      await flushMicrotasks();
      httpMock
        .expectOne('http://localhost:10320/movement/absolute')
        .error(new ProgressEvent('error'), { status: 0 });

      const rejection = await promise.catch((error: unknown) => error);
      expect(rejection).toBeInstanceOf(CommandExecutionError);
      expect((rejection as CommandExecutionError).error.kind).toBe('network');
    });
  });

  describe('jog-hotend', () => {
    it('extrudes with the delta already carried by the event, unchanged', async () => {
      const promise = adapter.execute({
        type: 'jog-hotend',
        action: { direction: 'down', step: 10, delta: 10 },
      });

      const request = httpMock.expectOne('http://localhost:10320/movement/extrude-relative');
      expect(request.request.body).toEqual({ millimeters: 10 });
      request.flush({});

      await promise;
    });

    it('retracts with a negative delta for the up direction', async () => {
      const promise = adapter.execute({
        type: 'jog-hotend',
        action: { direction: 'up', step: 10, delta: -10 },
      });

      const request = httpMock.expectOne('http://localhost:10320/movement/extrude-relative');
      expect(request.request.body).toEqual({ millimeters: -10 });
      request.flush({});

      await promise;
    });

    it('rejects a delta beyond the safe ±50mm range locally without any HTTP call', async () => {
      await expect(
        adapter.execute({
          type: 'jog-hotend',
          action: { direction: 'down', step: 100, delta: 100 },
        }),
      ).rejects.toMatchObject({ error: { kind: 'validation' } });
      httpMock.expectNone(() => true);
    });
  });

  describe('home', () => {
    it('posts an empty body to /movement/home', async () => {
      const promise = adapter.execute({ type: 'home' });

      const request = httpMock.expectOne('http://localhost:10320/movement/home');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({});
      request.flush({});

      await expect(promise).resolves.toBeUndefined();
    });

    it('maps a 400 response to a validation CommandExecutionError', async () => {
      const promise = adapter.execute({ type: 'home' });

      httpMock
        .expectOne('http://localhost:10320/movement/home')
        .flush(
          { statusCode: 400, message: 'home already in progress' },
          { status: 400, statusText: 'Bad Request' },
        );

      await expect(promise).rejects.toMatchObject({
        error: { kind: 'validation', message: 'home already in progress' },
      });
    });

    it('maps a 503 response to an unavailable CommandExecutionError', async () => {
      const promise = adapter.execute({ type: 'home' });

      httpMock
        .expectOne('http://localhost:10320/movement/home')
        .flush(
          { statusCode: 503, message: 'MQTT client is not connected' },
          { status: 503, statusText: 'Service Unavailable' },
        );

      await expect(promise).rejects.toMatchObject({
        error: { kind: 'unavailable', message: 'MQTT client is not connected' },
      });
    });

    it('maps a network failure to a network CommandExecutionError', async () => {
      const promise = adapter.execute({ type: 'home' });

      httpMock
        .expectOne('http://localhost:10320/movement/home')
        .error(new ProgressEvent('error'), { status: 0 });

      const rejection = await promise.catch((error: unknown) => error);
      expect(rejection).toBeInstanceOf(CommandExecutionError);
      expect((rejection as CommandExecutionError).error.kind).toBe('network');
    });
  });

  describe('unmigrated command types', () => {
    it('still succeeds as a no-op for set-preview (intentionally left mocked)', async () => {
      const command: PrinterCommand = { type: 'set-preview', change: { active: true } };

      await expect(adapter.execute(command)).resolves.toBeUndefined();
      httpMock.expectNone(() => true);
    });
  });
});
