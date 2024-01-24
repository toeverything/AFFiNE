/// <reference types="./global.d.ts" />
// keep the config import at the top
// eslint-disable-next-line simple-import-sort/imports
import './prelude';
import { createApp } from './app';

const app = await createApp();
const listeningHost = AFFiNE.deploy ? '0.0.0.0' : 'localhost';
await app.listen(AFFiNE.port, listeningHost);

console.log(
  `AFFiNE Server has been started on http://${listeningHost}:${AFFiNE.port}.`
);
console.log(`And the public server should be recognized as ${AFFiNE.baseUrl}`);
