/** Durable single-capture and periodic-capture (timelapse) operations.
 * SingleCapture writes exactly one part to storage/captures/{id}/001.jpg;
 * PeriodicCapture writes one part per frame to
 * storage/timelapses/{id}/NNN.jpg. Both write a manifest.json once all
 * frames are on disk. */
#include "video_service_internal.h"

namespace video_service_internal
{
void runDurableCapture(const OperationRequest& operation)
{
    const bool singleCapture = operation.kind == OperationKind::SingleCapture;
    const ResourceKind resourceKind = singleCapture
        ? ResourceKind::Captures : ResourceKind::Timelapses;

    if (!HAL::hal::GetHal()->sdCardInit(true))
    {
        lastSdAvailable = false;
        lastOperationError = OperationError::SdInitFailed;
        return;
    }
    lastSdAvailable = true;
    const String rootPath = resourceRootPath(resourceKind);
    const String directoryPath = resourceDirectoryPath(resourceKind, operation.requestId);
    if ((!SD.exists(rootPath) && !SD.mkdir(rootPath))
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
    bool writeFailed = false;
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
            if (frame->len > (singleCapture ? CaptureMaxBytes : TimelapsePartMaxBytes))
            {
                lastOperationError = OperationError::SdWriteFailed;
                esp_camera_fb_return(frame);
                writeFailed = true;
                break;
            }
            const String filePath = resourcePartPath(
                resourceKind, operation.requestId, operationFramesCaptured + 1);
            File file = SD.open(filePath, FILE_WRITE);
            if (!file || !persistCapture(file, frame))
            {
                SD.remove(filePath);
                lastOperationError = file ? OperationError::SdWriteFailed
                    : OperationError::SdOpenFailed;
                esp_camera_fb_return(frame);
                writeFailed = true;
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

    if (writeFailed || operationFramesCaptured == 0)
    {
        SD.rmdir(directoryPath);
    }
    else
    {
        ResourceManifestInfo manifest;
        manifest.kind = resourceKind;
        manifest.requestId = operation.requestId;
        manifest.totalParts = operationFramesCaptured;
        manifest.resolution = operation.resolution;
        manifest.totalFrames = operationFramesCaptured;
        manifest.complete = true;
        if (!writeResourceManifest(manifest))
            lastOperationError = OperationError::ManifestWriteFailed;
    }
    HAL::hal::GetHal()->sdCardDeinit();
}

}  // namespace video_service_internal
