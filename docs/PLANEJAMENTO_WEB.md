# Planejamento da aplicacao web

Este documento registra as decisoes que precisam ser tomadas antes da implementacao do backend e do frontend.

## Objetivo do primeiro fluxo completo

O primeiro fluxo deve permitir que um administrador solicite um comando pelo painel, que o backend o entregue ao ESP32 e que o resultado da transmissao volte ao painel.

Esse resultado confirma a transmissao do infravermelho, nao o estado fisico do ar-condicionado. A confirmacao fisica dependera da integracao posterior do sensor de corrente.

## Partes do sistema

1. Frontend administrativo.
2. Backend e API HTTP.
3. Banco de dados.
4. Controlador ESP32 existente.
5. Fontes de sensores e simulador.

## Decisoes pendentes

### Escopo inicial

- paginas que pertencem ao primeiro MVP;
- cadastros que serao manuais ou feitos pela interface;
- momento em que login e permissoes serao introduzidos;
- informacoes necessarias para associar ambiente, controlador e fontes;
- estados exibidos quando dados estiverem ausentes ou vencidos.

### Backend

- runtime, framework e versoes;
- biblioteca de validacao;
- modelo de organizacao dos modulos;
- estrategia de autenticacao;
- tratamento da fila e da sequencia de comandos;
- politica de logs e erros;
- testes de unidade e integracao.

### Banco de dados

- Supabase PostgreSQL para o prototipo e a producao;
- ferramenta de migrations e acesso ao banco;
- modelo inicial de entidades;
- retencao das leituras e comandos;
- uso correto de data e hora;
- dados que representam fatos, estimativas e confirmacoes.

### Frontend

- biblioteca principal e ferramenta de build;
- roteamento;
- estrategia de consumo da API;
- estados de carregamento, erro, vazio e indisponibilidade;
- identidade visual institucional;
- responsividade e acessibilidade;
- estrategia de testes.

### Deploy

- backend como servico web no Render;
- Supabase como provedor PostgreSQL;
- hospedagem do frontend;
- variaveis de ambiente e segredos;
- CORS e dominios autorizados;
- migrations durante o deploy;
- comportamento dos planos escolhidos durante inatividade.

## Restricoes importantes

- Nao apresentar o ultimo comando como confirmacao do estado real.
- Nao transformar leitura ausente em zero ou `false`.
- Nao implementar automacoes antes de existir comunicacao confiavel.
- Nao adicionar infraestrutura sem necessidade demonstravel para o MVP.
- Nao registrar tokens ou senhas em texto puro no repositorio.
- Manter os contratos do firmware documentados e testaveis.

## Proxima decisao

Definir detalhadamente o primeiro fluxo funcional e, a partir dele, escolher as tecnologias e criar os projetos executaveis.
