/**
 * @file api_cam.cpp
 * @author Forairaaaaa
 * @brief 
 * @version 0.1
 * @date 2023-11-01
 * 
 * @copyright Copyright (c) 2023
 * 
 */
#include "Arduino.h"
#include "esp_camera.h"
#include "ESPAsyncWebServer.h"
#include <ArduinoJson.h>
#include <math.h>
#include <driver/temp_sensor.h>
#include <WiFi.h>
#include "api_cam.h"
#include "../../hal/hal.h"

typedef struct {
        camera_fb_t * fb;
        size_t index;
} camera_frame_t;

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* STREAM_BOUNDARY_FIRST = "--" PART_BOUNDARY "\r\n";
static const char* STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* STREAM_PART = "Content-Type: %s\r\nContent-Length: %u\r\n\r\n";

static const char * JPG_CONTENT_TYPE = "image/jpeg";
static constexpr uint32_t MAX_STREAM_FPS = 25;
static constexpr uint32_t MIN_STREAM_FRAME_INTERVAL_US = 1000000UL / MAX_STREAM_FPS;
static constexpr uint32_t CAPTURE_SETTINGS_SETTLE_MS = 100;

static volatile float _dynamic_temperature = 0.0f;
static volatile framesize_t _dynamic_framesize = FRAMESIZE_UXGA;
static volatile bool _restart_scheduled = false;
static volatile uint16_t _active_streams = 0;
static volatile bool _dynamic_stream_active = false;
static volatile float _stream_fps = 0.0f;
static volatile framesize_t _last_framesize = FRAMESIZE_VGA;
static volatile bool _video_service_requested = false;
static volatile bool _video_service_active = false;
static volatile bool _video_service_streaming = false;
static volatile bool _dashboard_stream_pending = false;
static AsyncClient* _dashboard_stream_client = nullptr;
static portMUX_TYPE _stream_state_mux = portMUX_INITIALIZER_UNLOCKED;

static bool isStreaming()
{
    portENTER_CRITICAL(&_stream_state_mux);
    const bool active = _active_streams > 0;
    portEXIT_CRITICAL(&_stream_state_mux);
    return active;
}

static bool isCameraBusy()
{
    portENTER_CRITICAL(&_stream_state_mux);
    const bool busy = _active_streams > 0 || _dashboard_stream_pending
        || _video_service_requested || _video_service_active;
    portEXIT_CRITICAL(&_stream_state_mux);
    return busy;
}

bool isVideoServiceCameraRequested()
{
    portENTER_CRITICAL(&_stream_state_mux);
    const bool requested = _video_service_requested;
    portEXIT_CRITICAL(&_stream_state_mux);
    return requested;
}

bool acquireVideoServiceCamera(uint32_t timeoutMilliseconds, bool streaming)
{
    portENTER_CRITICAL(&_stream_state_mux);
    if (_video_service_active || _video_service_requested)
    {
        portEXIT_CRITICAL(&_stream_state_mux);
        return false;
    }
    _video_service_requested = true;
    AsyncClient* dashboardClient = _dashboard_stream_client;
    portEXIT_CRITICAL(&_stream_state_mux);
    if (dashboardClient != nullptr)
        dashboardClient->close(true);

    const uint32_t startedAt = millis();
    while (true)
    {
        portENTER_CRITICAL(&_stream_state_mux);
        const bool available = _active_streams == 0
            && !_dashboard_stream_pending && !_video_service_active;
        if (available)
        {
            _video_service_active = true;
            _video_service_streaming = streaming;
        }
        portEXIT_CRITICAL(&_stream_state_mux);
        if (available)
            break;
        if (millis() - startedAt >= timeoutMilliseconds)
        {
            portENTER_CRITICAL(&_stream_state_mux);
            _video_service_requested = false;
            portEXIT_CRITICAL(&_stream_state_mux);
            return false;
        }
        delay(20);
    }

    if (!HAL::hal::GetHal()->cameraAcquire())
    {
        portENTER_CRITICAL(&_stream_state_mux);
        _video_service_active = false;
        _video_service_streaming = false;
        _video_service_requested = false;
        portEXIT_CRITICAL(&_stream_state_mux);
        return false;
    }
    if (WiFi.getMode() == WIFI_STA)
        WiFi.setSleep(false);
    return true;
}

void releaseVideoServiceCamera()
{
    HAL::hal::GetHal()->cameraRelease();
    portENTER_CRITICAL(&_stream_state_mux);
    _video_service_active = false;
    _video_service_streaming = false;
    _video_service_requested = false;
    const bool dashboardIdle = _active_streams == 0;
    portEXIT_CRITICAL(&_stream_state_mux);
    if (dashboardIdle && WiFi.getMode() == WIFI_STA)
        WiFi.setSleep(true);
}

static bool reserveDashboardStream(AsyncClient* client)
{
    portENTER_CRITICAL(&_stream_state_mux);
    const bool available = !_dashboard_stream_pending && _active_streams == 0
        && !_video_service_requested && !_video_service_active;
    if (available)
    {
        _dashboard_stream_pending = true;
        _dashboard_stream_client = client;
    }
    portEXIT_CRITICAL(&_stream_state_mux);
    return available;
}

static void cancelDashboardReservation(AsyncClient* client)
{
    portENTER_CRITICAL(&_stream_state_mux);
    _dashboard_stream_pending = false;
    if (_dashboard_stream_client == client)
        _dashboard_stream_client = nullptr;
    portEXIT_CRITICAL(&_stream_state_mux);
}

