import { Module } from '@nestjs/common';
import { FilamentsModule } from '../filaments/filaments.module';
import { MqttTransportModule } from '../mqtt-transport/mqtt-transport.module';
import { CommandCatalogService } from './command-catalog.service';
import { CommandsController } from './commands.controller';

@Module({
  imports: [MqttTransportModule, FilamentsModule],
  controllers: [CommandsController],
  providers: [CommandCatalogService],
  exports: [CommandCatalogService],
})
export class CommandsModule {}
