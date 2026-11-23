#!/usr/bin/env node
// Boots a real frozen @affine/server (v0.27.5) on the left and the pure-Rust
// `affine-server --role allinone` binary on the right, then runs:
//   Phase 1:  Full-stack 3-way differential parity (protocol, full PostgreSQL
//             97-table snapshot, Redis Pub/Sub and SMTP = 0 differences) +
//             explicit originChannel verification ("production" vs "v2:production").
//   Phase 1B: Live Magic-Link cross-generation end-to-end parity (POST /api/auth/sign-in ->
//             inspect queued mail_deliveries & OTP -> POST /api/auth/magic-link ->
//             GET /api/auth/session -> POST /api/auth/sign-out -> 97-table 0-diff snapshot).
//   Faults:   Live DB row & recorded GraphQL fault injection (both must go RED).
//   Phase 2:  Live shared-PG16 + shared-Redis-7 cross-generation Socket.IO
//             bidirectional real-time sync test between @affine/server and
//             `affine-server --role allinone` using real `socket.io-client@4.8.3`
//             with distinct incremental Yjs updates in Direction B.
//
//   node tools/parity-harness/scripts/run-v0275-vs-vnew-parity.mjs \
//     --server-root DIR [--expected-old-sha SHA] [--affine-server-bin PATH] \
//     [--out .artifacts/v0275-vs-vnew-parity] [--skip-coexistence]

import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const HARNESS = join(ROOT, 'tools/parity-harness');
const SCENARIO = join(HARNESS, 'scenarios/v0275-vs-vnew-parity.json');
const DEFAULT_OLD_SHA = 'c2929acf2d24456c40c2df164e068d1d3d59d7fd';
const EXTERNAL_URL = 'http://affine.parity.test';
const BOOT_TIMEOUT_MS = 180_000;
const TAMPERED_NAME = 'Parity Admin (tampered)';
const GOLDEN_UPDATE_B64 =
  'AQIBACgBBG1ldGEFdGl0bGUBdwZwYXJpdHkEAQdjb250ZW50DGhlbGxvIHBhcml0eQA=';

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: '.artifacts/v0275-vs-vnew-parity' },
    'server-root': { type: 'string', default: '.' },
    'expected-old-sha': { type: 'string', default: DEFAULT_OLD_SHA },
    'affine-server-bin': { type: 'string' },
    'skip-coexistence': { type: 'boolean', default: false },
  },
});

const SERVER_ROOT = resolve(ROOT, args['server-root']);
const SERVER = join(SERVER_ROOT, 'packages/backend/server');
const OUT = join(
  resolve(ROOT, args.out),
  `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`
);
mkdirSync(OUT, { recursive: true });

const log = message => console.log(`[v0275-vs-vnew] ${message}`);
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

async function verifyFrozenServerRoot() {
  const headRes = await run('git', ['rev-parse', 'HEAD'], { cwd: SERVER_ROOT });
  const actualSha = headRes.stdout.trim();
  const expectedSha = args['expected-old-sha'].trim();
  if (actualSha !== expectedSha) {
    throw new Error(
      `--server-root HEAD mismatch: expected ${expectedSha}, got ${actualSha} (pass --expected-old-sha to override)`
    );
  }
  const statusRes = await run('git', ['status', '--porcelain'], {
    cwd: SERVER_ROOT,
  });
  if (statusRes.stdout.trim().length > 0) {
    throw new Error(
      `--server-root working tree is dirty:\n${statusRes.stdout.trim()}`
    );
  }
  log(`verified frozen --server-root HEAD=${actualSha} (clean)`);
}

