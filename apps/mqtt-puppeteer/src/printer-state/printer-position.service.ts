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
 * This is the backend half of double verification for axis bounds for
 * `move-absolute` targets specifically: the active printer profile already
 * rejects (via inspectPayload, invoked from MqttTransportService.publish)
 * any such payload that would move outside its machine envelope before it
 * reaches MQTT, so every *commanded* position recorded here is guaranteed to
 * already have passed that check. The `home` case is different: it never
 * goes through inspectPayload, and the fixed HOME_POSITION below is recorded
 * unconditionally as a physical constant of this printer model — it is not
 * validated against the envelope and may legitimately fall outside it (as of
 * writing, HOME_POSITION.z = 10 is below this model's configured
 * machineEnvelope.z.minimum = 20; see HOME_POSITION's own doc comment).
 */

/**
 * Where the Bambu Lab A1's tool-head physically ends up once its G28 homing
 * sequence completes. This is a fixed characteristic of this printer model
 * (not the origin corner of the machine envelope), so it is intentionally
 * independent of the configurable `machineEnvelope` bounds used elsewhere in
 * this file for jog clamping — it is applied as an unconditional literal,
 * not validated or clamped against the envelope.
 *
 * Note this currently sits below the Bambu Lab A1 profile's configured
 * `machineEnvelope.z.minimum` (20mm, see bambu-lab-a1-command.profile.ts).
 * That means a subsequent `move-absolute` command targeting Z<20 will still
 * be rejected by inspectPayload, so the tracked position can never be
 * *commanded* back down to where homing actually leaves it — and it also
 * means downstream consumers that clamp a displayed position to the
 * configured envelope (e.g. the dashboard's axis-range clamping) will not
 * render this value faithfully. If Z=10 is confirmed correct against the
 * real printer, machineEnvelope.z.minimum likely needs to become 10 too;
 * that change is out of scope here and was intentionally not made.
 */
const HOME_POSITION = { x: 128, y: 128, z: 10 } as const;

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
    this.position = {
      x: HOME_POSITION.x,
      y: HOME_POSITION.y,
      z: HOME_POSITION.z,
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
