import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from '@magic-works/i18n-codegen';
import { beforeAll } from 'vitest';

beforeAll(async () => {
  runCli(
    {
      watch: false,
      cwd: join(fileURLToPath(import.meta.url), '../../../.i18n-codegen.json'),
    },
    error => {
      console.error(error);
      process.exit(1);
    }
  );
});
