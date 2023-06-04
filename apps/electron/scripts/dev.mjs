/* eslint-disable no-async-promise-executor */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import electronPath from 'electron';
import * as esbuild from 'esbuild';

import { config, electronDir } from './common.mjs';

// this means we don't spawn electron windows, mainly for testing
const watchMode = process.argv.includes('--watch');

/** Messages on stderr that match any of the contained patterns will be stripped from output */
const stderrFilterPatterns = [
  // warning about devtools extension
  // https://github.com/cawa-93/vite-electron-builder/issues/492
  // https://github.com/MarshallOfSound/electron-devtools-installer/issues/143
  /ExtensionLoadWarning/,
];

// these are set before calling `config`, so we have a chance to override them
try {
  const devJson = readFileSync(
    path.resolve(electronDir, './dev.json'),
    'utf-8'
  );
  const devEnv = JSON.parse(devJson);
  Object.assign(process.env, devEnv);
} catch (err) {
  console.warn(
    `Could not read dev.json. Some functions may not work as expected.`
  );
}

/** @type {ChildProcessWithoutNullStreams | null} */
let spawnProcess = null;

function spawnOrReloadElectron() {
  if (watchMode) {
    return;
  }
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

  // Stops the watch script when the application has quit
  spawnProcess.on('exit', process.exit);
}

const common = config();

async function watchPlugins() {
  await import('./plugins/dev-plugins.mjs');
}

async function watchPreload() {
  return new Promise(async resolve => {
    let initialBuild = false;
    const preloadBuild = await esbuild.context({
      ...common.preload,
      plugins: [
        ...(common.preload.plugins ?? []),
        {
          name: 'electron-dev:reload-app-on-preload-change',
          setup(build) {
            build.onEnd(() => {
              if (initialBuild) {
                console.log(`[preload] has changed, [re]launching electron...`);
                spawnOrReloadElectron();
              } else {
                resolve();
                initialBuild = true;
              }
            });
          },
        },
      ],
    });
    // watch will trigger build.onEnd() on first run & on subsequent changes
    await preloadBuild.watch();
  });
}

async function watchMain() {
  return new Promise(async resolve => {
    let initialBuild = false;

    const mainBuild = await esbuild.context({
      ...common.main,
      plugins: [
        ...(common.main.plugins ?? []),
        {
          name: 'electron-dev:reload-app-on-main-change',
          setup(build) {
            build.onEnd(() => {
              if (initialBuild) {
                console.log(`[main] has changed, [re]launching electron...`);
                spawnOrReloadElectron();
              } else {
                resolve();
                initialBuild = true;
              }
            });
          },
        },
      ],
    });
    await mainBuild.watch();
  });
}

async function main() {
  await watchPlugins();
  await watchMain();
  await watchPreload();

  if (watchMode) {
    console.log(`Watching for changes...`);
  } else {
    spawnOrReloadElectron();
    console.log(`Electron is started, watching for changes...`);
  }
}

main();
