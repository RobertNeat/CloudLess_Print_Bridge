/**
 * @file api_system.cpp
 * @author Forairaaaaa
 * @brief 
 * @version 0.1
 * @date 2023-11-01
 * 
 * @copyright Copyright (c) 2023
 * 
 */
#include <mooncake.h>
#include "Arduino.h"
#include "api_system.h"
#include "../../hal/hal.h"
#include <SPI.h>
#include <SD.h>
#include <FS.h>
#include <LittleFS.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include <AsyncJson.h>
#include "services/video_service/video_service.h"

static void publishNetworkConfiguration(const char* action)
{
    const auto config = HAL::hal::GetHal()->getConfig();
    DynamicJsonDocument document(512);
    document["action"] = action;
    document["wifiSsid"] = config.wifi_ssid;
    document["unitCamIp"] = config.unitcam_ip;
    document["gatewayIp"] = config.gateway_ip;
    document["subnetMask"] = config.subnet_mask;
    document["dnsIp"] = config.dns_ip;
    document["videoServiceIp"] = config.video_service_ip;
    document["videoServicePort"] = config.video_service_port;
    document["mqttPort"] = config.mqtt_port;
    document["heartbeatIntervalSeconds"] = config.heartbeat_interval_seconds;
    String payload;
    serializeJson(document, payload);
    publish_video_service_event("network", payload);
}



void getMac(AsyncWebServerRequest* request)
{
    String result = "{\"msg\":\"ok\",\"mac\":\"";
    result += HAL::hal::GetHal()->getWifiMacAddress();
    result += "\"}";

    request->send(200, "application/json", result);
}


void getSdCardInfo(AsyncWebServerRequest* request)
{
    if (is_video_service_operation_active())
    {
        request->send(409, "application/json", "{\"error\":\"sd_card_busy\"}");
        return;
    }
    String card_info = "{\"info\":\"";


    auto sd_pins = HAL::hal::GetHal()->getSdCardPin();
    spdlog::info("cs:{} miso:{} mosi:{} clk:{}", sd_pins.cs, sd_pins.miso, sd_pins.mosi, sd_pins.clk);

    /// Init spi 
    SPIClass* sd_spi = new SPIClass(HSPI);
    sd_spi->begin(
        sd_pins.clk,
        sd_pins.miso,
        sd_pins.mosi,
        sd_pins.cs
    );

    // Better card compatibility? 
    const int pin_map[] = {sd_pins.clk, sd_pins.miso, sd_pins.mosi};
    for (const int gpio : pin_map)
    {
        *(volatile uint32_t*) (GPIO_PIN_MUX_REG[gpio]) |= FUN_DRV_M;
        gpio_pulldown_dis((gpio_num_t)gpio);
        gpio_pullup_en((gpio_num_t)gpio);
    }


    // Init sd 
    bool ret = SD.begin(sd_pins.cs, *sd_spi, 10000000);
    if (!ret)
    {
        spdlog::error("sd.begin failed");
        card_info += "SD Card Not Valid";
    }
    else 
    {
        spdlog::info("sd.begin ok");

        card_info += "Type: ";

        // Get card info
        uint8_t cardType = SD.cardType();
        if (cardType == CARD_MMC)
        {
            card_info += "MMC ";
            spdlog::info("MMC");
        }
        else if(cardType == CARD_SD)
        {
            card_info += "SDSC ";
            spdlog::info("SDSC");
        }
        else if(cardType == CARD_SDHC)
        {
            card_info += "SDHC ";
            spdlog::info("SDHC");
        }

        card_info += " Size: ";

        card_info += SD.cardSize() / 1073741824;
        card_info += "G";
    }

    card_info += "\"}";
    spdlog::info("{}", card_info.c_str());

    // Free     
    SD.end();
    delete sd_spi;

    request->send(200, "application/json", card_info);
}

