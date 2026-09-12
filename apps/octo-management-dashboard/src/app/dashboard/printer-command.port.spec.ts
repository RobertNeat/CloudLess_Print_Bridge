import { TestBed } from '@angular/core/testing';
import { AccessPolicy } from '../core/auth-session.service';
import { CommandExecutionError } from './backend/http-error-mapping';
import { PRINTER_COMMAND_PORT, PrinterCommandFacade, type PrinterCommandPort } from './printer-command.port';

describe('PrinterCommandFacade', () => {
  it('delegates to the port when the access policy allows the command', async () => {
    const executed: unknown[] = [];
    const port: PrinterCommandPort = { execute: async (command) => void executed.push(command) };
    TestBed.configureTestingModule({
      providers: [
        { provide: PRINTER_COMMAND_PORT, useValue: port },
        { provide: AccessPolicy, useValue: { can: () => true } },
      ],
    });

    await TestBed.inject(PrinterCommandFacade).execute({
      type: 'set-control',
      key: 'lightEnabled',
      value: true,
    });

    expect(executed).toEqual([{ type: 'set-control', key: 'lightEnabled', value: true }]);
  });

  it('rejects with a forbidden CommandError instead of calling the port when AccessPolicy denies the command', async () => {
    // AUTH_MODE defaults to 'disabled' in this app (AccessPolicy.can() always
    // true), so this deny path is unreachable under default config — forcing
    // it here is the only way to exercise it, since manual testing can't.
    const executed: unknown[] = [];
    const port: PrinterCommandPort = { execute: async (command) => void executed.push(command) };
    TestBed.configureTestingModule({
      providers: [
        { provide: PRINTER_COMMAND_PORT, useValue: port },
        { provide: AccessPolicy, useValue: { can: () => false } },
      ],
    });

    const facade = TestBed.inject(PrinterCommandFacade);
    await expect(
      facade.execute({ type: 'set-control', key: 'lightEnabled', value: true }),
    ).rejects.toMatchObject({ error: { kind: 'forbidden' } });
    expect(executed).toEqual([]);
  });

  it('requires printer.configure specifically for set-navigation, not printer.control', async () => {
    const seenPermissions: string[] = [];
    const port: PrinterCommandPort = { execute: async () => undefined };
    TestBed.configureTestingModule({
      providers: [
        { provide: PRINTER_COMMAND_PORT, useValue: port },
        {
          provide: AccessPolicy,
          useValue: {
            can: (permission: string) => {
              seenPermissions.push(permission);
              return true;
            },
          },
        },
      ],
    });
    const facade = TestBed.inject(PrinterCommandFacade);

    await facade.execute({
      type: 'set-navigation',
      configuration: {
        axisPoints: {
          X: { positive: null, negative: null },
          Y: { positive: null, negative: null },
          Z: { positive: null, negative: null },
        },
        hotendPoint: { x: 0, y: 0 },
        mainStep: 1,
        positionPanelPlacement: 'top-right',
        steps: [1],
        axisRanges: { X: { min: 0, max: 1 }, Y: { min: 0, max: 1 }, Z: { min: 0, max: 1 } },
        axisColor: '',
        viewport: {
          imageUrl: '',
          imageAlt: '',
          width: 1,
          height: 1,
          viewBox: { minX: 0, minY: 0, width: 1, height: 1 },
        },
      },
    });

    expect(seenPermissions).toEqual(['printer.configure']);
  });

  it('rethrows a plain error from the port unchanged (only the facade wraps its own permission denial)', async () => {
    const port: PrinterCommandPort = {
      execute: async () => {
        throw new CommandExecutionError({ kind: 'validation', message: 'boom' });
      },
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: PRINTER_COMMAND_PORT, useValue: port },
        { provide: AccessPolicy, useValue: { can: () => true } },
      ],
    });

    await expect(
      TestBed.inject(PrinterCommandFacade).execute({
        type: 'set-control',
        key: 'lightEnabled',
        value: true,
      }),
    ).rejects.toMatchObject({ error: { kind: 'validation', message: 'boom' } });
  });
});
