import fs from 'node:fs';
import path from 'node:path';
import * as url from 'node:url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const { node } = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../electron-vendors.autogen.json'),
    'utf-8'
  )
);

const nativeNodeModulesPlugin = {
  name: 'native-node-modules',
  setup(build) {
    // Mark native Node.js modules as external
    build.onResolve({ filter: /\.node$/, namespace: 'file' }, args => {
      return { path: args.path, external: true };
    });
  },
};

// List of env that will be replaced by esbuild
const ENV_MACROS = ['AFFINE_GOOGLE_CLIENT_ID', 'AFFINE_GOOGLE_CLIENT_SECRET'];

/** @return {{main: import('esbuild').BuildOptions, preload: import('esbuild').BuildOptions}} */
export default () => {
  const define = Object.fromEntries(
    ENV_MACROS.map(key => [
      'process.env.' + key,
      JSON.stringify(process.env[key] ?? ''),
    ])
  );
  return {
    main: {
      entryPoints: ['layers/main/src/index.ts'],
      outdir: 'dist/layers/main',
      bundle: true,
      target: `node${node}`,
      platform: 'node',
      external: ['electron'],
      plugins: [nativeNodeModulesPlugin],
      define: define,
    },
    preload: {
      entryPoints: ['layers/preload/src/index.ts'],
      outdir: 'dist/layers/preload',
      bundle: true,
      target: `node${node}`,
      platform: 'node',
      external: ['electron'],
      define: define,
    },
  };
};
