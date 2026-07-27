import { Controller, Get } from '@nestjs/common';
import { PrinterStateService } from './printer-state.service';

@Controller('device_config/state')
export class PrinterStateController {
  constructor(private readonly state: PrinterStateService) {}

  @Get('merged')
  getMerged() {
    return this.state.getRaw();
  }

  @Get('domain')
  getDomain() {
    return this.state.getDomain();
  }
}
