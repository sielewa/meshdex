import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

/**
 * ESLint checks code quality only; formatting belongs to Prettier
 * (eslint-config-prettier switches off every rule that would fight it).
 */
export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.turbo/**',
      'packages/proto/gen/**',
      '.claude-workdir/**',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Type-aware linting: each file is linted with the tsconfig that owns it.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  eslintConfigPrettier,
  {
    rules: {
      'no-console': 'error',
      eqeqeq: 'error',
      curly: ['error', 'all'],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // NestJS modules are decorated empty classes (`@Module({...}) export class AppModule {}`).
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Deliberately NOT enabling `consistent-type-imports`: NestJS DI reads constructor
      // parameter types at runtime (emitDecoratorMetadata), and an `import type` erases them.
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.int-spec.ts'],
    rules: {
      // `expect(repository.create).toHaveBeenCalled()` passes a method reference on purpose.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // JS config files inside apps/packages are CommonJS ("type": "commonjs", ADR 004);
    // the repo root is ESM.
    files: ['apps/**/*.js', 'packages/**/*.js', '**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
