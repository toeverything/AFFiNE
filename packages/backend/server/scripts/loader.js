import * as otel from '@opentelemetry/instrumentation/hook.mjs';
import { createEsmHooks, register } from 'ts-node';

const service = register({
  experimentalSpecifierResolution: 'node',
  transpileOnly: true,
  logError: true,
});

/**
 * @type {import('ts-node').NodeLoaderHooksAPI2}
 
 */
const ts = createEsmHooks(service);

/**
 * @type {import('ts-node').NodeLoaderHooksAPI2.ResolveHook}
 */
export const resolve = (specifier, context, defaultResolver) => {
  return ts.resolve(specifier, context, (s, c) => {
    return otel.resolve(s, c, defaultResolver);
  });
};

/**
 * @type {import('ts-node').NodeLoaderHooksAPI2.LoadHook}
 */
export const load = async (url, context, defaultLoader) => {
  return await otel.load(url, context, (u, c) => {
    return ts.load(u, c, defaultLoader);
  });
};
