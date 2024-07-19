import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as otel from '@opentelemetry/instrumentation/hook.mjs';
import { EnforceExtension, ResolverFactory } from 'oxc-resolver';

const resolver = new ResolverFactory({
  conditionNames: ['node', 'import', 'node-addons'],
  extensionAlias: {
    '.js': ['.js'],
    '.mjs': ['.mjs'],
    '.cjs': ['.cjs'],
  },
  enforceExtension: EnforceExtension.Auto,
  extensions: ['.js', '.mjs', '.cjs', '.json', '.wasm', '.node'],
});

const BUILTIN_MODULES = new Set(builtinModules);

export async function resolve(request, context, next) {
  if (request.startsWith('node:') || request.startsWith('nodejs:')) {
    return {
      shortCircuit: true,
      format: 'builtin',
      url: request,
    };
  }

  if (BUILTIN_MODULES.has(request)) {
    return {
      shortCircuit: true,
      format: 'builtin',
      url: `node:${request}`,
    };
  }

  if (request.startsWith('data:')) {
    return {
      shortCircuit: true,
      format: null,
      url: request,
    };
  }

  if (!context.parentURL) {
    return {
      shortCircuit: true,
      format: 'module',
      url: request,
    };
  }

  if (request.startsWith('file://')) {
    const { moduleType, error } = await resolver.async(
      '/',
      fileURLToPath(request)
    );
    if (error) {
      throw new Error(`${error}: ${request} cannot be resolved`);
    }
    return {
      shortCircuit: true,
      format: moduleType,
      url: request,
    };
  }

  if (context.importAttributes?.type) {
    const res = await next(request, context);
    return {
      ...res,
      shortCircuit: true,
    };
  }

  const { error, path, moduleType } = await resolver.async(
    join(fileURLToPath(context.parentURL), '..'),
    request.startsWith('file:') ? fileURLToPath(request) : request
  );

  if (error) {
    throw new Error(
      `${error}: ${request} cannot be resolved in ${context.parentURL}`
    );
  }

  if (path && !path.includes('node_modules')) {
    const url = new URL(join('file://', path));
    url.searchParams.set('iitm', 'true');
    return {
      url: new URL(url).href,
      shortCircuit: true,
      format:
        path.endsWith('cjs') ||
        path.endsWith('cts') ||
        moduleType === 'commonjs' ||
        !moduleType
          ? 'commonjs'
          : moduleType === 'module'
            ? 'module'
            : 'commonjs',
    };
  }

  const url = new URL(join('file://', path));
  return {
    url: url.href,
    moduleType,
    shortCircuit: true,
  };
}

export const load = async (url, context, next) => {
  if (
    url.startsWith('data:') ||
    context.format === 'builtin' ||
    context.format === 'json' ||
    context.format === 'wasm'
  ) {
    return next(url, context);
  }

  let resolvedUrl = url;

  if (
    !url.includes('node_modules') &&
    !url.endsWith('.js') &&
    !url.endsWith('.mjs') &&
    !url.endsWith('.json') &&
    !url.endsWith('.wasm') &&
    !url.endsWith('.node')
  ) {
    const { path } = await resolver.async(url, fileURLToPath(url));
    if (path) {
      resolvedUrl = new URL(join('file://', path)).href;
    }
  }

  const loaded = await otel.load(resolvedUrl, context, next);
  return loaded;
};
