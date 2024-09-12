import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

let _isSquirrelBuild: boolean | null = null;
export function isSquirrelBuild() {
  if (typeof _isSquirrelBuild === 'boolean') {
    return _isSquirrelBuild;
  }

  // if it is squirrel build, there will be 'squirrel.exe'
  // otherwise it is in nsis web mode
  const files = fs.readdirSync(path.dirname(app.getPath('exe')));
  _isSquirrelBuild = files.some(it => it.includes('squirrel.exe'));

  return _isSquirrelBuild;
}