function serverEnv(side, extra = {}) {
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

const oldServerArgs = command => [
  `--import=${join(SERVER_ROOT, 'tools/cli/register.js')}`,
  join(SERVER, 'src/index.ts'),
  ...command,
];

async function waitForReady(side, child, logFile) {
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

async function startOldServer(side) {
  const logFile = join(OUT, `server-${side.name}.log`);
  const output = createWriteStream(logFile);
  const child = spawn(process.execPath, oldServerArgs([]), {
    cwd: SERVER,
    env: serverEnv(side),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(output);
  child.stderr.pipe(output);
  await waitForReady(side, child, logFile);
}

async function startNewServer(side, binPath) {
  const logFile = join(OUT, `server-${side.name}.log`);
  const output = createWriteStream(logFile);
  const child = spawn(binPath, [], {
    cwd: ROOT,
    env: serverEnv(side),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(output);
  child.stderr.pipe(output);
  await waitForReady(side, child, logFile);
}

async function ensureNewServerBinary() {
  if (args['affine-server-bin']) {
    const p = resolve(ROOT, args['affine-server-bin']);
    if (!existsSync(p)) throw new Error(`affine-server binary not found: ${p}`);
    return p;
  }
  log('building affine-server binary...');
  await run(
    'cargo',
    ['build', '--locked', '--bin', 'affine-server', '-p', 'affine-server'],
    { cwd: join(ROOT, 'packages/backend'), env: cargoEnv }
  );
  const targetDir = process.env.CARGO_TARGET_DIR
    ? resolve(ROOT, process.env.CARGO_TARGET_DIR)
    : join(ROOT, 'packages/backend/target');
  const binPath = join(targetDir, 'debug/affine-server');
  if (!existsSync(binPath)) {
    throw new Error(`compiled affine-server binary not found at ${binPath}`);
  }
  return binPath;
}

async function queryLatestSignUpDelivery(databaseUrl) {
  const script = `
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    const rows = await db.$queryRaw\`
      SELECT mail_name, mail_class, priority, status, retention_state, attempt_count, provider_message_id
      FROM mail_deliveries
      WHERE mail_name = 'SignUp'
      ORDER BY created_at DESC
      LIMIT 1
    \`;
    await db.$disconnect();
    console.log(JSON.stringify(rows[0] ?? null));`;
  const res = await run(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      cwd: SERVER,
      env: {
        PATH: process.env.PATH,
        DATABASE_URL: databaseUrl,
      },
    }
  );
  return JSON.parse(res.stdout.trim());
}

function startSmtpCaptureServer(port) {
  const messages = [];
  const waiters = [];
  const notify = msg => {
    messages.push(msg);
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter(msg);
    }
  };
  const server = createServer(socket => {
    socket.setEncoding('utf8');
    socket.write('220 parity.smtp.test ESMTP\r\n');
    let buf = '';
    let inData = false;
    let dataBuf = '';
    socket.on('data', chunk => {
      buf += chunk;
      while (buf.length > 0) {
        if (inData) {
          const endIdx = buf.indexOf('\r\n.\r\n');
          if (endIdx === -1) {
            // Keep last 4 bytes in `buf` in case the delimiter spans chunks.
            if (buf.length > 4) {
              dataBuf += buf.slice(0, buf.length - 4);
              buf = buf.slice(buf.length - 4);
            }
            break;
          }
          dataBuf += buf.slice(0, endIdx);
          buf = buf.slice(endIdx + 5);
          inData = false;
          notify(dataBuf);
          dataBuf = '';
          socket.write('250 2.0.0 OK\r\n');
        } else {
          const nl = buf.indexOf('\r\n');
          if (nl === -1) break;
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          const upper = line.toUpperCase();
          if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
            socket.write('250-parity.smtp.test\r\n250 OK\r\n');
          } else if (
            upper.startsWith('MAIL FROM') ||
            upper.startsWith('RCPT TO') ||
            upper.startsWith('RSET') ||
            upper.startsWith('NOOP')
          ) {
            socket.write('250 OK\r\n');
          } else if (upper === 'DATA') {
            inData = true;
            dataBuf = '';
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
          } else if (upper === 'QUIT') {
            socket.write('221 Bye\r\n');
            socket.end();
            break;
          } else {
            socket.write('250 OK\r\n');
          }
        }
      }
    });
  });

  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => {
      done({
        waitForMessage(timeoutMs) {
          if (messages.length > 0) return Promise.resolve(messages[0]);
          return new Promise((resolveMsg, rejectMsg) => {
            const timer = setTimeout(
              () =>
                rejectMsg(
                  new Error(`timeout waiting for SMTP capture on :${port}`)
                ),
              timeoutMs
            );
            waiters.push(msg => {
              clearTimeout(timer);
              resolveMsg(msg);
            });
          });
        },
        close() {
          return new Promise(resolveClose =>
            server.close(() => resolveClose())
          );
        },
      });
    });
  });
}

