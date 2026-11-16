# ADR 006: Structured logging with pino

- **Status:** accepted
- **Date:** 2026-11-11

## Context

Logs from several services end up in Loki and must be joinable with traces in Tempo. They must never contain secrets, tokens or presigned URLs. The processing worker logs a lot, so logging overhead matters.

Options considered:

1. **pino** (in NestJS through `nestjs-pino`): JSON lines by default, low overhead (pretty-printing and shipping happen in transports on worker threads), child loggers with bound context, built-in `redact` paths, OpenTelemetry instrumentation that adds `trace_id`/`span_id` to every line.
2. **NestJS `ConsoleLogger` with `json: true`:** no extra dependency, but no redaction, no child loggers and no automatic trace correlation — all of that would be hand-written.

## Decision

Use **pino** in all Node services, wired into NestJS with **nestjs-pino** and configured once in `packages/shared` (service name, log level from config, `redact` paths, trace correlation). Local development pipes output through `pino-pretty`; every other environment writes raw JSON to stdout. `ml-service` uses an equivalent structured JSON logger in Python.

## Consequences

- Secrets are masked by configuration (`redact`), not only by discipline.
- Context such as `assetId` or `eventId` is bound once with `logger.child(...)` and appears on every following line.
- Logs and traces are correlated without per-call code.
- `console.*` stays banned by ESLint; services log only through the injected logger.
