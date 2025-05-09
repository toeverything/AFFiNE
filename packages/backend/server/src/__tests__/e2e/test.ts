import test, { registerCompletionHandler } from 'ava';

import { type TestingApp } from './create-app';

export const e2e = test;
// @ts-expect-error created in prelude.ts
export const app: TestingApp = globalThis.app;

registerCompletionHandler(async () => {
  await app.close();
});
