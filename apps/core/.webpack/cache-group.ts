import { hash } from './utils.js';

function testPackageName(regexp: RegExp): (module: any) => boolean {
  return (module: any) =>
    module.nameForCondition && regexp.test(module.nameForCondition());
}

export const productionCacheGroups = {
  asyncVendor: {
    test: /[\\/]node_modules[\\/]/,
    name(module: any) {
      // https://hackernoon.com/the-100-correct-way-to-split-your-chunks-with-webpack-f8a9df5b7758
      const name =
        module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)?.[1] ??
        'unknown';
      return `npm-async-${hash(name)}`;
    },
    priority: Number.MAX_SAFE_INTEGER,
    chunks: 'async' as const,
  },
  mui: {
    name: `npm-mui`,
    test: testPackageName(/[\\/]node_modules[\\/](mui|@mui)[\\/]/),
    priority: 200,
    enforce: true,
  },
  blocksuite: {
    name: `npm-blocksuite`,
    test: testPackageName(/[\\/]node_modules[\\/](@blocksuite)[\\/]/),
    priority: 200,
    enforce: true,
  },
  react: {
    name: `npm-react`,
    test: testPackageName(
      /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/
    ),
    priority: 200,
    enforce: true,
  },
  jotai: {
    name: `npm-jotai`,
    test: testPackageName(/[\\/]node_modules[\\/](jotai)[\\/]/),
    priority: 200,
    enforce: true,
  },
  rxjs: {
    name: `npm-rxjs`,
    test: testPackageName(/[\\/]node_modules[\\/]rxjs[\\/]/),
    priority: 200,
    enforce: true,
  },
  lodash: {
    name: `npm-lodash`,
    test: testPackageName(/[\\/]node_modules[\\/]lodash[\\/]/),
    priority: 200,
    enforce: true,
  },
  emotion: {
    name: `npm-emotion`,
    test: testPackageName(/[\\/]node_modules[\\/](@emotion)[\\/]/),
    priority: 200,
    enforce: true,
  },
  vendor: {
    name: 'vendor',
    test: /[\\/]node_modules[\\/]/,
    priority: 190,
    enforce: true,
  },
  styles: {
    name: 'styles',
    test: (module: any) =>
      module.nameForCondition &&
      /\.css$/.test(module.nameForCondition()) &&
      !/^javascript/.test(module.type),
    chunks: 'all' as const,
    minSize: 1,
    minChunks: 1,
    reuseExistingChunk: true,
    priority: 1000,
    enforce: true,
  },
};
