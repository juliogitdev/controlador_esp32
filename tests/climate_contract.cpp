#include "../src/ClimateProtocol.h"
using namespace ClimateProtocol;
static_assert(validPreset("power_on"), "legacy on");
static_assert(validPreset("power_off"), "legacy off");
static_assert(validPreset("marca_X_aquecer_22_auto"), "brand-neutral full state");
static_assert(validPreset("cool_32"), "custom names are not limited by convenience temperature range");
static_assert(!validPreset(""), "empty name");
static_assert(!validPreset("../db"), "path traversal");
static_assert(!validPreset("state/other"), "path separator");
static_assert(!validPreset("state with spaces"), "unsafe name");
static_assert(validPreset("123456789012345678901234567890123456789012345678"), "48 chars");
static_assert(!validPreset("1234567890123456789012345678901234567890123456789"), "49 chars");
static_assert(temperature("cool_24") == 24, "canonical setpoint");
static_assert(temperature("power_on") == 0, "legacy has no assumed temperature");
static_assert(temperature("aquecer_22") == 0, "opaque name has no inferred setpoint");
static_assert(!coolPreset("cool_24suffix"), "strict convenience mapping");
static_assert(!validTemperature(15) && validTemperature(16) && validTemperature(30) && !validTemperature(31), "convenience bounds");
