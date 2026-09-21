import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { I18nService, type TranslationKey, type TranslationParams } from './i18n.service';

/**
 * Thin wrapper over PrimeNG's MessageService/p-toast (mounted once in
 * app.html) so features can fire an info/warn/error notification without
 * touching MessageService or severities directly. Message text always comes
 * from I18nService, matching every other user-facing string in the app.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly messages = inject(MessageService);
  private readonly i18n = inject(I18nService);

  info(key: TranslationKey, params?: TranslationParams): void {
    this.show('info', key, params);
  }

  warn(key: TranslationKey, params?: TranslationParams): void {
    this.show('warn', key, params);
  }

  error(key: TranslationKey, params?: TranslationParams): void {
    this.show('error', key, params);
  }

  private show(severity: 'info' | 'warn' | 'error', key: TranslationKey, params?: TranslationParams): void {
    this.messages.add({ severity, detail: this.i18n.t(key, params), life: 4000 });
  }
}
