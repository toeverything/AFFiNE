import { execSync } from 'node:child_process';
import { join } from 'node:path';

export default async function () {
  execSync('yarn ts-node-esm scripts/', {
    cwd: join(__dirname, '..'),
  });
}
