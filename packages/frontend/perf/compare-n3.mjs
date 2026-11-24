#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_THRESHOLD_PCT = 10;
export const DEFAULT_CI_WALL_MIN_DELTA_MS = 15_000;
export const DEFAULT_ARTIFACT_NAME = 'perf-metrics';
export const DEFAULT_ACCEPTED_PATH = path.join(__dirname, 'accepted.json');

const SHA40_RE = /^[0-9a-f]{40}$/;
const ISO_UTC_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const ALLOWED_TOP_KEYS = new Set([
  'schema_version',
  'commit',
  'timestamp_utc',
  'ci_wall_ms',
  'artifacts_bytes',
  'benchmarks',
]);

const BENCHMARK_TIMING_KEYS = new Set([
  'doc_1k_edits_ms',
  'room_sync_1k_ops_ms',
  'layout_10k_blocks_cold_ms',
  'layout_single_keystroke_ms',
  'edgeless_1k_pan_zoom_frame_ms',
  'headless_frame_render_ms',
]);

const BENCHMARK_COUNTER_KEYS = new Set([
  'layout_single_keystroke_blocks_relayout',
  'edgeless_1k_pan_zoom_blocks_relayout',
]);

const ALL_BENCHMARK_KEYS = [
  'doc_1k_edits_ms',
  'room_sync_1k_ops_ms',
  'layout_10k_blocks_cold_ms',
  'layout_single_keystroke_ms',
  'layout_single_keystroke_blocks_relayout',
  'edgeless_1k_pan_zoom_frame_ms',
  'edgeless_1k_pan_zoom_blocks_relayout',
  'headless_frame_render_ms',
];

const ARTIFACT_SIZE_KEYS = [
  'web_wasm_raw',
  'web_wasm_gzip',
  'headless_bin',
];

const CI_WALL_KEYS = [
  'lint_and_wasm',
  'headless_linux',
  'total_critical_path',
];

const KNOWN_METRIC_KEYS = new Set([
  ...ALL_BENCHMARK_KEYS.map(k => `benchmarks.${k}`),
  ...ARTIFACT_SIZE_KEYS.map(k => `artifacts_bytes.${k}`),
  ...CI_WALL_KEYS.map(k => `ci_wall_ms.${k}`),
]);

const INTEGER_METRIC_KEYS = new Set([
  ...ARTIFACT_SIZE_KEYS.map(k => `artifacts_bytes.${k}`),
  ...Array.from(BENCHMARK_COUNTER_KEYS, k => `benchmarks.${k}`),
]);

const ALLOWED_ACCEPTED_KEYS = new Set([
  'metric',
  'action',
  'accepted_value',
  'reason',
]);
const ALLOWED_ACCEPTED_ACTIONS = new Set(['ceiling', 'bootstrap', 'drop']);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Strict zero-dependency validator matching `perf/schema.json`.
 * Throws a descriptive Error if any required field is missing, unknown keys
 * exist, or numeric/timing invariants are violated.
 */
export function validatePerfMetrics(payload, label = 'perf-metrics') {
  if (!isPlainObject(payload)) {
    throw new Error(`${label}: expected JSON object`);
  }

  for (const key of Object.keys(payload)) {
    if (!ALLOWED_TOP_KEYS.has(key)) {
      throw new Error(`${label}: unknown top-level key "${key}"`);
    }
  }
  for (const req of ALLOWED_TOP_KEYS) {
    if (!(req in payload)) {
      throw new Error(`${label}: missing required top-level key "${req}"`);
    }
  }

  if (payload.schema_version !== 1) {
    throw new Error(
      `${label}: schema_version must be 1, got ${JSON.stringify(payload.schema_version)}`
    );
  }
  if (typeof payload.commit !== 'string' || !SHA40_RE.test(payload.commit)) {
    throw new Error(
      `${label}: commit must be a 40-char lowercase hex SHA, got ${JSON.stringify(payload.commit)}`
    );
  }
  if (
    typeof payload.timestamp_utc !== 'string' ||
    !ISO_UTC_RE.test(payload.timestamp_utc) ||
    Number.isNaN(Date.parse(payload.timestamp_utc))
  ) {
    throw new Error(
      `${label}: timestamp_utc must be a valid ISO-8601 date-time, got ${JSON.stringify(payload.timestamp_utc)}`
    );
  }

  // ci_wall_ms
  if (!isPlainObject(payload.ci_wall_ms)) {
    throw new Error(`${label}: ci_wall_ms must be an object`);
  }
  const allowedWall = new Set(CI_WALL_KEYS);
  for (const [k, v] of Object.entries(payload.ci_wall_ms)) {
    if (!allowedWall.has(k)) {
      throw new Error(`${label}: unknown key ci_wall_ms.${k}`);
    }
    if (v === null) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new Error(`${label}: ci_wall_ms.${k} must be a non-negative finite number or null`);
    }
  }

  // artifacts_bytes
  if (!isPlainObject(payload.artifacts_bytes)) {
    throw new Error(`${label}: artifacts_bytes must be an object`);
  }
  const allowedArtifacts = new Set(ARTIFACT_SIZE_KEYS);
  for (const [k, v] of Object.entries(payload.artifacts_bytes)) {
    if (!allowedArtifacts.has(k)) {
      throw new Error(`${label}: unknown key artifacts_bytes.${k}`);
    }
    if (v === null) continue;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      throw new Error(`${label}: artifacts_bytes.${k} must be a non-negative integer or null`);
    }
  }

  // benchmarks
  if (!isPlainObject(payload.benchmarks)) {
    throw new Error(`${label}: benchmarks must be an object`);
  }
  for (const [k, v] of Object.entries(payload.benchmarks)) {
    if (BENCHMARK_TIMING_KEYS.has(k)) {
      if (v === null) continue;
      if (!isPlainObject(v)) {
        throw new Error(`${label}: benchmarks.${k} must be { median, p95 } or null`);
      }
      const subKeys = Object.keys(v);
      for (const sk of subKeys) {
        if (sk !== 'median' && sk !== 'p95') {
          throw new Error(`${label}: unknown key benchmarks.${k}.${sk}`);
        }
      }
      if (
        typeof v.median !== 'number' ||
        !Number.isFinite(v.median) ||
        v.median < 0
      ) {
        throw new Error(`${label}: benchmarks.${k}.median must be a non-negative finite number`);
      }
      if (
        typeof v.p95 !== 'number' ||
        !Number.isFinite(v.p95) ||
        v.p95 < 0
      ) {
        throw new Error(`${label}: benchmarks.${k}.p95 must be a non-negative finite number`);
      }
      if (v.p95 < v.median) {
        throw new Error(
          `${label}: benchmarks.${k}.p95 (${v.p95}) must be >= median (${v.median})`
        );
      }
    } else if (BENCHMARK_COUNTER_KEYS.has(k)) {
      if (v === null) continue;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
        throw new Error(`${label}: benchmarks.${k} must be a non-negative integer or null`);
      }
    } else {
      throw new Error(`${label}: unknown key benchmarks.${k}`);
    }
  }

  return payload;
}

