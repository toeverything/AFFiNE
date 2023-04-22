import { rmSync } from 'node:fs';

import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

import pkg from './package.json';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  rmSync('dist-electron', { recursive: true, force: true });

  const isServe = command === 'serve';
  const isBuild = command === 'build';
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG;

  return {
    plugins: [
      electron([
        {
          // Main-Process entry file of the Electron App.
          entry: 'layers/main/src/index.ts',
          onstart(options) {
            if (process.env.VSCODE_DEBUG) {
              console.log(
                /* For `.vscode/.debug.script.mjs` */ '[startup] Electron App'
              );
            } else {
              options.startup();
            }
          },
          vite: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist/layers/main',
              rollupOptions: {
                external: Object.keys(
                  'dependencies' in pkg ? pkg.dependencies : {}
                ),
              },
            },
          },
        },
        {
          entry: 'layers/preload/src/index.ts',
          onstart(options) {
            // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete,
            // instead of restarting the entire Electron App.
            options.reload();
          },
          vite: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined, // #332
              minify: isBuild,
              outDir: 'dist/layers/preload',
              rollupOptions: {
                external: Object.keys(
                  'dependencies' in pkg ? pkg.dependencies : {}
                ),
              },
            },
          },
        },
      ]),
      // Use Node.js API in the Renderer-process
      renderer(),
    ],
    server:
      process.env.VSCODE_DEBUG &&
      (() => {
        const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL);
        return {
          host: url.hostname,
          port: +url.port,
        };
      })(),
    clearScreen: false,
  };
});
