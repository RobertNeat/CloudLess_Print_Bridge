/** Live MJPEG streaming operation to the video-service hub, with optional
 * dynamic resolution adaptation based on chip temperature and frame rate. */
#include "video_service_internal.h"

namespace video_service_internal
{
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

}  // namespace video_service_internal
