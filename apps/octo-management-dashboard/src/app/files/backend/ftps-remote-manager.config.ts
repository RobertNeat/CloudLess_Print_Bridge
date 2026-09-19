import { inject, Injectable } from '@angular/core';
import { CLOUDLESS_AUTH_CONFIG } from '../../core/cloudless-auth.config';

@Injectable({ providedIn: 'root' })
export class FtpsRemoteManagerConfig {
  private readonly auth = inject(CLOUDLESS_AUTH_CONFIG);

  get baseUrl(): string {
    return this.auth.serviceUrls['ftps-remote-manager'] || 'http://localhost:10321';
  }
}
