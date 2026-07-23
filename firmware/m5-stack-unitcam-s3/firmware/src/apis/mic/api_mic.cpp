/** Implements direct and video-service WAV recording with one shared recorder. */
#include <mooncake.h>
#include "api_mic.h"

#include <Arduino.h>
#include <LittleFS.h>
#include "hal/hal.h"
#include "services/video_service/video_service.h"

namespace
{
constexpr size_t RecordLength = 256;
constexpr size_t RecordBufferCount = 4;
constexpr size_t RecordBufferSize = RecordBufferCount * RecordLength;
constexpr size_t RecordSampleRate = 16000;
constexpr uint32_t MaximumRecordingSeconds = 20;

bool microphoneRecording = false;
SemaphoreHandle_t microphoneMutex = nullptr;
volatile uint32_t requestedRecordingSeconds = 4;
size_t recordIndex = 0;
int16_t recordBuffer[RecordBufferSize];

struct __attribute__((packed)) WavHeader
{
    char riff[4] = {'R', 'I', 'F', 'F'};
    uint32_t chunkSize = 36;
    char waveFormat[8] = {'W', 'A', 'V', 'E', 'f', 'm', 't', ' '};
    uint32_t formatChunkSize = 16;
    uint16_t audioFormat = 1;
    uint16_t channels = 2;
    uint32_t sampleRate = RecordSampleRate;
    uint32_t bytesPerSecond = RecordSampleRate * 4;
    uint16_t blockAlignment = 4;
    uint16_t bitsPerSample = 16;
    char dataIdentifier[4] = {'d', 'a', 't', 'a'};
    uint32_t dataSize = 0;
};

void directRecordingTask(void*)
{
    if (!LittleFS.exists("/wav") && !LittleFS.mkdir("/wav"))
        spdlog::error("unable to create WAV directory");
    else if (!recordWavFile(LittleFS, "/wav/rec.wav", requestedRecordingSeconds))
        spdlog::error("direct WAV recording failed");
    releaseMicrophoneRecorder();
    vTaskDelete(nullptr);
}
}

bool acquireMicrophoneRecorder()
{
    if (microphoneMutex == nullptr)
        return false;
    bool acquired = false;
    if (xSemaphoreTake(microphoneMutex, pdMS_TO_TICKS(2000)) == pdTRUE)
    {
        if (!microphoneRecording)
        {
            microphoneRecording = true;
            acquired = true;
        }
        xSemaphoreGive(microphoneMutex);
    }
    return acquired;
}

void releaseMicrophoneRecorder()
{
    if (microphoneMutex != nullptr
        && xSemaphoreTake(microphoneMutex, portMAX_DELAY) == pdTRUE)
    {
        microphoneRecording = false;
        xSemaphoreGive(microphoneMutex);
    }
    publish_video_service_event("microphone", "{\"recording\":false}");
}

bool isMicrophoneRecording()
{
    if (microphoneMutex == nullptr)
        return false;
    bool recording = true;
    if (xSemaphoreTake(microphoneMutex, pdMS_TO_TICKS(2000)) == pdTRUE)
    {
        recording = microphoneRecording;
        xSemaphoreGive(microphoneMutex);
    }
    return recording;
}

bool isValidAudioDuration(uint32_t seconds)
{
    return seconds >= 1 && seconds <= MaximumRecordingSeconds;
}

bool recordWavFile(fs::FS& filesystem, const char* path, uint32_t seconds)
{
    if (!isValidAudioDuration(seconds) || path == nullptr)
        return false;

    publish_video_service_event("microphone", "{\"recording\":true}");
    auto microphoneConfig = HAL::hal::GetHal()->mic->config();
    microphoneConfig.dma_buf_count = 8;
    microphoneConfig.dma_buf_len = 512;
    microphoneConfig.stereo = true;
    HAL::hal::GetHal()->mic->config(microphoneConfig);

    const size_t sampleCapacity = (size_t)seconds * RecordSampleRate * 2;
    int16_t* samples = (int16_t*)heap_caps_malloc(
        sampleCapacity * sizeof(int16_t), MALLOC_CAP_SPIRAM);
    if (samples == nullptr)
        return false;
    memset(samples, 0, sampleCapacity * sizeof(int16_t));

    size_t sampleCount = 0;
    recordIndex = 0;
    while (sampleCount < sampleCapacity)
    {
        recordIndex = (recordIndex + 1) & (RecordBufferCount - 1);
        int16_t* input = &recordBuffer[recordIndex * RecordLength];
        const size_t completedIndex = (recordIndex - 2) & (RecordBufferCount - 1);
        int16_t* completed = &recordBuffer[completedIndex * RecordLength];
        HAL::hal::GetHal()->mic->record(input, RecordLength, RecordSampleRate);
        while (HAL::hal::GetHal()->mic->isRecording())
            delay(1);
        const size_t samplesToCopy = min(RecordLength, sampleCapacity - sampleCount);
        memcpy(samples + sampleCount, completed, samplesToCopy * sizeof(int16_t));
        sampleCount += samplesToCopy;
    }

    File output = filesystem.open(path, FILE_WRITE);
    bool success = false;
    if (output)
    {
        WavHeader header;
        header.dataSize = sampleCount * sizeof(int16_t);
        header.chunkSize = header.dataSize + 36;
        success = output.write((const uint8_t*)&header, sizeof(header)) == sizeof(header)
            && output.write((const uint8_t*)samples, header.dataSize) == header.dataSize;
        output.flush();
        output.close();
    }
    free(samples);
    if (!success)
        filesystem.remove(path);
    return success;
}

void startMicRecording(AsyncWebServerRequest* request)
{
    const uint32_t seconds = request->hasParam("seconds")
        ? request->getParam("seconds")->value().toInt() : 4;
    if (!isValidAudioDuration(seconds))
    {
        request->send(400, "application/json", "{\"error\":\"seconds_must_be_1_to_20\"}");
        return;
    }
    if (!acquireMicrophoneRecorder())
    {
        request->send(409, "application/json", "{\"error\":\"microphone_busy\"}");
        return;
    }
    requestedRecordingSeconds = seconds;
    const BaseType_t created = xTaskCreatePinnedToCore(
        directRecordingTask, "mic", 4000, nullptr, 3, nullptr, 1);
    if (created != pdPASS)
    {
        releaseMicrophoneRecorder();
        request->send(503, "application/json", "{\"error\":\"recording_task_unavailable\"}");
        return;
    }
    request->send(202, "application/json", "{\"status\":\"accepted\"}");
}

void isMicRecording(AsyncWebServerRequest* request)
{
    request->send(200, "application/json",
        isMicrophoneRecording() ? "{\"recording\":true}" : "{\"recording\":false}");
}

void load_mic_apis(AsyncWebServer& server)
{
    if (microphoneMutex == nullptr)
        microphoneMutex = xSemaphoreCreateMutex();
    server.on("/api/v1/mic_start", HTTP_GET, startMicRecording);
    server.on("/api/v1/mic_is_recording", HTTP_GET, isMicRecording);
}
