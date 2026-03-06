import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const newE2E = process.env.TEST_MODE === 'e2e';
const newE2ETests = './src/__tests__/e2e/**/*.spec.ts';
const projectRoot = dirname(fileURLToPath(import.meta.url));
const serverRuntimeRegister = resolve(
  projectRoot,
  '../../../tools/cli/register.js'
);

const preludes = [resolve(projectRoot, 'src/prelude.ts')];

if (newE2E) {
  preludes.push(resolve(projectRoot, 'src/__tests__/e2e/prelude.ts'));
}

export default {
  timeout: '1m',
  nodeArguments: [`--import=${serverRuntimeRegister}`],
  extensions: {
    ts: 'module',
  },
  watchMode: {
    ignoreChanges: ['**/*.gen.*'],
  },
  files: newE2E
    ? [newE2ETests]
    : ['**/*.spec.ts', '**/*.e2e.ts', '!' + newE2ETests],
  require: preludes,
  environmentVariables: {
    NODE_ENV: 'test',
    DEPLOYMENT_TYPE: 'affine',
    MAILER_HOST: '0.0.0.0',
    MAILER_PORT: '1025',
    MAILER_USER: 'noreply@toeverything.info',
    MAILER_PASSWORD: 'affine',
    MAILER_SENDER: 'noreply@toeverything.info',
  },
};
