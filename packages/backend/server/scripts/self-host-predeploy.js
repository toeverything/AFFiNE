import { execSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const SELF_HOST_CONFIG_DIR = `${homedir()}/.affine/config`;

function generatePrivateKey() {
  const key = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  }).privateKey.export({
    type: 'sec1',
    format: 'pem',
  });

  if (key instanceof Buffer) {
    return key.toString('utf-8');
  }

  return key;
}

/**
 * @type {Array<{ to: string; generator: () => string }>}
 */
const files = [{ to: 'private.key', generator: generatePrivateKey }];

function prepare() {
  fs.mkdirSync(SELF_HOST_CONFIG_DIR, { recursive: true });

  for (const { to, generator } of files) {
    const targetFilePath = path.join(SELF_HOST_CONFIG_DIR, to);
    if (!fs.existsSync(targetFilePath)) {
      console.log(`creating config file [${targetFilePath}].`);
      fs.writeFileSync(targetFilePath, generator(), 'utf-8');
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

function fixFailedMigrations() {
  console.log('fixing failed migrations.');
  const maybeFailedMigrations = [
    '20250521083048_fix_workspace_embedding_chunk_primary_key',
  ];
  for (const migration of maybeFailedMigrations) {
    try {
      execSync(`yarn prisma migrate resolve --rolled-back ${migration}`, {
        encoding: 'utf-8',
        env: process.env,
        stdio: 'pipe',
      });
      console.log(`migration [${migration}] has been rolled back.`);
    } catch (err) {
      if (
        err.message.includes(
          'cannot be rolled back because it is not in a failed state'
        ) ||
        err.message.includes(
          'cannot be rolled back because it was never applied'
        ) ||
        err.message.includes(
          'called markMigrationRolledBack on a database without migrations table'
        )
      ) {
        // migration has been rolled back, skip it
        continue;
      }
      // ignore other errors
      console.log(
        `migration [${migration}] rolled back failed. ${err.message}`
      );
    }
  }
}

prepare();
fixFailedMigrations();
runPredeployScript();
