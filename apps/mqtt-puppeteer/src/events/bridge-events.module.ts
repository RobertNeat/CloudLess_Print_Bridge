import { Global, Module } from '@nestjs/common';
import { BridgeEventsService } from './bridge-events.service';

@Global()
@Module({
  providers: [BridgeEventsService],
  exports: [BridgeEventsService],
})
export class BridgeEventsModule {}
