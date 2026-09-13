import { inject, Injectable } from '@angular/core';
import { CLOUDLESS_AUTH_CONFIG } from '../../core/cloudless-auth.config';

@Injectable({ providedIn: 'root' })
export class VideoServiceHubConfig {
  private readonly auth = inject(CLOUDLESS_AUTH_CONFIG);

  get baseUrl(): string {
    return this.auth.serviceUrls['video-service-hub'] || 'http://localhost:10322';
  }
}
