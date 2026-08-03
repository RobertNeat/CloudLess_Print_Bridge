import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';

export type Language = 'pl' | 'en';
export type TranslationParams = Readonly<Record<string, string | number>>;

const messages = {
  pl: {
    dashboardSelector: 'Wybierz dashboard',
    management: 'Zarządzanie',
    files: 'Pliki',
    videos: 'Wideo',
    changeLanguage: 'Zmień język na angielski',
    toggleTheme: 'Przełącz tryb jasny lub ciemny',
    mainNavigation: 'Główna nawigacja',
    'layout.reset': 'Przywróć oryginalny układ',
    'layout.confirm': 'Zatwierdź układ',
    'layout.edit': 'Edytuj układ',
    'layout.filesAria': 'Ustawienia kolumn dashboardu plików',
    'layout.dashboardAria': 'Ustawienia układu dashboardu',
    'layout.fileAreaWidth': 'Szerokość listy plików',
    'layout.fileAreaStandard': 'Standardowa',
    'layout.fileAreaWide': 'Szeroka',
    'layout.fileAreaMaximum': 'Maksymalna',
    'layout.detailsPosition': 'Położenie szczegółów',
    'layout.detailsRight': 'Po prawej',
    'layout.detailsLeft': 'Po lewej',
    'files.pinned': 'Przypięte',
    'files.pinned.models': 'Modele MD5',
    'files.pinned.cache': 'Pamięć podręczna',
    'files.pinned.logs': 'Logi drukarki',
    'files.section': 'Pliki',
    'files.treeAria': 'Drzewo plików',
    'files.breadcrumbsAria': 'Ścieżka folderu',
    'files.home': 'Home',
    'files.search': 'Szukaj w folderze',
    'files.sortName': 'Nazwa',
    'files.sortAscending': 'Sortuj rosnąco',
    'files.sortDescending': 'Sortuj malejąco',
    'files.count.one': '{{count}} plik',
    'files.count.few': '{{count}} pliki',
    'files.count.many': '{{count}} plików',
    'files.count.other': '{{count}} pliku',
    'files.emptyTitle': 'Brak pasujących plików',
    'files.emptyDescription': 'Zmień wyszukiwaną frazę.',
    'files.details': 'Szczegóły pliku',
    'files.previewAlt': 'Podgląd {{name}}',
    'files.previewModel': 'Podgląd modelu',
    'files.type': 'Typ',
    'files.size': 'Rozmiar',
    'files.modified': 'Zmodyfikowano',
    'files.metadata': 'Metadane modelu',
    'files.layers': 'Liczba warstw',
    'files.filamentDensity': 'Gęstość filamentu',
    'files.filamentDiameter': 'Średnica filamentu',
    'files.dimensions': 'Wymiary maks.',
    'files.filamentLength': 'Długość filamentu',
    'files.estimatedCost': 'Szacowany koszt',
    'files.estimatedTime': 'Szacowany czas',
    'files.chooseFile': 'Wybierz plik',
    'files.noSelection': 'Tu pojawi się podgląd i metadane.',
    'files.uploadTo': 'Prześlij do lokalizacji',
    'files.dropHere': 'Upuść pliki tutaj',
    'files.browse': 'lub kliknij, aby przeglądać',
    'files.maxSize': 'Maksymalnie 5 GB na plik',
    'files.loading': 'Ładowanie plików…',
    'files.loadError': 'Nie udało się wczytać danych plików.',
    'files.actions.open': 'Otwórz działania dla pliku {{name}}',
    'files.actions.download': 'Pobierz',
    'files.actions.rename': 'Zmień nazwę',
    'files.actions.move': 'Przenieś',
    'files.actions.delete': 'Usuń',
    'files.operationUnavailable': 'Operacja „{{action}}” będzie dostępna po podłączeniu usługi FTPS.',
    'files.operationDenied': 'Nie masz uprawnień do wykonania tej operacji.',
    'files.uploadUnavailable': 'Wybór pliku będzie dostępny po podłączeniu usługi FTPS.',
    'auth.deniedTitle': 'Brak dostępu',
    'auth.deniedDescription': 'Nie masz uprawnień do wyświetlenia tej strony.',
    'auth.backToApp': 'Wróć do aplikacji',
    'dashboard.drag': 'Przeciągnij, aby przenieść',
    'dashboard.widgetMoveAria': 'Przenieś widżet {{id}} klawiszami strzałek',
    'dashboard.loadError': 'Nie udało się wczytać danych dashboardu.',
    'dashboard.loading': 'Ładowanie dashboardu…',
    'dashboard.commandError': 'Nie udało się wykonać operacji.',
    'printJob.current': 'Aktualne zadanie',
    'printJob.progress': 'Postęp',
    'printJob.progressAria': 'Postęp wydruku',
    'printJob.layers': 'Warstwy',
    'printJob.remaining': 'Pozostało',
    'printJob.resume': 'Wznów',
    'printJob.pause': 'Pauza',
    'printJob.stop': 'Zatrzymaj',
    'printJob.status.printing': 'Drukowanie',
    'printJob.status.paused': 'Wstrzymano',
    'printJob.status.completed': 'Zakończono',
    'printJob.status.cancelled': 'Anulowano',
    'printJob.status.error': 'Błąd',
    'controls.aria': 'Szybkie sterowanie drukarką',
    'controls.light': 'Oświetlenie',
    'controls.lightOnAria': 'Wyłącz oświetlenie',
    'controls.lightOffAria': 'Włącz oświetlenie',
    'controls.fans': 'Wentylatory',
    'controls.printSpeed': 'Prędkość druku',
    'controls.on': 'Włączone',
    'controls.off': 'Wyłączone',
    'controls.speed': 'Prędkość',
    'controls.fanSpeedAria': 'Prędkość wentylatorów',
    'controls.speedGroupAria': 'Tryb prędkości druku',
    'controls.speed.silent': 'Cichy',
    'controls.speed.standard': 'Standard',
    'controls.speed.sport': 'Sport',
    'controls.speed.ludicrous': 'Szalony',
    'temperatures.aria': 'Temperatury drukarki',
    'temperatures.chamber': 'Komora',
    'temperatures.bed': 'Stół',
    'temperatures.nozzle': 'Dysza',
    'temperatures.edit': 'Ustaw temperaturę: {{name}}',
    'temperatures.value': 'Temperatura docelowa',
    'temperatures.save': 'Zatwierdź',
    'live.resolutionAria': 'Rozdzielczość podglądu',
    'live.stop': 'Zatrzymaj',
    'live.start': 'Uruchom',
    'live.imageAlt': 'Podgląd z kamery drukarki',
    'live.offAria': 'Kamera drukarki jest wyłączona',
    'navigation.canvasAria': 'Drukarka 3D z interaktywnymi osiami sterowania',
    'navigation.settingsAria': 'Konfiguruj położenie osi',
    'navigation.backAria': 'Wróć do panelu konfiguracji osi',
    'navigation.position': 'Pozycja',
    'navigation.axis': 'oś',
    'navigation.configuration': 'Konfiguracja osi',
    'navigation.chooseAxis': 'Wybierz oś X, Y lub Z, aby ustawić jej punkty.',
    'navigation.selectPoint': 'Wskaż punkt {{direction}}{{axis}}. Użyj strzałek do dokładnego ustawienia i Enter, aby zatwierdzić.',
    'navigation.point': 'Punkt {{direction}}{{axis}}',
    'navigation.setAxis': 'Ustaw oś {{axis}}',
    'navigation.setHotend': 'Ustaw głowicę',
    'navigation.hotend': 'Głowica',
    'navigation.hotendPoint': 'punkt hotendu',
    'navigation.configured': 'ustawiona',
    'navigation.incomplete': 'niekompletna',
    'navigation.mainStep': 'Główny krok przycisku',
    'navigation.panelPosition': 'Pozycja okna',
    'navigation.reset': 'Resetuj osie',
    'navigation.cancel': 'Anuluj',
    'navigation.save': 'Zatwierdź',
    'navigation.topLeft': 'Lewy górny',
    'navigation.topRight': 'Prawy górny',
    'navigation.bottomLeft': 'Lewy dolny',
    'navigation.bottomRight': 'Prawy dolny',
    'navigation.alternativeStep': 'Inny krok {{direction}} osi {{axis}}',
    'navigation.hotendStep': 'Inny krok hotendu w kierunku {{direction}}',
    'chart.timeTooltip': 'Czas: {{value}} min',
    'chart.progress.title': 'Postęp wydruku',
    'chart.progress.subtitle': 'Postęp zadania w czasie',
    'chart.temperature.title': 'Temperatura bieżąca vs docelowa',
    'chart.temperature.subtitle': 'Komora, dysza i stół grzewczy',
    'chart.fan.title': 'Prędkość wentylatorów',
    'chart.fan.subtitle': 'Wentylatory urządzenia',
    'chart.axis.time': 'Czas [min]',
    'chart.axis.progress': 'Postęp [%]',
    'chart.axis.temperature': 'Temperatura [°C]',
    'chart.axis.fan': 'Prędkość wentylatora [%]',
    'chart.series.progress': 'Postęp',
    'chart.series.chamberTarget': 'Komora — zadana',
    'chart.series.chamberCurrent': 'Komora — aktualna',
    'chart.series.nozzleTarget': 'Dysza — zadana',
    'chart.series.nozzleCurrent': 'Dysza — aktualna',
    'chart.series.bedTarget': 'Stół grzewczy — zadana',
    'chart.series.bedCurrent': 'Stół grzewczy — aktualna',
    'chart.series.auxFan': 'Wentylator pomocniczy',
    'chart.series.partFan': 'Chłodzenie modelu',
    'chart.series.chamberFan': 'Wentylator komory',
  },
  en: {
    dashboardSelector: 'Select dashboard',
    management: 'Management',
    files: 'Files',
    videos: 'Videos',
    changeLanguage: 'Change language to Polish',
    toggleTheme: 'Switch between light and dark mode',
    mainNavigation: 'Main navigation',
    'layout.reset': 'Restore original layout',
    'layout.confirm': 'Apply layout',
    'layout.edit': 'Edit layout',
    'layout.filesAria': 'File dashboard column settings',
    'layout.dashboardAria': 'Dashboard layout settings',
    'layout.fileAreaWidth': 'File list width',
    'layout.fileAreaStandard': 'Standard',
    'layout.fileAreaWide': 'Wide',
    'layout.fileAreaMaximum': 'Maximum',
    'layout.detailsPosition': 'Details position',
    'layout.detailsRight': 'On the right',
    'layout.detailsLeft': 'On the left',
    'files.pinned': 'Pinned',
    'files.pinned.models': 'MD5 models',
    'files.pinned.cache': 'Cache',
    'files.pinned.logs': 'Printer logs',
    'files.section': 'Files',
    'files.treeAria': 'File tree',
    'files.breadcrumbsAria': 'Folder path',
    'files.home': 'Home',
    'files.search': 'Search this folder',
    'files.sortName': 'Name',
    'files.sortAscending': 'Sort ascending',
    'files.sortDescending': 'Sort descending',
    'files.count.one': '{{count}} file',
    'files.count.few': '{{count}} files',
    'files.count.many': '{{count}} files',
    'files.count.other': '{{count}} files',
    'files.emptyTitle': 'No matching files',
    'files.emptyDescription': 'Try a different search phrase.',
    'files.details': 'File details',
    'files.previewAlt': '{{name}} preview',
    'files.previewModel': 'Model preview',
    'files.type': 'Type',
    'files.size': 'Size',
    'files.modified': 'Modified',
    'files.metadata': 'Model metadata',
    'files.layers': 'Layer count',
    'files.filamentDensity': 'Filament density',
    'files.filamentDiameter': 'Filament diameter',
    'files.dimensions': 'Maximum dimensions',
    'files.filamentLength': 'Filament length',
    'files.estimatedCost': 'Estimated cost',
    'files.estimatedTime': 'Estimated time',
    'files.chooseFile': 'Select a file',
    'files.noSelection': 'The preview and metadata will appear here.',
    'files.uploadTo': 'Upload to location',
    'files.dropHere': 'Drop files here',
    'files.browse': 'or click to browse',
    'files.maxSize': 'Maximum 5 GB per file',
    'files.loading': 'Loading files…',
    'files.loadError': 'File data could not be loaded.',
    'files.actions.open': 'Open actions for {{name}}',
    'files.actions.download': 'Download',
    'files.actions.rename': 'Rename',
    'files.actions.move': 'Move',
    'files.actions.delete': 'Delete',
    'files.operationUnavailable': '“{{action}}” will be available after the FTPS service is connected.',
    'files.operationDenied': 'You do not have permission to perform this operation.',
    'files.uploadUnavailable': 'File selection will be available after the FTPS service is connected.',
    'auth.deniedTitle': 'Access denied',
    'auth.deniedDescription': 'You do not have permission to view this page.',
    'auth.backToApp': 'Back to the application',
    'dashboard.drag': 'Drag to move',
    'dashboard.widgetMoveAria': 'Move widget {{id}} with arrow keys',
    'dashboard.loadError': 'Dashboard data could not be loaded.',
    'dashboard.loading': 'Loading dashboard…',
    'dashboard.commandError': 'The operation could not be completed.',
    'printJob.current': 'Current job',
    'printJob.progress': 'Progress',
    'printJob.progressAria': 'Print progress',
    'printJob.layers': 'Layers',
    'printJob.remaining': 'Remaining',
    'printJob.resume': 'Resume',
    'printJob.pause': 'Pause',
    'printJob.stop': 'Stop',
    'printJob.status.printing': 'Printing',
    'printJob.status.paused': 'Paused',
    'printJob.status.completed': 'Completed',
    'printJob.status.cancelled': 'Cancelled',
    'printJob.status.error': 'Error',
    'controls.aria': 'Printer quick controls',
    'controls.light': 'Lighting',
    'controls.lightOnAria': 'Turn lighting off',
    'controls.lightOffAria': 'Turn lighting on',
    'controls.fans': 'Fans',
    'controls.printSpeed': 'Print speed',
    'controls.on': 'On',
    'controls.off': 'Off',
    'controls.speed': 'Speed',
    'controls.fanSpeedAria': 'Fan speed',
    'controls.speedGroupAria': 'Print speed mode',
    'controls.speed.silent': 'Silent',
    'controls.speed.standard': 'Standard',
    'controls.speed.sport': 'Sport',
    'controls.speed.ludicrous': 'Ludicrous',
    'temperatures.aria': 'Printer temperatures',
    'temperatures.chamber': 'Chamber',
    'temperatures.bed': 'Bed',
    'temperatures.nozzle': 'Nozzle',
    'temperatures.edit': 'Set temperature: {{name}}',
    'temperatures.value': 'Target temperature',
    'temperatures.save': 'Apply',
    'live.resolutionAria': 'Preview resolution',
    'live.stop': 'Stop',
    'live.start': 'Start',
    'live.imageAlt': 'Printer camera preview',
    'live.offAria': 'The printer camera is off',
    'navigation.canvasAria': '3D printer with interactive movement axes',
    'navigation.settingsAria': 'Configure axis placement',
    'navigation.backAria': 'Return to the axis configuration panel',
    'navigation.position': 'Position',
    'navigation.axis': 'axis',
    'navigation.configuration': 'Axis configuration',
    'navigation.chooseAxis': 'Choose the X, Y or Z axis to set its points.',
    'navigation.selectPoint': 'Select point {{direction}}{{axis}}. Use arrow keys for precision and Enter to confirm.',
    'navigation.point': 'Point {{direction}}{{axis}}',
    'navigation.setAxis': 'Set axis {{axis}}',
    'navigation.setHotend': 'Set hotend',
    'navigation.hotend': 'Hotend',
    'navigation.hotendPoint': 'hotend point',
    'navigation.configured': 'configured',
    'navigation.incomplete': 'incomplete',
    'navigation.mainStep': 'Primary button step',
    'navigation.panelPosition': 'Panel position',
    'navigation.reset': 'Reset axes',
    'navigation.cancel': 'Cancel',
    'navigation.save': 'Apply',
    'navigation.topLeft': 'Top left',
    'navigation.topRight': 'Top right',
    'navigation.bottomLeft': 'Bottom left',
    'navigation.bottomRight': 'Bottom right',
    'navigation.alternativeStep': 'Alternative {{direction}} step for axis {{axis}}',
    'navigation.hotendStep': 'Alternative hotend step towards {{direction}}',
    'chart.timeTooltip': 'Time: {{value}} min',
    'chart.progress.title': 'Print progress',
    'chart.progress.subtitle': 'Job progress over time',
    'chart.temperature.title': 'Current vs target temperature',
    'chart.temperature.subtitle': 'Chamber, nozzle and heated bed',
    'chart.fan.title': 'Fan speed',
    'chart.fan.subtitle': 'Device fans',
    'chart.axis.time': 'Time [min]',
    'chart.axis.progress': 'Progress [%]',
    'chart.axis.temperature': 'Temperature [°C]',
    'chart.axis.fan': 'Fan speed [%]',
    'chart.series.progress': 'Progress',
    'chart.series.chamberTarget': 'Chamber — target',
    'chart.series.chamberCurrent': 'Chamber — current',
    'chart.series.nozzleTarget': 'Nozzle — target',
    'chart.series.nozzleCurrent': 'Nozzle — current',
    'chart.series.bedTarget': 'Heated bed — target',
    'chart.series.bedCurrent': 'Heated bed — current',
    'chart.series.auxFan': 'Aux fan',
    'chart.series.partFan': 'Part cooling fan',
    'chart.series.chamberFan': 'Chamber fan',
  },
} as const;

