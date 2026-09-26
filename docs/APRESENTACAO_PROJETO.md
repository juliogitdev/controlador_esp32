# Controle de ar-condicionado com ESP32

## 1. Qual é a ideia?

A proposta é controlar o ar-condicionado de uma sala e identificar períodos em que ele pode ter ficado ligado sem necessidade.

O sistema é dividido em partes independentes:

- **Sensores:** informam presença, temperatura, umidade e outras medições disponíveis.
- **Backend (servidor):** guarda os dados, verifica horários e regras e decide o que fazer.
- **ESP32 controlador:** aprende os sinais do controle remoto e transmite o sinal solicitado pelo servidor.

Em linguagem simples: o servidor decide “ligue o ar a 24 °C”, e o ESP32 executa. O ESP32 não precisa saber se tem gente na sala nem se está no horário de aula.

```text
Sensores reais ou simulados ──► Backend ──► ESP32 ──► Ar-condicionado
                                  ▲           │
                                  └─ resultado┘
```

**Nesta arquitetura, os sensores enviam seus dados separadamente.** Um futuro dispositivo sensor também poderá usar um ESP32, mas terá outra responsabilidade. O firmware atual do controlador do ar não lê sensores ambientais.

## 2. Como funciona a parte do ESP32?

### Configuração inicial

Na primeira utilização, a pessoa conecta o ESP32 à rede Wi-Fi. Depois, configura o endereço do backend e as credenciais do dispositivo. Essas configurações ficam salvas.

### Aprendizado do controle remoto

A pessoa aponta o controle original para o receptor infravermelho e solicita uma captura. O ESP32 grava o sinal com um nome, por exemplo:

- `desligar`;
- `cool_24`: ligado, refrigerando a 24 °C;
- `aquecer_22_auto`: outro estado completo do controle.

O sinal pode incluir temperatura, modo e ventilação. Por isso, cada combinação necessária deve ser aprendida. Capturar “ligar” uma vez não ensina automaticamente todas as temperaturas.

O aprendizado não exige cadastrar a marca, mas a compatibilidade de cada aparelho precisa ser testada.

### Pseudocódigo do controlador

```text
AO LIGAR:
    carregar as configurações e os sinais aprendidos
    conectar ao Wi-Fi

ENQUANTO ESTIVER FUNCIONANDO:
    acompanhar uma captura, se houver

    periodicamente, comunicar-se com o backend:
        enviar identificação, situação do controlador e resultados pendentes
        verificar se existe um comando

    SE o comando for inválido, estiver vencido ou já tiver sido processado:
        não executar novamente
        informar o resultado correspondente

    SE o comando for "aprender sinal":
        aguardar o controle original pelo tempo definido
        salvar o sinal recebido ou informar falha

    SE o comando for "enviar estado aprendido":
        verificar se o sinal existe e está válido
        transmitir o sinal ou informar erro

    informar o resultado ao backend
```

### Regras dessa parte

1. O controlador só transmite estados que já foram aprendidos.
2. Ele não escolhe a temperatura nem aplica regras de presença ou horário.
3. Durante uma captura, não executa outro envio IR.
4. Um comando repetido não deve provocar outra atuação; seu resultado é reenviado.
5. Sem comunicação com o servidor, tenta reconectar e não inventa uma decisão automática.
6. A ausência de um sensor externo não impede o controlador de receber comandos válidos.

## 3. Como será a comunicação com o backend?

**O cliente de comunicação já está implementado no ESP32. O backend ainda será desenvolvido.**

O ESP32 inicia uma comunicação HTTPS com o servidor, normalmente a cada cinco segundos. Nessa troca, envia suas informações e recebe um comando, se houver. Portanto, não é uma resposta instantânea: existe o intervalo de consulta e o tempo da rede.

Exemplo de conversa, simplificado:

```text
Sensor de presença → backend: "Detectei movimento na sala 1."
Sensor de temperatura → backend: "A sala 1 está a 30 °C."

Backend: verifica os dados, o horário e as regras.

ESP32 → backend: "Estou disponível. Existe algum comando?"
Backend → ESP32: "Envie o estado cool_24 para este aparelho."
ESP32 → backend: "O sinal foi transmitido."
```

Cada fonte tem identidade própria. O simulador publica o mesmo tipo de evento que uma fonte real, identificando que o dado é simulado. Trocar uma fonte simulada por uma real não exige modificar o controlador do ar.

