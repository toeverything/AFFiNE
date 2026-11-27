import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  comparePerfMetrics,
  extractPerfMetricsFromZip,
  renderMarkdownSummary,
  resolveWindowFromEligibleRuns,
  selectBaselineRun,
  selectPerfMetricsZipEntry,
  validateAcceptedEntries,
  validatePerfMetrics,
} from './compare-n3.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, 'compare-n3.mjs');

function makeMetrics(commit, overrides = {}) {
  return {
    schema_version: 1,
    commit,
    timestamp_utc: '2026-11-21T18:00:00Z',
    ci_wall_ms: {
      lint_and_wasm: 40_000,
      headless_linux: 60_000,
      total_critical_path: 80_000,
      ...(overrides.ci_wall_ms ?? {}),
    },
    artifacts_bytes: {
      web_wasm_raw: 2_000_000,
      web_wasm_gzip: 700_000,
      headless_bin: 15_000_000,
      ...(overrides.artifacts_bytes ?? {}),
    },
    benchmarks: {
      doc_1k_edits_ms: { median: 10.0, p95: 12.0 },
      room_sync_1k_ops_ms: { median: 20.0, p95: 25.0 },
      layout_10k_blocks_cold_ms: { median: 100.0, p95: 112.0 },
      layout_single_keystroke_ms: { median: 0.5, p95: 0.8 },
      layout_single_keystroke_blocks_relayout: 1,
      edgeless_1k_pan_zoom_frame_ms: { median: 4.0, p95: 5.0 },
      headless_frame_render_ms: { median: 8.0, p95: 9.5 },
      ...(overrides.benchmarks ?? {}),
    },
  };
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildStoredZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const dataBuf = Buffer.from(content, 'utf8');
    const checksum = crc32(dataBuf);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, dataBuf);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + dataBuf.length;
  }

  const centralSize = centralParts.reduce((acc, b) => acc + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

test('validatePerfMetrics rejects empty objects, verdict files, unknown keys, and p95 < median', () => {
  assert.throws(() => validatePerfMetrics({}), /missing required/);
  assert.throws(
    () =>
      validatePerfMetrics({
        schema_version: 1,
        has_hard_regression: false,
      }),
    /unknown top-level key/
  );
  assert.throws(
    () =>
      validatePerfMetrics({
        ...makeMetrics('1'.repeat(40)),
        extra_field: 42,
      }),
    /unknown top-level key/
  );
  assert.throws(
    () =>
      validatePerfMetrics(
        makeMetrics('1'.repeat(40), {
          benchmarks: { doc_1k_edits_ms: { median: 15.0, p95: 10.0 } },
        })
      ),
    /p95 .* must be >= median/
  );
  assert.throws(
    () =>
      validatePerfMetrics({
        ...makeMetrics('1'.repeat(40)),
        commit: 'not-a-sha',
      }),
    /40-char lowercase hex SHA/
  );
});

test('selectBaselineRun handles bootstrap, rerun deduplication, and strict older anchoring', () => {
  const s = n => String(n).repeat(40);
  const runs = [
    { id: 7, head_sha: s(7), status: 'completed', conclusion: 'success', created_at: '2026-11-21T07:00:00Z' },
    { id: 6, head_sha: s(6), status: 'completed', conclusion: 'success', created_at: '2026-11-21T06:00:00Z' },
    { id: 5, head_sha: s(5), status: 'completed', conclusion: 'success', created_at: '2026-11-21T05:00:00Z' },
    { id: 4, head_sha: s(4), status: 'completed', conclusion: 'success', created_at: '2026-11-21T04:00:00Z' },
    { id: 3, head_sha: s(3), status: 'completed', conclusion: 'success', created_at: '2026-11-21T03:00:00Z' },
    { id: 2, head_sha: s(2), status: 'completed', conclusion: 'success', created_at: '2026-11-21T02:00:00Z' },
    { id: 1, head_sha: s(1), status: 'completed', conclusion: 'success', created_at: '2026-11-21T01:00:00Z' },
  ];

  // Rerun of commit #4 in [7..1] must consider only [3, 2, 1] and select #1
  const rerun4 = selectBaselineRun(runs, { currentCommit: s(4) });
  assert.equal(rerun4.baseline?.id, 1);
  assert.equal(rerun4.baselineDepth, 'N-3');
  assert.deepEqual(
    rerun4.eligibleRuns.map(r => r.id),
    [3, 2, 1]
  );

  // When SHA #4 is outside the page, --current-created-at still anchors strictly older runs
  const pageWithout4 = runs.filter(r => r.id !== 4);
  const anchoredByTime = selectBaselineRun(pageWithout4, {
    currentCommit: s(4),
    currentCreatedAt: '2026-11-21T04:00:00Z',
  });
  assert.equal(anchoredByTime.baseline?.id, 1);
  assert.deepEqual(
    anchoredByTime.eligibleRuns.map(r => r.id),
    [3, 2, 1]
  );

  // Bootstrap with 0 prior runs
  const empty = selectBaselineRun([], { currentCommit: s(1) });
  assert.equal(empty.baseline, null);
  assert.equal(empty.baselineDepth, 'bootstrap');
});

test(
  'resolveWindowFromEligibleRuns falls back to N-2 and skips artifact-less runs',
  () => {
  const s = n => String(n).repeat(40);
  const eligible = [
    { id: 30, head_sha: s(3) }, // N-1
    { id: 20, head_sha: s(2) }, // N-2
    { id: 10, head_sha: s(1) }, // N-3 (missing artifact!)
  ];
  const payloads = new Map([
    [30, makeMetrics(s(3))],
    [20, makeMetrics(s(2))],
    [10, null],
  ]);

  const resolved = resolveWindowFromEligibleRuns(eligible, r =>
    payloads.get(r.id)
  );
  assert.equal(resolved.baselineDepth, 'N-2');
  assert.equal(resolved.baseline?.commit, s(2));
  assert.equal(resolved.n1?.commit, s(3));
  assert.equal(resolved.n2, null);

  // Path-filtered backend/docs runs with no perf-metrics artifact must not
  // push valid UI runs out of the N-3 window.
  const mkRun = n => ({
    id: n * 10,
    head_sha: s(n),
    status: 'completed',
    conclusion: 'success',
    created_at: `2026-11-21T0${n}:00:00Z`,
  });
  const mixedRuns = [8, 7, 6, 5, 4, 3, 2, 1].map(mkRun);
  const sel = selectBaselineRun(mixedRuns, {
    currentCommit: s(8),
    maxCandidates: 90,
  });
  const mixedPayloads = new Map([
    [70, null],
    [60, null],
    [50, null],
    [40, makeMetrics(s(4))],
    [30, makeMetrics(s(3))],
    [20, makeMetrics(s(2))],
    [10, makeMetrics(s(1))],
  ]);
  const visited = [];
  const mixedResolved = resolveWindowFromEligibleRuns(sel.eligibleRuns, r => {
    visited.push(r.id);
    return mixedPayloads.get(r.id);
  });
  assert.equal(mixedResolved.baselineDepth, 'N-3');
  assert.equal(mixedResolved.baseline?.commit, s(2));
  assert.equal(mixedResolved.n1?.commit, s(4));
  assert.equal(mixedResolved.n2?.commit, s(3));
  assert.deepEqual(visited, [70, 60, 50, 40, 30, 20]);
});

test('selectPerfMetricsZipEntry rejects verdict-only zips and never falls back to arbitrary json', () => {
  assert.equal(
    selectPerfMetricsZipEntry(['perf-verdict.json', 'linux-run1.json']),
    null
  );
  assert.equal(
    selectPerfMetricsZipEntry([
      'linux-run1.json',
      'artifacts/perf-metrics.json',
      'perf-verdict.json',
    ]),
    'artifacts/perf-metrics.json'
  );
  assert.equal(
    selectPerfMetricsZipEntry([
      'artifacts/perf-metrics.json',
      'perf-metrics.json',
    ]),
    'perf-metrics.json'
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'np-perf-zip-'));
  try {
    const verdictOnlyZip = path.join(dir, 'verdict-only.zip');
    fs.writeFileSync(
      verdictOnlyZip,
      buildStoredZip([['perf-verdict.json', JSON.stringify({ has_hard_regression: false })]])
    );
    assert.throws(() => extractPerfMetricsFromZip(verdictOnlyZip), /No valid perf-metrics\.json/);

    const validNestedZip = path.join(dir, 'nested.zip');
    const expected = makeMetrics('9'.repeat(40));
    fs.writeFileSync(
      validNestedZip,
      buildStoredZip([
        ['perf-verdict.json', JSON.stringify({ noise: true })],
        ['artifacts/perf-metrics.json', JSON.stringify(expected)],
      ])
    );
    const parsed = extractPerfMetricsFromZip(validNestedZip);
    assert.equal(parsed.commit, expected.commit);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deterministic hard gate vs advisory shared-runner timings and --fail-on-regression exit codes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'np-perf-advisory-'));
  try {
    const basePath = path.join(dir, 'base.json');
    const timingOnlyPath = path.join(dir, 'timing-only.json');
    const bytesRegPath = path.join(dir, 'bytes-reg.json');
    const jsonOut = path.join(dir, 'verdict.json');
    // The gate itself is under test: no ceiling from the repository's perf/accepted.json applies.
    const noAcceptedPath = path.join(dir, 'accepted.json');
    fs.writeFileSync(noAcceptedPath, '[]');

    fs.writeFileSync(basePath, JSON.stringify(makeMetrics('1'.repeat(40))));
    // Only *_ms timings slowed down (>10%) -> ADVISORY_SLOWDOWN, must exit 0 under --fail-on-regression
    fs.writeFileSync(
      timingOnlyPath,
      JSON.stringify(
        makeMetrics('2'.repeat(40), {
          ci_wall_ms: {
            lint_and_wasm: 40_000,
            headless_linux: 60_000,
            total_critical_path: 100_000, // +25% and +20s -> ADVISORY_SLOWDOWN
          },
          benchmarks: {
            doc_1k_edits_ms: { median: 15.0, p95: 18.0 }, // +50% -> ADVISORY_SLOWDOWN
          },
        })
      )
    );
    // Deterministic byte size grew +12% -> REGRESSED, must exit 1 under --fail-on-regression
    fs.writeFileSync(
      bytesRegPath,
      JSON.stringify(
        makeMetrics('3'.repeat(40), {
          artifacts_bytes: {
            web_wasm_raw: 2_000_000,
            web_wasm_gzip: 784_000, // +12% -> REGRESSED
            headless_bin: 15_000_000,
          },
        })
      )
    );

    const advStdout = execFileSync(
      process.execPath,
      [
        CLI_PATH,
        '--current',
        timingOnlyPath,
        '--baseline',
        basePath,
        '--accepted',
        noAcceptedPath,
        '--json-out',
        jsonOut,
        '--fail-on-regression',
      ],
      { encoding: 'utf8' }
    );
    assert.match(advStdout, /ADVISORY_SLOWDOWN/);
    const advVerdict = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
    assert.equal(advVerdict.has_hard_regression, false);
    assert.equal(advVerdict.has_advisory_slowdown, true);
    assert.equal(advVerdict.needs_perf_investigation, false);
    assert.deepEqual(
      advVerdict.advisory_metrics.map(m => m.key).sort(),
      ['benchmarks.doc_1k_edits_ms', 'ci_wall_ms.total_critical_path']
    );

    let exitCode = 0;
    let regStdout = '';
    try {
      execFileSync(
        process.execPath,
        [
          CLI_PATH,
          '--current',
          bytesRegPath,
          '--baseline',
          basePath,
          '--accepted',
          noAcceptedPath,
          '--json-out',
          jsonOut,
          '--fail-on-regression',
        ],
        { encoding: 'utf8' }
      );
    } catch (err) {
      exitCode = err.status;
      regStdout = String(err.stdout ?? '');
    }
    assert.equal(exitCode, 1);
    assert.match(regStdout, /REGRESSION DETECTED/);
    const regVerdict = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
    assert.equal(regVerdict.has_hard_regression, true);
    assert.equal(regVerdict.regressed_metrics[0].key, 'artifacts_bytes.web_wasm_gzip');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('perf/accepted.json value-ceiling accepts <= ceiling, rejects > ceiling, and reports stale_acceptances without failing CI', () => {
  // Validation rejects unknown keys, unknown metrics, duplicate metrics, and non-integer ceilings on integer metrics
  assert.throws(
    () =>
      validateAcceptedEntries([
        {
          metric: 'artifacts_bytes.web_wasm_gzip',
          accepted_value: 125,
          reason: 'ok',
          commit: '1'.repeat(40),
        },
      ]),
    /unknown key/
  );
  assert.throws(
    () =>
      validateAcceptedEntries([
        { metric: 'artifacts_bytes.not_a_metric', accepted_value: 125, reason: 'ok' },
      ]),
    /not a known metric key/
  );
  assert.throws(
    () =>
      validateAcceptedEntries([
        { metric: 'artifacts_bytes.web_wasm_gzip', accepted_value: 125, reason: 'a' },
        { metric: 'artifacts_bytes.web_wasm_gzip', accepted_value: 130, reason: 'b' },
      ]),
    /duplicate metric/
  );
  assert.throws(
    () =>
      validateAcceptedEntries([
        { metric: 'artifacts_bytes.web_wasm_gzip', accepted_value: 125.5, reason: 'float' },
      ]),
    /must be an integer/
  );

  const s = n => String(n).repeat(40);
  const runs = [
    { id: 4, head_sha: s(4), status: 'completed', conclusion: 'success', created_at: '2026-11-21T04:00:00Z' },
    { id: 3, head_sha: s(3), status: 'completed', conclusion: 'success', created_at: '2026-11-21T03:00:00Z' },
    { id: 2, head_sha: s(2), status: 'completed', conclusion: 'success', created_at: '2026-11-21T02:00:00Z' },
    { id: 1, head_sha: s(1), status: 'completed', conclusion: 'success', created_at: '2026-11-21T01:00:00Z' },
  ];
  const sel = selectBaselineRun(runs, { currentCommit: s(4) });
  assert.equal(sel.baseline?.head_sha, s(1));

  const baseline100 = makeMetrics(s(1), {
    artifacts_bytes: {
      web_wasm_raw: 2_000_000,
      web_wasm_gzip: 100,
      headless_bin: 15_000_000,
    },
  });
  const accepted = [
    {
      metric: 'artifacts_bytes.web_wasm_gzip',
      accepted_value: 125,
      reason: 'Added rich-text shaping tables',
    },
  ];

  // current = 125 (within ceiling 125) -> ACCEPTED, no hard regression, no stale acceptances
  const cur125 = makeMetrics(s(4), {
    artifacts_bytes: {
      web_wasm_raw: 2_000_000,
      web_wasm_gzip: 125,
      headless_bin: 15_000_000,
    },
  });
  const vAccepted = comparePerfMetrics({
    current: cur125,
    baseline: baseline100,
    accepted,
  });
  assert.equal(vAccepted.has_hard_regression, false);
  assert.equal(vAccepted.stale_acceptances.length, 0);
  const accRow = vAccepted.metrics.find(m => m.key === 'artifacts_bytes.web_wasm_gzip');
  assert.equal(accRow?.status, 'ACCEPTED');
  assert.equal(accRow?.baseline, 100);
  assert.equal(accRow?.current, 125);
  assert.match(renderMarkdownSummary(vAccepted), /accepted ceiling 125 B/);

  // current = 138 (above ceiling 125) -> REGRESSED
  const cur138 = makeMetrics(s(4), {
    artifacts_bytes: {
      web_wasm_raw: 2_000_000,
      web_wasm_gzip: 138,
      headless_bin: 15_000_000,
    },
  });
  const vReg = comparePerfMetrics({
    current: cur138,
    baseline: baseline100,
    accepted,
  });
  assert.equal(vReg.has_hard_regression, true);
  assert.equal(
    vReg.metrics.find(m => m.key === 'artifacts_bytes.web_wasm_gzip')?.status,
    'REGRESSED'
  );

  // Baseline catches up to 125, current = 125 -> PASS + stale_acceptances reported, CLI exits 0
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'np-perf-stale-'));
  try {
    const basePath = path.join(dir, 'base125.json');
    const curPath = path.join(dir, 'cur125.json');
    const accPath = path.join(dir, 'accepted.json');
    const jsonOut = path.join(dir, 'verdict.json');

    fs.writeFileSync(
      basePath,
      JSON.stringify(
        makeMetrics(s(1), {
          artifacts_bytes: {
            web_wasm_raw: 2_000_000,
            web_wasm_gzip: 125,
            headless_bin: 15_000_000,
          },
        })
      )
    );
    fs.writeFileSync(curPath, JSON.stringify(cur125));
    fs.writeFileSync(accPath, JSON.stringify(accepted));

    const stdout = execFileSync(
      process.execPath,
      [
        CLI_PATH,
        '--current',
        curPath,
        '--baseline',
        basePath,
        '--accepted',
        accPath,
        '--json-out',
        jsonOut,
        '--fail-on-regression',
      ],
      { encoding: 'utf8' }
    );
    assert.match(stdout, /### Stale Acceptances/);
    const verdict = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
    assert.equal(verdict.has_hard_regression, false);
    assert.equal(verdict.stale_acceptances.length, 1);
    assert.equal(verdict.stale_acceptances[0].key, 'artifacts_bytes.web_wasm_gzip');
    assert.equal(
      verdict.metrics.find(m => m.key === 'artifacts_bytes.web_wasm_gzip')?.status,
      'PASS'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI --fetch-github --run-id uses immutable created_at cutoff and paginates across pages to locate N-3', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'np-perf-gh-'));
  try {
    const binDir = path.join(dir, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const logPath = path.join(dir, 'gh-calls.log');
    const zip1Path = path.join(dir, 'run-1.zip');
    const zip2Path = path.join(dir, 'run-2.zip');
    const zip3Path = path.join(dir, 'run-3.zip');
    const curPath = path.join(dir, 'current.json');
    const jsonOut = path.join(dir, 'verdict.json');

    const s = n => String(n).repeat(40);
    fs.writeFileSync(curPath, JSON.stringify(makeMetrics(s(4))));
    fs.writeFileSync(
      zip1Path,
      buildStoredZip([['perf-metrics.json', JSON.stringify(makeMetrics(s(1)))]])
    );
    fs.writeFileSync(
      zip2Path,
      buildStoredZip([['perf-metrics.json', JSON.stringify(makeMetrics(s(2)))]])
    );
    fs.writeFileSync(
      zip3Path,
      buildStoredZip([['perf-metrics.json', JSON.stringify(makeMetrics(s(3)))]])
    );

    // Fake `gh` script that logs every `gh api <endpoint>` call and serves paginated runs
    const fakeGhPath = path.join(binDir, 'gh');
    const fakeGhSource = `#!/usr/bin/env node
const fs = require('node:fs');
const endpoint = process.argv[3] || '';
fs.appendFileSync(${JSON.stringify(logPath)}, endpoint + '\\n');

const s = n => String(n).repeat(40);

if (endpoint === 'repos/toeverything/AFFiNE/actions/runs/400') {
  process.stdout.write(JSON.stringify({
    id: 400,
    head_sha: s(4),
    created_at: '2026-11-21T04:00:00Z',
  }));
  process.exit(0);
}

if (endpoint.startsWith('repos/toeverything/AFFiNE/actions/workflows/native-playground.yml/runs?')) {
  if (endpoint.includes('page=1')) {
    // 30 runs containing reruns of sha(4), sha(3), sha(2) -> only 2 distinct prior SHAs, forcing page=2!
    const page1 = [];
    for (let i = 0; i < 10; i += 1) {
      page1.push({ id: 400 - i, head_sha: s(4), status: 'completed', conclusion: 'success', created_at: '2026-11-21T04:00:00Z' });
    }
    for (let i = 0; i < 10; i += 1) {
      page1.push({ id: 300 - i, head_sha: s(3), status: 'completed', conclusion: 'success', created_at: '2026-11-21T03:00:00Z' });
    }
    for (let i = 0; i < 10; i += 1) {
      page1.push({ id: 200 - i, head_sha: s(2), status: 'completed', conclusion: 'success', created_at: '2026-11-21T02:00:00Z' });
    }
    process.stdout.write(JSON.stringify({ workflow_runs: page1 }));
    process.exit(0);
  }
  if (endpoint.includes('page=2')) {
    process.stdout.write(JSON.stringify({
      workflow_runs: [
        { id: 1, head_sha: s(1), status: 'completed', conclusion: 'success', created_at: '2026-11-21T01:00:00Z' },
      ],
    }));
    process.exit(0);
  }
}

if (endpoint === 'repos/toeverything/AFFiNE/actions/runs/1/artifacts?per_page=100') {
  process.stdout.write(JSON.stringify({ artifacts: [{ id: 1001, name: 'perf-metrics', expired: false }] }));
  process.exit(0);
}
if (endpoint === 'repos/toeverything/AFFiNE/actions/runs/200/artifacts?per_page=100') {
  process.stdout.write(JSON.stringify({ artifacts: [{ id: 1002, name: 'perf-metrics', expired: false }] }));
  process.exit(0);
}
if (endpoint === 'repos/toeverything/AFFiNE/actions/runs/300/artifacts?per_page=100') {
  process.stdout.write(JSON.stringify({ artifacts: [{ id: 1003, name: 'perf-metrics', expired: false }] }));
  process.exit(0);
}

if (endpoint === 'repos/toeverything/AFFiNE/actions/artifacts/1001/zip') {
  process.stdout.write(fs.readFileSync(${JSON.stringify(zip1Path)}));
  process.exit(0);
}
if (endpoint === 'repos/toeverything/AFFiNE/actions/artifacts/1002/zip') {
  process.stdout.write(fs.readFileSync(${JSON.stringify(zip2Path)}));
  process.exit(0);
}
if (endpoint === 'repos/toeverything/AFFiNE/actions/artifacts/1003/zip') {
  process.stdout.write(fs.readFileSync(${JSON.stringify(zip3Path)}));
  process.exit(0);
}

console.error('Unexpected gh api endpoint:', endpoint);
process.exit(1);
`;
    fs.writeFileSync(fakeGhPath, fakeGhSource, { mode: 0o755 });

    const stdout = execFileSync(
      process.execPath,
      [
        CLI_PATH,
        '--fetch-github',
        '--repo',
        'toeverything/AFFiNE',
        '--branch',
        'darksky/native-playground',
        '--workflow',
        'native-playground.yml',
        '--run-id',
        '400',
        '--current',
        curPath,
        '--json-out',
        jsonOut,
        '--fail-on-regression',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      }
    );

    assert.match(stdout, /## Native Playground Performance Guardrail \(N-3\)/);
    const verdict = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
    assert.equal(verdict.baseline_depth, 'N-3');
    assert.equal(verdict.baseline_commit, s(1));
    assert.equal(verdict.n2_commit, s(2));
    assert.equal(verdict.n1_commit, s(3));
    assert.equal(verdict.has_hard_regression, false);

    const calls = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    assert.ok(
      calls.some(c => c === 'repos/toeverything/AFFiNE/actions/runs/400'),
      'must query run 400 for immutable created_at'
    );
    assert.ok(
      calls.some(
        c =>
          c.includes('created=%3C%3D2026-11-21T04%3A00%3A00Z') &&
          c.includes('page=1')
      ),
      'must filter by created<=anchor on page=1'
    );
    assert.ok(
      calls.some(
        c =>
          c.includes('created=%3C%3D2026-11-21T04%3A00%3A00Z') &&
          c.includes('page=2')
      ),
      'must paginate to page=2 when page=1 has < 3 distinct prior SHAs'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('partial-metrics baseline to expanded-metrics current yields BOOTSTRAP on newly introduced keys', () => {
  const baseline = {
    schema_version: 1,
    commit: '1'.repeat(40),
    timestamp_utc: '2026-11-21T18:00:00Z',
    ci_wall_ms: { headless_linux: 50_000, lint_and_wasm: null },
    artifacts_bytes: { headless_bin: 14_000_000 },
    benchmarks: {
      headless_frame_render_ms: { median: 8.0, p95: 9.5 },
      doc_1k_edits_ms: null,
    },
  };
  const current = {
    schema_version: 1,
    commit: '2'.repeat(40),
    timestamp_utc: '2026-11-21T19:00:00Z',
    ci_wall_ms: {
      headless_linux: 52_000,
      lint_and_wasm: 35_000,
      total_critical_path: 52_000,
    },
    artifacts_bytes: {
      headless_bin: 14_500_000,
      web_wasm_raw: 1_800_000,
      web_wasm_gzip: 620_000,
    },
    benchmarks: {
      headless_frame_render_ms: { median: 8.4, p95: 9.8 },
      doc_1k_edits_ms: { median: 10.2, p95: 12.1 },
      room_sync_1k_ops_ms: { median: 18.5, p95: 22.0 },
    },
  };

  const verdict = comparePerfMetrics({ current, baseline });
  assert.equal(verdict.has_hard_regression, false);
  const byKey = new Map(verdict.metrics.map(m => [m.key, m]));
  assert.equal(byKey.get('benchmarks.headless_frame_render_ms')?.status, 'PASS');
  assert.equal(byKey.get('benchmarks.doc_1k_edits_ms')?.status, 'BOOTSTRAP');
  assert.equal(byKey.get('artifacts_bytes.web_wasm_raw')?.status, 'BOOTSTRAP');
});

test('edgeless_1k_pan_zoom_blocks_relayout: 0->0 passes and 0->1 flags deterministic hard regression', () => {
  const mkPayload = (commitChar, relayouts) => ({
    schema_version: 1,
    commit: commitChar.repeat(40),
    timestamp_utc: '2026-11-22T06:00:00Z',
    ci_wall_ms: {
      headless_linux: 50_000,
      lint_and_wasm: 35_000,
      total_critical_path: 50_000,
    },
    artifacts_bytes: {
      headless_bin: 14_500_000,
      web_wasm_raw: 1_800_000,
      web_wasm_gzip: 620_000,
    },
    benchmarks: {
      doc_1k_edits_ms: { median: 10.0, p95: 12.0 },
      room_sync_1k_ops_ms: { median: 18.0, p95: 21.0 },
      layout_10k_blocks_cold_ms: { median: 120.0, p95: 135.0 },
      layout_single_keystroke_ms: { median: 0.5, p95: 0.7 },
      layout_single_keystroke_blocks_relayout: 1,
      edgeless_1k_pan_zoom_frame_ms: { median: 2.5, p95: 3.1 },
      edgeless_1k_pan_zoom_blocks_relayout: relayouts,
      headless_frame_render_ms: { median: 8.0, p95: 9.5 },
    },
  });

  const baseline = mkPayload('a', 0);
  const currentPass = mkPayload('b', 0);
  const passVerdict = comparePerfMetrics({ current: currentPass, baseline });
  assert.equal(passVerdict.has_hard_regression, false);
  const passMetric = passVerdict.metrics.find(
    m => m.key === 'benchmarks.edgeless_1k_pan_zoom_blocks_relayout'
  );
  assert.equal(passMetric?.status, 'PASS');
  assert.equal(passMetric?.regressed, false);

  const currentRegressed = mkPayload('c', 1);
  const failVerdict = comparePerfMetrics({ current: currentRegressed, baseline });
  assert.equal(failVerdict.has_hard_regression, true);
  const failMetric = failVerdict.metrics.find(
    m => m.key === 'benchmarks.edgeless_1k_pan_zoom_blocks_relayout'
  );
  assert.equal(failMetric?.status, 'REGRESSED');
  assert.equal(failMetric?.regressed, true);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-n3-edgeless-'));
  try {
    const basePath = path.join(dir, 'baseline.json');
    const passPath = path.join(dir, 'pass.json');
    const failPath = path.join(dir, 'fail.json');
    fs.writeFileSync(basePath, JSON.stringify(baseline));
    fs.writeFileSync(passPath, JSON.stringify(currentPass));
    fs.writeFileSync(failPath, JSON.stringify(currentRegressed));

    execFileSync(
      process.execPath,
      [CLI_PATH, '--current', passPath, '--baseline', basePath, '--fail-on-regression'],
      { encoding: 'utf8' }
    );

    let failedExit = 0;
    try {
      execFileSync(
        process.execPath,
        [CLI_PATH, '--current', failPath, '--baseline', basePath, '--fail-on-regression'],
        { encoding: 'utf8' }
      );
    } catch (err) {
      failedExit = err.status ?? 0;
    }
    assert.equal(failedExit, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('missing baseline metric in current flags DROPPED hard regression and --require-baseline rejects missing history', () => {
  const baseline = makeMetrics('a'.repeat(40));
  const droppedCurrent = makeMetrics('b'.repeat(40));
  delete droppedCurrent.artifacts_bytes.headless_bin;

  const droppedVerdict = comparePerfMetrics({
    current: droppedCurrent,
    baseline,
  });
  assert.equal(droppedVerdict.has_hard_regression, true);
  assert.equal(droppedVerdict.regressed_metrics.length, 1);
  assert.equal(
    droppedVerdict.regressed_metrics[0].key,
    'artifacts_bytes.headless_bin'
  );
  const droppedRow = droppedVerdict.metrics.find(
    m => m.key === 'artifacts_bytes.headless_bin'
  );
  assert.equal(droppedRow?.status, 'DROPPED');
  assert.equal(droppedRow?.regressed, true);
  assert.equal(droppedRow?.current, null);
  assert.equal(droppedRow?.baseline, 15_000_000);
  assert.match(renderMarkdownSummary(droppedVerdict), /DROPPED/);

  const missingHistoryVerdict = comparePerfMetrics({
    current: makeMetrics('c'.repeat(40)),
    baseline: null,
    requireBaseline: true,
  });
  assert.equal(missingHistoryVerdict.baseline_depth, 'bootstrap');
  assert.equal(missingHistoryVerdict.has_hard_regression, true);
  assert.match(
    renderMarkdownSummary(missingHistoryVerdict),
    /Missing or Incomplete Required Baseline/
  );

  // Strict --require-n3 rejects N-2 / N-1 fallback and unacknowledged BOOTSTRAP,
  // while perf/accepted.json action="bootstrap" and action="drop" allow intentional
  // metric additions and removals cleanly until N-3 catches up.
  const n2FallbackVerdict = comparePerfMetrics({
    current: makeMetrics('d'.repeat(40)),
    baseline: makeMetrics('1'.repeat(40)),
    baselineDepth: 'N-2',
    requireN3: true,
  });
  assert.equal(n2FallbackVerdict.baseline_depth, 'N-2');
  assert.equal(n2FallbackVerdict.has_hard_regression, true);

  const missingInN3Baseline = makeMetrics('1'.repeat(40));
  delete missingInN3Baseline.artifacts_bytes.headless_bin;
  const unackBootstrapVerdict = comparePerfMetrics({
    current: makeMetrics('d'.repeat(40)),
    baseline: missingInN3Baseline,
    baselineDepth: 'N-3',
    requireN3: true,
  });
  assert.equal(unackBootstrapVerdict.has_hard_regression, true);
  assert.equal(
    unackBootstrapVerdict.metrics.find(
      m => m.key === 'artifacts_bytes.headless_bin'
    )?.status,
    'BOOTSTRAP'
  );

  const ackBootstrapVerdict = comparePerfMetrics({
    current: makeMetrics('d'.repeat(40)),
    baseline: missingInN3Baseline,
    baselineDepth: 'N-3',
    requireN3: true,
    accepted: [
      {
        metric: 'artifacts_bytes.headless_bin',
        action: 'bootstrap',
        reason: 'Newly introduced binary size metric',
      },
    ],
  });
  assert.equal(ackBootstrapVerdict.has_hard_regression, false);
  assert.equal(
    ackBootstrapVerdict.metrics.find(
      m => m.key === 'artifacts_bytes.headless_bin'
    )?.status,
    'ACCEPTED_BOOTSTRAP'
  );

  const ackDropVerdict = comparePerfMetrics({
    current: droppedCurrent,
    baseline,
    baselineDepth: 'N-3',
    requireN3: true,
    accepted: [
      {
        metric: 'artifacts_bytes.headless_bin',
        action: 'drop',
        reason: 'Retired legacy binary target',
      },
    ],
  });
  assert.equal(ackDropVerdict.has_hard_regression, false);
  assert.equal(
    ackDropVerdict.metrics.find(
      m => m.key === 'artifacts_bytes.headless_bin'
    )?.status,
    'ACCEPTED_DROP'
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-n3-dropped-'));
  try {
    const basePath = path.join(dir, 'baseline.json');
    const droppedPath = path.join(dir, 'dropped.json');
    const fullPath = path.join(dir, 'full.json');
    const noAcceptedPath = path.join(dir, 'accepted.json');
    fs.writeFileSync(basePath, JSON.stringify(baseline));
    fs.writeFileSync(droppedPath, JSON.stringify(droppedCurrent));
    fs.writeFileSync(fullPath, JSON.stringify(makeMetrics('c'.repeat(40))));
    fs.writeFileSync(noAcceptedPath, '[]');

    let droppedExit = 0;
    try {
      execFileSync(
        process.execPath,
        [
          CLI_PATH,
          '--current',
          droppedPath,
          '--baseline',
          basePath,
          '--accepted',
          noAcceptedPath,
          '--fail-on-regression',
        ],
        { encoding: 'utf8' }
      );
    } catch (err) {
      droppedExit = err.status ?? 0;
    }
    assert.equal(droppedExit, 1);

    let noHistoryExit = 0;
    try {
      execFileSync(
        process.execPath,
        [
          CLI_PATH,
          '--current',
          fullPath,
          '--accepted',
          noAcceptedPath,
          '--require-baseline',
          '--fail-on-regression',
        ],
        { encoding: 'utf8' }
      );
    } catch (err) {
      noHistoryExit = err.status ?? 0;
    }
    assert.equal(noHistoryExit, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