export type TranslationKey = keyof (typeof messages)['pl'];

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);
  readonly language = signal<Language>(this.readInitialLanguage());
  private readonly dictionary = computed<Record<TranslationKey, string>>(
    () => messages[this.language()],
  );

  constructor() {
    this.applyLanguage(this.language());
  }

  t(key: TranslationKey, params: TranslationParams = {}): string {
    return this.dictionary()[key].replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      String(params[name] ?? `{{${name}}}`),
    );
  }

  plural(
    keys: Readonly<Partial<Record<Intl.LDMLPluralRule, TranslationKey>>> & {
      readonly other: TranslationKey;
    },
    count: number,
    params: TranslationParams = {},
  ): string {
    const rule = new Intl.PluralRules(this.locale()).select(count);
    return this.t(keys[rule] ?? keys.other, { count, ...params });
  }

  formatNumber(value: number, maximumFractionDigits = 2): string {
    return new Intl.NumberFormat(this.locale(), { maximumFractionDigits }).format(value);
  }

  formatDateTime(value: string): string {
    return new Intl.DateTimeFormat(this.locale(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${this.formatNumber(bytes / 1024 ** unitIndex, 1)} ${units[unitIndex]}`;
  }

  formatCurrency(value: number, currency = 'PLN'): string {
    return new Intl.NumberFormat(this.locale(), { style: 'currency', currency }).format(value);
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    const parts: string[] = [];
    if (hours) {
      parts.push(
        new Intl.NumberFormat(this.locale(), { style: 'unit', unit: 'hour', unitDisplay: 'short' }).format(
          hours,
        ),
      );
    }
    if (minutes || !hours) {
      parts.push(
        new Intl.NumberFormat(this.locale(), {
          style: 'unit',
          unit: 'minute',
          unitDisplay: 'short',
        }).format(minutes),
      );
    }
    return parts.join(' ');
  }

  toggleLanguage(): void {
    const language: Language = this.language() === 'pl' ? 'en' : 'pl';
    this.language.set(language);
    this.applyLanguage(language);
    globalThis.localStorage?.setItem('octo-language', language);
  }

  private applyLanguage(language: Language): void {
    this.document.documentElement.lang = language;
  }

  private locale(): string {
    return this.language() === 'pl' ? 'pl-PL' : 'en-US';
  }

  private readInitialLanguage(): Language {
    const stored = globalThis.localStorage?.getItem('octo-language');
    return stored === 'en' || stored === 'pl' ? stored : 'pl';
  }
}
