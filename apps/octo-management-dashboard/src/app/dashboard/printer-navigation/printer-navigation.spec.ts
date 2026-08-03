import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PrinterNavigation } from './printer-navigation';
import {
  DEFAULT_LABELS,
  DEFAULT_VIEWPORT,
  EMPTY_AXIS_POINTS,
} from './printer-navigation.defaults';
import {
  AxisPointResetEvent,
  Coordinates,
  HotendActionEvent,
  PrinterAxisPoints,
  PrinterNavigationConfiguration,
} from './printer-navigation.models';

const COMPLETE_POINTS: PrinterAxisPoints = {
  X: { negative: { x: 10, y: 20 }, positive: { x: 100, y: 20 } },
  Y: { negative: { x: 20, y: 100 }, positive: { x: 20, y: 10 } },
  Z: { negative: { x: 30, y: 100 }, positive: { x: 30, y: 10 } },
};

type TestableNavigation = {
  changeCoordinate(axis: 'X' | 'Y' | 'Z', delta: number): void;
  toggleConfiguration(): void;
  configureAxis(axis: 'X' | 'Y' | 'Z'): void;
  onCanvasPointerDown(event: PointerEvent): void;
  onCanvasKeydown(event: KeyboardEvent): void;
  resetAxes(): void;
  cancelConfiguration(): void;
  saveConfiguration(): void;
  configureHotend(): void;
  emitHotendAction(direction: 'up' | 'down', step?: number): void;
  draftPoints(): PrinterAxisPoints;
  points(): PrinterAxisPoints;
  configurationOpen(): boolean;
  configurationPanelVisible(): boolean;
  cursorPoint(): { x: number; y: number } | null;
  activePointHint(): string | null;
  draftHotendPoint(): { x: number; y: number } | null;
};

