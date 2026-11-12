import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import rootConfig from '../../eslint.config.js';

/**
 * The repo-wide rules plus React and Next.js rules. Lives in the app because the plugins
 * are the app's dependencies (pnpm doesn't let the root config import them).
 */
export default defineConfig(
  rootConfig,
  {
    ignores: ['src/graphql/gql/**', 'next-env.d.ts', '*.config.js', '*.config.mjs'],
  },
  reactHooks.configs.flat.recommended,
  nextPlugin.configs.recommended,
  nextPlugin.configs['core-web-vitals'],
  {
    // `queryOptions` factories rely on TanStack's inferred return type: it carries the data,
    // key and page-param types that useQuery and the server prefetch need, and writing it
    // out would duplicate the library's generics.
    files: ['src/**/*.queries.ts'],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },
);
