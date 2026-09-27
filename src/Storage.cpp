#include "Storage.h"
#include "ClimateProtocol.h"

namespace {
// Retain capacity for reading the two legacy inline RAW signals.
constexpr size_t ENV_CAPACITY = 2048 + 2 * JSON_ARRAY_SIZE(RAW_BUFFER_LENGTH);
constexpr size_t SIGNAL_CAPACITY = 1024 + JSON_ARRAY_SIZE(RAW_BUFFER_LENGTH);
bool validId(const String& id) {
    if (id.isEmpty() || id.length() > 64) return false;
    for (size_t i = 0; i < id.length(); ++i) {
        char c = id[i];
        if (!isalnum(static_cast<unsigned char>(c)) && c != '_') return false;
    }
    return true;
}
String signalPath(const String& id, const String& preset) {
    return "/db/" + id + "/" + preset + ".ir";
}
bool readEnvironment(const String& id, JsonDocument& doc) {
    if (!validId(id)) return false;
    File file = LittleFS.open("/db/" + id + ".json", "r");
    if (!file || deserializeJson(doc, file)) return false;
    return doc["id"].as<String>() == id && doc["buttons"].is<JsonObject>();
}
bool writeJson(const String& path, const JsonDocument& doc) {
    if (doc.overflowed()) return false;
    String temp = path + ".tmp";
    File file = LittleFS.open(temp, "w");
    if (!file) return false;
    size_t written = serializeJson(doc, file);
    file.flush();
    file.close();
    if (written != measureJson(doc) || !LittleFS.rename(temp, path)) {
        LittleFS.remove(temp);
        return false;
    }
    return true;
}

}
bool Storage::begin() {
    if (!LittleFS.begin(false)) {
        Serial.println("[Storage] Falha no LittleFS. Grave a imagem com uploadfs.");
        return false;
    }
    return LittleFS.exists("/db") || LittleFS.mkdir("/db");
}
bool Storage::exists(const String& id) {
    return validId(id) && LittleFS.exists("/db/" + id + ".json");
}
String Storage::listEnvironments() {
    DynamicJsonDocument doc(32768);
    JsonArray arr = doc.to<JsonArray>();
    File root = LittleFS.open("/db");
    if (!root) return "[]";
    for (File file = root.openNextFile(); file; file = root.openNextFile()) {
        if (file.isDirectory() || !String(file.name()).endsWith(".json")) continue;
        DynamicJsonDocument env(ENV_CAPACITY);
        if (deserializeJson(env, file) || !env["id"].is<String>()) continue;
        String id = env["id"];
        if (!validId(id)) continue;
        JsonObject item = arr.createNestedObject();
        item["id"] = id;
        item["name"] = env["name"] | "Aparelho";
        item["state"] = env["lastCommand"] | "unknown";
        item["lastPreset"] = env["lastPreset"];
        item["temperature"] = env["temperature"];
        item["mode"] = env["mode"];
        JsonArray buttons = item.createNestedArray("buttons");
        JsonObjectConst legacy = env["buttons"];
        for (JsonPairConst entry : legacy) {
            String preset = entry.key().c_str();
            JsonArrayConst raw = entry.value()["raw"];
            if (ClimateProtocol::validPreset(preset.c_str()) && raw.size() && raw.size() <= RAW_BUFFER_LENGTH &&
                !LittleFS.exists(signalPath(id, preset))) buttons.add(preset);
        }
        File signals = LittleFS.open("/db/" + id);
        if (signals && signals.isDirectory()) {
            for (File signal = signals.openNextFile(); signal; signal = signals.openNextFile()) {
                String name = signal.name();
                name = name.substring(name.lastIndexOf('/') + 1);
                if (!signal.isDirectory() && name.endsWith(".ir")) {
                    String preset = name.substring(0, name.length() - 3);
                    if (ClimateProtocol::validPreset(preset.c_str())) buttons.add(preset);
                }
            }
        }
        item["configured"] = buttons.size() > 0;
    }
    String output;
    serializeJson(doc, output);
    return output;
}
bool Storage::createEnvironment(const String& name, String* createdId) {
    if (name.isEmpty() || name.length() > MAX_ENV_NAME_BYTES) return false;
    File root = LittleFS.open("/db");
    size_t count = 0;
    for (File file = root.openNextFile(); file; file = root.openNextFile()) {
        if (String(file.name()).endsWith(".json")) ++count;
    }
    if (count >= MAX_ENVIRONMENTS) return false;
    String id;
    do { id = "env_" + String(esp_random(), HEX); } while (exists(id));
    DynamicJsonDocument doc(1024);
    doc["id"] = id;
    doc["name"] = name;
    doc["lastCommand"] = "unknown";
    doc.createNestedObject("buttons");
    bool saved = writeJson("/db/" + id + ".json", doc);
    if (saved && createdId) *createdId = id;
    return saved;
}
bool Storage::saveButton(const String& id, const String& preset, uint16_t* raw, uint16_t length, uint8_t frequencyKhz) {
    if (frequencyKhz < 20 || frequencyKhz > 60 || !exists(id) || !ClimateProtocol::validPreset(preset.c_str()) || !raw || !length || length > RAW_BUFFER_LENGTH) return false;
    String directory = "/db/" + id;
    if (!LittleFS.exists(directory) && !LittleFS.mkdir(directory)) return false;
    if (!LittleFS.exists(signalPath(id, preset))) {
        File root = LittleFS.open(directory);
        size_t count = 0;
        for (File file = root.openNextFile(); file; file = root.openNextFile()) {
            if (String(file.name()).endsWith(".ir")) ++count;
        }
        if (count >= 32) return false;
    }
    // Each complete remote state has its own file: memory use does not grow with presets.
    DynamicJsonDocument doc(SIGNAL_CAPACITY);
    doc["envId"] = id;
    doc["preset"] = preset;
    doc["freq"] = frequencyKhz;
    JsonArray samples = doc.createNestedArray("raw");
    for (uint16_t i = 0; i < length; ++i) if (!raw[i] || !samples.add(raw[i])) return false;
    return writeJson(signalPath(id, preset), doc);
}
bool Storage::getButton(const String& id, const String& preset, uint16_t* raw, uint16_t& length, uint8_t& frequencyKhz) {
    length = 0;
    frequencyKhz = 38;
    if (!raw || !exists(id) || !ClimateProtocol::validPreset(preset.c_str())) return false;
    DynamicJsonDocument doc(ENV_CAPACITY);
    JsonArray samples;
    if (LittleFS.exists(signalPath(id, preset))) {
        File file = LittleFS.open(signalPath(id, preset), "r");
        if (!file || deserializeJson(doc, file) || doc["envId"].as<String>() != id ||
            doc["preset"].as<String>() != preset || !doc["freq"].is<uint8_t>()) return false;
        frequencyKhz = doc["freq"];
        samples = doc["raw"];
    } else {
        // Old power_on/power_off files remain readable without rewriting flash.
        if (!readEnvironment(id, doc)) return false;
        samples = doc["buttons"][preset]["raw"];
        frequencyKhz = doc["buttons"][preset]["freq"] | 38;
    }
    if (frequencyKhz < 20 || frequencyKhz > 60) return false;
    if (!samples.size() || samples.size() > RAW_BUFFER_LENGTH) return false;
    for (JsonVariant value : samples) {
        if (!value.is<uint16_t>() || value.as<uint16_t>() == 0) { length = 0; return false; }
        raw[length++] = value.as<uint16_t>();
    }
    return true;
}
bool Storage::deleteButton(const String& id, const String& preset) {
    if (!exists(id) || !ClimateProtocol::validPreset(preset.c_str())) return false;
    String path = signalPath(id, preset);
    if (LittleFS.exists(path)) return LittleFS.remove(path);
    DynamicJsonDocument doc(ENV_CAPACITY);
    if (!readEnvironment(id, doc) || !doc["buttons"][preset]) return false;
    doc["buttons"].as<JsonObject>().remove(preset);
    if (doc["lastPreset"].as<String>() == preset) {
        doc["lastCommand"] = "unknown";
        doc["lastPreset"] = nullptr;
        doc["temperature"] = nullptr;
        doc["mode"] = nullptr;
    }
    return writeJson("/db/" + id + ".json", doc);
}
bool Storage::deleteEnvironment(const String& id) {
    if (!exists(id)) return false;
    String directory = "/db/" + id;
    File root = LittleFS.open(directory);
    if (root && root.isDirectory()) {
        for (File file = root.openNextFile(); file; file = root.openNextFile()) {
            if (file.isDirectory()) return false;
            String path = file.name();
            file.close();
            if (!LittleFS.remove(path)) return false;
        }
        root.close();
        if (!LittleFS.rmdir(directory)) return false;
    }
    return LittleFS.remove("/db/" + id + ".json");
}
bool Storage::recordTransmission(const String& id, const String& preset) {
    if (!ClimateProtocol::validPreset(preset.c_str())) return false;
    DynamicJsonDocument doc(ENV_CAPACITY);
    if (!readEnvironment(id, doc)) return false;
    doc["lastCommand"] = preset == "power_off" ? "off" :
        ((preset == "power_on" || ClimateProtocol::coolPreset(preset.c_str())) ? "on" : "unknown");
    doc["lastPreset"] = preset;
    int temperature = ClimateProtocol::temperature(preset.c_str());
    if (temperature) { doc["temperature"] = temperature; doc["mode"] = "cool"; }
    else { doc["temperature"] = nullptr; doc["mode"] = nullptr; }
    return writeJson("/db/" + id + ".json", doc);
}
