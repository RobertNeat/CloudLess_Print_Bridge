import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { TranscodingController } from './transcoding.controller';
import { TranscodingService } from './transcoding.service';

@Module({
  imports: [StorageModule, AuthModule],
  controllers: [TranscodingController],
  providers: [TranscodingService],
  exports: [TranscodingService],
})
export class TranscodingModule {}
