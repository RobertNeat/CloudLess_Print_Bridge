import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CommandCatalogService } from '../commands/command-catalog.service';
import { OperationId } from '../common/operation-context';

@Controller('movement')
export class MovementController {
  constructor(private readonly commands: CommandCatalogService) {}

  @Post('absolute')
  @HttpCode(202)
  moveAbsolute(
    @Body() parameters: unknown,
    @OperationId() operationId: string,
  ) {
    return this.commands.execute('move-absolute', parameters, operationId);
  }

  @Post('absolute/simulate')
  @HttpCode(200)
  simulateAbsolute(
    @Body() parameters: unknown,
    @OperationId() operationId: string,
  ) {
    return this.commands.preview('move-absolute', parameters, operationId);
  }

  @Post('home')
  @HttpCode(202)
  home(@OperationId() operationId: string) {
    return this.commands.execute('home', {}, operationId);
  }

  @Post('extrude-relative')
  @HttpCode(202)
  extrudeRelative(
    @Body() parameters: unknown,
    @OperationId() operationId: string,
  ) {
    return this.commands.execute('extrude-relative', parameters, operationId);
  }
}
