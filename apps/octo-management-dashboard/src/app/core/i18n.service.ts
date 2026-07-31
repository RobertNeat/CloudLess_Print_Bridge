import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';

export type Language = 'pl' | 'en';

const messages = {
  pl: {
    dashboardSelector: 'Wybierz dashboard',
    management: 'Zarządzanie',
    files: 'Pliki',
    videos: 'Wideo',
    changeLanguage: 'Zmień język na angielski',
    toggleTheme: 'Przełącz tryb jasny lub ciemny',
  },
  en: {
    dashboardSelector: 'Select dashboard',
    management: 'Management',
    files: 'Files',
    videos: 'Videos',
    changeLanguage: 'Change language to Polish',
    toggleTheme: 'Switch between light and dark mode',
  },
} as const;

export type TranslationKey = keyof (typeof messages)['pl'];

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);
  readonly language = signal<Language>(this.readInitialLanguage());
  private readonly dictionary = computed(() => messages[this.language()]);

  constructor() {
    this.applyLanguage(this.language());
  }

  t(key: TranslationKey): string {
    return this.dictionary()[key];
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

  private readInitialLanguage(): Language {
    const stored = globalThis.localStorage?.getItem('octo-language');
    return stored === 'en' || stored === 'pl' ? stored : 'pl';
  }
}
