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

Each preview capability builds independently under the unified `packages/frontend/Cargo.toml` workspace for `wasm32-unknown-unknown` with `--no-default-features --features <feature>,wasm-worker` so the main Web application pays zero upfront preview bundle cost.

Production web packaging strips DWARF debug info (`debug = 0`) and post-processes every `.wasm` with Binaryen `wasm-opt -Oz --strip-debug --strip-producers`, selecting `opt-level = 3` (`--profile wasm-release`) for latency-sensitive `math` (`svg-raster` outline-only) and `pdf` (pure `hayro`, zero `resvg`/`usvg`) and `opt-level = "s"` (`--profile wasm-release-size`) for `mermaid` and `typst` (`svg-text`) so `typst` keeps comfortable headroom under Cloudflare Workers' 25 MiB single-asset limit without `opt-level = "z"` runtime slowdowns:

| Worker Feature | Profile | Stripped + `wasm-opt -Oz` Raw Size | `gzip -9` Size | Unstripped `--release` Raw (`debug = "limited"`) |
| --- | --- | ---: | ---: | ---: |
| `math,wasm-worker` (RaTeX + `svg-raster` outlines) | `wasm-release` (`opt-level = 3`) | ~3.72 MiB | ~1.40 MiB | 28.87 MiB |
| `pdf,wasm-worker` (`hayro 0.9.0`, zero `resvg`) | `wasm-release` (`opt-level = 3`) | ~3.99 MiB | ~1.74 MiB | 48.92 MiB |
| `mermaid,wasm-worker` (`merman 0.11.0` + `svg-text`) | `wasm-release-size` (`opt-level = "s"`) | ~15.53 MiB | ~5.79 MiB | 179.34 MiB |
| `typst,wasm-worker` (`typst 0.15.1` + `svg-text`) | `wasm-release-size` (`opt-level = "s"`) | ~21.08 MiB | ~7.96 MiB | 167.39 MiB |

## 4. Native Build and Toolchain Audit

- `math`, `mermaid`, and `pdf` are pure safe Rust with zero `cc` build scripts and zero native C or C++ libraries.
- `typst` depends on `stacker` -> `psm`, which compiles a small stack-probe assembly stub via `cc` on native targets (`wasm32-unknown-unknown` builds do not invoke `psm`).
- `blocksuite-preview` itself enforces `#![forbid(unsafe_code)]`, zero wall-clock calls, zero host font discovery, strict CSS color validation with XML attribute escaping, and zero external SVG `<image href>` filesystem or network resolution.
- Across the Wasm Worker boundary, Mermaid and Typst copy cached RGBA pixels once from the shared `Arc<RgbaImageBuffer>` (or move them via `Arc::try_unwrap` when unshared), while `take_pixels(&mut self)` eliminates a second clone on JS property access.

## 5. S1 Release Probe Measurements and Verification Boundaries

The `S1` host and preview validation suite runs both offline `--release` performance probes (`packages/common/store/tests/s1_sqlite_probe.rs` and `blocksuite/crates/preview/tests/s1_probes.rs`) and host link/unit gates (`packages/frontend/Cargo.toml`, Rust `1.98.1`, AMD Ryzen 7 PRO 8845HS Linux x86-64 for release probes, Apple M5 Max macOS for iOS Simulator linking).

### Release Probe Latency and Peak RSS (`--release`, Linux x86-64)

| Probe | Sample Size | `p50` (ms) | `p95` (ms) | `p99` (ms) | Peak RSS (`VmHWM`) |
| --- | --- | --- | --- | --- | --- |
| SQLite `BEGIN IMMEDIATE` 1,000-update batch (`s1_sqlite_probe`) | 20 rounds (`20,000` updates) | 82.40 | 96.06 | 189.35 | 7,320 KiB (`7.15 MiB`) |
| Mermaid 2x RGBA render + premultiplied PNG (`s1_probes`, Light + Dark) | 24 renders (12 Light, 12 Dark, 0 clipped px) | 6.44 | 8.49 | 8.79 | 75,360 KiB (`73.59 MiB`, with `Inter` + `IBM Plex Mono` + `NotoSansCJK`) |
| RaTeX `katex@0.18.10` math corpus (`s1_probes`) | 52-formula corpus (`51` valid rendered SVGs + `1` expected built-in macro rejection) | 0.112 | 0.215 | 0.238 | shared with preview probe process |
| Hayro PDF page 0 2x RGBA (`s1_probes`) | 15 renders | 0.058 | 0.070 | 0.210 | shared with preview probe process |

### Six-Probe Host Matrix and Honest Verification Boundaries

