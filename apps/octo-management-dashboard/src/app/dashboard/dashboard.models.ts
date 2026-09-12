import type { ChartDataset } from 'chart.js';
import type { TranslationKey } from '../core/i18n.service';
import type {
  AxisRanges,
  OverlayPoint,
  PrinterAxisPoints,
  PrinterViewportConfig,
} from './printer-navigation/printer-navigation.models';

export type PrintJobStatus = 'printing' | 'paused' | 'completed' | 'cancelled' | 'error';
export type PrintSpeedMode = 'silent' | 'standard' | 'sport' | 'ludicrous';
export type DashboardWidgetType =
  | 'print-job'
  | 'quick-controls'
  | 'temperatures'
  | 'printer-navigation'
  | 'live-preview'
  | 'progress-chart'
  | 'temperature-chart'
  | 'fan-chart';

export interface CurrentPrintJobData {
  name: string;
  thumbnailUrl: string;
  thumbnailAlt: string;
  progress: number;
  currentLayer: number;
  totalLayers: number;
  estimatedPrintTime: string;
  status: PrintJobStatus;
}

export interface PrinterControlData {
  lightEnabled: boolean;
  fansEnabled: boolean;
  fanSpeed: number;
  printSpeed: PrintSpeedMode;
}

export interface PrinterTemperatureData {
  chamber: number | null;
  bed: number | null;
  nozzle: number | null;
}

/**
 * Per-model heater capabilities, sourced from GET /device_config/profile
 * (mirrors how axisRanges carries the real machine envelope). The dashboard
 * must derive which temperature sensors are settable from this rather than
 * hard-coding a literal sensor list — a future profile with a chamber
 * heater becomes editable without any frontend code change.
 */
export interface DeviceCapabilities {
  hasChamberHeater: boolean;
}

export interface Coordinates {
  X: number;
  Y: number;
  Z: number;
}

export interface LivePreviewData {
  cameraName: string;
  resolution: string;
  availableResolutions: string[];
  active: boolean;
  latencyMs: number;
}

export interface PrinterNavigationData {
  axisPoints: PrinterAxisPoints;
  hotendPoint: OverlayPoint;
  steps: number[];
  viewport: PrinterViewportConfig;
}

export interface TelemetryChartData {
  kind: 'progress' | 'temperature' | 'fan';
  titleKey: TranslationKey;
  subtitleKey: TranslationKey;
  xAxisLabelKey: TranslationKey;
  yAxisLabelKey: TranslationKey;
  yMin: number;
  yMax: number;
  yStepSize: number;
  valueSuffix: string;
  labels: string[];
  datasets: TelemetryChartDataset[];
}

export type TelemetryChartDataset = ChartDataset<'line', number[]> & {
  labelKey: TranslationKey;
  colorToken: string;
  backgroundColorToken?: string;
  gradientColorTokens?: [string, string];
};

export interface DashboardWidget {
  id: string;
  type: DashboardWidgetType;
  x: number;
  y: number;
  cols: number;
  rows: number;
  minItemCols?: number;
  minItemRows?: number;
  [key: string]: unknown;
}

/**
 * Whether `coordinates` reflects a trustworthy position. mqtt-puppeteer's
 * position is dead-reckoned (derived from commands it has issued, not a
 * live sensor) and starts/returns to 'unknown' whenever that reckoning
 * can no longer be trusted (never homed yet, or the MQTT connection just
 * dropped). The mock data source always reports 'commanded' so existing
 * mock-driven behavior/tests are unaffected.
 */
export type PrinterPositionSource = 'unknown' | 'homed' | 'commanded';

export interface ManagementDashboardData {
  printJob: CurrentPrintJobData;
  controls: PrinterControlData;
  temperatures: PrinterTemperatureData;
  coordinates: Coordinates;
  positionSource: PrinterPositionSource;
  /**
   * The machine's real safe travel envelope. Sourced from
   * GET /device_config/profile on the real backend — never assume
   * DEFAULT_AXIS_RANGES is safe, it is a mock-only placeholder that is
   * wrong for the real A1 on every axis (see printer-navigation.defaults.ts).
   */
  axisRanges: AxisRanges;
  deviceCapabilities: DeviceCapabilities;
  navigation: PrinterNavigationData;
  livePreview: LivePreviewData;
  widgets: DashboardWidget[];
  charts: Record<'progress' | 'temperature' | 'fan', TelemetryChartData>;
}
