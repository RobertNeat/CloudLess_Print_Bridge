/** Shared types, constants, and cross-file state for the video service split. */
#pragma once

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

namespace video_service_internal
{
constexpr uint32_t CameraAcquireTimeoutMilliseconds = 5000;
constexpr uint32_t MaximumOperationDurationMilliseconds = 3600000;
constexpr uint32_t MaximumLiveDurationMilliseconds = 600000;
constexpr uint32_t MinimumPeriodicIntervalMilliseconds = 250;
constexpr uint32_t FrameIntervalMilliseconds = 100;
constexpr char MjpegBoundary[] = "unitcams3-frame";

// One part-size threshold per resource kind, mirroring the hub's
// captureMaxBytes/timelapsePartMaxBytes/recordingPartMaxBytes/audioPartMaxBytes
// (all default to 8MB hub-side; kept as distinct knobs here for the same reason).
constexpr uint32_t CaptureMaxBytes = 8UL * 1024UL * 1024UL;
constexpr uint32_t TimelapsePartMaxBytes = 8UL * 1024UL * 1024UL;
constexpr uint32_t RecordingPartMaxBytes = 8UL * 1024UL * 1024UL;
constexpr uint32_t AudioPartMaxBytes = 8UL * 1024UL * 1024UL;

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

// The four durable SD resource trees the hub understands. `Live` is
// intentionally excluded -- live streaming never touches SD or gets a
// manifest.
enum class ResourceKind
{
    Captures,
    Timelapses,
    Recordings,
    Audio,
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

// Defined in video_service_state.cpp. `operationMutex` guards only
// `pendingOperation`, `activeOperation`, `stopRequested`, and `uploadActive`.
// The counters/flags below are `volatile` and written unsynchronized from
// both the operation task and the upload task.
extern SemaphoreHandle_t operationMutex;
extern TaskHandle_t operationTaskHandle;
extern TaskHandle_t uploadTaskHandle;
extern QueueHandle_t mqttEventQueue;
extern OperationRequest pendingOperation;
extern volatile OperationKind activeOperation;
extern volatile bool stopRequested;
extern volatile bool videoServiceReachable;
extern volatile bool uploadActive;
extern volatile bool mqttConnected;
extern volatile bool mqttLastPublishSucceeded;
extern volatile int mqttLastState;
extern volatile uint32_t mqttLastConnectAttemptAt;
extern volatile uint32_t mqttLastPublishAt;
extern volatile OperationError lastOperationError;
extern volatile uint32_t operationFramesCaptured;
extern volatile uint32_t operationUploadsSucceeded;
extern volatile uint32_t operationUploadsFailed;
extern volatile bool lastSdAvailable;
extern WiFiClient mqttTransport;
extern PubSubClient mqttClient;

// video_service_state.cpp
String cameraId();
const char* operationName(OperationKind kind);
const char* operationErrorName(OperationError error);
void enqueueMqttEvent(const char* topicSuffix, const String& payload);
String buildStatusPayload(
    const char* state,
    const OperationRequest& operation,
    uint32_t frames);
bool parseResolution(const String& value, framesize_t& frameSize);
bool setResolution(framesize_t frameSize);
bool isSafeRequestId(const String& value);

// video_service_hash.cpp
bool sha256HexOfFile(const String& filePath, String& hexDigestOut);

// video_service_http_client.cpp
// Selects which duration/frame headers openVideoServiceRequest emits.
// Decoupled from both ResourceKind (live has no ResourceKind) and
// OperationRequest::kind (upload-time OperationRequest values are
// reconstructed from a manifest and don't cleanly map 1:1 to OperationKind).
enum class UploadHeaderStyle
{
    None,             // captures, timelapses: no duration/frame headers.
    AudioDuration,     // audio: X-Duration-Seconds.
    RecordingDuration, // recordings, live: X-Requested-Duration-Seconds + X-Total-Frames.
};
bool readHttpSuccess(WiFiClient& client);
bool openVideoServiceRequest(
    WiFiClient& client,
    const String& path,
    const String& contentType,
    int64_t contentLength,
    const OperationRequest& operation,
    UploadHeaderStyle headerStyle,
    const String& sha256Hex = String(),
    bool chunked = false,
    int32_t partNumber = -1,
    int32_t totalParts = -1);
bool writeAll(WiFiClient& client, const uint8_t* data, size_t length);
bool writeChunk(WiFiClient& client, const uint8_t* data, size_t length);
// Returns true on a successful upload OR a hub-reported duplicate (both are
// treated the same way: the part is considered done). `duplicateOut`, when
// non-null, reports which of the two actually happened.
bool uploadCaptureFile(
    const String& filePath,
    const OperationRequest& operation,
    bool* duplicateOut = nullptr);
bool uploadTimelapsePart(
    const String& filePath,
    const OperationRequest& operation,
    uint32_t partNumber,
    uint32_t totalParts,
    bool* duplicateOut = nullptr);
bool uploadRecordingPart(
    const String& filePath,
    const OperationRequest& operation,
    uint32_t partNumber,
    uint32_t totalParts,
    bool* duplicateOut = nullptr);
bool uploadAudioPart(
    const String& filePath,
    const OperationRequest& operation,
    uint32_t partNumber,
    uint32_t totalParts,
    bool* duplicateOut = nullptr);

// video_service_storage.cpp -- SD path builders (directory-per-request, with
// 1-based/3-digit part filenames and a manifest.json alongside).
String resourceRootPath(ResourceKind kind);
String resourceDirectoryPath(ResourceKind kind, const String& requestId);
String resourcePartPath(ResourceKind kind, const String& requestId, uint32_t partNumber);
String resourceManifestPath(ResourceKind kind, const String& requestId);
const char* resourcePartExtension(ResourceKind kind);
const char* resourceRootName(ResourceKind kind);
bool persistCapture(File& file, camera_fb_t* frame);
bool closeRecordingPart(File& file);

// video_service_manifest.cpp -- manifest.json writers/readers, one schema
// shared across kinds (unused fields simply omitted), atomic tmp-then-rename.
struct ResourceManifestInfo
{
    ResourceKind kind = ResourceKind::Captures;
    String requestId;
    uint32_t totalParts = 0;
    String resolution;
    double requestedDurationSeconds = 0.0;
    uint32_t totalFrames = 0;
    bool complete = false;
};
bool writeResourceManifest(const ResourceManifestInfo& info);
bool readResourceManifest(const String& manifestPath, ResourceManifestInfo& infoOut);

// video_service_cleanup.cpp
void cleanupOrphanedResourceParts();
void removeDirectoryRecursive(const String& directoryPath);

// video_service_capture.cpp / recording.cpp / audio.cpp / live.cpp
void runDurableCapture(const OperationRequest& operation);
void runRecording(const OperationRequest& operation);
void runAudioRecording(const OperationRequest& operation);
void runLiveStream(const OperationRequest& operation);

// video_service_operation_task.cpp
void operationTask(void*);
void uploadTask(void*);
bool scheduleOperation(const OperationRequest& operation);

// video_service_upload_task.cpp
bool uploadOneQueuedResource(ResourceKind kind);

// video_service_mqtt.cpp
void heartbeatTask(void*);

// video_service_api.cpp / video_service_routes.cpp
bool requestComesFromVideoService(AsyncWebServerRequest* request);
void sendJson(AsyncWebServerRequest* request, int status, const String& body);
bool parseCommonRequest(JsonVariant& json, OperationRequest& operation);
void acceptOperation(
    AsyncWebServerRequest* request,
    JsonVariant& json,
    OperationKind kind,
    bool dynamic = false);
void captureOnDemand(AsyncWebServerRequest* request, JsonVariant& json);
void acceptAudioRecording(AsyncWebServerRequest* request, JsonVariant& json);
void stopOperation(AsyncWebServerRequest* request, JsonVariant& json, OperationKind expected);
void getVideoServiceStatus(AsyncWebServerRequest* request);

}  // namespace video_service_internal
