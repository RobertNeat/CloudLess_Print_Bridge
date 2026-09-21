import { DEFAULT_AXIS_RANGES } from '../printer-navigation/printer-navigation.defaults';
import type {
  CurrentPrintJobData,
  DashboardWidget,
  LivePreviewData,
  PrinterNavigationData,
  TelemetryChartData,
} from '../dashboard.models';
import type { AxisRanges } from '../printer-navigation/printer-navigation.models';

/**
 * Fields ManagementDashboardData needs that mqtt-puppeteer has no concept
 * of: UI calibration/layout, camera metadata (no camera backend exists —
 * see live-preview's phase notes), and chart *presentation* metadata
 * (titles, colors, axis scaling). HttpManagementDashboardDataSource
 * composes real backend slices over these, it never invents them from
 * backend data.
 */

export const STATIC_PRINT_JOB_PLACEHOLDERS: Pick<
  CurrentPrintJobData,
  'name' | 'thumbnailUrl' | 'thumbnailAlt' | 'estimatedPrintTime'
> = {
  name: 'Aktualne zadanie',
  // Used whenever no on-device thumbnail is resolved yet — see resolveThumbnailUrl().
  thumbnailUrl: '/images/live_preview.png',
  thumbnailAlt: 'Podgląd drukowanego elementu (brak podglądu z drukarki)',
  estimatedPrintTime: '—',
};

export const STATIC_NAVIGATION_DEFAULTS: PrinterNavigationData = {
  axisPoints: {
    X: { negative: { x: 205, y: 392 }, positive: { x: 790, y: 392 } },
    Y: { negative: { x: 300, y: 850 }, positive: { x: 700, y: 760 } },
    Z: { negative: { x: 780, y: 650 }, positive: { x: 780, y: 185 } },
  },
  hotendPoint: { x: 500, y: 540 },
  steps: [1, 5, 10],
  viewport: {
    imageUrl: '/images/A1_less_datails.png',
    imageAlt: 'Drukarka 3D Bambu Lab A1',
    width: 680,
    height: 680,
    viewBox: { minX: 0, minY: 0, width: 1000, height: 1000 },
  },
};

/**
 * The video-service-hub camera-registry displayName the live-preview widget
 * looks up its camera by (see http-management-dashboard-data.source.ts /
 * dashboard-page.ts) — matched case-insensitively, trimmed. Kept as a
 * constant here rather than a hardcoded cameraId so re-registering the
 * printer's camera under a new cameraId/baseUrl needs no frontend change.
 */
export const PRINTER_CAMERA_DISPLAY_NAME = 'Kamera drukarki';

/**
 * Mirrors the hub's supported resolution codes exactly (assertResolution in
 * video-service-hub/src/common/validation.ts), same list/order the Videos
 * page's media-record-dialog already offers — kept in sync manually since
 * there is no shared package between the two apps.
 */
export const LIVE_PREVIEW_AVAILABLE_RESOLUTIONS = ['QVGA', 'VGA', 'SVGA', 'XGA', 'UXGA'];

export const STATIC_LIVE_PREVIEW_DEFAULTS: LivePreviewData = {
  cameraName: PRINTER_CAMERA_DISPLAY_NAME,
  cameraId: '',
  resolution: 'VGA',
  availableResolutions: LIVE_PREVIEW_AVAILABLE_RESOLUTIONS,
  active: false,
  latencyMs: 0,
};

export const STATIC_WIDGET_LAYOUT: DashboardWidget[] = [
  {
    id: 'current-print',
    type: 'print-job',
    x: 0,
    y: 0,
    cols: 4,
    rows: 2,
    minItemCols: 4,
    minItemRows: 2,
  },
  {
    id: 'live-preview',
    type: 'live-preview',
    x: 8,
    y: 0,
    cols: 4,
    rows: 4,
    minItemCols: 4,
    minItemRows: 3,
  },
  { id: 'quick-controls', type: 'quick-controls', x: 0, y: 2, cols: 4, rows: 1, minItemCols: 4 },
  { id: 'temperatures', type: 'temperatures', x: 0, y: 3, cols: 4, rows: 1, minItemCols: 4 },
  {
    id: 'navigation',
    type: 'printer-navigation',
    x: 4,
    y: 0,
    cols: 4,
    rows: 4,
    minItemCols: 3,
    minItemRows: 3,
  },
  {
    id: 'progress',
    type: 'progress-chart',
    x: 0,
    y: 4,
    cols: 4,
    rows: 3,
    minItemCols: 3,
    minItemRows: 2,
  },
  {
    id: 'temperature',
    type: 'temperature-chart',
    x: 4,
    y: 4,
    cols: 4,
    rows: 3,
    minItemCols: 3,
    minItemRows: 2,
  },
  { id: 'fan', type: 'fan-chart', x: 8, y: 4, cols: 4, rows: 3, minItemCols: 3, minItemRows: 2 },
];

type ChartMetadata = Omit<TelemetryChartData, 'labels' | 'datasets'>;

export const STATIC_CHART_METADATA: Record<'progress' | 'temperature' | 'fan', ChartMetadata> = {
  progress: {
    kind: 'progress',
    titleKey: 'chart.progress.title',
    subtitleKey: 'chart.progress.subtitle',
    xAxisLabelKey: 'chart.axis.time',
    yAxisLabelKey: 'chart.axis.progress',
    yMin: 0,
    yMax: 100,
    yStepSize: 10,
    valueSuffix: '%',
  },
  temperature: {
    kind: 'temperature',
    titleKey: 'chart.temperature.title',
    subtitleKey: 'chart.temperature.subtitle',
    xAxisLabelKey: 'chart.axis.time',
    yAxisLabelKey: 'chart.axis.temperature',
    yMin: 0,
    yMax: 250,
    yStepSize: 50,
    valueSuffix: '°C',
  },
  fan: {
    kind: 'fan',
    titleKey: 'chart.fan.title',
    subtitleKey: 'chart.fan.subtitle',
    xAxisLabelKey: 'chart.axis.time',
    yAxisLabelKey: 'chart.axis.fan',
    yMin: 0,
    yMax: 100,
    yStepSize: 10,
    valueSuffix: '%',
  },
};

/** Same fallback used by the mock data source, kept here so both agree. */
export const STATIC_AXIS_RANGES: AxisRanges = DEFAULT_AXIS_RANGES;
