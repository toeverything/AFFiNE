import test, { registerCompletionHandler } from 'ava';

import { Env } from '../../env';
import { type TestingApp } from './create-app';

export const e2e = test;
// @ts-expect-error created in prelude.ts
export const app: TestingApp = globalThis.app;

registerCompletionHandler(async () => {
  await app.close();
});

export function refreshEnv() {
  globalThis.env = new Env();
}

export * from '../mocks';
export { createApp } from './create-app';
export type { TestingApp };