static void streamStarted(bool dynamic)
{
    bool firstStream = false;
    portENTER_CRITICAL(&_stream_state_mux);
    firstStream = _active_streams == 0;
    _active_streams++;
    _dashboard_stream_pending = false;
    _dynamic_stream_active = dynamic;
    _stream_fps = 0.0f;
    portEXIT_CRITICAL(&_stream_state_mux);

    if(firstStream && WiFi.getMode() == WIFI_STA){
        WiFi.setSleep(false);
        log_i("WiFi modem power saving disabled for camera stream");
    }
}

static void streamStopped()
{
    bool becameIdle = false;
    portENTER_CRITICAL(&_stream_state_mux);
    if (_active_streams > 0)
        _active_streams--;
    if (_active_streams == 0)
    {
        becameIdle = true;
        _dynamic_stream_active = false;
        _stream_fps = 0.0f;
        _dashboard_stream_client = nullptr;
    }
    portEXIT_CRITICAL(&_stream_state_mux);

    if(becameIdle && WiFi.getMode() == WIFI_STA){
        WiFi.setSleep(true);
        log_i("WiFi modem power saving enabled after camera stream");
    }
}

static float readChipTemperature()
{
    // Arduino's temperatureRead() uses TSENS_DAC_L2 (-10..80 C). Close to
    // the protection threshold it can leave its valid range and appear as 0.
    // L1 covers 20..100 C and is therefore a better fit for thermal control.
    temp_sensor_config_t config = TSENS_CONFIG_DEFAULT();
    config.dac_offset = TSENS_DAC_L1;
    float temperature = NAN;
    const esp_err_t configResult = temp_sensor_set_config(config);
    const esp_err_t startResult = configResult == ESP_OK ? temp_sensor_start() : configResult;
    const esp_err_t readResult = startResult == ESP_OK
        ? temp_sensor_read_celsius(&temperature)
        : startResult;
    if (startResult == ESP_OK)
        temp_sensor_stop();

    if (readResult != ESP_OK)
    {
        log_e("Temperature sensor error: %d", readResult);
        return NAN;
    }
    if (!isfinite(temperature) || temperature < 5.0f || temperature > 125.0f)
    {
        log_e("Invalid chip temperature: %.2f", temperature);
        return NAN;
    }
    return temperature;
}

static void scheduleCameraRestart()
{
    if (_restart_scheduled)
        return;
    _restart_scheduled = true;
    xTaskCreate([](void*) {
        log_e("Camera did not recover, restarting device");
        delay(1000);
        esp_restart();
    }, "camera-restart", 2048, nullptr, 5, nullptr);
}

static bool isSupportedFrameSize(int value)
{
    return value == FRAMESIZE_QVGA || value == FRAMESIZE_VGA
        || value == FRAMESIZE_SVGA || value == FRAMESIZE_XGA
        || value == FRAMESIZE_UXGA;
}

static bool isJpegStartOfFrameMarker(uint8_t marker)
{
    return (marker >= 0xC0 && marker <= 0xC3)
        || (marker >= 0xC5 && marker <= 0xC7)
        || (marker >= 0xC9 && marker <= 0xCB)
        || (marker >= 0xCD && marker <= 0xCF);
}

static bool readJpegDimensions(
    const uint8_t* data, size_t length, uint16_t& width, uint16_t& height)
{
    if(data == nullptr || length < 4 || data[0] != 0xFF || data[1] != 0xD8)
        return false;

    size_t offset = 2;
    while(offset + 1 < length){
        while(offset < length && data[offset] != 0xFF)
            ++offset;
        while(offset < length && data[offset] == 0xFF)
            ++offset;
        if(offset >= length)
            return false;

        const uint8_t marker = data[offset++];
        if(marker == 0xD9 || marker == 0xDA)
            return false;
        if(marker == 0xD8 || marker == 0x01
            || (marker >= 0xD0 && marker <= 0xD7))
            continue;
        if(offset + 1 >= length)
            return false;

        const uint16_t segmentLength =
            ((uint16_t)data[offset] << 8) | data[offset + 1];
        if(segmentLength < 2 || offset + segmentLength > length)
            return false;

        if(isJpegStartOfFrameMarker(marker) && segmentLength >= 7){
            height = ((uint16_t)data[offset + 3] << 8) | data[offset + 4];
            width = ((uint16_t)data[offset + 5] << 8) | data[offset + 6];
            return width > 0 && height > 0;
        }
        offset += segmentLength;
    }
    return false;
}

static bool readFrameDimensions(
    const camera_fb_t* frame, uint16_t& width, uint16_t& height)
{
    if(frame == nullptr)
        return false;
    if(frame->format == PIXFORMAT_JPEG)
        return readJpegDimensions(frame->buf, frame->len, width, height);

    width = (uint16_t)frame->width;
    height = (uint16_t)frame->height;
    return width > 0 && height > 0;
}

static bool frameMatchesSize(const camera_fb_t* frame, framesize_t frameSize)
{
    uint16_t width = 0;
    uint16_t height = 0;
    if(!readFrameDimensions(frame, width, height))
        return false;

    switch(frameSize){
        case FRAMESIZE_QVGA: return width == 320 && height == 240;
        case FRAMESIZE_VGA:  return width == 640 && height == 480;
        case FRAMESIZE_SVGA: return width == 800 && height == 600;
        case FRAMESIZE_XGA:  return width == 1024 && height == 768;
        case FRAMESIZE_UXGA: return width == 1600 && height == 1200;
        default: return false;
    }
}

