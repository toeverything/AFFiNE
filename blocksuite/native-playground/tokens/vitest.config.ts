import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import { transform as esbuildTransform } from 'esbuild';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const INTEGRATION_TEST_ROOT = path.resolve(__dirname, '../../integration-test');
const DEFAULT_OUT_PATH =
  process.env.STYLE_ORACLE_OUT ?? path.join(__dirname, 'style-oracle.json');

const writeStyleOracle = async (_ctx: unknown, jsonText: string) => {
  fs.mkdirSync(path.dirname(DEFAULT_OUT_PATH), { recursive: true });
  fs.writeFileSync(DEFAULT_OUT_PATH, jsonText, 'utf8');
  return DEFAULT_OUT_PATH;
};

/**
 * Downlevel TC39 2022-03 decorators (used by Lit & BlockSuite @Peekable)
 * before Vite 8's oxc transform runs, so Chromium receives valid ES2022 JS.
 */
function tc39DecoratorsPlugin(): Plugin {
  return {
    name: 'np-tc39-decorators',
    enforce: 'pre',
    async transform(code, id) {
      const cleanId = id.split('?')[0];
      if (!/\.(?:ts|tsx)$/.test(cleanId)) return null;
      if (cleanId.endsWith('.css.ts') || cleanId.includes('/node_modules/')) {
        return null;
      }
      if (!code.includes('@')) return null;

      const result = await esbuildTransform(code, {
        loader: cleanId.endsWith('.tsx') ? 'tsx' : 'ts',
        sourcefile: cleanId,
        target: 'es2022',
        tsconfigRaw: {
          compilerOptions: {
            experimentalDecorators: false,
            useDefineForClassFields: false,
          },
        },
      });
      return {
        code: result.code,
        map: result.map || null,
      };
    },
  };
}

const NODE_MODULES_REAL = (() => {
  try {
    return fs.realpathSync(path.join(REPO_ROOT, 'node_modules'));
  } catch {
    return path.join(REPO_ROOT, 'node_modules');
  }
})();

export default defineConfig({
  root: INTEGRATION_TEST_ROOT,
  server: {
    fs: {
      allow: [REPO_ROOT, NODE_MODULES_REAL],
    },
  },
  optimizeDeps: {
    rolldownOptions: {
      transform: {
        target: 'es2022',
      },
    },
  },
  plugins: [tc39DecoratorsPlugin(), vanillaExtractPlugin()],
  test: {
    include: ['../native-playground/tokens/extract-style-oracle.spec.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      isolate: false,
      instances: [{ browser: 'chromium' }],
      viewport: {
        width: 1280,
        height: 800,
      },
      commands: {
        writeStyleOracle,
      },
    },
    deps: {
      interopDefault: true,
    },
  },
});
