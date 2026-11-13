# Code conventions

Applies to the Node/NestJS services (`gateway`, `asset-service`, `processing-worker`, `ingest`); `ml-service` follows the same layering in Python (see the end).

## Module per feature

Each feature is a separate NestJS module in `apps/<service>/src/<feature>` with its own transport entry, service, repositories and listeners. A new feature gets a new module registered in `app.module.ts`, not an extension of an existing one. Modules don't reach into other modules' repositories: if they need foreign data they have their own repository, import a module that exports a service, or react to in-process events (`@OnEvent`). Across services: only gRPC and Kafka.

**One capability per module.** A module holds one thing the service can do, with the classes that serve it; repositories, mappers and adapters don't count. Two services in a module are fine when they act on the same data (asset-service `assets/`: `AssetUploadService` and `AssetProcessingService` both drive the asset version lifecycle, ADR 005). A third service, or a service whose dependencies don't overlap with the rest of the module, is a second capability: it gets its own module that exports it, and the orchestrating module imports it. Example: ingest `import/` (pipeline, state file) imports `packing/` (glTF → GLB, main thread or workers) and `upload/` (GLB → asset); packing and upload know nothing of each other. **Names follow the module:** service (and controller/resolver) names start with the module's name. A module's main service is `<Module>Service` in `<module>.service.ts` (`upload/` → `UploadService`); other services add their role (`ImportStateService`, `WorkerPackingService`); when no service is the main one, all of them do (`assets/` → `AssetUploadService`, `AssetProcessingService` and their controllers). Classes that aren't services (`BoundedQueue`, `WorkerPool`) are named after what they are.

```
apps/<service>/src/
  main.ts             bootstrap (OpenTelemetry initialised first, then transport, global pipes,
                      shutdown hooks)
  app.module.ts       registers all feature modules
  config/             this service's config namespaces (`database.config.ts`, `kafka.config.ts`…),
                      validated at startup — see "Configuration"
  health/             liveness/readiness (gRPC health protocol / HTTP for web-facing apps)
  database/
    schema/           one file per table (`assets.table.ts`) + `index.ts`; shared by the
                      service's modules (ADR 005)
  <feature>/
    <feature>.module.ts / .service.ts / .constants.ts / .tokens.ts (DI injection tokens)
    <feature>.controller.ts   transport entry — gRPC `@GrpcMethod` (asset-service),
                              `<feature>.resolver.ts` (gateway), `<feature>.consumer.ts` (worker, Kafka)
    <name>.mapper.ts          injectable mapper class (domain <-> transport) when several
                              controllers need it, e.g. `AssetProtoMapper`
    domain/          declarations only, one per file: `<name>.interface.ts`, `<name>.enum.ts`,
                     `<name>.type.ts` (unions/aliases), ports `<name>-port.interface.ts`.
                     No functions, no constants.
    infrastructure/  classes only: Drizzle repositories named after the table they query
                     (`assets.repository.ts`) and adapters implementing ports (S3, gRPC clients)
    exceptions/      `export class AssetNotFoundException extends Error {}`
    listeners/       in-process `@OnEvent('asset.status-changed')` handlers
    jobs/            `@Cron(...)` / interval loops (e.g. outbox relay)
    events/          event classes
    dto/             class-validator DTOs (gateway inputs); gRPC messages use ts-proto generated types
    models/          GraphQL object types (gateway): `@ObjectType('Asset') class AssetModel`;
                     `<name>.registration.ts` registers a domain enum with `registerEnumType`
```

**Clients of other services** (gateway, worker) live in `src/clients/<service>/` — e.g. `gateway/src/clients/asset-service/` with `asset-service-client.module.ts`, the port in `domain/` and the gRPC adapter in `infrastructure/`. A client module only connects and translates the contract; it holds no data and no business rules, and is not named like a feature so it can't be mistaken for a copy of the service. Feature modules are named after what they expose (gateway: `assets/` for asset queries, `uploads/` for upload mutations); their transport entry is a resolver.

**Code lives where it is used.** These rules apply to every app and package:

- **Files with a class contain only that class** (services, controllers, repositories, adapters, modules, mappers): no interfaces, type aliases, constants or helper functions next to it.
- **Logic used by one class is a `private` method of that class** — no helper functions in separate files. Logic needed by several classes becomes an injectable class (e.g. `AssetProtoMapper`); a few lines needed by two repositories may simply be a private method in each.
- Types go to `domain/` (one per file; web: `types/`, see below), constants to `<feature>.constants.ts`, DI tokens to `<feature>.tokens.ts`.
- A contract subset is written inline: `implements Pick<AssetServiceController, 'getAsset' | …>`.
- Each controller maps its own errors in a `private toRpcException(error)`, listing exactly the exceptions its service can throw.
- Exceptions: `main.ts` (entry point), `*.worker.ts` (worker thread entry points, e.g. `ingest/src/packing/workers/pack.worker.ts`), `config/config.namespaces.ts` (`registerAs` definitions), `*.registration.ts` (schema registration side effects such as `registerEnumType`), test helpers in `test/support/`, and `packages/*` libraries whose exported functions are their public API.

## Layers and errors

- **Thin transport layer:** controller/resolver/consumer maps input → calls the service → maps output and errors. No business logic there.
- **Services never throw transport errors** (no `RpcException`, `GraphQLError`, HTTP exceptions). They throw domain exceptions (`extends Error`, message = text safe for the client). The transport layer maps them with `instanceof` checks, usually through a shared `private toRpcException(error)`: asset-service → gRPC status (`NOT_FOUND`, `INVALID_ARGUMENT`, `FAILED_PRECONDITION`, …). The gateway maps in two steps: its gRPC adapter turns status codes into domain exceptions, and each resolver turns those into GraphQL errors with `extensions.code` in a `private toGraphQLError(error)` ([ADR 009](adr/009-graphql-api-conventions.md)). Unknown errors are rethrown as they are (the gateway masks them as `INTERNAL_SERVER_ERROR` and logs them once in `formatError`).
- **Gateway resolvers** call the client port directly (there is no business logic to put in a service), carry `@UseFilters(GraphqlExceptionFilter)` so NestJS doesn't log expected client errors, and return domain objects typed as the GraphQL model class, so the compiler checks the domain shape against the schema. Per-request state (DataLoaders) lives in the GraphQL context, never in REQUEST-scoped providers.
- **External systems behind ports:** an injection token + interface in `domain/`, adapter in `infrastructure/`, picked by a `useFactory` from config and exported by the module (e.g. `OBJECT_STORAGE_PORT` → S3 adapter; AWS vs. local emulator is only a different endpoint). Unit tests use fakes of the port.
- **Reads anywhere, aggregate writes in one place** (ADR 005): any module may read a table through its own repository, but writes that change an aggregate's state (e.g. asset version status transitions) go through the module responsible for that lifecycle.
- **Repositories** only touch the DB and return domain interfaces; "not found" is `null` (`?? null`), never an exception. Method names: `findById`, `findAllByX`, `existsX`, `create`, `updateX`, `markX`, `deleteByX`. Writes that are part of a transaction take the transaction as the last parameter (`tx`).
- **Background handlers** (listeners, jobs) never crash the process: `try/catch` + structured log with the relevant ids. **Kafka consumers are the exception:** they must not swallow errors — a failure goes through retry/backoff and then the DLQ, otherwise the offset is committed and the event is lost.
- Event classes document their delivery guarantee in JSDoc (at-least-once ⇒ handlers are idempotent).

## Configuration (per service)

- Each service has its own config and receives **only its own** env vars (separate ConfigMap/Secret per Deployment). No repo-wide config, no service reads another service's variables.
- Config is split into namespaces (`database`, `kafka`, `s3`, `grpc`, `otel`…) registered with `@nestjs/config` `registerAs` and injected per module, so a module (and its test) only sees its own slice.
- **Validated at startup, fail fast:** a missing or malformed variable crashes the boot with a clear message, so Kubernetes never routes traffic to a misconfigured pod. No `<string>process.env.X` casts. Validation uses class-validator through `ConfigModule`'s `validate` hook (ADR 007).
- `packages/shared` may hold config helpers and schemas for blocks every service repeats (Kafka, OTel), never values.
- Every service has a `.env.example` listing all its variables.

## Logging

- pino through nestjs-pino, configured once in `packages/shared` (ADR 006); never `console.*`. Every line is JSON with the service name and the current `traceId`/`spanId`, so logs in Loki join traces in Tempo.
- Bind context once with `logger.child({ assetId })` instead of repeating it in messages.
- Log ids and states, never secrets, presigned URLs or tokens; sensitive paths are also masked by pino's `redact`.

## Events: in-process vs. integration