/**
 * Validate value-ceiling regression acknowledgement entries loaded from `perf/accepted.json`.
 */
export function validateAcceptedEntries(entries, label = 'accepted.json') {
  if (!Array.isArray(entries)) {
    throw new Error(`${label}: expected a JSON array`);
  }
  const seenMetrics = new Set();
  return entries.map((entry, idx) => {
    if (!isPlainObject(entry)) {
      throw new Error(`${label}[${idx}]: expected an object`);
    }
    for (const k of Object.keys(entry)) {
      if (!ALLOWED_ACCEPTED_KEYS.has(k)) {
        throw new Error(`${label}[${idx}]: unknown key "${k}"`);
      }
    }
    if (typeof entry.metric !== 'string' || entry.metric.trim() === '') {
      throw new Error(`${label}[${idx}].metric must be a non-empty string`);
    }
    const metric = entry.metric.trim();
    if (!KNOWN_METRIC_KEYS.has(metric)) {
      throw new Error(`${label}[${idx}].metric "${metric}" is not a known metric key`);
    }
    if (seenMetrics.has(metric)) {
      throw new Error(`${label}[${idx}]: duplicate metric "${metric}"`);
    }
    seenMetrics.add(metric);

    const action = entry.action === undefined ? 'ceiling' : entry.action;
    if (
      typeof action !== 'string' ||
      !ALLOWED_ACCEPTED_ACTIONS.has(action)
    ) {
      throw new Error(
        `${label}[${idx}].action must be one of ceiling, bootstrap, drop`
      );
    }

    let acceptedValue = null;
    if (action === 'ceiling') {
      if (
        typeof entry.accepted_value !== 'number' ||
        !Number.isFinite(entry.accepted_value) ||
        entry.accepted_value < 0
      ) {
        throw new Error(
          `${label}[${idx}].accepted_value must be a finite number >= 0`
        );
      }
      if (
        INTEGER_METRIC_KEYS.has(metric) &&
        !Number.isInteger(entry.accepted_value)
      ) {
        throw new Error(
          `${label}[${idx}].accepted_value must be an integer for ${metric}`
        );
      }
      acceptedValue = entry.accepted_value;
    } else if (
      entry.accepted_value !== undefined &&
      entry.accepted_value !== null
    ) {
      throw new Error(
        `${label}[${idx}].accepted_value is only valid for ceiling entries (got action="${action}")`
      );
    }

    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
      throw new Error(`${label}[${idx}].reason must be a non-empty string`);
    }
    return {
      metric,
      action,
      accepted_value: acceptedValue,
      reason: entry.reason.trim(),
    };
  });
}

/**
 * Extract the comparable scalar value from a benchmark entry.
 * Timing entries use `{ median, p95 }`; work counters are plain numbers.
 */
export function extractMetricValue(entry) {
  if (typeof entry === 'number' && Number.isFinite(entry)) {
    return { value: entry, p95: null };
  }
  if (
    entry &&
    typeof entry === 'object' &&
    typeof entry.median === 'number' &&
    Number.isFinite(entry.median)
  ) {
    return {
      value: entry.median,
      p95:
        typeof entry.p95 === 'number' && Number.isFinite(entry.p95)
          ? entry.p95
          : null,
    };
  }
  return null;
}

function cmpCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Select eligible prior completed push runs strictly older than the commit
 * under test, deduplicating reruns by `head_sha`.
 *
 * `options` may be a commit SHA string (legacy signature) or
 * `{ currentCommit, currentCreatedAt }`.
 */
