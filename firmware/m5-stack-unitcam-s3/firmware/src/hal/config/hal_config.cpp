/**
 * @file hal_config.cpp
 * @author Forairaaaaa
 * @brief 
 * @version 0.1
 * @date 2023-11-03
 * 
 * @copyright Copyright (c) 2023
 * 
 */
#include <mooncake.h>
#include <Arduino.h>
#include "../hal.h"
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <SD.h>
#include <FS.h>


using namespace HAL;


static const char* _config_file_path = "/config.json";

static void applyNetworkDefaults(hal::Config_t& config)
{
    IPAddress localIp;
    if (config.gateway_ip.isEmpty() && localIp.fromString(config.unitcam_ip))
        config.gateway_ip = IPAddress(localIp[0], localIp[1], localIp[2], 1).toString();
    if (config.subnet_mask.isEmpty())
        config.subnet_mask = "255.255.255.0";
    if (config.dns_ip.isEmpty())
        config.dns_ip = config.gateway_ip;
}

bool hal::setConfig(const hal::Config_t& cfg)
{
    // Try open 
    File file = LittleFS.open(_config_file_path, "w");
    if (!file)
    {
        spdlog::error("open {} failed", _config_file_path);
        return false;
    }

    // Parse json 
    DynamicJsonDocument doc(1024);
    doc["schemaVersion"] = 1;
    doc["cameraMacAddress"] = getWifiMacAddress();
    doc["wifiSsid"] = cfg.wifi_ssid;
    doc["wifiPass"] = cfg.wifi_password;
    doc["unitCamIp"] = cfg.unitcam_ip;
    doc["gatewayIp"] = cfg.gateway_ip;
    doc["subnetMask"] = cfg.subnet_mask;
    doc["dnsIp"] = cfg.dns_ip;
    doc["videoServiceIp"] = cfg.video_service_ip;
    doc["videoServicePort"] = cfg.video_service_port;
    doc["mqttPort"] = cfg.mqtt_port;
    doc["heartbeatIntervalSeconds"] = cfg.heartbeat_interval_seconds;

    const size_t bytesWritten = serializeJson(doc, file);
    file.flush();
    file.close();

    if (bytesWritten == 0)
    {
        spdlog::error("write {} failed", _config_file_path);
        return false;
    }

    // Do not report success to the browser until the persisted provisioning
    // values can be read back exactly. This prevents a reboot into AP mode
    // after a failed or truncated LittleFS write.
    File verificationFile = LittleFS.open(_config_file_path, "r");
    if (!verificationFile)
    {
        spdlog::error("verify open {} failed", _config_file_path);
        return false;
    }

    DynamicJsonDocument verificationDoc(1024);
    const DeserializationError verificationError = deserializeJson(verificationDoc, verificationFile);
    verificationFile.close();
    if (verificationError)
    {
        spdlog::error("verify {} failed: {}", _config_file_path, verificationError.c_str());
        return false;
    }

    const bool matches = verificationDoc["wifiSsid"].as<String>() == cfg.wifi_ssid
        && verificationDoc["wifiPass"].as<String>() == cfg.wifi_password
        && verificationDoc["unitCamIp"].as<String>() == cfg.unitcam_ip
        && verificationDoc["gatewayIp"].as<String>() == cfg.gateway_ip
        && verificationDoc["subnetMask"].as<String>() == cfg.subnet_mask
        && verificationDoc["dnsIp"].as<String>() == cfg.dns_ip
        && verificationDoc["videoServiceIp"].as<String>() == cfg.video_service_ip
        && verificationDoc["videoServicePort"].as<uint16_t>() == cfg.video_service_port
        && verificationDoc["mqttPort"].as<uint16_t>() == cfg.mqtt_port
        && verificationDoc["heartbeatIntervalSeconds"].as<uint16_t>()
            == cfg.heartbeat_interval_seconds;
    if (!matches)
    {
        spdlog::error("verify {} failed: provisioning values differ", _config_file_path);
        return false;
    }

    _data.config = cfg;
    _data.is_config_loaded = true;
    spdlog::info("saved and verified {} ({} bytes)", _config_file_path, bytesWritten);
    return true;
}


hal::Config_t hal::getConfig()
{
    if (_data.is_config_loaded)
        return _data.config;

    // Try open 
    File file = LittleFS.open(_config_file_path, "r");
    if (!file)
    {
        spdlog::error("open {} failed", _config_file_path);
        return _data.config;
    }

    // Parse json 
    DynamicJsonDocument doc(1024);
    const DeserializationError error = deserializeJson(doc, file);
    if (error)
    {
        spdlog::error("parse {} failed: {}", _config_file_path, error.c_str());
        file.close();
        return _data.config;
    }

    // Copy into buffer 
    _data.config.wifi_ssid = doc["wifiSsid"].as<String>();
    _data.config.wifi_password = doc["wifiPass"].as<String>();
    _data.config.unitcam_ip = doc["unitCamIp"].as<String>();
    _data.config.gateway_ip = doc["gatewayIp"].as<String>();
    _data.config.subnet_mask = doc["subnetMask"].as<String>();
    _data.config.dns_ip = doc["dnsIp"].as<String>();
    _data.config.video_service_ip = doc["videoServiceIp"].as<String>();
    _data.config.video_service_port = doc["videoServicePort"] | 10322;
    _data.config.mqtt_port = doc["mqttPort"] | 1883;
    _data.config.heartbeat_interval_seconds = doc["heartbeatIntervalSeconds"] | 15;
    applyNetworkDefaults(_data.config);
    _data.is_config_loaded = true;

    file.close();

    return _data.config;
}


