#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

#define PINO_RECEPTOR_IR   18
#define PINO_EMISSOR_IR    19

// Tamanho do buffer RAW para captura de AC
#define RAW_BUFFER_LENGTH  750
#define RECORD_GAP_MICROS 12000
#define MAX_ENVIRONMENTS 12
#define MAX_ENV_NAME_BYTES 64

#endif

