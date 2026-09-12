import { afterEach } from 'vitest';

import { buildApp, type AppDeps, type BuiltApp } from '../../src/app.js';
import { testConfig } from './config.js';

let current: BuiltApp | undefined;

export async function startTestApp(
  overrides?: Parameters<typeof testConfig>[0],
  deps?: AppDeps
): Promise<BuiltApp> {
  await stopTestApp();
  current = await buildApp(testConfig(overrides), deps);
  return current;
}

export async function listenTestApp(
  overrides?: Parameters<typeof testConfig>[0],
  deps?: AppDeps
): Promise<BuiltApp & { url: string }> {
  const built = await startTestApp(overrides, deps);
  await built.app.listen({ host: '127.0.0.1', port: 0 });
  const address = built.app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { ...built, url: `http://127.0.0.1:${port}` };
}

export async function stopTestApp(): Promise<void> {
  if (!current) {
    return;
  }
  const { app } = current;
  current = undefined;
  app.server.closeIdleConnections?.();
  app.server.closeAllConnections?.();
  await app.close();
}

afterEach(async () => {
  await stopTestApp();
});