function parseMagicLinkEmail(rawEmail) {
  const headerEnd = rawEmail.indexOf('\r\n\r\n');
  const headerBlock = headerEnd >= 0 ? rawEmail.slice(0, headerEnd) : rawEmail;
  const subjectMatch = headerBlock.match(/^Subject:\s*(.+)$/im);
  const subject = subjectMatch ? subjectMatch[1].trim() : '';
  const unfolded = rawEmail.replace(/=\r\n/g, '').replace(/=\n/g, '');
  const tokenMatch =
    unfolded.match(/token=3D(\d{6})/) || unfolded.match(/token=(\d{6})/);
  const otp = tokenMatch ? tokenMatch[1] : null;
  return { subject, otp };
}

async function tamperUserName(side) {
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

function parseSetCookies(headers) {
  const raw = headers.getSetCookie();
  const map = new Map();
  for (const entry of raw) {
    const first = entry.split(';')[0];
    const eq = first.indexOf('=');
    if (eq > 0) {
      map.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
    }
  }
  return {
    raw,
    map,
    header: [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
  };
}

async function runMagicLinkPhase(leftBase, rightBase, newBin, baseScenario) {
  log(
    'Phase 1B: booting isolated fresh DB pair for live dual-side SMTP Magic-Link parity (waiting naturally for worker delivery)...'
  );
  const mlLeft = {
    name: 'ml-left-v0275',
    redis: leftBase.redis,
    admin: leftBase.admin,
    template: leftBase.template,
    privateKey: leftBase.privateKey,
  };
  const mlRight = {
    name: 'ml-right-vnew',
    redis: rightBase.redis,
    admin: rightBase.admin,
    template: rightBase.template,
    privateKey: rightBase.privateKey,
  };
  for (const side of [mlLeft, mlRight]) {
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
    side.database = lease.AFFINE_TEST_DB_URL;
    side.port = await freePort();
    side.smtpPort = await freePort();
    for (const command of [
      'run',
      'validate-cutover',
      'activate-workspace-lifecycle',
    ]) {
      await run(process.execPath, oldServerArgs([command]), {
        cwd: SERVER,
        env: serverEnv(side, { SERVER_FLAVOR: 'script' }),
      });
    }
  }
  await Promise.all([startOldServer(mlLeft), startNewServer(mlRight, newBin)]);

  const email = 'magic-parity@affine.test';
  const nonce = 'nonce-ml-1';
  const callbackUrl = '/magic-link?redirect_uri=%2Fworkspace%2Fdemo';
  const smtpWaitMs = 75_000;

  const [leftSmtp, rightSmtp] = await Promise.all([
    startSmtpCaptureServer(mlLeft.smtpPort),
    startSmtpCaptureServer(mlRight.smtpPort),
  ]);

  try {
    const runSide = async (side, smtpCapture) => {
      const base = `http://127.0.0.1:${side.port}`;
      const prepResp = await fetch(`${base}/api/auth/sign-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, callbackUrl, client_nonce: nonce }),
      });
      const prepJson = await prepResp.json();
      if (prepResp.status !== 200 || prepJson?.email !== email) {
        throw new Error(
          `Phase 1B ${side.name} sign-in (magic-link) failed: status=${prepResp.status} body=${JSON.stringify(prepJson)}`
        );
      }

      const rawEmail = await smtpCapture.waitForMessage(smtpWaitMs);
      const { subject, otp } = parseMagicLinkEmail(rawEmail);
      if (!subject || !otp || !/^\d{6}$/.test(otp)) {
        throw new Error(
          `Phase 1B ${side.name} failed to parse subject/OTP from captured SMTP email: subject=${JSON.stringify(subject)} otp=${JSON.stringify(otp)}`
        );
      }

      // Wait until the worker finalizes the `mail_deliveries` row to `sent` + `anonymized`.
      const deadline = Date.now() + 15_000;
      let delivery = null;
      while (Date.now() < deadline) {
        delivery = await queryLatestSignUpDelivery(side.database);
        if (
          delivery?.status === 'sent' &&
          delivery?.retention_state === 'anonymized'
        ) {
          break;
        }
        await new Promise(r => setTimeout(r, 200));
      }
      if (
        !delivery ||
        delivery.mail_name !== 'SignUp' ||
        delivery.mail_class !== 'auth' ||
        delivery.priority !== 'critical' ||
        delivery.status !== 'sent' ||
        delivery.retention_state !== 'anonymized' ||
        delivery.attempt_count !== 1
      ) {
        throw new Error(
          `Phase 1B ${side.name} unexpected sent mail_deliveries row: ${JSON.stringify(delivery)}`
        );
      }

      const compResp = await fetch(`${base}/api/auth/magic-link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, token: otp, client_nonce: nonce }),
      });
      const compJson = await compResp.json();
      const cookies = parseSetCookies(compResp.headers);
      if (
        compResp.status !== 201 ||
        typeof compJson?.id !== 'string' ||
        !cookies.map.get('affine_session') ||
        !cookies.map.get('affine_csrf_token') ||
        !cookies.map.get('affine_user_id')
      ) {
        throw new Error(
          `Phase 1B ${side.name} POST /api/auth/magic-link failed: status=${compResp.status} body=${JSON.stringify(compJson)} cookies=${JSON.stringify(cookies.raw)}`
        );
      }

      const sessResp = await fetch(`${base}/api/auth/session`, {
        headers: { cookie: cookies.header },
      });
      const sessJson = await sessResp.json();
      if (
        sessResp.status !== 200 ||
        sessJson?.user?.email !== email ||
        sessJson?.user?.emailVerified !== true ||
        sessJson?.user?.hasPassword !== false
      ) {
        throw new Error(
          `Phase 1B ${side.name} GET /api/auth/session mismatch: status=${sessResp.status} body=${JSON.stringify(sessJson)}`
        );
      }

      const signOutResp = await fetch(`${base}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          cookie: cookies.header,
          'x-affine-csrf-token': cookies.map.get('affine_csrf_token'),
        },
      });
      const signOutJson = await signOutResp.json();
      if (signOutResp.status !== 200 || JSON.stringify(signOutJson) !== '{}') {
        throw new Error(
          `Phase 1B ${side.name} POST /api/auth/sign-out mismatch: status=${signOutResp.status} body=${JSON.stringify(signOutJson)}`
        );
      }
      return { userId: compJson.id, subject };
    };

    const [leftRes, rightRes] = await Promise.all([
      runSide(mlLeft, leftSmtp),
      runSide(mlRight, rightSmtp),
    ]);
    if (leftRes.subject !== rightRes.subject) {
      throw new Error(
        `Phase 1B SMTP Subject mismatch: left=${JSON.stringify(leftRes.subject)} right=${JSON.stringify(rightRes.subject)}`
      );
    }
    log(
      `Phase 1B dual-side SMTP captured & verified (subject=${JSON.stringify(leftRes.subject)})`
    );
  } finally {
    await Promise.all([leftSmtp.close(), rightSmtp.close()]);
  }

  // Snapshot and compare PostgreSQL tables via parity-harness (excluding
  // ephemeral minutely cron telemetry/checkpoint tables that v0.27.5 ticks at :00).
  const snapScenario = {
    ...baseScenario,
    left_target: {
      base_url: `http://127.0.0.1:${mlLeft.port}`,
      postgres: mlLeft.database,
    },
    right_target: {
      base_url: `http://127.0.0.1:${mlRight.port}`,
      postgres: mlRight.database,
    },
    ignore_tables: [
      '_prisma_migrations',
      'native_schema_migrations',
      'runtime_rolling_quota_counters',
      'storage_reconciliation_checkpoints',
      'sync_active_users_minutely',
    ],
    expected_smtp_count: null,
    require: [],
    dynamic: [
      ...baseScenario.dynamic,
      {
        path: '^/database/public\\.(runtime_states|mail_deliveries)/[0-9]+/(dedupe_key|payload|recipient_hash|token_hash|provider_message_id|provider_response)',
        kind: 'token',
      },
    ],
    steps: [baseScenario.steps[0]],
  };
  const snapScenarioFile = join(OUT, 'phase1b-magic-link-scenario.json');
  const snapReportFile = join(OUT, 'phase1b-magic-link-report.json');
  writeFileSync(snapScenarioFile, JSON.stringify(snapScenario, null, 2));
  const snap = await harness([snapScenarioFile, snapReportFile]);
  const snapReport = JSON.parse(readFileSync(snapReportFile, 'utf8'));
  for (const d of snapReport.differences.slice(0, 20)) {
    log(`  Phase 1B difference ${d.path}: ${d.reason}`);
  }
  const passed = snap.code === 0 && snapReport.differences.length === 0;
  log(
    `Phase 1B Magic-Link 97-table parity: ${passed ? 'PASS (0 differences)' : `FAIL (${snapReport.differences.length} differences)`}`
  );
  return {
    passed,
    exit: snap.code,
    differences: snapReport.differences.length,
    tables: Object.keys(snapReport.left.database).length,
  };
}