static bool parseUnsignedArgument(
    AsyncWebServerRequest* request,
    const char* name,
    uint32_t defaultValue,
    uint32_t maximumValue,
    uint32_t& value)
{
    if (!request->hasArg(name))
    {
        value = defaultValue;
        return true;
    }
    const String input = request->arg(name);
    if (input.isEmpty())
        return false;
    uint64_t parsed = 0;
    for (size_t index = 0; index < input.length(); index++)
    {
        const char character = input[index];
        if (character < '0' || character > '9')
            return false;
        parsed = parsed * 10 + (character - '0');
        if (parsed > maximumValue)
            return false;
    }
    value = (uint32_t)parsed;
    return true;
}

static bool normalizeSdPath(const String& input, String& path)
{
    path = input.isEmpty() ? "/" : input;
    if (!path.startsWith("/") || path.indexOf("..") >= 0
        || path.indexOf('\\') >= 0 || path.length() > 255)
        return false;
    while (path.length() > 1 && path.endsWith("/"))
        path.remove(path.length() - 1);
    return true;
}

static String sdEntryPath(const String& directoryPath, const String& entryName)
{
    if (entryName.startsWith("/"))
        return entryName;
    return directoryPath == "/"
        ? String("/") + entryName
        : directoryPath + "/" + entryName;
}

struct SdTraversalState
{
    JsonArray entries;
    uint32_t offset;
    uint32_t limit;
    uint32_t visited;
    uint32_t returned;
    bool hasMore;
};

static bool traverseSdDirectory(
    const String& directoryPath,
    uint32_t currentDepth,
    uint32_t maximumDepth,
    SdTraversalState& state)
{
    File directory = SD.open(directoryPath, FILE_READ);
    if (!directory || !directory.isDirectory())
    {
        if (directory)
            directory.close();
        return false;
    }

    while (!state.hasMore)
    {
        File entry = directory.openNextFile();
        if (!entry)
            break;
        const bool isDirectory = entry.isDirectory();
        const uint64_t sizeBytes = isDirectory ? 0 : (uint64_t)entry.size();
        const String entryPath = sdEntryPath(directoryPath, entry.name());
        entry.close();

        if (state.visited < state.offset)
        {
            state.visited++;
        }
        else if (state.returned >= state.limit)
        {
            state.hasMore = true;
            break;
        }
        else
        {
            state.visited++;
            const int separator = entryPath.lastIndexOf('/');
            JsonObject item = state.entries.createNestedObject();
            item["name"] = entryPath.substring(separator + 1);
            item["path"] = entryPath;
            item["parentPath"] = directoryPath;
            item["type"] = isDirectory ? "directory" : "file";
            item["depth"] = currentDepth;
            if (!isDirectory)
                item["sizeBytes"] = sizeBytes;
            state.returned++;
        }

        if (isDirectory && currentDepth < maximumDepth && !state.hasMore
            && !traverseSdDirectory(
                entryPath, currentDepth + 1, maximumDepth, state))
        {
            directory.close();
            return false;
        }
    }
    directory.close();
    return true;
}