describe('PrinterNavigation', () => {
  let fixture: ComponentFixture<PrinterNavigation>;
  let component: PrinterNavigation;
  let testable: TestableNavigation;

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrinterNavigation],
    }).compileComponents();
    fixture = TestBed.createComponent(PrinterNavigation);
    component = fixture.componentInstance;
    testable = component as unknown as TestableNavigation;
  });

  it('emits the complete coordinates object through the model', () => {
    fixture.componentRef.setInput('initialAxisPoints', COMPLETE_POINTS);
    fixture.componentRef.setInput('coordinates', { X: 1, Y: 2, Z: 3 });
    fixture.detectChanges();
    let emitted: Coordinates | undefined;
    component.coordinates.subscribe((value) => (emitted = value));

    testable.changeCoordinate('X', 10);

    expect(emitted).toEqual({ X: 11, Y: 2, Z: 3 });
    expect(component.coordinates()).toEqual({ X: 11, Y: 2, Z: 3 });
  });

  it('uses configured steps and rejects a step outside that list', () => {
    fixture.componentRef.setInput('steps', [0.5, 5]);
    fixture.detectChanges();

    testable.changeCoordinate('Z', 5);

    expect(component.coordinates().Z).toBe(5);
    expect(() => testable.changeCoordinate('Z', 1)).toThrow();
  });

  it('does not emit when a coordinate is already at its range boundary', () => {
    fixture.componentRef.setInput('coordinates', { X: 255, Y: 0, Z: 0 });
    fixture.detectChanges();
    const emitted: Coordinates[] = [];
    component.coordinates.subscribe((value) => emitted.push(value));

    testable.changeCoordinate('X', 10);

    expect(emitted).toEqual([]);
  });

  it('emits a complete serializable configuration on save', () => {
    fixture.componentRef.setInput('initialAxisPoints', COMPLETE_POINTS);
    fixture.componentRef.setInput('initialHotendPoint', { x: 400, y: 300 });
    fixture.detectChanges();
    let saved: PrinterNavigationConfiguration | undefined;
    component.configurationSaved.subscribe((value) => (saved = value));

    testable.toggleConfiguration();
    testable.saveConfiguration();

    expect(saved?.axisPoints).toEqual(COMPLETE_POINTS);
    expect(saved?.hotendPoint).toEqual({ x: 400, y: 300 });
    expect(saved?.viewport).toEqual(DEFAULT_VIEWPORT);
    expect(saved?.steps).toEqual([1, 10]);
  });

  it('emits hotend actions without changing or emitting coordinates', () => {
    fixture.componentRef.setInput('coordinates', { X: 1, Y: 2, Z: 3 });
    fixture.detectChanges();
    const coordinateChanges: Coordinates[] = [];
    const actions: HotendActionEvent[] = [];
    component.coordinates.subscribe((value) => coordinateChanges.push(value));
    component.hotendAction.subscribe((value) => actions.push(value));

    testable.emitHotendAction('up');
    testable.emitHotendAction('down', 1);

    expect(actions).toEqual([
      { direction: 'up', step: 10, delta: -10 },
      { direction: 'down', step: 1, delta: 1 },
    ]);
    expect(component.coordinates()).toEqual({ X: 1, Y: 2, Z: 3 });
    expect(coordinateChanges).toEqual([]);
  });

  it('configures the hotend as one point with keyboard support', () => {
    fixture.detectChanges();
    testable.toggleConfiguration();
    testable.configureHotend();

    testable.onCanvasKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    testable.onCanvasKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    testable.onCanvasKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(testable.draftHotendPoint()).toEqual({ x: 501, y: 499 });
    expect(testable.configurationPanelVisible()).toBe(true);
  });

  it('renders the hotend label above two equal-width controls with side expanders', () => {
    fixture.componentRef.setInput('initialAxisPoints', COMPLETE_POINTS);
    fixture.componentRef.setInput('initialHotendPoint', { x: 400, y: 300 });
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const control = fixture.nativeElement.querySelector('.hotend-control') as HTMLElement;
    const label = control.firstElementChild as HTMLElement;
    const splitButtons = Array.from(
      control.querySelectorAll('.hotend-splitbutton'),
    ) as HTMLElement[];

    expect(label.classList).toContain('hotend-label');
    expect(splitButtons.length).toBe(2);
    expect(getComputedStyle(splitButtons[0]).display).toBe('flex');
    expect(splitButtons[0].getBoundingClientRect().width).toBe(
      splitButtons[1].getBoundingClientRect().width,
    );
    const actionButtons = Array.from(
      control.querySelectorAll('.p-splitbutton-button'),
    ) as HTMLElement[];
    expect(actionButtons[0].getBoundingClientRect().width).toBe(
      actionButtons[1].getBoundingClientRect().width,
    );
    const dropdownButtons = Array.from(
      control.querySelectorAll('.p-splitbutton-dropdown'),
    ) as HTMLElement[];
    actionButtons.forEach((button, index) => {
      const actionBounds = button.getBoundingClientRect();
      const dropdownBounds = dropdownButtons[index].getBoundingClientRect();
      expect(actionBounds.top).toBe(dropdownBounds.top);
      expect(actionBounds.bottom).toBe(dropdownBounds.bottom);
    });
    expect(control.querySelectorAll('.p-splitbutton-dropdown .pi-chevron-right').length).toBe(2);

    fixture.nativeElement.remove();
  });

  it('makes reset immediate and not reversible with cancel', () => {
    fixture.componentRef.setInput('initialAxisPoints', COMPLETE_POINTS);
    fixture.detectChanges();
    let reset: AxisPointResetEvent | undefined;
    component.axesReset.subscribe((value) => (reset = value));

    testable.toggleConfiguration();
    testable.resetAxes();
    testable.cancelConfiguration();

    expect(reset?.axisPoints).toEqual(EMPTY_AXIS_POINTS);
    expect(testable.points()).toEqual(EMPTY_AXIS_POINTS);
  });

  it('supports precise point placement with arrows and Enter', () => {
    fixture.detectChanges();
    testable.toggleConfiguration();
    testable.configureAxis('X');

    testable.onCanvasKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    testable.onCanvasKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true }));
    testable.onCanvasKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(testable.draftPoints().X.positive).toEqual({ x: 501, y: 510 });
  });

  it('does not create a visual point before the first touch', () => {
    fixture.detectChanges();
    testable.toggleConfiguration();
    testable.configureAxis('X');

    expect(testable.cursorPoint()).toBeNull();
    expect(testable.draftPoints().X).toEqual({ positive: null, negative: null });
    expect(testable.activePointHint()).toBe('Punkt +X');
  });

  it('uses the same positive-then-negative order for primary touch input', () => {
    fixture.detectChanges();
    testable.toggleConfiguration();
    testable.configureAxis('X');
    const touchEvent = (clientX: number, clientY: number) =>
      ({
        clientX,
        clientY,
        isPrimary: true,
        pointerType: 'touch',
        currentTarget: {
          getBoundingClientRect: () => ({
            left: 0,
            top: 0,
            width: 1000,
            height: 1000,
          }),
        },
      }) as unknown as PointerEvent;

    testable.onCanvasPointerDown(touchEvent(100, 200));

    expect(testable.draftPoints().X).toEqual({
      positive: { x: 100, y: 200 },
      negative: null,
    });
    expect(testable.activePointHint()).toBe('Punkt −X');

    testable.onCanvasPointerDown(touchEvent(300, 400));

    expect(testable.draftPoints().X).toEqual({
      positive: { x: 100, y: 200 },
      negative: { x: 300, y: 400 },
    });
    expect(testable.activePointHint()).toBeNull();
  });

  it('ignores additional non-primary touches', () => {
    fixture.detectChanges();
    testable.toggleConfiguration();
    testable.configureAxis('Y');

    testable.onCanvasPointerDown({ isPrimary: false } as PointerEvent);

    expect(testable.draftPoints().Y).toEqual({ positive: null, negative: null });
    expect(testable.activePointHint()).toBe('Punkt +Y');
  });

  it('uses the settings button to return to the panel without losing partial points', () => {
    fixture.detectChanges();
    testable.toggleConfiguration();
    testable.configureAxis('X');
    testable.onCanvasKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    testable.onCanvasKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    const partialPoints = structuredClone(testable.draftPoints());

    testable.toggleConfiguration();

    expect(testable.configurationOpen()).toBe(true);
    expect(testable.configurationPanelVisible()).toBe(true);
    expect(testable.draftPoints()).toEqual(partialPoints);
  });

  it('uses a unique generated id for every instance', () => {
    const secondFixture = TestBed.createComponent(PrinterNavigation);
    fixture.detectChanges();
    secondFixture.detectChanges();

    expect(component.instanceId()).not.toBe(secondFixture.componentInstance.instanceId());
  });

  it('does not render a redundant heading or change the browser title', () => {
    const initialTitle = document.title;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')).toBeNull();
    expect(document.title).toBe(initialTitle);
  });

  it('uses configured image and canvas dimensions independently of image size', () => {
    fixture.componentRef.setInput('viewport', {
      imageUrl: '/custom-printer.png',
      imageAlt: 'Custom printer',
      width: 800,
      height: 500,
      viewBox: { minX: 10, minY: 20, width: 1600, height: 1000 },
    });
    fixture.detectChanges();

    const canvas = fixture.nativeElement.querySelector('.printer-navigation') as HTMLElement;
    const image = fixture.nativeElement.querySelector('.printer-navigation__image') as HTMLImageElement;
    const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
    expect(canvas.style.getPropertyValue('--printer-canvas-width')).toBe('800px');
    expect(svg.getAttribute('viewBox')).toBe('10 20 1600 1000');
    expect(image.getAttribute('src')).toBe('/custom-printer.png');
    expect(image.getAttribute('alt')).toBe('Custom printer');
  });
});
