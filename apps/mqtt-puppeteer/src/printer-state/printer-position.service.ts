import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { PrinterPositionDto } from '@cloudless/printer-contracts';
import { Subscription } from 'rxjs';
import { isJsonObject } from '../common/json';
import { BridgeEventsService } from '../events/bridge-events.service';
import { PRINTER_COMMAND_PROFILE } from '../printer-profiles/printer-command-profile';
import type { PrinterCommandProfile } from '../printer-profiles/printer-command-profile';

/**
 * Tracks the tool-head position by dead reckoning: the Bambu Lab A1 status
 * report carries no live XYZ telemetry, so this is derived purely from
 * commands the bridge has *successfully published* (home / move-absolute) —
 * never a live sensor value, and callers must treat `source` accordingly.
 *
 * This is the backend half of double verification for axis bounds: the
 * active printer profile already rejects (via inspectPayload, invoked from
 * MqttTransportService.publish) any payload that would move outside its
 * machine envelope before it reaches MQTT, so every position recorded here
 * is guaranteed to already have passed that check.
 */
@Injectable()
export class PrinterPositionService implements OnModuleInit, OnModuleDestroy {
  private readonly subscription = new Subscription();
  private position: PrinterPositionDto;

  constructor(
    private readonly events: BridgeEventsService,
    @Inject(PRINTER_COMMAND_PROFILE)
    private readonly profile: PrinterCommandProfile,
  ) {
    this.position = unknownPosition();
  }

  onModuleInit(): void {
    this.subscription.add(
      this.events.mqttPublications$.subscribe((publication) => {
        if (publication.status !== 'published' || !publication.payload) return;
        this.applyPublishedPayload(
          publication.commandId,
          publication.payload,
          publication.occurredAt,
        );
      }),
    );
    this.subscription.add(
      this.events.mqttStatus$.subscribe((status) => {
        if (!status.connected) this.invalidate();
      }),
    );
  }

  onModuleDestroy(): void {
    this.subscription.unsubscribe();
  }

  getPosition(): PrinterPositionDto {
    return { ...this.position };
  }

  private applyPublishedPayload(
    commandId: string | undefined,
    payload: unknown,
    occurredAt: string,
  ): void {
    if (commandId === 'home') {
      this.applyHome(occurredAt);
      return;
    }
    if (!isJsonObject(payload)) return;
    const safety = this.profile.inspectPayload(payload);
    if (!safety.targetPosition) return;
    this.applyTarget(safety.targetPosition, occurredAt);
  }

  private applyTarget(
    target: { x?: number; y?: number; z?: number },
    occurredAt: string,
  ): void {
    const envelope = this.profile.getMachineEnvelope();
    this.position = {
      x: clamp(
        target.x,
        this.position.x,
        envelope.x.minimum,
        envelope.x.maximum,
      ),
      y: clamp(
        target.y,
        this.position.y,
        envelope.y.minimum,
        envelope.y.maximum,
      ),
      z: clamp(
        target.z,
        this.position.z,
        envelope.z.minimum,
        envelope.z.maximum,
      ),
      homed: this.position.homed,
      source: 'commanded',
      updatedAt: occurredAt,
    };
  }

  private applyHome(occurredAt: string): void {
    const envelope = this.profile.getMachineEnvelope();
    this.position = {
      x: envelope.x.minimum,
      y: envelope.y.minimum,
      z: envelope.z.minimum,
      homed: true,
      source: 'homed',
      updatedAt: occurredAt,
    };
  }

  private invalidate(): void {
    this.position = unknownPosition();
  }
}

function unknownPosition(): PrinterPositionDto {
  return {
    x: null,
    y: null,
    z: null,
    homed: false,
    source: 'unknown',
    updatedAt: null,
  };
}

function clamp(
  value: number | undefined,
  previous: number | null,
  minimum: number,
  maximum: number,
): number | null {
  if (value === undefined) return previous;
  return Math.min(maximum, Math.max(minimum, value));
}
