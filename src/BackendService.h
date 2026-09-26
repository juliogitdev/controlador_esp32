#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

class BackendService {
    Preferences prefs;
    QueueHandle_t completed = nullptr;
    bool inFlight = false;
    bool healthy = false;
    bool journalReady = false;
    bool pendingAck = false;
    bool waitingCapture = false;
    uint32_t lastAttempt = 0;
    uint32_t retryMs = 0;
    uint32_t lastSuccess = 0;
    uint32_t lastSequence = 0;
    String state = "disabled";
    DynamicJsonDocument journal{1024};
    void (*executor)(JsonObjectConst, JsonObject) = nullptr;
    bool persist();
    void receive(const String& body);
public:
    void begin(void (*execute)(JsonObjectConst, JsonObject));
    void loop(const String& payload, bool capturing);
    bool due() const;
    bool busy() const { return inFlight; }
    bool canConfigure() const { return !inFlight && !waitingCapture; }
    void configurationChanged();
    void addAck(JsonObject payload);
    void status(JsonObject out) const;
    void captureComplete(bool success, uint16_t samples);
};
extern BackendService backendService;
