# Code conventions

Applies to the Node/NestJS services (`gateway`, `asset-service`, `processing-worker`, `ingest`); `ml-service` follows the same layering in Python (see the end).

## Module per feature
Each feature is a separate NestJS module in `apps/<service>/src/<feature>` with its own transport entry, service, repositories and listeners. A new feature gets a new module registered in `app.module.ts`, not an extension of an existing one. Modules don't reach into other modules' repositories: if they need foreign data they have their own repository, import a module that exports a service, or react to in-process events (`@OnEvent`). Across services: only gRPC and Kafka.

```
apps/<service>/src/
  main.ts             bootstrap (OpenTelemetry initialised first, then transport, global pipes,
                      shutdown hooks)
  app.module.ts       registers all feature modules
  config/             this service's config namespaces (`database.config.ts`, `kafka.config.ts`…),
                      validated at startup — see "Configuration"
  health/             liveness/readiness (gRPC health protocol / HTTP for web-facing apps)
  <feature>/
    <feature>.module.ts / .service.ts / .constants.ts
    <feature>.controller.ts   transport entry — gRPC `@GrpcMethod` (asset-service),
                              `<feature>.resolver.ts` (gateway), `<feature>.consumer.ts` (worker, Kafka)
    domain/          interfaces, enums, ports (`asset.interface.ts`, `asset-status.enum.ts`,
                     `object-storage-port.interface.ts`)
    infrastructure/  Drizzle repositories named after their table (`assets.repository.ts`),
                     adapters implementing ports (S3, gRPC clients)
    exceptions/      `export class AssetNotFoundException extends Error {}`
    listeners/       in-process `@OnEvent('asset.status-changed')` handlers
    jobs/            `@Cron(...)` / interval loops (e.g. outbox relay)
    events/          event classes
    dto/             class-validator DTOs (gateway inputs); gRPC messages use ts-proto generated types
```

## Layers and errors
- **Thin transport layer:** controller/resolver/consumer maps input → calls the service → maps output and errors. No business logic there.
- **Services never throw transport errors** (no `RpcException`, `GraphQLError`, HTTP exceptions). They throw domain exceptions (`extends Error`, message = text safe for the client). The transport layer maps them with `instanceof` checks, usually through a shared `private toRpcException(error)`: asset-service → gRPC status (`NOT_FOUND`, `INVALID_ARGUMENT`, `FAILED_PRECONDITION`, …); gateway → maps gRPC status to a GraphQL error with `extensions.code`. Unknown errors are rethrown as they are.
- **External systems behind ports:** an injection token + interface in `domain/`, adapter in `infrastructure/`, picked by a `useFactory` from config and exported by the module (e.g. `OBJECT_STORAGE_PORT` → S3 adapter; AWS vs. local emulator is only a different endpoint). Unit tests use fakes of the port.
- **Repositories** only touch the DB and return domain interfaces; "not found" is `null` (`?? null`), never an exception. Method names: `findById`, `findAllByX`, `existsX`, `create`, `updateX`, `markX`, `deleteByX`. Writes that are part of a transaction take the transaction as the last parameter (`tx`).
- **Background handlers** (listeners, jobs) never crash the process: `try/catch` + structured log with the relevant ids. **Kafka consumers are the exception:** they must not swallow errors — a failure goes through retry/backoff and then the DLQ, otherwise the offset is committed and the event is lost.
- Event classes document their delivery guarantee in JSDoc (at-least-once ⇒ handlers are idempotent).

## Configuration (per service)
- Each service has its own config and receives **only its own** env vars (separate ConfigMap/Secret per Deployment). No repo-wide config, no service reads another service's variables.
- Config is split into namespaces (`database`, `kafka`, `s3`, `grpc`, `otel`…) registered with `@nestjs/config` `registerAs` and injected per module, so a module (and its test) only sees its own slice.
- **Validated at startup, fail fast:** a missing or malformed variable crashes the boot with a clear message, so Kubernetes never routes traffic to a misconfigured pod. No `<string>process.env.X` casts.
- `packages/shared` may hold config helpers and schemas for blocks every service repeats (Kafka, OTel), never values.
- Every service has a `.env.example` listing all its variables.

## Logging
- Structured JSON logs through the shared logger, never `console.*`. Every line carries the service name and the current `traceId`/`spanId`, so logs in Loki join traces in Tempo.
- Log ids and states, never secrets, presigned URLs or tokens.

