import { Module } from '@nestjs/common';
import { CameraRegistryModule } from '../camera-registry/camera-registry.module';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import { CameraQueryController } from './camera-query.controller';
import { EmbeddedMqttBrokerService } from './embedded-mqtt-broker.service';
import { ExternalMqttBrokerService } from './external-mqtt-broker.service';
import { MqttJsMessageSource } from './mqtt-message-source.service';
import { MqttRuntimeService } from './mqtt-runtime.service';
import { MqttTelemetryStore } from './mqtt-telemetry.store';
import { MQTT_BROKER_ENDPOINT, MQTT_MESSAGE_SOURCE } from './mqtt.ports';

@Module({
  imports: [CameraRegistryModule],
  controllers: [CameraQueryController],
  providers: [
    EmbeddedMqttBrokerService,
    ExternalMqttBrokerService,
    MqttJsMessageSource,
    MqttTelemetryStore,
    {
      provide: MQTT_BROKER_ENDPOINT,
      inject: [
        SERVICE_CONFIG,
        EmbeddedMqttBrokerService,
        ExternalMqttBrokerService,
      ],
      useFactory: (
        config: ServiceConfig,
        embedded: EmbeddedMqttBrokerService,
        external: ExternalMqttBrokerService,
      ) => (config.mqtt.externalUrl ? external : embedded),
    },
    { provide: MQTT_MESSAGE_SOURCE, useExisting: MqttJsMessageSource },
    MqttRuntimeService,
  ],
  exports: [MqttRuntimeService],
})
export class MqttModule {}
