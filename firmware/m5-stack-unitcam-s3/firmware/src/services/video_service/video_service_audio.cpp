/** Audio-recording-to-SD (WAV) operation. */
#include "video_service_internal.h"

namespace video_service_internal
{
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

}  // namespace video_service_internal
