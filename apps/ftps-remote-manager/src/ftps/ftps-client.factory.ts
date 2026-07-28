import { Inject, Injectable } from '@nestjs/common';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import { BambuFtpsAdapter } from './bambu-ftps.adapter';
import { BambuFtpsClient } from './bambu-ftps-client';
import type { RemoteStorageClient } from './remote-storage.client';

@Injectable()
export class FtpsClientFactory {
  constructor(@Inject(SERVICE_CONFIG) private readonly config: ServiceConfig) {}

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
        secureOptions: { rejectUnauthorized: false },
      },
      config.certificateFingerprint256,
    );
  }
}