void getSdCardFiles(AsyncWebServerRequest* request)
{
    if (is_video_service_operation_active())
    {
        request->send(409, "application/json", "{\"error\":\"sd_card_busy\"}");
        return;
    }

    String path;
    uint32_t offset = 0;
    uint32_t limit = 100;
    uint32_t depth = 0;
    if (!normalizeSdPath(request->hasArg("path") ? request->arg("path") : "/", path)
        || !parseUnsignedArgument(request, "offset", 0, 1000000, offset)
        || !parseUnsignedArgument(request, "limit", 100, 250, limit)
        || !parseUnsignedArgument(request, "depth", 0, 8, depth)
        || limit == 0)
    {
        request->send(400, "application/json", "{\"error\":\"invalid_sdcard_query\"}");
        return;
    }

    HAL::hal* hal = HAL::hal::GetHal();
    if (!hal->sdCardInit(true))
    {
        request->send(503, "application/json", "{\"error\":\"sd_card_unavailable\"}");
        return;
    }

    File directory = SD.open(path, FILE_READ);
    if (!directory)
    {
        hal->sdCardDeinit();
        request->send(404, "application/json", "{\"error\":\"sd_path_not_found\"}");
        return;
    }
    if (!directory.isDirectory())
    {
        directory.close();
        hal->sdCardDeinit();
        request->send(400, "application/json", "{\"error\":\"sd_path_not_directory\"}");
        return;
    }

    directory.close();

    const size_t capacity = JSON_OBJECT_SIZE(8) + JSON_ARRAY_SIZE(limit)
        + limit * (JSON_OBJECT_SIZE(6) + 640);
    DynamicJsonDocument document(capacity);
    document["path"] = path;
    document["offset"] = offset;
    document["limit"] = limit;
    document["depth"] = depth;
    JsonArray entries = document.createNestedArray("entries");
    SdTraversalState state = {entries, offset, limit, 0, 0, false};
    const bool traversalSucceeded = traverseSdDirectory(path, 0, depth, state);
    hal->sdCardDeinit();

    if (!traversalSucceeded)
    {
        request->send(500, "application/json", "{\"error\":\"sdcard_traversal_failed\"}");
        return;
    }
    if (document.overflowed())
    {
        request->send(500, "application/json", "{\"error\":\"sdcard_response_too_large\"}");
        return;
    }
    document["returned"] = state.returned;
    document["hasMore"] = state.hasMore;
    if (state.hasMore)
        document["nextOffset"] = offset + state.returned;
    String responseBody;
    serializeJson(document, responseBody);
    request->send(200, "application/json", responseBody);
}

void getSdCardUsage(AsyncWebServerRequest* request)
{
    if (is_video_service_operation_active())
    {
        request->send(409, "application/json", "{\"error\":\"sd_card_busy\"}");
        return;
    }

    HAL::hal* hal = HAL::hal::GetHal();
    if (!hal->sdCardInit(true))
    {
        request->send(503, "application/json", "{\"error\":\"sd_card_unavailable\"}");
        return;
    }
    const uint64_t totalBytes = SD.totalBytes();
    const uint64_t usedBytes = SD.usedBytes();
    hal->sdCardDeinit();
    if (totalBytes == 0 || usedBytes > totalBytes)
    {
        request->send(503, "application/json", "{\"error\":\"sd_card_unavailable\"}");
        return;
    }

    DynamicJsonDocument document(256);
    document["usedBytes"] = usedBytes;
    document["totalBytes"] = totalBytes;
    document["freeBytes"] = totalBytes - usedBytes;
    document["usagePercent"] = (double)usedBytes * 100.0 / (double)totalBytes;
    String responseBody;
    serializeJson(document, responseBody);
    request->send(200, "application/json", responseBody);
}


void ledOn(AsyncWebServerRequest* request)
{
    HAL::hal::GetHal()->setLed(true);
    publish_video_service_event("led", "{\"enabled\":true}");
    request->send(200, "application/json", "{\"msg\":\"ok\"}");
}


void ledOff(AsyncWebServerRequest* request)
{
    HAL::hal::GetHal()->setLed(false);
    publish_video_service_event("led", "{\"enabled\":false}");
    request->send(200, "application/json", "{\"msg\":\"ok\"}");
}


