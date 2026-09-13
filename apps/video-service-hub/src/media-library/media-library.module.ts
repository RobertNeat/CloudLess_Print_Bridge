import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { MediaLibraryController } from './media-library.controller';
import { MediaLibraryService } from './media-library.service';

@Module({
  imports: [StorageModule],
  controllers: [MediaLibraryController],
  providers: [MediaLibraryService],
})
export class MediaLibraryModule {}
