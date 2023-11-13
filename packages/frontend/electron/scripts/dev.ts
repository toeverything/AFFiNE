import { spawn } from 'node:child_process';

import type { ChildProcessWithoutNullStreams } from 'child_process';
import type { BuildContext } from 'esbuild';
import * as esbuild from 'esbuild';

import { config, electronDir } from './common';

// this means we don't spawn electron windows, mainly for testing
const watchMode = process.argv.includes('--watch');

/** Messages on stderr that match any of the contained patterns will be stripped from output */
const stderrFilterPatterns = [
  // warning about devtools extension
  // https://github.com/cawa-93/vite-electron-builder/issues/492
  // https://github.com/MarshallOfSound/electron-devtools-installer/issues/143
  /ExtensionLoadWarning/,
];

let spawnProcess: ChildProcessWithoutNullStreams | null = null;

function spawnOrReloadElectron() {
  if (watchMode) {
    return;
  }
  if (spawnProcess !== null) {
    spawnProcess.off('exit', process.exit);
    spawnProcess.kill('SIGINT');
    spawnProcess = null;
  }

  spawnProcess = spawn('electron', ['.'], {
    cwd: electronDir,
    env: process.env,
  });

  spawnProcess.stdout.on('data', d => {
    const str = d.toString().trim();
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
  spawnProcess.on('exit', code => {
    if (code && code !== 0) {
      console.log(`Electron exited with code ${code}`);
    }
  });
}

const common = config();

async function watchLayers() {
  let initialBuild = false;
  return new Promise<BuildContext>(resolve => {
    const buildContextPromise = esbuild.context({
      ...common,
      plugins: [
        ...(common.plugins ?? []),
        {
          name: 'electron-dev:reload-app-on-layers-change',
          setup(build) {
            build.onEnd(() => {
              if (initialBuild) {
                console.log(`[layers] has changed, [re]launching electron...`);
                spawnOrReloadElectron();
              } else {
                buildContextPromise.then(resolve);
                initialBuild = true;
              }
            });
          },
        },
      ],
    });
    buildContextPromise.then(async buildContext => {
      await buildContext.watch();
    });
  });
}

await watchLayers();

if (watchMode) {
  console.log(`Watching for changes...`);
} else {
  console.log('Starting electron...');
  spawnOrReloadElectron();
  console.log(`Electron is started, watching for changes...`);
}
