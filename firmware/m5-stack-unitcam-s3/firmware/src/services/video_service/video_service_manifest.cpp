/** manifest.json reader/writer shared across all four durable resource
 * kinds. Fields that don't apply to a kind are simply omitted -- mirrors the
 * hub's own ResourceManifest shape. Writes use write-to-.tmp-then-atomic-
 * rename so a crash mid-write never leaves a half-written manifest that a
 * scanner could mistake for complete. */
#include "video_service_internal.h"

namespace video_service_internal
{
bool writeResourceManifest(const ResourceManifestInfo& info)
{
    if (info.totalParts == 0 || !isSafeRequestId(info.requestId))
        return false;
    // Every declared part must actually exist and be non-empty before the
    // manifest is allowed to claim completeness -- mirrors the previous
    // recording-manifest guard, generalized to all kinds.
    for (uint32_t partNumber = 1; partNumber <= info.totalParts; ++partNumber)
    {
        File part = SD.open(resourcePartPath(info.kind, info.requestId, partNumber), FILE_READ);
        const bool valid = part && part.size() > 0;
        part.close();
        if (!valid)
            return false;
    }

    const String manifestPath = resourceManifestPath(info.kind, info.requestId);
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
        document["requestId"] = info.requestId;
        document["kind"] = resourceRootName(info.kind) + 1;  // strip leading '/'
        document["totalParts"] = info.totalParts;
        if (!info.resolution.isEmpty())
            document["resolution"] = info.resolution;
        if (info.kind == ResourceKind::Recordings || info.kind == ResourceKind::Audio)
            document["requestedDurationSeconds"] = info.requestedDurationSeconds;
        if (info.kind == ResourceKind::Recordings || info.kind == ResourceKind::Timelapses)
            document["totalFrames"] = info.totalFrames;
        document["complete"] = info.complete;
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

bool readResourceManifest(const String& manifestPath, ResourceManifestInfo& infoOut)
{
    File manifest = SD.open(manifestPath, FILE_READ);
    if (!manifest)
        return false;
    DynamicJsonDocument document(384);
    const DeserializationError error = deserializeJson(document, manifest);
    manifest.close();
    if (error)
        return false;

    const String kindText = document["kind"].as<String>();
    if (kindText == "captures") infoOut.kind = ResourceKind::Captures;
    else if (kindText == "timelapses") infoOut.kind = ResourceKind::Timelapses;
    else if (kindText == "recordings") infoOut.kind = ResourceKind::Recordings;
    else if (kindText == "audio") infoOut.kind = ResourceKind::Audio;
    else return false;

    infoOut.requestId = document["requestId"].as<String>();
    infoOut.totalParts = document["totalParts"] | 0;
    infoOut.resolution = document["resolution"].isNull()
        ? String() : document["resolution"].as<String>();
    infoOut.requestedDurationSeconds = document["requestedDurationSeconds"] | 0.0;
    infoOut.totalFrames = document["totalFrames"] | 0;
    infoOut.complete = document["complete"] | false;
    return isSafeRequestId(infoOut.requestId) && infoOut.totalParts > 0;
}

}  // namespace video_service_internal
