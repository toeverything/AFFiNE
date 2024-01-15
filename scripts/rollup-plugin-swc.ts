import { createFilter } from '@rollup/pluginutils';
import { transform } from '@swc/core';
import type { Plugin } from 'vite';

const queryRE = /\?.*$/;
const hashRE = /#.*$/;
const cleanUrl = (url: string) => url.replace(hashRE, '').replace(queryRE, '');

export function RollupPluginSwc(): Plugin {
  const filter = createFilter(/\.(tsx?|jsx)$/, /\.js$/);

  return {
    name: 'rollup-plugin-swc',
    async transform(code, id) {
      if (filter(id) || filter(cleanUrl(id))) {
        const result = await transform(code, {
          jsc: {
            target: 'esnext',
            parser: {
              syntax: 'typescript',
              tsx: true,
              decorators: true,
            },
            transform: {
              react: {
                runtime: 'automatic',
                importSource: '@emotion/react',
              },
              legacyDecorator: true,
              decoratorMetadata: true,
            },
          },
          filename: id,
          sourceMaps: true,
        });
        return {
          code: result.code,
          map: result.map,
        };
      }
      return;
    },
  };
}
