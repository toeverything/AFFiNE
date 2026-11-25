# Preview Kernel Benchmark and Engine Selection

This document records empirical measurements for `blocksuite-preview` inside the unified client Cargo workspace (`packages/frontend/Cargo.toml`, Rust 1.98.1, `[profile.release]` with `debug = "limited"`, `lto = "thin"`, `codegen-units = 1`).

## 1. LaTeX Math Engine Selection

We evaluated two Rust math pipelines against `tests/fixtures/katex_v0275_metrics.json`, a 52-formula corpus captured from `katex@0.18.10` (the exact `0.27.5` `yarn.lock` version). The corpus contains 48 main formulas (subscripts, fractions, roots, matrices, sums, integrals, limits, Greek symbols, math alphabets, `\text{CJK}`, `aligned`, `cases`, `array`, `\left...\right`, accents, logic operators, and boxed color expressions) plus four AFFiNE edge cases.

### Summary Comparison

| Metric | RaTeX (`0.1.16`, pure `<path>` outlines via `ratex-katex-fonts` + `FontPool`) | `mitex 0.2.4` + `InMemoryTypstWorld` (`0.15.1`) |
| --- | --- | --- |
| 48-formula main corpus pass rate | **48 / 48 (100.0%)** with registered CJK font (`45 / 48` with empty `FontPool`; 3 CJK formulas return `MissingGlyphFont`) | 40 / 48 (83.3%) with custom Typst prelude (8 formulas fail on missing Typst helpers or symbol modifiers) |
| 52-formula full corpus pass rate | **51 / 52 (98.1%)** with registered CJK font | 42 / 52 (80.8%) with custom Typst prelude |
| `katex@0.18.10` vertical metric agreement (`height_em` and `depth_em`) | **48 / 48 (100.0%)** non-CJK formulas: **43 / 48 within `<= 0.005 em`** and **5 / 48 named large-operator/accent/delimiter cases within `<= 0.085 em`** | Outer Typst page frame reports `descent_pt = 0.00` on inline fractions |
| `katex@0.18.10` horizontal width agreement (`width_em`, 48 non-CJK formulas, headless Chromium CSS + `.woff2` fonts) | **`p50 = 0.01%`**, **`p90 = 1.95%`**, **48 / 48 (100.0%) within `<= 10%`** (max `8.01%` on `nth_root`) | Not comparable to KaTeX DOM box widths |
| Release batch throughput (3 runs, `>= 300 ms` per run, AMD Ryzen 7 PRO 8845HS) | 3,072 renders (`48 x 64`) in **`421 / 443 / 419 ms`** (`~0.14 ms` per formula) | Requires Typst page layout per formula (`~0.3` to `0.4 ms` per formula in R1) |
| Host font isolation (`cargo tree -p blocksuite-preview --no-default-features --features math,wasm-worker`) | **Zero** `ratex-svg`, `ratex-font-loader`, `ratex-unicode-font`, `system-fonts`, `sys-locale`, or `fontconfig-parser` on both native and `wasm32-unknown-unknown` | Zero host font loading (`InMemoryTypstWorld` rejects empty `FontPool` with `no font could be found`) |

### Baseline Metric Samples (`16 pt` base size)

| Sample | RaTeX (`width / ascent / descent pt`) | `katex@0.18.10` (`height / depth em` at `16 pt`) |
| --- | --- | --- |
| `E = mc^2` | `61.44 / 13.03 / 0.00` | `0.814 / 0.000 em` (`13.03 / 0.00 pt`) |
| `x_{i,j}^{n+1} + y_k^{(2)}` | `74.06 / 16.72 / 6.61` | `1.045 / 0.413 em` (`16.72 / 6.61 pt`) |
| `\frac{a+b}{c+d}` | `23.28 / 14.08 / 6.45` | `0.880 / 0.403 em` (`14.08 / 6.45 pt`) |

### Selection Decision and Edge-Case Ledger

RaTeX wins on corpus coverage, tight KaTeX box-metric parity (`<= 0.005 em` on 43 of 48 non-CJK formulas and `<= 0.085 em` on all 48), pure `<path>` outline determinism (zero `<text>` elements), latency, and Wasm bundle size. We ship RaTeX directly from `ratex-layout::to_display_list` plus `ratex-katex-fonts` and explicit `FontPool` outlines as the production `math` backend, and keep `InMemoryTypstWorld` under the separate `typst` feature for native Typst code blocks.

