/** Raw HTTP client plumbing used to upload captures/timelapses/recordings/
 * audio parts and the live stream to the hub. Every part-based upload reads
 * the hub's JSON response for `"duplicate":true`, which is treated exactly
 * like a successful upload (the hub already has byte-identical content). */
#include "video_service_internal.h"

namespace video_service_internal
{
bool readHttpSuccess(WiFiClient& client)
{
    const uint32_t startedAt = millis();
    while (!client.available() && client.connected() && millis() - startedAt < 5000)
        delay(10);
    const String statusLine = client.readStringUntil('\n');
    return statusLine.indexOf(" 2") > 0;
}

// Reads the (small, unchunked) JSON body of a 2xx response looking for
// `"duplicate":true`. Best-effort: any read hiccup simply leaves duplicate
// false, which is safe (the caller still treats the 2xx as a success).
static bool readDuplicateFlag(WiFiClient& client)
{
    String body;
    const uint32_t startedAt = millis();
    while (millis() - startedAt < 2000)
    {
        while (client.available())
            body += (char)client.read();
        if (!client.connected() && !client.available())
            break;
        if (body.length() > 512)
            break;
        delay(1);
    }
    const int marker = body.indexOf("\"duplicate\"");
    if (marker < 0)
        return false;
    // Look only in the short window right after the key for its value, so an
    // unrelated later "true" in the body can't produce a false positive.
    const int windowEnd = min((int)body.length(), marker + 24);
    const String window = body.substring(marker, windowEnd);
    return window.indexOf("true") >= 0;
}

bool openVideoServiceRequest(
    WiFiClient& client,
    const String& path,
    const String& contentType,
    int64_t contentLength,
    const OperationRequest& operation,
    UploadHeaderStyle headerStyle,
    const String& sha256Hex,
    bool chunked,
    int32_t partNumber,
    int32_t totalParts)
{
    const auto config = HAL::hal::GetHal()->getConfig();
    client.setTimeout(5);
    if (!client.connect(config.video_service_ip.c_str(), config.video_service_port, 5000))
        return false;
    client.printf("POST %s HTTP/1.1\r\n", path.c_str());
    client.printf("Host: %s:%u\r\n", config.video_service_ip.c_str(), config.video_service_port);
    client.printf("Content-Type: %s\r\n", contentType.c_str());
    client.printf("X-Request-Id: %s\r\n", operation.requestId.c_str());
    if (!operation.resolution.isEmpty())
        client.printf("X-Resolution: %s\r\n", operation.resolution.c_str());
    if (headerStyle == UploadHeaderStyle::AudioDuration)
        client.printf("X-Duration-Seconds: %.3f\r\n",
            operation.durationMilliseconds / 1000.0);
    else if (headerStyle == UploadHeaderStyle::RecordingDuration)
    {
        client.printf("X-Requested-Duration-Seconds: %.3f\r\n",
            operation.durationMilliseconds / 1000.0);
        client.printf("X-Total-Frames: %u\r\n", (unsigned)operation.totalFrames);
    }
    // Note: no X-Part-Number header -- the hub reads partNumber from the URL
    // path segment only (never a header), same reasoning as dropping
    // X-Camera-Id below.
    if (totalParts > 0)
        client.printf("X-Total-Parts: %ld\r\n", (long)totalParts);
    if (!sha256Hex.isEmpty())
        client.printf("X-Sha256: %s\r\n", sha256Hex.c_str());
    if (chunked)
        client.print("Transfer-Encoding: chunked\r\n");
    else
        client.printf("Content-Length: %lld\r\n", contentLength);
    client.print("Connection: close\r\n\r\n");
    return client.connected();
}

bool writeAll(WiFiClient& client, const uint8_t* data, size_t length)
{
    size_t offset = 0;
    const uint32_t startedAt = millis();
    while (offset < length && client.connected())
    {
        const size_t written = client.write(data + offset, length - offset);
        if (written > 0)
            offset += written;
        else if (millis() - startedAt > 5000)
            break;
        else
            delay(1);
    }
    return offset == length;
}

bool writeChunk(WiFiClient& client, const uint8_t* data, size_t length)
{
    client.printf("%x\r\n", (unsigned)length);
    return writeAll(client, data, length) && client.print("\r\n") == 2;
}

// Shared upload body: opens the request, streams the file, reads the
// response, and reports success (2xx OR hub-reported duplicate) uniformly.
static bool uploadFileBody(
    const String& filePath,
    const String& path,
    const String& contentType,
    const OperationRequest& operation,
    UploadHeaderStyle headerStyle,
    const String& sha256Hex,
    int32_t partNumber,
    int32_t totalParts,
    bool* duplicateOut)
{
    if (duplicateOut != nullptr)
        *duplicateOut = false;
    File file = SD.open(filePath, FILE_READ);
    if (!file)
        return false;
    WiFiClient client;
    bool success = openVideoServiceRequest(
        client, path, contentType, file.size(), operation, headerStyle, sha256Hex,
        false, partNumber, totalParts);
    uint8_t buffer[2048];
    while (success && file.available())
    {
        const size_t count = file.read(buffer, sizeof(buffer));
        success = count > 0 && writeAll(client, buffer, count);
    }
    file.close();
    if (success)
    {
        success = readHttpSuccess(client);
        if (success && duplicateOut != nullptr)
            *duplicateOut = readDuplicateFlag(client);
    }
    client.stop();
    videoServiceReachable = success;
    return success;
}

bool uploadCaptureFile(
    const String& filePath,
    const OperationRequest& operation,
    bool* duplicateOut)
{
    String sha256Hex;
    if (!sha256HexOfFile(filePath, sha256Hex))
        return false;
    const String path = "/api/v1/cameras/" + cameraId()
        + "/captures/" + operation.requestId;
    return uploadFileBody(filePath, path, "image/jpeg", operation,
        UploadHeaderStyle::None, sha256Hex, -1, -1, duplicateOut);
}

bool uploadTimelapsePart(
    const String& filePath,
    const OperationRequest& operation,
    uint32_t partNumber,
    uint32_t totalParts,
    bool* duplicateOut)
{
    String sha256Hex;
    if (!sha256HexOfFile(filePath, sha256Hex))
        return false;
    const String path = "/api/v1/cameras/" + cameraId()
        + "/timelapses/" + operation.requestId
        + "/parts/" + String(partNumber);
    return uploadFileBody(filePath, path, "image/jpeg", operation,
        UploadHeaderStyle::None, sha256Hex, partNumber, totalParts, duplicateOut);
}

bool uploadRecordingPart(
    const String& filePath,
    const OperationRequest& operation,
    uint32_t partNumber,
    uint32_t totalParts,
    bool* duplicateOut)
{
    String sha256Hex;
    if (!sha256HexOfFile(filePath, sha256Hex))
        return false;
    const String path = "/api/v1/cameras/" + cameraId()
        + "/recordings/" + operation.requestId
        + "/parts/" + String(partNumber);
    return uploadFileBody(filePath, path,
        "multipart/x-mixed-replace; boundary=unitcams3-frame", operation,
        UploadHeaderStyle::RecordingDuration, sha256Hex, partNumber, totalParts, duplicateOut);
}

bool uploadAudioPart(
    const String& filePath,
    const OperationRequest& operation,
    uint32_t partNumber,
    uint32_t totalParts,
    bool* duplicateOut)
{
    String sha256Hex;
    if (!sha256HexOfFile(filePath, sha256Hex))
        return false;
    const String path = "/api/v1/cameras/" + cameraId()
        + "/audio/" + operation.requestId
        + "/parts/" + String(partNumber);
    return uploadFileBody(filePath, path, "audio/wav", operation,
        UploadHeaderStyle::AudioDuration, sha256Hex, partNumber, totalParts, duplicateOut);
}

}  // namespace video_service_internal