camera_fb_t* captureFrameAtSize(framesize_t frameSize)
{
    // Changing the sensor resolution does not invalidate a frame already
    // waiting in the single framebuffer. Discard stale frames so an explicit
    // capture endpoint never returns a JPEG from the preceding stream size.
    static constexpr uint8_t MAX_CAPTURE_ATTEMPTS = 5;
    for(uint8_t attempt = 0; attempt < MAX_CAPTURE_ATTEMPTS; ++attempt){
        camera_fb_t* frame = esp_camera_fb_get();
        if(frameMatchesSize(frame, frameSize))
            return frame;

        if(frame != nullptr){
            uint16_t encodedWidth = 0;
            uint16_t encodedHeight = 0;
            const bool dimensionsRead = readFrameDimensions(
                frame, encodedWidth, encodedHeight);
            if(dimensionsRead){
                log_w("Discarding encoded JPEG %ux%u (metadata %ux%u); requested framesize %d (attempt %u/%u)",
                    encodedWidth, encodedHeight, frame->width, frame->height, frameSize,
                    (unsigned)(attempt + 1), (unsigned)MAX_CAPTURE_ATTEMPTS);
            } else {
                log_w("Discarding frame with unreadable dimensions; requested framesize %d (attempt %u/%u)",
                    frameSize, (unsigned)(attempt + 1), (unsigned)MAX_CAPTURE_ATTEMPTS);
            }
            esp_camera_fb_return(frame);
        } else {
            log_e("Camera frame failed (attempt %u/%u)",
                (unsigned)(attempt + 1), (unsigned)MAX_CAPTURE_ATTEMPTS);
        }
        delay(20);
    }
    return nullptr;
}

static int setFrameSize(framesize_t frameSize)
{
    sensor_t* sensor = esp_camera_sensor_get();
    if (sensor == nullptr)
        return -1;
    const int result = sensor->set_framesize(sensor, frameSize);
    if (result == 0)
        _last_framesize = frameSize;
    return result;
}

static int applyCaptureToneSettings(
    sensor_t* sensor,
    bool hasBrightness,
    int brightness,
    bool hasContrast,
    int contrast)
{
    if ((hasBrightness && (brightness < -2 || brightness > 2))
        || (hasContrast && (contrast < -2 || contrast > 2)))
        return -1;

    if (hasContrast && sensor->set_contrast(sensor, contrast) != 0)
        return -1;
    if (hasBrightness && sensor->set_brightness(sensor, brightness) != 0)
        return -1;
    return 0;
}

static bool prepareCaptureFrame()
{
    delay(CAPTURE_SETTINGS_SETTLE_MS);
    camera_fb_t* frame = esp_camera_fb_get();
    if (frame == nullptr)
        return false;
    esp_camera_fb_return(frame);
    return true;
}

static void addCaptureHeaders(AsyncWebServerResponse* response)
{
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    response->addHeader("Pragma", "no-cache");
    response->addHeader("Expires", "0");
}

class AsyncBufferResponse: public AsyncAbstractResponse {
    private:
        uint8_t * _buf;
        size_t _len;
        size_t _index;
        bool _releaseCamera;
    public:
        AsyncBufferResponse(uint8_t * buf, size_t len, const char * contentType, bool releaseCamera = false){
            _buf = buf;
            _len = len;
            _callback = nullptr;
            _code = 200;
            _contentLength = _len;
            _contentType = contentType;
            _index = 0;
            _releaseCamera = releaseCamera;
        }
        ~AsyncBufferResponse(){
            if(_buf != nullptr){
                free(_buf);
            }
            if(_releaseCamera)
                HAL::hal::GetHal()->cameraRelease();
        }
        bool _sourceValid() const { return _buf != nullptr; }
        virtual size_t _fillBuffer(uint8_t *buf, size_t maxLen) override{
            size_t ret = _content(buf, maxLen, _index);
            if(ret != RESPONSE_TRY_AGAIN){
                _index += ret;
            }
            return ret;
        }
        size_t _content(uint8_t *buffer, size_t maxLen, size_t index){
            memcpy(buffer, _buf+index, maxLen);
            if((index+maxLen) == _len){
                free(_buf);
                _buf = nullptr;
            }
            return maxLen;
        }
};

class AsyncFrameResponse: public AsyncAbstractResponse {
    private:
        camera_fb_t * fb;
        size_t _index;
        bool _releaseCamera;
    public:
        AsyncFrameResponse(camera_fb_t * frame, const char * contentType, bool releaseCamera = false){
            _callback = nullptr;
            _code = 200;
            _contentLength = frame->len;
            _contentType = contentType;
            _index = 0;
            fb = frame;
            _releaseCamera = releaseCamera;
        }
        ~AsyncFrameResponse(){
            if(fb != nullptr){
                esp_camera_fb_return(fb);
            }
            if(_releaseCamera)
                HAL::hal::GetHal()->cameraRelease();
        }
        bool _sourceValid() const { return fb != nullptr; }
        virtual size_t _fillBuffer(uint8_t *buf, size_t maxLen) override{
            size_t ret = _content(buf, maxLen, _index);
            if(ret != RESPONSE_TRY_AGAIN){
                _index += ret;
            }
            return ret;
        }
        size_t _content(uint8_t *buffer, size_t maxLen, size_t index){
            memcpy(buffer, fb->buf+index, maxLen);
            if((index+maxLen) == fb->len){
                esp_camera_fb_return(fb);
                fb = nullptr;
            }
            return maxLen;
        }
};

