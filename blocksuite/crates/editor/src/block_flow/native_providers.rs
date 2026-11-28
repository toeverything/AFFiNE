//! Built-in native preview providers (`MathPreviewProvider`, `PdfPageProvider`, and
//! async byte-budgeted `CodePreviewProvider`) backed by `blocksuite-preview`
//! (RaTeX + Hayro + Merman + optional Typst).

use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{Arc, Condvar, Mutex, Once, OnceLock, RwLock, Weak},
};

#[cfg(feature = "preview-typst")]
use blocksuite_preview::typst_world::InMemoryTypstWorld;
#[cfg(feature = "preview-typst")]
use blocksuite_preview::{FontPool, SvgRasterizer};
use blocksuite_preview::{
    RasterOptions,
    math::{MathDisplayMode, MathRenderOptions, render_latex_rgba},
    mermaid::{MermaidOptions, MermaidRenderer, MermaidTheme},
    pdf::{HayroPdfRenderer, PdfPageRenderer, PdfRenderRequest},
};
use ui::{Hsla, RenderImage};

use crate::theme::PlaygroundTheme;

use super::{
    CodePreviewKind, CodePreviewProvider, CodePreviewResult, CodePreviewSlot, MathPreviewProvider,
    MathRenderResult, MathRenderSlot, PdfPageCount, PdfPageProvider, PdfPreviewPage,
    code_preview::{
        bump_code_preview_revision, has_code_preview_provider, has_math_preview_provider,
        has_pdf_page_provider, notify_preview_wakeup,
    },
    native_fonts::acquire_code_preview_fonts,
    preview::{
        hsla_to_css_hex, rgba_buffer_to_render_image, shared_font_pool, shared_svg_rasterizer,
    },
    register_code_preview_provider, register_math_preview_provider, register_pdf_page_provider,
};

type MathKey = (String, bool, u32, String, u32);
type PdfPageKey = (String, usize, u32);
type CodePreviewKey = (CodePreviewKind, String, bool, u32);

/// Hard cap on any single rasterized code preview edge (`2048 px`, i.e. `<= 16 MiB` RGBA per
/// image; `buf.logical_width` / `logical_height` remain at true 1x logical points so tall
/// diagrams never shrink horizontally).
const MAX_CODE_PREVIEW_EDGE_PX: u32 = 2048;

/// Byte-budgeted strong pixel cache ceiling for native code previews (`32 MiB` mobile,
/// `64 MiB` desktop); active open previews held by `BlockFlow` upgrade in `O(1)` through
/// `live_weak` without thrashing or re-rendering.
#[cfg(any(target_os = "ios", target_os = "android"))]
const CODE_PREVIEW_CACHE_MAX_BYTES: usize = 32 * 1024 * 1024;
#[cfg(not(any(target_os = "ios", target_os = "android")))]
const CODE_PREVIEW_CACHE_MAX_BYTES: usize = 64 * 1024 * 1024;

const MAX_PENDING_CODE_JOBS: usize = 256;
const CODE_PREVIEW_WORKERS: usize = 2;

struct NativeMathPreviewProvider;

