import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { OperationId } from '../common/operation-context';
import { MqttTransportService } from '../mqtt-transport/mqtt-transport.service';
import { CommandCatalogService } from './command-catalog.service';

@Controller('commands')
export class CommandsController {
  constructor(
    private readonly commands: CommandCatalogService,
    private readonly mqtt: MqttTransportService,
  ) {}

  @Get()
  list() {
    return this.commands.list();
  }

  @Post('raw')
  @HttpCode(202)
  publishRaw(@Body() payload: unknown, @OperationId() operationId: string) {
    return this.mqtt.publish(payload, { operationId });
  }

  @Post(':id')
  @HttpCode(202)
  execute(
    @Param('id') id: string,
    @Body() parameters: unknown,
    @OperationId() operationId: string,
  ) {
    return this.commands.execute(id, parameters, operationId);
  }
}
