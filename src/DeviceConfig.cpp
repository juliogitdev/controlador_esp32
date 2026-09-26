#include "DeviceConfig.h"
#include <WiFi.h>
#include <mbedtls/x509_crt.h>

DeviceConfig deviceConfig;

bool DeviceConfig::begin() {
    uint64_t mac = ESP.getEfuseMac();
    char id[32];
    snprintf(id, sizeof(id), "esp32-%04x%08x", unsigned(mac >> 32), unsigned(mac));
    deviceId = id;
    bootId = String(esp_random(), HEX) + String(esp_random(), HEX);
    if (!prefs.begin("device", false)) return false;
    setupKey = prefs.getString("setupKey");
    if (setupKey.isEmpty()) {
        setupKey = String(esp_random(), HEX) + String(esp_random(), HEX);
        if (!prefs.putString("setupKey", setupKey)) return false;
    }
    DynamicJsonDocument doc(10240);
    String saved = prefs.getString("config", "{}");
    if (deserializeJson(doc, saved)) return false;
    url = doc["url"] | "";
    token = doc["token"] | "";
    ca = doc["ca"] | "";
    intervalMs = doc["intervalMs"] | 5000U;
    return true;
}
bool DeviceConfig::save(JsonObjectConst input, String& error) {
    if (input.containsKey("url") && !input["url"].is<String>()) { error = "URL invalida"; return false; }
    if (input.containsKey("token") && !input["token"].is<String>()) { error = "Token invalido"; return false; }
    if (input.containsKey("ca") && !input["ca"].is<String>()) { error = "CA invalida"; return false; }
    if (input.containsKey("intervalMs") && !input["intervalMs"].is<uint32_t>()) { error = "Intervalo invalido"; return false; }
    String nextUrl = input["url"] | url;
    String nextToken = input["token"] | token;
    String nextCa = input["ca"] | ca;
    nextUrl.trim();
    while (nextUrl.endsWith("/")) nextUrl.remove(nextUrl.length() - 1);
    // Blank secrets in the form preserve the existing credentials.
    if (nextToken.isEmpty()) nextToken = token;
    if (nextCa.isEmpty()) nextCa = ca;
    uint32_t nextInterval = input["intervalMs"] | intervalMs;
    if (nextInterval < 2000 || nextInterval > 60000) { error = "Intervalo: 2000 a 60000 ms"; return false; }
    if (nextUrl.length() > 256 || (!nextUrl.isEmpty() && (!nextUrl.startsWith("https://") || nextUrl.length() < 9 || nextUrl.indexOf('@') >= 0 || nextUrl.indexOf('?') >= 0 || nextUrl.indexOf('#') >= 0))) {
        error = "Use uma URL base HTTPS sem credenciais, query ou fragmento"; return false;
    }
    for (size_t i = 0; i < nextUrl.length(); ++i) if (nextUrl[i] <= ' ') { error = "URL invalida"; return false; }
    if (nextToken.length() > 256 || nextToken.indexOf('\r') >= 0 || nextToken.indexOf('\n') >= 0) { error = "Token invalido"; return false; }
    if (nextCa.length() > 6000) { error = "CA deve ter ate 6000 bytes"; return false; }
    if (!nextUrl.isEmpty()) {
        if (nextToken.isEmpty() || nextCa.isEmpty()) { error = "Informe token e certificado raiz PEM"; return false; }
        mbedtls_x509_crt cert;
        mbedtls_x509_crt_init(&cert);
        int result = mbedtls_x509_crt_parse(&cert, reinterpret_cast<const unsigned char*>(nextCa.c_str()), nextCa.length() + 1);
        mbedtls_x509_crt_free(&cert);
        if (result != 0) { error = "Certificado PEM invalido"; return false; }
    }
    DynamicJsonDocument doc(10240);
    doc["url"] = nextUrl; doc["token"] = nextToken; doc["ca"] = nextCa;
    doc["intervalMs"] = nextInterval;
    String value;
    if (doc.overflowed()) { error = "Configuracao muito grande"; return false; }
    serializeJson(doc, value);
    if (prefs.putString("config", value) != value.length()) { error = "Falha ao salvar configuracao"; return false; }
    url = nextUrl; token = nextToken; ca = nextCa;
    intervalMs = nextInterval;
    return true;
}
void DeviceConfig::publicJson(JsonObject out) const {
    out["deviceId"] = deviceId;
    out["bootId"] = bootId;
    out["url"] = url;
    out["configured"] = configured();
    out["tokenConfigured"] = !token.isEmpty();
    out["caConfigured"] = !ca.isEmpty();
    out["intervalMs"] = intervalMs;
}
