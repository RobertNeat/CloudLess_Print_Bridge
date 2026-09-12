import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CommandCatalogService } from '../commands/command-catalog.service';
import { OperationId } from '../common/operation-context';

@ApiTags('print-job')
@Controller('print_job')
export class PrintJobController {
  constructor(private readonly commands: CommandCatalogService) {}

  @Post('pause')
  @HttpCode(202)
  @ApiOperation({ summary: 'Pause the current print job' })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  pause(@OperationId() operationId: string) {
    return this.commands.execute('pause-print', {}, operationId);
  }

  @Post('resume')
  @HttpCode(202)
  @ApiOperation({ summary: 'Resume the current print job' })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  resume(@OperationId() operationId: string) {
    return this.commands.execute('resume-print', {}, operationId);
  }

  @Post('cancel')
  @HttpCode(202)
  @ApiOperation({ summary: 'Cancel the current print job' })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  cancel(@OperationId() operationId: string) {
    return this.commands.execute('cancel-print', {}, operationId);
  }

  @Post('speed')
  @HttpCode(202)
  @ApiOperation({ summary: 'Set the speed mode of the current print job' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: {
          type: 'string',
          enum: ['silent', 'standard', 'sport', 'ludicrous'],
          example: 'standard',
        },
      },
    },
  })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  setSpeed(@Body() parameters: unknown, @OperationId() operationId: string) {
    return this.commands.execute('set-print-speed', parameters, operationId);
  }
}