class AsyncJpegStreamResponse: public AsyncAbstractResponse {
    private:
        camera_frame_t _frame;
        size_t _index;
        size_t _jpg_buf_len;
        uint8_t * _jpg_buf;
        uint32_t _lastFrameStartedAtUs;
        bool _dynamic;
        uint32_t _lastTemperatureCheck;
        uint8_t _hotSamples;
        uint8_t _coolSamples;
        uint8_t _captureFailures;
        int8_t _resolutionIndex;

        void updateDynamicResolution(){
            if(!_dynamic || millis() - _lastTemperatureCheck < 2000UL){
                return;
            }
            _lastTemperatureCheck = millis();
            const float temperature = readChipTemperature();
            _dynamic_temperature = temperature;
            const bool lowFps = _stream_fps > 0.0f && _stream_fps < 5.0f;
            const bool stableFps = _stream_fps <= 0.0f || _stream_fps >= 8.0f;

            // Separate up/down thresholds and consecutive samples prevent
            // oscillation around the temperature and performance limits.
            // Changes are made one resolution level at a time.
            if(!isfinite(temperature)){
                // Without a trustworthy sensor reading, fail safe instead of
                // keeping the camera at UXGA indefinitely.
                _hotSamples = 0;
                _coolSamples = 0;
                if(_resolutionIndex > 0)
                    _resolutionIndex--;
            } else if(temperature >= 70.0f || lowFps){
                _hotSamples++;
                _coolSamples = 0;
                if(_hotSamples >= 2 && _resolutionIndex > 0){
                    _resolutionIndex--;
                    _hotSamples = 0;
                }
            } else if(temperature < 65.0f && stableFps){
                _coolSamples++;
                _hotSamples = 0;
                if(_coolSamples >= 5 && _resolutionIndex < 4){
                    _resolutionIndex++;
                    _coolSamples = 0;
                }
            } else {
                _hotSamples = 0;
                _coolSamples = 0;
            }

            static const framesize_t levels[] = {
                FRAMESIZE_QVGA, FRAMESIZE_VGA, FRAMESIZE_SVGA,
                FRAMESIZE_XGA, FRAMESIZE_UXGA
            };
            const framesize_t target = levels[_resolutionIndex];
            if(target != _dynamic_framesize && setFrameSize(target) == 0){
                _dynamic_framesize = target;
                log_i("Dynamic stream: %.1f C, %.1f FPS, framesize %d", temperature, _stream_fps, target);
            }
        }
    public:
        explicit AsyncJpegStreamResponse(bool dynamic = false){
            _callback = nullptr;
            _code = 200;
            _contentLength = 0;
            _contentType = STREAM_CONTENT_TYPE;
            _sendContentLength = false;
            _chunked = true;
            _index = 0;
            _jpg_buf_len = 0;
            _jpg_buf = NULL;
            _lastFrameStartedAtUs = 0;
            _dynamic = dynamic;
            _lastTemperatureCheck = 0;
            _hotSamples = 0;
            _coolSamples = 0;
            _captureFailures = 0;
            _resolutionIndex = 4;
            memset(&_frame, 0, sizeof(camera_frame_t));
            streamStarted(dynamic);
        }
        ~AsyncJpegStreamResponse(){
            if(_frame.fb){
                if(_frame.fb->format != PIXFORMAT_JPEG){
                    free(_jpg_buf);
                }
                esp_camera_fb_return(_frame.fb);
            }
            streamStopped();
            HAL::hal::GetHal()->cameraRelease();
        }
        bool _sourceValid() const {
            return true;
        }
        virtual size_t _fillBuffer(uint8_t *buf, size_t maxLen) override {
            size_t ret = _content(buf, maxLen, _index);
            if(ret != RESPONSE_TRY_AGAIN){
                _index += ret;
            }
            return ret;
        }
        size_t _content(uint8_t *buffer, size_t maxLen, size_t index){
            if(isVideoServiceCameraRequested())
                return 0;
            if(!_frame.fb || _frame.index == _jpg_buf_len){
                if(index && _frame.fb){
                    log_printf("Size: %uKB (%.1ffps, max %u)\n",
                        _jpg_buf_len / 1024, _stream_fps, MAX_STREAM_FPS);
                    if(_frame.fb->format != PIXFORMAT_JPEG){
                        free(_jpg_buf);
                    }
                    esp_camera_fb_return(_frame.fb);
                    _frame.fb = NULL;
                    _jpg_buf_len = 0;
                    _jpg_buf = NULL;
                }
                if(maxLen < (strlen(STREAM_BOUNDARY) + strlen(STREAM_PART) + strlen(JPG_CONTENT_TYPE) + 8)){
                    //log_w("Not enough space for headers");
                    return RESPONSE_TRY_AGAIN;
                }

                // Do not start frames faster than 25 FPS. Returning TRY_AGAIN
                // keeps the async TCP callback non-blocking while the one-buffer
                // camera remains idle between requested frames.
                const uint32_t nowUs = micros();
                if(_lastFrameStartedAtUs != 0){
                    const uint32_t elapsedUs = nowUs - _lastFrameStartedAtUs;
                    if(elapsedUs < MIN_STREAM_FRAME_INTERVAL_US)
                        return RESPONSE_TRY_AGAIN;

                    const float instantFps = fminf(
                        1000000.0f / elapsedUs, (float)MAX_STREAM_FPS);
                    _stream_fps = _stream_fps <= 0.0f
                        ? instantFps
                        : (_stream_fps * 0.75f) + (instantFps * 0.25f);
                }
                _lastFrameStartedAtUs = nowUs;

                //get frame
                _frame.index = 0;

                updateDynamicResolution();
                _frame.fb = esp_camera_fb_get();
                if (_frame.fb == NULL) {
                    log_e("Camera frame failed");
                    _captureFailures++;
                    if(_dynamic && _resolutionIndex > 0 && _captureFailures % 3 == 0){
                        _resolutionIndex--;
                        static const framesize_t fallbackLevels[] = {
                            FRAMESIZE_QVGA, FRAMESIZE_VGA, FRAMESIZE_SVGA,
                            FRAMESIZE_XGA, FRAMESIZE_UXGA
                        };
                        const framesize_t fallback = fallbackLevels[_resolutionIndex];
                        if(setFrameSize(fallback) == 0)
                            _dynamic_framesize = fallback;
                    }
                    if(_captureFailures >= 15)
                        scheduleCameraRestart();
                    return RESPONSE_TRY_AGAIN;
                }
                _captureFailures = 0;

                if(_frame.fb->format != PIXFORMAT_JPEG){
                    unsigned long st = millis();
                    bool jpeg_converted = frame2jpg(_frame.fb, 80, &_jpg_buf, &_jpg_buf_len);
                    if(!jpeg_converted){
                        log_e("JPEG compression failed");
                        esp_camera_fb_return(_frame.fb);
                        _frame.fb = NULL;
                        _jpg_buf_len = 0;
                        _jpg_buf = NULL;
                        return RESPONSE_TRY_AGAIN;
                    }
                    log_i("JPEG: %lums, %uB", millis() - st, _jpg_buf_len);
                } else {
                    _jpg_buf_len = _frame.fb->len;
                    _jpg_buf = _frame.fb->buf;
                }

                // Every multipart body must start with a boundary. The first
                // frame has no leading CRLF; following frames do.
                const char* boundary = index ? STREAM_BOUNDARY : STREAM_BOUNDARY_FIRST;
                const size_t blen = strlen(boundary);
                memcpy(buffer, boundary, blen);
                buffer += blen;
                //send header
                size_t hlen = sprintf((char *)buffer, STREAM_PART, JPG_CONTENT_TYPE, _jpg_buf_len);
                buffer += hlen;
                //send frame
                hlen = maxLen - hlen - blen;
                if(hlen > _jpg_buf_len){
                    maxLen -= hlen - _jpg_buf_len;
                    hlen = _jpg_buf_len;
                }
                memcpy(buffer, _jpg_buf, hlen);
                _frame.index += hlen;
                return maxLen;
            }

            size_t available = _jpg_buf_len - _frame.index;
            if(maxLen > available){
                maxLen = available;
            }
            memcpy(buffer, _jpg_buf+_frame.index, maxLen);
            _frame.index += maxLen;

            return maxLen;
        }
};


