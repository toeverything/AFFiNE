import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import electronPath from 'electron';
import * as esbuild from 'esbuild';

import { config, root } from './common.mjs';

/** @type 'production' | 'development'' */
const mode = (process.env.NODE_ENV = process.env.NODE_ENV || 'development');

/** Messages on stderr that match any of the contained patterns will be stripped from output */
const stderrFilterPatterns = [
  // warning about devtools extension
  // https://github.com/cawa-93/vite-electron-builder/issues/492
  // https://github.com/MarshallOfSound/electron-devtools-installer/issues/143
  /ExtensionLoadWarning/,
];

// these are set before calling `config`, so we have a chance to override them
try {
  const devJson = readFileSync(path.resolve(root, './dev.json'), 'utf-8');
  const devEnv = JSON.parse(devJson);
  Object.assign(process.env, devEnv);
} catch (err) {
  console.warn(
    `Could not read dev.json. Some functions may not work as expected.`
  );
}

// hard-coded for now:
// fixme(xp): report error if app is not running on DEV_SERVER_URL
const DEV_SERVER_URL = process.env.DEV_SERVER_URL;

/** @type {ChildProcessWithoutNullStreams | null} */
let spawnProcess = null;

function spawnOrReloadElectron() {
  if (spawnProcess !== null) {
    spawnProcess.off('exit', process.exit);
    spawnProcess.kill('SIGINT');
    spawnProcess = null;
  }

  spawnProcess = spawn(String(electronPath), ['.']);

  spawnProcess.stdout.on('data', d => {
    let str = d.toString().trim();
    if (str) {
      console.log(str);
    }
  });
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

const common = config();

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
    const define = {
      ...common.main.define,
      'process.env.NODE_ENV': `"${mode}"`,
    };

    if (DEV_SERVER_URL) {
      define['process.env.DEV_SERVER_URL'] = `"${DEV_SERVER_URL}"`;
    }

    const mainBuild = await esbuild.context({
      ...common.main,
      define: define,
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
