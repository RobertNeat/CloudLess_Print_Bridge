/** Declares direct and video-service microphone recording operations. */
#pragma once

#include <ESPAsyncWebServer.h>
#include <FS.h>

void startMicRecording(AsyncWebServerRequest* request);
void isMicRecording(AsyncWebServerRequest* request);
void load_mic_apis(AsyncWebServer& server);

bool acquireMicrophoneRecorder();
void releaseMicrophoneRecorder();
bool isMicrophoneRecording();
bool isValidAudioDuration(uint32_t seconds);
bool recordWavFile(fs::FS& filesystem, const char* path, uint32_t seconds);
