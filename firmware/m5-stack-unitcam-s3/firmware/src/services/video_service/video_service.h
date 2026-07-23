/** Declares the firmware integration surface for the external video service. */
#pragma once

#include <ESPAsyncWebServer.h>

void load_video_service_apis(AsyncWebServer& server);
void start_video_service_background_tasks();
bool is_video_service_operation_active();
void publish_video_service_event(const char* topicSuffix, const String& payload);
