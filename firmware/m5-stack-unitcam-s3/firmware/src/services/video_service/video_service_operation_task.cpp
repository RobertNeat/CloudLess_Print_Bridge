/** Background task that runs one queued operation at a time, plus scheduling. */
#include "video_service_internal.h"

namespace video_service_internal
{
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
        // Every durable kind (captures/timelapses/recordings/audio) now
        // writes a manifest on completion, so all of them qualify.
        if ((operation.kind == OperationKind::SingleCapture
                || operation.kind == OperationKind::PeriodicCapture
                || operation.kind == OperationKind::TimedRecording
                || operation.kind == OperationKind::ManualRecording
                || operation.kind == OperationKind::AudioRecording)
            && uploadTaskHandle != nullptr)
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

}  // namespace video_service_internal
