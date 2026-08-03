import type { ChartDataset } from 'chart.js';
import type { TranslationKey } from '../core/i18n.service';
import type {
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

export interface ManagementDashboardData {
  printJob: CurrentPrintJobData;
  controls: PrinterControlData;
  temperatures: PrinterTemperatureData;
  coordinates: Coordinates;
  navigation: PrinterNavigationData;
  livePreview: LivePreviewData;
  widgets: DashboardWidget[];
  charts: Record<'progress' | 'temperature' | 'fan', TelemetryChartData>;
}