export function selectBaselineRun(runs, options = null) {
  const currentCommit =
    typeof options === 'string'
      ? options.toLowerCase()
      : options?.currentCommit
        ? String(options.currentCommit).toLowerCase()
        : null;
  const explicitCreatedAt =
    typeof options === 'object' && options?.currentCreatedAt
      ? options.currentCreatedAt
      : null;

  const validRuns = runs.filter(
    run =>
      run &&
      run.head_sha &&
      (!run.status || run.status === 'completed') &&
      (!run.conclusion || run.conclusion === 'success')
  );

  // Determine strict time/position anchor for reruns of older commits.
  let anchorTimeMs = explicitCreatedAt ? Date.parse(explicitCreatedAt) : NaN;
  let anchorLastIndex = -1;

  if (currentCommit) {
    for (let i = 0; i < validRuns.length; i += 1) {
      const run = validRuns[i];
      if (String(run.head_sha).toLowerCase() === currentCommit) {
        anchorLastIndex = i;
        if (run.created_at) {
          const ts = Date.parse(run.created_at);
          if (!Number.isNaN(ts)) {
            anchorTimeMs = Number.isNaN(anchorTimeMs)
              ? ts
              : Math.min(anchorTimeMs, ts);
          }
        }
      }
    }
  }

  const seen = new Set();
  if (currentCommit) {
    seen.add(currentCommit);
  }

  const distinctPrior = [];
  for (let i = 0; i < validRuns.length; i += 1) {
    const run = validRuns[i];
    const sha = String(run.head_sha).toLowerCase();
    if (seen.has(sha)) continue;

    // Enforce strict "older than current commit" ordering
    if (!Number.isNaN(anchorTimeMs) && run.created_at) {
      const ts = Date.parse(run.created_at);
      if (!Number.isNaN(ts) && ts >= anchorTimeMs) {
        continue;
      }
    } else if (anchorLastIndex >= 0 && i <= anchorLastIndex) {
      continue;
    }

    seen.add(sha);
    distinctPrior.push(run);
    if (distinctPrior.length === 3) break;
  }

  if (distinctPrior.length === 0) {
    return {
      baseline: null,
      baselineDepth: 'bootstrap',
      eligibleRuns: [],
      history: { n1: null, n2: null, n3: null },
    };
  }

  const n1 = distinctPrior[0] ?? null;
  const n2 = distinctPrior[1] ?? null;
  const n3 = distinctPrior[2] ?? null;
  const baseline = n3 ?? n2 ?? n1;
  const baselineDepth = n3 ? 'N-3' : n2 ? 'N-2' : 'N-1';

  return {
    baseline,
    baselineDepth,
    eligibleRuns: distinctPrior,
    history: { n1, n2, n3 },
  };
}

function roundPct(value) {
  if (value === null || !Number.isFinite(value)) return value;
  return Math.round(value * 100) / 100;
}

function exceedsThreshold(curVal, baseVal, { isCiWall, thresholdPct, ciWallMinDeltaMs }) {
  const EPS = 1e-9;
  const delta = curVal - baseVal;
  const deltaPct =
    baseVal === 0
      ? curVal > 0
        ? Number.POSITIVE_INFINITY
        : 0
      : (delta / baseVal) * 100;

  const pctOver = deltaPct > thresholdPct + EPS;
  if (isCiWall) {
    return {
      delta,
      deltaPct,
      pctOver,
      triggered: pctOver && delta > ciWallMinDeltaMs + EPS,
    };
  }
  return {
    delta,
    deltaPct,
    pctOver,
    triggered: pctOver,
  };
}

function lookupMetricEntry(payload, category, field) {
  if (!payload) return null;
  return extractMetricValue(payload[category]?.[field]);
}

