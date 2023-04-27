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
  },
  plugins: [
    'react',
    '@typescript-eslint',
    'simple-import-sort',
    'import',
    'unused-imports',
  ],
  rules: {
    'no-undef': 'off',
    'no-empty': 'off',
    'no-func-assign': 'off',
    'no-cond-assign': 'off',
    'react/prop-types': 'off',
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'unused-imports/no-unused-imports': 'error',
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
    '@typescript-eslint/ban-ts-comment': 0,
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
        ],
      },
    ],
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
  ],
};

module.exports = config;
