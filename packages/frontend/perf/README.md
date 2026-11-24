# Native Playground CI Performance Guardrail

Zero-dependency `N-3` regression detector for `darksky/native-playground`.

## Metrics Schema (`schema.json`)

Every CI run emits `perf-metrics.json` containing:

- `schema_version`: integer `1`.
- `commit`: full 40-character lowercase Git SHA.
- `timestamp_utc`: ISO-8601 UTC timestamp.
- `ci_wall_ms`: shared-runner wall-clock durations (`lint_and_wasm`, `headless_linux`, `total_critical_path`).
- `artifacts_bytes`: deterministic build output sizes (`web_wasm_raw`, `web_wasm_gzip`, `headless_bin`).
- `benchmarks`: deterministic engine timings (`{ median, p95 }`, with `p95 >= median`) and work counters:
  - `doc_1k_edits_ms`
  - `room_sync_1k_ops_ms`
  - `layout_10k_blocks_cold_ms`
  - `layout_single_keystroke_ms`
  - `layout_single_keystroke_blocks_relayout`
  - `edgeless_1k_pan_zoom_frame_ms`
  - `headless_frame_render_ms`

Individual sub-keys inside `ci_wall_ms`, `artifacts_bytes`, and `benchmarks` are optional (or `null`) when a benchmark or artifact is not yet produced by CI. Never emit synthetic `0` placeholders for unmeasured metrics: omitted or `null` baseline keys transition cleanly through `BOOTSTRAP` when first introduced instead of triggering false `0 -> positive` (`+inf%`) regressions.

## Regression Gate vs Advisory Timings

Current commit metrics are compared against the completed push run from **3 distinct prior commits (`N-3`)** strictly older than the commit under test (`--current-created-at` or the commit's earliest push run on the branch).

- **Library / seeding mode (default)**: If `N-3` has no valid `perf-metrics.json` artifact, the comparator walks `N-3 -> N-2 -> N-1`; with 0 valid prior baselines (such as the initial seeding runs of a new integration branch like `darksky/np/mobile` before 3 runs exist) it emits `baseline_depth: "bootstrap"`. `--require-baseline` requires at least `N-1` (`baseline !== null`).
- **Strict `N-3` CI mode (`--require-n3`)**: Used on established branches (`native-playground.yml`). Requires `baseline_depth === "N-3"`, a 40-char `baseline_commit`, zero unacknowledged `DROPPED` metrics (`baseline != null && current == null`), and zero unacknowledged `BOOTSTRAP` metrics (`baseline == null && current != null`). If all prior artifacts expire after retention, set `NP_ALLOW_PERF_BOOTSTRAP=1` for 3 seeding runs on the integration branch to re-establish `N-3`.

1. **Deterministic hard gate (`artifacts_bytes.*`, non-`_ms` work counters under `benchmarks.*`, and unacknowledged `DROPPED` / `--require-n3` `BOOTSTRAP` metrics)**:
   - Flagged as `REGRESSED` (`DROPPED` when missing in `current`, `BOOTSTRAP` when missing in `N-3` under `--require-n3`; sets `has_hard_regression: true`) whenever `(current - baseline) / baseline * 100 > 10.0%` (strictly greater than `--threshold-pct`), or when `baseline === 0` and `current > 0`.
   - `--fail-on-regression` exits `1` when `has_hard_regression` is `true`.
2. **Shared-runner wall-clock advisories (`benchmarks.*_ms` and `ci_wall_ms.*`)**:
   - `benchmarks.*_ms` exceeding `> 10.0%`, and `ci_wall_ms.*` exceeding both `> 10.0%` and `> 15000` ms (`--ci-wall-min-delta-ms`), are reported as `ADVISORY_SLOWDOWN` (`advisory: true`, `regressed: false`, sets `has_advisory_slowdown: true`).
   - Advisory timings are surfaced in the Markdown summary and `advisory_metrics` in `perf-verdict.json` for investigation on pinned hardware without failing shared-runner CI.

## Lifecycle & Regression Acknowledgements (`accepted.json`)

Intentional increases, newly introduced metrics, and retired metrics are recorded in `perf/accepted.json` (loaded by default, or via `--accepted <path>`):

```json
[
  {
    "metric": "artifacts_bytes.web_wasm_gzip",
    "accepted_value": 800000,
    "reason": "Bundled new rich-text feature"
  },
  {
    "metric": "artifacts_bytes.headless_bin",
    "action": "bootstrap",
    "reason": "Newly introduced metric rolling into N-3"
  },
  {
    "metric": "benchmarks.layout_single_keystroke_blocks_relayout",
    "action": "drop",
    "reason": "Retired obsolete counter"
  }
]
```

- **Value ceiling (`action: "ceiling"`, default)**: When a metric triggers against the rolling baseline and `current <= accepted_value`, the row is marked `ACCEPTED` (`regressed: false`). Once `baseline >= accepted_value`, it is reported in `stale_acceptances`.
- **Intentional new metric (`action: "bootstrap"`)**: Marks `baseline == null && current != null` as `ACCEPTED_BOOTSTRAP` (`regressed: false`) under `--require-n3` for the 3-commit rolling window; once `N-3` includes the metric, it is reported in `stale_acceptances` for pruning.
- **Intentional metric removal (`action: "drop"`)**: Marks `baseline != null && current == null` as `ACCEPTED_DROP` (`regressed: false`); once `N-3` no longer contains the metric, it is reported in `stale_acceptances` for pruning.

## Usage

```sh
node packages/frontend/perf/compare-n3.mjs \
  --fetch-github \
  --repo toeverything/AFFiNE \
  --branch darksky/native-playground \
  --workflow native-playground.yml \
  --run-id "$GITHUB_RUN_ID" \
  --current artifacts/perf-metrics.json \
  --json-out artifacts/perf-verdict.json \
  --fail-on-regression
```

## Self-Tests

```sh
node --test packages/frontend/perf/compare-n3.test.mjs
```
