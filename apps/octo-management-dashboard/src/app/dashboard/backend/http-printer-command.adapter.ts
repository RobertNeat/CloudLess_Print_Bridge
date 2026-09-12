import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Coordinates, PrintJobStatus } from '../dashboard.models';
import { clampCoordinates, validateAxisRanges } from '../printer-navigation/coordinate-utils';
import type { AxisRanges, HotendActionEvent } from '../printer-navigation/printer-navigation.models';
import { MockPrinterCommandAdapter, type PrinterCommand, type PrinterCommandPort } from '../printer-command.port';
import type { TemperatureChange } from '../printer-temperatures/printer-temperatures';
import { DeviceProfileService } from './device-profile.service';
import { CommandExecutionError, mapHttpError } from './http-error-mapping';
import { MqttPuppeteerConfig } from './mqtt-puppeteer.config';

type SetControlCommand = Extract<PrinterCommand, { type: 'set-control' }>;
const HOTEND_MOVE_LIMIT_MM = 50;

/**
 * Real PrinterCommandPort implementation. Each PrinterCommand case is wired
 * to mqtt-puppeteer in its own migration phase — cases not yet migrated
 * delegate to MockPrinterCommandAdapter's no-op so "one component at a
 * time" holds even though PrinterCommandPort has a single dispatch method.
 * Do not treat an unimplemented case reaching the mock as a bug: it is
 * intentional until that widget's phase lands.
 */
@Injectable({ providedIn: 'root' })
export class HttpPrinterCommandAdapter implements PrinterCommandPort {
  private readonly http = inject(HttpClient);
  private readonly config = inject(MqttPuppeteerConfig);
  private readonly mock = inject(MockPrinterCommandAdapter);
  private readonly deviceProfile = inject(DeviceProfileService);

  /**
   * The backend only has a fan *percent* concept — there is no on/off
   * command. `fansEnabled` is a frontend-only synthesis: enabling resends
   * the last nonzero speed the user set, disabling sends 0%. This cache is
   * the only place that synthesis lives.
   */
  private lastKnownFanSpeed = 50;

  async execute(command: PrinterCommand): Promise<void> {
    switch (command.type) {
      case 'set-control':
        await this.setControl(command);
        return;
      case 'set-print-status':
        await this.setPrintStatus(command.status);
        return;
      case 'set-temperature':
        await this.setTemperature(command.change);
        return;
      case 'set-coordinates':
        await this.setCoordinates(command.coordinates);
        return;
      case 'jog-hotend':
        await this.jogHotend(command.action);
        return;
      case 'home':
        await this.post('/movement/home', {});
        return;
      // Local/UI-only concern: axis-overlay calibration, not a machine
      // command. See dashboard-page.ts — axesReset routes here too, both
      // persisted purely client-side (no backend concept of this).
      case 'set-navigation':
      // Intentionally left as a no-op permanently: mqtt-puppeteer has no
      // camera capability at all (that belongs to the separate
      // video-service-hub, out of scope for this integration), so there is
      // no real endpoint to wire live-preview's on/off or resolution
      // controls to.
      case 'set-preview':
        await this.mock.execute(command);
        return;
      default:
        assertUnreachable(command);
    }
  }

  private async setPrintStatus(status: PrintJobStatus): Promise<void> {
    switch (status) {
      case 'paused':
        await this.post('/print_job/pause', {});
        return;
      case 'printing':
        await this.post('/print_job/resume', {});
        return;
      case 'cancelled':
        await this.post('/print_job/cancel', {});
        return;
      case 'completed':
      case 'error':
        // These are backend-observed terminal states, not user-triggerable
        // commands — current-print-job.html never emits a status that would
        // reach here with either value. Reject loudly instead of silently
        // no-op-ing if it somehow does, so a future UI change that tries to
        // set one of these is caught immediately rather than doing nothing.
        throw new CommandExecutionError({
          kind: 'validation',
          message: `"${status}" is a backend-observed state and cannot be set from the dashboard.`,
        });
      default:
        throw new CommandExecutionError({
          kind: 'validation',
          message: `Unknown print status: ${String(status)}`,
        });
    }
  }

