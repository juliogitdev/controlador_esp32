#include "BackendService.h"
#include "DeviceConfig.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include <new>

BackendService backendService;
namespace {
struct Exchange {
    String url, token, ca, payload, response;
    QueueHandle_t queue;
    int code = -1;
};
void exchangeTask(void* parameter) {
    auto* job = static_cast<Exchange*>(parameter);
    {
        WiFiClientSecure tls;
        tls.setCACert(job->ca.c_str());
        tls.setHandshakeTimeout(8);
        HTTPClient http;
        http.setConnectTimeout(5000);
        http.setTimeout(5000);
        http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
        if (http.begin(tls, job->url)) {
            http.addHeader("Content-Type", "application/json");
            http.addHeader("Authorization", "Bearer " + job->token);
            job->code = http.POST(job->payload);
            int size = http.getSize();
            // Contract requires bounded, non-chunked responses with Content-Length.
            if (job->code == 200 && size > 0 && size <= 2048) {
                char buffer[2049];
                auto* stream = http.getStreamPtr();
                stream->setTimeout(5000);
                size_t count = stream->readBytes(buffer, size);
                buffer[count] = 0;
                if (count == static_cast<size_t>(size)) job->response = buffer;
                else job->code = -2;
            } else if (job->code == 200) job->code = -3;
            http.end();
        }
    }
    xQueueSend(job->queue, &job, portMAX_DELAY);
    vTaskDelete(nullptr);
}
}
bool BackendService::persist() {
    String saved;
    serializeJson(journal, saved);
    if (journal.overflowed() || prefs.putString("journal", saved) != saved.length()) {
        journalReady = false;
        state = "journal_error";
        return false;
    }
    return true;
}
void BackendService::begin(void (*execute)(JsonObjectConst, JsonObject)) {
    executor = execute;
    completed = xQueueCreate(1, sizeof(Exchange*));
    journalReady = completed && prefs.begin("commands", false);
    if (!journalReady) { state = "journal_error"; return; }
    if (deserializeJson(journal, prefs.getString("journal", "{}"))) {
        journalReady = false; state = "journal_error"; return;
    }
    if (!journal.is<JsonObject>() || (journal.size() &&
        (!journal["seq"].is<uint32_t>() || journal["seq"].as<uint32_t>() == 0 ||
         !journal["id"].is<String>() || !journal["status"].is<String>()))) {
        journalReady = false; state = "journal_error"; return;
    }
    lastSequence = journal["seq"] | 0U;
    pendingAck = lastSequence != 0;
    String previous = journal["status"] | "";
    if (previous == "executing" || previous == "capturing") {
        journal["status"] = "unknown_after_restart";
        persist();
    }
    configurationChanged();
}
void BackendService::configurationChanged() {
    healthy = false;
    retryMs = 0;
    lastAttempt = millis() - deviceConfig.intervalMs;
    state = deviceConfig.configured() ? "waiting" : "disabled";
}
bool BackendService::due() const {
    uint32_t interval = retryMs ? retryMs : deviceConfig.intervalMs;
    return journalReady && !inFlight && deviceConfig.configured() && millis() - lastAttempt >= interval;
}
void BackendService::addAck(JsonObject payload) {
    payload["lastSequence"] = lastSequence;
    if (pendingAck) payload["ack"] = journal.as<JsonObjectConst>();
    else payload["ack"] = nullptr;
}
void BackendService::status(JsonObject out) const {
    out["state"] = journalReady ? state : "journal_error";
    out["connected"] = healthy && WiFi.status() == WL_CONNECTED && millis() - lastSuccess < 2 * deviceConfig.intervalMs + 15000;
    out["inFlight"] = inFlight;
    out["pendingAck"] = pendingAck;
    out["lastSequence"] = lastSequence;
    if (lastSuccess) out["lastSuccessAgeMs"] = millis() - lastSuccess; else out["lastSuccessAgeMs"] = nullptr;
}
void BackendService::receive(const String& body) {
    DynamicJsonDocument doc(4096);
    if (deserializeJson(doc, body) || !doc.is<JsonObject>() || doc["protocolVersion"] != 1 ||
        doc["deviceId"].as<String>() != deviceConfig.deviceId || doc["bootId"].as<String>() != deviceConfig.bootId) {
        state = "invalid_response"; healthy = false; return;
    }
    healthy = true;
    lastSuccess = millis();
    state = "connected";
    if (pendingAck && !waitingCapture && doc["ackId"].is<String>() &&
        doc["ackId"].as<String>() == journal["id"].as<String>()) pendingAck = false;
    if (doc["command"].isNull()) return;
    if (pendingAck || waitingCapture) return;
    JsonObjectConst command = doc["command"];
    if (command.isNull() || !command["id"].is<String>() || !command["seq"].is<uint32_t>()) {
        state = "invalid_command"; return;
    }
    String id = command["id"];
    uint32_t sequence = command["seq"];
    if (id.isEmpty() || id.length() > 64 || !sequence) { state = "invalid_command"; return; }
    if (sequence <= lastSequence) {
        // A single ordered command stream per device. Re-send last result, never replay IR.
        if (sequence == lastSequence && id == journal["id"].as<String>()) pendingAck = true;
        else state = "stale_command";
        return;
    }
    journal.clear();
    journal["id"] = id;
    journal["seq"] = sequence;
    journal["status"] = "executing";
    lastSequence = sequence;
    pendingAck = true;
    // Durable watermark BEFORE any side effect. Failure stops command processing.
    if (!persist()) return;
    JsonObject result = journal.as<JsonObject>();
    uint64_t now = time(nullptr);
    if (command["bootId"].as<String>() != deviceConfig.bootId || !command["expiresAt"].is<uint64_t>() || command["expiresAt"].as<uint64_t>() <= now) {
        result["status"] = "rejected";
        result["error"] = "expired_or_wrong_boot";
    } else {
        executor(command, result);
    }
    waitingCapture = journal["status"] == "capturing";
    persist();
}
void BackendService::captureComplete(bool success, uint16_t samples) {
    if (!waitingCapture) return;
    waitingCapture = false;
    journal["status"] = success ? "completed" : "failed";
    journal["samples"] = samples;
    if (!success) journal["error"] = samples ? "storage_error" : "capture_timeout";
    persist();
    lastAttempt = millis() - deviceConfig.intervalMs;
}
void BackendService::loop(const String& payload, bool capturing) {
    Exchange* finished = nullptr;
    if (completed && xQueueReceive(completed, &finished, 0) == pdTRUE) {
        inFlight = false;
        if (finished->code == 200) {
            receive(finished->response);
            retryMs = healthy ? 0 : 10000;
        } else {
            healthy = false;
            state = "http_error_" + String(finished->code);
            retryMs = retryMs ? min(retryMs * 2, 60000U) : 5000;
        }
        delete finished;
        lastAttempt = millis();
    }
    if (!due() || capturing || payload.isEmpty()) return;
    if (WiFi.status() != WL_CONNECTED) { healthy = false; state = "wifi_disconnected"; return; }
    if (time(nullptr) < 1700000000) { state = "waiting_clock"; return; }
    auto* job = new (std::nothrow) Exchange;
    lastAttempt = millis();
    if (!job) { state = "out_of_memory"; return; }
    job->url = deviceConfig.url + "/api/v1/devices/" + deviceConfig.deviceId + "/exchange";
    job->token = deviceConfig.token;
    job->ca = deviceConfig.ca;
    job->payload = payload;
    job->queue = completed;
    inFlight = true;
    if (xTaskCreate(exchangeTask, "backend-http", 12288, job, 1, nullptr) != pdPASS) {
        inFlight = false;
        delete job;
        state = "out_of_memory";
    }
}
