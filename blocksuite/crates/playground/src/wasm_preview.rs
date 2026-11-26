//! WebAssembly (`wasm32`) worker-backed preview providers (`WasmMathPreviewProvider` +
//! `WasmPdfPageProvider`) bridging Dedicated Web Workers (`math-worker.js`, `pdf-worker.js`)
//! to `blocksuite-editor`'s preview cache and automatic GPUI window repaint.

use std::{
    cell::RefCell,
    collections::{HashMap, HashSet, VecDeque},
    hash::{Hash, Hasher},
    sync::{Arc, OnceLock, RwLock},
};

use ui::{Hsla, WeakEntity};
use wasm_bindgen::prelude::*;

use crate::{
    PlaygroundView,
    block_flow::{
        MathPreviewProvider, MathRenderResult, MathRenderSlot, PdfPageCount, PdfPageProvider,
        PdfPreviewPage, bump_latex_formula_revision, bump_preview_revision, hsla_to_css_hex,
        register_math_preview_provider, register_pdf_page_provider, rgba_pixels_to_render_image,
    },
    overlays::OverlayEvent,
};

const MAX_MATH_CACHE_ENTRIES: usize = 1024;
const MAX_PDF_CACHE_ENTRIES: usize = 64;

type MathKey = (String, bool, u32, String, u32);
type PdfPageKey = (String, usize, u32);
type FifoCache<K, V> = (HashMap<K, V>, VecDeque<K>);

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = ["window", "__playgroundPreview"], js_name = requestMath, catch)]
    fn js_request_math(
        latex: &str,
        display: bool,
        font_size_pt: f32,
        color_css: &str,
        dpr: f32,
    ) -> Result<(), JsValue>;

    #[wasm_bindgen(js_namespace = ["window", "__playgroundPreview"], js_name = requestPdfPageCount, catch)]
    fn js_request_pdf_page_count(pdf_key: &str, bytes: &[u8]) -> Result<(), JsValue>;

    #[wasm_bindgen(js_namespace = ["window", "__playgroundPreview"], js_name = requestPdfPage, catch)]
    fn js_request_pdf_page(
        pdf_key: &str,
        bytes: &[u8],
        page_index: usize,
        scale: f32,
    ) -> Result<(), JsValue>;

    #[wasm_bindgen(js_namespace = ["window", "__playgroundPreview"], js_name = pickImages, catch)]
    fn js_pick_images() -> Result<(), JsValue>;
}

/// Opens the browser `<input type="file" accept="image/*">` picker via `preview-workers.js`.
pub(crate) fn request_host_image_picker() {
    let _ = js_pick_images();
}

fn resolve_pdf_key(cache_key: &str, bytes: &[u8]) -> String {
    if !cache_key.is_empty() {
        return cache_key.to_string();
    }
    let mut h = std::collections::hash_map::DefaultHasher::new();
    bytes.len().hash(&mut h);
    bytes.hash(&mut h);
    format!("{:016x}", h.finish())
}

fn fifo_insert<K: Clone + Eq + Hash, V>(
    map: &mut HashMap<K, V>,
    order: &mut VecDeque<K>,
    cap: usize,
    key: K,
    val: V,
) {
    if !map.contains_key(&key) {
        while map.len() >= cap {
            let Some(oldest) = order.pop_front() else {
                break;
            };
            map.remove(&oldest);
        }
        order.push_back(key.clone());
    }
    map.insert(key, val);
}

fn math_cache() -> &'static RwLock<FifoCache<MathKey, MathRenderResult>> {
    static CACHE: OnceLock<RwLock<FifoCache<MathKey, MathRenderResult>>> = OnceLock::new();
    CACHE.get_or_init(|| RwLock::new((HashMap::new(), VecDeque::new())))
}

fn math_in_flight() -> &'static RwLock<HashSet<MathKey>> {
    static SET: OnceLock<RwLock<HashSet<MathKey>>> = OnceLock::new();
    SET.get_or_init(|| RwLock::new(HashSet::new()))
}

fn pdf_counts() -> &'static RwLock<HashMap<String, PdfPageCount>> {
    static CACHE: OnceLock<RwLock<HashMap<String, PdfPageCount>>> = OnceLock::new();
    CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

fn pdf_count_in_flight() -> &'static RwLock<HashSet<String>> {
    static SET: OnceLock<RwLock<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| RwLock::new(HashSet::new()))
}

fn pdf_pages() -> &'static RwLock<FifoCache<PdfPageKey, PdfPreviewPage>> {
    static CACHE: OnceLock<RwLock<FifoCache<PdfPageKey, PdfPreviewPage>>> = OnceLock::new();
    CACHE.get_or_init(|| RwLock::new((HashMap::new(), VecDeque::new())))
}

fn pdf_in_flight() -> &'static RwLock<HashSet<PdfPageKey>> {
    static SET: OnceLock<RwLock<HashSet<PdfPageKey>>> = OnceLock::new();
    SET.get_or_init(|| RwLock::new(HashSet::new()))
}

