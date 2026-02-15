import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import eslint from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import oxlint from 'eslint-plugin-oxlint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

const __require = createRequire(import.meta.url);

const rxjs = __require('@smarttools/eslint-plugin-rxjs');

const ignoreList = readFileSync(
  new URL('.prettierignore', import.meta.url),
  'utf-8'
)
  .split('\n')
  .filter(line => line.trim() && !line.startsWith('#'));

// Omit `.d.ts` because 1) TypeScript compilation already confirms that
// types are resolved, and 2) it would mask an unresolved
// `.ts`/`.tsx`/`.js`/`.jsx` implementation.
const typeScriptExtensions = ['.ts', '.tsx', '.cts', '.mts'];

export default tseslint.config(
  {
    ignores: ignoreList,
  },
  {
    settings: {
      react: {
        version: 'detect',
      },
      'import-x/parsers': {
        '@typescript-eslint/parser': typeScriptExtensions,
      },
      'import-x/resolver': {
        typescript: true,
      },
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react,
      'react-hooks': reactHooks,
      sonarjs,
      'import-x': importX,
      'simple-import-sort': simpleImportSort,
      rxjs,
      unicorn,
      oxlint,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...oxlint.configs.recommended.rules,
      // covered by TypeScript
      'no-dupe-args': 'off',
      // the following rules are disabled because they are covered by oxlint
      'array-callback-return': 'off',
      eqeqeq: 'off',
      'getter-return': 'off',
      'no-self-compare': 'off',
      'no-empty': 'off',
      'no-constructor-return': 'off',
      'no-fallthrough': 'off',
      'no-unreachable': 'off',
      'no-redeclare': 'off',
      'no-case-declarations': 'off',
      'no-var': 'off',
      'no-inner-declarations': 'off',
      'no-prototype-builtins': 'off',
      'no-regex-spaces': 'off',
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'react/jsx-no-useless-fragment': 'off',
      'react/no-unknown-property': 'off',
      'react/require-render-return': 'off',
      'react/no-unescaped-entities': 'off',
      'react/jsx-no-target-blank': 'off',
      'react/jsx-no-comment-textnodes': 'off',
      'react/prop-types': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/use-memo': 'off',
      'sonarjs/no-useless-catch': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/prefer-for-of': 'error',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-unnecessary-type-constraint': 'off',
      '@typescript-eslint/no-array-constructor': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',

      // rules that are not supported by oxlint
      'no-unreachable-loop': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/unified-signatures': 'error',
      '@typescript-eslint/return-await': [
        'error',
        'error-handling-correctness-only',
      ],
      'sonarjs/no-all-duplicated-branches': 'error',
      'sonarjs/no-element-overwrite': 'error',
      'sonarjs/no-empty-collection': 'error',
      'sonarjs/no-extra-arguments': 'error',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/no-ignored-return': 'error',
      'sonarjs/no-use-of-empty-return-value': 'error',
      'sonarjs/non-existent-operator': 'error',
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/no-same-line-conditional': 'error',
      'sonarjs/no-duplicated-branches': 'error',
      'sonarjs/no-collection-size-mischeck': 'error',
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-gratuitous-expressions': 'error',

      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  {
    files: [
      'packages/**/*.{ts,tsx}',
      'tools/**/*.{ts,tsx}',
      'blocksuite/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          ignoreVoid: false,
          ignoreIIFE: false,
        },
      ],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/no-misused-promises': ['error'],
      '@typescript-eslint/prefer-readonly': 'error',
      'import-x/no-extraneous-dependencies': [
        'error',
        { includeInternal: true },
      ],
      'rxjs/finnish': [
        'error',
        {
          functions: false,
          methods: false,
          strict: true,

          types: {
            '^LiveData$': true,
            '^Signal$': true,
            '^ReadonlySignal$': true,
            '^Doc$': false,
            '^Awareness$': false,
            '^UndoManager$': false,
          },
        },
      ],
    },
  },
  {
    files: ['packages/frontend/admin/**/*'],
    rules: {
      'import-x/no-extraneous-dependencies': [
        'error',
        { includeInternal: true, whitelist: ['@affine/admin'] },
      ],
    },
  },
  {
    files: ['packages/frontend/core/**/*'],
    rules: {
      'import-x/no-extraneous-dependencies': [
        'error',
        { includeInternal: true, whitelist: ['@affine/core'] },
      ],
    },
  },
  {
    files: ['packages/frontend/component/**/*'],
    rules: {
      'import-x/no-extraneous-dependencies': [
        'error',
        { includeInternal: true, whitelist: ['@affine/component'] },
      ],
    },
  },
  {
    files: [
      '**/__tests__/**/*',
      '**/*.stories.tsx',
      '**/*.spec.ts',
      '**/tests/**/*',
      'scripts/**/*',
      '**/benchmark/**/*',
      '**/__debug__/**/*',
      '**/e2e/**/*',
    ],
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        { ignoreVoid: true },
      ],
      '@typescript-eslint/no-misused-promises': 0,
    },
  },
  {
    files: ['**/*.{ts,js,mjs}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  {
    files: [
      'packages/frontend/apps/electron/scripts/**/*',
      'tests/blocksuite/**/*.{ts,tsx}',
      'blocksuite/**/__tests__/**/*.{ts,tsx}',
    ],
    rules: {
      'import-x/no-extraneous-dependencies': 'off',
    },
  },
  {
    files: ['blocksuite/**/*.{ts,tsx}'],
    rules: {
      'rxjs/finnish': 'off',
    },
  },
  eslintConfigPrettier
);
