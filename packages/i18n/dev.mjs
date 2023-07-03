import { runCli } from '@magic-works/i18n-codegen';
import { fileURLToPath } from 'url';

runCli(
  {
    config: fileURLToPath(new URL('../../.i18n-codegen.json', import.meta.url)),
    watch: true,
  },
  error => {
    console.error(error);
  }
);