void getConfig(AsyncWebServerRequest* request)
{
    auto config = HAL::hal::GetHal()->getConfig();
    DynamicJsonDocument doc(1024);
    doc["wifiSsid"] = config.wifi_ssid;
    // Never expose the stored network password through an unauthenticated
    // HTTP endpoint. The UI leaves the password field blank when editing.
    doc["wifiPass"] = "";
    doc["cameraMacAddress"] = HAL::hal::GetHal()->getWifiMacAddress();
    doc["unitCamIp"] = config.unitcam_ip;
    doc["gatewayIp"] = config.gateway_ip;
    doc["subnetMask"] = config.subnet_mask;
    doc["dnsIp"] = config.dns_ip;
    doc["videoServiceIp"] = config.video_service_ip;
    doc["videoServicePort"] = config.video_service_port;
    doc["mqttPort"] = config.mqtt_port;
    doc["heartbeatIntervalSeconds"] = config.heartbeat_interval_seconds;
    doc["mode"] = WiFi.getMode() == WIFI_AP ? "ap" : "station";
    doc["currentIp"] = WiFi.getMode() == WIFI_AP
        ? WiFi.softAPIP().toString()
        : WiFi.localIP().toString();

    String result;
    serializeJson(doc, result);
    request->send(200, "application/json", result);
}


void resetConfig(AsyncWebServerRequest* request)
{
    auto cfg = HAL::hal::GetHal()->getDefaultConfig();
    if (!HAL::hal::GetHal()->setConfig(cfg))
    {
        request->send(500, "application/json", "{\"msg\":\"config persistence failed\"}");
        return;
    }
    publishNetworkConfiguration("reset");
    request->send(200, "application/json", "{\"msg\":\"ok\"}");
}


enum class ConfigSaveResult
{
    Ok,
    BadConfig,
    PersistenceError,
};

static ConfigSaveResult saveNetworkConfig(
    String requestedSsid,
    const String& requestedPassword,
    String requestedUnitCamIp,
    String requestedGatewayIp,
    String requestedSubnetMask,
    String requestedDnsIp,
    String requestedVideoServiceIp,
    uint16_t requestedVideoServicePort = 0,
    uint16_t requestedMqttPort = 0,
    uint16_t requestedHeartbeatIntervalSeconds = 0)
{
    requestedSsid.trim();
    requestedUnitCamIp.trim();
    requestedGatewayIp.trim();
    requestedSubnetMask.trim();
    requestedDnsIp.trim();
    requestedVideoServiceIp.trim();

    HAL::hal::Config_t config = HAL::hal::GetHal()->getConfig();

    if (!requestedPassword.isEmpty() || requestedSsid != config.wifi_ssid)
        config.wifi_password = requestedPassword;
    config.wifi_ssid = requestedSsid;
    config.unitcam_ip = requestedUnitCamIp;
    if (!requestedGatewayIp.isEmpty())
        config.gateway_ip = requestedGatewayIp;
    if (!requestedSubnetMask.isEmpty())
        config.subnet_mask = requestedSubnetMask;
    if (!requestedDnsIp.isEmpty())
        config.dns_ip = requestedDnsIp;
    config.video_service_ip = requestedVideoServiceIp;
    if (requestedVideoServicePort > 0)
        config.video_service_port = requestedVideoServicePort;
    if (requestedMqttPort > 0)
        config.mqtt_port = requestedMqttPort;
    if (requestedHeartbeatIntervalSeconds > 0)
        config.heartbeat_interval_seconds = requestedHeartbeatIntervalSeconds;

    IPAddress unitcamIp;
    IPAddress gatewayIp;
    IPAddress subnetMask;
    IPAddress dnsIp;
    IPAddress videoServiceIp;
    if (config.wifi_ssid.isEmpty()
        || config.wifi_ssid.length() > 32
        || config.wifi_password.length() > 64
        || config.unitcam_ip.length() > 15
        || config.gateway_ip.length() > 15
        || config.subnet_mask.length() > 15
        || config.dns_ip.length() > 15
        || config.video_service_ip.length() > 15
        || !unitcamIp.fromString(config.unitcam_ip)
        || !gatewayIp.fromString(config.gateway_ip)
        || !subnetMask.fromString(config.subnet_mask)
        || !dnsIp.fromString(config.dns_ip)
        || !videoServiceIp.fromString(config.video_service_ip)
        || unitcamIp == IPAddress(0, 0, 0, 0)
        || gatewayIp == IPAddress(0, 0, 0, 0)
        || subnetMask == IPAddress(0, 0, 0, 0)
        || dnsIp == IPAddress(0, 0, 0, 0)
        || videoServiceIp == IPAddress(0, 0, 0, 0)
        || config.heartbeat_interval_seconds < 5
        || config.heartbeat_interval_seconds > 3600)
    {
        return ConfigSaveResult::BadConfig;
    }

    if (!HAL::hal::GetHal()->setConfig(config))
        return ConfigSaveResult::PersistenceError;

    spdlog::info("provisioning config persisted: unitCamIp={}, videoServiceIp={}",
        config.unitcam_ip.c_str(), config.video_service_ip.c_str());
    return ConfigSaveResult::Ok;
}