hal::Config_t hal::getDefaultConfig()
{
    Config_t ret;
    return ret;
}


void hal::_config_init()
{
    // File system 
    if (!LittleFS.begin(true)) 
    {
        while (1)
        {
            spdlog::info("file system init failed");
            delay(1000);
        }
    }

    spdlog::info("config init");

    // Check exist 
    if (!LittleFS.exists(_config_file_path))
    {
        // Default config 
        setConfig(_data.config);
    }
    else 
    {
        spdlog::info("{} already exsit", _config_file_path);
    }

    // Sync config
    getConfig();

    // A configuration entered in the web UI is authoritative. Import an SD
    // card config only for an otherwise unprovisioned device.
    const bool hasStoredNetworkConfig = !_data.config.wifi_ssid.isEmpty()
        && !_data.config.unitcam_ip.isEmpty()
        && !_data.config.video_service_ip.isEmpty();
    if (!hasStoredNetworkConfig && _check_sd_card_config_hijack())
    {
        // Over write internal config 
        setConfig(_data.config);
    }

    printConfig();
}


bool hal::_check_sd_card_config_hijack()
{
    spdlog::info("try load config from sd..");

    // Check sd card 
    sdCardInit(true);
    if (!_data.is_sd_card_valid)
        return false;

    // Check config exist 
    if (!SD.exists(_config_file_path))
    {
        spdlog::info("{} not exist", _config_file_path);
        sdCardDeinit();
        return false;
    }

    // Try open 
    File file = SD.open(_config_file_path, "r");
    if (!file)
    {
        spdlog::error("open {} failed", _config_file_path);
        sdCardDeinit();
        return false;
    }

    // Parse json 
    DynamicJsonDocument doc(1024);
    const DeserializationError error = deserializeJson(doc, file);
    if (error)
    {
        spdlog::error("parse SD {} failed: {}", _config_file_path, error.c_str());
        file.close();
        sdCardDeinit();
        return false;
    }

    // Copy 
    spdlog::info("copy config from sd..");
    if (!doc["wifiSsid"].isNull())
        _data.config.wifi_ssid = doc["wifiSsid"].as<String>();
    if (!doc["wifiPass"].isNull())
        _data.config.wifi_password = doc["wifiPass"].as<String>();
    if (!doc["unitCamIp"].isNull())
        _data.config.unitcam_ip = doc["unitCamIp"].as<String>();
    if (!doc["gatewayIp"].isNull())
        _data.config.gateway_ip = doc["gatewayIp"].as<String>();
    if (!doc["subnetMask"].isNull())
        _data.config.subnet_mask = doc["subnetMask"].as<String>();
    if (!doc["dnsIp"].isNull())
        _data.config.dns_ip = doc["dnsIp"].as<String>();
    if (!doc["videoServiceIp"].isNull())
        _data.config.video_service_ip = doc["videoServiceIp"].as<String>();
    if (!doc["videoServicePort"].isNull())
        _data.config.video_service_port = doc["videoServicePort"];
    if (!doc["mqttPort"].isNull())
        _data.config.mqtt_port = doc["mqttPort"];
    if (!doc["heartbeatIntervalSeconds"].isNull())
        _data.config.heartbeat_interval_seconds = doc["heartbeatIntervalSeconds"];
    applyNetworkDefaults(_data.config);
    
    file.close();
    sdCardDeinit();
    return true;
}


void hal::printConfig()
{
    spdlog::info("config:");
    printf("wifi ssid: %s\n", _data.config.wifi_ssid.c_str());
    printf("wifi pass: %s\n", _data.config.wifi_password.isEmpty() ? "(empty)" : "(set)");
    printf("unit cam ip: %s\n", _data.config.unitcam_ip.c_str());
    printf("gateway ip: %s\n", _data.config.gateway_ip.c_str());
    printf("subnet mask: %s\n", _data.config.subnet_mask.c_str());
    printf("dns ip: %s\n", _data.config.dns_ip.c_str());
    printf("video service ip: %s\n", _data.config.video_service_ip.c_str());
    printf("video service port: %u\n", _data.config.video_service_port);
    printf("mqtt port: %u\n", _data.config.mqtt_port);
    printf("heartbeat interval: %u seconds\n", _data.config.heartbeat_interval_seconds);
}