| Probe | Target Surface | Verified in `S1` CI and Release Probes | Deferred to `S2` (On-Device / Signed Package) |
| --- | --- | --- | --- |
| P1. WebGPU / WebGL2 fallback and CRDT flush barrier | `packages/frontend/hosts/web` | Disposable offscreen `<canvas>` GPU probe (never locks `#app-canvas`), `isLegacyShellUrl` redirect-loop guard, `webglcontextlost` runtime fallback, `blob:` / `about:blank` embed allowlist, strict sandbox allowlist, and CRDT flush abort barrier (`node --test hosts/web/tests/*.test.mjs`). | Live browser WebGPU device-loss telemetry on iOS Safari and Android Chrome. |
| P2. Single-probe four-edge safe-area redistribution | `packages/frontend/hosts/web` | Left-to-right notch flip `(0, 0, 0, 47)` to `(0, 47, 0, 0)` fires change callback with identical total width (`web-host.test.mjs`). | Physical device orientation flip under Safari toolbar collapse. |
| P3. Synchronous gesture-stack `#ime` focus and Turnstile isolation | `packages/frontend/hosts/web` | `focusImeInGesture` focuses `16px` `#ime` before microtasks; `index.html` CSP uses `script-src 'self' 'wasm-unsafe-eval'` with zero third-party domains; `sign-in.js` matches `/api/auth/captcha` (`{ provider: 'turnstile', siteKey, action }`) and sends `x-captcha-provider` / `x-captcha-token` headers (`web-host.test.mjs`). | End-to-end Cloudflare Turnstile challenge against staging backend. |
| P4. Frozen build-hash worker and font pinning | `packages/frontend/hosts/web` | `worker-loader.js` spawns four independent ES module `Blob` workers (`mermaid`, `math`, `typst`, `pdf`) anchored to site root across `affine_shell` changes; all four `blocksuite-preview` `wasm32-unknown-unknown` targets build cleanly; Node `worker_threads` nested-route E2E (`verify-preview-workers-e2e.mjs`) verifies Mermaid Light/Dark themes, RaTeX SVG, Typst with `loader.loadFont` static fonts, and transferable PDF RGBA pixels. | Deployed CDN cache-hit, on-demand CJK font pack delivery, and real worker instantiation in mobile browsers. |
| P5. Zero-CocoaPods iOS thin host and `capacitor://localhost` probe | `packages/frontend/hosts/ios` | `affine-ios-host` (`libaffine_ios_host.a`) compiles for `aarch64-apple-ios-sim` and links with `swiftc -emit-executable -framework Metal -laffine_ios_host` into a Mach-O arm64 binary; `MetalHostViewController` submits an observable first-frame `MTLRenderPassDescriptor` clear pass on `CAMetalLayer`; unit tests verify UTF-16 `replace_range`, `set_selected_range`, surrogate-pair deletion, absolute `ime_bottom` contract, weak `DisplayLinkProxy`, and in-memory `LegacyCapacitorSchemeHandler`. | Full `packages/frontend/mobile` and `ui` scene rendering over Metal and signed-app upgrade from legacy Capacitor iOS build on physical iPhone to read persisted `capacitor://localhost` `localStorage`. |
| P6. Thin JNI Android host and `https://localhost` probe | `packages/frontend/hosts/android` | `affine-android-host` builds `libaffine_android_host.so` via Android NDK (`aarch64-linux-android`, `x86_64-linux-android`); `MainActivity.kt` and `LegacyLocalStorageProbe.kt` compile with `kotlinc` against Android platform SDK (`android.jar`, zero AndroidX jars) using Platform SDK `Activity`, API 30 `WindowInsetsAnimation.Callback`, API 33 `OnBackInvokedCallback` / API 34 `OnBackAnimationCallback`, one-shot `SurfaceHolder.lockCanvas` clear on surface creation/resize, `AffineInputConnection` (direct `InputConnection` implementation backed solely by `AndroidHostState` with zero `Editable` mirror), and `204` non-probe interception; desktop JVM loads real `libaffine_android_host.so` through `AffineSurfaceView.createInputConnection` and `AffineInputConnection` to run 9 `InputConnection` parity sequences (`ImeHostParityCheckKt`); unit tests cover `jni_bridge::*` (including ARM64 TBI negative handles, real JNI UTF-16 `jstring` decoding, `setComposingRegion`, `deleteSurroundingTextInCodePoints`, and `replaceText`), predictive + legacy `BackGestureMachine`, API 26+ `should_expose_autofill`, absolute `ime_bottom` logical-`dp` conversion (including `0.75` `ldpi`), and `https://localhost` allowlist parsing. | Full `packages/frontend/mobile` and `ui` scene rendering, complete `InputConnection` semantics, wgpu `Surface` takeover (removing the S1 one-shot `lockCanvas` clear), and signed-APK upgrade from legacy Capacitor Android build on physical device to read persisted `https://localhost` `localStorage`. |

Mermaid Light and Dark visual evidence is rendered offline at `2.0x` scale with `blocksuite-preview` (`merman 0.11.0`, `SvgPipeline::resvg_safe()`, `DeterministicTextMeasurer::with_width_callback` backed by `FontPoolWidthMeasurer` with variable-font `HVAR` instantiation, `'look': 'classic'`, and `MermaidTheme::{Light, Dark}` with WCAG-verified pie palettes) across 12 cases (`flowchart`, `sequence`, `state`, `class`, `pie`, `er`, `gantt`, `gitgraph`, `wrapped-latin`, `wrapped-cjk`, `generic-class`, and `frontmatter`) with `clipped_pixels = 0`.

