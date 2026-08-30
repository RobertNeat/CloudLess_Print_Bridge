import type { I18nService } from '../../core/i18n.service';
import type {
  AxisDirection,
  HotendDirection,
  PrinterNavigationLabels,
} from './printer-navigation.models';

const sign = (direction: AxisDirection): string => (direction === 'positive' ? '+' : '−');

export function createPrinterNavigationLabels(i18n: I18nService): PrinterNavigationLabels {
  const directionName = (direction: AxisDirection): string => {
    if (i18n.language() === 'en') return direction === 'positive' ? 'positive' : 'negative';
    return direction === 'positive' ? 'dodatni' : 'ujemny';
  };
  const hotendDirection = (direction: HotendDirection): string => {
    if (i18n.language() === 'en') return direction === 'up' ? 'up' : 'down';
    return direction === 'up' ? 'góra' : 'dół';
  };

  return {
    canvasAriaLabel: i18n.t('navigation.canvasAria'),
    settingsAriaLabel: i18n.t('navigation.settingsAria'),
    backToConfigurationAriaLabel: i18n.t('navigation.backAria'),
    position: i18n.t('navigation.position'),
    axis: i18n.t('navigation.axis'),
    configurationTitle: i18n.t('navigation.configuration'),
    chooseAxisInstruction: i18n.t('navigation.chooseAxis'),
    selectPointInstruction: (axis, direction) =>
      i18n.t('navigation.selectPoint', { axis, direction: sign(direction) }),
    activePointHint: (axis, direction) =>
      i18n.t('navigation.point', { axis, direction: sign(direction) }),
    setAxis: (axis) => i18n.t('navigation.setAxis', { axis }),
    setHotend: i18n.t('navigation.setHotend'),
    hotend: i18n.t('navigation.hotend'),
    hotendPointLabel: i18n.t('navigation.hotendPoint'),
    pointLabel: (axis, direction) =>
      i18n
        .t('navigation.point', { axis, direction: sign(direction) })
        .toLocaleLowerCase(i18n.language()),
    configured: i18n.t('navigation.configured'),
    incomplete: i18n.t('navigation.incomplete'),
    mainStep: i18n.t('navigation.mainStep'),
    positionPanel: i18n.t('navigation.panelPosition'),
    resetAxes: i18n.t('navigation.reset'),
    cancel: i18n.t('navigation.cancel'),
    save: i18n.t('navigation.save'),
    positionOptions: {
      'top-left': i18n.t('navigation.topLeft'),
      'top-right': i18n.t('navigation.topRight'),
      'bottom-left': i18n.t('navigation.bottomLeft'),
      'bottom-right': i18n.t('navigation.bottomRight'),
    },
    stepOption: (mainStep, alternativeSteps) =>
      `${mainStep}${alternativeSteps.length ? ` (${alternativeSteps.join(', ')})` : ''}`,
    alternativeStepAriaLabel: (axis, direction) =>
      i18n.t('navigation.alternativeStep', { axis, direction: directionName(direction) }),
    hotendStepAriaLabel: (direction) =>
      i18n.t('navigation.hotendStep', { direction: hotendDirection(direction) }),
  };
}
