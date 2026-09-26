// IRService.h
#ifndef IR_SERVICE_H
#define IR_SERVICE_H

#include <Arduino.h>
#include "config.h"

enum IRMode { IDLE, CAPTURING };

class IRService {
private:
    IRMode mode = IDLE;
    String targetEnvId;
    String targetButton;
    unsigned long captureStartTime = 0;
    unsigned long captureTimeout = 15000;

    uint16_t rawBuffer[RAW_BUFFER_LENGTH];
    uint16_t rawLength = 0;
    uint8_t captureFrequencyKhz = 38;

public:
    void begin();
    void loop(void (*onComplete)(String envId, String btn, bool success, uint16_t samples));
    bool startCapture(const String& envId, const String& button, unsigned long timeoutMs, uint8_t frequencyKhz = 38);
    bool send(uint16_t* rawData, uint16_t length, uint8_t frequencyKhz = 38);
    bool isCapturing() const { return mode == CAPTURING; }
};

extern IRService irService;
#endif
