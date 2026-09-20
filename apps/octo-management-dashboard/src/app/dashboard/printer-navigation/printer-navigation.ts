import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { SplitButtonModule } from 'primeng/splitbutton';
import {
  adjustCoordinates,
  clampCoordinatesUpperBound,
  validateAxisRanges,
} from './coordinate-utils';
import {
  DEFAULT_AXIS_RANGES,
  DEFAULT_COORDINATES,
  DEFAULT_LABELS,
  DEFAULT_STEPS,
  DEFAULT_VIEWPORT,
  EMPTY_AXIS_POINTS,
  PRINTER_AXES,
} from './printer-navigation.defaults';
import {
  AxisDirection,
  AxisPointResetEvent,
  AxisRanges,
  Coordinates,
  HotendActionEvent,
  HotendDirection,
  OverlayPoint,
  PositionPanelPlacement,
  PrinterAxis,
  PrinterAxisPoints,
  PrinterNavigationConfiguration,
  PrinterNavigationLabels,
  PrinterViewportConfig,
} from './printer-navigation.models';

interface AxisView {
  axis: PrinterAxis;
  positive: OverlayPoint;
  negative: OverlayPoint;
  midpoint: OverlayPoint;
  angle: number;
}

interface ActivePoint {
  axis: PrinterAxis;
  direction: AxisDirection;
}

type MovementMenuKey = `${PrinterAxis}-${AxisDirection}`;

let nextInstanceId = 0;

const clonePoints = (points: PrinterAxisPoints): PrinterAxisPoints => structuredClone(points);

