import fs from 'node:fs';
import path from 'node:path';

import { AppConfigStorage, defaultAppConfig } from '@toeverything/infra';
import { app } from 'electron';

const FILENAME = 'config.json';
const FILEPATH = path.join(app.getPath('userData'), FILENAME);

export const persistentConfig = new AppConfigStorage({
  config: defaultAppConfig,
  get: () => JSON.parse(fs.readFileSync(FILEPATH, 'utf-8')),
  set: data => fs.writeFileSync(FILEPATH, JSON.stringify(data, null, 2)),
});
