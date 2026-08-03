import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from './i18n.service';

@Component({
  selector: 'app-access-denied-page',
  imports: [RouterLink],
  template: `
    <main class="access-denied">
      <i class="pi pi-lock" aria-hidden="true"></i>
      <h1>{{ i18n.t('auth.deniedTitle') }}</h1>
      <p>{{ i18n.t('auth.deniedDescription') }}</p>
      <a routerLink="/management">{{ i18n.t('auth.backToApp') }}</a>
    </main>
  `,
  styles: `
    :host {
      display: grid;
      height: 100%;
      background: var(--semantic-surface-canvas);
      place-items: center;
    }
    .access-denied {
      max-width: 28rem;
      padding: 2rem;
      color: var(--semantic-text-primary);
      text-align: center;
    }
    i {
      color: var(--semantic-status-warning);
      font-size: 2.5rem;
    }
    h1 {
      margin: 1rem 0 0.5rem;
    }
    p {
      color: var(--semantic-text-muted);
    }
    a {
      display: inline-block;
      margin-top: 1rem;
      color: var(--semantic-accent-primary);
      font-weight: 650;
    }
  `,
})
export class AccessDeniedPage {
  protected readonly i18n = inject(I18nService);
}