impl MathPreviewProvider for NativeMathPreviewProvider {
    fn render_math(
        &self,
        latex: &str,
        display: bool,
        font_size_pt: f32,
        color: Hsla,
        dpr: f32,
    ) -> MathRenderResult {
        let color_css = hsla_to_css_hex(color);
        let key: MathKey = (
            latex.to_string(),
            display,
            font_size_pt.to_bits(),
            color_css.clone(),
            dpr.to_bits(),
        );
        static CACHE: OnceLock<RwLock<(HashMap<MathKey, MathRenderResult>, VecDeque<MathKey>)>> =
            OnceLock::new();
        let cache = CACHE.get_or_init(|| RwLock::new((HashMap::new(), VecDeque::new())));
        if let Ok(guard) = cache.read()
            && let Some(hit) = guard.0.get(&key)
        {
            return hit.clone();
        }

        let options = MathRenderOptions {
            mode: if display {
                MathDisplayMode::Display
            } else {
                MathDisplayMode::Inline
            },
            font_size_pt: f64::from(font_size_pt),
            padding_pt: if display { 4.0 } else { 1.5 },
            color_css,
        };
        let rendered = match render_latex_rgba(
            latex,
            &options,
            shared_font_pool(),
            shared_svg_rasterizer(),
            dpr,
        ) {
            Ok(out) => match rgba_buffer_to_render_image(&out.image) {
                Some(image) => MathRenderResult::Ready(MathRenderSlot {
                    image,
                    width_pt: out.width_pt as f32,
                    ascent_pt: out.ascent_pt as f32,
                    descent_pt: out.descent_pt as f32,
                }),
                None => MathRenderResult::Error,
            },
            Err(_) => MathRenderResult::Error,
        };

        if let Ok(mut guard) = cache.write() {
            let (map, order) = &mut *guard;
            if !map.contains_key(&key) {
                while map.len() >= 1024 {
                    let Some(oldest) = order.pop_front() else {
                        break;
                    };
                    map.remove(&oldest);
                }
                order.push_back(key.clone());
            }
            map.insert(key, rendered.clone());
        }
        rendered
    }
}

struct NativePdfPageProvider;

impl PdfPageProvider for NativePdfPageProvider {
    fn page_count(&self, _cache_key: &str, bytes: &[u8]) -> PdfPageCount {
        match HayroPdfRenderer::from_bytes(bytes.to_vec()) {
            Ok(doc) => PdfPageCount::Ready(doc.page_count()),
            Err(_) => PdfPageCount::Invalid,
        }
    }

    fn render_pdf_page(
        &self,
        cache_key: &str,
        bytes: &[u8],
        page_index: usize,
        scale: f32,
    ) -> Option<PdfPreviewPage> {
        let key: PdfPageKey = (cache_key.to_string(), page_index, scale.to_bits());
        static CACHE: OnceLock<
            RwLock<(HashMap<PdfPageKey, PdfPreviewPage>, VecDeque<PdfPageKey>)>,
        > = OnceLock::new();
        let cache = CACHE.get_or_init(|| RwLock::new((HashMap::new(), VecDeque::new())));
        if !cache_key.is_empty()
            && let Ok(guard) = cache.read()
            && let Some(hit) = guard.0.get(&key)
        {
            return Some(hit.clone());
        }
        let renderer = HayroPdfRenderer::from_bytes(bytes.to_vec()).ok()?;
        let page_count = renderer.page_count();
        if page_index >= page_count {
            return None;
        }
        let buf = renderer
            .render_page(PdfRenderRequest::for_page(page_index, scale))
            .ok()?;
        let image = rgba_buffer_to_render_image(&buf)?;
        let page = PdfPreviewPage {
            page_index,
            page_count,
            image,
            width_pt: buf.logical_width.max(1.0),
            height_pt: buf.logical_height.max(1.0),
        };
        if !cache_key.is_empty()
            && let Ok(mut guard) = cache.write()
        {
            let (map, order) = &mut *guard;
            if !map.contains_key(&key) {
                while map.len() >= 64 {
                    let Some(oldest) = order.pop_front() else {
                        break;
                    };
                    map.remove(&oldest);
                }
                order.push_back(key.clone());
            }
            map.insert(key, page.clone());
        }
        Some(page)
    }
}

struct CachedCodeEntry {
    result: CodePreviewResult,
    bytes: usize,
    unread: bool,
}

struct ByteBudgetCodeCache {
    map: HashMap<CodePreviewKey, CachedCodeEntry>,
    order: VecDeque<CodePreviewKey>,
    live_weak: HashMap<CodePreviewKey, (Weak<RenderImage>, f32, f32)>,
    total_bytes: usize,
    max_bytes: usize,
}

