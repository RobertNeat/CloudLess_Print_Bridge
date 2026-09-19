/** Raw HTTP client plumbing used to upload captures/recordings/audio to the hub. */
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

bool openVideoServiceRequest(
    WiFiClient& client,
    const String& path,
    const String& contentType,
    int64_t contentLength,
    const OperationRequest& operation,
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
    client.printf("X-Camera-Id: %s\r\n", cameraId().c_str());
    client.printf("X-Request-Id: %s\r\n", operation.requestId.c_str());
    if (!operation.resolution.isEmpty())
        client.printf("X-Resolution: %s\r\n", operation.resolution.c_str());
    if (operation.kind == OperationKind::AudioRecording)
        client.printf("X-Duration-Seconds: %.3f\r\n",
            operation.durationMilliseconds / 1000.0);
    else
    {
        client.printf("X-Requested-Duration-Seconds: %.3f\r\n",
            operation.durationMilliseconds / 1000.0);
        client.printf("X-Total-Frames: %u\r\n", (unsigned)operation.totalFrames);
    }
    if (partNumber >= 0)
        client.printf("X-Part-Number: %ld\r\n", (long)partNumber);
    if (totalParts > 0)
        client.printf("X-Total-Parts: %ld\r\n", (long)totalParts);
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

bool uploadCaptureFile(const String& filePath, const OperationRequest& operation)
{
    File file = SD.open(filePath, FILE_READ);
    if (!file)
        return false;
    WiFiClient client;
    const String path = "/api/v1/cameras/" + cameraId() + "/captures";
    bool success = openVideoServiceRequest(
        client, path, "image/jpeg", file.size(), operation);
    uint8_t buffer[2048];
    while (success && file.available())
    {
        const size_t count = file.read(buffer, sizeof(buffer));
        success = count > 0 && writeAll(client, buffer, count);
    }
    file.close();
    if (success)
        success = readHttpSuccess(client);
    client.stop();
    videoServiceReachable = success;
    return success;
}

bool uploadRecordingPart(
    const String& filePath,
    const OperationRequest& operation,
    uint32_t partNumber,
    uint32_t totalParts)
{
    File file = SD.open(filePath, FILE_READ);
    if (!file)
        return false;
    WiFiClient client;
    const String path = "/api/v1/cameras/" + cameraId()
        + "/recordings/" + operation.requestId
        + "/parts/" + String(partNumber);
    bool success = openVideoServiceRequest(
        client, path, "multipart/x-mixed-replace; boundary=unitcams3-frame",
        file.size(), operation, false, partNumber, totalParts);
    uint8_t buffer[2048];
    while (success && file.available())
    {
        const size_t count = file.read(buffer, sizeof(buffer));
        success = count > 0 && writeAll(client, buffer, count);
    }
    file.close();
    if (success)
        success = readHttpSuccess(client);
    client.stop();
    videoServiceReachable = success;
    return success;
}

bool uploadAudioFile(const String& filePath, const OperationRequest& operation)
{
    File file = SD.open(filePath, FILE_READ);
    if (!file)
        return false;
    WiFiClient client;
    const String path = "/api/v1/cameras/" + cameraId() + "/audio";
    bool success = openVideoServiceRequest(
        client, path, "audio/wav", file.size(), operation);
    uint8_t buffer[2048];
    while (success && file.available())
    {
        const size_t count = file.read(buffer, sizeof(buffer));
        success = count > 0 && writeAll(client, buffer, count);
    }
    file.close();
    if (success)
        success = readHttpSuccess(client);
    client.stop();
    videoServiceReachable = success;
    return success;
}

}  // namespace video_service_internal