static void sendJpgAtFrameSize(AsyncWebServerRequest *request, int requestedFrameSize){
    if(isCameraBusy()){
        request->send(409, "application/json", "{\"msg\":\"camera is already streaming\"}");
        return;
    }
    if(!HAL::hal::GetHal()->cameraAcquire()){
        request->send(503, "application/json", "{\"msg\":\"camera unavailable\"}");
        return;
    }
    if(requestedFrameSize >= 0 && setFrameSize((framesize_t)requestedFrameSize) != 0){
        HAL::hal::GetHal()->cameraRelease();
        request->send(501, "application/json", "{\"msg\":\"camera unavailable\"}");
        return;
    }
    sensor_t* sensor = esp_camera_sensor_get();
    if(sensor == nullptr){
        HAL::hal::GetHal()->cameraRelease();
        request->send(503, "application/json", "{\"error\":\"camera_unavailable\"}");
        return;
    }
    if(request->hasArg("quality")){
        HAL::hal::GetHal()->cameraRelease();
        request->send(400, "application/json", "{\"error\":\"invalid_capture_settings\"}");
        return;
    }
    const bool hasBrightness = request->hasArg("brightness");
    const bool hasContrast = request->hasArg("contrast");
    const int brightness = hasBrightness ? request->arg("brightness").toInt() : 0;
    const int contrast = hasContrast ? request->arg("contrast").toInt() : 0;
    int settingResult = applyCaptureToneSettings(
        sensor, hasBrightness, brightness, hasContrast, contrast);
    if(settingResult == 0 && request->hasArg("compressionLevel")){
        const int value = request->arg("compressionLevel").toInt();
        settingResult = value >= 4 && value <= 63
            ? sensor->set_quality(sensor, value) : -1;
    }
    if(settingResult == 0 && request->hasArg("rotation")){
        const int value = request->arg("rotation").toInt();
        if(value == 0 || value == 180){
            const int mirrorResult = sensor->set_hmirror(sensor, value == 180);
            const int flipResult = sensor->set_vflip(sensor, value == 180);
            settingResult = mirrorResult == 0 && flipResult == 0 ? 0 : -1;
        } else {
            settingResult = -1;
        }
    }
    if(settingResult != 0){
        HAL::hal::GetHal()->cameraRelease();
        request->send(400, "application/json", "{\"error\":\"invalid_capture_settings\"}");
        return;
    }
    if(!prepareCaptureFrame()){
        HAL::hal::GetHal()->cameraRelease();
        scheduleCameraRestart();
        request->send(503, "application/json", "{\"msg\":\"camera stabilization failed\",\"restarting\":true}");
        return;
    }
    camera_fb_t * fb = requestedFrameSize >= 0
        ? captureFrameAtSize((framesize_t)requestedFrameSize)
        : esp_camera_fb_get();
    if (fb == NULL) {
        log_e("Camera frame failed or did not reach requested resolution");
        HAL::hal::GetHal()->cameraRelease();
        scheduleCameraRestart();
        request->send(503, "application/json", requestedFrameSize >= 0
            ? "{\"msg\":\"requested capture resolution unavailable\",\"restarting\":true}"
            : "{\"msg\":\"camera restarting\"}");
        return;
    }

    if(fb->format == PIXFORMAT_JPEG){
        AsyncFrameResponse * response = new AsyncFrameResponse(fb, JPG_CONTENT_TYPE, true);
        if (response == NULL) {
            log_e("Response alloc failed");
            esp_camera_fb_return(fb);
            HAL::hal::GetHal()->cameraRelease();
            request->send(501);
            return;
        }
        addCaptureHeaders(response);
        request->send(response);
        return;
    }

    size_t jpg_buf_len = 0;
    uint8_t * jpg_buf = NULL;
    unsigned long st = millis();
    bool jpeg_converted = frame2jpg(fb, 80, &jpg_buf, &jpg_buf_len);
    esp_camera_fb_return(fb);
    if(!jpeg_converted){
        log_e("JPEG compression failed: %lu", millis());
        HAL::hal::GetHal()->cameraRelease();
        request->send(501);
        return;
    }
    log_i("JPEG: %lums, %uB", millis() - st, jpg_buf_len);

    AsyncBufferResponse * response = new AsyncBufferResponse(jpg_buf, jpg_buf_len, JPG_CONTENT_TYPE, true);
    if (response == NULL) {
        log_e("Response alloc failed");
        free(jpg_buf);
        HAL::hal::GetHal()->cameraRelease();
        request->send(501);
        return;
    }
    addCaptureHeaders(response);
    request->send(response);
}