static void scheduleConfigRestart()
{
    // Keep the AP alive long enough for the complete response to reach slow
    // captive-portal browsers before switching the radio to station mode.
    xTaskCreate([](void*) {
        delay(3000);
        esp_restart();
    }, "config-restart", 2048, nullptr, 5, nullptr);
}

void setConfig(AsyncWebServerRequest* request, JsonVariant& json)
{
    if (!json.is<JsonObject>()
        || json["wifiSsid"].isNull()
        || json["wifiPass"].isNull()
        || json["unitCamIp"].isNull()
        || json["videoServiceIp"].isNull())
    {
        request->send(400, "application/json", "{\"msg\":\"missing config fields\"}");
        return;
    }

    const ConfigSaveResult result = saveNetworkConfig(
        json["wifiSsid"].as<String>(),
        json["wifiPass"].as<String>(),
        json["unitCamIp"].as<String>(),
        json["gatewayIp"].isNull() ? String() : json["gatewayIp"].as<String>(),
        json["subnetMask"].isNull() ? String() : json["subnetMask"].as<String>(),
        json["dnsIp"].isNull() ? String() : json["dnsIp"].as<String>(),
        json["videoServiceIp"].as<String>(),
        json["videoServicePort"] | 0,
        json["mqttPort"] | 0,
        json["heartbeatIntervalSeconds"] | 0);

    if (result == ConfigSaveResult::BadConfig)
    {
        request->send(400, "application/json", "{\"msg\":\"bad config\"}");
        return;
    }
    if (result == ConfigSaveResult::PersistenceError)
    {
        request->send(500, "application/json", "{\"msg\":\"config persistence failed\"}");
        return;
    }

    AsyncWebServerResponse* response = request->beginResponse(
        200, "application/json", "{\"msg\":\"ok\",\"restarting\":true}");
    response->addHeader("Cache-Control", "no-store");
    response->addHeader("Connection", "close");
    request->send(response);
    publishNetworkConfiguration("updated");
    scheduleConfigRestart();
}

