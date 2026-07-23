/** Coordinates priority camera work, durable SD uploads, and MQTT telemetry. */
#include "video_service.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <AsyncJson.h>
#include <PubSubClient.h>
#include <SD.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <esp_camera.h>
#include <freertos/queue.h>
#include "apis/camera/api_cam.h"
#include "apis/mic/api_mic.h"
#include "hal/hal.h"

namespace
{
constexpr uint32_t CameraAcquireTimeoutMilliseconds = 5000;
constexpr uint32_t MaximumOperationDurationMilliseconds = 3600000;
constexpr uint32_t MaximumLiveDurationMilliseconds = 600000;
constexpr uint32_t MinimumPeriodicIntervalMilliseconds = 250;
constexpr uint32_t FrameIntervalMilliseconds = 100;
constexpr uint32_t RecordingPartMaximumBytes = 8UL * 1024UL * 1024UL;
constexpr char MjpegBoundary[] = "unitcams3-frame";

enum class OperationKind
{
    Idle,
    SingleCapture,
    PeriodicCapture,
    TimedRecording,
    ManualRecording,
    AudioRecording,
    LiveStream,
};

enum class OperationError
{
    None,
    CameraAcquireFailed,
    ResolutionFailed,
    SdInitFailed,
    SdDirectoryFailed,
    DuplicateRequest,
    SdOpenFailed,
    CaptureFailed,
    SdWriteFailed,
    ManifestWriteFailed,
    MicrophoneAcquireFailed,
    WavWriteFailed,
    LiveConnectionFailed,
    VideoServiceUploadFailed,
};

struct OperationRequest
{
    OperationKind kind = OperationKind::Idle;
    String requestId;
    framesize_t frameSize = FRAMESIZE_VGA;
    String resolution;
    uint32_t intervalMilliseconds = 0;
    uint32_t durationMilliseconds = 0;
    uint32_t totalFrames = 0;
    bool dynamic = false;
};

struct MqttEvent
{
    char topicSuffix[24];
    char payload[384];
};

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
WiFiClient mqttTransport;
PubSubClient mqttClient(mqttTransport);

bool isSafeRequestId(const String& value);

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

bool requestComesFromVideoService(AsyncWebServerRequest* request)
{
    const auto config = HAL::hal::GetHal()->getConfig();
    IPAddress expected;
    return expected.fromString(config.video_service_ip)
        && request->client()->remoteIP() == expected;
}

void sendJson(AsyncWebServerRequest* request, int status, const String& body)
{
    AsyncWebServerResponse* response = request->beginResponse(status, "application/json", body);
    response->addHeader("Cache-Control", "no-store");
    request->send(response);
}

bool readHttpSuccess(WiFiClient& client)
{
    const uint32_t startedAt = millis();
    while (!client.available() && client.connected() && millis() - startedAt < 5000)
        delay(10);
    const String statusLine = client.readStringUntil('\n');
    return statusLine.indexOf(" 2") > 0;
}

bool openVideoServiceRequest(
    WiFiClient& client,
    const String& path,
    const String& contentType,
    int64_t contentLength,
    const OperationRequest& operation,
    bool chunked = false,
    int32_t partNumber = -1,
    int32_t totalParts = -1)
{
    const auto config = HAL::hal::GetHal()->getConfig();
    client.setTimeout(5);
    if (!client.connect(config.video_service_ip.c_str(), config.video_service_port, 5000))
        return false;
    client.printf("POST %s HTTP/1.1\r\n", path.c_str());
    client.printf("Host: %s:%u\r\n", config.video_service_ip.c_str(), config.video_service_port);
    client.printf("Content-Type: %s\r\n", contentType.c_str());
    client.printf("X-Camera-Id: %s\r\n", cameraId().c_str());
    client.printf("X-Request-Id: %s\r\n", operation.requestId.c_str());
    if (!operation.resolution.isEmpty())
        client.printf("X-Resolution: %s\r\n", operation.resolution.c_str());
    if (operation.kind == OperationKind::AudioRecording)
        client.printf("X-Duration-Seconds: %.3f\r\n",
            operation.durationMilliseconds / 1000.0);
    else
    {
        client.printf("X-Requested-Duration-Seconds: %.3f\r\n",
            operation.durationMilliseconds / 1000.0);
        client.printf("X-Total-Frames: %u\r\n", (unsigned)operation.totalFrames);
    }
    if (partNumber >= 0)
        client.printf("X-Part-Number: %ld\r\n", (long)partNumber);
    if (totalParts > 0)
        client.printf("X-Total-Parts: %ld\r\n", (long)totalParts);
    if (chunked)
        client.print("Transfer-Encoding: chunked\r\n");
    else
        client.printf("Content-Length: %lld\r\n", contentLength);
    client.print("Connection: close\r\n\r\n");
    return client.connected();
}

bool writeAll(WiFiClient& client, const uint8_t* data, size_t length)
{
    size_t offset = 0;
    const uint32_t startedAt = millis();
    while (offset < length && client.connected())
    {
        const size_t written = client.write(data + offset, length - offset);
        if (written > 0)
            offset += written;
        else if (millis() - startedAt > 5000)
            break;
        else
            delay(1);
    }
    return offset == length;
}

bool uploadCaptureFile(const String& filePath, const OperationRequest& operation)
{
    File file = SD.open(filePath, FILE_READ);
    if (!file)
        return false;
    WiFiClient client;
    const String path = "/api/v1/cameras/" + cameraId() + "/captures";
    bool success = openVideoServiceRequest(
        client, path, "image/jpeg", file.size(), operation);
    uint8_t buffer[2048];
    while (success && file.available())
    {
        const size_t count = file.read(buffer, sizeof(buffer));
        success = count > 0 && writeAll(client, buffer, count);
    }
    file.close();
    if (success)
        success = readHttpSuccess(client);
    client.stop();
    videoServiceReachable = success;
    return success;
}

bool writeChunk(WiFiClient& client, const uint8_t* data, size_t length)
{
    client.printf("%x\r\n", (unsigned)length);
    return writeAll(client, data, length) && client.print("\r\n") == 2;
}

String captureDirectoryPath(const OperationRequest& operation)
{
    return "/captures/" + operation.requestId + "_" + operation.resolution;
}

bool persistCapture(File& file, camera_fb_t* frame)
{
    const size_t written = file.write(frame->buf, frame->len);
    file.flush();
    file.close();
    return written == frame->len;
}

void runDurableCapture(const OperationRequest& operation)
{
    if (!HAL::hal::GetHal()->sdCardInit(true))
    {
        lastSdAvailable = false;
        lastOperationError = OperationError::SdInitFailed;
        return;
    }
    lastSdAvailable = true;
    const String directoryPath = captureDirectoryPath(operation);
    if ((!SD.exists("/captures") && !SD.mkdir("/captures"))
        || SD.exists(directoryPath) || !SD.mkdir(directoryPath))
    {
        lastOperationError = SD.exists(directoryPath)
            ? OperationError::DuplicateRequest : OperationError::SdDirectoryFailed;
        HAL::hal::GetHal()->sdCardDeinit();
        return;
    }
    if (!acquireVideoServiceCamera(CameraAcquireTimeoutMilliseconds))
    {
        lastOperationError = OperationError::CameraAcquireFailed;
        SD.rmdir(directoryPath);
        HAL::hal::GetHal()->sdCardDeinit();
        return;
    }
    if (!setResolution(operation.frameSize))
    {
        lastOperationError = OperationError::ResolutionFailed;
        releaseVideoServiceCamera();
        SD.rmdir(directoryPath);
        HAL::hal::GetHal()->sdCardDeinit();
        return;
    }

    const uint32_t startedAt = millis();
    uint32_t nextCaptureAt = startedAt;
    const bool singleCapture = operation.kind == OperationKind::SingleCapture;
    while (!stopRequested && (singleCapture
        ? operationFramesCaptured == 0
        : millis() - startedAt < operation.durationMilliseconds))
    {
        const int32_t untilCapture = (int32_t)(nextCaptureAt - millis());
        if (untilCapture > 0)
        {
            delay(min((uint32_t)untilCapture, (uint32_t)25));
            continue;
        }
        camera_fb_t* frame = captureFrameAtSize(operation.frameSize);
        if (frame != nullptr)
        {
            char fileName[24];
            snprintf(fileName, sizeof(fileName), "/%06u.jpg",
                (unsigned)operationFramesCaptured);
            const String filePath = directoryPath + fileName;
            File file = SD.open(filePath, FILE_WRITE);
            if (!file || !persistCapture(file, frame))
            {
                SD.remove(filePath);
                lastOperationError = file ? OperationError::SdWriteFailed
                    : OperationError::SdOpenFailed;
                esp_camera_fb_return(frame);
                break;
            }
            operationFramesCaptured++;
            esp_camera_fb_return(frame);
        }
        else
            lastOperationError = OperationError::CaptureFailed;
        nextCaptureAt += operation.intervalMilliseconds;
        if ((int32_t)(millis() - nextCaptureAt) > 0)
            nextCaptureAt = millis() + operation.intervalMilliseconds;
    }
    releaseVideoServiceCamera();
    if (operationFramesCaptured == 0)
        SD.rmdir(directoryPath);
    HAL::hal::GetHal()->sdCardDeinit();
}

String recordingBasePath(const OperationRequest& operation)
{
    return "/recordings/" + operation.requestId + "_" + operation.resolution;
}

String recordingPartPath(const OperationRequest& operation, uint32_t partNumber)
{
    char suffix[24];
    snprintf(suffix, sizeof(suffix), "_part%04u.mjpeg", (unsigned)partNumber);
    return recordingBasePath(operation) + suffix;
}

String recordingManifestPath(const OperationRequest& operation)
{
    return recordingBasePath(operation) + ".json";
}

bool isDeclaredRecordingPart(const String& partPath)
{
    const int partMarker = partPath.lastIndexOf("_part");
    if (partMarker < 0 || !partPath.endsWith(".mjpeg"))
        return false;
    const String manifestPath = partPath.substring(0, partMarker) + ".json";
    if (!SD.exists(manifestPath))
        return false;
    File manifest = SD.open(manifestPath, FILE_READ);
    if (!manifest)
        return false;
    DynamicJsonDocument document(384);
    const DeserializationError error = deserializeJson(document, manifest);
    manifest.close();
    if (error || !(document["complete"] | false))
        return false;
    const uint32_t totalParts = document["totalParts"] | 0;
    const String partNumberText = partPath.substring(
        partMarker + 5, partPath.length() - strlen(".mjpeg"));
    const uint32_t partNumber = partNumberText.toInt();
    OperationRequest declaredOperation;
    declaredOperation.requestId = document["requestId"].as<String>();
    declaredOperation.resolution = document["resolution"].as<String>();
    return totalParts > 0 && partNumber < totalParts
        && recordingBasePath(declaredOperation) == partPath.substring(0, partMarker);
}

void cleanupOrphanedRecordingParts()
{
    if (!SD.exists("/recordings"))
        return;
    File directory = SD.open("/recordings", FILE_READ);
    while (directory)
    {
        File entry = directory.openNextFile();
        if (!entry)
            break;
        String path = entry.name();
        const bool isFile = !entry.isDirectory();
        entry.close();
        if (!isFile)
            continue;
        if (!path.startsWith("/recordings/"))
            path = path.startsWith("/") ? "/recordings" + path : "/recordings/" + path;
        if (path.endsWith(".json.tmp"))
        {
            SD.remove(path);
            continue;
        }
        if (path.endsWith(".json"))
        {
            File manifest = SD.open(path, FILE_READ);
            DynamicJsonDocument document(384);
            const DeserializationError error = deserializeJson(document, manifest);
            manifest.close();
            framesize_t frameSize;
            const String requestId = document["requestId"].as<String>();
            const String resolution = document["resolution"].as<String>();
            const bool valid = !error && (document["complete"] | false)
                && isSafeRequestId(requestId) && parseResolution(resolution, frameSize)
                && (document["totalParts"] | 0) > 0
                && (document["totalFrames"] | 0) > 0;
            if (!valid)
            {
                log_w("Removing invalid recording manifest: %s", path.c_str());
                SD.remove(path);
            }
            continue;
        }
        if (path.endsWith(".mjpeg") && !isDeclaredRecordingPart(path))
        {
            log_w("Removing undeclared recording part: %s", path.c_str());
            SD.remove(path);
        }
    }
    directory.close();
}

bool closeRecordingPart(File& file)
{
    if (!file)
        return false;
    const bool closedCleanly = file.printf("--%s--\r\n", MjpegBoundary) > 0;
    file.flush();
    file.close();
    return closedCleanly;
}

bool writeRecordingManifest(
    const OperationRequest& operation,
    uint32_t totalParts,
    uint32_t totalFrames,
    uint32_t durationMilliseconds)
{
    if (totalParts == 0 || totalFrames == 0)
        return false;
    for (uint32_t partNumber = 0; partNumber < totalParts; ++partNumber)
    {
        File part = SD.open(recordingPartPath(operation, partNumber), FILE_READ);
        if (!part || part.size() == 0)
        {
            part.close();
            return false;
        }
        part.close();
    }
    const String manifestPath = recordingManifestPath(operation);
    const String temporaryPath = manifestPath + ".tmp";
    for (uint8_t attempt = 0; attempt < 3; ++attempt)
    {
        SD.remove(temporaryPath);
        File manifest = SD.open(temporaryPath, FILE_WRITE);
        if (!manifest)
        {
            delay(20);
            continue;
        }
        DynamicJsonDocument document(384);
        document["schemaVersion"] = 1;
        document["requestId"] = operation.requestId;
        document["resolution"] = operation.resolution;
        document["requestedDurationSeconds"] = durationMilliseconds / 1000.0;
        document["totalFrames"] = totalFrames;
        document["totalParts"] = totalParts;
        document["complete"] = true;
        const bool written = serializeJson(document, manifest) > 0;
        manifest.flush();
        manifest.close();
        if (written)
        {
            SD.remove(manifestPath);
            if (SD.rename(temporaryPath, manifestPath))
                return true;
        }
        delay(20);
    }
    SD.remove(temporaryPath);
    return false;
}

bool uploadRecordingPart(
    const String& filePath,
    const OperationRequest& operation,
    uint32_t partNumber,
    uint32_t totalParts)
{
    File file = SD.open(filePath, FILE_READ);
    if (!file)
        return false;
    WiFiClient client;
    const String path = "/api/v1/cameras/" + cameraId()
        + "/recordings/" + operation.requestId
        + "/parts/" + String(partNumber);
    bool success = openVideoServiceRequest(
        client, path, "multipart/x-mixed-replace; boundary=unitcams3-frame",
        file.size(), operation, false, partNumber, totalParts);
    uint8_t buffer[2048];
    while (success && file.available())
    {
        const size_t count = file.read(buffer, sizeof(buffer));
        success = count > 0 && writeAll(client, buffer, count);
    }
    file.close();
    if (success)
        success = readHttpSuccess(client);
    client.stop();
    videoServiceReachable = success;
    return success;
}

void runRecording(const OperationRequest& operation)
{
    if (!HAL::hal::GetHal()->sdCardInit(true))
    {
        lastSdAvailable = false;
        lastOperationError = OperationError::SdInitFailed;
        return;
    }
    lastSdAvailable = true;
    if (!SD.exists("/recordings") && !SD.mkdir("/recordings"))
    {
        lastOperationError = OperationError::SdDirectoryFailed;
        HAL::hal::GetHal()->sdCardDeinit();
        return;
    }
    cleanupOrphanedRecordingParts();
    const String manifestPath = recordingManifestPath(operation);
    const String firstPartPath = recordingPartPath(operation, 0);
    if (SD.exists(manifestPath) || SD.exists(firstPartPath))
    {
        // requestId is the durable recording identity. Never overwrite a file
        // that may still be awaiting a confirmed upload.
        lastOperationError = OperationError::DuplicateRequest;
        HAL::hal::GetHal()->sdCardDeinit();
        return;
    }
    uint32_t partNumber = 0;
    uint32_t completedParts = 0;
    uint32_t partBytes = 0;
    uint32_t framesInPart = 0;
    uint32_t persistedFrames = 0;
    String currentPartPath = firstPartPath;
    File file = SD.open(currentPartPath, FILE_WRITE);
    if (!file)
    {
        lastOperationError = OperationError::SdOpenFailed;
        HAL::hal::GetHal()->sdCardDeinit();
        return;
    }
    const bool cameraAcquired = acquireVideoServiceCamera(CameraAcquireTimeoutMilliseconds);
    if (!cameraAcquired || !setResolution(operation.frameSize))
    {
        lastOperationError = cameraAcquired
            ? OperationError::ResolutionFailed
            : OperationError::CameraAcquireFailed;
        file.close();
        SD.remove(currentPartPath);
        if (cameraAcquired)
            releaseVideoServiceCamera();
        HAL::hal::GetHal()->sdCardDeinit();
        return;
    }

    const uint32_t startedAt = millis();
    bool writeFailed = false;
    const size_t closingBoundaryLength = strlen(MjpegBoundary) + 8;
    while (!stopRequested && millis() - startedAt < operation.durationMilliseconds)
    {
        camera_fb_t* frame = captureFrameAtSize(operation.frameSize);
        if (frame == nullptr)
        {
            lastOperationError = OperationError::CaptureFailed;
            writeFailed = true;
            break;
        }
        char header[128];
        const int headerLength = snprintf(header, sizeof(header),
            "--%s\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n",
            MjpegBoundary, (unsigned)frame->len);
        const size_t frameRecordLength = headerLength + frame->len + 2;
        if (framesInPart > 0
            && partBytes + frameRecordLength + closingBoundaryLength
                > RecordingPartMaximumBytes)
        {
            if (!closeRecordingPart(file))
            {
                esp_camera_fb_return(frame);
                lastOperationError = OperationError::SdWriteFailed;
                writeFailed = true;
                break;
            }
            persistedFrames += framesInPart;
            completedParts++;
            partNumber++;
            currentPartPath = recordingPartPath(operation, partNumber);
            file = SD.open(currentPartPath, FILE_WRITE);
            partBytes = 0;
            framesInPart = 0;
            if (!file)
            {
                esp_camera_fb_return(frame);
                lastOperationError = OperationError::SdOpenFailed;
                writeFailed = true;
                break;
            }
        }
        const bool written = file.write((const uint8_t*)header, headerLength) == (size_t)headerLength
            && file.write(frame->buf, frame->len) == frame->len
            && file.print("\r\n") == 2;
        esp_camera_fb_return(frame);
        if (!written)
        {
            lastOperationError = OperationError::SdWriteFailed;
            writeFailed = true;
            break;
        }
        partBytes += frameRecordLength;
        framesInPart++;
        operationFramesCaptured++;
        delay(FrameIntervalMilliseconds);
    }
    const uint32_t elapsedDurationMilliseconds = millis() - startedAt;
    if (file)
    {
        if (writeFailed || framesInPart == 0)
        {
            file.close();
            SD.remove(currentPartPath);
        }
        else if (closeRecordingPart(file))
        {
            persistedFrames += framesInPart;
            completedParts++;
        }
        else
        {
            writeFailed = true;
            lastOperationError = OperationError::SdWriteFailed;
            SD.remove(currentPartPath);
        }
    }
    releaseVideoServiceCamera();
    operationFramesCaptured = persistedFrames;
    if (!writeFailed && completedParts > 0)
    {
        const uint32_t manifestDurationMilliseconds =
            operation.kind == OperationKind::ManualRecording
            ? elapsedDurationMilliseconds
            : operation.durationMilliseconds;
        if (!writeRecordingManifest(
                operation,
                completedParts,
                persistedFrames,
                manifestDurationMilliseconds))
            lastOperationError = OperationError::ManifestWriteFailed;
    }
    else
    {
        cleanupOrphanedRecordingParts();
    }
    HAL::hal::GetHal()->sdCardDeinit();
}

String audioBasePath(const OperationRequest& operation)
{
    return "/audio/" + operation.requestId;
}

String audioWavPath(const OperationRequest& operation)
{
    return audioBasePath(operation) + ".wav";
}

String audioManifestPath(const OperationRequest& operation)
{
    return audioBasePath(operation) + ".json";
}

bool writeAudioManifest(const OperationRequest& operation)
{
    File wav = SD.open(audioWavPath(operation), FILE_READ);
    if (!wav || wav.size() <= 44)
    {
        wav.close();
        return false;
    }
    wav.close();
    const String finalPath = audioManifestPath(operation);
    const String temporaryPath = finalPath + ".tmp";
    SD.remove(temporaryPath);
    File manifest = SD.open(temporaryPath, FILE_WRITE);
    if (!manifest)
        return false;
    DynamicJsonDocument document(256);
    document["schemaVersion"] = 1;
    document["requestId"] = operation.requestId;
    document["requestedDurationSeconds"] = operation.durationMilliseconds / 1000.0;
    document["complete"] = true;
    const bool written = serializeJson(document, manifest) > 0;
    manifest.flush();
    manifest.close();
    if (!written)
    {
        SD.remove(temporaryPath);
        return false;
    }
    SD.remove(finalPath);
    if (!SD.rename(temporaryPath, finalPath))
    {
        SD.remove(temporaryPath);
        return false;
    }
    return true;
}

void cleanupOrphanedAudioFiles()
{
    if (!SD.exists("/audio"))
        return;
    File directory = SD.open("/audio", FILE_READ);
    while (directory)
    {
        File entry = directory.openNextFile();
        if (!entry)
            break;
        String path = entry.name();
        const bool isFile = !entry.isDirectory();
        entry.close();
        if (!isFile)
            continue;
        if (!path.startsWith("/audio/"))
            path = path.startsWith("/") ? "/audio" + path : "/audio/" + path;
        if (path.endsWith(".json.tmp"))
        {
            SD.remove(path);
            continue;
        }
        if (path.endsWith(".json"))
        {
            File manifest = SD.open(path, FILE_READ);
            DynamicJsonDocument document(256);
            const DeserializationError error = deserializeJson(document, manifest);
            manifest.close();
            const String requestId = document["requestId"].as<String>();
            const uint32_t seconds = (uint32_t)(document["requestedDurationSeconds"] | 0);
            OperationRequest declared;
            declared.kind = OperationKind::AudioRecording;
            declared.requestId = requestId;
            const bool valid = !error && (document["complete"] | false)
                && isSafeRequestId(requestId) && isValidAudioDuration(seconds)
                && audioManifestPath(declared) == path && SD.exists(audioWavPath(declared));
            if (!valid)
            {
                SD.remove(path);
                if (isSafeRequestId(requestId))
                    SD.remove(audioWavPath(declared));
            }
            continue;
        }
        if (path.endsWith(".wav"))
        {
            const String manifestPath = path.substring(0, path.length() - 4) + ".json";
            if (!SD.exists(manifestPath))
                SD.remove(path);
        }
    }
    directory.close();
}

void runAudioRecording(const OperationRequest& operation)
{
    if (!HAL::hal::GetHal()->sdCardInit(true))
    {
        lastSdAvailable = false;
        lastOperationError = OperationError::SdInitFailed;
        return;
    }
    lastSdAvailable = true;
    if (!SD.exists("/audio") && !SD.mkdir("/audio"))
    {
        lastOperationError = OperationError::SdDirectoryFailed;
        HAL::hal::GetHal()->sdCardDeinit();
        return;
    }
    cleanupOrphanedAudioFiles();
    if (SD.exists(audioWavPath(operation)) || SD.exists(audioManifestPath(operation)))
    {
        lastOperationError = OperationError::DuplicateRequest;
        HAL::hal::GetHal()->sdCardDeinit();
        return;
    }
    if (!acquireMicrophoneRecorder())
    {
        lastOperationError = OperationError::MicrophoneAcquireFailed;
        HAL::hal::GetHal()->sdCardDeinit();
        return;
    }
    const bool recorded = recordWavFile(
        SD, audioWavPath(operation).c_str(), operation.durationMilliseconds / 1000UL);
    releaseMicrophoneRecorder();
    if (!recorded)
    {
        lastOperationError = OperationError::WavWriteFailed;
        SD.remove(audioWavPath(operation));
    }
    else if (!writeAudioManifest(operation))
    {
        lastOperationError = OperationError::ManifestWriteFailed;
        SD.remove(audioWavPath(operation));
    }
    HAL::hal::GetHal()->sdCardDeinit();
}

void runLiveStream(const OperationRequest& operation)
{
    if (!acquireVideoServiceCamera(CameraAcquireTimeoutMilliseconds, true))
    {
        lastOperationError = OperationError::CameraAcquireFailed;
        return;
    }
    if (!setResolution(operation.frameSize))
    {
        lastOperationError = OperationError::ResolutionFailed;
        releaseVideoServiceCamera();
        return;
    }
    WiFiClient client;
    const String path = "/api/v1/cameras/" + cameraId() + "/live";
    bool success = openVideoServiceRequest(client, path,
        "multipart/x-mixed-replace; boundary=unitcams3-frame", -1, operation, true);
    if (!success)
        lastOperationError = OperationError::LiveConnectionFailed;
    const uint32_t startedAt = millis();
    uint32_t previousFrameAt = 0;
    uint32_t lastAdaptationAt = startedAt;
    framesize_t activeFrameSize = operation.frameSize;
    float framesPerSecond = 0.0f;
    while (success && !stopRequested
        && millis() - startedAt < operation.durationMilliseconds)
    {
        camera_fb_t* frame = captureFrameAtSize(activeFrameSize);
        if (frame == nullptr)
        {
            lastOperationError = OperationError::CaptureFailed;
            break;
        }
        char header[128];
        const int headerLength = snprintf(header, sizeof(header),
            "--%s\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n",
            MjpegBoundary, (unsigned)frame->len);
        success = writeChunk(client, (const uint8_t*)header, headerLength)
            && writeChunk(client, frame->buf, frame->len)
            && writeChunk(client, (const uint8_t*)"\r\n", 2);
        if (!success)
            lastOperationError = OperationError::VideoServiceUploadFailed;
        esp_camera_fb_return(frame);
        const uint32_t now = millis();
        if (previousFrameAt != 0 && now != previousFrameAt)
        {
            const float instant = 1000.0f / (now - previousFrameAt);
            framesPerSecond = framesPerSecond == 0.0f
                ? instant : framesPerSecond * 0.75f + instant * 0.25f;
            updateVideoServiceStreamMetrics(activeFrameSize, framesPerSecond);
        }
        previousFrameAt = now;
        if (operation.dynamic && now - lastAdaptationAt >= 2000)
        {
            const float temperature = getCameraRuntimeMetrics().chipTemperatureCelsius;
            framesize_t next = activeFrameSize;
            if ((!isfinite(temperature) || temperature >= 70.0f || framesPerSecond < 5.0f)
                && activeFrameSize > FRAMESIZE_QVGA)
            {
                if (activeFrameSize == FRAMESIZE_UXGA) next = FRAMESIZE_XGA;
                else if (activeFrameSize == FRAMESIZE_XGA) next = FRAMESIZE_SVGA;
                else if (activeFrameSize == FRAMESIZE_SVGA) next = FRAMESIZE_VGA;
                else next = FRAMESIZE_QVGA;
            }
            else if (isfinite(temperature) && temperature < 65.0f && framesPerSecond >= 8.0f
                && activeFrameSize < FRAMESIZE_UXGA)
            {
                if (activeFrameSize == FRAMESIZE_QVGA) next = FRAMESIZE_VGA;
                else if (activeFrameSize == FRAMESIZE_VGA) next = FRAMESIZE_SVGA;
                else if (activeFrameSize == FRAMESIZE_SVGA) next = FRAMESIZE_XGA;
                else next = FRAMESIZE_UXGA;
            }
            if (next != activeFrameSize && setResolution(next))
                activeFrameSize = next;
            lastAdaptationAt = now;
        }
        delay(1);
    }
    if (client.connected())
    {
        client.print("0\r\n\r\n");
        success = readHttpSuccess(client);
        if (!success)
            lastOperationError = OperationError::VideoServiceUploadFailed;
    }
    client.stop();
    videoServiceReachable = success;
    releaseVideoServiceCamera();
}

void operationTask(void*)
{
    while (true)
    {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
        OperationRequest operation;
        xSemaphoreTake(operationMutex, portMAX_DELAY);
        operation = pendingOperation;
        activeOperation = operation.kind;
        stopRequested = false;
        lastOperationError = OperationError::None;
        operationFramesCaptured = 0;
        operationUploadsSucceeded = 0;
        operationUploadsFailed = 0;
        xSemaphoreGive(operationMutex);

        switch (operation.kind)
        {
            case OperationKind::SingleCapture:
            case OperationKind::PeriodicCapture: runDurableCapture(operation); break;
            case OperationKind::TimedRecording:
            case OperationKind::ManualRecording: runRecording(operation); break;
            case OperationKind::AudioRecording: runAudioRecording(operation); break;
            case OperationKind::LiveStream: runLiveStream(operation); break;
            default: break;
        }

        xSemaphoreTake(operationMutex, portMAX_DELAY);
        activeOperation = OperationKind::Idle;
        pendingOperation = OperationRequest();
        stopRequested = false;
        xSemaphoreGive(operationMutex);

        DynamicJsonDocument stateEvent(256);
        stateEvent["requestId"] = operation.requestId;
        stateEvent["state"] = "idle";
        stateEvent["completedOperation"] = operationName(operation.kind);
        stateEvent["frames"] = operationFramesCaptured;
        stateEvent["error"] = operationErrorName(lastOperationError);
        String statePayload;
        serializeJson(stateEvent, statePayload);
        enqueueMqttEvent("state", statePayload);
        enqueueMqttEvent("status",
            buildStatusPayload("idle", operation, operationFramesCaptured));

        // The manifest is created while the operation is still active. Wake
        // the uploader only after exposing the idle state; otherwise it drops
        // the notification as "busy" and waits for its 30-second fallback.
        if ((operation.kind == OperationKind::TimedRecording
                || operation.kind == OperationKind::ManualRecording
                || operation.kind == OperationKind::AudioRecording)
            && uploadTaskHandle != nullptr)
            xTaskNotifyGive(uploadTaskHandle);
    }
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

bool uploadAudioFile(const String& filePath, const OperationRequest& operation)
{
    File file = SD.open(filePath, FILE_READ);
    if (!file)
        return false;
    WiFiClient client;
    const String path = "/api/v1/cameras/" + cameraId() + "/audio";
    bool success = openVideoServiceRequest(
        client, path, "audio/wav", file.size(), operation);
    uint8_t buffer[2048];
    while (success && file.available())
    {
        const size_t count = file.read(buffer, sizeof(buffer));
        success = count > 0 && writeAll(client, buffer, count);
    }
    file.close();
    if (success)
        success = readHttpSuccess(client);
    client.stop();
    videoServiceReachable = success;
    return success;
}

bool uploadOneQueuedAudio()
{
    File directory = SD.open("/audio", FILE_READ);
    while (directory)
    {
        File entry = directory.openNextFile();
        if (!entry)
            break;
        String manifestPath = entry.name();
        const bool isManifest = !entry.isDirectory() && manifestPath.endsWith(".json");
        entry.close();
        if (!isManifest)
            continue;
        if (!manifestPath.startsWith("/audio/"))
            manifestPath = manifestPath.startsWith("/")
                ? "/audio" + manifestPath : "/audio/" + manifestPath;
        File manifest = SD.open(manifestPath, FILE_READ);
        DynamicJsonDocument document(256);
        const DeserializationError error = deserializeJson(document, manifest);
        manifest.close();
        OperationRequest operation;
        operation.kind = OperationKind::AudioRecording;
        operation.requestId = document["requestId"].as<String>();
        operation.durationMilliseconds = (uint32_t)(
            (document["requestedDurationSeconds"] | 0.0) * 1000.0);
        if (error || !(document["complete"] | false)
            || !isSafeRequestId(operation.requestId)
            || !isValidAudioDuration(operation.durationMilliseconds / 1000UL))
            continue;
        const String wavPath = audioWavPath(operation);
        if (!SD.exists(wavPath))
            continue;
        directory.close();
        const bool success = uploadAudioFile(wavPath, operation);
        DynamicJsonDocument event(256);
        event["requestId"] = operation.requestId;
        event["resource"] = "audio";
        event["success"] = success;
        String payload;
        serializeJson(event, payload);
        enqueueMqttEvent("upload", payload);
        if (success)
        {
            SD.remove(wavPath);
            SD.remove(manifestPath);
            operationUploadsSucceeded++;
        }
        else
        {
            operationUploadsFailed++;
            lastOperationError = OperationError::VideoServiceUploadFailed;
        }
        return success;
    }
    directory.close();
    return false;
}

bool uploadOneQueuedCapture()
{
    File root = SD.open("/captures", FILE_READ);
    while (root)
    {
        File entry = root.openNextFile();
        if (!entry)
            break;
        String directoryPath = entry.name();
        const bool isDirectory = entry.isDirectory();
        entry.close();
        if (!isDirectory)
            continue;
        if (!directoryPath.startsWith("/captures/"))
            directoryPath = directoryPath.startsWith("/")
                ? "/captures" + directoryPath : "/captures/" + directoryPath;
        const int slash = directoryPath.lastIndexOf('/');
        const String directoryName = directoryPath.substring(slash + 1);
        const int separator = directoryName.lastIndexOf('_');
        if (separator <= 0)
            continue;
        OperationRequest operation;
        operation.kind = OperationKind::SingleCapture;
        operation.requestId = directoryName.substring(0, separator);
        operation.resolution = directoryName.substring(separator + 1);
        if (!isSafeRequestId(operation.requestId)
            || !parseResolution(operation.resolution, operation.frameSize))
            continue;
        File directory = SD.open(directoryPath, FILE_READ);
        String filePath;
        while (directory)
        {
            File file = directory.openNextFile();
            if (!file)
                break;
            filePath = file.name();
            const bool isJpeg = !file.isDirectory()
                && (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg"));
            file.close();
            if (isJpeg)
            {
                if (!filePath.startsWith(directoryPath + "/"))
                {
                    const int childSlash = filePath.lastIndexOf('/');
                    filePath = directoryPath + "/" + filePath.substring(childSlash + 1);
                }
                break;
            }
            filePath = "";
        }
        directory.close();
        root.close();
        if (filePath.isEmpty())
        {
            SD.rmdir(directoryPath);
            return false;
        }
        const bool success = uploadCaptureFile(filePath, operation);
        DynamicJsonDocument event(256);
        event["requestId"] = operation.requestId;
        event["resource"] = "capture";
        event["success"] = success;
        String payload;
        serializeJson(event, payload);
        enqueueMqttEvent("upload", payload);
        if (success)
        {
            SD.remove(filePath);
            operationUploadsSucceeded++;
        }
        else
        {
            operationUploadsFailed++;
            lastOperationError = OperationError::VideoServiceUploadFailed;
        }
        return success;
    }
    root.close();
    return false;
}

void uploadTask(void*)
{
    while (true)
    {
        ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(30000));
        xSemaphoreTake(operationMutex, portMAX_DELAY);
        const bool canUpload = activeOperation == OperationKind::Idle
            && pendingOperation.kind == OperationKind::Idle && !uploadActive;
        if (canUpload)
            uploadActive = true;
        xSemaphoreGive(operationMutex);
        if (!canUpload)
            continue;

        bool uploadedPart = false;
        if (HAL::hal::GetHal()->sdCardInit(true))
        {
            lastSdAvailable = true;
            if (!SD.exists("/captures"))
                SD.mkdir("/captures");
            if (!SD.exists("/recordings"))
                SD.mkdir("/recordings");
            if (!SD.exists("/audio"))
                SD.mkdir("/audio");
            cleanupOrphanedRecordingParts();
            cleanupOrphanedAudioFiles();
            uploadedPart = uploadOneQueuedAudio();
            if (!uploadedPart)
                uploadedPart = uploadOneQueuedCapture();
            File directory = SD.open("/recordings", FILE_READ);
            OperationRequest operation;
            uint32_t totalParts = 0;
            String manifestPath;
            while (directory)
            {
                File entry = directory.openNextFile();
                if (!entry)
                    break;
                String candidatePath = entry.name();
                const bool isFile = !entry.isDirectory();
                entry.close();
                if (!isFile || !candidatePath.endsWith(".json"))
                    continue;
                if (!candidatePath.startsWith("/recordings/"))
                    candidatePath = candidatePath.startsWith("/")
                        ? String("/recordings") + candidatePath
                        : String("/recordings/") + candidatePath;
                File manifest = SD.open(candidatePath, FILE_READ);
                DynamicJsonDocument document(256);
                const DeserializationError error = deserializeJson(document, manifest);
                manifest.close();
                if (error || !(document["complete"] | false))
                    continue;
                operation.requestId = document["requestId"].as<String>();
                operation.resolution = document["resolution"].as<String>();
                operation.durationMilliseconds = (uint32_t)(
                    (document["requestedDurationSeconds"] | 0.0) * 1000.0);
                operation.totalFrames = document["totalFrames"] | 0;
                totalParts = document["totalParts"] | 0;
                if (isSafeRequestId(operation.requestId)
                    && parseResolution(operation.resolution, operation.frameSize)
                    && totalParts > 0)
                {
                    manifestPath = candidatePath;
                    break;
                }
            }
            directory.close();
            if (!manifestPath.isEmpty())
            {
                bool anyPartRemaining = false;
                for (uint32_t partNumber = 0; partNumber < totalParts; ++partNumber)
                {
                    const String partPath = recordingPartPath(operation, partNumber);
                    if (!SD.exists(partPath))
                        continue;
                    anyPartRemaining = true;
                    if (uploadRecordingPart(partPath, operation, partNumber, totalParts))
                    {
                        SD.remove(partPath);
                        uploadedPart = true;
                        operationUploadsSucceeded++;
                        DynamicJsonDocument event(256);
                        event["requestId"] = operation.requestId;
                        event["resource"] = "recordingPart";
                        event["partNumber"] = partNumber;
                        event["success"] = true;
                        String payload;
                        serializeJson(event, payload);
                        enqueueMqttEvent("upload", payload);
                    }
                    else
                    {
                        operationUploadsFailed++;
                        lastOperationError = OperationError::VideoServiceUploadFailed;
                        DynamicJsonDocument event(256);
                        event["requestId"] = operation.requestId;
                        event["resource"] = "recordingPart";
                        event["partNumber"] = partNumber;
                        event["success"] = false;
                        String payload;
                        serializeJson(event, payload);
                        enqueueMqttEvent("upload", payload);
                    }
                    break;
                }
                if (!anyPartRemaining || uploadedPart)
                {
                    bool stillHasParts = false;
                    for (uint32_t partNumber = 0; partNumber < totalParts; ++partNumber)
                        stillHasParts = stillHasParts
                            || SD.exists(recordingPartPath(operation, partNumber));
                    if (!stillHasParts)
                        SD.remove(manifestPath);
                }
            }
            HAL::hal::GetHal()->sdCardDeinit();
        }
        xSemaphoreTake(operationMutex, portMAX_DELAY);
        uploadActive = false;
        xSemaphoreGive(operationMutex);
        if (uploadedPart)
            xTaskNotifyGive(uploadTaskHandle);
    }
}

bool scheduleOperation(const OperationRequest& operation)
{
    xSemaphoreTake(operationMutex, portMAX_DELAY);
    const bool available = activeOperation == OperationKind::Idle
        && pendingOperation.kind == OperationKind::Idle && !uploadActive;
    if (available)
        pendingOperation = operation;
    xSemaphoreGive(operationMutex);
    if (available)
    {
        xTaskNotifyGive(operationTaskHandle);
        DynamicJsonDocument event(192);
        event["requestId"] = operation.requestId;
        event["state"] = "started";
        event["operation"] = operationName(operation.kind);
        String payload;
        serializeJson(event, payload);
        enqueueMqttEvent("state", payload);
        enqueueMqttEvent("status", buildStatusPayload("started", operation, 0));
    }
    return available;
}

bool parseCommonRequest(JsonVariant& json, OperationRequest& operation)
{
    if (!json.is<JsonObject>() || json["requestId"].isNull()
        || json["resolution"].isNull())
        return false;
    operation.requestId = json["requestId"].as<String>();
    operation.resolution = json["resolution"].as<String>();
    return isSafeRequestId(operation.requestId)
        && parseResolution(operation.resolution, operation.frameSize);
}

void acceptOperation(
    AsyncWebServerRequest* request,
    JsonVariant& json,
    OperationKind kind,
    bool dynamic = false)
{
    if (!requestComesFromVideoService(request))
    {
        sendJson(request, 403, "{\"error\":\"video_service_only\"}");
        return;
    }
    OperationRequest operation;
    operation.kind = kind;
    operation.dynamic = dynamic;
    if (dynamic && json["resolution"].isNull())
        json["resolution"] = "UXGA";
    if (!parseCommonRequest(json, operation))
    {
        sendJson(request, 400, "{\"error\":\"invalid_request\"}");
        return;
    }

    if (kind == OperationKind::PeriodicCapture)
    {
        operation.intervalMilliseconds = json["intervalMs"] | 0;
        operation.durationMilliseconds = json["durationMs"] | 0;
        if (operation.intervalMilliseconds < MinimumPeriodicIntervalMilliseconds)
        {
            sendJson(request, 400, "{\"error\":\"interval_too_short\"}");
            return;
        }
    }
    else if (kind == OperationKind::TimedRecording)
    {
        operation.durationMilliseconds = json["durationMs"] | 0;
    }
    else if (kind == OperationKind::ManualRecording)
    {
        operation.durationMilliseconds = json["maxDurationMs"] | MaximumOperationDurationMilliseconds;
    }
    else if (kind == OperationKind::LiveStream)
    {
        operation.durationMilliseconds = json["maxDurationMs"] | MaximumLiveDurationMilliseconds;
        operation.durationMilliseconds = min(operation.durationMilliseconds, MaximumLiveDurationMilliseconds);
    }
    if (operation.durationMilliseconds == 0
        || operation.durationMilliseconds > MaximumOperationDurationMilliseconds)
    {
        sendJson(request, 400, "{\"error\":\"invalid_duration\"}");
        return;
    }
    if (!scheduleOperation(operation))
    {
        sendJson(request, 409, "{\"error\":\"camera_busy\"}");
        return;
    }
    sendJson(request, 202, "{\"status\":\"accepted\",\"requestId\":\"" + operation.requestId + "\"}");
}

void captureOnDemand(AsyncWebServerRequest* request, JsonVariant& json)
{
    if (!requestComesFromVideoService(request))
    {
        sendJson(request, 403, "{\"error\":\"video_service_only\"}");
        return;
    }
    OperationRequest operation;
    if (!parseCommonRequest(json, operation))
    {
        sendJson(request, 400, "{\"error\":\"invalid_request\"}");
        return;
    }
    operation.kind = OperationKind::SingleCapture;
    if (!scheduleOperation(operation))
    {
        sendJson(request, 409, "{\"error\":\"camera_busy\"}");
        return;
    }
    sendJson(request, 202,
        "{\"status\":\"accepted\",\"requestId\":\"" + operation.requestId + "\"}");
}

void acceptAudioRecording(AsyncWebServerRequest* request, JsonVariant& json)
{
    if (!requestComesFromVideoService(request))
    {
        sendJson(request, 403, "{\"error\":\"video_service_only\"}");
        return;
    }
    if (!json.is<JsonObject>() || json["requestId"].isNull()
        || json["durationSeconds"].isNull())
    {
        sendJson(request, 400, "{\"error\":\"invalid_request\"}");
        return;
    }
    OperationRequest operation;
    operation.kind = OperationKind::AudioRecording;
    operation.requestId = json["requestId"].as<String>();
    const uint32_t seconds = json["durationSeconds"] | 0;
    if (!isSafeRequestId(operation.requestId) || !isValidAudioDuration(seconds))
    {
        sendJson(request, 400, "{\"error\":\"invalid_audio_request\"}");
        return;
    }
    operation.durationMilliseconds = seconds * 1000UL;
    if (!scheduleOperation(operation))
    {
        sendJson(request, 409, "{\"error\":\"device_busy\"}");
        return;
    }
    sendJson(request, 202,
        "{\"status\":\"accepted\",\"requestId\":\"" + operation.requestId + "\"}");
}

void stopOperation(AsyncWebServerRequest* request, JsonVariant& json, OperationKind expected)
{
    if (!requestComesFromVideoService(request))
    {
        sendJson(request, 403, "{\"error\":\"video_service_only\"}");
        return;
    }
    const String requestId = json["requestId"] | "";
    xSemaphoreTake(operationMutex, portMAX_DELAY);
    const bool matches = activeOperation == expected
        && (requestId.isEmpty() || requestId == pendingOperation.requestId);
    if (matches)
        stopRequested = true;
    xSemaphoreGive(operationMutex);
    if (!matches)
    {
        sendJson(request, 404, "{\"error\":\"operation_not_found\"}");
        return;
    }
    sendJson(request, 202, "{\"status\":\"stopping\"}");
}

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

void getVideoServiceStatus(AsyncWebServerRequest* request)
{
    OperationKind operation;
    bool uploading;
    xSemaphoreTake(operationMutex, portMAX_DELAY);
    operation = activeOperation != OperationKind::Idle
        ? activeOperation : pendingOperation.kind;
    uploading = uploadActive;
    xSemaphoreGive(operationMutex);

    const auto config = HAL::hal::GetHal()->getConfig();
    DynamicJsonDocument doc(512);
    doc["operation"] = operationName(operation);
    doc["lastOperationError"] = operationErrorName(lastOperationError);
    doc["framesCaptured"] = operationFramesCaptured;
    doc["uploadsSucceeded"] = operationUploadsSucceeded;
    doc["uploadsFailed"] = operationUploadsFailed;
    doc["uploadActive"] = uploading;
    doc["videoServiceReachable"] = videoServiceReachable;
    JsonObject mqtt = doc.createNestedObject("mqtt");
    mqtt["brokerAddress"] = config.video_service_ip;
    mqtt["brokerPort"] = config.mqtt_port;
    mqtt["connected"] = mqttConnected;
    mqtt["state"] = mqttLastState;
    mqtt["lastConnectAttemptAtMs"] = mqttLastConnectAttemptAt;
    mqtt["lastPublishAtMs"] = mqttLastPublishAt;
    mqtt["lastPublishSucceeded"] = mqttLastPublishSucceeded;
    String body;
    serializeJson(doc, body);
    sendJson(request, 200, body);
}
}

void load_video_service_apis(AsyncWebServer& server)
{
    server.on("/api/v1/video-service/status", HTTP_GET,
        [](AsyncWebServerRequest* request) {
            getVideoServiceStatus(request);
        });

    auto* audioRecording = new AsyncCallbackJsonWebHandler(
        "/api/v1/video-service/audio",
        [](AsyncWebServerRequest* request, JsonVariant& json) {
            acceptAudioRecording(request, json);
        });
    audioRecording->setMethod(HTTP_POST);
    server.addHandler(audioRecording);

    auto* recordingStop = new AsyncCallbackJsonWebHandler(
        "/api/v1/video-service/recordings/stop",
        [](AsyncWebServerRequest* request, JsonVariant& json) {
            stopOperation(request, json, OperationKind::ManualRecording);
        });
    recordingStop->setMethod(HTTP_POST);
    server.addHandler(recordingStop);

    auto* recordingStart = new AsyncCallbackJsonWebHandler(
        "/api/v1/video-service/recordings/start",
        [](AsyncWebServerRequest* request, JsonVariant& json) {
            acceptOperation(request, json, OperationKind::ManualRecording);
        });
    recordingStart->setMethod(HTTP_POST);
    server.addHandler(recordingStart);

    auto* recordingTimed = new AsyncCallbackJsonWebHandler(
        "/api/v1/video-service/recordings/timed",
        [](AsyncWebServerRequest* request, JsonVariant& json) {
            acceptOperation(request, json, OperationKind::TimedRecording);
        });
    recordingTimed->setMethod(HTTP_POST);
    server.addHandler(recordingTimed);

    auto* liveStop = new AsyncCallbackJsonWebHandler(
        "/api/v1/video-service/live/stop",
        [](AsyncWebServerRequest* request, JsonVariant& json) {
            stopOperation(request, json, OperationKind::LiveStream);
        });
    liveStop->setMethod(HTTP_POST);
    server.addHandler(liveStop);

    auto* liveStart = new AsyncCallbackJsonWebHandler(
        "/api/v1/video-service/live/start",
        [](AsyncWebServerRequest* request, JsonVariant& json) {
            acceptOperation(request, json, OperationKind::LiveStream);
        });
    liveStart->setMethod(HTTP_POST);
    server.addHandler(liveStart);

    auto* dynamicLiveStart = new AsyncCallbackJsonWebHandler(
        "/api/v1/video-service/live/dynamic/start",
        [](AsyncWebServerRequest* request, JsonVariant& json) {
            acceptOperation(request, json, OperationKind::LiveStream, true);
        });
    dynamicLiveStart->setMethod(HTTP_POST);
    server.addHandler(dynamicLiveStart);

    auto* periodic = new AsyncCallbackJsonWebHandler(
        "/api/v1/video-service/captures/periodic",
        [](AsyncWebServerRequest* request, JsonVariant& json) {
            acceptOperation(request, json, OperationKind::PeriodicCapture);
        });
    periodic->setMethod(HTTP_POST);
    server.addHandler(periodic);

    auto* capture = new AsyncCallbackJsonWebHandler(
        "/api/v1/video-service/captures",
        [](AsyncWebServerRequest* request, JsonVariant& json) {
            captureOnDemand(request, json);
        });
    capture->setMethod(HTTP_POST);
    server.addHandler(capture);
}

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