| Edge Case | RaTeX | `mitex` + Typst | Notes |
| --- | --- | --- | --- |
| `\def\arraystretch{1.5}` + `\hdashline` array | Pass | Fail (`unknown command: \arraystretch`) | Matches AFFiNE `inline.spec.ts` fixture. |
| `\vcenter{\hbox{...}}` | Pass | Fail (`unknown command: \vcenter`) | Matches AFFiNE `inline.spec.ts` highlight fixture. |
| `\newcommand{\myvec}[1]{\mathbf{#1}}\myvec{v}` | Pass | Pass | Custom macro definitions work in RaTeX. |
| `\newcommand{\R}{\mathbb{R}}\R^n` | Error (`redefine \R`) | Pass | Fails because `\R` is a built-in RaTeX macro. Authors must use `\renewcommand{\R}` or a distinct macro name. |

## 2. Mermaid 2x RGBA Footprint and Cache Calibration

All nine diagram families ran through `merman 0.11.0` with `SvgPipeline::resvg_safe()` (zero `<foreignObject>` elements) and explicit `PreviewDate` plus timezone offset injection (`try_with_fixed_local_offset_minutes` and `try_with_fixed_today_at_local_midnight`), then rasterized at `2.0x` scale via `SvgRasterizer`.

| Diagram Family | 2x Pixel Dimensions | RGBA8 Bytes | Size (KiB) |
| --- | --- | --- | --- |
| `flowchart` | `720 x 836` | 2,407,680 | 2,351.2 |
| `flowchart_cjk` | `1104 x 122` | 538,752 | 526.1 |
| `sequence` (CJK) | `900 x 562` | 2,023,200 | 1,975.8 |
| `class` | `384 x 622` | 955,392 | 933.0 |
| `state` | `304 x 874` | 1,062,784 | 1,037.9 |
| `er` | `270 x 922` | 995,760 | 972.4 |
| `gantt` (CJK) | `1600 x 296` | 1,894,400 | 1,850.0 |
| `pie` (CJK) | `1160 x 900` | 4,176,000 | 4,078.1 |
| `gitgraph` | `541 x 329` | 711,956 | 695.3 |

The nine-family mean is 1,602 KiB (1.56 MiB) and the peak is 4,078 KiB (3.98 MiB). Setting `CacheLimits::MOBILE_DEFAULT` to `max_entries = 64` and `max_bytes = 32 MiB` holds about 20 full-size 2x Mermaid diagrams or 64 smaller formula tiles while `PinnedPixelCache` protects all visible on-screen entries from eviction and skips oversized unpinned entries without wiping live cache contents.

## 3. Standalone WebAssembly Worker Sizes

Each preview capability builds independently under the unified `packages/frontend/Cargo.toml` workspace for `wasm32-unknown-unknown --release` with `--no-default-features --features <feature>,wasm-worker` so the main Web application pays zero upfront preview bundle cost.

The unified workspace `[profile.release]` sets `debug = "limited"`, `lto = "thin"`, and `codegen-units = 1`, which preserves DWARF custom sections in raw `.wasm` output. Production web packaging strips custom debug sections via `wasm-bindgen` and `wasm-opt` (in R1 stripped standalone builds with `opt-level = "s"` and `strip = true`, `gzip -9` sizes were 1.15 MiB for `math`, 1.77 MiB for `pdf`, 5.05 MiB for `mermaid`, and 7.70 MiB for `typst`).

| Worker Feature | Unified Workspace Raw `.wasm` Bytes | Raw Size (`debug = "limited"`) | Unified Workspace `gzip -9` Bytes | `gzip -9` Size |
| --- | --- | --- | --- | --- |
| `math,wasm-worker` (RaTeX + outlines) | 30,270,736 | 28.87 MiB | 7,760,539 | 7.40 MiB |
| `pdf,wasm-worker` (`hayro 0.9.0`) | 51,300,697 | 48.92 MiB | 11,484,798 | 10.95 MiB |
| `typst,wasm-worker` (`typst 0.15.1`) | 175,521,113 | 167.39 MiB | 37,523,574 | 35.79 MiB |
| `mermaid,wasm-worker` (`merman 0.11.0`) | 188,055,986 | 179.34 MiB | 40,001,096 | 38.15 MiB |

## 4. Native Build and Toolchain Audit

- `math`, `mermaid`, and `pdf` are pure safe Rust with zero `cc` build scripts and zero native C or C++ libraries.
- `typst` depends on `stacker` -> `psm`, which compiles a small stack-probe assembly stub via `cc` on native targets (`wasm32-unknown-unknown` builds do not invoke `psm`).
- `blocksuite-preview` itself enforces `#![forbid(unsafe_code)]`, zero wall-clock calls, zero host font discovery, strict CSS color validation with XML attribute escaping, and zero external SVG `<image href>` filesystem or network resolution.
- Across the Wasm Worker boundary, Mermaid and Typst copy cached RGBA pixels once from the shared `Arc<RgbaImageBuffer>` (or move them via `Arc::try_unwrap` when unshared), while `take_pixels(&mut self)` eliminates a second clone on JS property access.
