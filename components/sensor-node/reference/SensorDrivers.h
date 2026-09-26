#pragma once
#include <Arduino.h>

struct SensorReading {
    float value;
    const char* status;
    const char* source;
};
// Implement this interface to add hardware without changing the cloud protocol.
class ISensor {
public:
    virtual ~ISensor() = default;
    virtual void begin() {}
    virtual void loop() {}
    virtual SensorReading read() const = 0;
};
class SimulatedSensor : public ISensor {
    float value = NAN;
public:
    void set(float next) { value = next; }
    SensorReading read() const override { return {value, isfinite(value) ? "ok" : "unavailable", "simulated"}; }
};
class UnavailableSensor : public ISensor {
public:
    SensorReading read() const override { return {NAN, "not_implemented", "hardware"}; }
};
class CachedSensor : public ISensor {
    float value = NAN;
public:
    void set(float next) { value = next; }
    SensorReading read() const override { return {value, isfinite(value) ? "ok" : "unavailable", "hardware"}; }
};
class DigitalPresenceSensor : public ISensor {
    bool enabled = false;
    float value = NAN;
public:
    void enable(bool next);
    void loop() override;
    SensorReading read() const override { return {value, enabled ? (isfinite(value) ? "ok" : "unavailable") : "disabled", "hardware"}; }
};
