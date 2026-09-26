#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>

class DeviceConfig {
    Preferences prefs;
public:
    String deviceId;
    String bootId;
    String url;
    String token;
    String ca;
    String setupKey;
    uint32_t intervalMs = 5000;
    bool begin();
    bool configured() const { return url.length() > 0; }
    bool save(JsonObjectConst input, String& error);
    void publicJson(JsonObject out) const;
};
extern DeviceConfig deviceConfig;