std::thread_local! {
    static ACTIVE_VIEW: RefCell<Option<(WeakEntity<PlaygroundView>, ui::AsyncApp)>> =
        const { RefCell::new(None) };
}

fn notify_active_view(refresh_pdf: bool) {
    ACTIVE_VIEW.with(|slot| {
        if let Some((weak, app)) = slot.borrow().as_ref() {
            let weak = weak.clone();
            let app = app.clone();
            let _ = app.update(|cx| {
                let _ = weak.update(cx, |view, cx| {
                    if refresh_pdf {
                        let attachments = view.active_pdf_attachments();
                        view.refresh_pdf_previews(&attachments);
                    }
                    cx.notify();
                });
            });
        }
    });
}

struct WasmMathPreviewProvider;

impl MathPreviewProvider for WasmMathPreviewProvider {
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
        if let Ok(guard) = math_cache().read()
            && let Some(hit) = guard.0.get(&key)
        {
            return hit.clone();
        }
        let should_request = math_in_flight()
            .write()
            .map(|mut set| set.insert(key.clone()))
            .unwrap_or(false);
        if should_request && js_request_math(latex, display, font_size_pt, &color_css, dpr).is_err()
        {
            if let Ok(mut set) = math_in_flight().write() {
                set.remove(&key);
            }
        }
        MathRenderResult::Pending
    }
}

struct WasmPdfPageProvider;

impl PdfPageProvider for WasmPdfPageProvider {
    fn page_count(&self, cache_key: &str, bytes: &[u8]) -> PdfPageCount {
        let pdf_key = resolve_pdf_key(cache_key, bytes);
        if let Ok(guard) = pdf_counts().read()
            && let Some(&status) = guard.get(&pdf_key)
        {
            return status;
        }
        let should_request = pdf_count_in_flight()
            .write()
            .map(|mut set| set.insert(pdf_key.clone()))
            .unwrap_or(false);
        if should_request && js_request_pdf_page_count(&pdf_key, bytes).is_err() {
            if let Ok(mut set) = pdf_count_in_flight().write() {
                set.remove(&pdf_key);
            }
            return PdfPageCount::Invalid;
        }
        PdfPageCount::Pending
    }

    fn render_pdf_page(
        &self,
        cache_key: &str,
        bytes: &[u8],
        page_index: usize,
        scale: f32,
    ) -> Option<PdfPreviewPage> {
        let pdf_key = resolve_pdf_key(cache_key, bytes);
        let key: PdfPageKey = (pdf_key.clone(), page_index, scale.to_bits());
        if let Ok(guard) = pdf_pages().read()
            && let Some(hit) = guard.0.get(&key)
        {
            return Some(hit.clone());
        }
        let should_request = pdf_in_flight()
            .write()
            .map(|mut set| set.insert(key.clone()))
            .unwrap_or(false);
        if should_request && js_request_pdf_page(&pdf_key, bytes, page_index, scale).is_err() {
            if let Ok(mut set) = pdf_in_flight().write() {
                set.remove(&key);
            }
        }
        None
    }
}

/// Registers the Web Worker preview providers and binds `view` for automatic repaint wakeups.
pub(crate) fn install_wasm_preview_providers(view: WeakEntity<PlaygroundView>, cx: &ui::App) {
    ACTIVE_VIEW.with(|slot| {
        *slot.borrow_mut() = Some((view, cx.to_async()));
    });
    register_math_preview_provider(Some(Arc::new(WasmMathPreviewProvider)));
    register_pdf_page_provider(Some(Arc::new(WasmPdfPageProvider)));
}

/// Callback invoked by `preview-workers.js` when a RaTeX math formula finishes rasterizing.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn deliver_math_preview(
    latex: String,
    display: bool,
    font_size_pt: f32,
    color_css: String,
    dpr: f32,
    width_pt: f32,
    ascent_pt: f32,
    descent_pt: f32,
    width_px: u32,
    height_px: u32,
    rgba: &[u8],
) {
    let latex_for_rev = latex.clone();
    let key: MathKey = (
        latex,
        display,
        font_size_pt.to_bits(),
        color_css,
        dpr.to_bits(),
    );
    if let Ok(mut set) = math_in_flight().write() {
        set.remove(&key);
    }
    let result = match rgba_pixels_to_render_image(width_px, height_px, rgba) {
        Some(image) => MathRenderResult::Ready(MathRenderSlot {
            image,
            width_pt,
            ascent_pt,
            descent_pt,
        }),
        None => MathRenderResult::Error,
    };
    if let Ok(mut guard) = math_cache().write() {
        let (map, order) = &mut *guard;
        fifo_insert(map, order, MAX_MATH_CACHE_ENTRIES, key, result);
    }
    bump_latex_formula_revision(&latex_for_rev);
    notify_active_view(false);
}

