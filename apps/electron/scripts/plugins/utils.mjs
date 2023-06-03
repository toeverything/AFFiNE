import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = fileURLToPath(new URL('../../../..', import.meta.url));
export const electronOutputDir = resolve(
  rootDir,
  'apps',
  'electron',
  'dist',
  'plugins'
);
export const pluginDir = resolve(rootDir, 'plugins');

/**
 *
 * @param pluginDirName {string}
 * @return {import('esbuild').BuildOptions}
 */
export function definePluginServerConfig(pluginDirName) {
  const pluginRootDir = resolve(pluginDir, pluginDirName);
  const serverEntryFile = resolve(pluginRootDir, 'src/server.ts');
  const serverOutputDir = resolve(electronOutputDir, pluginDirName);
  return {
    entryPoints: [serverEntryFile],
    platform: 'node',
    outdir: serverOutputDir,
    bundle: true,
  };
}
