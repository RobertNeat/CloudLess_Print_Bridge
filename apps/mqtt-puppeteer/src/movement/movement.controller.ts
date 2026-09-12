import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CommandCatalogService } from '../commands/command-catalog.service';
import { OperationId } from '../common/operation-context';

const absoluteMoveBody = {
  schema: {
    type: 'object',
    description:
      'At least one axis is required. Bounds are enforced by the active ' +
      'printer profile (GET /device_config/profile for the current envelope) ' +
      'and are re-validated again at MQTT publish time, so this endpoint ' +
      'cannot move the printer outside its safe travel range.',
    properties: {
      x: { type: 'number', example: 125 },
      y: { type: 'number', example: 125 },
      z: { type: 'number', example: 20 },
      feedrate: { type: 'number', example: 3000 },
    },
  },
};

@ApiTags('movement')
@Controller('movement')
export class MovementController {
  constructor(private readonly commands: CommandCatalogService) {}

  @Post('absolute')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Move one or more axes to an absolute position',
  })
  @ApiBody(absoluteMoveBody)
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  moveAbsolute(
    @Body() parameters: unknown,
    @OperationId() operationId: string,
  ) {
    return this.commands.execute('move-absolute', parameters, operationId);
  }

  @Post('absolute/simulate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Preview the MQTT payload an absolute move would publish',
    description:
      'Runs the same validation as POST /movement/absolute but never ' +
      'publishes anything — useful for client-side dry runs.',
  })
  @ApiBody(absoluteMoveBody)
  @ApiOkResponse({ description: 'The command id and rendered payload.' })
  simulateAbsolute(
    @Body() parameters: unknown,
    @OperationId() operationId: string,
  ) {
    return this.commands.preview('move-absolute', parameters, operationId);
  }

  @Post('home')
  @HttpCode(202)
  @ApiOperation({ summary: 'Home all axes' })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  home(@OperationId() operationId: string) {
    return this.commands.execute('home', {}, operationId);
  }

  @Post('extrude-relative')
  @HttpCode(202)
  @ApiOperation({ summary: 'Extrude or retract filament in relative mode' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['millimeters'],
      properties: {
        millimeters: { type: 'number', minimum: -50, maximum: 50, example: 50 },
        feedrate: { type: 'number', minimum: 1, maximum: 600, example: 600 },
      },
    },
  })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  extrudeRelative(
    @Body() parameters: unknown,
    @OperationId() operationId: string,
  ) {
    return this.commands.execute('extrude-relative', parameters, operationId);
  }
}
