import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module';
import { PrinterControlsController } from './printer-controls.controller';

@Module({
  imports: [CommandsModule],
  controllers: [PrinterControlsController],
})
export class PrinterControlsModule {}
