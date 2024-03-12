import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SELF_HOST_CONFIG_DIR = '/root/.affine/config';
/**
 * @type {Array<{ from: string; to?: string, modifier?: (content: string): string }>}
 */
const configFiles = [
  { from: './.env.example', to: '.env' },
  { from: './dist/config/affine.js', modifier: configCleaner },
  { from: './dist/config/affine.env.js', modifier: configCleaner },
];

function configCleaner(content) {
  return content.replace(
    /(^\/\/#.*$)|(^\/\/\s+TODO.*$)|("use\sstrict";?)|(^.*eslint-disable.*$)/gm,
    ''
  );
}

function prepare() {
  fs.mkdirSync(SELF_HOST_CONFIG_DIR, { recursive: true });

  for (const { from, to, modifier } of configFiles) {
    const targetFileName = to ?? path.parse(from).base;
    const targetFilePath = path.join(SELF_HOST_CONFIG_DIR, targetFileName);
    if (!fs.existsSync(targetFilePath)) {
      console.log(`creating config file [${targetFilePath}].`);
      if (modifier) {
        const content = fs.readFileSync(from, 'utf-8');
        fs.writeFileSync(targetFilePath, modifier(content), 'utf-8');
      } else {
        fs.cpSync(from, targetFilePath, {
          force: false,
        });
      }
    }
  }
}

function runPredeployScript() {
  console.log('running predeploy script.');
  execSync('yarn predeploy', {
    encoding: 'utf-8',
    env: process.env,
    stdio: 'inherit',
  });
}

prepare();
runPredeployScript();
