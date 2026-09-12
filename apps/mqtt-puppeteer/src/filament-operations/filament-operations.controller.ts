import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandCatalogService } from '../commands/command-catalog.service';
import { OperationId } from '../common/operation-context';

@ApiTags('filament-operations')
@Controller('filament')
export class FilamentOperationsController {
  constructor(private readonly commands: CommandCatalogService) {}

  @Post('load')
  @HttpCode(202)
  @ApiOperation({ summary: 'Load filament from an AMS slot or external spool' })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  load(@Body() parameters: unknown, @OperationId() operationId: string) {
    return this.commands.execute('load-filament', parameters, operationId);
  }

  @Post('unload')
  @HttpCode(202)
  @ApiOperation({ summary: 'Unload the currently loaded filament' })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  unload(@OperationId() operationId: string) {
    return this.commands.execute('unload-filament', {}, operationId);
  }

  @Post('define')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Assign a filament definition to an AMS slot or external spool',
  })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  define(@Body() parameters: unknown, @OperationId() operationId: string) {
    return this.commands.execute('set-filament', parameters, operationId);
  }
}