## 4. Quais regras ficarão no backend?

As regras abaixo são uma **proposta para a próxima etapa**, não automações já implementadas:

| Configuração | Exemplo de uso |
| --- | --- |
| Dias e horários de funcionamento | Permitir climatização durante as aulas |
| Tempo sem presença detectada | Considerar desligamento após 15 minutos sem detecção válida |
| Limite de temperatura e ajuste desejado | Acima de 28 °C, solicitar o estado aprendido de 24 °C |
| Uso de umidade e outras entradas | Incluir essas condições quando houver dados válidos e uma regra definida |
| Prioridade das regras e exceções | Definir como tratar comandos manuais e atividades fora do horário |
| Intervalo mínimo entre acionamentos | Evitar alternar ligar/desligar repetidamente |

Exemplo de lógica, com valores e prioridades configuráveis:

```text
PARA CADA SALA:
    consultar horário, configurações e últimas leituras válidas

    SE passou do horário permitido:
        propor desligamento
    SENÃO, SE existe indicação válida de ausência pelo tempo configurado:
        propor desligamento
    SENÃO, SE há presença válida E está quente:
        propor ligar na temperatura configurada

    aplicar prioridades, exceções e intervalo mínimo entre acionamentos
    se for necessária uma mudança, enviar o comando ao controlador
    registrar a decisão, o motivo e o resultado
```

**Sensor sem resposta não significa sala vazia.** Uma leitura vencida ou indisponível deve ser tratada como desconhecida. Uma regra que depende desse dado deve aguardar ou seguir uma alternativa explicitamente configurada. As outras regras podem continuar funcionando. Não detectar movimento também não é prova absoluta de que não existe uma pessoa parada na sala.

## 5. Como registrar o tempo ligado sem necessidade?

Esse histórico e os cálculos ficarão no backend. A proposta é registrar:

- comandos solicitados, seus horários e resultados;
- leituras dos sensores, horários e períodos de validade;
- horário de funcionamento e configuração usada na decisão;
- motivo de cada acionamento ou alerta.

```text
AO RECEBER RESULTADOS E LEITURAS:
    atualizar a linha do tempo da sala
    abrir ou encerrar um intervalo estimado de funcionamento
    não reiniciar esse intervalo por receber outro comando "ligar"

AO GERAR O RELATÓRIO:
    calcular o tempo estimado ligado
    calcular a parte desse tempo fora do horário permitido
    calcular a parte com indicação válida de ausência, após a tolerância
    separar períodos sem informação suficiente
    não contar duas vezes um período que pertence às duas categorias
```

Exemplo: se a aula termina às 18h e o desligamento é registrado às 18h20, com indicação de funcionamento durante esse intervalo, o relatório apontará **20 minutos estimados fora do horário**.

**Limite importante:** o ESP32 confirma que transmitiu o sinal IR; ele não confirma que o ar recebeu e realmente ligou ou desligou. Também não acompanha necessariamente comandos feitos por outro controle remoto. Inicialmente, portanto, o relatório será uma estimativa baseada nos comandos e nas informações disponíveis, incluindo o atraso da comunicação.

Para confirmar o funcionamento físico, será necessário um retorno adequado, como medição de consumo/corrente ou estado fornecido pelo aparelho. Medir apenas a tensão de alimentação não comprova que o ar está funcionando. Períodos de comunicação perdida ou estado incerto devem aparecer como desconhecidos, sem inventar precisão.

## 6. O que já existe e o que falta?

| Parte | Situação |
| --- | --- |
| Configuração Wi-Fi, aprendizado e transmissão IR | Implementados no firmware; precisam de validação no aparelho real |
| Cliente HTTPS, resultados e proteção contra repetição de comandos | Implementados no ESP32; integração completa depende do servidor |
| Interface independente para simular sensores | Implementada; permite gerar prévias sem backend |
| Backend, banco de dados e regras automáticas | Ainda serão implementados |
| Relatórios de tempo ligado, ausência e funcionamento fora do horário | Ainda serão implementados no backend |
| Confirmação física do estado do ar | Depende de hardware/integração adicional |

**Objetivo da separação:** permitir trocar, simular ou retirar componentes sem obrigar os demais a conhecer seus detalhes. O backend coordena as decisões; cada componente executa sua própria função.
