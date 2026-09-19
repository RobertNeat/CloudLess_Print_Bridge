/** Background uploader: drains queued audio, captures, then recording parts
 * to the video-service hub, one item per wake, while idle. */
#include "video_service_internal.h"

namespace video_service_internal
{
bool uploadOneQueuedAudio()
{
    File directory = SD.open("/audio", FILE_READ);
    while (directory)
    {
        File entry = directory.openNextFile();
        if (!entry)
            break;
        String manifestPath = entry.name();
        const bool isManifest = !entry.isDirectory() && manifestPath.endsWith(".json");
        entry.close();
        if (!isManifest)
            continue;
        if (!manifestPath.startsWith("/audio/"))
            manifestPath = manifestPath.startsWith("/")
                ? "/audio" + manifestPath : "/audio/" + manifestPath;
        File manifest = SD.open(manifestPath, FILE_READ);
        DynamicJsonDocument document(256);
        const DeserializationError error = deserializeJson(document, manifest);
        manifest.close();
        OperationRequest operation;
        operation.kind = OperationKind::AudioRecording;
        operation.requestId = document["requestId"].as<String>();
        operation.durationMilliseconds = (uint32_t)(
            (document["requestedDurationSeconds"] | 0.0) * 1000.0);
        if (error || !(document["complete"] | false)
            || !isSafeRequestId(operation.requestId)
            || !isValidAudioDuration(operation.durationMilliseconds / 1000UL))
            continue;
        const String wavPath = audioWavPath(operation);
        if (!SD.exists(wavPath))
            continue;
        directory.close();
        const bool success = uploadAudioFile(wavPath, operation);
        DynamicJsonDocument event(256);
        event["requestId"] = operation.requestId;
        event["resource"] = "audio";
        event["success"] = success;
        String payload;
        serializeJson(event, payload);
        enqueueMqttEvent("upload", payload);
        if (success)
        {
            SD.remove(wavPath);
            SD.remove(manifestPath);
            operationUploadsSucceeded++;
        }
        else
        {
            operationUploadsFailed++;
            lastOperationError = OperationError::VideoServiceUploadFailed;
        }
        return success;
    }
    directory.close();
    return false;
}

bool uploadOneQueuedCapture()
{
    File root = SD.open("/captures", FILE_READ);
    while (root)
    {
        File entry = root.openNextFile();
        if (!entry)
            break;
        String directoryPath = entry.name();
        const bool isDirectory = entry.isDirectory();
        entry.close();
        if (!isDirectory)
            continue;
        if (!directoryPath.startsWith("/captures/"))
            directoryPath = directoryPath.startsWith("/")
                ? "/captures" + directoryPath : "/captures/" + directoryPath;
        const int slash = directoryPath.lastIndexOf('/');
        const String directoryName = directoryPath.substring(slash + 1);
        const int separator = directoryName.lastIndexOf('_');
        if (separator <= 0)
            continue;
        OperationRequest operation;
        operation.kind = OperationKind::SingleCapture;
        operation.requestId = directoryName.substring(0, separator);
        operation.resolution = directoryName.substring(separator + 1);
        if (!isSafeRequestId(operation.requestId)
            || !parseResolution(operation.resolution, operation.frameSize))
            continue;
        File directory = SD.open(directoryPath, FILE_READ);
        String filePath;
        while (directory)
        {
            File file = directory.openNextFile();
            if (!file)
                break;
            filePath = file.name();
            const bool isJpeg = !file.isDirectory()
                && (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg"));
            file.close();
            if (isJpeg)
            {
                if (!filePath.startsWith(directoryPath + "/"))
                {
                    const int childSlash = filePath.lastIndexOf('/');
                    filePath = directoryPath + "/" + filePath.substring(childSlash + 1);
                }
                break;
            }
            filePath = "";
        }
        directory.close();
        root.close();
        if (filePath.isEmpty())
        {
            SD.rmdir(directoryPath);
            return false;
        }
        const bool success = uploadCaptureFile(filePath, operation);
        DynamicJsonDocument event(256);
        event["requestId"] = operation.requestId;
        event["resource"] = "capture";
        event["success"] = success;
        String payload;
        serializeJson(event, payload);
        enqueueMqttEvent("upload", payload);
        if (success)
        {
            SD.remove(filePath);
            operationUploadsSucceeded++;
        }
        else
        {
            operationUploadsFailed++;
            lastOperationError = OperationError::VideoServiceUploadFailed;
        }
        return success;
    }
    root.close();
    return false;
}

void uploadTask(void*)
{
    while (true)
    {
        ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(30000));
        xSemaphoreTake(operationMutex, portMAX_DELAY);
        const bool canUpload = activeOperation == OperationKind::Idle
            && pendingOperation.kind == OperationKind::Idle && !uploadActive;
        if (canUpload)
            uploadActive = true;
        xSemaphoreGive(operationMutex);
        if (!canUpload)
            continue;

        bool uploadedPart = false;
        if (HAL::hal::GetHal()->sdCardInit(true))
        {
            lastSdAvailable = true;
            if (!SD.exists("/captures"))
                SD.mkdir("/captures");
            if (!SD.exists("/recordings"))
                SD.mkdir("/recordings");
            if (!SD.exists("/audio"))
                SD.mkdir("/audio");
            cleanupOrphanedRecordingParts();
            cleanupOrphanedAudioFiles();
            uploadedPart = uploadOneQueuedAudio();
            if (!uploadedPart)
                uploadedPart = uploadOneQueuedCapture();
            File directory = SD.open("/recordings", FILE_READ);
            OperationRequest operation;
            uint32_t totalParts = 0;
            String manifestPath;
            while (directory)
            {
                File entry = directory.openNextFile();
                if (!entry)
                    break;
                String candidatePath = entry.name();
                const bool isFile = !entry.isDirectory();
                entry.close();
                if (!isFile || !candidatePath.endsWith(".json"))
                    continue;
                if (!candidatePath.startsWith("/recordings/"))
                    candidatePath = candidatePath.startsWith("/")
                        ? String("/recordings") + candidatePath
                        : String("/recordings/") + candidatePath;
                File manifest = SD.open(candidatePath, FILE_READ);
                DynamicJsonDocument document(256);
                const DeserializationError error = deserializeJson(document, manifest);
                manifest.close();
                if (error || !(document["complete"] | false))
                    continue;
                operation.requestId = document["requestId"].as<String>();
                operation.resolution = document["resolution"].as<String>();
                operation.durationMilliseconds = (uint32_t)(
                    (document["requestedDurationSeconds"] | 0.0) * 1000.0);
                operation.totalFrames = document["totalFrames"] | 0;
                totalParts = document["totalParts"] | 0;
                if (isSafeRequestId(operation.requestId)
                    && parseResolution(operation.resolution, operation.frameSize)
                    && totalParts > 0)
                {
                    manifestPath = candidatePath;
                    break;
                }
            }
            directory.close();
            if (!manifestPath.isEmpty())
            {
                bool anyPartRemaining = false;
                for (uint32_t partNumber = 0; partNumber < totalParts; ++partNumber)
                {
                    const String partPath = recordingPartPath(operation, partNumber);
                    if (!SD.exists(partPath))
                        continue;
                    anyPartRemaining = true;
                    if (uploadRecordingPart(partPath, operation, partNumber, totalParts))
                    {
                        SD.remove(partPath);
                        uploadedPart = true;
                        operationUploadsSucceeded++;
                        DynamicJsonDocument event(256);
                        event["requestId"] = operation.requestId;
                        event["resource"] = "recordingPart";
                        event["partNumber"] = partNumber;
                        event["success"] = true;
                        String payload;
                        serializeJson(event, payload);
                        enqueueMqttEvent("upload", payload);
                    }
                    else
                    {
                        operationUploadsFailed++;
                        lastOperationError = OperationError::VideoServiceUploadFailed;
                        DynamicJsonDocument event(256);
                        event["requestId"] = operation.requestId;
                        event["resource"] = "recordingPart";
                        event["partNumber"] = partNumber;
                        event["success"] = false;
                        String payload;
                        serializeJson(event, payload);
                        enqueueMqttEvent("upload", payload);
                    }
                    break;
                }
                if (!anyPartRemaining || uploadedPart)
                {
                    bool stillHasParts = false;
                    for (uint32_t partNumber = 0; partNumber < totalParts; ++partNumber)
                        stillHasParts = stillHasParts
                            || SD.exists(recordingPartPath(operation, partNumber));
                    if (!stillHasParts)
                        SD.remove(manifestPath);
                }
            }
            HAL::hal::GetHal()->sdCardDeinit();
        }
        xSemaphoreTake(operationMutex, portMAX_DELAY);
        uploadActive = false;
        xSemaphoreGive(operationMutex);
        if (uploadedPart)
            xTaskNotifyGive(uploadTaskHandle);
    }
}

}  // namespace video_service_internal
