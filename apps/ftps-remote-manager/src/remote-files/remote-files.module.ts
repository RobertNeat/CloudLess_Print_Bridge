import { Module } from '@nestjs/common';
import { FtpsModule } from '../ftps/ftps.module';
import { RemoteFileController } from './remote-file.controller';
import { RemoteFileService } from './remote-file.service';
import { RemoteFilesExceptionFilter } from './remote-files-exception.filter';

@Module({
  imports: [FtpsModule],
  controllers: [RemoteFileController],
  providers: [RemoteFileService, RemoteFilesExceptionFilter],
})
export class RemoteFilesModule {}
