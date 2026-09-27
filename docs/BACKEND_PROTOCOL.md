# Contrato do controlador IR — protocolo 1, firmware 3.0.0

Este dispositivo tem papel `climate_actuator`. Ele não contém sensores ambientais, simulador, calendário ou regras. Eventos de sensores usam [outro contrato](SOURCE_PROTOCOL.md). O backend ainda não está implementado.

## Transporte

```http
POST /api/v1/devices/{deviceId}/exchange
Authorization: Bearer <token individual do atuador>
Content-Type: application/json
```

O ESP32 inicia a conexão HTTPS após sincronizar UTC por NTP. Configurar URL base, token e CA raiz PEM na página local usando X-Setup-Key. TLS é validado; não há setInsecure nem redirecionamentos. URL vazia desativa nuvem. Token/CA vazios no formulário mantêm os valores salvos. A interface local é HTTP e deve ser provisionada em rede confiável.

O servidor deve validar token/deviceId e responder **HTTP 200, JSON UTF-8, Content-Length de 1 a 2048 bytes, sem chunked/compressão**. Não responder 204. Intervalo padrão 5 s, configurável de 2 a 60 s, somado à duração da troca. Falhas HTTP geram backoff até 60 s. Handshake tem timeout de 8 s; conexão/leitura 5 s. HTTP roda em tarefa separada; os efeitos em GPIO/arquivos são executados no loop principal.

## Mensagem do atuador

```json
{
  "protocolVersion": 1,
  "role": "climate_actuator",
  "deviceId": "esp32-aabb11223344",
  "bootId": "a1b2c3d4e5f6",
  "firmwareVersion": "3.0.0",
  "timestamp": 1800000000,
  "uptimeMs": 12000,
  "wifiRssi": -55,
  "storageReady": true,
  "intervalMs": 5000,
  "lastSequence": 7,
  "capabilities": {
    "climateSet": "learned_presets",
    "mode": "cool",
    "fan": "as_recorded",
    "defaultCarrierKhz": 38,
    "minCarrierKhz": 20,
    "maxCarrierKhz": 60,
    "irCapture": true
  },
  "environments": [{
    "id":"env_123", "name":"Ar da sala", "state":"on",
    "lastPreset":"cool_24", "temperature":24, "mode":"cool",
    "buttons":["power_off","cool_24","aquecer_22_auto"], "configured":true
  }],
  "ack": null
}
```

Não existe campo sensors. deviceId é estável, bootId muda a cada boot. timestamp/expiração usam segundos Unix UTC, demais campos Ms são milissegundos. O nome histórico environments significa perfis IR/aparelhos locais, não cadastro de sensores/salas. O backend faz as associações.

`capabilities.mode: cool` descreve somente o atalho de temperatura. Estados com nomes livres podem representar qualquer função aprendida, sem interpretação da marca pelo firmware. `buttons` lista esses nomes; `configured` significa existir ao menos um estado cadastrado. A integridade do RAW é validada antes de enviar.

state/temperature/mode representam o último sinal enviado, nunca confirmação física. Apenas nomes canônicos (`power_on`, `power_off`, `cool_16` ... `cool_30`) permitem essa interpretação. Para nomes personalizados, state fica unknown e temperature/mode null; lastPreset mantém o identificador transmitido. O backend pode conhecer sua semântica pelo catálogo que cadastrou.

## Resposta e comando

Sem comandos:

```json
{"protocolVersion":1,"deviceId":"esp32-aabb11223344","bootId":"a1b2c3d4e5f6","ackId":null,"command":null}
```

Comando recomendado, independente de marca, sensores, horário e modo:

```json
{
  "protocolVersion": 1,
  "deviceId": "esp32-aabb11223344",
  "bootId": "a1b2c3d4e5f6",
  "ackId": null,
  "command": {
    "id": "cmd-0008",
    "seq": 8,
    "bootId": "a1b2c3d4e5f6",
    "expiresAt": 1800000060,
    "type": "climate.set",
    "envId": "env_123",
    "presetId": "cool_24"
  }
}
```

O backend escolhe cool_24 porque sua regra decidiu refrigerar a 24 °C. O controlador só carrega e transmite esse sinal aprendido. Não pede confirmação de presença/temperatura de sala e não conhece a regra.

Atalho alternativo do mesmo comando, sem presetId: `"power":true,"mode":"cool","temperature":24`, que exige inteiro de 16 a 30 e resolve exatamente cool_24. Para desligar: `"power":false` sem mode/temperature, resolvendo power_off. Não misturar presetId com power/mode/temperature/fan. Não há parâmetro fan independente: a ventilação é a do sinal completo aprendido. Temperaturas/modos fora do atalho usam um nome livre, por exemplo cool_32 ou aquecer_22_auto, já capturado.

Estado inexistente/corrompido retorna `preset_not_learned_or_invalid`, sem transmitir alternativa. O firmware não edita bits para inventar códigos de outra temperatura.

