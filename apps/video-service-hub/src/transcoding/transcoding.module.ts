import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { TranscodingService } from './transcoding.service';

@Module({
  imports: [StorageModule],
  providers: [TranscodingService],
  exports: [TranscodingService],
})
export class TranscodingModule {}