void sendJpg(AsyncWebServerRequest *request){
    int frameSize = -1;
    if(request->hasArg("framesize")){
        frameSize = request->arg("framesize").toInt();
        if(!isSupportedFrameSize(frameSize)){
            request->send(400, "application/json", "{\"error\":\"unsupported_framesize\"}");
            return;
        }
    }
    sendJpgAtFrameSize(request, frameSize);
}

void sendUxgaJpg(AsyncWebServerRequest *request){
    sendJpgAtFrameSize(request, FRAMESIZE_UXGA);
}

void streamJpg(AsyncWebServerRequest *request){
    AsyncClient* client = request->client();
    if(!reserveDashboardStream(client)){
        request->send(409, "application/json", "{\"msg\":\"camera is already streaming\"}");
        return;
    }
    if(!HAL::hal::GetHal()->cameraAcquire()){
        cancelDashboardReservation(client);
        request->send(503, "application/json", "{\"msg\":\"camera unavailable\"}");
        return;
    }
    if(request->hasArg("framesize")){
        const int requested = request->arg("framesize").toInt();
        if(!isSupportedFrameSize(requested) || setFrameSize((framesize_t)requested) != 0){
            HAL::hal::GetHal()->cameraRelease();
            cancelDashboardReservation(client);
            request->send(400, "application/json", "{\"msg\":\"unsupported framesize\"}");
            return;
        }
    }
    AsyncJpegStreamResponse *response = new AsyncJpegStreamResponse();
    if(!response){
        HAL::hal::GetHal()->cameraRelease();
        cancelDashboardReservation(client);
        request->send(501);
        return;
    }
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Cache-Control", "no-store");
    request->send(response);
}

void streamDynamicJpg(AsyncWebServerRequest *request){
    AsyncClient* client = request->client();
    if(!reserveDashboardStream(client)){
        request->send(409, "application/json", "{\"msg\":\"camera is already streaming\"}");
        return;
    }
    if(!HAL::hal::GetHal()->cameraAcquire()){
        cancelDashboardReservation(client);
        request->send(503, "application/json", "{\"msg\":\"camera unavailable\"}");
        return;
    }
    if(setFrameSize(FRAMESIZE_UXGA) != 0){
        HAL::hal::GetHal()->cameraRelease();
        cancelDashboardReservation(client);
        request->send(501, "application/json", "{\"msg\":\"camera unavailable\"}");
        return;
    }
    _dynamic_framesize = FRAMESIZE_UXGA;
    _dynamic_temperature = readChipTemperature();
    AsyncJpegStreamResponse *response = new AsyncJpegStreamResponse(true);
    if(!response){
        HAL::hal::GetHal()->cameraRelease();
        cancelDashboardReservation(client);
        request->send(501);
        return;
    }
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Cache-Control", "no-store");
    request->send(response);
}

