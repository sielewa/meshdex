# Architecture Decision Records

One file per decision: `NNN-kebab-case-title.md` with **Context**, **Decision** (and the options considered), **Consequences**. Accepted ADRs are not rewritten; a changed decision gets a new ADR that supersedes the old one.

## Index

| #   | Decision                                                                                      | Status   |
| --- | --------------------------------------------------------------------------------------------- | -------- |
| 001 | [k3s on EC2 instead of EKS](001-k3s-on-ec2-instead-of-eks.md)                                 | accepted |
| 002 | [SeaweedFS as the local S3 implementation](002-seaweedfs-as-local-s3.md)                      | accepted |
| 003 | [Identifiers and time across service boundaries](003-identifiers-and-time-across-services.md) | accepted |

## Pending decisions

To be decided when first needed, then recorded as an ADR and removed from this list.

- Module system for NestJS apps and shared packages: CommonJS (Nest CLI and Jest default, least friction) vs. ESM (`nodenext`, matches the root `"type": "module"`).
- Drizzle column casing: camelCase columns (quoted in raw SQL) vs. snake_case columns with Drizzle's `casing: 'snake_case'` mapping.
- Foreign keys inside one service's DB: yes vs. no (integrity in code only).
- Where Drizzle table definitions live: next to the repository (`infrastructure/<table>.table.ts`) vs. one `src/database/schema.ts` per service.
- Logger in `packages/shared`: pino (via nestjs-pino) vs. Nest `Logger` with a JSON formatter.
- Config validation: zod vs. class-validator.
- Kafka message payload: protobuf (same buf contracts, `buf breaking` covers events) vs. JSON with a schema.
- Generated proto TS code: committed vs. generated in CI/on install.
- Broker in the cloud (Stage 7): Redpanda on k3s (same as local, fits one EC2) vs. Apache Kafka via Strimzi on k3s (JVM, more memory) vs. Amazon MSK (managed, hourly broker cost).
- CI and primary remote: GitHub + GitHub Actions vs. GitLab CI as primary with a mirror to GitHub (repo is hosted on GitHub; `architecture.md` currently says GitLab CI).
- Python tooling for `ml-service` (package manager, linter, type checker).
- Helm layout: one chart per service vs. one shared library chart + per-service values.
- Infrastructure in kind: plain manifests/StatefulSets vs. operators (e.g. CloudNativePG, Redpanda operator) vs. third-party charts (check image licensing first).
