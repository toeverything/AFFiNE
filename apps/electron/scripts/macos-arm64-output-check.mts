import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';

if (process.platform !== 'darwin') {
  throw new Error('This script is only for macOS');
}

const arch = process.arch;
if (arch !== 'arm64') {
  throw new Error(`This script is only for arm64, but current arch is ${arch}`);
}

const outputRoot = fileURLToPath(
  new URL(
    '../zip-out/AFFiNE-canary.app/Contents/Resources/app',
    import.meta.url
  )
);
const outputList = [
  [
    'dist',
    [
      'main.js',
      'preload.js',
      'preload.js',
      'affine.darwin-arm64.node',
      'plugins',
      'workers',
    ],
  ],
  ['dist/plugins', ['bookmark-block']],
  ['dist/plugins/bookmark-block', ['index.mjs']],
  ['dist/workers', ['plugin.worker.js']],
] as [entry: string, expected: string[]][];

await Promise.all(
  outputList.map(async ([entry, output]) => {
    const files = await readdir(`${outputRoot}/${entry}`);
    output.forEach(file => {
      if (!files.includes(file)) {
        throw new Error(`File ${entry}/${file} not found`);
      }
    });
  })
);

console.log('Output check passed');
