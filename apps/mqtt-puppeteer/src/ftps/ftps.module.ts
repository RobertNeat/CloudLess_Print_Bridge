import { Module } from '@nestjs/common';
import { FtpsClientFactory } from './ftps-client.factory';
import { FtpsSessionService } from './ftps-session.service';

@Module({
  providers: [FtpsClientFactory, FtpsSessionService],
  exports: [FtpsSessionService],
})
export class FtpsModule {}
