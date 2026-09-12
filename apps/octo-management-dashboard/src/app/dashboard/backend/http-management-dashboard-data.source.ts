import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { I18nService } from '../../core/i18n.service';
import { isManagementDashboardData } from '../dashboard-data.service';
import type {
  DeviceCapabilities,
  ManagementDashboardData,
  PrintJobStatus,
  PrinterPositionSource,
} from '../dashboard.models';
import type { ManagementDashboardDataSource } from '../dashboard-data.service';
import type { AxisRanges } from '../printer-navigation/printer-navigation.models';
import {
  STATIC_CHART_METADATA,
  STATIC_LIVE_PREVIEW_DEFAULTS,
  STATIC_NAVIGATION_DEFAULTS,
  STATIC_PRINT_JOB_PLACEHOLDERS,
  STATIC_WIDGET_LAYOUT,
} from './dashboard-static-defaults';
import { DeviceProfileService } from './device-profile.service';
import { MqttPuppeteerConfig } from './mqtt-puppeteer.config';
import type {
  PrinterDomainModelDto,
  PrinterJobStatusDto,
  PrinterPositionSource as BackendPositionSource,
  TelemetryHistoryResponseDto,
} from './mqtt-puppeteer-api.types';
import { mapFanChart, mapProgressChart, mapTemperatureChart } from './telemetry-mapping';
import { TelemetryHistoryService } from './telemetry-history.service';

/**
 * Envelope used only when GET /device_config/profile could not be reached.
 * Every bound is pinned to 0 so clampCoordinates/adjustCoordinates always
 * report "no movement possible" — this is a fail-closed placeholder, never
 * a guess at the real envelope (DEFAULT_AXIS_RANGES would be a guess, and a
 * dangerous one: it accepts Z:0, which is unsafe on the real A1).
 */
const UNAVAILABLE_AXIS_RANGES: AxisRanges = {
  X: { min: 0, max: 0 },
  Y: { min: 0, max: 0 },
  Z: { min: 0, max: 0 },
};

/**
 * Empty domain snapshot used only when GET /device_config/state/domain could
 * not be reached (backend down, or its MQTT client hasn't connected yet —
 * onModuleInit() connects asynchronously and doesn't block startup). Every
 * field is optional on PrinterDomainModelDto and every read site below
 * already falls back safely (?? false / ?? 0 / ?? null), so this composes
 * into an honest "nothing known yet" dashboard instead of failing the whole
 * load over one transient endpoint — the same reasoning as the profile
 * fallback below, just for a different leg of the same Promise.all.
 */
const EMPTY_DOMAIN_STATE: PrinterDomainModelDto = {};

/** Same reasoning as EMPTY_DOMAIN_STATE, for GET /telemetry/history. */
const EMPTY_TELEMETRY_HISTORY: TelemetryHistoryResponseDto = { capacity: 0, samples: [] };

/**
 * Capabilities used only when GET /device_config/profile could not be
 * reached. Unlike UNAVAILABLE_AXIS_RANGES (which fails closed to "block
 * movement"), an unreachable profile here just means "assume no chamber
 * heater" — the same fail-closed default DeviceProfileService.fetchProfile()
 * already applies to a present-but-malformed flag.
 */
const UNAVAILABLE_DEVICE_CAPABILITIES: DeviceCapabilities = { hasChamberHeater: false };

/**
 * Composes ManagementDashboardData from real mqtt-puppeteer state plus the
 * static UI-only defaults (layout, calibration, chart metadata, camera
 * name) that the backend has no concept of. This is not a passthrough: the
 * backend domain model and the frontend widget shape genuinely differ, and
 * every gap is resolved explicitly here rather than left to guesswork
 * downstream.
 */
@Injectable({ providedIn: 'root' })
export class HttpManagementDashboardDataSource implements ManagementDashboardDataSource {
  private readonly http = inject(HttpClient);
  private readonly config = inject(MqttPuppeteerConfig);
  private readonly i18n = inject(I18nService);
  private readonly telemetry = inject(TelemetryHistoryService);
  private readonly deviceProfile = inject(DeviceProfileService);

