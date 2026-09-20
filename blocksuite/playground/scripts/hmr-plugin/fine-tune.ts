/* oxlint-disable import-x-js/no-extraneous-dependencies */
import path from 'node:path';

import { init, parse } from 'es-module-lexer';
import MagicString from 'magic-string';
import micromatch from 'micromatch';
import type { Plugin } from 'vite';
const isMatch = micromatch.isMatch;

export function fineTuneHmr({
  include,
  exclude,
}: {
  include: string[];
  exclude: string[];
}): Plugin {
  let root = '';
  const plugin: Plugin = {
    name: 'add-hot-for-pure-exports',
    apply: 'serve',
    configResolved(config) {
      root = config.root;
    },
    async configureServer() {
      await init;
    },
    transform: (code, id) => {
      // only handle js/ts files
      const includeGlob = include.map(i => path.resolve(root, i));
      const excludeGlob = exclude.map(i => path.resolve(root, i));
      const isInScope = isMatch(id, includeGlob) && !isMatch(id, excludeGlob);
      if (!isInScope) return;
      if (!(id.endsWith('.js') || id.endsWith('.ts'))) return;
      // only handle files which not contains Lit elements
      if (code.includes('import.meta.hot')) return;

      const [imports, exports] = parse(code, id);
      if (exports.length === 0 && imports.length > 0) {
        const modules = imports.map(i => i.n);
        const modulesEndsWithTs = modules
          .filter(Boolean)
          .map(m => m!.replace(/\.js$/, '.ts'));
        const preamble = `
          if (import.meta.hot) {
            import.meta.hot.accept(${JSON.stringify(
              modulesEndsWithTs
            )}, data => {
              // some update logic
            });
          }
          `;

        const s = new MagicString(code);
        s.prepend(preamble + '\n');
        return {
          code: s.toString(),
          map: s.generateMap({ hires: true, source: id, includeContent: true }),
        };
      }
      return;
    },
  };

  return plugin;
}
