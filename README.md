# Customers API (Node.js)

REST API for querying customers. A Node.js port of [customers-api](https://github.com/mariosergio-portfolio/customers-api) (Spring Boot) that exposes the same endpoints and returns the same JSON, backing the **Customers API** case study page of the [Mario Sérgio portfolio](https://github.com/mariosergio30/portfolio-frontend).

## Technical Highlights
- **Amazon Polly (text to speech)**: Neural TTS with automatic native-voice selection per language
- **SQL partial-text search with PostgreSQL**
- **Node.js 24 platform features**: native ESM, `node --watch`, `--env-file`, and the built-in `node:test` runner

## Architecture

```
                        +----------------------------+
                        |     portfolio-frontend     |
                        |         (React UI)         |
                        +----------------------------+
                                       |
                                       | HTTP / JSON
                                       v
                        +----------------------------+
                        |  Express 5 app (app.js)    |
                        |  pino-http · helmet · cors |
                        |  zod validation · errors   |
                        +----------------------------+
                                       |
                        +----------------------------+
                        |    customer.controller     |
                        +----------------------------+
                                       |
                        +----------------------------+
                        |      customer.service      |
                        +----------------------------+
                          |                        |
                          v                        v
        +------------------------+      +------------------------+
        |  customer.repository   |      |    pronounce.service   |
        |        (pg Pool)       |      |  (@aws-sdk/client-polly)|
        +------------------------+      +------------------------+
                     |                               |
                     v                               v
         +----------------------+          +--------------------+
         |      PostgreSQL      |          |     AWS Polly      |
         |   (customer table)   |          |    (Neural TTS)    |
         +----------------------+          +--------------------+
```

Dependencies are wired in a single composition root ([src/server.js](src/server.js)) and injected into factories (`createApp`, `createCustomerService`, ...). This keeps modules free of import-time side effects, and tests can build the app with fakes.

## Features

- **Customer search**: lists customers by company, with optional case-insensitive partial-text filters on `name` and `country` (combined with AND), sorted by `id` or `name`. LIKE wildcards in user input are escaped.
- **Name pronunciation**: synthesizes "`{name} from {country}`" ("`de`" for Portuguese and Spanish) as MP3 via AWS Polly Neural TTS. The service picks a voice native to the requested language and caches it per language.
- **OpenAPI 3.1 / Swagger UI**, served at the same URLs as the Spring Boot version.
- **Production concerns**: validated config (fail fast), structured JSON logs with request IDs, security headers, rate limiting on the paid Polly endpoint, liveness and readiness probes, graceful shutdown, and a non-root Docker image.

## Tech stack

| Concern | Library |
|---|---|
| Runtime | Node.js 24.19.0 (ESM) |
| HTTP | Express 5 (native async error handling) |
| Validation | zod 4 (request params and environment) |
| Database | pg (node-postgres) connection pool |
| Text to speech | AWS SDK for JavaScript v3: `@aws-sdk/client-polly` |
| Logging | pino and pino-http (pino-pretty in development) |
| Security | helmet, cors, express-rate-limit |
| Docs | swagger-ui-express |
| Tests | `node:test` and supertest |
| Lint | ESLint 10 (flat config) |

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/companies/{companyId}/customers` | Search customers by company, with optional `name`, `country` and `orderBy` (`id`\|`name`, default `id`) query params. |
| `GET` | `/api/customers/{customerPk}/pronounce` | Synthesizes the customer's name via AWS Polly. Optional `language` query param (BCP-47, e.g. `en-US`, `pt-BR`), default `en-US`. Returns `audio/mpeg`. |
| `GET` | `/health` | Liveness probe: the process is up. |
| `GET` | `/ready` | Readiness probe: PostgreSQL is reachable (`503` otherwise). |
| `GET` | `/v3/api-docs` | OpenAPI document (JSON). |
| `GET` | `/swagger-ui.html` | Swagger UI (redirects to `/swagger-ui/index.html`). |

Example response for a search:

```json
{
  "total": 1,
  "customers": [
    {
      "customerPk": "6dadf919-7e22-4485-adc7-476f2d82cee4",
      "id": 1,
      "companyId": 2000,
      "name": "William Garcia",
      "email": "william.garcia@live.com",
      "age": 35,
      "country": "Netherlands",
      "phone": "+31 663 923 321",
      "createdAt": "2026-09-23T02:04:36.293703"
    }
  ]
}
```

Errors always use the same shape: `{ "status": 400, "message": "...", "timestamp": "..." }`.

| Status | When |
|---|---|
| `400` | Invalid `companyId`, `customerPk`, `orderBy` or `language`, or a language Polly doesn't support |
| `404` | Customer not found, or unknown route |
| `429` | Pronounce rate limit exceeded |
| `500` | Unexpected error (details are logged, never returned) |
| `502` | AWS Polly failed |

## Configuration

Configuration comes from environment variables, which are validated at startup ([src/config/index.js](src/config/index.js)). For local development, copy `.env.example` to `.env`. It is loaded with `node --env-file-if-exists=.env`, so no dotenv package is needed.

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `production` \| `test`. |
| `PORT` | `8082` | HTTP port. |
| `LOG_LEVEL` | `info` | pino log level. |
| `DB_HOST` | `localhost` | PostgreSQL host. |
| `DB_PORT` | `5432` | PostgreSQL port. |
| `DB_NAME` | `postgres` | PostgreSQL database name. |
| `DB_USER` | `postgres` | PostgreSQL user. |
| `DB_PASSWORD` | _(empty)_ | PostgreSQL password. |
| `DB_SSL` | `false` | Use TLS for the database connection. |
| `DB_POOL_MAX` | `10` | Maximum pool connections. |
| `AWS_REGION` | `us-east-1` | AWS region for Polly. |
| `AWS_POLLY_VOICE_ID` | `Joanna` | Preferred Polly voice (used when it supports the requested language). |
| `CORS_ORIGIN` | `*` | Allowed origin(s), comma-separated. |
| `TRUST_PROXY` | `false` | Set to `true` behind a load balancer, so the client IP is correct for rate limiting. |
| `PRONOUNCE_RATE_LIMIT_PER_MINUTE` | `30` | Pronounce requests allowed per client IP per minute. |

AWS credentials come from the SDK's default provider chain: `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` env vars, `~/.aws` profiles, an SSO or `aws login` session, or the container or instance IAM role.

## Running locally

Prerequisites: Node.js 24.19.0 (`nvm use` reads `.nvmrc`) and a PostgreSQL instance with the `customer` table.

```bash
npm install
cp .env.example .env
npm run dev
```

The API is available at `http://localhost:8082`, with Swagger UI at `http://localhost:8082/swagger-ui.html`. To run it next to the Java version, set `PORT=8083` in `.env`.

| Script | Description |
|---|---|
| `npm run dev` | Starts with `node --watch` (restarts on file changes). |
| `npm start` | Starts the server. |
| `npm test` | Runs the test suite with the built-in `node:test` runner. |
| `npm run test:coverage` | Runs the tests with coverage. |
| `npm run lint` | Runs ESLint. |

### Docker

```bash
docker build -t customers-api-node .
docker run --rm -p 8082:8082 -e DB_HOST=host.docker.internal -e DB_PASSWORD=123 customers-api-node
```

## Project structure

```
src/
├── server.js                 # Entry point: composition root, startup, graceful shutdown
├── app.js                    # Express app factory (middleware, routes, docs, error handling)
├── config/                   # Validated env config, pino logger
├── db/                       # PostgreSQL pool and type parsing
├── customers/                # Customers component: routes, controller, service, repository, schemas, mapper
├── pronounce/                # AWS Polly text-to-speech service
├── middleware/               # Request validation, 404 and error handlers
├── errors/                   # AppError hierarchy mapped to HTTP statuses
└── docs/                     # OpenAPI 3.1 document
test/                         # node:test + supertest (no DB or AWS needed)
```


## GEN AI CODE MIGRATION: 
That NODE VERSION APPLICATION was genareted based on the existing java implementation https://github.com/mariosergio-portfolio/customers-api


## Differences from the Spring Boot version

The endpoints and JSON payloads are the same. These are the intentional deviations:

- An unknown `customerPk` on `/pronounce` returns **404**, as documented. The Java version returns 500, because its catch-all `Exception` handler also catches `ResponseStatusException`.
- An invalid `orderBy` (anything other than `id` or `name`) returns **400** instead of silently falling back to `id`.
- `language` is validated and its casing normalised (`pt-br` becomes `pt-BR`). A language Polly doesn't support returns **400**, and other Polly failures return **502** instead of 500.
- `%` and `_` in the `name` / `country` filters are matched literally.
- The error `timestamp` is ISO-8601 in UTC (`...Z`).
- Additions: `/health` and `/ready` probes, a rate limit on `/pronounce`, request IDs (`X-Request-Id`), and security headers.
