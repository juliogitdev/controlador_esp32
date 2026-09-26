#include "SensorService.h"
#include "config.h"
SensorService sensorService;
void DigitalPresenceSensor::enable(bool next) {
    enabled = next;
    value = NAN;
    if (enabled) pinMode(PINO_PRESENCA, INPUT_PULLDOWN);
}
void DigitalPresenceSensor::loop() {
    if (enabled) value = digitalRead(PINO_PRESENCA) == HIGH ? 1 : 0;
}
void SensorService::begin() {
    bmeFound = bme.begin(0x76) || bme.begin(0x77);
    Serial.println(bmeFound ? "[Sensor] BME280 detectado." : "[Sensor] BME280 indisponivel.");
    for (auto& binding : bindings) binding.hardware->begin();
    lastRead = millis() - 5000;
}
SensorReading SensorService::reading(size_t index) const {
    const auto& binding = bindings[index];
    const ISensor* driver = binding.simulation ? static_cast<const ISensor*>(&binding.simulated) : binding.hardware;
    return driver->read();
}
void SensorService::loop() {
    for (auto& binding : bindings) binding.hardware->loop();
    SensorReading motion = reading(2);
    if (isfinite(motion.value) && motion.value != 0) {
        lastMotion = millis();
        motionSeen = true;
    }
    if (millis() - lastRead >= 5000) {
        lastRead = millis();
        temperature.set(bmeFound ? bme.readTemperature() : NAN);
        humidity.set(bmeFound ? bme.readHumidity() : NAN);
    }
}
void SensorService::telemetry(JsonObject out) {
    for (size_t i = 0; i < 4; ++i) {
        auto item = out.createNestedObject(bindings[i].id);
        SensorReading value = reading(i);
        if (!isfinite(value.value)) item["value"] = nullptr;
        else if (i == 2) item["value"] = value.value != 0;
        else item["value"] = value.value;
        item["unit"] = bindings[i].unit;
        item["status"] = value.status;
        item["source"] = value.source;
        item["ageMs"] = (i < 2 && !bindings[i].simulation) ? millis() - lastRead : 0;
        if (i == 2) {
            if (motionSeen && isfinite(value.value)) item["lastMotionAgeMs"] = millis() - lastMotion;
            else item["lastMotionAgeMs"] = nullptr;
        }
    }
}
bool SensorService::simulate(JsonObjectConst command, String& error) {
    String id = command["sensor"] | "";
    if (!command["enabled"].is<bool>()) { error = "enabled deve ser booleano"; return false; }
    for (size_t i = 0; i < 4; ++i) {
        auto& binding = bindings[i];
        if (id != binding.id) continue;
        bool enabled = command["enabled"];
        float value = NAN;
        if (enabled) {
            if (!command.containsKey("value")) { error = "value obrigatorio (ou null)"; return false; }
            if (!command["value"].isNull()) {
                if (i == 2) {
                    if (!command["value"].is<bool>()) { error = "Presenca exige true/false"; return false; }
                    value = command["value"].as<bool>() ? 1 : 0;
                } else {
                    if (!command["value"].is<float>()) { error = "Valor deve ser numerico"; return false; }
                    value = command["value"];
                    if (!isfinite(value) || (i == 0 && (value < -40 || value > 85)) ||
                        (i == 1 && (value < 0 || value > 100)) || (i == 3 && (value < 0 || value > 1000))) {
                        error = "Valor fora do intervalo"; return false;
                    }
                }
            }
        }
        if (i == 2 && binding.simulation != enabled) motionSeen = false;
        binding.simulated.set(value);
        binding.simulation = enabled;
        return true;
    }
    error = "Sensor desconhecido";
    return false;
}
