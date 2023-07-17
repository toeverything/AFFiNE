// import { babel } from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import fg from 'fast-glob';
import copy from 'rollup-plugin-copy';
import { defineConfig } from 'vite';

/**
 * Gets the entrypoints of files within a set of given paths (i.e src/tests).
 * This is useful as when we execute k6, we run it against individual test files
 * @returns an object of [fileName]: absolute file path
 */
const getEntryPoints = entryPoints => {
  // Searches for files that match the patterns defined in the array of input points.
  // Returns an array of absolute file paths.
  const files = fg.sync(entryPoints, { absolute: true });

  // Maps the file paths in the "files" array to an array of key-value pair.
  const entities = files.map(file => {
    // Extract the part of the file path after the "src" folder and before the file extension.
    const [key] = file.match(/(?<=src\/k6\/).*$/) || [];

    // Remove the file extension from the key.
    const keyWithoutExt = key.replace(/\.[^.]*$/, '');

    return [keyWithoutExt, file];
  });

  // Convert the array of key-value pairs to an object using the Object.fromEntries() method.
  // Returns an object where each key is the file name without the extension and the value is the absolute file path.
  return Object.fromEntries(entities);
};

export default defineConfig({
  mode: 'production',
  build: {
    lib: {
      entry: getEntryPoints(['./src/k6/*.ts']),
      fileName: '[name]',
      formats: ['cjs'],
      sourcemap: true,
    },
    outDir: 'dist',
    minify: false, // Don't minimize, as it's not used in the browser
    rollupOptions: {
      external: [new RegExp(/^(k6|https?:\/\/)(\/.*)?/)],
    },
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: [
    copy({
      targets: [
        {
          src: 'assets/**/*',
          dest: 'dist',
          noErrorOnMissing: true,
        },
      ],
    }),
    // babel({
    //   babelHelpers: 'bundled',
    //   exclude: /node_modules/,
    // }),
    nodeResolve(),
  ],
});