- **In-process (domain) events** stay inside one service: `EventEmitter2` + `@OnEvent`, plain classes in `<feature>/events/`.
- **Integration events** cross service boundaries and go **only** through the outbox → Kafka. They are a versioned, public contract (topic `<domain>.events.v<N>`, event id, type, occurredAt, payload), defined separately from internal event classes.
- Never publish to Kafka directly next to a DB commit (dual write: a crash between the two loses or invents the event). The state change and the outbox row share one transaction; the relay publishes.

## Contracts and shared code

- **`packages/proto` is the only shared contract** between services. It describes interfaces, not implementation, so sharing it doesn't couple deployments as long as changes stay backward compatible.
- Each proto package has one owner: `meshdex.asset.v1` belongs to asset-service, `meshdex.ml.v1` to ml-service.
- Evolution rules: only additive changes within `v1` (new fields/RPCs); never change or reuse a field number or type, `reserved` removed fields; a breaking change means a new `v2` package served alongside `v1` until clients move. `buf breaking` guards this in CI.
- Generated types stop at the transport layer: controllers/clients map proto messages ⇄ domain interfaces, so a contract change doesn't ripple through services and repositories. Generated code is never edited by hand and **never committed**: `.proto` files are the only source of truth, `@meshdex/proto`'s `build` regenerates `gen/` (Turbo builds it before any dependent app, also for `dev`). Only local buf plugins — remote plugins would upload the contracts to the Buf Schema Registry.
- **`packages/shared` holds infrastructure only** (logger, OTel setup, config helpers, error/status mapping helpers), never domain types or business logic: shared domain code would force all services to be redeployed together (a distributed monolith).

## Service runtime (every service)

- Health: liveness + readiness; readiness turns false while dependencies (DB, broker) are unavailable or during shutdown.
- **Graceful shutdown** on SIGTERM (`app.enableShutdownHooks()`): stop accepting/consuming, finish in-flight work, commit Kafka offsets, close DB pools and the producer, then exit.
- Every outgoing gRPC call has a **deadline**. Retries only for idempotent operations, with backoff and jitter. Both are declared per method in the client's gRPC **service config** (`channelOptions['grpc.service_config']`, see `AssetServiceClientOptionsFactory`), which grpc-js enforces on every call, so no call site can forget them. Durations use the object form `{ seconds, nanos }`: grpc-js misreads fractional strings such as `"2.5s"`.
- Mutating RPCs that can be retried are idempotent (idempotency key or a state check in the `WHERE` clause).
- No transactions across services; cross-service consistency comes from the outbox + idempotent consumers.

## Style

- **Formatting is Prettier's job** (`singleQuote`, `trailingComma: all`, `printWidth: 100`, 2-space indent), plus two house rules enforced by ESLint (`@stylistic`), which Prettier can't express:
  - **object literals with 3+ properties: one property per line** (Prettier then keeps them expanded);
  - **NestJS modules (`*.module.ts`): one item per line in every array** — `controllers`, `providers`, `imports`, `exports`. Module files are excluded from Prettier so it doesn't collapse those arrays.

  Before handing over: `eslint --fix`, then `pnpm format` — always from the repo root: Prettier reads `.prettierignore` only from its working directory, so run inside an app it reformats `*.module.ts` too.

- **ESLint checks code quality** (`eslint.config.js`: typescript-eslint `strictTypeChecked` with type-aware rules, `no-console`, `eqeqeq`, `curly`, explicit types on exported APIs). No `eslint-disable` without a comment saying why.
- No `import type` for classes injected by NestJS DI: constructor parameter types must stay runtime imports (`emitDecoratorMetadata`).
- Constructor DI with `private readonly`.
- Guard clauses with early `return`/`throw`; blank line after an `if` block and before the final `return`.
- Explicit return types on all public methods (`Promise<void>`, `Promise<Asset | null>`).
- TypeScript strict: no `any` (use `unknown` + narrowing), `null` spelled out in types.
- Enums: `UPPER_CASE = 'lower_case'` string values.
- Imports: absolute `src/...` between modules, relative within a module; workspace packages by their package name.
- Comments: `/** ... */` above classes, methods and fields explaining **why** (invariants, ordering, idempotency, trade-offs), not what. Magic numbers become named `private readonly` fields or live in `<feature>.constants.ts`.
- Time ([ADR 003](adr/003-identifiers-and-time-across-services.md)): compute on ms timestamps (`number`), convert only at boundaries — `google.protobuf.Timestamp` in proto (shared helper), `timestamptz` (UTC) in the DB. Date columns end with `At` (`createdAt`, `processedAt`).
- Ids ([ADR 003](adr/003-identifiers-and-time-across-services.md)): UUIDv7 generated in the app when the id leaves the service or is needed before INSERT; natural keys where the data has one; `bigint` identity for ids that never leave the service — including surrogate keys referenced only by the service's own tables, where a compact key keeps large join tables small (e.g. `tags.id` in `asset_tags`; the API uses tag names). Random tokens: `crypto.randomInt()` / `crypto.randomBytes()`.

