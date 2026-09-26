#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Adafruit_BME280.h>
#include "SensorDrivers.h"

class SensorService {
    struct Binding {
        const char* id;
        const char* unit;
        ISensor* hardware;
        SimulatedSensor simulated;
        bool simulation = false;
        Binding(const char* key, const char* units, ISensor* driver)
            : id(key), unit(units), hardware(driver) {}
    };
    Adafruit_BME280 bme;
    bool bmeFound = false;
    CachedSensor temperature;
    CachedSensor humidity;
    DigitalPresenceSensor presence;
    UnavailableSensor voltage;
    Binding bindings[4] = {
        {"temperature", "C", &temperature},
        {"humidity", "%", &humidity},
        {"presence", "boolean", &presence},
        {"voltage", "V", &voltage}
    };
    unsigned long lastRead = 0;
    unsigned long lastMotion = 0;
    bool motionSeen = false;
    SensorReading reading(size_t index) const;
public:
    void begin();
    void configurePresence(bool enabled) { presence.enable(enabled); }
    void loop();
    float getTemperature() { return reading(0).value; }
    float getHumidity() { return reading(1).value; }
    void telemetry(JsonObject out);
    bool simulate(JsonObjectConst command, String& error);
};
extern SensorService sensorService;
