import { Module } from '@nestjs/common';
import { MqttTransportModule } from '../mqtt-transport/mqtt-transport.module';
import { PrinterStateModule } from '../printer-state/printer-state.module';
import { PrinterGateway } from './printer.gateway';

@Module({
  imports: [MqttTransportModule, PrinterStateModule],
  providers: [PrinterGateway],
})
export class RealtimeModule {}
