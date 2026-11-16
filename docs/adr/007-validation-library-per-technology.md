# ADR 007: Validation library per technology

- **Status:** accepted
- **Date:** 2026-11-11

## Context

Data is validated at every boundary: environment variables at startup, GraphQL/HTTP inputs, responses from external APIs (e.g. the asset sources used by `ingest`), and form input in the web app. The project has three technology stacks: NestJS services, a Next.js web app and a Python ml-service.

Options considered: one library everywhere (zod in TypeScript) vs. the library that is the standard of each stack.

## Decision

- **NestJS services: class-validator** (+ class-transformer) for everything — DTOs through `ValidationPipe`, and config through `ConfigModule`'s `validate` hook (`plainToInstance` + `validateSync`, the pattern from the NestJS docs), external API responses the same way.
- **web (Next.js): zod**, the de facto standard there (forms with `react-hook-form`, server actions).
- **ml-service (Python): pydantic** (incl. `pydantic-settings` for config).

## Consequences

- Each stack uses the tool its ecosystem expects, with first-class framework integration.
- Config validation fails fast at boot with all errors listed, in every service.
- Type conversion of env strings in NestJS needs explicit `@Type(() => Number)` / `@Transform` decorators — more verbose than zod's `z.coerce`, but explicit.
- No shared validation schemas between TypeScript stacks; contracts between services are proto (typed by codegen), so nothing needs to be shared.
