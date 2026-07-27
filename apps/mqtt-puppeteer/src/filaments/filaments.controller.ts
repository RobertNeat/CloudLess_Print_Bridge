import { Controller, Get, Param } from '@nestjs/common';
import { FilamentCatalogService } from './filament-catalog.service';

@Controller('filaments')
export class FilamentsController {
  constructor(private readonly filaments: FilamentCatalogService) {}

  @Get()
  list() {
    return this.filaments.listResolved();
  }

  @Get('catalog')
  getCatalog() {
    return this.filaments.getCatalog();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.filaments.getResolved(id);
  }
}
