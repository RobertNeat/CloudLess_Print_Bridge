/** Coordinates priority camera work, durable SD uploads, and MQTT telemetry. */
#include "video_service.h"

#include "video_service_internal.h"

using namespace video_service_internal;

void start_video_service_background_tasks()
{
    if (operationMutex != nullptr)
        return;
    operationMutex = xSemaphoreCreateMutex();
    mqttEventQueue = xQueueCreate(16, sizeof(MqttEvent));
    if (!mqttClient.setBufferSize(1024))
        log_e("Unable to allocate MQTT packet buffer");
    xTaskCreate(operationTask, "video-operation", 8192, nullptr, 4, &operationTaskHandle);
    xTaskCreate(uploadTask, "video-upload", 6144, nullptr, 2, &uploadTaskHandle);
    xTaskCreate(heartbeatTask, "mqtt-heartbeat", 6144, nullptr, 3, nullptr);
}

void publish_video_service_event(const char* topicSuffix, const String& payload)
{
    enqueueMqttEvent(topicSuffix, payload);
}

bool is_video_service_operation_active()
{
    if (operationMutex == nullptr)
        return false;
    xSemaphoreTake(operationMutex, portMAX_DELAY);
    const bool active = activeOperation != OperationKind::Idle
        || pendingOperation.kind != OperationKind::Idle || uploadActive;
    xSemaphoreGive(operationMutex);
    return active;
}