static void setConfigForm(AsyncWebServerRequest* request)
{
    spdlog::info("provisioning config received via native form");
    static const char* requiredFields[] = {
        "wifiSsid", "wifiPass", "unitCamIp", "videoServiceIp"
    };
    for (const char* field : requiredFields)
    {
        if (!request->hasParam(field, true))
        {
            request->send(400, "text/plain; charset=utf-8", "Brak wymaganych pól konfiguracji.");
            return;
        }
    }

    String unitCamIp = request->getParam("unitCamIp", true)->value();
    unitCamIp.trim();
    const ConfigSaveResult result = saveNetworkConfig(
        request->getParam("wifiSsid", true)->value(),
        request->getParam("wifiPass", true)->value(),
        unitCamIp,
        request->hasParam("gatewayIp", true)
            ? request->getParam("gatewayIp", true)->value() : String(),
        request->hasParam("subnetMask", true)
            ? request->getParam("subnetMask", true)->value() : String(),
        request->hasParam("dnsIp", true)
            ? request->getParam("dnsIp", true)->value() : String(),
        request->getParam("videoServiceIp", true)->value(),
        request->hasParam("videoServicePort", true)
            ? request->getParam("videoServicePort", true)->value().toInt() : 0,
        request->hasParam("mqttPort", true)
            ? request->getParam("mqttPort", true)->value().toInt() : 0,
        request->hasParam("heartbeatIntervalSeconds", true)
            ? request->getParam("heartbeatIntervalSeconds", true)->value().toInt() : 0);

    if (result == ConfigSaveResult::BadConfig)
    {
        request->send(400, "text/plain; charset=utf-8", "Nieprawidłowa nazwa sieci lub adres IP.");
        return;
    }
    if (result == ConfigSaveResult::PersistenceError)
    {
        request->send(500, "text/plain; charset=utf-8", "Nie udało się zapisać konfiguracji w pamięci.");
        return;
    }

    String page = F(
        "<!doctype html><html lang=\"pl\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>UnitCam S3</title><style>body{font-family:system-ui,sans-serif;"
        "max-width:42rem;margin:3rem auto;padding:1.5rem;background:#f8fafc;color:#0f172a}"
        "main{background:white;border:1px solid #e2e8f0;border-radius:1rem;padding:2rem}"
        "a{color:#4f46e5}</style></head><body><main><h1>Konfiguracja zapisana</h1>"
        "<p>UnitCam S3 uruchamia się ponownie i przechodzi z trybu AP do STA.</p>"
        "<p>Po połączeniu telefonu lub komputera z właściwą siecią otwórz: "
        "<a href=\"http://");
    page += unitCamIp;
    page += F("\">http://");
    page += unitCamIp;
    page += F("</a></p></main></body></html>");

    AsyncWebServerResponse* response = request->beginResponse(
        200, "text/html; charset=utf-8", page);
    response->addHeader("Cache-Control", "no-store");
    response->addHeader("Connection", "close");
    request->send(response);
    publishNetworkConfiguration("updated");
    scheduleConfigRestart();
}


void getWifiList(AsyncWebServerRequest* request)
{
    // Scan 
    spdlog::info("start scan");
    int n = WiFi.scanNetworks();
    spdlog::info("done, num: {}", n);

    DynamicJsonDocument doc(4096);
    JsonArray wifiList = doc.createNestedArray("wifiList");
    const int networkCount = n > 0 ? min(n, 20) : 0;
    for (int i = 0; i < networkCount; i++)
    {
        wifiList.add(WiFi.SSID(i));
    }
    WiFi.scanDelete();

    String json_buffer;
    serializeJson(doc, json_buffer);
    spdlog::info("result:\n {}", json_buffer.c_str());

    request->send(200, "application/json", json_buffer);
}


void load_system_apis(AsyncWebServer& server)
{
    server.on("/api/v1/get_mac", HTTP_GET, getMac);
    server.on("/api/v1/check_sdcard", HTTP_GET, getSdCardInfo);
    server.on("/api/v1/sdcard/files", HTTP_GET, getSdCardFiles);
    server.on("/api/v1/sdcard/usage", HTTP_GET, getSdCardUsage);
    server.on("/api/v1/led_on", HTTP_GET, ledOn);
    server.on("/api/v1/led_off", HTTP_GET, ledOff);
    server.on("/api/v1/get_config", HTTP_GET, getConfig);
    // Native HTML form fallback for captive-portal browsers that cannot run
    // the richer JavaScript/JSON submission reliably.
    server.on("/api/v1/set_config_form", HTTP_POST, setConfigForm);
    AsyncCallbackJsonWebHandler* getConfigHandler = new AsyncCallbackJsonWebHandler("/api/v1/set_config", setConfig);
    server.addHandler(getConfigHandler);
    server.on("/api/v1/reset_config", HTTP_GET, resetConfig);
    server.on("/api/v1/get_wifi_list", HTTP_GET, getWifiList);
}

