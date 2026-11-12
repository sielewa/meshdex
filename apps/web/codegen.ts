import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * Types for every GraphQL operation in the web app, generated from the gateway's committed
 * schema (ADR 011) — no running service needed. Output in `src/graphql/gql/` is not committed.
 */
const config: CodegenConfig = {
  schema: '../gateway/schema.graphql',
  documents: ['src/**/*.{ts,tsx}', '!src/graphql/gql/**'],
  ignoreNoDocuments: true,
  generates: {
    './src/graphql/gql/': {
      preset: 'client',
      presetConfig: { fragmentMasking: false },
      config: {
        // Operations become plain strings: no `graphql` runtime in the browser bundle.
        documentMode: 'string',
        // `'READY' | 'FAILED' | …` unions instead of TS enums (no runtime code).
        enumsAsTypes: true,
        useTypeImports: true,
        // Every custom scalar must be mapped, so a new one can't silently become `any`.
        strictScalars: true,
        scalars: { DateTime: 'string' },
      },
    },
  },
};

export default config;
