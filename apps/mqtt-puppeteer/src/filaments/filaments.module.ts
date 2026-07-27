import { Module } from '@nestjs/common';
import { FilamentCatalogService } from './filament-catalog.service';
import { FilamentsController } from './filaments.controller';

@Module({
  controllers: [FilamentsController],
  providers: [FilamentCatalogService],
  exports: [FilamentCatalogService],
})
export class FilamentsModule {}
