import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { FtpsModule } from './ftps/ftps.module';
import { RemoteFilesModule } from './remote-files/remote-files.module';

@Module({
  imports: [ConfigModule, FtpsModule, RemoteFilesModule],
})
export class AppModule {}