impl Default for ByteBudgetCodeCache {
    fn default() -> Self {
        Self::with_max_bytes(CODE_PREVIEW_CACHE_MAX_BYTES)
    }
}

impl ByteBudgetCodeCache {
    fn with_max_bytes(max_bytes: usize) -> Self {
        Self {
            map: HashMap::new(),
            order: VecDeque::new(),
            live_weak: HashMap::new(),
            total_bytes: 0,
            max_bytes,
        }
    }

    fn get(&mut self, key: &CodePreviewKey) -> Option<CodePreviewResult> {
        if let Some(entry) = self.map.get_mut(key) {
            let was_unread = entry.unread;
            entry.unread = false;
            let out = entry.result.clone();
            if self.order.back() != Some(key) {
                self.order.retain(|k| k != key);
                self.order.push_back(key.clone());
            }
            if was_unread && self.total_bytes > self.max_bytes {
                self.trim_read_entries();
            }
            return Some(out);
        }
        if let Some((weak, width_pt, height_pt)) = self.live_weak.get(key) {
            if let Some(image) = weak.upgrade() {
                return Some(CodePreviewResult::Ready(CodePreviewSlot {
                    image,
                    width_pt: *width_pt,
                    height_pt: *height_pt,
                }));
            }
            self.live_weak.remove(key);
        }
        None
    }

    fn trim_read_entries(&mut self) {
        let mut idx = 0;
        while self.total_bytes > self.max_bytes && idx < self.order.len() {
            let cand = self.order[idx].clone();
            if self.map.get(&cand).is_some_and(|e| e.unread) {
                idx += 1;
                continue;
            }
            self.order.remove(idx);
            if let Some(evicted) = self.map.remove(&cand) {
                self.total_bytes = self.total_bytes.saturating_sub(evicted.bytes);
            }
        }
    }

    fn insert(
        &mut self,
        key: CodePreviewKey,
        result: CodePreviewResult,
        bytes: usize,
    ) -> Vec<CodePreviewKey> {
        if let CodePreviewResult::Ready(ref slot) = result {
            if self.live_weak.len() >= 256 {
                self.live_weak.retain(|_, (w, _, _)| w.strong_count() > 0);
            }
            self.live_weak.insert(
                key.clone(),
                (Arc::downgrade(&slot.image), slot.width_pt, slot.height_pt),
            );
        }
        if let Some(prev) = self.map.remove(&key) {
            self.total_bytes = self.total_bytes.saturating_sub(prev.bytes);
            self.order.retain(|k| k != &key);
        }
        let mut evicted_unread = Vec::new();
        if bytes > self.max_bytes {
            return evicted_unread;
        }
        // Pass 1: evict already-read entries first so pending unread completions survive when budget allows.
        let mut idx = 0;
        while self.total_bytes.saturating_add(bytes) > self.max_bytes && idx < self.order.len() {
            let cand = self.order[idx].clone();
            if self.map.get(&cand).is_some_and(|e| e.unread) {
                idx += 1;
                continue;
            }
            self.order.remove(idx);
            if let Some(evicted) = self.map.remove(&cand) {
                self.total_bytes = self.total_bytes.saturating_sub(evicted.bytes);
            }
        }
        // Pass 2: strictly enforce `max_bytes` even across unread entries so total cached RGBA
        // bytes never exceed the platform budget (`32 MiB` mobile / `64 MiB` desktop).
        while self.total_bytes.saturating_add(bytes) > self.max_bytes {
            let Some(cand) = self.order.pop_front() else {
                break;
            };
            if let Some(evicted) = self.map.remove(&cand) {
                self.total_bytes = self.total_bytes.saturating_sub(evicted.bytes);
                if evicted.unread {
                    evicted_unread.push(cand);
                }
            }
        }
        self.total_bytes = self.total_bytes.saturating_add(bytes);
        self.order.push_back(key.clone());
        self.map.insert(
            key,
            CachedCodeEntry {
                result,
                bytes,
                unread: true,
            },
        );
        evicted_unread
    }
}

