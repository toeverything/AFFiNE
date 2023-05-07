import { execSync } from 'node:child_process';

export default async function () {
  execSync('yarn ts-node-esm scripts/', {
    cwd: path.join(__dirname, '..'),
  });
}
