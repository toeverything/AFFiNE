/// <reference types="./global.d.ts" />
// keep the config import at the top
// eslint-disable-next-line simple-import-sort/imports
import './prelude';
import { createApp } from './app';

const app = await createApp();
await app.listen(AFFiNE.port, AFFiNE.host);

console.log(
  `AFFiNE Server has been started on http://${AFFiNE.host}:${AFFiNE.port}.`
);
console.log(`And the public server should be recognized as ${AFFiNE.baseUrl}`);