struct CodePreviewJob {
    key: CodePreviewKey,
    theme: PlaygroundTheme,
    dpr: f32,
}

#[derive(Default)]
struct CodeWorkerQueue {
    jobs: VecDeque<CodePreviewJob>,
    in_flight: HashSet<CodePreviewKey>,
    active_workers: usize,
}

struct CodePreviewRuntime {
    cache: Mutex<ByteBudgetCodeCache>,
    queue: Mutex<CodeWorkerQueue>,
    cv_work: Condvar,
    cv_idle: Condvar,
}

fn code_preview_runtime() -> &'static Arc<CodePreviewRuntime> {
    static RT: OnceLock<Arc<CodePreviewRuntime>> = OnceLock::new();
    RT.get_or_init(|| {
        let rt = Arc::new(CodePreviewRuntime {
            cache: Mutex::new(ByteBudgetCodeCache::default()),
            queue: Mutex::new(CodeWorkerQueue::default()),
            cv_work: Condvar::new(),
            cv_idle: Condvar::new(),
        });
        for idx in 0..CODE_PREVIEW_WORKERS {
            let worker_rt = Arc::clone(&rt);
            let _ = std::thread::Builder::new()
                .name(format!("affine-code-preview-{idx}"))
                .spawn(move || code_preview_worker_loop(worker_rt));
        }
        rt
    })
}

fn code_preview_worker_loop(rt: Arc<CodePreviewRuntime>) {
    loop {
        let job = {
            let mut q = rt.queue.lock().unwrap_or_else(|poison| poison.into_inner());
            while q.jobs.is_empty() {
                q = rt
                    .cv_work
                    .wait(q)
                    .unwrap_or_else(|poison| poison.into_inner());
            }
            let job = q.jobs.pop_front().unwrap();
            q.active_workers += 1;
            job
        };

        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            render_code_preview_sync(job.key.0, &job.key.1, job.theme, job.dpr)
        }));
        let (result, bytes) = outcome.unwrap_or_else(|_| {
            (
                CodePreviewResult::Error("Preview worker failed unexpectedly".to_string()),
                64,
            )
        });

        let evicted_unread = {
            let mut cache = rt.cache.lock().unwrap_or_else(|poison| poison.into_inner());
            cache.insert(job.key.clone(), result, bytes)
        };
        for ev in evicted_unread {
            bump_code_preview_revision(ev.0, &ev.1);
        }
        bump_code_preview_revision(job.key.0, &job.key.1);

        {
            let mut q = rt.queue.lock().unwrap_or_else(|poison| poison.into_inner());
            q.in_flight.remove(&job.key);
            q.active_workers = q.active_workers.saturating_sub(1);
            if q.jobs.is_empty() && q.active_workers == 0 {
                rt.cv_idle.notify_all();
            }
        }
        notify_preview_wakeup();
    }
}

/// Deterministically blocks until all enqueued native background code preview jobs complete.
/// Intended for headless offscreen screenshot harnesses and unit tests (zero `sleep`).
pub fn flush_native_code_previews() {
    let rt = code_preview_runtime();
    let mut q = rt.queue.lock().unwrap_or_else(|poison| poison.into_inner());
    while !q.jobs.is_empty() || q.active_workers > 0 {
        q = rt
            .cv_idle
            .wait(q)
            .unwrap_or_else(|poison| poison.into_inner());
    }
}

