import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

/**
 * ESLint checks code quality; formatting belongs to Prettier (eslint-config-prettier
 * switches off every rule that would fight it), with two house rules on top that
 * Prettier can't express — see the `@stylistic` blocks below.
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
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      // NestJS modules are decorated empty classes (`@Module({...}) export class AppModule {}`).
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Deliberately NOT enabling `consistent-type-imports`: NestJS DI reads constructor
      // parameter types at runtime (emitDecoratorMetadata), and an `import type` erases them.
    },
  },
  {
    // House rule: object literals with 3+ properties are written one property per line.
    // This rule breaks the braces; Prettier then puts every property on its own line and
    // keeps the object expanded (it never collapses an object whose first property is on
    // a new line). Type literals are left to Prettier.
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/object-curly-newline': [
        'error',
        {
          ObjectExpression: {
            minProperties: 3,
            multiline: true,
            consistent: true,
          },
        },
      ],
    },
  },
  {
    // House rule: NestJS modules list one item per line in every array (controllers,
    // providers, imports, exports). Prettier would collapse these arrays, so module files
    // are excluded from Prettier (.prettierignore) and formatted by these rules instead.
    files: ['**/*.module.ts'],
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/array-bracket-newline': ['error', { minItems: 1 }],
      '@stylistic/array-element-newline': ['error', 'always'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/quotes': ['error', 'single'],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1 }],
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/max-len': [
        'error',
        {
          code: 100,
          ignoreComments: true,
        },
      ],
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
      globals: {
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
