import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { Subscription } from 'rxjs';
import { BridgeEventsService } from '../events/bridge-events.service';
import { loadAppConfig } from '../config/app-config';
import { MqttTransportService } from '../mqtt-transport/mqtt-transport.service';
import { PrinterStateService } from '../printer-state/printer-state.service';

/**
 * @WebSocketGateway's `cors` option is evaluated once, at class-decoration
 * time, before Nest's DI container exists — it cannot receive AppConfig via
 * injection. Reading the same environment-driven config loader used
 * everywhere else keeps this the single source of truth for allowed
 * dashboard origins instead of a second hard-coded allowlist.
 */
const gatewayCorsOrigins = loadAppConfig().http.corsOrigins;

@WebSocketGateway({
  namespace: 'printer',
  cors: { origin: gatewayCorsOrigins, credentials: true },
})
export class PrinterGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly events: BridgeEventsService,
    private readonly mqtt: MqttTransportService,
    private readonly state: PrinterStateService,
  ) {}

  afterInit(): void {
    this.subscriptions.add(
      this.events.mqttStatus$.subscribe((status) =>
        this.server.emit('service.status', status),
      ),
    );
    this.subscriptions.add(
      this.events.mqttReports$.subscribe((report) =>
        this.server.emit('service.report', report),
      ),
    );
    this.subscriptions.add(
      this.events.printerState$.subscribe((snapshot) =>
        this.emitPrinterState(this.server, snapshot),
      ),
    );
    this.subscriptions.add(
      this.events.mqttPublications$.subscribe((publication) =>
        this.server.emit('service.mqtt.publish', publication),
      ),
    );
    this.subscriptions.add(
      this.events.serviceErrors$.subscribe((error) =>
        this.server.emit('service.error', error),
      ),
    );
    this.subscriptions.add(
      this.events.operationResults$.subscribe((result) =>
        this.server.emit('service.operation.result', result),
      ),
    );
  }

  handleConnection(client: Socket): void {
    client.emit('service.status', this.mqtt.getStatus());
    const latest = this.mqtt.getLatestReport();
    if (latest) client.emit('service.report', latest);
    this.emitPrinterState(client, this.state.getSnapshot());
  }

  onModuleDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private emitPrinterState(
    target: Pick<Socket, 'emit'>,
    snapshot: ReturnType<PrinterStateService['getSnapshot']>,
  ): void {
    target.emit('device_config.state.merged', {
      updatedAt: snapshot.updatedAt,
      state: snapshot.raw,
    });
    target.emit('device_config.state.domain', {
      updatedAt: snapshot.updatedAt,
      state: snapshot.domain,
    });
  }
}