void getDynamicStatus(AsyncWebServerRequest *request){
    const float currentTemperature = readChipTemperature();
    if(isfinite(currentTemperature))
        _dynamic_temperature = currentTemperature;
    DynamicJsonDocument doc(256);
    if(isfinite(_dynamic_temperature))
        doc["temperature"] = _dynamic_temperature;
    else
        doc["temperature"] = nullptr;
    doc["framesize"] = (int)_dynamic_framesize;
    String result;
    serializeJson(doc, result);
    request->send(200, "application/json", result);
}

void getRuntimeStatus(AsyncWebServerRequest *request){
    portENTER_CRITICAL(&_stream_state_mux);
    const bool streaming = _active_streams > 0 || _video_service_streaming;
    portEXIT_CRITICAL(&_stream_state_mux);
    const bool dynamic = streaming && _dynamic_stream_active;
    const bool cameraPowered = HAL::hal::GetHal()->isCameraPowered();

    // The dynamic stream already refreshes this value. For fixed streaming or
    // idle mode, sample it on demand for the dashboard.
    float temperature = _dynamic_temperature;
    if(!dynamic){
        temperature = readChipTemperature();
        if(isfinite(temperature))
            _dynamic_temperature = temperature;
    }

    DynamicJsonDocument doc(256);
    doc["streaming"] = streaming;
    doc["cameraPowered"] = cameraPowered;
    doc["dynamic"] = dynamic;
    doc["fps"] = streaming ? fminf(_stream_fps, (float)MAX_STREAM_FPS) : 0.0f;
    doc["maxFps"] = MAX_STREAM_FPS;
    doc["framesize"] = (int)_last_framesize;
    if(isfinite(temperature))
        doc["temperature"] = temperature;
    else
        doc["temperature"] = nullptr;

    String result;
    serializeJson(doc, result);
    request->send(200, "application/json", result);
}

CameraRuntimeMetrics getCameraRuntimeMetrics()
{
    CameraRuntimeMetrics metrics = {};
    portENTER_CRITICAL(&_stream_state_mux);
    metrics.streaming = _active_streams > 0 || _video_service_streaming;
    metrics.dynamic = _active_streams > 0 && _dynamic_stream_active;
    metrics.framesPerSecond = metrics.streaming
        ? fminf(_stream_fps, (float)MAX_STREAM_FPS) : 0.0f;
    metrics.frameSize = _last_framesize;
    metrics.owner = _video_service_active || _video_service_requested
        ? CameraOperationOwner::VideoService
        : (_active_streams > 0 ? CameraOperationOwner::Dashboard : CameraOperationOwner::None);
    portEXIT_CRITICAL(&_stream_state_mux);
    metrics.cameraPowered = HAL::hal::GetHal()->isCameraPowered();
    metrics.chipTemperatureCelsius = readChipTemperature();
    return metrics;
}

void updateVideoServiceStreamMetrics(framesize_t frameSize, float framesPerSecond)
{
    portENTER_CRITICAL(&_stream_state_mux);
    _last_framesize = frameSize;
    _stream_fps = framesPerSecond;
    portEXIT_CRITICAL(&_stream_state_mux);
}

void getCameraStatus(AsyncWebServerRequest *request){
    static char json_response[1024];

    if(!HAL::hal::GetHal()->cameraAcquire()){
        request->send(503, "application/json", "{\"msg\":\"camera unavailable\"}");
        return;
    }
    sensor_t * s = esp_camera_sensor_get();
    if(s == NULL){
        HAL::hal::GetHal()->cameraRelease();
        request->send(501);
        return;
    }
    char * p = json_response;
    *p++ = '{';

    p+=sprintf(p, "\"framesize\":%u,", s->status.framesize);
    p+=sprintf(p, "\"compressionLevel\":%u,", s->status.quality);
    p+=sprintf(p, "\"brightness\":%d,", s->status.brightness);
    p+=sprintf(p, "\"contrast\":%d,", s->status.contrast);
    p+=sprintf(p, "\"saturation\":%d,", s->status.saturation);
    p+=sprintf(p, "\"sharpness\":%d,", s->status.sharpness);
    p+=sprintf(p, "\"special_effect\":%u,", s->status.special_effect);
    p+=sprintf(p, "\"wb_mode\":%u,", s->status.wb_mode);
    p+=sprintf(p, "\"awb\":%u,", s->status.awb);
    p+=sprintf(p, "\"awb_gain\":%u,", s->status.awb_gain);
    p+=sprintf(p, "\"aec\":%u,", s->status.aec);
    p+=sprintf(p, "\"aec2\":%u,", s->status.aec2);
    p+=sprintf(p, "\"denoise\":%u,", s->status.denoise);
    p+=sprintf(p, "\"ae_level\":%d,", s->status.ae_level);
    p+=sprintf(p, "\"aec_value\":%u,", s->status.aec_value);
    p+=sprintf(p, "\"agc\":%u,", s->status.agc);
    p+=sprintf(p, "\"agc_gain\":%u,", s->status.agc_gain);
    p+=sprintf(p, "\"gainceiling\":%u,", s->status.gainceiling);
    p+=sprintf(p, "\"bpc\":%u,", s->status.bpc);
    p+=sprintf(p, "\"wpc\":%u,", s->status.wpc);
    p+=sprintf(p, "\"raw_gma\":%u,", s->status.raw_gma);
    p+=sprintf(p, "\"lenc\":%u,", s->status.lenc);
    p+=sprintf(p, "\"hmirror\":%u,", s->status.hmirror);
    p+=sprintf(p, "\"vflip\":%u,", s->status.vflip);
    p+=sprintf(p, "\"dcw\":%u,", s->status.dcw);
    p+=sprintf(p, "\"colorbar\":%u", s->status.colorbar);
    *p++ = '}';
    *p++ = 0;

    AsyncWebServerResponse * response = request->beginResponse(200, "application/json", json_response);
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Cache-Control", "no-store");
    request->send(response);
    HAL::hal::GetHal()->cameraRelease();
}

