import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { Subscription } from 'rxjs';
import { CommandCatalogService } from '../commands/command-catalog.service';
import { BridgeEventsService } from '../events/bridge-events.service';
import { MqttTransportService } from '../mqtt-transport/mqtt-transport.service';
import { PrinterStateService } from '../printer-state/printer-state.service';

interface NamedCommandMessage {
  id?: unknown;
  parameters?: unknown;
}

@WebSocketGateway({
  namespace: 'printer',
  cors: { origin: '*' },
})
export class PrinterGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly events: BridgeEventsService,
    private readonly mqtt: MqttTransportService,
    private readonly state: PrinterStateService,
    private readonly commands: CommandCatalogService,
  ) {}

  afterInit(): void {
    this.subscriptions.add(
      this.events.mqttStatus$.subscribe((status) =>
        this.server.emit('mqtt.status', status),
      ),
    );
    this.subscriptions.add(
      this.events.mqttReports$.subscribe((report) =>
        this.server.emit('mqtt.report', report),
      ),
    );
    this.subscriptions.add(
      this.events.printerState$.subscribe((snapshot) => {
        this.server.emit('printer.state.raw', {
          updatedAt: snapshot.updatedAt,
          state: snapshot.raw,
        });
        this.server.emit('printer.state.domain', {
          updatedAt: snapshot.updatedAt,
          state: snapshot.domain,
        });
      }),
    );
  }

  handleConnection(client: Socket): void {
    client.emit('mqtt.status', this.mqtt.getStatus());
    const latest = this.mqtt.getLatestReport();
    if (latest) client.emit('mqtt.report', latest);
    const snapshot = this.state.getSnapshot();
    client.emit('printer.state.raw', {
      updatedAt: snapshot.updatedAt,
      state: snapshot.raw,
    });
    client.emit('printer.state.domain', {
      updatedAt: snapshot.updatedAt,
      state: snapshot.domain,
    });
  }

  @SubscribeMessage('printer.command')
  async executeNamed(
    @MessageBody() message: NamedCommandMessage,
    @ConnectedSocket() client: Socket,
  ) {
    if (!message || typeof message.id !== 'string') {
      throw new WsException('printer.command requires a string id');
    }
    try {
      const result = await this.commands.execute(
        message.id,
        message.parameters ?? {},
      );
      client.emit('printer.command.accepted', result);
      return result;
    } catch (error) {
      throw new WsException(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  @SubscribeMessage('mqtt.command.raw')
  async executeRaw(
    @MessageBody() payload: unknown,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const result = await this.mqtt.publish(payload);
      client.emit('printer.command.accepted', result);
      return result;
    } catch (error) {
      throw new WsException(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  onModuleDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
