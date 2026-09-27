# Frontend

Painel administrativo do sistema de climatizacao, construido com React, TypeScript e Vite.

## Funcionalidades atuais

- login por e-mail e senha com Supabase Auth;
- protecao das rotas administrativas;
- resumo de ambientes, controladores e comandos;
- cadastro e edicao de departamentos, ambientes, controladores e fontes;
- ativacao, desativacao e renovacao de tokens de equipamentos;
- ambientes agrupados por departamento;
- detalhes de sensores e validade das leituras;
- situacao de comunicacao do controlador;
- selecao dos perfis IR informados pelo ESP32;
- solicitacao de estado aprendido e desligamento;
- historico recente dos comandos.
- cadastro de departamentos e ambientes;
- provisionamento de controladores ESP32 e fontes de sensores;
- exibicao unica e copia segura dos tokens gerados.

O painel nao acessa as tabelas do Supabase diretamente. Ele usa o Supabase apenas para autenticar o usuario e envia o access token para o backend.

## Configuracao

Copie `.env.example` para `.env` e informe `VITE_API_URL`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.

A chave publicavel pode ser usada no navegador. Nunca use a chave `service_role` no frontend. No backend, o mesmo e-mail usado no login precisa constar em `ADMIN_EMAILS`.

## Comandos

- `npm run dev`: servidor local em `http://localhost:5173`;
- `npm run build`: verificacao TypeScript e build de producao;
- `npm test`: testes automatizados;
- `npm run preview`: visualizacao do build local.

O desenvolvimento exige dois terminais:

```text
Terminal 1: cd apps/backend  && npm run dev
Terminal 2: cd apps/frontend && npm run dev
```

Se o painel informar que nao conseguiu conectar a `http://localhost:3000`, o backend nao esta em execucao ou `VITE_API_URL` aponta para o endereco errado. Se informar que o banco esta indisponivel, revise `DATABASE_URL` no `.env` do backend.

## Render

O `render.yaml` da raiz configura o projeto como Static Site. Informe as tres variaveis `VITE_*` durante a criacao do servico. Como elas sao incorporadas ao build, alterar uma variavel exige novo deploy.

O arquivo `public/_redirects` direciona rotas internas ao `index.html`, permitindo que o React Router trate a navegacao.

## Limite atual

O status `Transmitido` significa que o firmware informou a conclusao do comando IR. Ele nao confirma fisicamente que o ar-condicionado executou a acao. Essa confirmacao dependera do sensor de corrente.
