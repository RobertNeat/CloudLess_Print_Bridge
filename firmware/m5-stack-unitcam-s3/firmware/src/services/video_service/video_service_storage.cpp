/** SD-card path builders and manifest.json writers for captures/recordings/audio. */
#include "video_service_internal.h"

namespace video_service_internal
{
String captureDirectoryPath(const OperationRequest& operation)
{
    return "/captures/" + operation.requestId + "_" + operation.resolution;
}

bool persistCapture(File& file, camera_fb_t* frame)
{
    const size_t written = file.write(frame->buf, frame->len);
    file.flush();
    file.close();
    return written == frame->len;
}

String recordingBasePath(const OperationRequest& operation)
{
    return "/recordings/" + operation.requestId + "_" + operation.resolution;
}

String recordingPartPath(const OperationRequest& operation, uint32_t partNumber)
{
    char suffix[24];
    snprintf(suffix, sizeof(suffix), "_part%04u.mjpeg", (unsigned)partNumber);
    return recordingBasePath(operation) + suffix;
}

String recordingManifestPath(const OperationRequest& operation)
{
    return recordingBasePath(operation) + ".json";
}

bool isDeclaredRecordingPart(const String& partPath)
{
    const int partMarker = partPath.lastIndexOf("_part");
    if (partMarker < 0 || !partPath.endsWith(".mjpeg"))
        return false;
    const String manifestPath = partPath.substring(0, partMarker) + ".json";
    if (!SD.exists(manifestPath))
        return false;
    File manifest = SD.open(manifestPath, FILE_READ);
    if (!manifest)
        return false;
    DynamicJsonDocument document(384);
    const DeserializationError error = deserializeJson(document, manifest);
    manifest.close();
    if (error || !(document["complete"] | false))
        return false;
    const uint32_t totalParts = document["totalParts"] | 0;
    const String partNumberText = partPath.substring(
        partMarker + 5, partPath.length() - strlen(".mjpeg"));
    const uint32_t partNumber = partNumberText.toInt();
    OperationRequest declaredOperation;
    declaredOperation.requestId = document["requestId"].as<String>();
    declaredOperation.resolution = document["resolution"].as<String>();
    return totalParts > 0 && partNumber < totalParts
        && recordingBasePath(declaredOperation) == partPath.substring(0, partMarker);
}

bool closeRecordingPart(File& file)
{
    if (!file)
        return false;
    const bool closedCleanly = file.printf("--%s--\r\n", MjpegBoundary) > 0;
    file.flush();
    file.close();
    return closedCleanly;
}

bool writeRecordingManifest(
    const OperationRequest& operation,
    uint32_t totalParts,
    uint32_t totalFrames,
    uint32_t durationMilliseconds)
{
    if (totalParts == 0 || totalFrames == 0)
        return false;
    for (uint32_t partNumber = 0; partNumber < totalParts; ++partNumber)
    {
        File part = SD.open(recordingPartPath(operation, partNumber), FILE_READ);
        if (!part || part.size() == 0)
        {
            part.close();
            return false;
        }
        part.close();
    }
    const String manifestPath = recordingManifestPath(operation);
    const String temporaryPath = manifestPath + ".tmp";
    for (uint8_t attempt = 0; attempt < 3; ++attempt)
    {
        SD.remove(temporaryPath);
        File manifest = SD.open(temporaryPath, FILE_WRITE);
        if (!manifest)
        {
            delay(20);
            continue;
        }
        DynamicJsonDocument document(384);
        document["schemaVersion"] = 1;
        document["requestId"] = operation.requestId;
        document["resolution"] = operation.resolution;
        document["requestedDurationSeconds"] = durationMilliseconds / 1000.0;
        document["totalFrames"] = totalFrames;
        document["totalParts"] = totalParts;
        document["complete"] = true;
        const bool written = serializeJson(document, manifest) > 0;
        manifest.flush();
        manifest.close();
        if (written)
        {
            SD.remove(manifestPath);
            if (SD.rename(temporaryPath, manifestPath))
                return true;
        }
        delay(20);
    }
    SD.remove(temporaryPath);
    return false;
}

String audioBasePath(const OperationRequest& operation)
{
    return "/audio/" + operation.requestId;
}

String audioWavPath(const OperationRequest& operation)
{
    return audioBasePath(operation) + ".wav";
}

String audioManifestPath(const OperationRequest& operation)
{
    return audioBasePath(operation) + ".json";
}

bool writeAudioManifest(const OperationRequest& operation)
{
    File wav = SD.open(audioWavPath(operation), FILE_READ);
    if (!wav || wav.size() <= 44)
    {
        wav.close();
        return false;
    }
    wav.close();
    const String finalPath = audioManifestPath(operation);
    const String temporaryPath = finalPath + ".tmp";
    SD.remove(temporaryPath);
    File manifest = SD.open(temporaryPath, FILE_WRITE);
    if (!manifest)
        return false;
    DynamicJsonDocument document(256);
    document["schemaVersion"] = 1;
    document["requestId"] = operation.requestId;
    document["requestedDurationSeconds"] = operation.durationMilliseconds / 1000.0;
    document["complete"] = true;
    const bool written = serializeJson(document, manifest) > 0;
    manifest.flush();
    manifest.close();
    if (!written)
    {
        SD.remove(temporaryPath);
        return false;
    }
    SD.remove(finalPath);
    if (!SD.rename(temporaryPath, finalPath))
    {
        SD.remove(temporaryPath);
        return false;
    }
    return true;
}

}  // namespace video_service_internal
