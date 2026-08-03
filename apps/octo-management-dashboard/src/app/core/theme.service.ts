import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';

type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly theme = signal<Theme>(this.readInitialTheme());
  readonly isDark = computed(() => this.theme() === 'dark');

  constructor() {
    this.applyTheme(this.theme());
  }

  toggle(): void {
    const theme: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.applyTheme(theme);
    this.theme.set(theme);
    globalThis.localStorage?.setItem('octo-theme', theme);
  }

  private applyTheme(theme: Theme): void {
    this.document.documentElement.classList.toggle('app-dark', theme === 'dark');
    this.document.documentElement.style.colorScheme = theme;
  }

  private readInitialTheme(): Theme {
    const stored = globalThis.localStorage?.getItem('octo-theme');
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }

    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
