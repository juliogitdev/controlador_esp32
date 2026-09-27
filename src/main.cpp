#include <Arduino.h>
#include <WiFiManager.h>
#include <WebServer.h>
#include "Storage.h"
#include "ClimateProtocol.h"
#include "IRService.h"
#include "DeviceConfig.h"
#include "BackendService.h"
#include <time.h>

WebServer server(80);
bool storageReady = false;
bool configReady = false;
String captureStatus = "idle";
String captureEnv;
String captureButton;
uint16_t captureSamples = 0;

void jsonResponse(int code, const String& body) {
    server.sendHeader("Cache-Control", "no-store");
    server.send(code, "application/json; charset=utf-8", body);
}
void errorResponse(int code, const char* message) {
    StaticJsonDocument<256> doc;
    doc["error"] = message;
    String body;
    serializeJson(doc, body);
    jsonResponse(code, body);
}
void onCaptureResult(String envId, String button, bool success, uint16_t samples) {
    backendService.captureComplete(success, samples);
    captureEnv = envId;
    captureButton = button;
    captureSamples = samples;
    captureStatus = success ? "captured" : (samples ? "storage_error" : "timeout");
}

void executeCommand(JsonObjectConst command, JsonObject result) {
    String type = command["type"] | "";
    String error;
    result["status"] = "failed";
    if (type == "device.configure") {
        // The backend can tune acquisition, not replace its own credentials.
        StaticJsonDocument<256> options;
        if (command.containsKey("intervalMs")) options["intervalMs"] = command["intervalMs"];
        if (deviceConfig.save(options.as<JsonObjectConst>(), error)) {
            result["status"] = "completed";
        } else result["error"] = error;
        return;
    }
    if (type != "environment.create" && type != "environment.delete" && type != "ir.capture" &&
        type != "ir.send" && type != "ir.delete" && type != "climate.set") { result["error"] = "unsupported_command"; return; }
    if (!storageReady) { result["error"] = "storage_unavailable"; return; }
    if (irService.isCapturing()) { result["error"] = "capture_busy"; return; }
    if (type == "environment.create") {
        String name = command["name"] | "";
        name.trim();
        String id;
        if (Storage::createEnvironment(name, &id)) {
            result["status"] = "completed";
            result["envId"] = id;
        } else result["error"] = "invalid_name_or_storage_full";
        return;
    }
    String env = command["envId"] | "";
    if (type == "environment.delete") {
        if (!Storage::deleteEnvironment(env)) { result["error"] = "environment_not_found_or_delete_failed"; return; }
        result["status"] = "completed";
        result["deleted"] = env;
        return;
    }
    String button = command["button"] | "";
    if (type == "climate.set") {
        if (command.containsKey("presetId")) {
            if (!command["presetId"].is<String>() || command.containsKey("power") ||
                command.containsKey("temperature") || command.containsKey("mode") || command.containsKey("fan")) {
                result["error"] = "ambiguous_climate_request"; return;
            }
            button = command["presetId"].as<String>();
        } else {
        if (!command["power"].is<bool>() || command.containsKey("fan")) {
            result["error"] = "unsupported_climate_request"; return;
        }
        if (command["power"].as<bool>()) {
            if (!command["temperature"].is<int>() || !ClimateProtocol::validTemperature(command["temperature"].as<int>()) ||
                command["mode"].as<String>() != "cool") {
                result["error"] = "unsupported_climate_request"; return;
            }
            button = "cool_" + String(command["temperature"].as<int>());
        } else {
            if (command.containsKey("temperature") || command.containsKey("mode")) {
                result["error"] = "off_request_must_not_include_setpoint"; return;
            }
            button = "power_off";
        }
        }
    }
    if (!Storage::exists(env) || !ClimateProtocol::validPreset(button.c_str())) {
        result["error"] = "invalid_environment_or_button"; return;
    }
    if (type == "ir.delete") {
        if (!Storage::deleteButton(env, button)) { result["error"] = "preset_not_found_or_delete_failed"; return; }
        result["status"] = "completed";
        result["deleted"] = button;
        return;
    }
    if (type == "ir.capture") {
        if (command.containsKey("frequencyKhz") && (!command["frequencyKhz"].is<uint8_t>() || command["frequencyKhz"].as<uint8_t>() < 20 || command["frequencyKhz"].as<uint8_t>() > 60)) {
            result["error"] = "invalid_carrier_frequency"; return;
        }
        uint8_t frequency = command["frequencyKhz"] | 38;
        uint32_t timeout = 15000;
        if (command.containsKey("timeoutMs")) {
            if (!command["timeoutMs"].is<uint32_t>()) { result["error"] = "invalid_timeout"; return; }
            timeout = command["timeoutMs"];
        }
        if (timeout < 1000 || timeout > 60000) { result["error"] = "invalid_timeout"; return; }
        if (!irService.startCapture(env, button, timeout, frequency)) { result["error"] = "capture_busy"; return; }
        captureEnv = env; captureButton = button; captureStatus = "armed"; captureSamples = 0;
        result["status"] = "capturing";
        return;
    }
    uint16_t raw[RAW_BUFFER_LENGTH], length = 0;
    uint8_t frequency;
    if (!Storage::getButton(env, button, raw, length, frequency)) { result["error"] = "preset_not_learned_or_invalid"; return; }
    if (!irService.send(raw, length, frequency)) { result["error"] = "ir_send_failed"; return; }
    result["status"] = "completed";
    result["sent"] = true;
    result["preset"] = button;
    result["persisted"] = Storage::recordTransmission(env, button);
    // Sent only confirms transmission, never the physical appliance's state.
}
String telemetry() {
    DynamicJsonDocument doc(32768);
    doc["protocolVersion"] = 1;
    doc["deviceId"] = deviceConfig.deviceId;
    doc["bootId"] = deviceConfig.bootId;
    doc["firmwareVersion"] = "3.0.0";
    doc["role"] = "climate_actuator";
    doc["uptimeMs"] = millis();
    doc["timestamp"] = static_cast<uint64_t>(time(nullptr));
    doc["wifiRssi"] = WiFi.RSSI();
    doc["storageReady"] = storageReady;
    doc["intervalMs"] = deviceConfig.intervalMs;
    JsonObject capabilities = doc.createNestedObject("capabilities");
    capabilities["climateSet"] = "learned_presets";
    capabilities["mode"] = "cool";
    capabilities["fan"] = "as_recorded";
    capabilities["defaultCarrierKhz"] = 38;
    capabilities["minCarrierKhz"] = 20;
    capabilities["maxCarrierKhz"] = 60;
    capabilities["irCapture"] = storageReady;
    String profiles = storageReady ? Storage::listEnvironments() : "[]";
    doc["environments"] = serialized(profiles);
    backendService.addAck(doc.as<JsonObject>());
    if (doc.overflowed()) return "";
    String body;
    serializeJson(doc, body);
    return body;
}
bool authorizedSetup() {
    if (!configReady) { errorResponse(503, "Configuracao NVS indisponivel"); return false; }
    if (server.header("X-Setup-Key") != deviceConfig.setupKey) {
        errorResponse(401, "Informe a chave de configuracao exibida no monitor serial"); return false;
    }
    return true;
}

