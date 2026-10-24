import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { snapshot, test } from 'node:test';

snapshot.setDefaultSnapshotSerializers([
  value => (typeof value === 'string' ? value : JSON.stringify(value, null, 2)),
]);

const config = {
  deployment: { type: 'cloud' },
  db: { datasourceUrl: 'postgresql://user:p%40ss@sql-proxy:5432/affine' },
  redis: { host: 'redis', password: 'comma,quote"dollar$backtick`' },
  crypto: { privateKey: 'test-key\nsecond-line' },
  server: {
    host: 'affine.example',
    hosts: ['affine.example', 'alias.example'],
    https: true,
    path: '',
  },
  indexer: {
    provider: {
      type: 'elasticsearch',
      endpoint: 'https://search.example',
      apiKey: 'test-key',
    },
  },
  payment: { stripe: { accountId: 'acct_test', environment: 'test' } },
};

for (const [channel, namespace] of Object.entries({
  stable: 'production',
  beta: 'beta',
  canary: 'dev',
  internal: 'internal',
})) {
  test(`${channel}: config reaches every role and migration without shell interpolation`, t => {
    const directory = mkdtempSync(join(tmpdir(), 'affine-deploy-test-'));
    try {
      writeFileSync(
        join(directory, 'helm'),
        `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const file = args[args.indexOf('--values') + 1];
fs.appendFileSync(process.env.DEPLOY_TEST_LOG, JSON.stringify({args, mode: fs.statSync(file).mode & 0o777, values: JSON.parse(fs.readFileSync(file, 'utf8'))}) + '\\n');
`,
        { mode: 0o700 }
      );
      const log = join(directory, 'calls.jsonl');
      const result = spawnSync(
        process.execPath,
        ['.github/actions/deploy/deploy.mjs'],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: directory + delimiter + process.env.PATH,
            DEPLOY_TEST_LOG: log,
            BUILD_TYPE: channel,
            APP_VERSION: '0.27.5-beta.2',
            GIT_SHORT_HASH: 'abcdef',
            SERVER_CONFIG: JSON.stringify(config),
            GCLOUD_CONNECTION_NAME: 'project:region:database',
            CLOUD_SQL_IAM_ACCOUNT: 'sql@project.iam.gserviceaccount.com',
            APP_IAM_ACCOUNT: 'app@project.iam.gserviceaccount.com',
            STATIC_IP_NAME: 'affine-ip',
            PRODUCTION_FRONT_REPLICA: '2',
            PRODUCTION_GRAPHQL_REPLICA: '2',
            BETA_FRONT_REPLICA: '1',
            BETA_GRAPHQL_REPLICA: '1',
          },
        }
      );
      assert.equal(result.status, 0, result.stderr);
      const calls = readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      assert.equal(calls[0].mode, 0o600);
      assert.equal(
        existsSync(calls[0].args[calls[0].args.indexOf('--values') + 1]),
        false
      );
      const valuesFile = join(directory, 'values.json');
      writeFileSync(valuesFile, JSON.stringify(calls[0].values));
      const rendered = spawnSync(
        'helm',
        [
          'template',
          'affine',
          '.github/helm/affine',
          '--namespace',
          namespace,
          '--values',
          valuesFile,
        ],
        { encoding: 'utf8' }
      );
      assert.equal(rendered.status, 0, rendered.stderr);
      t.assert.snapshot({
        commands: calls.map(call =>
          call.args.map(arg =>
            arg === call.args[call.args.indexOf('--values') + 1]
              ? '<values.json>'
              : arg
          )
        ),
        values: calls[0].values,
      });
      if (channel === 'beta') t.assert.snapshot(rendered.stdout);
      assert.ok(!result.stdout.includes(config.crypto.privateKey));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const invalid of [
  '',
  '{invalid-json',
  JSON.stringify({ ...config, deployment: { type: 'selfhosted' } }),
]) {
  test(`invalid cloud config is rejected before Helm: ${invalid.slice(0, 20)}`, () => {
    const result = spawnSync(
      process.execPath,
      [resolve('.github/actions/deploy/deploy.mjs')],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          BUILD_TYPE: 'beta',
          APP_VERSION: '0.27.5-beta.2',
          GIT_SHORT_HASH: 'abcdef',
          SERVER_CONFIG: invalid,
        },
      }
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SERVER_CONFIG/);
  });
}
