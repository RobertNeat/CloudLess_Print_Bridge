/** Durable single/periodic capture-to-SD operation. */
#include "video_service_internal.h"

namespace video_service_internal
{
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

}  // namespace video_service_internal
