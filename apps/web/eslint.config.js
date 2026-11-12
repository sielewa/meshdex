import { readdirSync } from 'node:fs';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import rootConfig from '../../eslint.config.js';

const features = readdirSync(new URL('./src/features', import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const relativeImports = {
  group: ['./*', '../*'],
  message: 'Import through the @/ alias (docs/conventions.md, web).',
};

/**
 * Imports flow one way: shared code -> features -> app. A feature never imports another
 * feature; pages compose them. Built-in `no-restricted-imports` instead of an import plugin,
 * one entry per feature because the rule has no "other than my own folder" pattern.
 */
const importDirection = [
  {
    files: ['src/components/**', 'src/lib/**', 'src/graphql/**', 'src/config/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            relativeImports,
            {
              group: ['@/features/*', '@/app/*'],
              message: 'Shared code must not depend on features or routes.',
            },
          ],
        },
      ],
    },
  },
  ...features.map((feature) => ({
    files: [`src/features/${feature}/**`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            relativeImports,
            {
              regex: `^@/features/(?!${feature}/)`,
              message: 'Features must not import each other; compose them in the page.',
            },
            { group: ['@/app/*'], message: 'Features must not depend on routes.' },
          ],
        },
      ],
    },
  })),
];

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
  ...importDirection,
);
