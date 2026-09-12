import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DeviceProfileService } from './device-profile.service';

describe('DeviceProfileService', () => {
  let httpMock: HttpTestingController;
  let service: DeviceProfileService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(DeviceProfileService);
  });

  afterEach(() => httpMock.verify());

  it('maps the real machine envelope to AxisRanges', async () => {
    const promise = service.fetchMachineEnvelope();

    const request = httpMock.expectOne('http://localhost:10320/device_config/profile');
    request.flush({
      id: 'bambu-lab-a1',
      topology: { unitCount: 1, slotsPerUnit: 4, externalSpool: true },
      machineEnvelope: {
        x: { minimum: 0, maximum: 256 },
        y: { minimum: 0, maximum: 256 },
        z: { minimum: 20, maximum: 240 },
      },
    });

    await expect(promise).resolves.toEqual({
      X: { min: 0, max: 256 },
      Y: { min: 0, max: 256 },
      Z: { min: 20, max: 240 },
    });
  });

  it('rejects a distinctly asymmetric envelope exactly as returned, proving no hardcoded default leaks in', async () => {
    const promise = service.fetchMachineEnvelope();

    httpMock.expectOne('http://localhost:10320/device_config/profile').flush({
      id: 'other-model',
      topology: { unitCount: 2, slotsPerUnit: 8, externalSpool: false },
      machineEnvelope: {
        x: { minimum: 5, maximum: 300 },
        y: { minimum: 10, maximum: 310 },
        z: { minimum: 1, maximum: 400 },
      },
    });

    await expect(promise).resolves.toEqual({
      X: { min: 5, max: 300 },
      Y: { min: 10, max: 310 },
      Z: { min: 1, max: 400 },
    });
  });

  it('rejects on HTTP failure instead of returning any numeric fallback', async () => {
    const promise = service.fetchMachineEnvelope();

    httpMock
      .expectOne('http://localhost:10320/device_config/profile')
      .flush(
        { statusCode: 503, message: 'MQTT client is not connected' },
        { status: 503, statusText: 'Service Unavailable' },
      );

    await expect(promise).rejects.toBeTruthy();
  });

  it('rejects on a malformed machine envelope instead of substituting DEFAULT_AXIS_RANGES', async () => {
    const promise = service.fetchMachineEnvelope();

    httpMock.expectOne('http://localhost:10320/device_config/profile').flush({
      id: 'bambu-lab-a1',
      topology: { unitCount: 1, slotsPerUnit: 4, externalSpool: true },
      machineEnvelope: { x: { minimum: 0, maximum: 256 } },
    });

    await expect(promise).rejects.toThrow(/invalid machine envelope/);
  });

  describe('fetchProfile', () => {
    it('surfaces both the machine envelope and heater capabilities from one request', async () => {
      const promise = service.fetchProfile();

      httpMock.expectOne('http://localhost:10320/device_config/profile').flush({
        id: 'bambu-lab-a1',
        topology: { unitCount: 1, slotsPerUnit: 4, externalSpool: true },
        machineEnvelope: {
          x: { minimum: 0, maximum: 256 },
          y: { minimum: 0, maximum: 256 },
          z: { minimum: 20, maximum: 240 },
        },
        heaterCapabilities: { hasChamberHeater: true },
      });

      await expect(promise).resolves.toEqual({
        axisRanges: {
          X: { min: 0, max: 256 },
          Y: { min: 0, max: 256 },
          Z: { min: 20, max: 240 },
        },
        deviceCapabilities: { hasChamberHeater: true },
      });
    });

    it('fails closed to unsupported chamber heater when the capability flag is missing (e.g. the real A1 profile today)', async () => {
      const promise = service.fetchProfile();

      httpMock.expectOne('http://localhost:10320/device_config/profile').flush({
        id: 'bambu-lab-a1',
        topology: { unitCount: 1, slotsPerUnit: 4, externalSpool: true },
        machineEnvelope: {
          x: { minimum: 0, maximum: 256 },
          y: { minimum: 0, maximum: 256 },
          z: { minimum: 20, maximum: 240 },
        },
      });

      await expect(promise).resolves.toEqual(
        expect.objectContaining({ deviceCapabilities: { hasChamberHeater: false } }),
      );
    });

    it('rejects on an invalid machine envelope even when heaterCapabilities is present', async () => {
      const promise = service.fetchProfile();

      httpMock.expectOne('http://localhost:10320/device_config/profile').flush({
        id: 'bambu-lab-a1',
        topology: { unitCount: 1, slotsPerUnit: 4, externalSpool: true },
        machineEnvelope: { x: { minimum: 0, maximum: 256 } },
        heaterCapabilities: { hasChamberHeater: true },
      });

      await expect(promise).rejects.toThrow(/invalid machine envelope/);
    });
  });
});
