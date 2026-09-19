/** MQTT heartbeat/telemetry publisher and event-queue drain loop. */
#include "video_service_internal.h"

namespace video_service_internal
{
void heartbeatTask(void*)
{
    while (true)
    {
        if (WiFi.status() != WL_CONNECTED)
        {
            mqttConnected = false;
            mqttLastState = MQTT_CONNECTION_LOST;
            delay(1000);
            continue;
        }
        const auto config = HAL::hal::GetHal()->getConfig();
        IPAddress brokerAddress;
        if (!brokerAddress.fromString(config.video_service_ip))
        {
            mqttConnected = false;
            mqttLastState = MQTT_CONNECT_FAILED;
            delay(5000);
            continue;
        }
        // Store a value-type IPAddress in PubSubClient instead of a pointer to
        // the temporary String returned as part of the copied configuration.
        mqttClient.setServer(brokerAddress, config.mqtt_port);
        const String id = cameraId();
        const String topic = "cameras/" + id + "/heartbeat";
        if (!mqttClient.connected())
        {
            const String clientId = "unitcams3-" + id;
            mqttLastConnectAttemptAt = millis();
            const bool connected = mqttClient.connect(
                clientId.c_str(), topic.c_str(), 0, true,
                "{\"status\":\"offline\"}");
            mqttConnected = connected;
            mqttLastState = mqttClient.state();
            if (!connected)
                log_w("MQTT connect failed: broker=%s:%u state=%d",
                    config.video_service_ip.c_str(), config.mqtt_port,
                    mqttLastState);
        }
        if (mqttClient.connected())
        {
            mqttConnected = true;
            mqttLastState = MQTT_CONNECTED;
            mqttClient.loop();
            const CameraRuntimeMetrics metrics = getCameraRuntimeMetrics();
            DynamicJsonDocument doc(768);
            doc["schemaVersion"] = 1;
            doc["cameraId"] = id;
            doc["status"] = "online";
            doc["uptimeMs"] = millis();
            doc["uptimeSeconds"] = millis() / 1000UL;
            doc["uptimeMinutes"] = millis() / 60000UL;
            doc["cameraPowered"] = metrics.cameraPowered;
            doc["powerSource"] = "external";
            doc["cameraMode"] = metrics.owner == CameraOperationOwner::Dashboard
                ? "dashboardStream" : operationName(activeOperation);
            if (metrics.streaming)
            {
                switch (metrics.frameSize)
                {
                    case FRAMESIZE_QVGA: doc["resolution"] = "QVGA"; break;
                    case FRAMESIZE_VGA: doc["resolution"] = "VGA"; break;
                    case FRAMESIZE_SVGA: doc["resolution"] = "SVGA"; break;
                    case FRAMESIZE_XGA: doc["resolution"] = "XGA"; break;
                    case FRAMESIZE_UXGA: doc["resolution"] = "UXGA"; break;
                    default: doc["resolution"] = nullptr;
                }
                doc["fps"] = metrics.framesPerSecond;
            }
            else
            {
                doc["resolution"] = nullptr;
                doc["fps"] = 0;
            }
            if (isfinite(metrics.chipTemperatureCelsius))
                doc["chipTemperatureCelsius"] = metrics.chipTemperatureCelsius;
            else
                doc["chipTemperatureCelsius"] = nullptr;
            doc["cameraAddress"] = WiFi.localIP().toString();
            doc["sdAvailable"] = lastSdAvailable;
            JsonObject videoService = doc.createNestedObject("videoService");
            videoService["address"] = config.video_service_ip;
            videoService["port"] = config.video_service_port;
            videoService["reachable"] = videoServiceReachable;
            String payload;
            serializeJson(doc, payload);
            mqttLastPublishAt = millis();
            mqttLastPublishSucceeded = mqttClient.publish(
                topic.c_str(), payload.c_str(), true);
            if (!mqttLastPublishSucceeded)
            {
                mqttLastState = mqttClient.state();
                log_w("MQTT heartbeat publish failed: state=%d bytes=%u",
                    mqttLastState, (unsigned)payload.length());
                mqttClient.disconnect();
                mqttConnected = false;
            }
        }
        const uint32_t delayMilliseconds = mqttClient.connected()
            ? max(5U, (uint32_t)config.heartbeat_interval_seconds) * 1000UL
            : 5000UL;
        const uint32_t startedAt = millis();
        while (millis() - startedAt < delayMilliseconds)
        {
            if (mqttClient.connected())
            {
                mqttClient.loop();
                MqttEvent event;
                while (xQueueReceive(mqttEventQueue, &event, 0) == pdTRUE)
                {
                    const String eventTopic = "cameras/" + cameraId() + "/" + event.topicSuffix;
                    if (!mqttClient.publish(eventTopic.c_str(), event.payload, false))
                    {
                        xQueueSendToFront(mqttEventQueue, &event, 0);
                        break;
                    }
                }
            }
            delay(50);
        }
    }
}

}  // namespace video_service_internal