function createDistinctYjsUpdateB64() {
  const req = createRequire(join(SERVER, 'package.json'));
  const Y = req('yjs');
  const doc = new Y.Doc();
  doc.clientID = 999999;
  const text = doc.getText('coex_b2');
  text.insert(0, 'hello coexistence direction b2');
  const update = Y.encodeStateAsUpdate(doc);
  return Buffer.from(update).toString('base64');
}

async function runCoexistencePhase(newBin, privateKey, migrations) {
  log(
    'Phase 2: starting shared-PG16 + shared-Redis-7 cross-gen Socket.IO coexistence test...'
  );
  const envFile = join(OUT, 'test-env-coex.env');
  writeFileSync(envFile, '');
  const up = keyValues(
    (await testEnv(['up', '--migrations', migrations, '--env-file', envFile]))
      .stdout
  );
  cleanups.push(() => testEnv(['down', '--env-file', envFile]));

  const pgEnv = { ...cargoEnv, AFFINE_TEST_PG_URL: up.AFFINE_TEST_PG_URL };
  const lease = keyValues(
    (
      await testEnv(
        [
          'lease',
          '--template',
          up.AFFINE_TEST_PG_TEMPLATE,
          '--ttl-secs',
          '1800',
        ],
        pgEnv
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
      pgEnv
    )
  );

  const sharedDb = lease.AFFINE_TEST_DB_URL;
  const sharedRedis = up.AFFINE_TEST_REDIS_URL;
  const oldSide = {
    name: 'coex-old',
    database: sharedDb,
    redis: sharedRedis,
    port: await freePort(),
    smtpPort: await freePort(),
    privateKey,
  };
  const newSide = {
    name: 'coex-new',
    database: sharedDb,
    redis: sharedRedis,
    port: await freePort(),
    smtpPort: await freePort(),
    privateKey,
  };

  for (const command of [
    'run',
    'validate-cutover',
    'activate-workspace-lifecycle',
  ]) {
    await run(process.execPath, oldServerArgs([command]), {
      cwd: SERVER,
      env: serverEnv(oldSide, { SERVER_FLAVOR: 'script' }),
    });
  }

  await Promise.all([startOldServer(oldSide), startNewServer(newSide, newBin)]);
  log(
    `Phase 2 both servers ready (old :${oldSide.port}, new :${newSide.port})`
  );

  const setupResp = await fetch(
    `http://127.0.0.1:${oldSide.port}/api/setup/create-admin-user`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Coex Admin',
        email: 'coex-admin@affine.test',
        password: 'Coex-Admin-Passw0rd',
      }),
    }
  );
  if (setupResp.status !== 201) {
    throw new Error(`coexistence setup failed: ${setupResp.status}`);
  }
  const cookieHeader = parseSetCookies(setupResp.headers).header;

  const wsResp = await fetch(`http://127.0.0.1:${oldSide.port}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieHeader },
    body: JSON.stringify({ query: 'mutation { createWorkspace { id } }' }),
  });
  const wsJson = await wsResp.json();
  const workspaceId = wsJson?.data?.createWorkspace?.id;
  if (!workspaceId) {
    throw new Error(
      `coexistence createWorkspace failed: ${JSON.stringify(wsJson)}`
    );
  }

  const nodeModulesRoot = process.env.AFFINE_NODE_MODULES_ROOT || SERVER_ROOT;
  const req = createRequire(join(nodeModulesRoot, 'package.json'));
  const { io } = req('socket.io-client');

  const connectClient = port =>
    new Promise((resolveConn, rejectConn) => {
      const socket = io(`http://127.0.0.1:${port}`, {
        transports: ['polling', 'websocket'],
        extraHeaders: { cookie: cookieHeader },
        reconnection: false,
        timeout: 15_000,
      });
      socket.once('connect', () => resolveConn(socket));
      socket.once('connect_error', err => rejectConn(err));
    });

  const emitAck = (socket, event, payload) =>
    new Promise((resolveAck, rejectAck) => {
      const timer = setTimeout(
        () => rejectAck(new Error(`timeout waiting ack for ${event}`)),
        15_000
      );
      socket.emit(event, payload, ack => {
        clearTimeout(timer);
        if (ack?.error) {
          rejectAck(new Error(`${event} error: ${JSON.stringify(ack.error)}`));
        } else {
          resolveAck(ack);
        }
      });
    });

  const waitForEvent = (socket, event, predicate) =>
    new Promise((resolveEvt, rejectEvt) => {
      const timer = setTimeout(
        () => rejectEvt(new Error(`timeout waiting for ${event}`)),
        15_000
      );
      const handler = payload => {
        if (!predicate || predicate(payload)) {
          clearTimeout(timer);
          socket.off(event, handler);
          resolveEvt(payload);
        }
      };
      socket.on(event, handler);
    });

  const distinctUpdateB2 = createDistinctYjsUpdateB64();
  if (distinctUpdateB2 === GOLDEN_UPDATE_B64) {
    throw new Error('distinctUpdateB2 must differ from GOLDEN_UPDATE_B64');
  }

  const [clientOld, clientNew] = await Promise.all([
    connectClient(oldSide.port),
    connectClient(newSide.port),
  ]);
  try {
    const joinPayload = {
      spaces: [
        { spaceType: 'workspace', spaceId: workspaceId, docId: workspaceId },
      ],
      clientVersion: '0.27.5',
      protocolVersion: 2,
    };
    await Promise.all([
      emitAck(clientOld, 'space:join-batch', joinPayload),
      emitAck(clientNew, 'space:join-batch', joinPayload),
    ]);

    // Direction A: v0.27.5 -> affine-server
    const newUpdateA = waitForEvent(
      clientNew,
      'space:broadcast-doc-updates',
      p => p?.docId === workspaceId
    );
    const newInvA = waitForEvent(
      clientNew,
      'space:broadcast-doc-invalidation',
      p => p?.spaceId === workspaceId
    );
    await emitAck(clientOld, 'space:push-doc-update', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId: workspaceId,
      update: GOLDEN_UPDATE_B64,
      intent: 'create',
    });
    const [updA, invA] = await Promise.all([newUpdateA, newInvA]);
    if (
      !Array.isArray(updA.updates) ||
      !updA.updates.includes(GOLDEN_UPDATE_B64)
    ) {
      throw new Error(
        `Direction A broadcast updates mismatch: ${JSON.stringify(updA)}`
      );
    }
    const loadA = await emitAck(clientNew, 'space:load-doc', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId: workspaceId,
    });
    if (
      loadA?.data?.missing !== GOLDEN_UPDATE_B64 ||
      loadA?.data?.state !== 'AQEN'
    ) {
      throw new Error(
        `Direction A load-doc mismatch: ${JSON.stringify(loadA)}`
      );
    }
    log('Phase 2 Direction A (v0.27.5 -> affine-server): PASS');

    // Direction B: affine-server -> v0.27.5 with a second DISTINCT incremental Yjs update.
    const oldInvCreateB = waitForEvent(
      clientOld,
      'space:broadcast-doc-invalidation',
      p => p?.spaceId === workspaceId
    );
    await emitAck(clientNew, 'space:push-doc-update', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId: 'coex-doc-b',
      update: GOLDEN_UPDATE_B64,
      intent: 'create',
    });
    await oldInvCreateB;

    const joinDocB = {
      spaces: [
        { spaceType: 'workspace', spaceId: workspaceId, docId: 'coex-doc-b' },
      ],
      clientVersion: '0.27.5',
      protocolVersion: 2,
    };
    await Promise.all([
      emitAck(clientOld, 'space:join-batch', joinDocB),
      emitAck(clientNew, 'space:join-batch', joinDocB),
    ]);

    const oldUpdateB = waitForEvent(
      clientOld,
      'space:broadcast-doc-updates',
      p => p?.docId === 'coex-doc-b'
    );
    const oldInvB = waitForEvent(
      clientOld,
      'space:broadcast-doc-invalidation',
      p => p?.spaceId === workspaceId
    );
    await emitAck(clientNew, 'space:push-doc-update', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId: 'coex-doc-b',
      update: distinctUpdateB2,
      intent: 'update',
    });
    const [updB, invB] = await Promise.all([oldUpdateB, oldInvB]);
    if (
      !Array.isArray(updB.updates) ||
      !updB.updates.includes(distinctUpdateB2)
    ) {
      throw new Error(
        `Direction B broadcast updates mismatch: ${JSON.stringify(updB)}`
      );
    }
    const loadB = await emitAck(clientOld, 'space:load-doc', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId: 'coex-doc-b',
    });
    if (
      !loadB?.data?.missing ||
      loadB.data.missing === GOLDEN_UPDATE_B64 ||
      loadB.data.missing === distinctUpdateB2
    ) {
      throw new Error(
        `Direction B load-doc did not return merged state of both updates: ${JSON.stringify(loadB)}`
      );
    }
    const Y = createRequire(join(SERVER, 'package.json'))('yjs');
    const mergedDoc = new Y.Doc();
    Y.applyUpdate(mergedDoc, Buffer.from(loadB.data.missing, 'base64'));
    const mergedTitle = mergedDoc.getMap('meta').get('title');
    const mergedContent = mergedDoc.getText('content').toString();
    const mergedCoexB2 = mergedDoc.getText('coex_b2').toString();
    const mergedStateB64 = Buffer.from(Y.encodeStateVector(mergedDoc)).toString(
      'base64'
    );
    if (
      mergedTitle !== 'parity' ||
      mergedContent !== 'hello parity' ||
      mergedCoexB2 !== 'hello coexistence direction b2' ||
      mergedStateB64 !== loadB.data.state
    ) {
      throw new Error(
        `Direction B Yjs merged doc verification failed: title=${JSON.stringify(mergedTitle)} content=${JSON.stringify(mergedContent)} coex_b2=${JSON.stringify(mergedCoexB2)} computedState=${mergedStateB64} serverState=${loadB.data.state}`
      );
    }
    log(
      'Phase 2 Direction B (affine-server -> v0.27.5 distinct incremental Yjs update): PASS'
    );

    return {
      passed: true,
      direction_a: { spaceId: invA.spaceId, state: loadA.data.state },
      direction_b: { spaceId: invB.spaceId, state: loadB.data.state },
    };
  } finally {
    clientOld.disconnect();
    clientNew.disconnect();
  }
}

