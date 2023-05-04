import { fileURLToPath } from 'node:url';

import { runCli } from '@magic-works/i18n-codegen';
import { beforeAll } from 'vitest';

beforeAll(async () => {
  await runCli(
    {
      watch: false,
      cwd: fileURLToPath(
        new URL('../../../.i18n-codegen.json', import.meta.url)
      ),
    },
    error => {
      console.error(error);
      process.exit(1);
    }
  );
});
