import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { PrinterDomainModelDto } from '@cloudless/printer-contracts';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Subscription } from 'rxjs';
import {
  cloneJson,
  deepMerge,
  isJsonObject,
  type JsonObject,
} from '../common/json';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { BridgeEventsService } from '../events/bridge-events.service';
import { PrintJobThumbnailService } from '../print-job/print-job-thumbnail.service';
import {
  PRINTER_DOMAIN_MAPPER,
  type PrinterDomainModelMapper,
} from './printer-domain-model.mapper';
import { PrinterPositionService } from './printer-position.service';

@Injectable()
export class PrinterStateService implements OnModuleInit, OnModuleDestroy {
  private readonly subscription = new Subscription();
  private raw: JsonObject;
  private domain: PrinterDomainModelDto;
  private updatedAt: string | null = null;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(PRINTER_DOMAIN_MAPPER)
    private readonly mapper: PrinterDomainModelMapper,
    private readonly events: BridgeEventsService,
    private readonly position: PrinterPositionService,
    private readonly thumbnails: PrintJobThumbnailService,
  ) {
    this.raw = loadTemplate(config.stateTemplatePath);
    this.domain = mapper.map(this.raw);
  }

  onModuleInit(): void {
    this.subscription.add(
      this.events.mqttReports$.subscribe((report) => {
        if (this.applyReport(report.payload)) {
          this.publishState(report.receivedAt);
        }
      }),
    );
    this.publishState(new Date().toISOString());
  }

  onModuleDestroy(): void {
    this.subscription.unsubscribe();
  }

  getSnapshot() {
    return {
      updatedAt: this.updatedAt,
      raw: cloneJson(this.raw),
      domain: cloneJson(this.domain),
    };
  }

  getRaw(): JsonObject {
    return cloneJson(this.raw);
  }

  getDomain(): PrinterDomainModelDto {
    const domain = cloneJson(this.domain);
    const fileName = domain.job?.fileName;
    if (fileName) {
      // Resolving a thumbnail requires FTPS I/O and must never block this
      // synchronous read — request it in the background and surface
      // whatever is already cached.
      this.thumbnails.requestResolution(fileName);
      const thumbnailId = this.thumbnails.getCachedThumbnailId(fileName);
      if (thumbnailId && domain.job) domain.job.thumbnailId = thumbnailId;
    }
    return {
      ...domain,
      position: this.position.getPosition(),
    };
  }

  applyReport(payload: unknown): boolean {
    if (!isJsonObject(payload)) return false;
    this.raw = deepMerge(this.raw, payload);
    this.domain = this.mapper.map(this.raw);
    return true;
  }

  private publishState(updatedAt: string): void {
    this.updatedAt = updatedAt;
    this.events.printerState$.next({
      updatedAt,
      raw: this.getRaw(),
      domain: this.getDomain(),
    });
  }
}

function loadTemplate(path: string | undefined): JsonObject {
  if (!path) return {};
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`Printer state template does not exist: ${resolved}`);
  }
  const parsed: unknown = JSON.parse(readFileSync(resolved, 'utf8'));
  if (!isJsonObject(parsed)) {
    throw new Error('Printer state template must contain a JSON object');
  }
  return parsed;
}
