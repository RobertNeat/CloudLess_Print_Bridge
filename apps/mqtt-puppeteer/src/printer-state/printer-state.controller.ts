import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrinterStateService } from './printer-state.service';

@ApiTags('printer-state')
@Controller('device_config/state')
export class PrinterStateController {
  constructor(private readonly state: PrinterStateService) {}

  @Get('merged')
  @ApiOperation({
    summary: 'Get the raw, deep-merged MQTT report state',
    description:
      'Unmapped, printer-model-specific JSON as last received over MQTT. ' +
      'Prefer GET .../domain for a stable, profile-independent shape.',
  })
  @ApiOkResponse({ description: 'Raw merged state object.' })
  getMerged() {
    return this.state.getRaw();
  }

  @Get('domain')
  @ApiOperation({
    summary: 'Get the printer state mapped to the stable domain model',
    description:
      'Model-agnostic projection (temperatures, job, fans, light, speed, ' +
      "AMS, dead-reckoned position) produced by the active printer profile's " +
      'mapper. This is what the dashboard should consume.',
  })
  @ApiOkResponse({ description: 'Printer domain model.' })
  getDomain() {
    return this.state.getDomain();
  }
}
