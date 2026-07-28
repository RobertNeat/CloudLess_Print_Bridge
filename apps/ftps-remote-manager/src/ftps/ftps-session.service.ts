import { Inject, Injectable } from '@nestjs/common';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import { AsyncSemaphore } from './async-semaphore';
import { FtpsClientFactory } from './ftps-client.factory';
import type { RemoteStorageClient } from './remote-storage.client';
import {
  RemoteStorageOperationError,
  type RemoteStorageOperation,
} from './remote-storage.errors';

@Injectable()
export class FtpsSessionService {
  private readonly semaphore: AsyncSemaphore;

  constructor(
    private readonly clients: FtpsClientFactory,
    @Inject(SERVICE_CONFIG) config: ServiceConfig,
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
