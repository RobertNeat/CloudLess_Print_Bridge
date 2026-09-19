import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { MediaLibraryController } from './media-library.controller';
import { MediaLibraryService } from './media-library.service';

@Module({
  imports: [StorageModule, AuthModule],
  controllers: [MediaLibraryController],
  providers: [MediaLibraryService],
})
export class MediaLibraryModule {}
