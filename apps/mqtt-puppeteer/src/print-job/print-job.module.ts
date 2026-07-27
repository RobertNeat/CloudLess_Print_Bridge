import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module';
import { PrintJobController } from './print-job.controller';

@Module({
  imports: [CommandsModule],
  controllers: [PrintJobController],
})
export class PrintJobModule {}
