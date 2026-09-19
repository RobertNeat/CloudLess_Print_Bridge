/** Startup/idle scans that discard invalid or orphaned recording/audio files. */
#include "video_service_internal.h"

namespace video_service_internal
{
void cleanupOrphanedRecordingParts()
{
    if (!SD.exists("/recordings"))
        return;
    File directory = SD.open("/recordings", FILE_READ);
    while (directory)
    {
        File entry = directory.openNextFile();
        if (!entry)
            break;
        String path = entry.name();
        const bool isFile = !entry.isDirectory();
        entry.close();
        if (!isFile)
            continue;
        if (!path.startsWith("/recordings/"))
            path = path.startsWith("/") ? "/recordings" + path : "/recordings/" + path;
        if (path.endsWith(".json.tmp"))
        {
            SD.remove(path);
            continue;
        }
        if (path.endsWith(".json"))
        {
            File manifest = SD.open(path, FILE_READ);
            DynamicJsonDocument document(384);
            const DeserializationError error = deserializeJson(document, manifest);
            manifest.close();
            framesize_t frameSize;
            const String requestId = document["requestId"].as<String>();
            const String resolution = document["resolution"].as<String>();
            const bool valid = !error && (document["complete"] | false)
                && isSafeRequestId(requestId) && parseResolution(resolution, frameSize)
                && (document["totalParts"] | 0) > 0
                && (document["totalFrames"] | 0) > 0;
            if (!valid)
            {
                log_w("Removing invalid recording manifest: %s", path.c_str());
                SD.remove(path);
            }
            continue;
        }
        if (path.endsWith(".mjpeg") && !isDeclaredRecordingPart(path))
        {
            log_w("Removing undeclared recording part: %s", path.c_str());
            SD.remove(path);
        }
    }
    directory.close();
}

void cleanupOrphanedAudioFiles()
{
    if (!SD.exists("/audio"))
        return;
    File directory = SD.open("/audio", FILE_READ);
    while (directory)
    {
        File entry = directory.openNextFile();
        if (!entry)
            break;
        String path = entry.name();
        const bool isFile = !entry.isDirectory();
        entry.close();
        if (!isFile)
            continue;
        if (!path.startsWith("/audio/"))
            path = path.startsWith("/") ? "/audio" + path : "/audio/" + path;
        if (path.endsWith(".json.tmp"))
        {
            SD.remove(path);
            continue;
        }
        if (path.endsWith(".json"))
        {
            File manifest = SD.open(path, FILE_READ);
            DynamicJsonDocument document(256);
            const DeserializationError error = deserializeJson(document, manifest);
            manifest.close();
            const String requestId = document["requestId"].as<String>();
            const uint32_t seconds = (uint32_t)(document["requestedDurationSeconds"] | 0);
            OperationRequest declared;
            declared.kind = OperationKind::AudioRecording;
            declared.requestId = requestId;
            const bool valid = !error && (document["complete"] | false)
                && isSafeRequestId(requestId) && isValidAudioDuration(seconds)
                && audioManifestPath(declared) == path && SD.exists(audioWavPath(declared));
            if (!valid)
            {
                SD.remove(path);
                if (isSafeRequestId(requestId))
                    SD.remove(audioWavPath(declared));
            }
            continue;
        }
        if (path.endsWith(".wav"))
        {
            const String manifestPath = path.substring(0, path.length() - 4) + ".json";
            if (!SD.exists(manifestPath))
                SD.remove(path);
        }
    }
    directory.close();
}

}  // namespace video_service_internal
