import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import eslint from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import oxlint from 'eslint-plugin-oxlint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
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
const oxlintConfigs = oxlint.buildFromOxlintConfigFile('./.oxlintrc.json');

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
      react,
      'react-hooks': reactHooks,
      'import-x': importX,
      rxjs,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
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
      'react/jsx-uses-vars': 'off',
      'react/prop-types': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/use-memo': 'off',

      // rules that are not supported by oxlint, or are not enabled by our
      // current oxlint setup
      'no-unreachable-loop': 'error',
    },
  },
  {
    files: [
      'packages/**/*.{ts,tsx}',
      'tools/**/*.{ts,tsx}',
      'blocksuite/**/*.{ts,tsx}',
    ],
    rules: {
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
  ...oxlintConfigs,
  eslintConfigPrettier
);
