import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { FilamentCatalogService } from './filament-catalog.service';

@ApiTags('filaments')
@Controller('filament')
export class FilamentsController {
  constructor(private readonly filaments: FilamentCatalogService) {}

  @Get('definitions')
  @ApiOperation({ summary: 'List every resolved filament definition' })
  @ApiOkResponse({ description: 'Resolved filament definitions.' })
  list() {
    return this.filaments.listResolved();
  }

  @Get('manufacturers/:manufacturer/definitions')
  @ApiOperation({ summary: 'List filament definitions for one manufacturer' })
  @ApiParam({ name: 'manufacturer', example: 'Bambulab' })
  @ApiOkResponse({ description: 'Resolved filament definitions.' })
  listByManufacturer(@Param('manufacturer') manufacturer: string) {
    return this.filaments.listResolvedByManufacturer(manufacturer);
  }

  @Get('definitions/:id')
  @ApiOperation({ summary: 'Get a single resolved filament definition' })
  @ApiParam({ name: 'id', example: 'bambu-lab-pla' })
  @ApiOkResponse({ description: 'Resolved filament definition.' })
  get(@Param('id') id: string) {
    return this.filaments.getResolved(id);
  }
}