async function main() {
  await verifyFrozenServerRoot();
  const newBin = await ensureNewServerBinary();
  const migrations = join(SERVER, 'migrations');
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const left = { name: 'left-v0275' };
  const right = { name: 'right-vnew' };
  const sides = [left, right];

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

  // Both left (v0.27.5) and right (affine-server) start from identical v0.27.5
  // predeploy baselines (`run`, `validate-cutover`, `activate-workspace-lifecycle`).
  for (const side of sides) {
    for (const command of [
      'run',
      'validate-cutover',
      'activate-workspace-lifecycle',
    ]) {
      await run(process.execPath, oldServerArgs([command]), {
        cwd: SERVER,
        env: serverEnv(side, { SERVER_FLAVOR: 'script' }),
      });
    }
  }

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
  }

  const booted = Date.now();
  await Promise.all([startOldServer(left), startNewServer(right, newBin)]);
  log(`both servers ready in ${Date.now() - booted} ms`);

  const target = side => ({
    base_url: `http://127.0.0.1:${side.port}`,
    postgres: side.database,
    redis: side.redis,
    smtp_bind: `127.0.0.1:${side.smtpPort}`,
  });
  const scenario = JSON.parse(readFileSync(SCENARIO, 'utf8'));
  scenario.left_target = target(left);
  scenario.right_target = target(right);
  const scenarioFile = join(OUT, 'scenario.json');
  const reportFile = join(OUT, 'report.json');
  writeFileSync(scenarioFile, JSON.stringify(scenario, null, 2));

  const equal = await harness([scenarioFile, reportFile]);
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));

  // Explicitly assert cross-gen originChannel convention: left="production", right="v2:production".
  const leftChannels = report.left.effects.redis
    .filter(m => m.channel === 'affine:eventbus:v1')
    .map(m => m.payload?.value?.originChannel);
  const rightChannels = report.right.effects.redis
    .filter(m => m.channel === 'affine:eventbus:v1')
    .map(m => m.payload?.value?.originChannel);
  const originChannelsOk =
    leftChannels.length > 0 &&
    leftChannels.every(c => c === 'production') &&
    rightChannels.length === leftChannels.length &&
    rightChannels.every(c => c === 'v2:production');
  log(
    `originChannel check: left=${JSON.stringify(leftChannels)} right=${JSON.stringify(rightChannels)} ok=${originChannelsOk}`
  );

  const tables = Object.entries(report.left.database);
  const newBinarySha256 = createHash('sha256')
    .update(readFileSync(newBin))
    .digest('hex');
  let repoHead = process.env.AFFINE_REPO_HEAD || null;
  if (!repoHead) {
    try {
      repoHead = (
        await run('git', ['rev-parse', 'HEAD'], { cwd: ROOT })
      ).stdout.trim();
    } catch {
      repoHead = null;
    }
  }
  const summary = {
    repo_head: repoHead,
    new_binary_sha256: newBinarySha256,
    equal: {
      exit: equal.code,
      differences: report.differences.length,
      origin_channels_ok: originChannelsOk,
      protocol_steps: report.left.protocol.length,
      tables: tables.length,
      tables_with_rows: tables.filter(([, rows]) => rows.length).length,
      rows: tables.reduce((n, [, rows]) => n + rows.length, 0),
      smtp_messages: report.left.effects.smtp.length,
      redis_messages: report.left.effects.redis.length,
      symbols: report.symbols.length,
    },
    phase1b_magic_link: null,
    faults: [],
    coexistence: null,
  };
  log(`equal run: ${JSON.stringify(summary.equal)}`);
  for (const d of report.differences.slice(0, 30))
    log(`  difference ${d.path}: ${d.reason}`);

  // Fault 1: tampered user row on live right database (runs right after Phase 1).
  await tamperUserName(right);
  const faultScenario = {
    ...scenario,
    left_target: {
      base_url: scenario.left_target.base_url,
      postgres: left.database,
    },
    right_target: {
      base_url: scenario.right_target.base_url,
      postgres: right.database,
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

  // Fault 2: tampered GraphQL field in recorded right-side protocol.
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

  // Phase 1B: Live dual-side SMTP Magic-Link cross-gen parity on an isolated fresh DB pair.
  summary.phase1b_magic_link = await runMagicLinkPhase(
    left,
    right,
    newBin,
    scenario
  );

  if (!args['skip-coexistence']) {
    summary.coexistence = await runCoexistencePhase(
      newBin,
      privateKey,
      migrations
    );
  }

  writeFileSync(
    join(OUT, 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n'
  );
  const passed =
    equal.code === 0 &&
    summary.equal.differences === 0 &&
    originChannelsOk &&
    summary.phase1b_magic_link?.passed === true &&
    summary.faults.every(f => f.detected && f.exit === 1) &&
    (args['skip-coexistence'] || summary.coexistence?.passed === true);
  const coexMsg = args['skip-coexistence']
    ? '(coexistence skipped)'
    : 'cross-gen Socket.IO coexistence verified';
  log(
    passed
      ? `PASS: 0 differences across ${summary.equal.protocol_steps} steps + Phase 1B magic-link 97-table parity, both faults detected, ${coexMsg}`
      : `FAIL: see ${OUT}/summary.json and report.json`
  );
  return passed;
}

let passed = false;
try {
  passed = await main();
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
process.exit(passed ? 0 : 1);
