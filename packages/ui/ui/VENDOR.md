# Vendored Provenance

`crates/ui` is a single fused internal GPU UI library derived from `longbridge/gpui-fast` (Apache-2.0, derived from Zed Industries' GPUI) and vendored once with no upstream sync hooks.

- **Upstream source**: `longbridge/gpui-fast`
- **Commit SHA**: `c58d957`
- **License**: Apache-2.0 (see upstream LICENSE notices preserved in source headers where applicable)
- **Fused crates**: `gpui`, `scheduler`, `collections`, `refineable`, `path`, `util`, `gpui_util`, `gpui_shared_string`, `gpui_apple`, `gpui_macos`, `gpui_wgpu`, and single-threaded `gpui_web`.
- **Removed subsystems**: `compat/gpui-pre*`, `gpui_windows`, `gpui_ios`, `gpui_linux` X11/Wayland desktop windowing, `gpui_perf`/`bench_metrics`/`profiler`, `http_client*`/`reqwest_client`, `zlog`/`ztracing*`, `sum_tree`/`elements/list.rs`/`fast/list_measure.rs`, `fast/layers/`, `fast/composition*`, `fast/dynamic_textures.rs`, accessibility (`_accessibility`/`fast/a11y.rs`), `gestures.rs`, `scap`, `schemars`, `inventory`, `wasm_thread`, and all internal proc-macro crates (`gpui_macros`, `derive_refineable`, `util_macros`).
