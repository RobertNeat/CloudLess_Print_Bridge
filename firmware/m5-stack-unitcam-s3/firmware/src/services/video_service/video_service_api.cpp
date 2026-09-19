/** Local HTTP API handlers for the video-service integration surface. */
#include "video_service_internal.h"

namespace video_service_internal
{
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
    bool dynamic)
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

}  // namespace video_service_internal