/// Callback invoked by `preview-workers.js` when RaTeX reports a definitive syntax/parse error
/// or the worker fails to initialize.
#[wasm_bindgen]
pub fn deliver_math_error(
    latex: String,
    display: bool,
    font_size_pt: f32,
    color_css: String,
    dpr: f32,
) {
    let latex_for_rev = latex.clone();
    let key: MathKey = (
        latex,
        display,
        font_size_pt.to_bits(),
        color_css,
        dpr.to_bits(),
    );
    if let Ok(mut set) = math_in_flight().write() {
        set.remove(&key);
    }
    if let Ok(mut guard) = math_cache().write() {
        let (map, order) = &mut *guard;
        fifo_insert(
            map,
            order,
            MAX_MATH_CACHE_ENTRIES,
            key,
            MathRenderResult::Error,
        );
    }
    bump_latex_formula_revision(&latex_for_rev);
    notify_active_view(false);
}

/// Callback invoked by `preview-workers.js` when Hayro reports a PDF's page count.
#[wasm_bindgen]
pub fn deliver_pdf_page_count(pdf_key: String, page_count: usize) {
    if let Ok(mut set) = pdf_count_in_flight().write() {
        set.remove(&pdf_key);
    }
    let status = if page_count > 0 {
        PdfPageCount::Ready(page_count)
    } else {
        PdfPageCount::Invalid
    };
    if let Ok(mut guard) = pdf_counts().write() {
        guard.insert(pdf_key, status);
    }
    bump_preview_revision();
    notify_active_view(true);
}

/// Callback invoked by `preview-workers.js` when Hayro fails to parse/render a PDF or the PDF
/// worker fails to load.
#[wasm_bindgen]
pub fn deliver_pdf_error(pdf_key: String) {
    if let Ok(mut set) = pdf_count_in_flight().write() {
        set.remove(&pdf_key);
    }
    if let Ok(mut set) = pdf_in_flight().write() {
        set.retain(|(k, _, _)| k != &pdf_key);
    }
    if let Ok(mut guard) = pdf_counts().write() {
        guard.insert(pdf_key, PdfPageCount::Invalid);
    }
    bump_preview_revision();
    notify_active_view(true);
}

/// Callback invoked by `preview-workers.js` when Hayro finishes rasterizing a PDF page.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn deliver_pdf_page(
    pdf_key: String,
    page_index: usize,
    page_count: usize,
    scale: f32,
    width_px: u32,
    height_px: u32,
    rgba: &[u8],
) {
    let key: PdfPageKey = (pdf_key.clone(), page_index, scale.to_bits());
    if let Ok(mut set) = pdf_in_flight().write() {
        set.remove(&key);
    }
    if let Some(image) = rgba_pixels_to_render_image(width_px, height_px, rgba) {
        if let Ok(mut counts) = pdf_counts().write() {
            counts.insert(pdf_key, PdfPageCount::Ready(page_count));
        }
        if let Ok(mut pages) = pdf_pages().write() {
            let (map, order) = &mut *pages;
            fifo_insert(
                map,
                order,
                MAX_PDF_CACHE_ENTRIES,
                key,
                PdfPreviewPage {
                    page_index,
                    page_count,
                    image,
                    width_pt: (width_px as f32) / scale.max(0.25),
                    height_pt: (height_px as f32) / scale.max(0.25),
                },
            );
        }
        bump_preview_revision();
        notify_active_view(true);
    }
}

/// Callback invoked by `preview-workers.js` when the user selects an image file in the picker.
#[wasm_bindgen]
pub fn deliver_picked_image(bytes: &[u8]) {
    if bytes.is_empty() {
        return;
    }
    let payload = bytes.to_vec();
    ACTIVE_VIEW.with(|slot| {
        if let Some((weak, app)) = slot.borrow().as_ref() {
            let weak = weak.clone();
            let app = app.clone();
            let _ = app.update(|cx| {
                let Some(entity) = weak.upgrade() else {
                    return;
                };
                for window in cx.windows() {
                    let _ = window.update(cx, |_, win, cx| {
                        entity.update(cx, |view, cx| {
                            view.dispatch_overlay(
                                OverlayEvent::InsertImageBytes {
                                    bytes: payload.clone(),
                                    caption: String::new(),
                                },
                                win,
                                cx,
                            );
                        });
                    });
                }
            });
        }
    });
}

/// Callback invoked by the Web host to insert an embedded PDF attachment block into the active view.
#[wasm_bindgen]
pub fn deliver_picked_pdf(bytes: &[u8], name: String) {
    if bytes.is_empty() {
        return;
    }
    let payload = bytes.to_vec();
    ACTIVE_VIEW.with(|slot| {
        if let Some((weak, app)) = slot.borrow().as_ref() {
            let weak = weak.clone();
            let app = app.clone();
            let _ = app.update(|cx| {
                let Some(entity) = weak.upgrade() else {
                    return;
                };
                for window in cx.windows() {
                    let _ = window.update(cx, |_, win, cx| {
                        entity.update(cx, |view, cx| {
                            let _ = view.insert_picked_pdf_bytes(&payload, &name, win, cx);
                        });
                    });
                }
            });
        }
    });
}
