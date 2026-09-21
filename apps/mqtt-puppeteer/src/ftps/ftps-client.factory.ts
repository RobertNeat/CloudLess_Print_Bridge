import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { BambuFtpsAdapter } from './bambu-ftps.adapter';
import { BambuFtpsClient } from './bambu-ftps-client';
import type { RemoteStorageClient } from './remote-storage.client';

@Injectable()
export class FtpsClientFactory {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  create(): RemoteStorageClient {
    const config = this.config.ftps;
    return new BambuFtpsAdapter(
      new BambuFtpsClient(config.timeoutMs),
      {
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        secure: config.tlsMode === 'implicit' ? 'implicit' : true,
        // Bambu Lab printers use self-signed certificates, so the Node.js CA
        // chain check is disabled here. BambuFtpsClient.access() compensates
        // by pinning the exact SHA-256 fingerprint (config.certificateFingerprint256,
        // required and validated as 64 hex chars in app-config.ts) before
        // any credentials are sent, so trust is still cryptographically verified.
        // nosemgrep
        secureOptions: { rejectUnauthorized: false },
      },
      config.certificateFingerprint256,
    );
  }
}
