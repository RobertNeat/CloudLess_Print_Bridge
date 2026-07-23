/**
 * @file main.cpp
 * @author Forairaaaaa
 * @brief 
 * @version 0.1
 * @date 2023-10-31
 * 
 * @copyright Copyright (c) 2023
 * 
 */
#include <mooncake.h>
#include <Arduino.h>
#include "hal/hal.h"
#include "servers/servers.h"


void setup() 
{
    // Init 
    HAL::hal::GetHal()->init();

    // The control server selects provisioning AP or configured station mode.
    UserDemoServers::start_ap_server();
}


void loop() 
{
    delay(5000);
}
