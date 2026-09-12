import { Global, Module } from '@nestjs/common';
import { FilamentsModule } from '../filaments/filaments.module';
import { BambuLabA1CommandProfile } from './bambu-lab-a1/bambu-lab-a1-command.profile';
import { PRINTER_COMMAND_PROFILE } from './printer-command-profile';

/**
 * Provides the active PrinterCommandProfile (currently the Bambu Lab A1)
 * as a single global instance. Every module that needs model-specific
 * command shapes, machine limits, or payload safety checks depends on the
 * PrinterCommandProfile interface, not on this concrete class, so swapping
 * printer models means changing only this provider mapping.
 */
@Global()
@Module({
  imports: [FilamentsModule],
  providers: [
    {
      provide: PRINTER_COMMAND_PROFILE,
      useClass: BambuLabA1CommandProfile,
    },
  ],
  exports: [PRINTER_COMMAND_PROFILE],
})
export class PrinterProfileModule {}
