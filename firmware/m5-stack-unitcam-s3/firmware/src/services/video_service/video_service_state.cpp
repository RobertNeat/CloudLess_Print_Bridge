/** Shared global state and small status/id helpers for the video service. */
#include "video_service_internal.h"

namespace video_service_internal
{
SemaphoreHandle_t operationMutex = nullptr;
TaskHandle_t operationTaskHandle = nullptr;
TaskHandle_t uploadTaskHandle = nullptr;
QueueHandle_t mqttEventQueue = nullptr;
OperationRequest pendingOperation;
volatile OperationKind activeOperation = OperationKind::Idle;
volatile bool stopRequested = false;
volatile bool videoServiceReachable = false;
volatile bool uploadActive = false;
volatile bool mqttConnected = false;
volatile bool mqttLastPublishSucceeded = false;
volatile int mqttLastState = MQTT_DISCONNECTED;
volatile uint32_t mqttLastConnectAttemptAt = 0;
volatile uint32_t mqttLastPublishAt = 0;
volatile OperationError lastOperationError = OperationError::None;
volatile uint32_t operationFramesCaptured = 0;
volatile uint32_t operationUploadsSucceeded = 0;
volatile uint32_t operationUploadsFailed = 0;
volatile bool lastSdAvailable = false;
// `mqttClient` binds a reference to `mqttTransport`; keep this definition
// order so the transport is fully constructed before the client is.
WiFiClient mqttTransport;
PubSubClient mqttClient(mqttTransport);

String cameraId()
{
    String id = HAL::hal::GetHal()->getWifiMacAddress();
    id.replace(":", "");
    id.toLowerCase();
    return id;
}

const char* operationName(OperationKind kind)
{
    switch (kind)
    {
        case OperationKind::SingleCapture: return "singleCapture";
        case OperationKind::PeriodicCapture: return "periodicCapture";
        case OperationKind::TimedRecording: return "timedRecording";
        case OperationKind::ManualRecording: return "manualRecording";
        case OperationKind::AudioRecording: return "audioRecording";
        case OperationKind::LiveStream: return "liveStream";
        default: return "idle";
    }
}

void enqueueMqttEvent(const char* topicSuffix, const String& payload)
{
    MqttEvent event = {};
    if (mqttEventQueue == nullptr || topicSuffix == nullptr
        || strlen(topicSuffix) >= sizeof(event.topicSuffix)
        || payload.length() >= sizeof(event.payload))
        return;
    strlcpy(event.topicSuffix, topicSuffix, sizeof(event.topicSuffix));
    strlcpy(event.payload, payload.c_str(), sizeof(event.payload));
    xQueueSend(mqttEventQueue, &event, 0);
}

const char* operationErrorName(OperationError error)
{
    switch (error)
    {
        case OperationError::CameraAcquireFailed: return "camera_acquire_failed";
        case OperationError::ResolutionFailed: return "resolution_failed";
        case OperationError::SdInitFailed: return "sd_init_failed";
        case OperationError::SdDirectoryFailed: return "sd_directory_failed";
        case OperationError::DuplicateRequest: return "duplicate_request";
        case OperationError::SdOpenFailed: return "sd_open_failed";
        case OperationError::CaptureFailed: return "capture_failed";
        case OperationError::SdWriteFailed: return "sd_write_failed";
        case OperationError::ManifestWriteFailed: return "manifest_write_failed";
        case OperationError::MicrophoneAcquireFailed: return "microphone_acquire_failed";
        case OperationError::WavWriteFailed: return "wav_write_failed";
        case OperationError::LiveConnectionFailed: return "live_connection_failed";
        case OperationError::VideoServiceUploadFailed: return "video_service_upload_failed";
        default: return "none";
    }
}

String buildStatusPayload(
    const char* state,
    const OperationRequest& operation,
    uint32_t frames)
{
    const CameraRuntimeMetrics metrics = getCameraRuntimeMetrics();
    const auto config = HAL::hal::GetHal()->getConfig();
    DynamicJsonDocument document(768);
    document["schemaVersion"] = 1;
    document["cameraId"] = cameraId();
    document["state"] = state;
    document["requestId"] = operation.requestId;
    document["cameraMode"] = operationName(operation.kind);
    document["cameraPowered"] = metrics.cameraPowered;
    document["powerSource"] = "external";
    document["resolution"] = operation.resolution;
    document["fps"] = metrics.framesPerSecond;
    document["frames"] = frames;
    document["uptimeSeconds"] = millis() / 1000UL;
    document["uptimeMinutes"] = millis() / 60000UL;
    if (isfinite(metrics.chipTemperatureCelsius))
        document["chipTemperatureCelsius"] = metrics.chipTemperatureCelsius;
    else
        document["chipTemperatureCelsius"] = nullptr;
    document["cameraAddress"] = WiFi.localIP().toString();
    document["sdAvailable"] = lastSdAvailable;
    JsonObject videoService = document.createNestedObject("videoService");
    videoService["address"] = config.video_service_ip;
    videoService["httpPort"] = config.video_service_port;
    videoService["mqttPort"] = config.mqtt_port;
    String payload;
    serializeJson(document, payload);
    return payload;
}

bool parseResolution(const String& value, framesize_t& frameSize)
{
    if (value == "QVGA") frameSize = FRAMESIZE_QVGA;
    else if (value == "VGA") frameSize = FRAMESIZE_VGA;
    else if (value == "SVGA") frameSize = FRAMESIZE_SVGA;
    else if (value == "XGA") frameSize = FRAMESIZE_XGA;
    else if (value == "UXGA") frameSize = FRAMESIZE_UXGA;
    else return false;
    return true;
}

bool setResolution(framesize_t frameSize)
{
    sensor_t* sensor = esp_camera_sensor_get();
    return sensor != nullptr && sensor->set_framesize(sensor, frameSize) == 0;
}

bool isSafeRequestId(const String& value)
{
    if (value.length() < 1 || value.length() > 64)
        return false;
    for (size_t index = 0; index < value.length(); ++index)
    {
        const char character = value[index];
        if (!isalnum((unsigned char)character)
            && character != '-' && character != '_' && character != '.')
            return false;
    }
    return value != "." && value != "..";
}

}  // namespace video_service_internal
