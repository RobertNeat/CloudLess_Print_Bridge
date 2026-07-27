import { Module } from '@nestjs/common';
import { FilamentsModule } from '../filaments/filaments.module';
import { MqttTransportModule } from '../mqtt-transport/mqtt-transport.module';
import { BambuLabA1CommandProfile } from '../printer-profiles/bambu-lab-a1/bambu-lab-a1-command.profile';
import { PRINTER_COMMAND_PROFILE } from '../printer-profiles/printer-command-profile';
import { CommandCatalogService } from './command-catalog.service';
import { CommandsController } from './commands.controller';

@Module({
  imports: [MqttTransportModule, FilamentsModule],
  controllers: [CommandsController],
  providers: [
    CommandCatalogService,
    {
      provide: PRINTER_COMMAND_PROFILE,
      useClass: BambuLabA1CommandProfile,
    },
  ],
  exports: [CommandCatalogService],
})
export class CommandsModule {}
