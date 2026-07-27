import { Module } from '@nestjs/common';
import { CommandsModule } from './commands/commands.module';
import { AppConfigModule } from './config/app-config.module';
import { BridgeEventsModule } from './events/bridge-events.module';
import { FilamentsModule } from './filaments/filaments.module';
import { MqttTransportModule } from './mqtt-transport/mqtt-transport.module';
import { PrinterStateModule } from './printer-state/printer-state.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    AppConfigModule,
    BridgeEventsModule,
    FilamentsModule,
    PrinterStateModule,
    MqttTransportModule,
    CommandsModule,
    RealtimeModule,
  ],
})
export class AppModule {}