function evaluateSingleMetric({
  key,
  category,
  field,
  unit,
  isDeterministicHardGate,
  current,
  baseline,
  n1,
  n2,
  accepted,
  thresholdPct,
  ciWallMinDeltaMs,
  requireN3 = false,
}) {
  const cur = lookupMetricEntry(current, category, field);
  const base = lookupMetricEntry(baseline, category, field);
  const n1Val = lookupMetricEntry(n1, category, field);
  const n2Val = lookupMetricEntry(n2, category, field);
  const match = accepted.find(a => a.metric === key) ?? null;

  if (!cur && !base) return null;

  if (!cur) {
    const isAcceptedDrop = match?.action === 'drop';
    return {
      key,
      category,
      unit,
      deterministic_hard_gate: true,
      current: null,
      current_p95: null,
      baseline: base.value,
      baseline_p95: base.p95,
      n1: n1Val?.value ?? null,
      n2: n2Val?.value ?? null,
      delta: null,
      delta_pct: null,
      delta_pct_infinite: false,
      regressed: !isAcceptedDrop,
      advisory: false,
      accepted: isAcceptedDrop
        ? {
            accepted: true,
            action: 'drop',
            accepted_value: null,
            reason: match.reason,
          }
        : null,
      stale_acceptance: null,
      status: isAcceptedDrop ? 'ACCEPTED_DROP' : 'DROPPED',
    };
  }

  if (!base) {
    const isAcceptedBootstrap = match?.action === 'bootstrap';
    const unacknowledgedUnderStrictN3 = Boolean(
      requireN3 && !isAcceptedBootstrap
    );
    return {
      key,
      category,
      unit,
      deterministic_hard_gate: isDeterministicHardGate,
      current: cur.value,
      current_p95: cur.p95,
      baseline: null,
      baseline_p95: null,
      n1: n1Val?.value ?? null,
      n2: n2Val?.value ?? null,
      delta: null,
      delta_pct: null,
      delta_pct_infinite: false,
      regressed: unacknowledgedUnderStrictN3,
      advisory: false,
      accepted: isAcceptedBootstrap
        ? {
            accepted: true,
            action: 'bootstrap',
            accepted_value: null,
            reason: match.reason,
          }
        : null,
      stale_acceptance: null,
      status: isAcceptedBootstrap ? 'ACCEPTED_BOOTSTRAP' : 'BOOTSTRAP',
    };
  }

  const isCiWall = category === 'ci_wall_ms';
  const EPS = 1e-9;
  const check = exceedsThreshold(cur.value, base.value, {
    isCiWall,
    thresholdPct,
    ciWallMinDeltaMs,
  });

  const staleAcceptance =
    match?.action === 'ceiling' && base.value >= match.accepted_value - EPS
      ? {
          key,
          unit,
          action: 'ceiling',
          baseline: base.value,
          current: cur.value,
          accepted_value: match.accepted_value,
          reason: match.reason,
        }
      : match?.action === 'bootstrap'
        ? {
            key,
            unit,
            action: 'bootstrap',
            baseline: base.value,
            current: cur.value,
            accepted_value: null,
            reason: match.reason,
          }
        : null;

  let regressed = false;
  let advisory = false;
  let status = 'PASS';
  let acceptanceInfo = null;

  if (check.triggered) {
    if (
      match?.action === 'ceiling' &&
      cur.value <= match.accepted_value + EPS
    ) {
      status = 'ACCEPTED';
      acceptanceInfo = {
        accepted: true,
        action: 'ceiling',
        accepted_value: match.accepted_value,
        reason: match.reason,
      };
    } else if (isDeterministicHardGate) {
      regressed = true;
      status = 'REGRESSED';
    } else {
      advisory = true;
      status = 'ADVISORY_SLOWDOWN';
    }
  } else if (isCiWall && check.pctOver) {
    status = 'JITTER_IGNORED';
  } else if (
    check.deltaPct <= -thresholdPct + EPS &&
    (!isCiWall || Math.abs(check.delta) > ciWallMinDeltaMs + EPS)
  ) {
    status = 'IMPROVED';
  }

  return {
    key,
    category,
    unit,
    deterministic_hard_gate: isDeterministicHardGate,
    current: cur.value,
    current_p95: cur.p95,
    baseline: base.value,
    baseline_p95: base.p95,
    n1: n1Val?.value ?? null,
    n2: n2Val?.value ?? null,
    delta: Math.round(check.delta * 1000) / 1000,
    delta_pct: Number.isFinite(check.deltaPct)
      ? roundPct(check.deltaPct)
      : null,
    delta_pct_infinite: !Number.isFinite(check.deltaPct),
    regressed,
    advisory,
    accepted: acceptanceInfo,
    stale_acceptance: staleAcceptance,
    status,
  };
}

/**
 * Compare validated current perf-metrics against baseline (N-3 or earliest valid).
 */
export function comparePerfMetrics({
  current,
  baseline = null,
  n1 = null,
  n2 = null,
  accepted = [],
  baselineDepth = baseline ? 'N-3' : 'bootstrap',
  thresholdPct = DEFAULT_THRESHOLD_PCT,
  ciWallMinDeltaMs = DEFAULT_CI_WALL_MIN_DELTA_MS,
  requireBaseline = false,
  requireN3 = false,
}) {
  validatePerfMetrics(current, 'current');
  if (baseline !== null) validatePerfMetrics(baseline, 'baseline');
  if (n1 !== null) validatePerfMetrics(n1, 'n1');
  if (n2 !== null) validatePerfMetrics(n2, 'n2');
  const validatedAccepted = validateAcceptedEntries(accepted);

  const metrics = [];

  for (const field of ALL_BENCHMARK_KEYS) {
    const isTimingMs = field.endsWith('_ms');
    const row = evaluateSingleMetric({
      key: `benchmarks.${field}`,
      category: 'benchmarks',
      field,
      unit: isTimingMs ? 'ms' : 'count',
      isDeterministicHardGate: !isTimingMs,
      current,
      baseline,
      n1,
      n2,
      accepted: validatedAccepted,
      thresholdPct,
      ciWallMinDeltaMs,
      requireN3,
    });
    if (row) metrics.push(row);
  }

  for (const field of ARTIFACT_SIZE_KEYS) {
    const row = evaluateSingleMetric({
      key: `artifacts_bytes.${field}`,
      category: 'artifacts_bytes',
      field,
      unit: 'bytes',
      isDeterministicHardGate: true,
      current,
      baseline,
      n1,
      n2,
      accepted: validatedAccepted,
      thresholdPct,
      ciWallMinDeltaMs,
      requireN3,
    });
    if (row) metrics.push(row);
  }

  for (const field of CI_WALL_KEYS) {
    const row = evaluateSingleMetric({
      key: `ci_wall_ms.${field}`,
      category: 'ci_wall_ms',
      field,
      unit: 'ms',
      isDeterministicHardGate: false,
      current,
      baseline,
      n1,
      n2,
      accepted: validatedAccepted,
      thresholdPct,
      ciWallMinDeltaMs,
      requireN3,
    });
    if (row) metrics.push(row);
  }

  const mapSummary = m => ({
    key: m.key,
    category: m.category,
    current: m.current,
    baseline: m.baseline,
    delta: m.delta,
    delta_pct: m.delta_pct,
    delta_pct_infinite: Boolean(m.delta_pct_infinite),
  });

  const regressedMetrics = metrics.filter(m => m.regressed).map(mapSummary);
  const advisoryMetrics = metrics.filter(m => m.advisory).map(mapSummary);
  const acceptedMetrics = metrics
    .filter(
      m =>
        m.status === 'ACCEPTED' ||
        m.status === 'ACCEPTED_BOOTSTRAP' ||
        m.status === 'ACCEPTED_DROP'
    )
    .map(m => ({
      ...mapSummary(m),
      unit: m.unit,
      action: m.accepted?.action ?? 'ceiling',
      accepted_value: m.accepted?.accepted_value ?? null,
      reason: m.accepted?.reason ?? null,
    }));
  const staleAcceptances = metrics
    .filter(m => m.stale_acceptance !== null)
    .map(m => m.stale_acceptance);
  if (baseline !== null) {
    for (const acc of validatedAccepted) {
      if (acc.action === 'drop' && !metrics.some(m => m.key === acc.metric)) {
        staleAcceptances.push({
          key: acc.metric,
          unit: '',
          action: 'drop',
          baseline: null,
          current: null,
          accepted_value: null,
          reason: acc.reason,
        });
      }
    }
  }

  const resolvedDepth = baseline ? baselineDepth : 'bootstrap';
  const missingRequiredBaseline = Boolean(
    (requireBaseline || requireN3) && baseline === null
  );
  const invalidN3Depth = Boolean(requireN3 && resolvedDepth !== 'N-3');
  const hasHardRegression =
    regressedMetrics.length > 0 || missingRequiredBaseline || invalidN3Depth;
  const hasAdvisorySlowdown = advisoryMetrics.length > 0;

  return {
    schema_version: 1,
    baseline_depth: resolvedDepth,
    current_commit: current.commit ?? null,
    baseline_commit: baseline?.commit ?? null,
    n1_commit: n1?.commit ?? null,
    n2_commit: n2?.commit ?? null,
    threshold_pct: thresholdPct,
    ci_wall_min_delta_ms: ciWallMinDeltaMs,
    has_hard_regression: hasHardRegression,
    has_advisory_slowdown: hasAdvisorySlowdown,
    needs_perf_investigation: hasHardRegression,
    regressed_metrics: regressedMetrics,
    advisory_metrics: advisoryMetrics,
    accepted_metrics: acceptedMetrics,
    stale_acceptances: staleAcceptances,
    metrics,
  };
}

