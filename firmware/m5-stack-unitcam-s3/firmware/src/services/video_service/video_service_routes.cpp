/** Registers the local HTTP API routes for the video-service integration. */
#include "video_service_internal.h"

using namespace video_service_internal;

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
