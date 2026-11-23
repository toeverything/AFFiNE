#!/usr/bin/env node
// Boots two isolated, identical @affine/server instances of one server checkout
// and replays scenarios/v0275-self-parity.json against them with the parity
// harness: protocol, full PostgreSQL user-table snapshot, Redis Pub/Sub and SMTP
// must show zero differences, and each side must meet the scenario's `require`
// checks. Two injected faults (a tampered right-side database row on the live
// targets, and a tampered GraphQL field in the recorded right-side protocol)
// must each be reported at exactly one expected path.
//
//   node tools/parity-harness/scripts/run-v0275-self-parity.mjs \
//     [--server-root DIR] [--server-sha SHA] \
//     [--out .artifacts/v0275-self-parity] [--record FILE]
//
// --server-root is the checkout whose packages/backend/server, migrations and
// tools/cli/register.js run (default: this one); affine-test-env and the
// harness always come from this checkout. Its commit is recorded: from git, or
// --server-sha when the checkout has no .git.
// --record FILE is written (atomically) only when everything passed: the
// server SHA and the equal run's left/right sides, the input of
// `parity-harness compare` and of tests/fixtures/v0275-self-parity.recorded.json.
//
// Needs, in the server checkout, `yarn install`, a built
// packages/backend/native/server-native.node and `prisma generate`; Docker or
// AFFINE_TEST_CONTAINER_CLI=podman. Each run gets its own directory under
// --out; each side gets its own leased PostgreSQL clone of the migration
// template, its own Redis container, its own SMTP capture port and its own
// HOME; both share one signing key and one external URL so that nothing but
// process-local identity differs. Exit 0 only when the equal run is equal and
// healthy, every fault is caught and every cleanup succeeded.

import { spawn } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const HARNESS = join(ROOT, 'tools/parity-harness');
const SCENARIO = join(HARNESS, 'scenarios/v0275-self-parity.json');
const EXTERNAL_URL = 'http://affine.parity.test';
const BOOT_TIMEOUT_MS = 180_000;
const TAMPERED_NAME = 'Parity Admin (tampered)';

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: '.artifacts/v0275-self-parity' },
    record: { type: 'string' },
    'server-root': { type: 'string', default: '.' },
    'server-sha': { type: 'string' },
  },
});
const SERVER_ROOT = resolve(ROOT, args['server-root']);
const SERVER = join(SERVER_ROOT, 'packages/backend/server');
// One directory per run, so concurrent runs never share env files or HOMEs.
const OUT = join(
  resolve(ROOT, args.out),
  `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`
);
mkdirSync(OUT, { recursive: true });

const log = message => console.log(`[self-parity] ${message}`);
const cleanups = [];

