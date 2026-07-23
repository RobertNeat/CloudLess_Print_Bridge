/**
 * @file hal.h
 * @author Forairaaaaa
 * @brief 
 * @version 0.1
 * @date 2023-09-13
 * 
 * @copyright Copyright (c) 2023
 * 
 */
#pragma once
#include "mic/Mic_Class.hpp"
#include <esp_camera.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>


/**
 * @brief 
 * 
 */
#define HAL_PIN_BTN_A       0

#define HAL_PIN_GROVE_SCL   19
#define HAL_PIN_GROVE_SDA   20

#define HAL_PIN_MIC_CLK     47
#define HAL_PIN_MIC_DATA    48

#define HAL_PIN_SD_CS       9
#define HAL_PIN_SD_MOSI     38
#define HAL_PIN_SD_CLK      39
#define HAL_PIN_SD_MISO     40


namespace HAL
{
    class hal
    {   
    public:
        struct Config_t
        {
            String wifi_ssid;
            String wifi_password;
            String unitcam_ip;
            String gateway_ip = "192.168.1.1";
            String subnet_mask = "255.255.255.0";
            String dns_ip = "192.168.1.1";
            String video_service_ip;
            uint16_t video_service_port = 3000;
            uint16_t mqtt_port = 1883;
            uint16_t heartbeat_interval_seconds = 15;
        };

    private:
        struct Data_t
        {
            Config_t config;
            String wifi_mac_address;
            bool is_config_loaded = false;
            bool is_wifi_config_vaild = false;
            bool is_sd_card_valid = false;
        };
        Data_t _data;

        SemaphoreHandle_t _camera_mutex = nullptr;
        uint16_t _camera_users = 0;
        volatile bool _camera_powered = false;

        void _cam_init();
        bool _cam_power_on();
        void _cam_power_off();
        void _config_init();
        bool _check_sd_card_config_hijack();

    public:
        void init();

        // Mic 
        m5::Mic_Class* mic = nullptr;

        // Sd card 
        struct SdCardPin_t
        {
            int cs = HAL_PIN_SD_CS;
            int mosi = HAL_PIN_SD_MOSI;
            int clk = HAL_PIN_SD_CLK;
            int miso = HAL_PIN_SD_MISO;
        };
        inline SdCardPin_t getSdCardPin() {
            SdCardPin_t pin;
            return pin;
        }

        void setLed(bool state);

        // Camera power is reference-counted. The first user initializes the
        // driver/XCLK and the last user deinitializes both.
        bool cameraAcquire();
        void cameraRelease();
        inline bool isCameraPowered() const { return _camera_powered; }

        bool setConfig(const Config_t& cfg);
        Config_t getConfig();
        Config_t getDefaultConfig();
        void printConfig();
        void cacheWifiMacAddress();
        inline const String& getWifiMacAddress() const { return _data.wifi_mac_address; }
        
        // SD card lifecycle and image persistence.
        bool sdCardInit(bool passImagePath = false);
        void sdCardDeinit();
        inline bool isSdCardValid() { return _data.is_sd_card_valid; }
        bool saveImage(uint8_t* img, size_t size);


    private:
        static hal* _hal;        
    public:
        static hal* GetHal();
    };
}