fn render_code_preview_sync(
    kind: CodePreviewKind,
    source: &str,
    theme: PlaygroundTheme,
    dpr: f32,
) -> (CodePreviewResult, usize) {
    let dark = matches!(theme, PlaygroundTheme::Dark);
    let raster_opts = RasterOptions {
        max_edge_px: MAX_CODE_PREVIEW_EDGE_PX,
        ..RasterOptions::with_scale(dpr)
    };
    let (pool, rasterizer) = acquire_code_preview_fonts(source);
    match kind {
        CodePreviewKind::Mermaid => {
            let options = MermaidOptions {
                theme: Some(if dark {
                    MermaidTheme::Dark
                } else {
                    MermaidTheme::Light
                }),
                viewbox_padding: 6.0,
                ..MermaidOptions::default()
            };
            match MermaidRenderer.render_rgba(source, &options, &rasterizer, raster_opts) {
                Ok(buf) => {
                    let bytes = buf.byte_len();
                    match rgba_buffer_to_render_image(&buf) {
                        Some(image) => (
                            CodePreviewResult::Ready(CodePreviewSlot {
                                image,
                                width_pt: buf.logical_width.max(1.0),
                                height_pt: buf.logical_height.max(1.0),
                            }),
                            bytes,
                        ),
                        None => (CodePreviewResult::Error("empty diagram output".into()), 256),
                    }
                }
                Err(err) => (CodePreviewResult::Error(err.to_string()), 256),
            }
        }
        #[cfg(feature = "preview-typst")]
        CodePreviewKind::Typst => render_typst_sync(source, dark, &pool, &rasterizer, raster_opts),
        #[cfg(not(feature = "preview-typst"))]
        CodePreviewKind::Typst => {
            let _ = pool;
            (
                CodePreviewResult::Error("Typst preview is disabled in this build".into()),
                256,
            )
        }
        CodePreviewKind::Html => (
            CodePreviewResult::Error("HTML preview requires a browser host".into()),
            256,
        ),
    }
}

#[cfg(feature = "preview-typst")]
fn render_typst_sync(
    source: &str,
    dark: bool,
    pool: &FontPool,
    rasterizer: &SvgRasterizer,
    raster_opts: RasterOptions,
) -> (CodePreviewResult, usize) {
    if let Some(missing) = source
        .chars()
        .find(|&ch| super::native_fonts::is_cjk_or_kana_or_hangul(ch) && !pool.has_glyph(ch))
    {
        return (
            CodePreviewResult::Error(format!(
                "missing host CJK font for character '{missing}' in Typst preview"
            )),
            256,
        );
    }

    let text_hex = if dark { "#f4f4f5" } else { "#141414" };
    let font_list = pool
        .families()
        .iter()
        .map(|f| format!("\"{}\"", f.replace('"', "")))
        .collect::<Vec<_>>()
        .join(", ");
    let font_preamble = if font_list.is_empty() {
        String::new()
    } else {
        format!("#set text(font: ({font_list}), fill: rgb(\"{text_hex}\"))\n")
    };
    let math_preamble = pool
        .math_family()
        .map(|m| {
            format!(
                "#show math.equation: set text(font: \"{}\")\n",
                m.replace('"', "")
            )
        })
        .unwrap_or_default();
    let page_preamble = if source.contains("#set page") {
        String::new()
    } else {
        "#set page(width: auto, height: auto, margin: 8pt, fill: none)\n".to_string()
    };
    let wrapped = format!("{page_preamble}{font_preamble}{math_preamble}{source}");

    let mut world = InMemoryTypstWorld::new(pool);
    match world.compile_svg(&wrapped) {
        Ok(svg_out) => match rasterizer.rasterize_with_options(&svg_out.svg, raster_opts) {
            Ok(buf) => {
                let bytes = buf.byte_len();
                match rgba_buffer_to_render_image(&buf) {
                    Some(image) => (
                        CodePreviewResult::Ready(CodePreviewSlot {
                            image,
                            width_pt: buf.logical_width.max(1.0),
                            height_pt: buf.logical_height.max(1.0),
                        }),
                        bytes,
                    ),
                    None => (CodePreviewResult::Error("empty typst output".into()), 256),
                }
            }
            Err(err) => (CodePreviewResult::Error(err.to_string()), 256),
        },
        Err(err) => (CodePreviewResult::Error(err.to_string()), 256),
    }
}

