# Architecture Decision Records

One file per decision: `NNN-kebab-case-title.md` with **Context**, **Decision** (and the options considered), **Consequences**. Accepted ADRs are not rewritten; a changed decision gets a new ADR that supersedes the old one.

## Index

| #   | Decision                                                                                                           | Status                |
| --- | ------------------------------------------------------------------------------------------------------------------ | --------------------- |
| 001 | [k3s on EC2 instead of EKS](001-k3s-on-ec2-instead-of-eks.md)                                                      | accepted              |
| 002 | [SeaweedFS as the local S3 implementation](002-seaweedfs-as-local-s3.md)                                           | accepted              |
| 003 | [Identifiers and time across service boundaries](003-identifiers-and-time-across-services.md)                      | accepted              |
| 004 | [CommonJS for NestJS apps and shared packages](004-commonjs-for-nestjs-apps-and-shared-packages.md)                | accepted              |
| 005 | [Database schema conventions](005-database-schema-conventions.md)                                                  | accepted              |
| 006 | [Structured logging with pino](006-structured-logging-with-pino.md)                                                | accepted              |
| 007 | [Validation library per technology](007-validation-library-per-technology.md)                                      | accepted              |
| 008 | [CommonJS apps on ESM-only NestJS 12](008-commonjs-apps-on-esm-only-nestjs-12.md)                                  | accepted (amends 004) |
| 009 | [GraphQL API conventions](009-graphql-api-conventions.md)                                                          | accepted              |
| 010 | [Media URLs for stored files](010-media-urls-for-stored-files.md)                                                  | accepted              |
| 011 | [GraphQL schema file as the contract artifact](011-graphql-schema-file-as-contract.md)                             | accepted (amends 009) |
| 012 | [Web app data fetching and API access](012-web-data-fetching-and-api-access.md)                                    | accepted              |
| 013 | [Ingest source and pipeline](013-ingest-source-and-pipeline.md)                                                    | accepted              |
| 014 | [Benchmark runs as JSON files in the repository](014-benchmark-runs-as-json-in-the-repo.md)                        | accepted              |
| 015 | [Experiments page: runs bundled at build time, SVG charts](015-experiments-page-build-time-runs-and-svg-charts.md) | accepted              |

## Pending decisions

To be decided when first needed, then recorded as an ADR and removed from this list.

- Kafka message payload: protobuf (same buf contracts, `buf breaking` covers events) vs. JSON with a schema.
- Broker in the cloud (Stage 7): Redpanda on k3s (same as local, fits one EC2) vs. Apache Kafka via Strimzi on k3s (JVM, more memory) vs. Amazon MSK (managed, hourly broker cost).
- CI and primary remote: GitHub + GitHub Actions vs. GitLab CI as primary with a mirror to GitHub (repo is hosted on GitHub; `architecture.md` currently says GitLab CI).
- Python tooling for `ml-service` (package manager, linter, type checker).
- Helm layout: one chart per service vs. one shared library chart + per-service values.
- Infrastructure in kind: plain manifests/StatefulSets vs. operators (e.g. CloudNativePG, Redpanda operator) vs. third-party charts (check image licensing first).
