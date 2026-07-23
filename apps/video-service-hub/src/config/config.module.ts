import { Global, Module } from '@nestjs/common';
import { loadServiceConfig, type ServiceConfig } from './service-config';

export const SERVICE_CONFIG = Symbol('SERVICE_CONFIG');

@Global()
@Module({
  providers: [
    {
      provide: SERVICE_CONFIG,
      useFactory: (): ServiceConfig => loadServiceConfig(),
    },
  ],
  exports: [SERVICE_CONFIG],
})
export class ConfigModule {}
