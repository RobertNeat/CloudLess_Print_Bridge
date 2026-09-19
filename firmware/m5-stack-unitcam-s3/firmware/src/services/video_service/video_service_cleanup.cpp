/** Startup/idle scans that discard invalid resource directories across all
 * four durable kinds (captures/timelapses/recordings/audio), plus resource
 * directories the uploader has fully drained (manifest complete, every part
 * already uploaded and removed).
 *
 * A directory is INVALID only if its manifest.json is missing, malformed, or
 * declares `complete:false`/a mismatched kind/requestId -- a missing PART
 * file is never itself evidence of invalidity, since the uploader removes
 * parts one at a time as they're confirmed delivered (see
 * video_service_upload_task.cpp) and leaves the manifest + remaining parts
 * in place until every part is gone. Treating "part missing" as "garbage"
 * would make this scan destroy an in-flight, partially-uploaded resource the
 * moment its first part succeeds -- it can't be distinguished from "never
 * written" by on-disk state alone. Part completeness is already enforced at
 * the point a manifest is allowed to claim `complete:true`
 * (writeResourceManifest verifies every declared part exists and is
 * non-empty first). */
#include "video_service_internal.h"

namespace video_service_internal
{
static void cleanupResourceKind(ResourceKind kind)
{
    const String rootPath = resourceRootPath(kind);
    if (!SD.exists(rootPath))
        return;

    // Directories are marked for removal while walking `root`, then removed
    // only after `root` is closed -- deleting a subdirectory out from under
    // an active FAT directory iterator is best avoided.
    String doomedPaths[32];
    size_t doomedCount = 0;

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

        bool valid = isSafeRequestId(requestId);
        bool fullyDrained = false;
        if (valid)
        {
            const String manifestPath = resourceManifestPath(kind, requestId);
            ResourceManifestInfo manifest;
            valid = SD.exists(manifestPath)
                && readResourceManifest(manifestPath, manifest)
                && manifest.complete
                && manifest.kind == kind
                && manifest.requestId == requestId;
            if (valid)
            {
                fullyDrained = true;
                for (uint32_t partNumber = 1; partNumber <= manifest.totalParts; ++partNumber)
                {
                    if (SD.exists(resourcePartPath(kind, requestId, partNumber)))
                    {
                        fullyDrained = false;
                        break;
                    }
                }
            }
        }
        if ((!valid || fullyDrained) && doomedCount < (sizeof(doomedPaths) / sizeof(doomedPaths[0])))
        {
            if (!valid)
                log_w("Removing invalid resource directory: %s", directoryPath.c_str());
            doomedPaths[doomedCount++] = directoryPath;
        }
    }
    root.close();

    for (size_t index = 0; index < doomedCount; ++index)
        removeDirectoryRecursive(doomedPaths[index]);
}

// SD's library has no recursive-remove helper; these directories are always
// shallow (a manifest.json/.tmp plus a handful of numbered part files), so a
// flat single-level walk is sufficient.
void removeDirectoryRecursive(const String& directoryPath)
{
    File directory = SD.open(directoryPath, FILE_READ);
    if (!directory)
        return;
    while (true)
    {
        File entry = directory.openNextFile();
        if (!entry)
            break;
        String path = entry.name();
        const bool isDirectory = entry.isDirectory();
        entry.close();
        if (!path.startsWith(directoryPath + "/"))
            path = path.startsWith("/") ? directoryPath + path : directoryPath + "/" + path;
        if (!isDirectory)
            SD.remove(path);
    }
    directory.close();
    SD.rmdir(directoryPath);
}

void cleanupOrphanedResourceParts()
{
    cleanupResourceKind(ResourceKind::Captures);
    cleanupResourceKind(ResourceKind::Timelapses);
    cleanupResourceKind(ResourceKind::Recordings);
    cleanupResourceKind(ResourceKind::Audio);
}

}  // namespace video_service_internal
