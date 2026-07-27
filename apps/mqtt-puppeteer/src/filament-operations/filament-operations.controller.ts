import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CommandCatalogService } from '../commands/command-catalog.service';
import { OperationId } from '../common/operation-context';

@Controller('filament')
export class FilamentOperationsController {
  constructor(private readonly commands: CommandCatalogService) {}

  @Post('load')
  @HttpCode(202)
  load(@Body() parameters: unknown, @OperationId() operationId: string) {
    return this.commands.execute('load-filament', parameters, operationId);
  }

  @Post('unload')
  @HttpCode(202)
  unload(@OperationId() operationId: string) {
    return this.commands.execute('unload-filament', {}, operationId);
  }

  @Post('define')
  @HttpCode(202)
  define(@Body() parameters: unknown, @OperationId() operationId: string) {
    return this.commands.execute('set-filament', parameters, operationId);
  }
}