function run(
  command,
  argv,
  { cwd = ROOT, env = process.env, allow = [0] } = {}
) {
  return new Promise((done, fail) => {
    const child = spawn(command, argv, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let stdout = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.on('error', fail);
    child.on('exit', code =>
      allow.includes(code)
        ? done({ code, stdout })
        : fail(
            new Error(
              `${command} ${argv.join(' ')} exited with ${code}\n${stdout}`
            )
          )
    );
  });
}
const keyValues = text =>
  Object.fromEntries(
    text
      .split('\n')
      .map(line => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
      .filter(Boolean)
      .map(([, k, v]) => [k, v])
  );

const cargoEnv = { ...process.env, CARGO_ENCODED_RUSTFLAGS: '' };
// Separate Redis servers are required: Pub/Sub ignores logical databases and
// key prefixes, so an explicit shared AFFINE_TEST_REDIS_URL cannot isolate.
delete cargoEnv.AFFINE_TEST_REDIS_URL;
const testEnv = (argv, env = cargoEnv) =>
  run(
    'cargo',
    [
      'run',
      '--locked',
      '--quiet',
      '-p',
      'test-db-harness',
      '--bin',
      'affine-test-env',
      '--',
      ...argv,
    ],
    { cwd: join(ROOT, 'packages/backend'), env }
  );
const harness = argv =>
  run(
    'cargo',
    [
      'run',
      '--locked',
      '--quiet',
      '--manifest-path',
      join(HARNESS, 'Cargo.toml'),
      '--',
      ...argv,
    ],
    { env: cargoEnv, allow: [0, 1] }
  );

function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

function serverEnv(side, extra) {
  // A self-hosted server reads ~/.affine/config/config.json; each side has
  // its own HOME, so configuration written at runtime stays on its side.
  const home = join(OUT, `home-${side.name}`);
  const config = join(home, '.affine/config/config.json');
  if (!existsSync(config)) {
    mkdirSync(dirname(config), { recursive: true });
    writeFileSync(
      config,
      JSON.stringify({
        deployment: { type: 'selfhosted' },
        server: { name: 'AFFiNE Parity' },
      })
    );
  }
  const redis = new URL(side.redis);
  return {
    PATH: process.env.PATH,
    HOME: home,
    NODE_ENV: 'production',
    SERVER_FLAVOR: 'allinone',
    DATABASE_URL: side.database,
    REDIS_SERVER_HOST: redis.hostname,
    REDIS_SERVER_PORT: redis.port || '6379',
    AFFINE_SERVER_EXTERNAL_URL: EXTERNAL_URL,
    LISTEN_ADDR: '127.0.0.1',
    AFFINE_SERVER_PORT: String(side.port),
    AFFINE_PRIVATE_KEY: side.privateKey,
    MAILER_HOST: '127.0.0.1',
    MAILER_PORT: String(side.smtpPort),
    MAILER_SERVERNAME: 'parity.affine.test',
    MAILER_SENDER: 'AFFiNE Parity <noreply@affine.test>',
    ...extra,
  };
}
const serverArgs = command => [
  `--import=${join(SERVER_ROOT, 'tools/cli/register.js')}`,
  join(SERVER, 'src/index.ts'),
  ...command,
];

async function startServer(side) {
  const logFile = join(OUT, `server-${side.name}.log`);
  const output = createWriteStream(logFile);
  const child = spawn(process.execPath, serverArgs([]), {
    cwd: SERVER,
    env: serverEnv(side),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(output);
  child.stderr.pipe(output);
  let exited = null;
  child.on('exit', code => (exited = code ?? 'signal'));
  cleanups.push(
    () =>
      new Promise(done => {
        if (exited !== null) return done();
        child.once('exit', done);
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 10_000).unref();
      })
  );
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  for (;;) {
    if (exited !== null)
      throw new Error(
        `${side.name} server exited (${exited}) during boot; see ${logFile}`
      );
    try {
      const response = await fetch(`http://127.0.0.1:${side.port}/info`);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline)
      throw new Error(
        `${side.name} server not ready after ${BOOT_TIMEOUT_MS} ms; see ${logFile}`
      );
    await new Promise(r => setTimeout(r, 250));
  }
}

async function tamperUserName(side) {
  // The server's own generated Prisma client; no extra driver dependency.
  const script = `
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    const n = await db.$executeRaw\`UPDATE users SET name = \${process.env.TAMPERED_NAME} WHERE email = 'parity-admin@affine.test'\`;
    await db.$disconnect();
    if (n !== 1) throw new Error('expected to tamper exactly one row, got ' + n);`;
  await run(process.execPath, ['--input-type=module', '-e', script], {
    cwd: SERVER,
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: side.database,
      TAMPERED_NAME: TAMPERED_NAME,
    },
  });
}

function expectFault(name, report, expectedPath) {
  const paths = report.differences.map(d => d.path);
  const ok = paths.length === 1 && paths[0] === expectedPath;
  log(
    `fault ${name}: ${ok ? 'RED as expected' : 'NOT DETECTED CORRECTLY'} at ${JSON.stringify(paths)}`
  );
  return { name, expected: expectedPath, reported: paths, detected: ok };
}

async function serverSha() {
  if (args['server-sha']) return args['server-sha'];
  try {
    return (
      await run('git', ['rev-parse', 'HEAD'], { cwd: SERVER_ROOT })
    ).stdout.trim();
  } catch {
    throw new Error(`${SERVER_ROOT} has no git metadata; pass --server-sha`);
  }
}

async function main() {
  const sha = await serverSha();
  if (!/^[0-9a-f]{40}$/.test(sha))
    throw new Error(`server SHA ${sha} is not a full commit id`);
  if (args.record && existsSync(join(SERVER_ROOT, '.git'))) {
    const dirty = (
      await run('git', ['status', '--porcelain'], { cwd: SERVER_ROOT })
    ).stdout.trim();
    if (dirty) {
      throw new Error(
        `refusing --record from dirty server checkout ${SERVER_ROOT}:\n${dirty}`
      );
    }
  }
  log(`server ${SERVER_ROOT} at ${sha}; run directory ${OUT}`);
  const migrations = join(SERVER, 'migrations');
  const sides = [{ name: 'left' }, { name: 'right' }];
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  for (const side of sides) {
    const envFile = join(OUT, `test-env-${side.name}.env`);
    writeFileSync(envFile, '');
    const up = keyValues(
      (await testEnv(['up', '--migrations', migrations, '--env-file', envFile]))
        .stdout
    );
    cleanups.push(() => testEnv(['down', '--env-file', envFile]));
    side.redis = up.AFFINE_TEST_REDIS_URL;
    side.admin = up.AFFINE_TEST_PG_URL;
    side.template = up.AFFINE_TEST_PG_TEMPLATE;
  }
  for (const side of sides) {
    const env = { ...cargoEnv, AFFINE_TEST_PG_URL: side.admin };
    const lease = keyValues(
      (
        await testEnv(
          ['lease', '--template', side.template, '--ttl-secs', '1800'],
          env
        )
      ).stdout
    );
    cleanups.push(() =>
      testEnv(
        [
          'release',
          '--db',
          lease.AFFINE_TEST_DB_NAME,
          '--token',
          lease.AFFINE_TEST_DB_TOKEN,
        ],
        env
      )
    );
    Object.assign(side, {
      database: lease.AFFINE_TEST_DB_URL,
      port: await freePort(),
      smtpPort: await freePort(),
      privateKey,
    });
    log(
      `${side.name}: db ${lease.AFFINE_TEST_DB_NAME}, redis ${side.redis}, http :${side.port}, smtp :${side.smtpPort}`
    );
  }

  // Data migrations and the cutover check as the self-host predeploy runs
  // them, then the operator step that enables protocol v2 workspace sync.
  await Promise.all(
    sides.map(async side => {
      for (const command of [
        'run',
        'validate-cutover',
        'activate-workspace-lifecycle',
      ])
        await run(process.execPath, serverArgs([command]), {
          cwd: SERVER,
          env: serverEnv(side, { SERVER_FLAVOR: 'script' }),
        });
    })
  );
  // A production server renders the web shell from the bundled frontend in
  // packages/backend/server/static (git-ignored, filled by a web build). The
  // scenario exercises the API only; without a build both sides share one
  // empty manifest (identical on both sides), removed again afterwards.
  for (const dir of ['static', 'static/mobile']) {
    const manifest = join(SERVER, dir, 'assets-manifest.json');
    if (existsSync(manifest)) continue;
    const created = mkdirSync(dirname(manifest), { recursive: true });
    cleanups.push(() => rmSync(created ?? manifest, { recursive: true }));
    writeFileSync(
      manifest,
      JSON.stringify({
        js: [],
        css: [],
        publicPath: '/',
        gitHash: '',
        description: '',
      })
    );
    log(`no web build: wrote an empty ${dir}/assets-manifest.json`);
  }
  const booted = Date.now();
  await Promise.all(sides.map(startServer));
  log(`both servers ready in ${Date.now() - booted} ms`);

  const target = side => ({
    base_url: `http://127.0.0.1:${side.port}`,
    postgres: side.database,
    redis: side.redis,
    smtp_bind: `127.0.0.1:${side.smtpPort}`,
  });
  const scenario = JSON.parse(readFileSync(SCENARIO, 'utf8'));
  scenario.left_target = target(sides[0]);
  scenario.right_target = target(sides[1]);
  const scenarioFile = join(OUT, 'scenario.json');
  const reportFile = join(OUT, 'report.json');
  writeFileSync(scenarioFile, JSON.stringify(scenario, null, 2));

  const equal = await harness([scenarioFile, reportFile]);
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  const tables = Object.entries(report.left.database);
  const summary = {
    server_sha: sha,
    equal: {
      exit: equal.code,
      differences: report.differences.length,
      protocol_steps: report.left.protocol.length,
      tables: tables.length,
      tables_with_rows: tables.filter(([, rows]) => rows.length).length,
      rows: tables.reduce((n, [, rows]) => n + rows.length, 0),
      smtp_messages: report.left.effects.smtp.length,
      redis_messages: report.left.effects.redis.length,
      symbols: report.symbols.length,
    },
    faults: [],
  };
  log(`equal run: ${JSON.stringify(summary.equal)}`);
  for (const d of report.differences.slice(0, 20))
    log(`  difference ${d.path}: ${d.reason}`);

  // Fault 1: one tampered row on the live right database.
  await tamperUserName(sides[1]);
  const faultScenario = {
    ...scenario,
    left_target: {
      base_url: scenario.left_target.base_url,
      postgres: sides[0].database,
    },
    right_target: {
      base_url: scenario.right_target.base_url,
      postgres: sides[1].database,
    },
    expected_smtp_count: null,
    require: [],
    steps: [scenario.steps[0]],
  };
  const faultScenarioFile = join(OUT, 'fault-db-scenario.json');
  const faultReportFile = join(OUT, 'fault-db-report.json');
  writeFileSync(faultScenarioFile, JSON.stringify(faultScenario, null, 2));
  const dbFault = await harness([faultScenarioFile, faultReportFile]);
  summary.faults.push({
    exit: dbFault.code,
    ...expectFault(
      'database row',
      JSON.parse(readFileSync(faultReportFile, 'utf8')),
      '/database/public.users/0/name'
    ),
  });

  // Fault 2: one tampered GraphQL field in the recorded right-side protocol.
  const step = scenario.steps.findIndex(s => s.name === 'current_user');
  const tampered = structuredClone(report);
  tampered.right.protocol[step].body.value.data.currentUser.name =
    TAMPERED_NAME;
  const tamperedFile = join(OUT, 'fault-graphql-recorded.json');
  const graphqlReportFile = join(OUT, 'fault-graphql-report.json');
  writeFileSync(tamperedFile, JSON.stringify(tampered));
  const graphqlFault = await harness([
    'compare',
    scenarioFile,
    tamperedFile,
    graphqlReportFile,
  ]);
  summary.faults.push({
    exit: graphqlFault.code,
    ...expectFault(
      'graphql field',
      JSON.parse(readFileSync(graphqlReportFile, 'utf8')),
      `/protocol/${step}/current_user/body/value/data/currentUser/name`
    ),
  });

  writeFileSync(
    join(OUT, 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n'
  );
  const passed =
    equal.code === 0 &&
    summary.equal.differences === 0 &&
    summary.faults.every(f => f.detected && f.exit === 1);
  log(
    passed
      ? 'PASS: 0 differences, every requirement met, every fault detected'
      : `FAIL: see ${OUT}/summary.json and report.json`
  );
  let pendingRecord = null;
  if (passed && args.record) {
    const record = resolve(ROOT, args.record);
    const partial = `${record}.${process.pid}.tmp`;
    writeFileSync(
      partial,
      JSON.stringify(
        { server_sha: sha, left: report.left, right: report.right },
        null,
        1
      ) + '\n'
    );
    pendingRecord = { partial, record };
  }
  return { passed, pendingRecord };
}

let passed = false;
let pendingRecord = null;
try {
  ({ passed, pendingRecord } = await main());
} catch (error) {
  console.error(error);
} finally {
  for (const cleanup of cleanups.reverse()) {
    try {
      await cleanup();
    } catch (error) {
      console.error(`cleanup failed: ${error}`);
      passed = false;
    }
  }
}
if (pendingRecord) {
  if (passed) {
    renameSync(pendingRecord.partial, pendingRecord.record);
    log(`recorded ${pendingRecord.record}`);
  } else {
    rmSync(pendingRecord.partial, { force: true });
  }
}
process.exit(passed ? 0 : 1);