## Events: in-process vs. integration
- **In-process (domain) events** stay inside one service: `EventEmitter2` + `@OnEvent`, plain classes in `<feature>/events/`.
- **Integration events** cross service boundaries and go **only** through the outbox → Kafka. They are a versioned, public contract (topic `<domain>.events.v<N>`, event id, type, occurredAt, payload), defined separately from internal event classes.
- Never publish to Kafka directly next to a DB commit (dual write: a crash between the two loses or invents the event). The state change and the outbox row share one transaction; the relay publishes.

## Contracts and shared code
- **`packages/proto` is the only shared contract** between services. It describes interfaces, not implementation, so sharing it doesn't couple deployments as long as changes stay backward compatible.
- Each proto package has one owner: `meshdex.asset.v1` belongs to asset-service, `meshdex.ml.v1` to ml-service.
- Evolution rules: only additive changes within `v1` (new fields/RPCs); never change or reuse a field number or type, `reserved` removed fields; a breaking change means a new `v2` package served alongside `v1` until clients move. `buf breaking` guards this in CI.
- Generated types stop at the transport layer: controllers/clients map proto messages ⇄ domain interfaces, so a contract change doesn't ripple through services and repositories. Generated code is never edited by hand.
- **`packages/shared` holds infrastructure only** (logger, OTel setup, config helpers, error/status mapping helpers), never domain types or business logic: shared domain code would force all services to be redeployed together (a distributed monolith).

## Service runtime (every service)
- Health: liveness + readiness; readiness turns false while dependencies (DB, broker) are unavailable or during shutdown.
- **Graceful shutdown** on SIGTERM (`app.enableShutdownHooks()`): stop accepting/consuming, finish in-flight work, commit Kafka offsets, close DB pools and the producer, then exit.
- Every outgoing gRPC call has a **deadline**. Retries only for idempotent operations, with backoff and jitter.
- Mutating RPCs that can be retried are idempotent (idempotency key or a state check in the `WHERE` clause).
- No transactions across services; cross-service consistency comes from the outbox + idempotent consumers.

## Style
- **Formatting is Prettier's job** (`singleQuote`, `trailingComma: all`, `printWidth: 100`, 2-space indent). Never hand-format against it; `pnpm format` before handing over.
- **ESLint checks code quality only** (`eslint.config.js`: typescript-eslint `strictTypeChecked` with type-aware rules, `no-console`, `eqeqeq`, `curly`, explicit types on exported APIs). No `eslint-disable` without a comment saying why.
- No `import type` for classes injected by NestJS DI: constructor parameter types must stay runtime imports (`emitDecoratorMetadata`).
- Constructor DI with `private readonly`.
- Guard clauses with early `return`/`throw`; blank line after an `if` block and before the final `return`.
- Explicit return types on all public methods (`Promise<void>`, `Promise<Asset | null>`).
- TypeScript strict: no `any` (use `unknown` + narrowing), `null` spelled out in types.
- Enums: `UPPER_CASE = 'lower_case'` string values.
- Imports: absolute `src/...` between modules, relative within a module; workspace packages by their package name.
- Comments: `/** ... */` above classes, methods and fields explaining **why** (invariants, ordering, idempotency, trade-offs), not what. Magic numbers become named `private readonly` fields or live in `<feature>.constants.ts`.
- Time: compute on ms timestamps (`number`), convert only at boundaries (DB, proto). DB stores UTC (`timestamptz`); date columns end with `At` (`createdAt`, `processedAt`).
- Random ids/tokens: `crypto.randomUUID()` / `crypto.randomInt()`.

## Database (Drizzle + PostgreSQL)
- Schema and migrations live in the owning service; migrations are generated by drizzle-kit and reviewed by hand.
- Table names snake_case, singular or plural by meaning: plural when there are many rows per context (`assets`, `asset_versions`), singular when one per context.
- Enum-like columns (status, type) are text kept consistent by TS enums in code (no native PG `ENUM`: adding a value then needs a migration).
- Unique violations: catch Postgres code `23505` in the repository and turn it into a domain result/exception.
- Transactions: `db.transaction(async (tx) => ...)` inside one service. The outbox row is always written in the same transaction as the state change it describes.

## Tests
- Unit specs next to the file (`assets.service.spec.ts`). Build the class directly with `jest.fn()` fakes cast `as unknown as X` — no Nest `TestingModule` for unit tests.
- Integration tests (Testcontainers: Postgres, Redpanda, S3 emulator) live in the app's `test/` directory.
- Test names are English sentences describing behaviour (`it('writes the asset and its outbox event in one transaction')`).

## ml-service (Python)
Same layering: gRPC servicer (transport, maps domain exceptions to gRPC status) → service → repository; config read once from env in one module and validated at startup; structured logs with trace ids; type hints everywhere; pytest.
