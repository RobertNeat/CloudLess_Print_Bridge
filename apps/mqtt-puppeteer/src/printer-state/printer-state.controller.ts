import { Controller, Get } from '@nestjs/common';
import { PrinterStateService } from './printer-state.service';

@Controller('printer')
export class PrinterStateController {
  constructor(private readonly state: PrinterStateService) {}

  @Get('state')
  getSnapshot() {
    return this.state.getSnapshot();
  }

  @Get('state/raw')
  getRaw() {
    return this.state.getRaw();
  }

  @Get('state/domain')
  getDomain() {
    return this.state.getDomain();
  }
}

@Controller()
export class RootPrinterStateController {
  constructor(private readonly state: PrinterStateService) {}

  @Get('json_model')
  getRaw() {
    return this.state.getRaw();
  }

  @Get('domain_model')
  getDomain() {
    return this.state.getDomain();
  }
}
