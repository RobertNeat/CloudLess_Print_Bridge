import { inject, Injectable } from '@angular/core';
import { CLOUDLESS_AUTH_CONFIG } from '../../core/cloudless-auth.config';

@Injectable({ providedIn: 'root' })
export class MqttPuppeteerConfig {
  private readonly auth = inject(CLOUDLESS_AUTH_CONFIG);

  /**
   * Resolves the mqtt-puppeteer service URL, falling back to the hardcoded
   * default if the injected config does not provide one. This ensures a valid
   * absolute URL is always available for HTTP requests, even in development
   * where the config might be incomplete or misconfigured.
   */
  get baseUrl(): string {
    return this.auth.serviceUrls['mqtt-puppeteer'] || 'http://localhost:10320';
  }
}
