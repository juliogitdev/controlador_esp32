# Contrato de fontes independentes — versão 1

Este contrato é usado pelo simulador. O endpoint de backend ainda deverá ser implementado. Não existe conexão da fonte com o controlador IR.

## Evento

```http
POST /api/v1/sources/{sourceId}/events
Authorization: Bearer <token desta fonte>
Content-Type: application/json
```

```json
{
  "protocolVersion": 1,
  "eventId": "uuid-unico",
  "sourceId": "sim-presence-01",
  "subjectId": "sala-01",
  "kind": "presence",
  "observedAt": "2026-09-22T12:00:00.000Z",
  "validForMs": 30000,
  "value": true,
  "unit": "boolean",
  "status": "ok",
  "origin": "simulated"
}
```

Resposta 200/201 com `{"accepted":true,"eventId":"uuid-unico"}`. O cliente rejeita confirmação com outro ID. Cada envio gera novo eventId; o servidor deverá deduplicar por ID antes de disparar regras. Não há reenvio histórico persistente no simulador.

| kind | value quando ok | unit |
| --- | --- | --- |
| presence | boolean, true/false | boolean |
| temperature | número, simulador aceita -100 a 200 | C |
| humidity | número de 0 a 100 | % |
| voltage | número de 0 a 1000, apenas simulação | V |

Fonte real usa o mesmo contrato com `origin: hardware`. O token deve identificar a fonte registrada; o servidor valida sourceId, tipos e associação autorizada com subjectId. Não confiar no campo origin enviado pelo cliente como única prova de hardware real.

`subjectId` é a sala/entidade monitorada, não o deviceId do atuador. O backend associa sala, fontes e atuadores; isso não é informação exigida pelo ESP32.

## Independência e falhas

- Cada fonte tem identidade, token e validade próprios. Um sensor físico pode publicar fluxos separados, mantendo IDs estáveis por grandeza.
- `status: unavailable` exige `value: null`. Presença false só é válida quando status=ok e a leitura não expirou. Falta de mensagem não equivale a false nem zero.
- Registrar receivedAt no servidor, validar observedAt e limitar validForMs. Relógio do navegador não é autoritativo. A validade sugerida é 30 s; o simulador pode publicar a cada 10 s.
- Parar, remover ou perder uma fonte expira somente aquela leitura. Outras fontes, comandos manuais e regras que não dependem dela continuam independentes.
- Uma regra que exige temperatura e presença deve ser suspensa/reavaliada se qualquer entrada necessária estiver desconhecida. Não preencher silenciosamente com zero ou valores antigos. Qualquer alternativa sem esse sensor precisa ser uma política explícita no backend.
- Para trocar simulador por hardware, cadastrar/autorizar a nova fonte e selecionar no backend qual fonte atende cada entrada. Não combinar automaticamente fontes contraditórias nem deixar duas controlarem a mesma entrada sem uma política de prioridade.
- O controlador aceita apenas o comando final. Não recebe eventos de sensores, IDs de fontes, horários nem expressão da regra.
- O backend continua sendo uma dependência para automação. A arquitetura não garante operação automática durante falha do próprio backend; o controlador não altera o ar por conta própria.

Exemplo de regra futura: presença válida + temperatura válida acima do limite + horário de aula -> selecionar no catálogo o preset aprendido correspondente a refrigerar a 24 °C -> enfileirar `climate.set` para o atuador. O backend também deverá controlar histerese e intervalo mínimo de acionamento.

## Simulador

Arquivos `tools/sensor-simulator/index.html` e `core.js`. Não dependem de dados servidos pelo ESP32. A abstração `SensorSource.read()` é consumida pelo mesmo serializador; `SimulatedSource` é uma implementação. O código anterior de sensores físicos está separado como referência em `components/sensor-node/reference`, fora da compilação do atuador.

Sem backend é possível gerar prévias. Para enviar, usar HTTPS; HTTP é aceito apenas para localhost no desenvolvimento. O backend deverá permitir CORS para a origem usada pelo simulador (por exemplo `http://localhost:8000`), responder OPTIONS e permitir POST com Authorization/Content-Type. Não é necessário abrir CORS no controlador. Tokens não são salvos em localStorage.

A falha de publicação de um cartão é exibida nele; outros cartões continuam operando. Um envio que já começou pode concluir após clicar Parar; não há promessa de cancelar um evento já recebido pelo servidor.
