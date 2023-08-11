const { resolve } = require('node:path');

const createPattern = packageName => [
  {
    group: ['**/dist', '**/dist/**'],
    message: 'Do not import from dist',
    allowTypeImports: false,
  },
  {
    group: ['**/src', '**/src/**'],
    message: 'Do not import from src',
    allowTypeImports: false,
  },
  {
    group: [`@affine/${packageName}`],
    message: 'Do not import package itself',
    allowTypeImports: false,
  },
  {
    group: [`@toeverything/${packageName}`],
    message: 'Do not import package itself',
    allowTypeImports: false,
  },
  {
    group: ['@blocksuite/store'],
    message: "Import from '@blocksuite/global/utils'",
    importNames: ['assertExists', 'assertEquals'],
  },
  {
    group: ['react-router-dom'],
    message: 'Use `useNavigateHelper` instead',
    importNames: ['useNavigate'],
  },
  {
    group: ['yjs'],
    message: 'Do not use this API because it has a bug',
    importNames: ['mergeUpdates'],
  },
];

const allPackages = [
  'packages/cli',
  'packages/component',
  'packages/debug',
  'packages/env',
  'packages/graphql',
  'packages/hooks',
  'packages/i18n',
  'packages/jotai',
  'packages/native',
  'packages/infra',
  'packages/sdk',
  'packages/templates',
  'packages/theme',
  'packages/workspace',
  'packages/y-indexeddb',
  'apps/web',
  'apps/server',
  'apps/electron',
  'apps/storybook',
  'plugins/copilot',
  'plugins/bookmark-block',
];

/**
 * @type {import('eslint').Linter.Config}
 */
const config = {
  root: true,
  settings: {
    react: {
      version: 'detect',
    },
    next: {
      rootDir: 'apps/web',
    },
  },
  extends: [
    'eslint:recommended',
    'plugin:react-hooks/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      globalReturn: false,
      impliedStrict: true,
      jsx: true,
    },
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: resolve(__dirname, './tsconfig.eslint.json'),
  },
  plugins: [
    'react',
    '@typescript-eslint',
    'simple-import-sort',
    'sonarjs',
    'i',
    'unused-imports',
    'unicorn',
  ],
  rules: {
    'array-callback-return': 'error',
    'no-undef': 'off',
    'no-empty': 'off',
    'no-func-assign': 'off',
    'no-cond-assign': 'off',
    'no-constant-binary-expression': 'error',
    'no-constructor-return': 'error',
    'react/prop-types': 'off',
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    'unused-imports/no-unused-imports': 'error',
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
    '@typescript-eslint/ban-ts-comment': [
      'error',
      {
        'ts-expect-error': 'allow-with-description',
        'ts-ignore': true,
        'ts-nocheck': true,
        'ts-check': false,
      },
    ],
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/dist'],
            message: "Don't import from dist",
            allowTypeImports: false,
          },
          {
            group: ['**/src'],
            message: "Don't import from src",
            allowTypeImports: false,
          },
          {
            group: ['@blocksuite/store'],
            message: "Import from '@blocksuite/global/utils'",
            importNames: ['assertExists', 'assertEquals'],
          },
          {
            group: ['react-router-dom'],
            message: 'Use `useNavigateHelper` instead',
            importNames: ['useNavigate'],
          },
          {
            group: ['yjs'],
            message: 'Do not use this API because it has a bug',
            importNames: ['mergeUpdates'],
          },
        ],
      },
    ],
    'unicorn/filename-case': [
      'error',
      {
        case: 'kebabCase',
        ignore: ['^\\[[a-zA-Z0-9-_]+\\]\\.tsx$'],
      },
    ],
    'sonarjs/no-all-duplicated-branches': 'error',
    'sonarjs/no-element-overwrite': 'error',
    'sonarjs/no-empty-collection': 'error',
    'sonarjs/no-extra-arguments': 'error',
    'sonarjs/no-identical-conditions': 'error',
    'sonarjs/no-identical-expressions': 'error',
    'sonarjs/no-ignored-return': 'error',
    'sonarjs/no-one-iteration-loop': 'error',
    'sonarjs/no-use-of-empty-return-value': 'error',
    'sonarjs/non-existent-operator': 'error',
    'sonarjs/no-collapsible-if': 'error',
    'sonarjs/no-same-line-conditional': 'error',
    'sonarjs/no-duplicated-branches': 'error',
    'sonarjs/no-collection-size-mischeck': 'error',
    'sonarjs/no-useless-catch': 'error',
    'sonarjs/no-identical-functions': 'error',
  },
  overrides: [
    {
      files: 'apps/server/**/*.ts',
      rules: {
        '@typescript-eslint/consistent-type-imports': 0,
      },
    },
    {
      files: '*.cjs',
      rules: {
        '@typescript-eslint/no-var-requires': 0,
      },
    },
    ...allPackages.map(pkg => ({
      files: [`${pkg}/src/**/*.ts`, `${pkg}/src/**/*.tsx`],
      parserOptions: {
        project: resolve(__dirname, './tsconfig.eslint.json'),
      },
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: createPattern(pkg),
          },
        ],
        '@typescript-eslint/no-floating-promises': [
          'error',
          {
            ignoreVoid: false,
            ignoreIIFE: false,
          },
        ],
        '@typescript-eslint/no-misused-promises': ['error'],
      },
    })),
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
        '@typescript-eslint/no-non-null-assertion': 0,
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-expect-error': false,
            'ts-ignore': true,
            'ts-nocheck': true,
            'ts-check': false,
          },
        ],
        '@typescript-eslint/no-floating-promises': 0,
        '@typescript-eslint/no-misused-promises': 0,
      },
    },
  ],
};

module.exports = config;
