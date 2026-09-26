// IRService.cpp
#include "IRService.h"
#include <IRremote.hpp>
#include "Storage.h"

IRService irService;

void IRService::begin() {
    IrReceiver.begin(PINO_RECEPTOR_IR, DISABLE_LED_FEEDBACK);
    IrSender.begin(PINO_EMISSOR_IR);
}

bool IRService::startCapture(const String& envId, const String& button, unsigned long timeoutMs, uint8_t frequencyKhz) {
    if (isCapturing() || frequencyKhz < 20 || frequencyKhz > 60) return false;
    captureFrequencyKhz = frequencyKhz;
    targetEnvId = envId;
    targetButton = button;
    captureTimeout = timeoutMs;
    captureStartTime = millis();
    rawLength = 0;

    IrReceiver.stop();
    IrReceiver.start();
    IrReceiver.resume();
    mode = CAPTURING;
    return true;
}

void IRService::loop(void (*onComplete)(String envId, String btn, bool success, uint16_t samples)) {
    if (mode != CAPTURING) {
        if (IrReceiver.decode()) IrReceiver.resume();
        return;
    }

    if (millis() - captureStartTime >= captureTimeout) {
        Serial.println("[IR] Tempo esgotado sem receber sinal valido.");
        mode = IDLE;
        IrReceiver.resume();
        if (onComplete) onComplete(targetEnvId, targetButton, false, 0);
        return;
    }

    if (IrReceiver.decode()) {
        if ((IrReceiver.decodedIRData.flags & IRDATA_FLAGS_WAS_OVERFLOW) ||
            IrReceiver.irparams.rawlen < 4) {
            IrReceiver.resume();
            return;
        }
        unsigned int len = IrReceiver.irparams.rawlen;
        rawLength = 0;
        for (unsigned int i = 1; i < len && rawLength < RAW_BUFFER_LENGTH; i++) {
            int32_t duration = static_cast<int32_t>(IrReceiver.irparams.rawbuf[i]) * MICROS_PER_TICK;
            duration += (i & 1) ? -MARK_EXCESS_MICROS : MARK_EXCESS_MICROS;
            if (duration <= 0 || duration > UINT16_MAX) {
                IrReceiver.resume();
                return;
            }
            rawBuffer[rawLength++] = duration;
        }

        Serial.printf("[IR] Sinal capturado com sucesso! Amostras: %d\n", rawLength);
        bool saved = Storage::saveButton(targetEnvId, targetButton, rawBuffer, rawLength, captureFrequencyKhz);

        mode = IDLE;
        IrReceiver.resume();
        if (onComplete) onComplete(targetEnvId, targetButton, saved, rawLength);
        return;
    }

}

bool IRService::send(uint16_t* rawData, uint16_t length, uint8_t frequencyKhz) {
    if (frequencyKhz < 20 || frequencyKhz > 60 || isCapturing() || length == 0 || length > RAW_BUFFER_LENGTH || rawData == nullptr) return false;
    IrReceiver.stop();
    IrSender.sendRaw(rawData, length, frequencyKhz);
    IrReceiver.start();
    IrReceiver.resume();
    return true;
}