## Database (Drizzle + PostgreSQL)

- Schema and migrations live in the owning service; migrations are generated by drizzle-kit (`apps/<service>/drizzle/`) and reviewed by hand.
- **snake_case in the database, camelCase in code** (ADR 005): Drizzle client and drizzle-kit both use `casing: 'snake_case'`, so `createdAt` in TypeScript is `created_at` in SQL.
- **Foreign keys inside the service's database, never between services** (ADR 005); every foreign-key column has its own index.
- Table names are plural or singular by meaning: plural when there are many rows per context (`assets`, `asset_versions`), singular when one per context.
- Enum-like columns (status, type) are text kept consistent by TS enums in code (no native PG `ENUM`: adding a value then needs a migration).
- Unique violations: catch Postgres code `23505` in the repository and turn it into a domain result/exception.
- Transactions: `db.transaction(async (tx) => ...)` inside one service. The outbox row is always written in the same transaction as the state change it describes.
- Values read from the database are narrowed with checks, not `as` casts (e.g. `parseAssetVersionStatus`): unknown values mean corrupted data and fail loudly.

## Dependencies (pnpm)

- **Every NestJS app installs the same set of `@nestjs/*` packages at the same versions** (including `@nestjs/platform-express`). pnpm creates a separate copy of the same version of `@nestjs/core` for each set of its optional peers; when a shared dependency such as `nestjs-pino` ends up linked to another copy than the app, DI fails with `Nest can't resolve dependencies of the LoggerModule (…, ApplicationConfig, …)` because the two `ApplicationConfig` classes are different objects.
- Shared packages declare frameworks as `peerDependencies` (ranges) so they use the app's copy.

## Tests

- Unit specs next to the file (`assets.service.spec.ts`). Build the class directly with `jest.fn()` fakes cast `as unknown as X` — no Nest `TestingModule` for unit tests.
- NestJS 12 is ESM-only, so every app's `test` script runs Jest with `NODE_OPTIONS=--experimental-vm-modules` (ADR 008).
- Integration tests (Testcontainers: Postgres, Redpanda, S3 emulator) live in the app's `test/` directory. A downstream gRPC service is replaced by a real gRPC server on a random port loaded from the same `.proto` (`gateway/test/support/fake-asset-service-server.ts`), so the client's loader options, deadlines and retries are exercised over the network.
- Test names are English sentences describing behaviour (`it('writes the asset and its outbox event in one transaction')`).

## web (Next.js)

Data fetching, API access and testing follow [ADR 012](adr/012-web-data-fetching-and-api-access.md).

```
apps/web/src/
  app/                 routes only: layout.tsx, page.tsx, loading.tsx, error.tsx — thin; a page
                       prefetches its data and renders feature components
  features/<feature>/  one product area (Bulletproof React layout); only the folders it needs:
    api/               `<feature>.queries.ts` (GraphQL documents + TanStack `queryOptions`/mutation
                       factories shared by server prefetch and client hooks), other network calls
                       (e.g. PUT to a presigned URL) and their error classes; a server-only
                       reader of data bundled at build (`*.generated.json`)
    components/        React components, one per file, with their form schemas
    hooks/             `use-*.ts`
    lib/               logic without React (e.g. `MultipartUploader`, localStorage stores) —
                       unit-tested with fakes of the types in `types/`
    types/             interfaces and type aliases used across the feature
    <feature>.constants.ts
  components/          shared components used by several features, no data fetching
                       (e.g. `model-viewer/`)
  graphql/             executeGraphql, error type, endpoint context; `gql/` is generated
  config/              runtime environment (zod schema + server-only accessor)
  lib/                 shared helpers and framework glue (formatters, QueryClient factories)
  instrumentation.ts   startup hook; Node-only checks in instrumentation-node.ts (an invalid
                       environment exits the process: Next.js only logs errors thrown there)
```

