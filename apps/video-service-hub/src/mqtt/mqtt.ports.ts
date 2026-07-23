export const MQTT_BROKER_ENDPOINT = Symbol('MQTT_BROKER_ENDPOINT');
export const MQTT_MESSAGE_SOURCE = Symbol('MQTT_MESSAGE_SOURCE');

export type MqttBrokerMode = 'embedded' | 'external';

export type MqttBrokerEndpoint = {
  url: string;
  username?: string;
  password?: string;
};

export type MqttBrokerStatus = {
  managedByApplication: boolean;
  listening?: boolean;
  host?: string;
  port?: number;
};

export interface MqttBrokerEndpointProvider {
  readonly mode: MqttBrokerMode;
  open(): Promise<MqttBrokerEndpoint>;
  close(): Promise<void>;
  getStatus(): MqttBrokerStatus;
}

export type ObservedMqttMessage = {
  topic: string;
  payload: Buffer;
  qos: 0 | 1 | 2;
  retain: boolean;
};

export type MqttMessageSourceStatus = {
  connected: boolean;
  reconnecting: boolean;
  clientId: string | null;
  brokerUrl: string;
  subscription: string | null;
};

export interface MqttMessageSource {
  start(
    endpoint: MqttBrokerEndpoint,
    topicFilter: string,
    handler: (message: ObservedMqttMessage) => void,
  ): Promise<void>;
  stop(): Promise<void>;
  getStatus(): MqttMessageSourceStatus;
}
