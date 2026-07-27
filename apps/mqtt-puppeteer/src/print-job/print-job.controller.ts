import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CommandCatalogService } from '../commands/command-catalog.service';
import { OperationId } from '../common/operation-context';

@Controller('print_job')
export class PrintJobController {
  constructor(private readonly commands: CommandCatalogService) {}

  @Post('pause')
  @HttpCode(202)
  pause(@OperationId() operationId: string) {
    return this.commands.execute('pause-print', {}, operationId);
  }

  @Post('resume')
  @HttpCode(202)
  resume(@OperationId() operationId: string) {
    return this.commands.execute('resume-print', {}, operationId);
  }

  @Post('cancel')
  @HttpCode(202)
  cancel(@OperationId() operationId: string) {
    return this.commands.execute('cancel-print', {}, operationId);
  }

  @Post('speed')
  @HttpCode(202)
  setSpeed(@Body() parameters: unknown, @OperationId() operationId: string) {
    return this.commands.execute('set-print-speed', parameters, operationId);
  }
}
