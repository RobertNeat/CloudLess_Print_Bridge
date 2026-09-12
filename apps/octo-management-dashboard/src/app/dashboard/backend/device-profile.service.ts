import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AxisRanges } from '../printer-navigation/printer-navigation.models';
import { MqttPuppeteerConfig } from './mqtt-puppeteer.config';
import type { DeviceCapabilities } from '../dashboard.models';
import type { DeviceProfileResponseDto } from './mqtt-puppeteer-api.types';

/**
 * Fetches the active printer profile's real machine envelope. There is no
 * safe default to fall back to here: DEFAULT_AXIS_RANGES (0..255 on every
 * axis) is wrong for the real A1 (X/Y 0..256, Z 20..240) and would either
 * let the UI offer an unsafe Z target or falsely cap X/Y below their real
 * maximum. Callers must treat a rejected promise as "envelope unknown" and
 * fail closed (disable jogging) rather than substituting any guessed range.
 */
@Injectable({ providedIn: 'root' })
export class DeviceProfileService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(MqttPuppeteerConfig);

  async fetchMachineEnvelope(): Promise<AxisRanges> {
    const response = await firstValueFrom(
      this.http.get<DeviceProfileResponseDto>(`${this.config.baseUrl}/device_config/profile`),
    );
    const envelope = response.machineEnvelope;
    if (!isValidEnvelope(envelope)) {
      throw new Error('device_config/profile returned an invalid machine envelope.');
    }
    return {
      X: { min: envelope.x.minimum, max: envelope.x.maximum },
      Y: { min: envelope.y.minimum, max: envelope.y.maximum },
      Z: { min: envelope.z.minimum, max: envelope.z.maximum },
    };
  }

  /**
   * Fetches both the machine envelope and heater capabilities from the same
   * GET /device_config/profile response in one request (rather than a
   * second fetchHeaterCapabilities() hitting the same endpoint again).
   * Unlike the envelope, an unknown/malformed heaterCapabilities never fails
   * the whole call — it fails closed to "unsupported", since a missing
   * capability flag should only ever disable an editor (chamber becomes
   * non-settable), never block axis-range-dependent features like jogging.
   */
  async fetchProfile(): Promise<{ axisRanges: AxisRanges; deviceCapabilities: DeviceCapabilities }> {
    const response = await firstValueFrom(
      this.http.get<DeviceProfileResponseDto>(`${this.config.baseUrl}/device_config/profile`),
    );
    const envelope = response.machineEnvelope;
    if (!isValidEnvelope(envelope)) {
      throw new Error('device_config/profile returned an invalid machine envelope.');
    }
    return {
      axisRanges: {
        X: { min: envelope.x.minimum, max: envelope.x.maximum },
        Y: { min: envelope.y.minimum, max: envelope.y.maximum },
        Z: { min: envelope.z.minimum, max: envelope.z.maximum },
      },
      deviceCapabilities: isValidDeviceCapabilities(response.heaterCapabilities)
        ? response.heaterCapabilities
        : UNSUPPORTED_DEVICE_CAPABILITIES,
    };
  }
}

const UNSUPPORTED_DEVICE_CAPABILITIES: DeviceCapabilities = { hasChamberHeater: false };

function isValidDeviceCapabilities(value: unknown): value is DeviceCapabilities {
  return !!value && typeof value === 'object' && typeof (value as DeviceCapabilities).hasChamberHeater === 'boolean';
}

function isValidEnvelope(envelope: unknown): envelope is DeviceProfileResponseDto['machineEnvelope'] {
  if (!envelope || typeof envelope !== 'object') return false;
  const candidate = envelope as Partial<DeviceProfileResponseDto['machineEnvelope']>;
  return (['x', 'y', 'z'] as const).every((axis) => {
    const range = candidate[axis];
    return (
      !!range &&
      typeof range.minimum === 'number' &&
      typeof range.maximum === 'number' &&
      Number.isFinite(range.minimum) &&
      Number.isFinite(range.maximum) &&
      range.minimum <= range.maximum
    );
  });
}
