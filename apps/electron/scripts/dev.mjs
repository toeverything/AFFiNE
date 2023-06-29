/* eslint-disable no-async-promise-executor */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path, { resolve } from 'node:path';

import electronPath from 'electron';
import * as esbuild from 'esbuild';
import which from 'which';

import { config, electronDir, rootDir } from './common.mjs';

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
const yarnPath = which.sync('yarn');
async function watchPlugins() {
  spawn(yarnPath, ['dev'], {
    stdio: 'inherit',
    cwd: resolve(rootDir, './packages/plugin-infra'),
  });
  await import('./plugins/dev-plugins.mjs');
}

async function watchLayers() {
  return new Promise(async resolve => {
    let initialBuild = false;

    const buildContext = await esbuild.context({
      ...common.layers,
      plugins: [
        ...(common.layers.plugins ?? []),
        {
          name: 'electron-dev:reload-app-on-layers-change',
          setup(build) {
            build.onEnd(() => {
              if (initialBuild) {
                console.log(`[layers] has changed, [re]launching electron...`);
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
    await buildContext.watch();
  });
}

async function watchWorkers() {
  return new Promise(async resolve => {
    let initialBuild = false;

    const buildContext = await esbuild.context({
      ...common.workers,
      plugins: [
        ...(common.workers.plugins ?? []),
        {
          name: 'electron-dev:reload-app-on-workers-change',
          setup(build) {
            build.onEnd(() => {
              if (initialBuild) {
                console.log(`[workers] has changed, [re]launching electron...`);
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
    await buildContext.watch();
  });
}

async function main() {
  await watchPlugins();
  await watchLayers();
  await watchWorkers();

  if (watchMode) {
    console.log(`Watching for changes...`);
  } else {
    spawnOrReloadElectron();
    console.log(`Electron is started, watching for changes...`);
  }
}

main();
