import { Module } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';
import { TelemetryHistoryService } from './telemetry-history.service';

@Module({
  controllers: [TelemetryController],
  providers: [TelemetryHistoryService],
  exports: [TelemetryHistoryService],
})
export class TelemetryModule {}
