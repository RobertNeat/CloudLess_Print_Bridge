/**
 * @file hal_cam.cpp
 * @author Forairaaaaa
 * @brief 
 * @version 0.1
 * @date 2023-11-01
 * 
 * @copyright Copyright (c) 2023
 * 
 */
#include <mooncake.h>
#include <Arduino.h>
#include "../hal.h"

using namespace HAL;



#include <esp_camera.h>
//
// WARNING!!! PSRAM IC required for UXGA resolution and high JPEG quality
//            Ensure ESP32 Wrover Module or other board with PSRAM is selected
//            Partial images will be transmitted if image exceeds buffer size
//
//            You must select partition scheme from the board menu that has at least 3MB APP space.
//            Face Recognition is DISABLED for ESP32 and ESP32-S2, because it takes up from 15
//            seconds to process single frame. Face Detection is ENABLED if PSRAM is enabled as well

#define CAMERA_MODEL_ESP_EYE
#include "camera_pins.h"



void hal::_cam_init()
{
    _camera_mutex = xSemaphoreCreateMutex();
    if (_camera_mutex == nullptr)
    {
        spdlog::error("camera power manager init failed");
        return;
    }
    spdlog::info("camera power manager ready (camera off)");
}

bool hal::_cam_power_on()
{
    if (_camera_powered)
        return true;

    spdlog::info("camera power on: starting driver and XCLK");

    camera_config_t config = {};
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;
    config.pin_d0 = Y2_GPIO_NUM;
    config.pin_d1 = Y3_GPIO_NUM;
    config.pin_d2 = Y4_GPIO_NUM;
    config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM;
    config.pin_d5 = Y7_GPIO_NUM;
    config.pin_d6 = Y8_GPIO_NUM;
    config.pin_d7 = Y9_GPIO_NUM;
    config.pin_xclk = XCLK_GPIO_NUM;
    config.pin_pclk = PCLK_GPIO_NUM;
    config.pin_vsync = VSYNC_GPIO_NUM;
    config.pin_href = HREF_GPIO_NUM;
    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn = PWDN_GPIO_NUM;
    config.pin_reset = RESET_GPIO_NUM;
    config.xclk_freq_hz = 20000000;

    // Framebuffer capacity is fixed during esp_camera_init(). Allocate it for
    // the largest resolution exposed by the API; changing a VGA-sized camera
    // to UXGA later can overrun/truncate the JPEG buffer and reset the device.
    config.frame_size = FRAMESIZE_UXGA;

    config.pixel_format = PIXFORMAT_JPEG; // for streaming
    // config.pixel_format = PIXFORMAT_RGB565; // for face detection/recognition
    // A single framebuffer keeps the camera in on-demand mode. With two or
    // more buffers CAMERA_GRAB_LATEST enables continuous DMA capture, which
    // consumes camera/PSRAM resources and produces heat even without a stream.
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.jpeg_quality = 16;
    config.fb_count = 1;


    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK)
    {
        spdlog::error("camera init failed with error 0x{:x}", (unsigned int)err);
        return false;
    }


    sensor_t* s = esp_camera_sensor_get();
    s->set_vflip(s, 1);
    s->set_hmirror(s, 1);
    // Keep the idle frame small. The allocation remains UXGA-sized, while the
    // one-buffer WHEN_EMPTY mode captures only on demand/when returned.
    if (s->set_framesize(s, FRAMESIZE_VGA) != 0)
        spdlog::error("failed to set idle camera resolution");

    _camera_powered = true;
    spdlog::info("camera power on complete");
    delay(100);
    return true;
}

void hal::_cam_power_off()
{
    if (!_camera_powered)
        return;

    spdlog::info("camera power off: stopping driver and XCLK");
    const esp_err_t err = esp_camera_deinit();
    if (err != ESP_OK)
    {
        spdlog::error("camera deinit failed with error 0x{:x}", (unsigned int)err);
        return;
    }
    _camera_powered = false;
    spdlog::info("camera power off complete");
}

bool hal::cameraAcquire()
{
    if (_camera_mutex == nullptr)
        return false;

    xSemaphoreTake(_camera_mutex, portMAX_DELAY);
    const bool ready = _camera_users > 0 || _cam_power_on();
    if (ready)
        _camera_users++;
    xSemaphoreGive(_camera_mutex);
    return ready;
}

void hal::cameraRelease()
{
    if (_camera_mutex == nullptr)
        return;

    xSemaphoreTake(_camera_mutex, portMAX_DELAY);
    if (_camera_users == 0)
    {
        spdlog::error("camera release without matching acquire");
    }
    else
    {
        _camera_users--;
        if (_camera_users == 0)
            _cam_power_off();
    }
    xSemaphoreGive(_camera_mutex);
}
