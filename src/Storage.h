#ifndef STORAGE_H
#define STORAGE_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include "config.h"

class Storage {
public:
    static bool begin();
    static bool exists(const String& envId);
    static String listEnvironments();
    static bool createEnvironment(const String& name, String* createdId = nullptr);
    static bool saveButton(const String& envId, const String& buttonName, uint16_t* rawData, uint16_t length, uint8_t frequencyKhz = 38);
    static bool getButton(const String& envId, const String& buttonName, uint16_t* outRaw, uint16_t& outLength, uint8_t& frequencyKhz);
    static bool recordTransmission(const String& envId, const String& preset);
};

#endif
