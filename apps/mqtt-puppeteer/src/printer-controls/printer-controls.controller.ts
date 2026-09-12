import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CommandCatalogService } from '../commands/command-catalog.service';
import { OperationId } from '../common/operation-context';

/**
 * Thin, dashboard-shaped REST surface over the generic command catalog for
 * the quick-controls and temperature widgets. Every route here just forwards
 * to CommandCatalogService.execute() with an existing catalog command id, so
 * it carries no printer-model knowledge of its own — the active
 * PrinterCommandProfile still owns command shape, parameter bounds, and
 * safety checks.
 */
@ApiTags('printer-controls')
@Controller('printer-controls')
export class PrinterControlsController {
  constructor(private readonly commands: CommandCatalogService) {}

  @Post('light')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Turn the chamber light on or off',
    description: 'Routes to the `set-light` catalog command.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['enabled'],
      properties: { enabled: { type: 'boolean', example: true } },
    },
  })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  setLight(@Body() parameters: unknown, @OperationId() operationId: string) {
    return this.commands.execute('set-light', parameters, operationId);
  }

  @Post('fan')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Set the part cooling fan speed',
    description: 'Routes to the `set-part-fan` catalog command (0-100%).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['percent'],
      properties: {
        percent: { type: 'number', minimum: 0, maximum: 100, example: 50 },
      },
    },
  })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  setFan(@Body() parameters: unknown, @OperationId() operationId: string) {
    return this.commands.execute('set-part-fan', parameters, operationId);
  }

  @Post('print-speed')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Set the active print speed mode',
    description: 'Routes to the `set-print-speed` catalog command.',
  })
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
  setPrintSpeed(
    @Body() parameters: unknown,
    @OperationId() operationId: string,
  ) {
    return this.commands.execute('set-print-speed', parameters, operationId);
  }

  @Post('temperature/bed')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Set the build plate target temperature',
    description: 'Routes to the `set-bed-temperature` catalog command.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['celsius'],
      properties: {
        celsius: { type: 'number', minimum: 0, maximum: 120, example: 55 },
      },
    },
  })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  setBedTemperature(
    @Body() parameters: unknown,
    @OperationId() operationId: string,
  ) {
    return this.commands.execute(
      'set-bed-temperature',
      parameters,
      operationId,
    );
  }

  @Post('temperature/nozzle')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Set the hotend target temperature',
    description: 'Routes to the `set-nozzle-temperature` catalog command.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['celsius'],
      properties: {
        celsius: { type: 'number', minimum: 0, maximum: 300, example: 220 },
      },
    },
  })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  setNozzleTemperature(
    @Body() parameters: unknown,
    @OperationId() operationId: string,
  ) {
    return this.commands.execute(
      'set-nozzle-temperature',
      parameters,
      operationId,
    );
  }
}
