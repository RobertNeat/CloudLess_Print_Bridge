import { Module } from '@nestjs/common';
import { BambuLabA1Mapper } from './bambu-lab-a1.mapper';
import { PRINTER_DOMAIN_MAPPER } from './printer-domain-model.mapper';
import {
  PrinterStateController,
  RootPrinterStateController,
} from './printer-state.controller';
import { PrinterStateService } from './printer-state.service';

@Module({
  controllers: [PrinterStateController, RootPrinterStateController],
  providers: [
    PrinterStateService,
    { provide: PRINTER_DOMAIN_MAPPER, useClass: BambuLabA1Mapper },
  ],
  exports: [PrinterStateService],
})
export class PrinterStateModule {}
