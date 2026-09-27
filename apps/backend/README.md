# Backend

API do projeto de controle de climatizacao. Implementada como um monolito modular com Node.js, TypeScript, Fastify, PostgreSQL e Prisma.

## Escopo atual

- cadastro e edicao administrativa de departamentos, ambientes, atuadores e fontes;
- ativacao, desativacao, associacao a ambientes e renovacao de credenciais;
- credenciais individuais para atuadores e fontes;
- recepcao idempotente de eventos de sensores;
- protocolo de troca e confirmacao de comandos do ESP32;
- persistencia de telemetria, leituras, comandos e resultados;
- health checks, validacao, CORS, logs e encerramento controlado;
- migration inicial e configuracao de deploy no Render.
- autenticacao de administradores com Supabase Auth;
- resumo do dashboard e detalhes atuais dos ambientes;
- validacao dos comandos antes de entrarem na fila.

Ainda nao existem login de usuario, regras automaticas, relatorios ou confirmacao fisica do estado do ar. `completed` significa que o firmware informou a conclusao do comando, nao que o aparelho confirmou seu estado.

## Preparacao local

Requisitos: Node.js 22.18 ou superior e um projeto no Supabase.

1. Copie `.env.example` para `.env` e altere todos os segredos.
2. No painel do Supabase, abra `Connect` e copie a URI `Session pooler` (porta 5432).
3. Coloque essa URI em `DATABASE_URL`, substituindo a senha e mantendo `sslmode=require`.
4. Execute `npm install`.
5. Execute `npm run prisma:generate`.
6. Execute `npm run prisma:migrate:deploy`.
7. Inicie com `npm run dev`.

O servidor usa `http://localhost:3000` por padrao.

## Comandos

- `npm run dev`: desenvolvimento com reinicio automatico;
- `npm run build`: compilacao para `dist`;
- `npm start`: executa a compilacao;
- `npm test`: testes automatizados;
- `npm run typecheck`: verificacao estatica;
- `npm run prisma:migrate:dev`: cria migrations durante o desenvolvimento;
- `npm run prisma:migrate:deploy`: aplica migrations existentes.

## Rotas

Publicas:

- `GET /health`: processo em funcionamento;
- `GET /ready`: processo e banco disponíveis.

Administrativas, com `Authorization: Bearer <ADMIN_API_TOKEN>`:

Em uso normal, o Bearer deve ser o access token da sessao do Supabase Auth. O e-mail do usuario precisa estar listado em `ADMIN_EMAILS`. O `ADMIN_API_TOKEN` permanece como credencial de recuperacao e provisionamento; nao deve ser incluido no frontend.

- `GET /api/admin/session`;
- `GET /api/admin/dashboard`;
- `GET/POST /api/admin/departments` e `PATCH /api/admin/departments/{departmentId}`;
- `GET/POST /api/admin/rooms`, `GET/PATCH /api/admin/rooms/{roomId}`;
- `GET/POST /api/admin/devices`, `PATCH /api/admin/devices/{deviceId}` e `POST /api/admin/devices/{deviceId}/token`;
- `GET/POST /api/admin/sources`, `PATCH /api/admin/sources/{sourceId}` e `POST /api/admin/sources/{sourceId}/token`;
- `GET/POST /api/admin/commands`.

O token retornado ao cadastrar um dispositivo ou fonte aparece uma unica vez. O banco armazena somente seu hash.

Protocolos de integracao:

- `POST /api/v1/devices/{deviceId}/exchange`;
- `POST /api/v1/sources/{sourceId}/events`.

Consulte `docs/BACKEND_PROTOCOL.md` e `docs/SOURCE_PROTOCOL.md` na raiz do repositorio.

## Supabase

O Supabase e usado como PostgreSQL gerenciado e como provedor de autenticacao dos administradores. O backend continua acessando os dados pelo Prisma. O futuro frontend usara o SDK do Supabase somente para login e gerenciamento da sessao.

As tabelas da migration possuem RLS habilitado e nenhuma policy publica. Isso impede acesso pelas chaves `anon` e `authenticated` da Data API. Operacoes do sistema devem passar pelo backend.

O backend valida a sessao no Supabase Auth usando `SUPABASE_URL` e a chave publicavel. `service_role` nao e usada. Cadastre o administrador em Authentication e inclua seu e-mail em `ADMIN_EMAILS`.

Nao coloque a senha do banco, `service_role`, chaves privadas ou a URI real no repositorio. A chave publicavel pode existir no frontend, mas deve ser configurada por ambiente. Se a senha contiver caracteres reservados de URL, use a URI copiada do painel e codifique a senha corretamente.

## Render

O `render.yaml` da raiz define o Web Service gratuito. Configure `DATABASE_URL`, `FRONTEND_ORIGIN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `ADMIN_EMAILS`. O Blueprint gera `ADMIN_API_TOKEN` e `TOKEN_PEPPER`. Como o pre-deploy command e exclusivo dos Web Services pagos, no plano gratuito a migration idempotente roda no inicio do processo, antes da API.
