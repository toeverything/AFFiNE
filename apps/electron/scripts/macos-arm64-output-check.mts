import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';

const outputRoot = fileURLToPath(
  new URL(
    '../out/canary/AFFiNE-canary-darwin-arm64/AFFiNE-canary.app/Contents/Resources/app',
    import.meta.url
  )
);

const outputList = [
  [
    'dist',
    [
      'main.js',
      'helper.js',
      'preload.js',
      'affine.darwin-arm64.node',
      'plugins',
    ],
  ],
  ['dist/plugins', ['bookmark']],
  ['dist/plugins/bookmark', ['index.cjs']],
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
