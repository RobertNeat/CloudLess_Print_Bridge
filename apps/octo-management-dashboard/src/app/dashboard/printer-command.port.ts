import { inject, Injectable, InjectionToken } from '@angular/core';
import { AccessPolicy, type Permission } from '../core/auth-session.service';
import type { ManagementDashboardData, PrintJobStatus } from './dashboard.models';
import type { PrinterNavigationConfiguration } from './printer-navigation/printer-navigation.models';
import type { TemperatureChange } from './printer-temperatures/printer-temperatures';

export type PrinterCommand =
  | { readonly type: 'set-print-status'; readonly status: PrintJobStatus }
  | {
      readonly type: 'set-control';
      readonly key: keyof ManagementDashboardData['controls'];
      readonly value: boolean | number | string;
    }
  | {
      readonly type: 'set-coordinates';
      readonly coordinates: ManagementDashboardData['coordinates'];
    }
  | { readonly type: 'set-navigation'; readonly configuration: PrinterNavigationConfiguration }
  | {
      readonly type: 'set-preview';
      readonly change: Partial<ManagementDashboardData['livePreview']>;
    }
  | { readonly type: 'set-temperature'; readonly change: TemperatureChange };

export interface PrinterCommandPort {
  execute(command: PrinterCommand): Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class MockPrinterCommandAdapter implements PrinterCommandPort {
  async execute(_command: PrinterCommand): Promise<void> {
    await Promise.resolve();
  }
}

export const PRINTER_COMMAND_PORT = new InjectionToken<PrinterCommandPort>('PRINTER_COMMAND_PORT', {
  providedIn: 'root',
  factory: () => inject(MockPrinterCommandAdapter),
});

@Injectable({ providedIn: 'root' })
export class PrinterCommandFacade {
  private readonly port = inject(PRINTER_COMMAND_PORT);
  private readonly access = inject(AccessPolicy);

  async execute(command: PrinterCommand): Promise<void> {
    const permission: Permission =
      command.type === 'set-navigation' ? 'printer.configure' : 'printer.control';
    if (!this.access.can(permission)) throw new Error('Operation is not permitted.');
    await this.port.execute(command);
  }
}