  async load(): Promise<ManagementDashboardData> {
    // Each of these three requests fails independently: one being down (or
    // mqtt-puppeteer's MQTT client still connecting — see EMPTY_DOMAIN_STATE)
    // must never blank the whole dashboard behind a generic load error. Only
    // the profile fallback is safety-sensitive (fails closed to a zero-width
    // axis range); domain/telemetry fall back to honest "nothing known yet"
    // empty shapes that every downstream read already tolerates.
    const [domain, history, profile] = await Promise.all([
      firstValueFrom(
        this.http.get<PrinterDomainModelDto>(`${this.config.baseUrl}/device_config/state/domain`),
      ).catch((error: unknown) => {
        console.error('[dashboard] failed to load device_config/state/domain:', error);
        return EMPTY_DOMAIN_STATE;
      }),
      this.telemetry.fetchHistory().catch((error: unknown) => {
        console.error('[dashboard] failed to load telemetry/history:', error);
        return EMPTY_TELEMETRY_HISTORY;
      }),
      // Fail closed, not silently wrong: an unreachable profile becomes a
      // zero-width envelope (see UNAVAILABLE_AXIS_RANGES) rather than
      // DEFAULT_AXIS_RANGES, which would let the UI offer an unsafe Z:0
      // target the real backend has to reject — and "no chamber heater"
      // (see UNAVAILABLE_DEVICE_CAPABILITIES), which only ever disables an
      // editor rather than blocking anything.
      this.deviceProfile.fetchProfile().catch((error: unknown) => {
        console.error('[dashboard] failed to load device_config/profile:', error);
        return { axisRanges: UNAVAILABLE_AXIS_RANGES, deviceCapabilities: UNAVAILABLE_DEVICE_CAPABILITIES };
      }),
    ]);
    const samples = history.samples;
    const position = domain.position;
    const { axisRanges, deviceCapabilities } = profile;

    const data: ManagementDashboardData = {
      printJob: {
        ...STATIC_PRINT_JOB_PLACEHOLDERS,
        name: domain.job?.fileName ?? STATIC_PRINT_JOB_PLACEHOLDERS.name,
        estimatedPrintTime:
          domain.job?.remainingSeconds !== undefined
            ? this.i18n.formatDuration(domain.job.remainingSeconds)
            : STATIC_PRINT_JOB_PLACEHOLDERS.estimatedPrintTime,
        progress: domain.job?.progressPercent ?? 0,
        currentLayer: domain.job?.currentLayer ?? 0,
        totalLayers: domain.job?.totalLayers ?? 0,
        status: mapJobStatus(domain.job?.status),
      },
      controls: {
        lightEnabled: domain.lightOn ?? false,
        fansEnabled: (domain.fans?.coolingPercent ?? 0) > 0,
        fanSpeed: domain.fans?.coolingPercent ?? 0,
        printSpeed: mapPrintSpeed(domain.speedPercent),
      },
      temperatures: {
        chamber: domain.temperatures?.chamber?.current ?? null,
        bed: domain.temperatures?.bed?.current ?? null,
        nozzle: domain.temperatures?.nozzle?.current ?? null,
      },
      // Position is dead-reckoned server-side and may be null (never homed,
      // or the MQTT connection just dropped). 0,0,0 here is only a
      // shape-validity placeholder for that case — positionSource carries
      // the truth, and printer-navigation must gate free jogging on it
      // rather than ever treating this placeholder as a real reading.
      coordinates: {
        X: position?.x ?? 0,
        Y: position?.y ?? 0,
        Z: position?.z ?? 0,
      },
      positionSource: mapPositionSource(position?.source),
      axisRanges,
      deviceCapabilities,
      navigation: STATIC_NAVIGATION_DEFAULTS,
      livePreview: STATIC_LIVE_PREVIEW_DEFAULTS,
      widgets: STATIC_WIDGET_LAYOUT,
      charts: {
        progress: { ...STATIC_CHART_METADATA.progress, ...mapProgressChart(samples) },
        temperature: { ...STATIC_CHART_METADATA.temperature, ...mapTemperatureChart(samples) },
        fan: { ...STATIC_CHART_METADATA.fan, ...mapFanChart(samples) },
      },
    };

    if (!isManagementDashboardData(data)) {
      throw new Error('Composed dashboard data from mqtt-puppeteer has an invalid shape.');
    }
    return data;
  }
}

/**
 * PrintJobStatus has no 'idle'/'unknown' member — the widget is designed to
 * always show a job card, even an empty one. Map the backend's idle/unknown
 * states to 'completed' (terminal, action buttons disabled) rather than the
 * misleading 'printing', since there is no active job to pause or cancel.
 */
function mapJobStatus(status: PrinterJobStatusDto | undefined): PrintJobStatus {
  switch (status) {
    case 'running':
      return 'printing';
    case 'paused':
      return 'paused';
    case 'finished':
      return 'completed';
    case 'error':
      return 'error';
    case 'idle':
    case 'unknown':
    case undefined:
      return 'completed';
    default:
      return 'completed';
  }
}

function mapPositionSource(source: BackendPositionSource | undefined): PrinterPositionSource {
  return source ?? 'unknown';
}

function mapPrintSpeed(speedPercent: number | undefined) {
  if (speedPercent === undefined) return 'standard' as const;
  if (speedPercent <= 60) return 'silent' as const;
  if (speedPercent <= 110) return 'standard' as const;
  if (speedPercent <= 140) return 'sport' as const;
  return 'ludicrous' as const;
}
