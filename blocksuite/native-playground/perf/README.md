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

Current commit metrics are compared against the completed push run from **3 distinct prior commits (`N-3`)** strictly older than the commit under test (`--current-created-at` or the commit's earliest push run on the branch). If `N-3` has no valid `perf-metrics.json` artifact, the comparator walks back `N-3 -> N-2 -> N-1` and uses the oldest valid baseline; with 0 valid prior baselines it emits a clean `bootstrap` pass.

1. **Deterministic hard gate (`artifacts_bytes.*` and non-`_ms` work counters under `benchmarks.*`)**:
   - Flagged as `REGRESSED` (`regressed: true`, sets `has_hard_regression: true`) whenever `(current - baseline) / baseline * 100 > 10.0%` (strictly greater than `--threshold-pct`), or when `baseline === 0` and `current > 0`.
   - `--fail-on-regression` exits `1` only when `has_hard_regression` is `true`.
2. **Shared-runner wall-clock advisories (`benchmarks.*_ms` and `ci_wall_ms.*`)**:
   - `benchmarks.*_ms` exceeding `> 10.0%`, and `ci_wall_ms.*` exceeding both `> 10.0%` and `> 15000` ms (`--ci-wall-min-delta-ms`), are reported as `ADVISORY_SLOWDOWN` (`advisory: true`, `regressed: false`, sets `has_advisory_slowdown: true`).
   - Advisory timings are surfaced in the Markdown summary and `advisory_metrics` in `perf-verdict.json` for investigation on pinned hardware without failing shared-runner CI.

## Regression Acknowledgements (`accepted.json`)

Intentional increases (for example, adding a new bundled feature that grows `web_wasm_gzip`) are recorded as value-ceiling entries in `perf/accepted.json` (loaded by default, or via `--accepted <path>`):

```json
[
  {
    "metric": "artifacts_bytes.web_wasm_gzip",
    "accepted_value": 800000,
    "reason": "Bundled new rich-text feature"
  }
]
```

- When a metric triggers against the rolling baseline and `current <= accepted_value`, the row is marked `ACCEPTED` (`regressed: false`) while still printing `baseline`, `current`, `delta`, and the accepted ceiling.
- If `current > accepted_value`, it is not accepted (`REGRESSED` for deterministic hard-gate metrics, `ADVISORY_SLOWDOWN` for timings).
- Once the rolling `N-3` baseline catches up (`baseline >= accepted_value`), the entry is reported in `stale_acceptances` (strictly report-only; never fails CI) so it can be pruned cleanly.

## Usage

```sh
node blocksuite/native-playground/perf/compare-n3.mjs \
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
node --test blocksuite/native-playground/perf/compare-n3.test.mjs
```
