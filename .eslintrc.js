const { readdirSync, statSync } = require('fs');

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
];

const pkgs = readdirSync('./packages').filter(pkg => {
  return statSync(`./packages/${pkg}`).isDirectory();
});
const apps = readdirSync('./apps').filter(pkg => {
  return statSync(`./apps/${pkg}`).isDirectory();
});

const allPackages = pkgs.concat(apps);

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
    project: './tsconfig.eslint.json',
  },
  plugins: [
    'react',
    '@typescript-eslint',
    'simple-import-sort',
    'import',
    'unused-imports',
    'unicorn',
  ],
  rules: {
    'no-undef': 'off',
    'no-empty': 'off',
    'no-func-assign': 'off',
    'no-cond-assign': 'off',
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
    'unicorn/filename-case': [
      'error',
      {
        case: 'kebabCase',
        ignore: ['^\\[[a-zA-Z0-9-_]+\\]\\.tsx$'],
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
    {
      files: ['**/__tests__/**/*', '**/*.stories.tsx'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 0,
      },
    },
    ...allPackages.map(pkg => ({
      files: [`packages/${pkg}/src/**/*.ts`, `packages/${pkg}/src/**/*.tsx`],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: createPattern(pkg),
          },
        ],
      },
    })),
  ],
};

module.exports = config;
