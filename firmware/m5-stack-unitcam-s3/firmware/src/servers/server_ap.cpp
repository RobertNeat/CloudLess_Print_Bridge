/**
 * UnitCamS3 provisioning and camera web server.
 *
 * With no valid configuration the device exposes an open access point named
 * UnitCamS3-XXXX and serves the setup UI at 192.168.1.1.  Once configured it
 * joins the selected network using the requested static IPv4 address.
 */
#include "servers.h"
#include <mooncake.h>
#include <Arduino.h>
#include "hal/hal.h"

#include <FS.h>
#include <LittleFS.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>

#include "apis/camera/api_cam.h"
#include "apis/system/api_system.h"
#include "apis/mic/api_mic.h"
#include "services/video_service/video_service.h"

static AsyncWebServer* _server = nullptr;

static void sendWebApplication(AsyncWebServerRequest* request)
{
    if (!LittleFS.exists("/index.html.gz"))
    {
        spdlog::error("web application missing: /index.html.gz");
        request->send(500, "text/plain", "Web application is missing from LittleFS");
        return;
    }

    AsyncWebServerResponse* response = request->beginResponse(
        LittleFS, "/index.html.gz", "text/html", false);
    response->addHeader("Content-Encoding", "gzip");
    response->addHeader("Cache-Control", "no-store");
    request->send(response);
}

static bool parseIp(const String& value, IPAddress& address)
{
    return value.length() > 0 && address.fromString(value);
}

static bool isConfigured(const HAL::hal::Config_t& config)
{
    IPAddress unitcamIp;
    IPAddress gatewayIp;
    IPAddress subnetMask;
    IPAddress dnsIp;
    IPAddress videoServiceIp;
    return !config.wifi_ssid.isEmpty()
        && parseIp(config.unitcam_ip, unitcamIp)
        && parseIp(config.gateway_ip, gatewayIp)
        && parseIp(config.subnet_mask, subnetMask)
        && parseIp(config.dns_ip, dnsIp)
        && parseIp(config.video_service_ip, videoServiceIp)
        && unitcamIp != IPAddress(0, 0, 0, 0)
        && gatewayIp != IPAddress(0, 0, 0, 0)
        && subnetMask != IPAddress(0, 0, 0, 0)
        && dnsIp != IPAddress(0, 0, 0, 0)
        && videoServiceIp != IPAddress(0, 0, 0, 0)
        && config.video_service_port > 0
        && config.mqtt_port > 0
        && config.heartbeat_interval_seconds >= 5
        && config.heartbeat_interval_seconds <= 3600;
}

static void startProvisioningAccessPoint()
{
    const IPAddress apIp(192, 168, 1, 1);
    const IPAddress subnet(255, 255, 255, 0);
    WiFi.mode(WIFI_AP);
    HAL::hal::GetHal()->cacheWifiMacAddress();
    String macSuffix = HAL::hal::GetHal()->getWifiMacAddress();
    macSuffix.replace(":", "");
    macSuffix = macSuffix.substring(max(0, (int)macSuffix.length() - 4));
    char apName[24];
    snprintf(apName, sizeof(apName), "UnitCamS3-%s", macSuffix.c_str());
    WiFi.setSleep(false);
    WiFi.softAPConfig(apIp, apIp, subnet);
    WiFi.softAP(apName);

    spdlog::info("provisioning AP: {}", apName);
    spdlog::info("configuration page: http://192.168.1.1");
}

static bool connectToConfiguredNetwork(const HAL::hal::Config_t& config)
{
    IPAddress localIp;
    IPAddress gateway;
    IPAddress subnet;
    IPAddress dns;
    if (!parseIp(config.unitcam_ip, localIp)
        || !parseIp(config.gateway_ip, gateway)
        || !parseIp(config.subnet_mask, subnet)
        || !parseIp(config.dns_ip, dns))
        return false;

    WiFi.mode(WIFI_STA);
    HAL::hal::GetHal()->cacheWifiMacAddress();
    WiFi.setSleep(false);
    if (!WiFi.config(localIp, gateway, subnet, dns))
    {
        spdlog::error("static IP configuration failed: ip={}, gateway={}, subnet={}",
            localIp.toString().c_str(), gateway.toString().c_str(), subnet.toString().c_str());
        return false;
    }

    WiFi.begin(config.wifi_ssid.c_str(), config.wifi_password.c_str());
    spdlog::info("connecting to WiFi: {}", config.wifi_ssid.c_str());

    const uint32_t startedAt = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 30000UL)
    {
        delay(250);
        yield();
    }

    if (WiFi.status() != WL_CONNECTED)
    {
        spdlog::error("WiFi connection failed (status={}), returning to provisioning mode", (int)WiFi.status());
        WiFi.disconnect(true);
        delay(100);
        return false;
    }

    spdlog::info("camera page: http://{}", WiFi.localIP().toString().c_str());
    // Modem power saving is the normal idle state in station mode. Camera
    // streaming temporarily disables it to keep latency and throughput stable.
    WiFi.setSleep(true);
    spdlog::info("WiFi modem power saving enabled for STA idle mode");
    return true;
}

void UserDemoServers::start_ap_server()
{
    delay(200);
    Serial.begin(115200);

    const auto config = HAL::hal::GetHal()->getConfig();
    if (!isConfigured(config))
    {
        spdlog::warn("provisioning reason: stored network configuration is incomplete or invalid");
        startProvisioningAccessPoint();
    }
    else if (!connectToConfiguredNetwork(config))
    {
        spdlog::warn("provisioning reason: station connection timed out or failed");
        startProvisioningAccessPoint();
    }

    _server = new AsyncWebServer(80);

    load_cam_apis(*_server);
    load_system_apis(*_server);
    load_mic_apis(*_server);
    load_video_service_apis(*_server);

    // Serve the single-file application explicitly. Depending on automatic
    // .gz probing caused noisy VFS failures and could leave captive-portal
    // browsers displaying an empty response during provisioning.
    _server->on("/", HTTP_GET, sendWebApplication);
    _server->on("/index.html", HTTP_GET, sendWebApplication);
    _server->serveStatic("/", LittleFS, "/").setDefaultFile("index.html");
    _server->onNotFound([](AsyncWebServerRequest* request) {
        // React routes and captive-portal probes both land on the setup page.
        request->redirect("/");
    });

    start_video_service_background_tasks();
    _server->begin();
    HAL::hal::GetHal()->setLed(true);
}

void UserDemoServers::stop_ap_server()
{
    spdlog::info("stop web server");
    if (_server != nullptr)
    {
        delete _server;
        _server = nullptr;
    }
    delay(200);
    WiFi.disconnect(true);
}