| type | Campos adicionais |
| --- | --- |
| environment.create | name: 1–64 bytes UTF-8; ack retorna envId |
| environment.delete | envId; remove o perfil e todos os estados IR salvos |
| ir.capture | envId, button (nome do estado), timeoutMs opcional 1000–60000, frequencyKhz opcional inteiro 20–60 (padrão 38) |
| ir.send | envId, button (nome do estado completo) |
| ir.delete | envId, button; remove somente o estado IR informado |
| climate.set | envId e presetId, ou atalho power/mode/temperature descrito acima |
| device.configure | intervalMs opcional 2000–60000; não altera credenciais |

Nomes de estados: 1–48 caracteres `[A-Za-z0-9_]`. Até 12 perfis e 32 novos arquivos de estado por perfil (mais possíveis sinais antigos inline), sujeitos à capacidade do LittleFS. O firmware não contém mais sensor.simulate nem opções de presença. Comandos de outra responsabilidade retornam unsupported_command.

## Identidade, validade e resultado

Cada comando exige id único de até 64 bytes, seq inteiro positivo até 4294967295, bootId atual e expiresAt futuro. Manter uma fila ordenada com **um comando pendente por dispositivo**. seq deve superar lastSequence, inclusive após reboot ou migração de backend.

Exemplo de ack na próxima troca:

```json
{"ack":{"id":"cmd-0008","seq":8,"status":"completed","sent":true,"preset":"cool_24","persisted":true}}
```

Salvar o resultado no servidor antes de devolver `ackId: "cmd-0008"`. Pode enviar o próximo comando na mesma resposta. Enquanto o resultado anterior não for confirmado, outros comandos não são executados. O mesmo resultado pode voltar após reinício mesmo se o backend já o confirmou; tratar confirmação de forma idempotente.

A sequência é persistida em NVS antes do efeito físico. Repetir o último comando reenvia o resultado, sem executar novamente. Sequências antigas são ignoradas. Expiração/boot errado geram rejected e consomem a sequência. Corpo/envelope inválido não executa ação. Falha de diário gera journal_error e bloqueia novas ações.

Resultados terminais: completed, failed, rejected, unknown_after_restart. Se reiniciar entre registro e conclusão, não repetir automaticamente ação de resultado incerto. O backend decide se envia novo comando com nova identidade; não existe garantia de atuação física exatamente uma vez. sent=true só confirma emissão. persisted=false informa falha no histórico apesar da emissão.

Captura suspende as trocas com o backend até receber sinal ou timeout (máximo 60 s); depois envia ack final com samples. Não existe WebSocket de captura. Os estados internos executing/capturing recuperam como unknown_after_restart após reboot.

## API local e persistência

GET /api/device: identidade, role, estado de conexão e storageReady; não contém sensores/token/CA/chave.

POST /api/device/config com X-Setup-Key:

```json
{"url":"https://seu-backend.example","token":"token-do-atuador","ca":"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n","intervalMs":5000}
```

Troca HTTP/captura em andamento pode retornar 409; aguardar e tentar novamente. Mesmo com ack pendente é possível reparar configuração. Novo backend deve importar/adotar lastSequence e consumir o ack anterior. NVS mantém credenciais/diário; uploadfs não apaga NVS.

Rotas locais anteriores: GET/POST /api/environments, POST /api/environments/{id}/capture, POST /api/environments/{id}/command, GET /api/capture. Mutações exigem X-Setup-Key e URL de backend vazia. Captura aceita frequencyKhz; envio usa o valor salvo. /api/sensor e /api/simulation foram removidos. Arquivos do banco não são servidos por HTTP.

Os sinais novos ficam em /db/{envId}/{presetId}.ir, com envId, preset, freq e raw; metadados em /db/{envId}.json. Arquivos antigos com power_on/power_off inline continuam legíveis. Gravação usa temporário e rename; substituir um estado não cresce um único JSON com todos os RAW. Uploadfs apaga os perfis/sinais; firmware upload preserva arquivos.

## Limitações e testes físicos

RAW independe de identificar a marca, mas não equivale a suporte universal. Até 749 durações, separação de quadros de 12 ms, receptor compatível e portadora configurada corretamente. Não há detecção automática de portadora nem interpretação universal de estado. Controle toggle, múltiplos quadros, repetição e sinais longos exigem teste específico. [Referência Arduino-IRremote](https://github.com/Arduino-IRremote/Arduino-IRremote).

Testar com hardware: aprender dois aparelhos/marcas, regravar um estado preservando os demais, comandar nome ausente, reiniciar e testar persistência, verificar TLS/token inválidos, reenvio/expiração/boot antigo, perda de Wi-Fi/backend e queda durante execução. Remover/desligar fontes externas não deve alterar a capacidade de receber comandos do atuador; as regras que dependem delas serão responsabilidade do servidor.
