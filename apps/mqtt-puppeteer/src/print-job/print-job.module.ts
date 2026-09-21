import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module';
import { FtpsModule } from '../ftps/ftps.module';
import { PrintJobController } from './print-job.controller';
import { PrintJobThumbnailService } from './print-job-thumbnail.service';

@Module({
  imports: [CommandsModule, FtpsModule],
  controllers: [PrintJobController],
  providers: [PrintJobThumbnailService],
  exports: [PrintJobThumbnailService],
})
export class PrintJobModule {}