struct NativeCodePreviewProvider;

impl CodePreviewProvider for NativeCodePreviewProvider {
    fn supports(&self, kind: CodePreviewKind) -> bool {
        match kind {
            CodePreviewKind::Mermaid => true,
            CodePreviewKind::Typst => cfg!(feature = "preview-typst"),
            CodePreviewKind::Html => false,
        }
    }

    fn render_code_preview(
        &self,
        kind: CodePreviewKind,
        source: &str,
        theme: PlaygroundTheme,
        dpr: f32,
    ) -> CodePreviewResult {
        if !self.supports(kind) {
            return CodePreviewResult::Error("unsupported preview kind".into());
        }
        let dark = matches!(theme, PlaygroundTheme::Dark);
        let key: CodePreviewKey = (kind, source.to_string(), dark, dpr.to_bits());
        let rt = code_preview_runtime();
        if let Ok(mut cache) = rt.cache.lock()
            && let Some(hit) = cache.get(&key)
        {
            return hit;
        }
        let mut dropped_keys = Vec::new();
        {
            let mut q = rt.queue.lock().unwrap_or_else(|poison| poison.into_inner());
            if q.in_flight.insert(key.clone()) {
                while q.jobs.len() >= MAX_PENDING_CODE_JOBS {
                    if let Some(dropped) = q.jobs.pop_front() {
                        q.in_flight.remove(&dropped.key);
                        dropped_keys.push((dropped.key.0, dropped.key.1));
                    }
                }
                q.jobs.push_back(CodePreviewJob { key, theme, dpr });
                rt.cv_work.notify_one();
            }
        }
        if !dropped_keys.is_empty() {
            for (dk, ds) in dropped_keys {
                bump_code_preview_revision(dk, &ds);
            }
            notify_preview_wakeup();
        }
        CodePreviewResult::Pending
    }
}

/// Idempotently installs the built-in native `MathPreviewProvider` (RaTeX),
/// `PdfPageProvider` (Hayro), and async `CodePreviewProvider` (Merman + optional Typst) once
/// per process without overwriting any custom provider already registered by a host or test.
pub fn ensure_native_preview_providers_installed() {
    static INSTALL: Once = Once::new();
    INSTALL.call_once(|| {
        if !has_math_preview_provider() {
            register_math_preview_provider(Some(Arc::new(NativeMathPreviewProvider)));
        }
        if !has_pdf_page_provider() {
            register_pdf_page_provider(Some(Arc::new(NativePdfPageProvider)));
        }
        if !has_code_preview_provider() {
            register_code_preview_provider(Some(Arc::new(NativeCodePreviewProvider)));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn byte_budget_cache_caps_edge_at_2048_and_enforces_32_mib_across_unread_entries() {
        assert_eq!(MAX_CODE_PREVIEW_EDGE_PX, 2048);
        let budget = 32 * 1024 * 1024;
        let mut cache = ByteBudgetCodeCache::with_max_bytes(budget);
        let per_image_bytes = 1800 * 1800 * 4; // 12,960,000 B (~12.36 MiB)
        for idx in 0..4 {
            let key = (
                CodePreviewKind::Mermaid,
                format!("flowchart TD; A{idx}-->B{idx}"),
                false,
                3.0_f32.to_bits(),
            );
            cache.insert(
                key,
                CodePreviewResult::Error("synthetic".into()),
                per_image_bytes,
            );
            assert!(
                cache.total_bytes <= budget,
                "insert #{idx} pushed unread total_bytes ({}) past 32 MiB budget ({budget})",
                cache.total_bytes
            );
        }
        assert_eq!(cache.map.len(), 2);
        assert_eq!(cache.total_bytes, 2 * per_image_bytes);
    }
}
