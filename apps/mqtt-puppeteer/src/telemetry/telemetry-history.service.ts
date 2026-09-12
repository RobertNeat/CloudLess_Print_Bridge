import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type {
  PrinterDomainModelDto,
  TelemetryHistoryDto,
  TelemetrySampleDto,
} from '@cloudless/printer-contracts';
import { Subscription } from 'rxjs';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { BridgeEventsService } from '../events/bridge-events.service';

/**
 * Maintains a bounded in-memory ring buffer of telemetry samples derived
 * from the printer domain model (not raw MQTT fields), so it stays valid
 * regardless of which printer profile is active. Seeds dashboard charts on
 * load instead of only ticking forward from the moment a client connects.
 */
@Injectable()
export class TelemetryHistoryService implements OnModuleInit, OnModuleDestroy {
  private readonly subscription = new Subscription();
  private readonly capacity: number;
  private readonly samples: TelemetrySampleDto[] = [];

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly events: BridgeEventsService,
  ) {
    this.capacity = config.telemetry.historyCapacity;
  }

  onModuleInit(): void {
    this.subscription.add(
      this.events.printerState$.subscribe((update) => {
        this.record(update.domain, update.updatedAt);
      }),
    );
  }

  onModuleDestroy(): void {
    this.subscription.unsubscribe();
  }

  getHistory(): TelemetryHistoryDto {
    return { capacity: this.capacity, samples: [...this.samples] };
  }

  clear(): void {
    this.samples.length = 0;
  }

  private record(domain: PrinterDomainModelDto, capturedAt: string): void {
    const sample: TelemetrySampleDto = {
      capturedAt,
      progressPercent: domain.job?.progressPercent ?? null,
      nozzleTemperatureCurrent: domain.temperatures?.nozzle?.current ?? null,
      nozzleTemperatureTarget: domain.temperatures?.nozzle?.target ?? null,
      bedTemperatureCurrent: domain.temperatures?.bed?.current ?? null,
      bedTemperatureTarget: domain.temperatures?.bed?.target ?? null,
      chamberTemperatureCurrent: domain.temperatures?.chamber?.current ?? null,
      coolingFanPercent: domain.fans?.coolingPercent ?? null,
      auxiliaryFanPercent: domain.fans?.auxiliaryPercent ?? null,
    };
    this.samples.push(sample);
    if (this.samples.length > this.capacity) {
      this.samples.splice(0, this.samples.length - this.capacity);
    }
  }
}
