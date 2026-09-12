import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { OperationId } from '../common/operation-context';
import { MqttTransportService } from '../mqtt-transport/mqtt-transport.service';
import { CommandCatalogService } from './command-catalog.service';

@ApiTags('commands')
@Controller('commands')
export class CommandsController {
  constructor(
    private readonly commands: CommandCatalogService,
    private readonly mqtt: MqttTransportService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List every command the active printer profile exposes',
    description:
      'Metadata (id, description, parameter schema, safety notes, source) ' +
      'is sufficient for a UI to generate forms for each command without ' +
      'hard-coding anything printer-model-specific. Reflects whichever ' +
      'PrinterCommandProfile is currently active — swap the profile and ' +
      'this list changes with it.',
  })
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'set-light' },
          description: { type: 'string' },
          parameters: { type: 'object' },
          safetyNotes: { type: 'array', items: { type: 'string' } },
          source: { type: 'string', example: 'profile:bambu-lab-a1' },
        },
      },
    },
  })
  list() {
    return this.commands.list();
  }

  @Post('raw')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Publish a hand-crafted MQTT payload',
    description:
      'Escape hatch for payloads the command catalog does not model yet. ' +
      "Still passes through the active printer profile's payload safety " +
      'check before publish (e.g. gcode moves outside the machine envelope ' +
      'are rejected), so this cannot be used to bypass axis limits.',
  })
  @ApiAcceptedResponse({ description: 'Payload accepted for publish.' })
  publishRaw(@Body() payload: unknown, @OperationId() operationId: string) {
    return this.mqtt.publish(payload, { operationId });
  }

  @Post(':id')
  @HttpCode(202)
  @ApiOperation({ summary: 'Execute a catalog command by id' })
  @ApiParam({ name: 'id', example: 'set-bed-temperature' })
  @ApiAcceptedResponse({ description: 'Command accepted for publish.' })
  execute(
    @Param('id') id: string,
    @Body() parameters: unknown,
    @OperationId() operationId: string,
  ) {
    return this.commands.execute(id, parameters, operationId);
  }
}
