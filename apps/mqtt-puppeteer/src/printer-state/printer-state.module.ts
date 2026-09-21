import { Module } from '@nestjs/common';
import { FilamentsModule } from '../filaments/filaments.module';
import { PrintJobModule } from '../print-job/print-job.module';
import { BambuLabA1Mapper } from './bambu-lab-a1.mapper';
import { PRINTER_DOMAIN_MAPPER } from './printer-domain-model.mapper';
import { PrinterPositionService } from './printer-position.service';
import { PrinterStateController } from './printer-state.controller';
import { PrinterStateService } from './printer-state.service';

@Module({
  imports: [FilamentsModule, PrintJobModule],
  controllers: [PrinterStateController],
  providers: [
    PrinterStateService,
    PrinterPositionService,
    { provide: PRINTER_DOMAIN_MAPPER, useClass: BambuLabA1Mapper },
  ],
  exports: [PrinterStateService, PrinterPositionService],
})
export class PrinterStateModule {}