@Component({
  selector: 'app-printer-navigation',
  imports: [ButtonModule, FormsModule, SelectModule, SplitButtonModule],
  templateUrl: './printer-navigation.html',
  styleUrl: './printer-navigation.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrinterNavigation {
  readonly coordinates = model<Coordinates>({ ...DEFAULT_COORDINATES });

  readonly viewport = input<PrinterViewportConfig>(DEFAULT_VIEWPORT);
  readonly axisRanges = input<AxisRanges>(DEFAULT_AXIS_RANGES);
  /**
   * Disables jog and hotend movement controls without hiding the widget.
   * DashboardPage sets this when the backend's tracked position is
   * 'unknown' (never homed, or the connection just dropped) — jogging from
   * an unknown starting point is not something the UI should offer, even
   * though every jog target is still independently bounds-checked.
   */
  readonly jogDisabled = input<boolean>(false);
  readonly steps = input<readonly number[]>(DEFAULT_STEPS);
  readonly axisColor = input<string>('var(--printer-axis-color)');
  readonly initialAxisPoints = input<PrinterAxisPoints>(EMPTY_AXIS_POINTS);
  readonly initialHotendPoint = input<OverlayPoint | null>(null);
  readonly labels = input<PrinterNavigationLabels>(DEFAULT_LABELS);
  readonly instanceId = input<string>(`printer-navigation-${++nextInstanceId}`);

  readonly configurationSaved = output<PrinterNavigationConfiguration>();
  readonly axesReset = output<AxisPointResetEvent>();
  readonly hotendAction = output<HotendActionEvent>();
  /**
   * Requests a physical home. Independent of axis-point calibration
   * (axesReset) — this must never touch draftPoints/points state, it only
   * asks the parent to issue the home command. jogDisabled unlocking
   * afterward is driven entirely by the parent's positionSource polling,
   * not by anything this component does locally.
   */
  readonly homeRequested = output<void>();

  protected readonly axes = PRINTER_AXES;
  protected readonly configurationOpen = signal(false);
  protected readonly selectedAxis = signal<PrinterAxis | null>(null);
  protected readonly awaitingDirection = signal<AxisDirection | null>(null);
  protected readonly cursorPoint = signal<OverlayPoint | null>(null);
  protected readonly activePoint = signal<ActivePoint | null>(null);
  protected readonly draggingPoint = signal(false);
  protected readonly configuringHotend = signal(false);
  protected readonly mainStep = signal(DEFAULT_STEPS[DEFAULT_STEPS.length - 1] ?? 1);
  protected readonly draftMainStep = signal(this.mainStep());
  protected readonly positionPanelPlacement = signal<PositionPanelPlacement>('top-right');
  protected readonly draftPositionPanelPlacement = signal<PositionPanelPlacement>('top-right');
  protected readonly draftPoints = signal<PrinterAxisPoints>(clonePoints(EMPTY_AXIS_POINTS));
  protected readonly points = signal<PrinterAxisPoints>(clonePoints(EMPTY_AXIS_POINTS));
  protected readonly draftHotendPoint = signal<OverlayPoint | null>(null);
  protected readonly hotendPoint = signal<OverlayPoint | null>(null);

  protected readonly canvasViewBox = computed(() => {
    const viewBox = this.viewport().viewBox;
    return `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`;
  });
  protected readonly canvasStyle = computed(() => ({
    '--printer-canvas-width': `${this.viewport().width}px`,
    '--printer-canvas-height': `${this.viewport().height}px`,
    '--printer-canvas-ratio': `${this.viewport().width} / ${this.viewport().height}`,
  }));
  protected readonly normalizedSteps = computed(() => this.normalizeSteps(this.steps()));
  protected readonly resolvedRanges = computed(() => {
    const ranges = this.axisRanges();
    validateAxisRanges(ranges);
    return ranges;
  });

  protected readonly stepOptions = computed(() =>
    this.normalizedSteps().map((step) => ({
      label: this.labels().stepOption(
        step,
        this.normalizedSteps().filter((candidate) => candidate !== step),
      ),
      value: step,
    })),
  );

  protected readonly positionOptions = computed(() =>
    (Object.keys(this.labels().positionOptions) as PositionPanelPlacement[]).map((value) => ({
      label: this.labels().positionOptions[value],
      value,
    })),
  );

  protected readonly displayPoints = computed(() =>
    this.configurationOpen() ? this.draftPoints() : this.points(),
  );

  protected readonly axisViews = computed<AxisView[]>(() =>
    PRINTER_AXES.flatMap((axis) => {
      const points = this.displayPoints()[axis];
      if (!points.positive || !points.negative) {
        return [];
      }
      return [
        {
          axis,
          positive: points.positive,
          negative: points.negative,
          midpoint: {
            x: (points.positive.x + points.negative.x) / 2,
            y: (points.positive.y + points.negative.y) / 2,
          },
          angle: this.lineAngle(points.negative, points.positive),
        },
      ];
    }),
  );

  protected readonly previewLine = computed(() => {
    const axis = this.selectedAxis();
    const cursor = this.cursorPoint();
    if (!axis || this.awaitingDirection() !== 'negative' || !cursor) {
      return null;
    }
    const start = this.draftPoints()[axis].positive;
    return start ? { start, end: cursor } : null;
  });

  protected readonly activePointHint = computed(() => {
    if (this.configuringHotend()) {
      return this.labels().hotendPointLabel;
    }
    const axis = this.selectedAxis();
    const direction = this.awaitingDirection();
    return axis && direction ? this.labels().activePointHint(axis, direction) : null;
  });

  protected readonly movementMenus = computed<Record<MovementMenuKey, MenuItem[]>>(() => {
    const menus = {} as Record<MovementMenuKey, MenuItem[]>;
    for (const axis of PRINTER_AXES) {
      for (const direction of ['negative', 'positive'] as const) {
        const sign = direction === 'positive' ? 1 : -1;
        menus[`${axis}-${direction}`] = this.normalizedSteps()
          .filter((step) => step !== this.mainStep())
          .map((step) => {
            const delta = sign * step;
            return {
              label: this.formatDelta(delta),
              command: () => this.changeCoordinate(axis, delta),
            };
          });
      }
    }
    return menus;
  });

  protected readonly hotendMenus = computed<Record<HotendDirection, MenuItem[]>>(() => {
    const menus = {} as Record<HotendDirection, MenuItem[]>;
    for (const direction of ['up', 'down'] as const) {
      menus[direction] = this.normalizedSteps()
        .filter((step) => step !== this.mainStep())
        .map((step) => ({
          label: this.formatDelta(this.hotendDelta(direction, step)),
          command: () => this.emitHotendAction(direction, step),
        }));
    }
    return menus;
  });

  protected readonly configurationPanelVisible = computed(
    () =>
      this.configurationOpen() &&
      this.selectedAxis() === null &&
      !this.configuringHotend() &&
      this.activePoint() === null,
  );

  protected readonly configurationComplete = computed(
    () =>
      this.draftHotendPoint() !== null &&
      PRINTER_AXES.every((axis) => {
        const points = this.draftPoints()[axis];
        return points.positive !== null && points.negative !== null;
      }),
  );

  protected readonly instruction = computed(() => {
    if (this.configuringHotend()) {
      return this.labels().hotendPointLabel;
    }
    const axis = this.selectedAxis();
    const direction = this.awaitingDirection();
    return axis && direction
      ? this.labels().selectPointInstruction(axis, direction)
      : this.labels().chooseAxisInstruction;
  });

  constructor() {
    effect(() => {
      const initialPoints = clonePoints(this.initialAxisPoints());
      untracked(() => {
        this.points.set(initialPoints);
        if (!this.configurationOpen()) {
          this.draftPoints.set(clonePoints(initialPoints));
        }
      });
    });

    effect(() => {
      const initialPoint = this.initialHotendPoint();
      untracked(() => {
        this.hotendPoint.set(initialPoint ? { ...initialPoint } : null);
        if (!this.configurationOpen()) {
          this.draftHotendPoint.set(initialPoint ? { ...initialPoint } : null);
        }
      });
    });

    // Only sanitizes an over-range value (e.g. malformed backend/config
    // data); deliberately does NOT enforce the lower bound here. The
    // backend-reported position (this component's only non-jog writer of
    // `coordinates`) can legitimately sit below an axis' configured
    // minimum right after a home — the Bambu Lab A1's real post-G28 Z is
    // below the machine envelope's Z minimum, which bounds commanded
    // moves, not the physical home position. Jog targets are unaffected:
    // they're independently floor-clamped by adjustCoordinates below, so
    // "once above the minimum, a jog can't go below it again" still holds.
    effect(() => {
      const ranges = this.resolvedRanges();
      const current = this.coordinates();
      const clamped = clampCoordinatesUpperBound(current, ranges);
      if (PRINTER_AXES.some((axis) => clamped[axis] !== current[axis])) {
        untracked(() => this.coordinates.set(clamped));
      }
    });

    effect(() => {
      const availableSteps = this.normalizedSteps();
      untracked(() => {
        if (!availableSteps.includes(this.mainStep())) {
          this.mainStep.set(availableSteps[availableSteps.length - 1]);
        }
        if (!availableSteps.includes(this.draftMainStep())) {
          this.draftMainStep.set(availableSteps[availableSteps.length - 1]);
        }
      });
    });
  }

  protected toggleConfiguration(): void {
    if (this.configurationOpen()) {
      // The settings button also acts as a safe way back from point placement.
      // Closing/cancelling is intentionally left to the explicit Cancel button,
      // so a touch user cannot lose a partially configured axis by tapping the cog.
      this.resetPointerState();
      return;
    }
    this.configurationOpen.set(true);
    this.draftPoints.set(clonePoints(this.points()));
    this.draftHotendPoint.set(this.hotendPoint() ? { ...this.hotendPoint()! } : null);
    this.draftMainStep.set(this.mainStep());
    this.draftPositionPanelPlacement.set(this.positionPanelPlacement());
    this.resetPointerState();
  }

  protected configureAxis(axis: PrinterAxis): void {
    this.configuringHotend.set(false);
    this.selectedAxis.set(axis);
    this.awaitingDirection.set('positive');
    // Do not render a synthetic point in the centre. On touch devices it looked
    // like +axis had already been selected before the first canvas tap.
    this.cursorPoint.set(null);
    this.activePoint.set(null);
    this.draggingPoint.set(false);
    this.draftPoints.update((points) => ({
      ...points,
      [axis]: { positive: null, negative: null },
    }));
  }

  protected configureHotend(): void {
    this.resetPointerState();
    this.configuringHotend.set(true);
    this.draftHotendPoint.set(null);
  }

  protected onCanvasPointerDown(event: PointerEvent): void {
    if (!this.configurationOpen() || this.draggingPoint() || !event.isPrimary) {
      return;
    }
    const axis = this.selectedAxis();
    const direction = this.awaitingDirection();
    if (axis && direction) {
      this.placePendingPoint(axis, direction, this.eventToPoint(event));
    } else if (this.configuringHotend()) {
      this.draftHotendPoint.set(this.eventToPoint(event));
      this.resetPointerState();
    }
  }

  protected onCanvasPointerMove(event: PointerEvent): void {
    if (!this.configurationOpen()) {
      return;
    }
    const point = this.eventToPoint(event);
    const active = this.activePoint();
    if (active && this.draggingPoint()) {
      this.updatePoint(active, point);
    } else if (this.awaitingDirection()) {
      this.cursorPoint.set(point);
    } else if (this.configuringHotend()) {
      this.cursorPoint.set(point);
    }
  }

  protected onCanvasKeydown(event: KeyboardEvent): void {
    if (!this.configurationOpen()) {
      return;
    }
    const delta = event.shiftKey ? 10 : 1;
    const movement: Partial<Record<string, OverlayPoint>> = {
      ArrowLeft: { x: -delta, y: 0 },
      ArrowRight: { x: delta, y: 0 },
      ArrowUp: { x: 0, y: -delta },
      ArrowDown: { x: 0, y: delta },
    };
    const offset = movement[event.key];
    if (offset) {
      event.preventDefault();
      this.nudgeActivePoint(offset);
      return;
    }
    if (event.key === 'Enter') {
      const axis = this.selectedAxis();
      const direction = this.awaitingDirection();
      const point = this.cursorPoint();
      if (axis && direction && point) {
        event.preventDefault();
        this.placePendingPoint(axis, direction, point);
      } else if (this.configuringHotend() && point) {
        event.preventDefault();
        this.draftHotendPoint.set(point);
        this.resetPointerState();
      }
    }
    if (event.key === 'Escape') {
      this.resetPointerState();
    }
  }

  protected startDrag(event: PointerEvent, axis: PrinterAxis, direction: AxisDirection): void {
    if (!this.configurationOpen()) {
      return;
    }
    event.stopPropagation();
    this.selectedAxis.set(null);
    this.awaitingDirection.set(null);
    this.cursorPoint.set(null);
    this.activePoint.set({ axis, direction });
    this.draggingPoint.set(true);
    (event.currentTarget as SVGCircleElement).setPointerCapture(event.pointerId);
  }

  protected selectPoint(event: Event, axis: PrinterAxis, direction: AxisDirection): void {
    if (!this.configurationOpen()) {
      return;
    }
    event.stopPropagation();
    this.activePoint.set({ axis, direction });
  }

  protected endDrag(event: PointerEvent): void {
    if (!this.draggingPoint()) {
      return;
    }
    const target = event.target as SVGElement;
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    this.draggingPoint.set(false);
  }

  protected saveConfiguration(): void {
    if (!this.configurationComplete()) {
      return;
    }
    this.points.set(clonePoints(this.draftPoints()));
    this.hotendPoint.set({ ...this.draftHotendPoint()! });
    this.mainStep.set(this.draftMainStep());
    this.positionPanelPlacement.set(this.draftPositionPanelPlacement());
    this.configurationOpen.set(false);
    this.resetPointerState();
    this.configurationSaved.emit(this.configurationSnapshot());
  }

  protected cancelConfiguration(): void {
    this.draftPoints.set(clonePoints(this.points()));
    this.draftHotendPoint.set(this.hotendPoint() ? { ...this.hotendPoint()! } : null);
    this.configurationOpen.set(false);
    this.resetPointerState();
  }

  protected resetAxes(): void {
    const emptyPoints = clonePoints(EMPTY_AXIS_POINTS);
    this.points.set(emptyPoints);
    this.draftPoints.set(clonePoints(emptyPoints));
    this.hotendPoint.set(null);
    this.draftHotendPoint.set(null);
    this.resetPointerState();
    this.axesReset.emit({ axisPoints: clonePoints(emptyPoints), hotendPoint: null });
  }

  protected changeCoordinate(axis: PrinterAxis, delta: number): void {
    if (this.jogDisabled()) return;
    if (!this.normalizedSteps().includes(Math.abs(delta))) {
      throw new Error(`Nieobsługiwany krok osi: ${delta}`);
    }
    const current = this.coordinates();
    const adjusted = adjustCoordinates(current, axis, delta, this.resolvedRanges());
    if (adjusted[axis] !== current[axis]) {
      this.coordinates.set(adjusted);
    }
  }

  protected movementMenu(axis: PrinterAxis, direction: AxisDirection): MenuItem[] {
    return this.movementMenus()[`${axis}-${direction}`];
  }

  protected hotendMenu(direction: HotendDirection): MenuItem[] {
    return this.hotendMenus()[direction];
  }

  protected hotendLabel(direction: HotendDirection): string {
    return this.formatDelta(this.hotendDelta(direction, this.mainStep()));
  }

  protected requestHome(): void {
    this.homeRequested.emit();
  }

  protected emitHotendAction(direction: HotendDirection, step = this.mainStep()): void {
    if (this.jogDisabled()) return;
    if (!this.normalizedSteps().includes(step)) {
      throw new Error(`Nieobsługiwany krok hotendu: ${step}`);
    }
    this.hotendAction.emit({ direction, step, delta: this.hotendDelta(direction, step) });
  }

  protected mainDelta(direction: AxisDirection): number {
    return (direction === 'positive' ? 1 : -1) * this.mainStep();
  }

  protected movementLabel(direction: AxisDirection): string {
    return this.formatDelta(this.mainDelta(direction));
  }

  protected pointStyle(point: OverlayPoint, angle: number): Record<string, string> {
    const viewBox = this.viewport().viewBox;
    return {
      left: `${((point.x - viewBox.minX) / viewBox.width) * 100}%`,
      top: `${((point.y - viewBox.minY) / viewBox.height) * 100}%`,
      '--axis-angle': `${angle}deg`,
    };
  }

  protected axisStatus(axis: PrinterAxis): string {
    if (this.selectedAxis() === axis) {
      const direction = this.awaitingDirection() ?? 'positive';
      return this.labels().pointLabel(axis, direction);
    }
    const points = this.draftPoints()[axis];
    return points.positive && points.negative ? this.labels().configured : this.labels().incomplete;
  }

  protected pointAriaLabel(axis: PrinterAxis, direction: AxisDirection): string {
    return this.labels().pointLabel(axis, direction);
  }

  private placePendingPoint(
    axis: PrinterAxis,
    direction: AxisDirection,
    point: OverlayPoint,
  ): void {
    this.updatePoint({ axis, direction }, point);
    if (direction === 'positive') {
      this.awaitingDirection.set('negative');
      this.cursorPoint.set(point);
    } else {
      this.resetPointerState();
    }
  }

  private nudgeActivePoint(offset: OverlayPoint): void {
    const active = this.activePoint();
    if (active) {
      const current = this.draftPoints()[active.axis][active.direction];
      if (current) {
        this.updatePoint(
          active,
          this.clampPoint({
            x: current.x + offset.x,
            y: current.y + offset.y,
          }),
        );
      }
      return;
    }
    if (this.awaitingDirection()) {
      const current = this.cursorPoint() ?? this.viewBoxCenter();
      this.cursorPoint.set(
        this.clampPoint({
          x: current.x + offset.x,
          y: current.y + offset.y,
        }),
      );
    } else if (this.configuringHotend()) {
      const current = this.cursorPoint() ?? this.viewBoxCenter();
      this.cursorPoint.set(
        this.clampPoint({
          x: current.x + offset.x,
          y: current.y + offset.y,
        }),
      );
    }
  }

  private updatePoint(active: ActivePoint, point: OverlayPoint): void {
    this.draftPoints.update((points) => ({
      ...points,
      [active.axis]: { ...points[active.axis], [active.direction]: this.clampPoint(point) },
    }));
  }

  private eventToPoint(event: PointerEvent): OverlayPoint {
    const svg = event.currentTarget as SVGSVGElement;
    const bounds = svg.getBoundingClientRect();
    const viewBox = this.viewport().viewBox;
    return this.clampPoint({
      x: viewBox.minX + ((event.clientX - bounds.left) / bounds.width) * viewBox.width,
      y: viewBox.minY + ((event.clientY - bounds.top) / bounds.height) * viewBox.height,
    });
  }

  private clampPoint(point: OverlayPoint): OverlayPoint {
    const viewBox = this.viewport().viewBox;
    return {
      x: Math.round(Math.min(viewBox.minX + viewBox.width, Math.max(viewBox.minX, point.x))),
      y: Math.round(Math.min(viewBox.minY + viewBox.height, Math.max(viewBox.minY, point.y))),
    };
  }

  private viewBoxCenter(): OverlayPoint {
    const viewBox = this.viewport().viewBox;
    return {
      x: viewBox.minX + viewBox.width / 2,
      y: viewBox.minY + viewBox.height / 2,
    };
  }

  private resetPointerState(): void {
    this.selectedAxis.set(null);
    this.awaitingDirection.set(null);
    this.cursorPoint.set(null);
    this.activePoint.set(null);
    this.draggingPoint.set(false);
    this.configuringHotend.set(false);
  }

  private lineAngle(start: OverlayPoint, end: OverlayPoint): number {
    let angle = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);
    if (angle > 90) {
      angle -= 180;
    } else if (angle < -90) {
      angle += 180;
    }
    return angle;
  }

  private configurationSnapshot(): PrinterNavigationConfiguration {
    return {
      axisPoints: clonePoints(this.points()),
      hotendPoint: { ...this.hotendPoint()! },
      mainStep: this.mainStep(),
      positionPanelPlacement: this.positionPanelPlacement(),
      steps: [...this.normalizedSteps()],
      axisRanges: structuredClone(this.resolvedRanges()),
      axisColor: this.axisColor(),
      viewport: structuredClone(this.viewport()),
    };
  }

  private normalizeSteps(steps: readonly number[]): readonly number[] {
    if (
      !steps.length ||
      steps.some(
        (step) =>
          typeof step !== 'number' || !Number.isFinite(step) || Number.isNaN(step) || step <= 0,
      )
    ) {
      throw new RangeError('Lista kroków musi zawierać wyłącznie dodatnie, skończone liczby.');
    }
    return [...new Set(steps)].sort((a, b) => a - b);
  }

  private formatDelta(delta: number): string {
    return `${delta > 0 ? '+' : ''}${delta}`;
  }

  private hotendDelta(direction: HotendDirection, step: number): number {
    return (direction === 'up' ? -1 : 1) * step;
  }
}

export {
  DEFAULT_AXIS_RANGES as AXIS_RANGES,
  DEFAULT_COORDINATES,
  DEFAULT_LABELS,
  DEFAULT_STEPS,
  DEFAULT_VIEWPORT,
  EMPTY_AXIS_POINTS,
};
export * from './coordinate-utils';
export * from './printer-navigation.models';
