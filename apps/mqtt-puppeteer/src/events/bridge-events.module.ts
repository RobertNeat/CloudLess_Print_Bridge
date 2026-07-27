import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { BridgeEventsService } from './bridge-events.service';
import { ServiceExceptionFilter } from './service-exception.filter';

@Global()
@Module({
  providers: [
    BridgeEventsService,
    { provide: APP_FILTER, useClass: ServiceExceptionFilter },
  ],
  exports: [BridgeEventsService],
})
export class BridgeEventsModule {}