void setCameraVar(AsyncWebServerRequest *request){
    if(!request->hasArg("var") || !request->hasArg("val")){
        request->send(404);
        return;
    }
    if(!HAL::hal::GetHal()->cameraAcquire()){
        request->send(503, "application/json", "{\"msg\":\"camera unavailable\"}");
        return;
    }
    String var = request->arg("var");
    const char * variable = var.c_str();
    int val = atoi(request->arg("val").c_str());

    sensor_t * s = esp_camera_sensor_get();
    if(s == NULL){
        HAL::hal::GetHal()->cameraRelease();
        request->send(501);
        return;
    }


    int res = 0;
    if(!strcmp(variable, "framesize")) {
        if(isCameraBusy()){
            HAL::hal::GetHal()->cameraRelease();
            request->send(409, "application/json", "{\"msg\":\"cannot change framesize while streaming\"}");
            return;
        }
        if(!isSupportedFrameSize(val)){
            HAL::hal::GetHal()->cameraRelease();
            request->send(400, "application/json", "{\"msg\":\"unsupported framesize\"}");
            return;
        }
        res = setFrameSize((framesize_t)val);
    }
    else if(!strcmp(variable, "compressionLevel")) res = s->set_quality(s, val);
    else if(!strcmp(variable, "contrast")) res = s->set_contrast(s, val);
    else if(!strcmp(variable, "brightness")) res = s->set_brightness(s, val);
    else if(!strcmp(variable, "saturation")) res = s->set_saturation(s, val);
    else if(!strcmp(variable, "sharpness")) res = s->set_sharpness(s, val);
    else if(!strcmp(variable, "gainceiling")) res = s->set_gainceiling(s, (gainceiling_t)val);
    else if(!strcmp(variable, "colorbar")) res = s->set_colorbar(s, val);
    else if(!strcmp(variable, "awb")) res = s->set_whitebal(s, val);
    else if(!strcmp(variable, "agc")) res = s->set_gain_ctrl(s, val);
    else if(!strcmp(variable, "aec")) res = s->set_exposure_ctrl(s, val);
    else if(!strcmp(variable, "hmirror")) res = s->set_hmirror(s, val);
    else if(!strcmp(variable, "vflip")) res = s->set_vflip(s, val);
    else if(!strcmp(variable, "awb_gain")) res = s->set_awb_gain(s, val);
    else if(!strcmp(variable, "agc_gain")) res = s->set_agc_gain(s, val);
    else if(!strcmp(variable, "aec_value")) res = s->set_aec_value(s, val);
    else if(!strcmp(variable, "aec2")) res = s->set_aec2(s, val);
    else if(!strcmp(variable, "denoise")) res = s->set_denoise(s, val);
    else if(!strcmp(variable, "dcw")) res = s->set_dcw(s, val);
    else if(!strcmp(variable, "bpc")) res = s->set_bpc(s, val);
    else if(!strcmp(variable, "wpc")) res = s->set_wpc(s, val);
    else if(!strcmp(variable, "raw_gma")) res = s->set_raw_gma(s, val);
    else if(!strcmp(variable, "lenc")) res = s->set_lenc(s, val);
    else if(!strcmp(variable, "special_effect")) res = s->set_special_effect(s, val);
    else if(!strcmp(variable, "wb_mode")) res = s->set_wb_mode(s, val);
    else if(!strcmp(variable, "ae_level")) res = s->set_ae_level(s, val);

    else {
        log_e("unknown setting %s", var.c_str());
        HAL::hal::GetHal()->cameraRelease();
        request->send(404);
        return;
    }
    log_d("Got setting %s with value %d. Res: %d", var.c_str(), val, res);

    AsyncWebServerResponse * response = request->beginResponse(200);
    response->addHeader("Access-Control-Allow-Origin", "*");
    request->send(response);
    HAL::hal::GetHal()->cameraRelease();
}


void load_cam_apis(AsyncWebServer& server)
{
    // This ESPAsyncWebServer version uses prefix matching. Register every
    // specific path before its shorter parent path.
    server.on("/api/v1/capture/uxga", HTTP_GET, sendUxgaJpg);
    server.on("/api/v1/capture", HTTP_GET, sendJpg);
    server.on("/api/v1/stream/dynamic/status", HTTP_GET, getDynamicStatus);
    server.on("/api/v1/stream/dynamic", HTTP_GET, streamDynamicJpg);
    server.on("/api/v1/stream", HTTP_GET, streamJpg);
    server.on("/api/v1/camera/runtime", HTTP_GET, getRuntimeStatus);
    server.on("/api/v1/control", HTTP_GET, setCameraVar);
    server.on("/api/v1/status", HTTP_GET, getCameraStatus);
}