  private async setTemperature({ sensor, value }: TemperatureChange): Promise<void> {
    switch (sensor) {
      case 'bed':
        await this.post('/printer-controls/temperature/bed', { celsius: value });
        return;
      case 'nozzle':
        await this.post('/printer-controls/temperature/nozzle', { celsius: value });
        return;
      case 'chamber':
        // No chamber-heater command exists on the A1 — printer-temperatures
        // is configured (settableSensors) to never let a user reach this in
        // the real UI, but reject explicitly rather than silently dropping
        // it or guessing an endpoint, in case stale UI state gets here.
        throw new CommandExecutionError({
          kind: 'validation',
          message: 'The chamber has no configurable target temperature on this printer.',
        });
      default:
        throw new CommandExecutionError({
          kind: 'validation',
          message: `Unknown temperature sensor: ${String(sensor)}`,
        });
    }
  }

  /**
   * Validates the target against the real machine envelope BEFORE issuing
   * any HTTP request — mirroring the server-side bounds check so an
   * out-of-range jog is rejected instantly, with zero network round trip,
   * instead of waiting on a 400 from the backend. The backend still
   * re-validates independently (double verification): this client-side
   * check is a UX improvement, never the only line of defense.
   */
  private async setCoordinates(coordinates: Coordinates): Promise<void> {
    const ranges = await this.fetchEnvelopeOrReject();
    let clamped: Coordinates;
    try {
      clamped = clampCoordinates(coordinates, ranges);
    } catch (error) {
      throw new CommandExecutionError({
        kind: 'validation',
        message: error instanceof Error ? error.message : 'Invalid coordinates.',
      });
    }
    if (clamped.X !== coordinates.X || clamped.Y !== coordinates.Y || clamped.Z !== coordinates.Z) {
      throw new CommandExecutionError({
        kind: 'validation',
        message: `Target position is outside the safe travel envelope (X:${ranges.X.min}-${ranges.X.max}, Y:${ranges.Y.min}-${ranges.Y.max}, Z:${ranges.Z.min}-${ranges.Z.max}).`,
      });
    }
    await this.post('/movement/absolute', {
      x: coordinates.X,
      y: coordinates.Y,
      z: coordinates.Z,
    });
  }

  private async jogHotend({ delta }: HotendActionEvent): Promise<void> {
    // delta already carries the correct sign (component's hotendDelta():
    // 'up' is negative, 'down' is positive) — forward it as-is rather than
    // re-deriving it from `direction`, which would risk drifting out of
    // sync with that convention.
    if (Math.abs(delta) > HOTEND_MOVE_LIMIT_MM) {
      throw new CommandExecutionError({
        kind: 'validation',
        message: `Hotend move of ${delta}mm exceeds the safe range of ±${HOTEND_MOVE_LIMIT_MM}mm.`,
      });
    }
    await this.post('/movement/extrude-relative', { millimeters: delta });
  }

  private async fetchEnvelopeOrReject(): Promise<AxisRanges> {
    try {
      const ranges = await this.deviceProfile.fetchMachineEnvelope();
      validateAxisRanges(ranges);
      return ranges;
    } catch {
      throw new CommandExecutionError({
        kind: 'unavailable',
        message: 'The machine travel envelope could not be verified — movement is disabled until it can be.',
      });
    }
  }

  private async setControl({ key, value }: SetControlCommand): Promise<void> {
    switch (key) {
      case 'lightEnabled':
        await this.post('/printer-controls/light', { enabled: value as boolean });
        return;
      case 'fanSpeed':
        this.lastKnownFanSpeed = value as number;
        await this.post('/printer-controls/fan', { percent: value as number });
        return;
      case 'fansEnabled':
        await this.post('/printer-controls/fan', {
          percent: (value as boolean) ? this.lastKnownFanSpeed : 0,
        });
        return;
      case 'printSpeed':
        await this.post('/printer-controls/print-speed', { mode: value as string });
        return;
      default:
        throw new CommandExecutionError({
          kind: 'validation',
          message: `Unknown control key: ${String(key)}`,
        });
    }
  }

  protected async post(path: string, body: unknown): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${this.config.baseUrl}${path}`, body));
    } catch (error) {
      throw new CommandExecutionError(mapHttpError(error));
    }
  }
}

function assertUnreachable(command: never): never {
  throw new Error(`Unhandled printer command: ${JSON.stringify(command)}`);
}