function formatValue(value, unit) {
  if (value === null || value === undefined) return '—';
  if (unit === 'bytes') {
    return `${Math.round(value).toLocaleString('en-US')} B`;
  }
  if (unit === 'ms') {
    return `${Number(value).toFixed(2)} ms`;
  }
  return String(value);
}

function formatDeltaPct(metric) {
  if (
    metric.status === 'BOOTSTRAP' ||
    metric.status === 'ACCEPTED_BOOTSTRAP'
  ) {
    return '—';
  }
  if (metric.status === 'DROPPED' || metric.status === 'ACCEPTED_DROP') {
    return 'DROPPED';
  }
  if (metric.delta_pct_infinite) return '+inf%';
  if (metric.delta_pct === null) return '—';
  const sign = metric.delta_pct > 0 ? '+' : '';
  return `${sign}${metric.delta_pct.toFixed(2)}%`;
}

function shortSha(sha) {
  return sha ? String(sha).slice(0, 10) : 'none';
}

export function renderMarkdownSummary(verdict) {
  const lines = [];
  const label = verdict.baseline_depth;
  const statusBadge = verdict.has_hard_regression
    ? 'REGRESSION DETECTED (`has_hard_regression: true`)'
    : verdict.baseline_depth === 'bootstrap'
      ? 'BOOTSTRAP (no prior baseline)'
      : verdict.has_advisory_slowdown
        ? 'PASS WITH ADVISORY SLOWDOWN (`has_hard_regression: false`, `has_advisory_slowdown: true`)'
        : 'PASS (`has_hard_regression: false`)';

  lines.push(`## Native Playground Performance Guardrail (${label})`);
  lines.push('');
  lines.push(`- **Status**: ${statusBadge}`);
  lines.push(`- **Current commit**: \`${shortSha(verdict.current_commit)}\``);
  lines.push(
    `- **Baseline (${label})**: \`${shortSha(verdict.baseline_commit)}\``
  );
  lines.push(
    `- **Hard gate**: deterministic byte sizes & work counters \`> ${verdict.threshold_pct}%\` | **Advisory**: \`benchmarks.*_ms\` \`> ${verdict.threshold_pct}%\`, \`ci_wall_ms\` \`> ${verdict.threshold_pct}%\` AND \`> ${verdict.ci_wall_min_delta_ms} ms\``
  );
  lines.push('');

  if (verdict.has_hard_regression && verdict.baseline_depth !== 'N-3') {
    lines.push('### Missing or Incomplete Required Baseline');
    lines.push('');
    lines.push(
      `- Prior baseline history check failed (resolved \`baseline_depth: ${verdict.baseline_depth}\`).`
    );
    lines.push('');
  }

  if (verdict.regressed_metrics.length > 0) {
    lines.push('### Hard Regressions');
    lines.push('');
    for (const item of verdict.regressed_metrics) {
      if (item.current === null) {
        lines.push(
          `- \`${item.key}\`: ${item.baseline} -> missing (DROPPED vs ${label})`
        );
        continue;
      }
      if (item.baseline === null) {
        lines.push(
          `- \`${item.key}\`: missing -> ${item.current} (UNACKNOWLEDGED BOOTSTRAP vs ${label})`
        );
        continue;
      }
      const pct = item.delta_pct_infinite
        ? '+inf%'
        : `+${Number(item.delta_pct).toFixed(2)}%`;
      lines.push(
        `- \`${item.key}\`: ${item.baseline} -> ${item.current} (${pct} vs ${label})`
      );
    }
    lines.push('');
  }

  if (verdict.advisory_metrics.length > 0) {
    lines.push('### Advisory Shared-Runner Slowdowns (Report-Only)');
    lines.push('');
    for (const item of verdict.advisory_metrics) {
      const pct = item.delta_pct_infinite
        ? '+inf%'
        : `+${Number(item.delta_pct).toFixed(2)}%`;
      lines.push(
        `- \`${item.key}\`: ${item.baseline} -> ${item.current} (${pct} vs ${label})`
      );
    }
    lines.push('');
  }

  if (verdict.accepted_metrics.length > 0) {
    lines.push('### Accepted Changes (`perf/accepted.json`)');
    lines.push('');
    for (const item of verdict.accepted_metrics) {
      if (item.action === 'bootstrap') {
        lines.push(
          `- \`${item.key}\`: missing -> ${item.current} (acknowledged bootstrap: ${item.reason})`
        );
        continue;
      }
      if (item.action === 'drop') {
        lines.push(
          `- \`${item.key}\`: ${item.baseline} -> missing (acknowledged drop: ${item.reason})`
        );
        continue;
      }
      const pct = item.delta_pct_infinite
        ? '+inf%'
        : `+${Number(item.delta_pct).toFixed(2)}%`;
      lines.push(
        `- \`${item.key}\`: ${item.baseline} -> ${item.current} (${pct} vs ${label}, accepted ceiling ${formatValue(item.accepted_value, item.unit)}: ${item.reason})`
      );
    }
    lines.push('');
  }

  if (verdict.stale_acceptances && verdict.stale_acceptances.length > 0) {
    lines.push('### Stale Acceptances (`perf/accepted.json`)');
    lines.push('');
    for (const item of verdict.stale_acceptances) {
      if (item.action === 'bootstrap') {
        lines.push(
          `- \`${item.key}\`: baseline ${formatValue(item.baseline, item.unit)} is now present in ${label} (safe to prune bootstrap entry: ${item.reason})`
        );
      } else if (item.action === 'drop') {
        lines.push(
          `- \`${item.key}\`: metric is no longer present in ${label} (safe to prune drop entry: ${item.reason})`
        );
      } else {
        lines.push(
          `- \`${item.key}\`: baseline ${formatValue(item.baseline, item.unit)} has reached accepted ceiling ${formatValue(item.accepted_value, item.unit)} (safe to prune: ${item.reason})`
        );
      }
    }
    lines.push('');
  }

  const hasHistory = verdict.metrics.some(m => m.n1 !== null || m.n2 !== null);
  const headerCols = [
    'Metric',
    `Baseline (${label})`,
    ...(hasHistory ? ['N-2', 'N-1'] : []),
    'Current',
    `Delta vs ${label}`,
    'Status',
  ];
  lines.push(`| ${headerCols.join(' | ')} |`);
  lines.push(`| ${headerCols.map(() => '---').join(' | ')} |`);

  for (const m of verdict.metrics) {
    const row = [
      `\`${m.key}\``,
      formatValue(m.baseline, m.unit),
      ...(hasHistory
        ? [formatValue(m.n2, m.unit), formatValue(m.n1, m.unit)]
        : []),
      formatValue(m.current, m.unit),
      formatDeltaPct(m),
      m.status,
    ];
    lines.push(`| ${row.join(' | ')} |`);
  }

  lines.push('');
  return `${lines.join('\n')}`;
}

