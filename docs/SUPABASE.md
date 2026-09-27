# Supabase como banco do projeto

## Decisao

O Supabase fornecera o PostgreSQL. A API continuara hospedada no Render e acessara o banco com Prisma. O frontend e o ESP32 nao receberao credenciais PostgreSQL.

```text
Frontend ----HTTPS----> Backend no Render ----TLS----> Supabase PostgreSQL
ESP32 -------HTTPS----------^
Fontes ------HTTPS----------^
```

## Conexao escolhida

Para o Web Service persistente no Render, usar a URI `Session pooler` exibida em `Connect` no painel do Supabase. Ela usa a porta 5432 e funciona em redes IPv4.

Formato apenas ilustrativo:

```text
postgresql://postgres.PROJECT_REF:SENHA@POOLER_HOST:5432/postgres?sslmode=require
```

Copiar host e usuario do painel; nao tentar deduzi-los. A URI real fica somente na variavel `DATABASE_URL` do computador e do Render.

O modo Transaction pooler, porta 6543, e mais apropriado para funcoes serverless. Se ele for adotado no futuro, sera necessario revisar as limitacoes de sessao e a configuracao de prepared statements.

## Criacao das tabelas

O Prisma e a fonte de verdade do modelo da aplicacao:

```text
apps/backend/prisma/schema.prisma
apps/backend/prisma/migrations/
```

Aplicar migrations com:

```text
npm run prisma:migrate:deploy
```

Nao criar manualmente pelo Table Editor uma tabela que tambem sera controlada pelo Prisma. Mudancas estruturais devem gerar novas migrations versionadas.

## Seguranca

- TLS e exigido pela URI de conexao.
- A senha PostgreSQL nunca vai para o frontend, firmware ou Git.
- As tabelas do sistema possuem RLS habilitado sem policies publicas.
- O acesso de usuarios, dispositivos e fontes passa pela API do backend.
- A chave publicavel e usada apenas para validar sessoes no Supabase Auth.
- A chave `service_role` nao e usada no backend atual.
- Se a Data API nao for utilizada por nenhuma outra parte, ela pode ser desabilitada no painel do Supabase.

## Desenvolvimento e producao

Pode-se usar o mesmo projeto Supabase durante o prototipo, evitando dados sensiveis e fazendo backups antes de migrations importantes. Uma evolucao posterior pode separar projetos de desenvolvimento e producao.

Antes do primeiro deploy:

1. criar o projeto Supabase;
2. definir uma senha forte para o banco;
3. copiar a URI Session pooler;
4. configurar `DATABASE_URL` localmente;
5. aplicar a migration inicial;
6. testar `GET /ready`;
7. cadastrar os primeiros dados somente pela API administrativa.

O backend rejeita a inicializacao quando `DATABASE_URL` ainda contem marcadores como `POOLER_HOST`, `PROJECT_REF` ou `SENHA`. Esses valores do arquivo de exemplo precisam ser substituidos pela URI copiada do painel.

## Autenticacao administrativa

1. Habilitar login por e-mail e senha em Authentication.
2. Criar o usuario administrador pelo painel do Supabase.
3. Copiar a Project URL para `SUPABASE_URL`.
4. Copiar a chave publicavel para `SUPABASE_PUBLISHABLE_KEY`.
5. Informar o e-mail autorizado em `ADMIN_EMAILS`.

O frontend enviara o access token da sessao em `Authorization: Bearer`. O backend consulta o endpoint Auth do Supabase para validar o token e verifica o e-mail autorizado. `ADMIN_API_TOKEN` e somente uma alternativa de recuperacao e nunca deve ser embutido no frontend.
