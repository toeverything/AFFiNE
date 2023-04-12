import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateAsync } from 'dts-for-context-bridge';
import electronPath from 'electron';
import * as esbuild from 'esbuild';

import commonFn from './common.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type 'production' | 'development'' */
const mode = (process.env.NODE_ENV = process.env.NODE_ENV || 'development');

/** Messages on stderr that match any of the contained patterns will be stripped from output */
const stderrFilterPatterns = [
  // warning about devtools extension
  // https://github.com/cawa-93/vite-electron-builder/issues/492
  // https://github.com/MarshallOfSound/electron-devtools-installer/issues/143
  /ExtensionLoadWarning/,
];

// these are set before calling commonFn so we have a chance to override them
try {
  const devJson = readFileSync(path.resolve(__dirname, '../dev.json'), 'utf-8');
  const devEnv = JSON.parse(devJson);
  Object.assign(process.env, devEnv);
} catch (err) {
  console.warn(
    `Could not read dev.json. Some functions may not work as expected.`
  );
}

// hard-coded for now:
// fixme(xp): report error if app is not running on port 8080
process.env.DEV_SERVER_URL = `http://localhost:8080`;

/** @type {ChildProcessWithoutNullStreams | null} */
let spawnProcess = null;

function spawnOrReloadElectron() {
  if (spawnProcess !== null) {
    spawnProcess.off('exit', process.exit);
    spawnProcess.kill('SIGINT');
    spawnProcess = null;
  }

  spawnProcess = spawn(String(electronPath), ['.']);

  spawnProcess.stdout.on(
    'data',
    d => d.toString().trim() && console.warn(d.toString())
  );
  spawnProcess.stderr.on('data', d => {
    const data = d.toString().trim();
    if (!data) return;
    const mayIgnore = stderrFilterPatterns.some(r => r.test(data));
    if (mayIgnore) return;
    console.error(data);
  });

  // Stops the watch script when the application has been quit
  spawnProcess.on('exit', process.exit);
}

const common = commonFn();

async function main() {
  async function watchPreload(onInitialBuild) {
    const preloadBuild = await esbuild.context({
      ...common.preload,
      plugins: [
        ...(common.preload.plugins ?? []),
        {
          name: 'affine-dev:reload-app-on-preload-change',
          setup(build) {
            let initialBuild = false;
            build.onEnd(() => {
              generateAsync({
                input: 'layers/preload/src/**/*.ts',
                output: 'layers/preload/preload.d.ts',
              });
              if (initialBuild) {
                console.log(`[preload] has changed`);
                spawnOrReloadElectron();
              } else {
                initialBuild = true;
                onInitialBuild();
              }
            });
          },
        },
      ],
    });
    await preloadBuild.watch();
  }

  async function watchMain() {
    const mainBuild = await esbuild.context({
      ...common.main,
      define: {
        ...common.main.define,
        'process.env.NODE_ENV': `"${mode}"`,
        'process.env.DEV_SERVER_URL': `"${process.env.DEV_SERVER_URL}"`,
      },
      plugins: [
        ...(common.main.plugins ?? []),
        {
          name: 'affine-dev:reload-app-on-main-change',
          setup(build) {
            let initialBuild = false;
            build.onEnd(() => {
              if (initialBuild) {
                console.log(`[main] has changed, [re]launching electron...`);
              } else {
                initialBuild = true;
              }
              spawnOrReloadElectron();
            });
          },
        },
      ],
    });
    await mainBuild.watch();
  }

  await watchPreload(async () => {
    await watchMain();
    spawnOrReloadElectron();
    console.log(`Electron is started, watching for changes...`);
  });
}

main();
