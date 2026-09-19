/** Audio-recording-to-SD (WAV) operation, part-based like recordings.
 * storage/audio/{requestId}/NNN.wav (1-based, 3-digit). Each part is
 * produced by its own recordWavFile() call, so every part is independently a
 * complete, standalone, valid RIFF/WAVE file -- required by the hub's
 * joinWaveParts(), which walks each part's own fmt/data chunks rather than
 * assuming a byte-range split of one continuous recording. */
#include "video_service_internal.h"

namespace video_service_internal
{
// recordWavFile()'s own hard cap (api_mic.cpp: MaximumRecordingSeconds); at
// 16kHz/stereo/16-bit (64000 B/s) a 20s part is ~1.25MB, comfortably under
// AudioPartMaxBytes, so the binding constraint on part duration is this cap,
// not the byte-size threshold.
constexpr uint32_t MaximumPartSeconds = 20;

void runAudioRecording(const OperationRequest& operation)
{
    if (!HAL::hal::GetHal()->sdCardInit(true))
    {
        lastSdAvailable = false;
        lastOperationError = OperationError::SdInitFailed;
        return;
    }
    lastSdAvailable = true;
    const String rootPath = resourceRootPath(ResourceKind::Audio);
    if (!SD.exists(rootPath) && !SD.mkdir(rootPath))
    {
        lastOperationError = OperationError::SdDirectoryFailed;
        HAL::hal::GetHal()->sdCardDeinit();
        return;
    }
    cleanupOrphanedResourceParts();
    const String directoryPath = resourceDirectoryPath(ResourceKind::Audio, operation.requestId);
    if (SD.exists(directoryPath))
    {
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
    if (!acquireMicrophoneRecorder())
    {
        lastOperationError = OperationError::MicrophoneAcquireFailed;
        SD.rmdir(directoryPath);
        HAL::hal::GetHal()->sdCardDeinit();
        return;
    }

    const uint32_t totalSeconds = operation.durationMilliseconds / 1000UL;
    uint32_t secondsRemaining = totalSeconds;
    uint32_t partNumber = 1;
    bool recordingFailed = false;
    while (secondsRemaining > 0 && !stopRequested)
    {
        const uint32_t partSeconds = min(secondsRemaining, MaximumPartSeconds);
        const String partPath = resourcePartPath(ResourceKind::Audio, operation.requestId, partNumber);
        if (!recordWavFile(SD, partPath.c_str(), partSeconds))
        {
            recordingFailed = true;
            break;
        }
        secondsRemaining -= partSeconds;
        partNumber++;
    }
    releaseMicrophoneRecorder();

    const uint32_t completedParts = partNumber - 1;
    if (recordingFailed || completedParts == 0)
    {
        lastOperationError = OperationError::WavWriteFailed;
        cleanupOrphanedResourceParts();
        if (completedParts == 0)
            SD.rmdir(directoryPath);
    }
    else
    {
        // A stop mid-recording still uploads whatever complete parts exist;
        // the manifest's duration reflects only the seconds actually recorded.
        const uint32_t recordedSeconds = totalSeconds - secondsRemaining;
        ResourceManifestInfo manifest;
        manifest.kind = ResourceKind::Audio;
        manifest.requestId = operation.requestId;
        manifest.totalParts = completedParts;
        manifest.requestedDurationSeconds = recordedSeconds;
        manifest.complete = true;
        if (!writeResourceManifest(manifest))
            lastOperationError = OperationError::ManifestWriteFailed;
    }
    HAL::hal::GetHal()->sdCardDeinit();
}

}  // namespace video_service_internal
