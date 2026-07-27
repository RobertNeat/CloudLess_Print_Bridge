import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module';
import { MqttTransportModule } from '../mqtt-transport/mqtt-transport.module';
import { PrinterStateModule } from '../printer-state/printer-state.module';
import { PrinterGateway } from './printer.gateway';

@Module({
  imports: [CommandsModule, MqttTransportModule, PrinterStateModule],
  providers: [PrinterGateway],
})
export class RealtimeModule {}
