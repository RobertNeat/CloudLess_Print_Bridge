import {
  AxisRanges,
  Coordinates,
  PrinterAxis,
  PrinterAxisPoints,
  PrinterNavigationLabels,
  PrinterViewportConfig,
} from './printer-navigation.models';

export const PRINTER_AXES: readonly PrinterAxis[] = ['X', 'Y', 'Z'];

export const DEFAULT_COORDINATES: Coordinates = { X: 0, Y: 0, Z: 0 };

export const DEFAULT_AXIS_RANGES: AxisRanges = {
  X: { min: 0, max: 255 },
  Y: { min: 0, max: 255 },
  Z: { min: 0, max: 255 },
};

export const DEFAULT_STEPS: readonly number[] = [1, 10];

export const EMPTY_AXIS_POINTS: PrinterAxisPoints = {
  X: { positive: null, negative: null },
  Y: { positive: null, negative: null },
  Z: { positive: null, negative: null },
};

export const DEFAULT_VIEWPORT: PrinterViewportConfig = {
  imageUrl: '/images/A1_less_datails.png',
  imageAlt: 'Drukarka 3D',
  width: 680,
  height: 680,
  viewBox: { minX: 0, minY: 0, width: 1000, height: 1000 },
};

const directionSign = (direction: 'positive' | 'negative'): string =>
  direction === 'positive' ? '+' : '−';

export const DEFAULT_LABELS: PrinterNavigationLabels = {
  title: 'Sterowanie manualne',
  browserTitle: (title) => `${title} Component`,
  canvasAriaLabel: 'Drukarka 3D z interaktywnymi osiami sterowania',
  settingsAriaLabel: 'Konfiguruj położenie osi',
  backToConfigurationAriaLabel: 'Wróć do panelu konfiguracji osi',
  position: 'Pozycja',
  axis: 'oś',
  configurationTitle: 'Konfiguracja osi',
  chooseAxisInstruction: 'Wybierz oś X, Y lub Z, aby ustawić jej punkty.',
  selectPointInstruction: (axis, direction) =>
    `Wskaż punkt ${directionSign(direction)}${axis}. Użyj strzałek do dokładnego ustawienia i Enter, aby zatwierdzić.`,
  activePointHint: (axis, direction) => `Punkt ${directionSign(direction)}${axis}`,
  setAxis: (axis) => `Ustaw oś ${axis}`,
  setHotend: 'Ustaw głowicę',
  hotend: 'Głowica',
  hotendPointLabel: 'punkt hotendu',
  pointLabel: (axis, direction) => `punkt ${directionSign(direction)}${axis}`,
  configured: 'ustawiona',
  incomplete: 'niekompletna',
  mainStep: 'Główny krok przycisku',
  positionPanel: 'Pozycja okna',
  resetAxes: 'Resetuj osie',
  cancel: 'Anuluj',
  save: 'Zatwierdź',
  positionOptions: {
    'top-left': 'Lewy górny',
    'top-right': 'Prawy górny',
    'bottom-left': 'Lewy dolny',
    'bottom-right': 'Prawy dolny',
  },
  stepOption: (mainStep, alternativeSteps) =>
    `${mainStep}${alternativeSteps.length ? ` (menu: ${alternativeSteps.join(', ')})` : ''}`,
  alternativeStepAriaLabel: (axis, direction) =>
    `Inny krok ${direction === 'positive' ? 'dodatni' : 'ujemny'} osi ${axis}`,
  hotendStepAriaLabel: (direction) =>
    `Inny krok hotendu w kierunku ${direction === 'up' ? 'góra' : 'dół'}`,
};