void handleApi() {
    const String uri = server.uri();
    if (uri == "/api/device" && server.method() == HTTP_GET) {
        DynamicJsonDocument doc(4096);
        deviceConfig.publicJson(doc.to<JsonObject>());
        doc["configReady"] = configReady;
        doc["role"] = "climate_actuator";
        doc["storageReady"] = storageReady;
        backendService.status(doc.createNestedObject("backend"));
        String body; serializeJson(doc, body); jsonResponse(200, body); return;
    }
    if (uri == "/api/device/config" && server.method() == HTTP_POST) {
        if (!authorizedSetup()) return;
        if (!backendService.canConfigure() || irService.isCapturing()) {
            errorResponse(409, "Aguarde o fim da troca com o backend ou da captura"); return;
        }
        if (server.arg("plain").length() > 8192) { errorResponse(413, "Configuracao muito grande"); return; }
        DynamicJsonDocument doc(12288);
        if (deserializeJson(doc, server.arg("plain")) || !doc.is<JsonObject>()) { errorResponse(400, "JSON invalido"); return; }
        String error;
        if (!deviceConfig.save(doc.as<JsonObjectConst>(), error)) { errorResponse(400, error.c_str()); return; }
        backendService.configurationChanged();
        jsonResponse(200, "{\"saved\":true}"); return;
    }
    if (server.method() == HTTP_POST) {
        if (!authorizedSetup()) return;
        if (deviceConfig.configured()) { errorResponse(409, "Controle de ambientes e IR pertence ao backend configurado"); return; }
    }
    if (!storageReady) { errorResponse(503, "LittleFS indisponivel; grave uploadfs"); return; }
    if (uri == "/api/capture" && server.method() == HTTP_GET) {
        StaticJsonDocument<384> doc;
        doc["status"] = captureStatus;
        doc["envId"] = captureEnv;
        doc["button"] = captureButton;
        doc["samples"] = captureSamples;
        String body;
        serializeJson(doc, body);
        jsonResponse(200, body);
        return;
    }
    if (uri == "/api/environments" && server.method() == HTTP_GET) {
        jsonResponse(200, Storage::listEnvironments());
        return;
    }
    if (server.method() != HTTP_POST) { errorResponse(404, "Rota nao encontrada"); return; }
    String body = server.arg("plain");
    if (body.length() > 512) { errorResponse(413, "JSON muito grande"); return; }
    StaticJsonDocument<768> doc;
    if (deserializeJson(doc, body) || !doc.is<JsonObject>()) {
        errorResponse(400, "JSON invalido"); return;
    }
    if (uri == "/api/environments") {
        if (!doc["name"].is<String>()) { errorResponse(400, "Nome obrigatorio"); return; }
        String name = doc["name"].as<String>();
        name.trim();
        if (name.isEmpty() || name.length() > MAX_ENV_NAME_BYTES) {
            errorResponse(400, "Nome deve ter entre 1 e 64 bytes UTF-8"); return;
        }
        if (!Storage::createEnvironment(name)) {
            errorResponse(507, "Falha ao salvar ou limite de 12 ambientes atingido"); return;
        }
        jsonResponse(201, "{\"status\":\"created\"}");
        return;
    }
    const String prefix = "/api/environments/";
    if (!uri.startsWith(prefix)) { errorResponse(404, "Rota nao encontrada"); return; }
    int slash = uri.indexOf('/', prefix.length());
    if (slash < 0) { errorResponse(404, "Rota nao encontrada"); return; }
    String id = uri.substring(prefix.length(), slash);
    String action = uri.substring(slash + 1);
    if (action != "capture" && action != "command") { errorResponse(404, "Rota nao encontrada"); return; }
    if (!Storage::exists(id)) { errorResponse(404, "Ambiente nao encontrado"); return; }
    String button = doc["button"] | "";
    if (!ClimateProtocol::validPreset(button.c_str())) { errorResponse(400, "Botao invalido"); return; }
    if (irService.isCapturing()) { errorResponse(409, "Ja existe uma captura em andamento"); return; }
    if (action == "capture") {
        if (doc.containsKey("frequencyKhz") && (!doc["frequencyKhz"].is<uint8_t>() || doc["frequencyKhz"].as<uint8_t>() < 20 || doc["frequencyKhz"].as<uint8_t>() > 60)) {
            errorResponse(400, "Frequencia deve ser de 20 a 60 kHz"); return;
        }
        uint8_t frequency = doc["frequencyKhz"] | 38;
        unsigned long timeout = 15000;
        if (doc.containsKey("timeoutMs")) {
            if (!doc["timeoutMs"].is<unsigned long>()) { errorResponse(400, "Timeout invalido"); return; }
            timeout = doc["timeoutMs"];
        }
        if (timeout < 1000 || timeout > 60000) { errorResponse(400, "Timeout deve ser de 1000 a 60000 ms"); return; }
        irService.startCapture(id, button, timeout, frequency);
        captureEnv = id;
        captureButton = button;
        captureSamples = 0;
        captureStatus = "armed";
        jsonResponse(202, "{\"status\":\"armed\"}");
        return;
    }
    uint16_t raw[RAW_BUFFER_LENGTH];
    uint16_t length;
    uint8_t frequency;
    if (!Storage::getButton(id, button, raw, length, frequency)) { errorResponse(404, "Botao ausente ou dados invalidos"); return; }
    if (!irService.send(raw, length, frequency)) { errorResponse(500, "Falha no envio IR"); return; }
    bool saved = Storage::recordTransmission(id, button);
    jsonResponse(200, saved ? "{\"sent\":true,\"persisted\":true}" : "{\"sent\":true,\"persisted\":false}");
}
void setup() {
    Serial.begin(115200);
    delay(500);
    configReady = deviceConfig.begin();
    Serial.println("Chave de configuracao local: " + deviceConfig.setupKey);
    storageReady = Storage::begin();
    irService.begin();
    WiFiManager wm;
    wm.setConfigPortalTimeout(180);
    if (!wm.autoConnect("ArControl-Config")) {
        Serial.println("Falha no Wi-Fi. Reiniciando...");
        delay(3000);
        ESP.restart();
        return;
    }
    WiFi.setAutoReconnect(true);
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    backendService.begin(executeCommand);
    Serial.print("Abra http://");
    Serial.println(WiFi.localIP());
    server.on("/", HTTP_GET, []() {
        if (!storageReady || !LittleFS.exists("/index.html")) {
            server.send(503, "text/plain; charset=utf-8", "Interface ausente. Execute pio run -t uploadfs.");
            return;
        }
        File file = LittleFS.open("/index.html", "r");
        server.sendHeader("Cache-Control", "no-cache");
        server.streamFile(file, "text/html; charset=utf-8");
    });
    // Only the interface is public; /db files are not served as static assets.
    const char* headers[] = {"X-Setup-Key"};
    server.collectHeaders(headers, 1);
    server.onNotFound(handleApi);
    server.begin();
}
void loop() {
    irService.loop(onCaptureResult);
    server.handleClient();
    String payload;
    if (configReady && backendService.due() && !irService.isCapturing() && WiFi.status() == WL_CONNECTED && time(nullptr) >= 1700000000) payload = telemetry();
    if (configReady) backendService.loop(payload, irService.isCapturing());
    delay(1);
}
