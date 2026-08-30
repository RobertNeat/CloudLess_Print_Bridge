import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { OperationContextInterceptor } from './common/operation-context';
import { CommandsModule } from './commands/commands.module';
import { AppConfigModule } from './config/app-config.module';
import { BridgeEventsModule } from './events/bridge-events.module';
import { DeviceConfigModule } from './device-config/device-config.module';
import { FilamentOperationsModule } from './filament-operations/filament-operations.module';
import { FilamentsModule } from './filaments/filaments.module';
import { MqttTransportModule } from './mqtt-transport/mqtt-transport.module';
import { MovementModule } from './movement/movement.module';
import { PrintJobModule } from './print-job/print-job.module';
import { PrinterStateModule } from './printer-state/printer-state.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    AppConfigModule,
    AuthModule,
    BridgeEventsModule,
    FilamentsModule,
    PrinterStateModule,
    MqttTransportModule,
    CommandsModule,
    DeviceConfigModule,
    PrintJobModule,
    FilamentOperationsModule,
    MovementModule,
    RealtimeModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: OperationContextInterceptor },
  ],
})
export class AppModule {}
