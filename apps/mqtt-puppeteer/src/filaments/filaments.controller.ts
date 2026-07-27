import { Controller, Get, Param } from '@nestjs/common';
import { FilamentCatalogService } from './filament-catalog.service';

@Controller('filament')
export class FilamentsController {
  constructor(private readonly filaments: FilamentCatalogService) {}

  @Get('definitions')
  list() {
    return this.filaments.listResolved();
  }

  @Get('manufacturers/:manufacturer/definitions')
  listByManufacturer(@Param('manufacturer') manufacturer: string) {
    return this.filaments.listResolvedByManufacturer(manufacturer);
  }

  @Get('definitions/:id')
  get(@Param('id') id: string) {
    return this.filaments.getResolved(id);
  }
}
