import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { AsyncSemaphore } from './async-semaphore';
import { FtpsClientFactory } from './ftps-client.factory';
import type { RemoteStorageClient } from './remote-storage.client';
import {
  RemoteStorageOperationError,
  type RemoteStorageOperation,
} from './remote-storage.errors';

/**
 * Serializes FTPS sessions against the printer's embedded FTP server, which
 * is shared with ftps-remote-manager (a separate, independently-running
 * service) and does not reliably support multiple concurrent clients. One
 * session at a time per service is the safe default; see maximumConcurrentSessions.
 */
@Injectable()
export class FtpsSessionService {
  private readonly semaphore: AsyncSemaphore;

  constructor(
    private readonly clients: FtpsClientFactory,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.semaphore = new AsyncSemaphore(config.ftps.maximumConcurrentSessions);
  }

  execute<T>(
    operationName: RemoteStorageOperation,
    operation: (client: RemoteStorageClient) => Promise<T>,
  ): Promise<T> {
    return this.semaphore.run(() =>
      this.executeSession(operationName, operation),
    );
  }

  private async executeSession<T>(
    operationName: RemoteStorageOperation,
    operation: (client: RemoteStorageClient) => Promise<T>,
  ): Promise<T> {
    const client = this.clients.create();
    try {
      await client.connect();
      return await operation(client);
    } catch (error) {
      if (error instanceof RemoteStorageOperationError) throw error;
      throw new RemoteStorageOperationError('unavailable', operationName, {
        cause: error,
      });
    } finally {
      client.close();
    }
  }
}
