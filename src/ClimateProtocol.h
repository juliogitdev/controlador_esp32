#pragma once
#include <stddef.h>

// Domain rules shared by capture, storage and actuation. No sensor dependency.
namespace ClimateProtocol {
constexpr size_t length(const char* s) { return *s ? 1 + length(s + 1) : 0; }
constexpr bool equal(const char* a, const char* b) {
    return *a == *b && (*a == 0 || equal(a + 1, b + 1));
}
constexpr bool validTemperature(int value) { return value >= 16 && value <= 30; }
constexpr bool coolPreset(const char* s) {
    return length(s) == 7 && s[0] == 'c' && s[1] == 'o' && s[2] == 'o' &&
        s[3] == 'l' && s[4] == '_' && s[5] >= '0' && s[5] <= '9' &&
        s[6] >= '0' && s[6] <= '9' && validTemperature((s[5] - '0') * 10 + s[6] - '0');
}
constexpr bool validCharacters(const char* s, size_t remaining = 48) {
    return *s == 0 || (remaining && ((*s >= 'a' && *s <= 'z') || (*s >= 'A' && *s <= 'Z') ||
        (*s >= '0' && *s <= '9') || *s == '_') && validCharacters(s + 1, remaining - 1));
}
constexpr bool validPreset(const char* s) {
    return *s != 0 && validCharacters(s);
}
constexpr int temperature(const char* s) {
    return coolPreset(s) ? (s[5] - '0') * 10 + s[6] - '0' : 0;
}
}
