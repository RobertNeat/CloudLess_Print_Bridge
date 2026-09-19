/** MJPEG recording-to-SD operation (timed/manual), split into part files
 * under storage/recordings/{requestId}/NNN.mjpeg (1-based, 3-digit). */
#include "video_service_internal.h"

namespace video_service_internal
{
void runRecording(const OperationRequest& operation)
{
    if (!HAL::hal::GetHal()->sdCardInit(true))
    {
        lastSdAvailable = false;
        lastOperationError = OperationError::SdInitFailed;
        return;
    }
    lastSdAvailable = true;
    const String rootPath = resourceRootPath(ResourceKind::Recordings);
    if (!SD.exists(rootPath) && !SD.mkdir(rootPath))
    {
        lastOperationError = OperationError::SdDirectoryFailed;
        HAL::hal::GetHal()->sdCardDeinit();
        return;
    }
    cleanupOrphanedResourceParts();
    const String directoryPath = resourceDirectoryPath(ResourceKind::Recordings, operation.requestId);
    if (SD.exists(directoryPath))
    {
        // requestId is the durable recording identity. Never overwrite a
        // directory that may still be awaiting a confirmed upload.
        lastOperationError = OperationError::DuplicateRequest;
        HAL::hal::GetHal()->sdCardDeinit();
        return;
    }
    if (!SD.mkdir(directoryPath))
    {
        lastOperationError = OperationError::SdDirectoryFailed;
        HAL::hal::GetHal()->sdCardDeinit();
        return;
    }
    uint32_t partNumber = 1;
    uint32_t completedParts = 0;
    uint32_t partBytes = 0;
    uint32_t framesInPart = 0;
    uint32_t persistedFrames = 0;
    String currentPartPath = resourcePartPath(ResourceKind::Recordings, operation.requestId, partNumber);
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
                > RecordingPartMaxBytes)
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
            currentPartPath = resourcePartPath(ResourceKind::Recordings, operation.requestId, partNumber);
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
        ResourceManifestInfo manifest;
        manifest.kind = ResourceKind::Recordings;
        manifest.requestId = operation.requestId;
        manifest.totalParts = completedParts;
        manifest.resolution = operation.resolution;
        manifest.requestedDurationSeconds = manifestDurationMilliseconds / 1000.0;
        manifest.totalFrames = persistedFrames;
        manifest.complete = true;
        if (!writeResourceManifest(manifest))
            lastOperationError = OperationError::ManifestWriteFailed;
    }
    else
    {
        cleanupOrphanedResourceParts();
        if (completedParts == 0)
            SD.rmdir(directoryPath);
    }
    HAL::hal::GetHal()->sdCardDeinit();
}

}  // namespace video_service_internal
