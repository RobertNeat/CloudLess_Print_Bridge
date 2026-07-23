/**
 * @file api_cam.h
 * @author Forairaaaaa
 * @brief https://gist.github.com/me-no-dev/d34fba51a8f059ac559bf62002e61aa3
 * @version 0.1
 * @date 2023-11-01
 * 
 * @copyright Copyright (c) 2023
 * 
 */
#include <ESPAsyncWebServer.h>
#include <esp_camera.h>
// #include <WebServer.h>

void sendJpg(AsyncWebServerRequest *request);
void sendUxgaJpg(AsyncWebServerRequest *request);
void streamJpg(AsyncWebServerRequest *request);
void streamDynamicJpg(AsyncWebServerRequest *request);
void getDynamicStatus(AsyncWebServerRequest *request);
void getRuntimeStatus(AsyncWebServerRequest *request);
void getCameraStatus(AsyncWebServerRequest *request);
void setCameraVar(AsyncWebServerRequest *request);

void load_cam_apis(AsyncWebServer& server);

enum class CameraOperationOwner
{
    None,
    Dashboard,
    VideoService,
};

struct CameraRuntimeMetrics
{
    bool streaming;
    bool cameraPowered;
    bool dynamic;
    float framesPerSecond;
    float chipTemperatureCelsius;
    framesize_t frameSize;
    CameraOperationOwner owner;
};

// Video-service work has priority. Requesting it asks an active dashboard
// response to close and waits for its framebuffer/camera lease to be released.
bool acquireVideoServiceCamera(uint32_t timeoutMilliseconds, bool streaming = false);
void releaseVideoServiceCamera();
bool isVideoServiceCameraRequested();
CameraRuntimeMetrics getCameraRuntimeMetrics();
void updateVideoServiceStreamMetrics(framesize_t frameSize, float framesPerSecond);
camera_fb_t* captureFrameAtSize(framesize_t frameSize);