- **Server by default.** Components are server components unless they need state, effects or browser APIs; `'use client'` goes on the smallest leaf that needs it. Modules that must never reach the browser import `'server-only'`.
- **Data:** a page prefetches with `getServerQueryClient()` and wraps client components in `HydrationBoundary`; client components call `useQuery`/`useInfiniteQuery` with the same `queryOptions` factory and the endpoint from `useGatewayEndpoint()`. Query keys never contain the endpoint (server and browser share the cache entry).
- **GraphQL:** operations are written with `graphql()` from `@/graphql/gql` in the feature's `*.queries.ts`; run `pnpm --filter @meshdex/web codegen` after adding one. Results are generated types — no hand-written copies of API shapes.
- **Every route that fetches data has a `loading.tsx`.** It is the prefetch boundary: Next.js prefetches links in the viewport and renders dynamic routes down to the nearest loading boundary, so without one each visible link costs a gateway call. Don't fetch data in `generateMetadata` (it runs on every prefetch) and don't fetch in layouts (they run on prefetch too); checks that need no data, like an id's format, belong in the layout so they can still return a real 404. Every other route gets a `loading.tsx` of its own too: the root layout renders per request, so a route without one shows the nearest boundary above it, which is the root's skeleton of the asset grid.
- **Data from the repository** (e.g. benchmark runs, ADR 015) is bundled at build time by a script in `apps/web/scripts/` (plain Node with type stripping, no imports from `src/`) that every web script runs first, like the GraphQL codegen. It writes `src/features/<feature>/api/*.generated.json` (not committed); the feature's `api/` module parses it with a zod schema once per server process, and a unit test parses the committed source files with the same schema. Directories it reads are listed in the web tasks' `inputs` in `turbo.json`, or Turbo would replay a stale cached build.
- **Configuration** is read at runtime on the server (`getServerEnv()`), never through `NEXT_PUBLIC_*` (build-time inlining would bind the image to one environment).
- **Files and names:** kebab-case file names, named exports (Next.js route files are the exception: they need a default export), one exported component or hook per file, imports through the `@/` alias (also inside a feature — no `./` or `../`, so moving a file never breaks its neighbours). Barrel files (`index.ts` re-exports) are not used: import the file itself.
- **Imports flow one way:** shared (`components/`, `lib/`, `graphql/`, `config/`) → `features/` → `app/`. A feature never imports another feature; the page composes them. A component two features need moves to `components/`. Enforced with `no-restricted-imports` in `apps/web/eslint.config.js`.
- **No calls to third parties:** telemetry stays disabled, no `next/font/google`, no external scripts.
- **Tests:** Vitest specs next to the file (`*.spec.ts(x)`), Testing Library for components (query by role/text, not by class names).

## ml-service (Python)

Same layering: gRPC servicer (transport, maps domain exceptions to gRPC status) → service → repository; config read once from env with pydantic-settings and validated at startup (ADR 007); structured JSON logs with trace ids; type hints everywhere; pytest.

Tooling and data access follow [ADR 018](adr/018-ml-service-tooling-data-access-and-reindex-job.md): every command through `uv run`; ruff for lint and format; mypy `--strict`; psycopg 3 with hand-written SQL in repositories; migrations as numbered `src/ml_service/migrations/NNN_name.sql` files applied by `python -m ml_service migrate`; object storage through boto3 with the endpoint from config.

```
apps/ml-service/
  src/ml_service/
    __main__.py       CLI: `python -m ml_service <command>`; each command loads only the settings
                      it needs
    config.py         one pydantic-settings class per namespace (`DatabaseSettings`, …), env prefix
                      = namespace (`DATABASE_URL`)
    logs.py           JSON lines shaped like the Node services' pino logs; context through
                      `extra={...}`, never formatted into the message
    database/         pool, migration runner
    migrations/       NNN_name.sql; an applied migration is never edited, a change is a new file
    gen/              generated from packages/proto by scripts/generate_proto.py (gitignored);
                      imported as `ml_service.gen.meshdex.ml.v1`, used only by servicers and
                      clients, which map messages to domain types
    <feature>/        same split as the Node services: servicer, service, repository, domain types
  scripts/            dev tooling run through package.json (`generate`)
  tests/
    unit/             no I/O; settings tests chdir to a temp dir so a developer's .env can't leak in
    integration/      Testcontainers (pgvector image from compose), one fresh database per test
```
