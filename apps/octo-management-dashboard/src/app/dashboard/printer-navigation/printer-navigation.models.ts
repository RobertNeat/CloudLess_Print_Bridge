export type PrinterAxis = 'X' | 'Y' | 'Z';
export type AxisDirection = 'positive' | 'negative';
export type HotendDirection = 'up' | 'down';
export type PositionPanelPlacement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface Coordinates {
  X: number;
  Y: number;
  Z: number;
}

export interface AxisRange {
  min: number;
  max: number;
}

export type AxisRanges = Record<PrinterAxis, AxisRange>;

export interface OverlayPoint {
  x: number;
  y: number;
}

export interface AxisPoints {
  positive: OverlayPoint | null;
  negative: OverlayPoint | null;
}

export type PrinterAxisPoints = Record<PrinterAxis, AxisPoints>;

export interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface PrinterViewportConfig {
  imageUrl: string;
  imageAlt: string;
  width: number;
  height: number;
  viewBox: ViewBox;
}

export interface PrinterNavigationLabels {
  canvasAriaLabel: string;
  settingsAriaLabel: string;
  backToConfigurationAriaLabel: string;
  position: string;
  axis: string;
  configurationTitle: string;
  chooseAxisInstruction: string;
  selectPointInstruction: (axis: PrinterAxis, direction: AxisDirection) => string;
  activePointHint: (axis: PrinterAxis, direction: AxisDirection) => string;
  setAxis: (axis: PrinterAxis) => string;
  setHotend: string;
  hotend: string;
  hotendPointLabel: string;
  pointLabel: (axis: PrinterAxis, direction: AxisDirection) => string;
  configured: string;
  incomplete: string;
  mainStep: string;
  positionPanel: string;
  resetAxes: string;
  cancel: string;
  save: string;
  positionOptions: Record<PositionPanelPlacement, string>;
  stepOption: (mainStep: number, alternativeSteps: readonly number[]) => string;
  alternativeStepAriaLabel: (axis: PrinterAxis, direction: AxisDirection) => string;
  hotendStepAriaLabel: (direction: HotendDirection) => string;
  jogDisabledHint: string;
}

export interface PrinterNavigationConfiguration {
  axisPoints: PrinterAxisPoints;
  hotendPoint: OverlayPoint;
  mainStep: number;
  positionPanelPlacement: PositionPanelPlacement;
  steps: readonly number[];
  axisRanges: AxisRanges;
  axisColor: string;
  viewport: PrinterViewportConfig;
}

export interface AxisPointResetEvent {
  axisPoints: PrinterAxisPoints;
  hotendPoint: null;
}

export interface HotendActionEvent {
  direction: HotendDirection;
  step: number;
  delta: number;
}