function runGhApiJson(endpoint) {
  const stdout = execFileSync('gh', ['api', endpoint], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout);
}

/**
 * Strictly select an entry whose basename is `perf-metrics.json`.
 * Never falls back to arbitrary `*.json` files (such as `perf-verdict.json`).
 */
export function selectPerfMetricsZipEntry(entries) {
  const normalized = entries
    .map(e => String(e).trim())
    .filter(e => e.length > 0 && !e.endsWith('/'))
    .map(e => e.replace(/^\.\//, ''));

  const exact = normalized.find(e => e === 'perf-metrics.json');
  if (exact) return exact;

  const nested = normalized
    .filter(e => e.endsWith('/perf-metrics.json'))
    .sort(cmpCodeUnit);
  return nested.length > 0 ? nested[0] : null;
}

/**
 * Extract, parse, and strictly validate `perf-metrics.json` from a zip archive.
 */
export function extractPerfMetricsFromZip(zipPath) {
  let selectedEntry = null;
  try {
    const listing = execFileSync('unzip', ['-Z1', zipPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    selectedEntry = selectPerfMetricsZipEntry(listing.split(/\r?\n/));
  } catch {
    selectedEntry = null;
  }

  if (selectedEntry) {
    const extracted = execFileSync('unzip', ['-p', zipPath, selectedEntry], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return validatePerfMetrics(JSON.parse(extracted), `${zipPath}:${selectedEntry}`);
  }

  // Fallback when `unzip -Z1` is unavailable: try only exact and nested perf-metrics.json
  for (const pattern of ['perf-metrics.json', '*/perf-metrics.json']) {
    try {
      const extracted = execFileSync('unzip', ['-p', zipPath, pattern], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (extracted.trim().length > 0) {
        return validatePerfMetrics(JSON.parse(extracted), `${zipPath}:${pattern}`);
      }
    } catch {
      // try next candidate pattern
    }
  }

  throw new Error(`No valid perf-metrics.json entry found in zip: ${zipPath}`);
}

function downloadArtifactMetricsJson(repo, runId, artifactName) {
  const artifactsResp = runGhApiJson(
    `repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`
  );
  const artifact = (artifactsResp.artifacts ?? []).find(
    a => !a.expired && a.name === artifactName
  );
  if (!artifact) {
    return null;
  }

  const tmpZip = path.join(
    os.tmpdir(),
    `np-perf-${runId}-${process.pid}-${Date.now()}.zip`
  );
  try {
    const zipBytes = execFileSync(
      'gh',
      ['api', `repos/${repo}/actions/artifacts/${artifact.id}/zip`],
      { maxBuffer: 50 * 1024 * 1024 }
    );
    fs.writeFileSync(tmpZip, zipBytes);
    return extractPerfMetricsFromZip(tmpZip);
  } catch {
    return null;
  } finally {
    fs.rmSync(tmpZip, { force: true });
  }
}

/**
 * Walk eligible prior runs from oldest (`N-3`) down to newest (`N-1`) and
 * choose the oldest run whose artifact loader returns a valid perf-metrics
 * payload, plus load intermediate `N-1`/`N-2` payloads for trend & acceptance.
 */
export function resolveWindowFromEligibleRuns(eligibleRuns, loadRun) {
  const loaded = new Array(eligibleRuns.length).fill(null);

  let baselineIdx = -1;
  for (let i = eligibleRuns.length - 1; i >= 0; i -= 1) {
    const payload = loadRun(eligibleRuns[i]);
    if (payload) {
      try {
        validatePerfMetrics(payload, `run:${eligibleRuns[i].id ?? i}`);
        loaded[i] = payload;
        baselineIdx = i;
        break;
      } catch {
        // invalid artifact payload; fall back toward newer commit
      }
    }
  }

  if (baselineIdx === -1) {
    return {
      baseline: null,
      n1: null,
      n2: null,
      baselineDepth: 'bootstrap',
    };
  }

  // Load newer intermediate runs in the window (for N-1 / N-2 trends & accepted.json checks)
  for (let i = 0; i < baselineIdx; i += 1) {
    const payload = loadRun(eligibleRuns[i]);
    if (payload) {
      try {
        validatePerfMetrics(payload, `run:${eligibleRuns[i].id ?? i}`);
        loaded[i] = payload;
      } catch {
        loaded[i] = null;
      }
    }
  }

  const baseline = loaded[baselineIdx];
  const baselineDepth = `N-${baselineIdx + 1}`;
  const n1 = baselineIdx > 0 ? loaded[0] : null;
  const n2 = baselineIdx > 1 ? loaded[1] : null;

  return { baseline, n1, n2, baselineDepth };
}

function fetchGithubHistory({
  repo,
  branch,
  workflow,
  currentCommit,
  currentCreatedAt,
  runId,
  artifactName,
}) {
  const encodedBranch = encodeURIComponent(branch);
  const encodedWorkflow = encodeURIComponent(workflow);

  let anchorCreatedAt = currentCreatedAt ?? null;
  if (!anchorCreatedAt && runId) {
    const runResp = runGhApiJson(
      `repos/${repo}/actions/runs/${encodeURIComponent(runId)}`
    );
    anchorCreatedAt = runResp.created_at ?? null;
  } else if (!anchorCreatedAt && currentCommit) {
    try {
      const shaRunsResp = runGhApiJson(
        `repos/${repo}/actions/workflows/${encodedWorkflow}/runs?branch=${encodedBranch}&event=push&head_sha=${encodeURIComponent(
          currentCommit
        )}&per_page=10`
      );
      const shaRuns = (shaRunsResp.workflow_runs ?? [])
        .map(r => r.created_at)
        .filter(Boolean)
        .sort(cmpCodeUnit);
      if (shaRuns.length > 0) {
        anchorCreatedAt = shaRuns[0];
      }
    } catch {
      // best-effort anchor lookup
    }
  }

  const createdFilter = anchorCreatedAt
    ? `&created=${encodeURIComponent(`<=${anchorCreatedAt}`)}`
    : '';
  const baseEndpoint = `repos/${repo}/actions/workflows/${encodedWorkflow}/runs?branch=${encodedBranch}&event=push&status=completed&per_page=30${createdFilter}`;

  const collectedRuns = [];
  let selection = { eligibleRuns: [] };
  for (let page = 1; page <= 3; page += 1) {
    const resp = runGhApiJson(`${baseEndpoint}&page=${page}`);
    const pageRuns = resp.workflow_runs ?? [];
    collectedRuns.push(...pageRuns);
    selection = selectBaselineRun(collectedRuns, {
      currentCommit,
      currentCreatedAt: anchorCreatedAt,
    });
    if (selection.eligibleRuns.length >= 3 || pageRuns.length < 30) {
      break;
    }
  }

  if (selection.eligibleRuns.length === 0) {
    return {
      baseline: null,
      n1: null,
      n2: null,
      baselineDepth: 'bootstrap',
    };
  }

  return resolveWindowFromEligibleRuns(selection.eligibleRuns, run =>
    downloadArtifactMetricsJson(repo, run.id, artifactName)
  );
}

export function parseArgs(argv) {
  const opts = {
    current: null,
    currentCreatedAt: null,
    runId: null,
    baseline: null,
    n1: null,
    n2: null,
    accepted: null,
    fetchGithub: false,
    repo: null,
    branch: null,
    workflow: null,
    artifactName: DEFAULT_ARTIFACT_NAME,
    thresholdPct: DEFAULT_THRESHOLD_PCT,
    ciWallMinDeltaMs: DEFAULT_CI_WALL_MIN_DELTA_MS,
    markdownOut: null,
    jsonOut: null,
    failOnRegression: false,
    requireBaseline: false,
    requireN3: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return argv[i];
    };

    switch (arg) {
      case '--current':
        opts.current = next();
        break;
      case '--current-created-at':
        opts.currentCreatedAt = next();
        break;
      case '--run-id':
        opts.runId = next();
        break;
      case '--baseline':
        opts.baseline = next();
        break;
      case '--n1':
        opts.n1 = next();
        break;
      case '--n2':
        opts.n2 = next();
        break;
      case '--accepted':
        opts.accepted = next();
        break;
      case '--fetch-github':
        opts.fetchGithub = true;
        break;
      case '--repo':
        opts.repo = next();
        break;
      case '--branch':
        opts.branch = next();
        break;
      case '--workflow':
        opts.workflow = next();
        break;
      case '--artifact-name':
        opts.artifactName = next();
        break;
      case '--threshold-pct':
        opts.thresholdPct = Number(next());
        break;
      case '--ci-wall-min-delta-ms':
        opts.ciWallMinDeltaMs = Number(next());
        break;
      case '--markdown-out':
        opts.markdownOut = next();
        break;
      case '--json-out':
        opts.jsonOut = next();
        break;
      case '--fail-on-regression':
        opts.failOnRegression = true;
        break;
      case '--require-baseline':
        opts.requireBaseline = true;
        break;
      case '--require-n3':
        opts.requireN3 = true;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(
      'Usage: compare-n3.mjs --current <file> [--current-created-at <iso>] [--baseline <file> | --fetch-github --repo <owner/repo> --branch <branch> --workflow <file>] [--n1 <file>] [--n2 <file>] [--accepted <file>] [--threshold-pct 10] [--ci-wall-min-delta-ms 15000] [--markdown-out <file>] [--json-out <file>] [--require-baseline] [--require-n3] [--fail-on-regression]'
    );
    return 0;
  }

  if (!opts.current) {
    throw new Error('--current <perf-metrics.json> is required');
  }
  if (!Number.isFinite(opts.thresholdPct) || opts.thresholdPct < 0) {
    throw new Error('--threshold-pct must be a non-negative number');
  }
  if (!Number.isFinite(opts.ciWallMinDeltaMs) || opts.ciWallMinDeltaMs < 0) {
    throw new Error('--ci-wall-min-delta-ms must be a non-negative number');
  }

  const current = validatePerfMetrics(readJsonFile(opts.current), opts.current);
  let baseline = null;
  let n1 = opts.n1 ? validatePerfMetrics(readJsonFile(opts.n1), opts.n1) : null;
  let n2 = opts.n2 ? validatePerfMetrics(readJsonFile(opts.n2), opts.n2) : null;
  let baselineDepth = 'N-3';

  let accepted = [];
  if (opts.accepted) {
    accepted = validateAcceptedEntries(readJsonFile(opts.accepted), opts.accepted);
  } else if (fs.existsSync(DEFAULT_ACCEPTED_PATH)) {
    accepted = validateAcceptedEntries(
      readJsonFile(DEFAULT_ACCEPTED_PATH),
      DEFAULT_ACCEPTED_PATH
    );
  }

  if (opts.fetchGithub) {
    if (!opts.repo || !opts.branch || !opts.workflow) {
      throw new Error(
        '--fetch-github requires --repo, --branch, and --workflow'
      );
    }
    const fetched = fetchGithubHistory({
      repo: opts.repo,
      branch: opts.branch,
      workflow: opts.workflow,
      currentCommit: current.commit ?? null,
      currentCreatedAt: opts.currentCreatedAt,
      runId: opts.runId,
      artifactName: opts.artifactName,
    });
    baseline = fetched.baseline;
    n1 = n1 ?? fetched.n1;
    n2 = n2 ?? fetched.n2;
    baselineDepth = fetched.baselineDepth;
  } else if (opts.baseline) {
    baseline = validatePerfMetrics(readJsonFile(opts.baseline), opts.baseline);
    baselineDepth = 'N-3';
  } else {
    baselineDepth = 'bootstrap';
  }

  const verdict = comparePerfMetrics({
    current,
    baseline,
    n1,
    n2,
    accepted,
    baselineDepth,
    thresholdPct: opts.thresholdPct,
    ciWallMinDeltaMs: opts.ciWallMinDeltaMs,
    requireBaseline: opts.requireBaseline,
    requireN3: opts.requireN3,
  });

  const markdown = renderMarkdownSummary(verdict);

  if (opts.markdownOut) {
    fs.mkdirSync(path.dirname(path.resolve(opts.markdownOut)), {
      recursive: true,
    });
    fs.writeFileSync(opts.markdownOut, markdown, 'utf8');
  }

  if (opts.jsonOut) {
    fs.mkdirSync(path.dirname(path.resolve(opts.jsonOut)), {
      recursive: true,
    });
    fs.writeFileSync(
      opts.jsonOut,
      `${JSON.stringify(verdict, null, 2)}\n`,
      'utf8'
    );
  }

  if (!opts.markdownOut) {
    process.stdout.write(markdown);
  }

  if (
    (opts.failOnRegression && verdict.has_hard_regression) ||
    (opts.requireBaseline && baseline === null) ||
    (opts.requireN3 && (baseline === null || verdict.baseline_depth !== 'N-3'))
  ) {
    return 1;
  }
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const code = main(process.argv.slice(2));
    process.exitCode = code;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
