/** SD-card path builders for the directory-per-request resource layout:
 * storage/{captures,timelapses,recordings,audio}/{requestId}/NNN.ext +
 * manifest.json. Part numbers on SD are 1-based/3-digit; the hub's URL
 * partNumber is 0-based (see resourcePartPath's note). */
#include "video_service_internal.h"

namespace video_service_internal
{
const char* resourceRootName(ResourceKind kind)
{
    switch (kind)
    {
        case ResourceKind::Captures: return "/captures";
        case ResourceKind::Timelapses: return "/timelapses";
        case ResourceKind::Recordings: return "/recordings";
        case ResourceKind::Audio: return "/audio";
    }
    return "/captures";
}

const char* resourcePartExtension(ResourceKind kind)
{
    switch (kind)
    {
        case ResourceKind::Captures: return "jpg";
        case ResourceKind::Timelapses: return "jpg";
        case ResourceKind::Recordings: return "mjpeg";
        case ResourceKind::Audio: return "wav";
    }
    return "jpg";
}

String resourceRootPath(ResourceKind kind)
{
    return String(resourceRootName(kind));
}

String resourceDirectoryPath(ResourceKind kind, const String& requestId)
{
    return resourceRootPath(kind) + "/" + requestId;
}

// `partNumber` here is the on-SD, 1-based ordinal (001.jpg is the first
// part). Callers that build the upload URL's {partNumber} path segment must
// subtract 1 -- the hub's manifest.complete check requires the URL's
// partNumber values to be the exact 0-based set [0..totalParts-1].
String resourcePartPath(ResourceKind kind, const String& requestId, uint32_t partNumber)
{
    char fileName[16];
    snprintf(fileName, sizeof(fileName), "/%03u.%s",
        (unsigned)partNumber, resourcePartExtension(kind));
    return resourceDirectoryPath(kind, requestId) + fileName;
}

String resourceManifestPath(ResourceKind kind, const String& requestId)
{
    return resourceDirectoryPath(kind, requestId) + "/manifest.json";
}

bool persistCapture(File& file, camera_fb_t* frame)
{
    const size_t written = file.write(frame->buf, frame->len);
    file.flush();
    file.close();
    return written == frame->len;
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

}  // namespace video_service_internal
