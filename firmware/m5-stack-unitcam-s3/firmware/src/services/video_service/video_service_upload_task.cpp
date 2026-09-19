/** Background uploader: drains queued captures/timelapses/recordings/audio,
 * one part per wake, while idle. Upload priority order: audio, then
 * captures, then timelapses, then recordings -- one part uploaded per wake
 * cycle, with a self-renotify so a multi-part resource drains promptly. */
#include "video_service_internal.h"

namespace video_service_internal
{
static const char* uploadResourceName(ResourceKind kind)
{
    switch (kind)
    {
        case ResourceKind::Captures: return "capture";
        case ResourceKind::Timelapses: return "timelapse";
        case ResourceKind::Recordings: return "recordingPart";
        case ResourceKind::Audio: return "audioPart";
    }
    return "unknown";
}

static bool uploadPartForKind(
    ResourceKind kind,
    const String& filePath,
    const OperationRequest& operation,
    uint32_t urlPartNumber,
    uint32_t totalParts,
    bool* duplicateOut)
{
    switch (kind)
    {
        case ResourceKind::Captures:
            return uploadCaptureFile(filePath, operation, duplicateOut);
        case ResourceKind::Timelapses:
            return uploadTimelapsePart(filePath, operation, urlPartNumber, totalParts, duplicateOut);
        case ResourceKind::Recordings:
            return uploadRecordingPart(filePath, operation, urlPartNumber, totalParts, duplicateOut);
        case ResourceKind::Audio:
            return uploadAudioPart(filePath, operation, urlPartNumber, totalParts, duplicateOut);
    }
    return false;
}

// Finds the first complete-manifest directory under this kind's root and
// uploads its lowest-numbered still-present part. Returns true if a part was
// uploaded (successfully or as a confirmed duplicate) so the caller
// self-renotifies to keep draining the same resource.
bool uploadOneQueuedResource(ResourceKind kind)
{
    const String rootPath = resourceRootPath(kind);
    if (!SD.exists(rootPath))
        return false;

    // Reading a manifest / checking part existence mid-iteration is safe
    // (the directory listing itself is never mutated while `root` is open).
    // Only a directory found fully drained gets its removal deferred to
    // after `root` is closed, and that list is uncapped since drained
    // directories are always removed by the time the scan reaches them
    // again -- unlike a real backlog of not-yet-uploaded resources, they
    // can't accumulate past whatever this single pass finds.
    File root = SD.open(rootPath, FILE_READ);
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
        if (!directoryPath.startsWith(rootPath + "/"))
            directoryPath = directoryPath.startsWith("/")
                ? rootPath + directoryPath : rootPath + "/" + directoryPath;
        const int slash = directoryPath.lastIndexOf('/');
        const String requestId = directoryPath.substring(slash + 1);
        if (!isSafeRequestId(requestId))
            continue;

        const String manifestPath = resourceManifestPath(kind, requestId);
        ResourceManifestInfo manifest;
        if (!SD.exists(manifestPath) || !readResourceManifest(manifestPath, manifest)
            || !manifest.complete || manifest.kind != kind || manifest.requestId != requestId)
            continue;

        String partPath;
        uint32_t sdPartNumber = 0;
        for (uint32_t candidate = 1; candidate <= manifest.totalParts; ++candidate)
        {
            const String candidatePath = resourcePartPath(kind, requestId, candidate);
            if (SD.exists(candidatePath))
            {
                partPath = candidatePath;
                sdPartNumber = candidate;
                break;
            }
        }

        if (partPath.isEmpty())
        {
            // Every part already uploaded (and removed); nothing left but
            // the manifest -- clean up the now-drained directory and keep
            // scanning, so a second queued resource isn't stalled behind it.
            // Safe to remove while `root` (a listing of the parent
            // directory) is still open: only this already-fully-processed
            // child is deleted, not an entry `root` has yet to visit.
            removeDirectoryRecursive(directoryPath);
            continue;
        }
        root.close();

        // Reconstructed purely from the on-SD manifest -- never recomputed --
        // so every part of one resource sends byte-identical metadata
        // headers, which the hub's assertManifestMetadataMatches requires.
        OperationRequest operation;
        operation.requestId = requestId;
        operation.resolution = manifest.resolution;
        operation.durationMilliseconds = (uint32_t)(manifest.requestedDurationSeconds * 1000.0);
        operation.totalFrames = manifest.totalFrames;

        // The hub's manifest-completeness check requires URL partNumbers to
        // be the exact 0-based set [0..totalParts-1]; SD filenames are
        // 1-based, so translate here, once, at the upload boundary.
        const uint32_t urlPartNumber = sdPartNumber - 1;
        bool duplicate = false;
        const bool success = uploadPartForKind(
            kind, partPath, operation, urlPartNumber, manifest.totalParts, &duplicate);

        DynamicJsonDocument event(256);
        event["requestId"] = requestId;
        event["resource"] = uploadResourceName(kind);
        event["partNumber"] = urlPartNumber;
        event["success"] = success;
        if (success)
            event["duplicate"] = duplicate;
        String payload;
        serializeJson(event, payload);
        enqueueMqttEvent("upload", payload);

        if (success)
        {
            // A hub-reported duplicate is treated exactly like a successful
            // upload: the part is done, so it's removed the same way.
            SD.remove(partPath);
            operationUploadsSucceeded++;
            bool anyPartRemaining = false;
            for (uint32_t candidate = 1; candidate <= manifest.totalParts; ++candidate)
                anyPartRemaining = anyPartRemaining
                    || SD.exists(resourcePartPath(kind, requestId, candidate));
            if (!anyPartRemaining)
                removeDirectoryRecursive(directoryPath);
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
            for (ResourceKind kind :
                {ResourceKind::Captures, ResourceKind::Timelapses,
                 ResourceKind::Recordings, ResourceKind::Audio})
            {
                const String rootPath = resourceRootPath(kind);
                if (!SD.exists(rootPath))
                    SD.mkdir(rootPath);
            }
            cleanupOrphanedResourceParts();

            // Priority order: audio, captures, timelapses, then one
            // recording part -- matches the pre-refactor ordering
            // (audio/captures first, mirroring their original small/quick
            // uploads) extended uniformly now that audio is part-based too.
            uploadedPart = uploadOneQueuedResource(ResourceKind::Audio);
            if (!uploadedPart)
                uploadedPart = uploadOneQueuedResource(ResourceKind::Captures);
            if (!uploadedPart)
                uploadedPart = uploadOneQueuedResource(ResourceKind::Timelapses);
            if (!uploadedPart)
                uploadedPart = uploadOneQueuedResource(ResourceKind::Recordings);

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
