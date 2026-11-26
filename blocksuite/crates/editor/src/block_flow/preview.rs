//! Narrow preview ports (`MathPreviewProvider`, `PdfPageProvider`) and optional
//! `preview-engine` (`RaTeX` + `Hayro`) bridge for `block_flow`.
//!
//! When the `preview-engine` Cargo feature is enabled, this module uses in-process
//! `blocksuite-preview` (`RaTeX` + `Hayro`). When disabled (the default for the main Web
//! Wasm bundle and default `bs-harness`), callers can inject host/worker-rendered RGBA
//! frames via `register_math_preview_provider` / `register_pdf_page_provider`, and
//! `latex_body` renders genuine 2D mathematical notation using `math_layout::layout_math_2d`.

use std::sync::{Arc, OnceLock, RwLock};

#[cfg(feature = "preview-engine")]
use std::collections::HashMap;

#[cfg(feature = "preview-engine")]
use blocksuite_preview::{
    FontPool, SvgRasterizer,
    math::{MathDisplayMode, MathRenderOptions, render_latex_rgba},
    pdf::{HayroPdfRenderer, PdfPageRenderer, PdfRenderRequest},
    svg_raster::RgbaImageBuffer,
};
use ui::{Hsla, RenderImage};

#[cfg(feature = "preview-engine")]
use crate::theme::{bundled_font_bytes, bundled_script_font_bytes};

/// Rasterized LaTeX formula ready to paint as a GPUI [`RenderImage`].
#[derive(Clone)]
pub struct MathRenderSlot {
    pub image: Arc<RenderImage>,
    pub width_pt: f32,
    pub ascent_pt: f32,
    pub descent_pt: f32,
}

/// Rasterized PDF page preview ready to paint inside an `affine:attachment` block.
#[derive(Clone)]
pub struct PdfPreviewPage {
    pub page_index: usize,
    pub page_count: usize,
    pub image: Arc<RenderImage>,
    pub width_pt: f32,
    pub height_pt: f32,
}

/// Narrow port allowing platform hosts (iOS PDFKit, Android PdfRenderer, Web PDF worker)
/// or tests to supply rasterized PDF pages without statically linking `hayro`.
pub trait PdfPageProvider: Send + Sync {
    fn page_count(&self, bytes: &[u8]) -> Option<usize>;
    fn render_pdf_page(
        &self,
        bytes: &[u8],
        page_index: usize,
        scale: f32,
    ) -> Option<PdfPreviewPage>;
}

/// Narrow port allowing platform hosts (Web math worker, native RaTeX) or tests to supply
/// rasterized LaTeX math bitmaps without statically linking `ratex-katex-fonts`.
pub trait MathPreviewProvider: Send + Sync {
    fn render_math(
        &self,
        latex: &str,
        display: bool,
        font_size_pt: f32,
        color: Hsla,
    ) -> Option<MathRenderSlot>;
}

fn pdf_provider_slot() -> &'static RwLock<Option<Arc<dyn PdfPageProvider>>> {
    static SLOT: OnceLock<RwLock<Option<Arc<dyn PdfPageProvider>>>> = OnceLock::new();
    SLOT.get_or_init(|| RwLock::new(None))
}

fn math_provider_slot() -> &'static RwLock<Option<Arc<dyn MathPreviewProvider>>> {
    static SLOT: OnceLock<RwLock<Option<Arc<dyn MathPreviewProvider>>>> = OnceLock::new();
    SLOT.get_or_init(|| RwLock::new(None))
}

/// Register a host/worker [`PdfPageProvider`] for embedded PDF attachment previews.
pub fn register_pdf_page_provider(provider: Option<Arc<dyn PdfPageProvider>>) {
    if let Ok(mut guard) = pdf_provider_slot().write() {
        *guard = provider;
    }
}

/// Whether PDF page rasterization is available in this runtime (either via the built-in
/// `preview-engine` feature or a host-registered [`PdfPageProvider`]).
pub fn can_render_pdf_pages() -> bool {
    #[cfg(feature = "preview-engine")]
    {
        true
    }
    #[cfg(not(feature = "preview-engine"))]
    {
        pdf_provider_slot().read().ok().is_some_and(|g| g.is_some())
    }
}

/// Register a host/worker [`MathPreviewProvider`] for rasterized LaTeX previews.
pub fn register_math_preview_provider(provider: Option<Arc<dyn MathPreviewProvider>>) {
    if let Ok(mut guard) = math_provider_slot().write() {
        *guard = provider;
    }
}

/// Parsed PDF handle used to rasterize attachment preview pages on demand.
pub struct EmbeddedPdfDocument {
    #[cfg(feature = "preview-engine")]
    renderer: HayroPdfRenderer,
    #[cfg(not(feature = "preview-engine"))]
    bytes: Vec<u8>,
    #[cfg(not(feature = "preview-engine"))]
    page_count: usize,
}

impl EmbeddedPdfDocument {
    /// Total number of pages in this PDF without rasterizing any page.
    pub fn page_count(&self) -> usize {
        #[cfg(feature = "preview-engine")]
        {
            self.renderer.page_count()
        }
        #[cfg(not(feature = "preview-engine"))]
        {
            self.page_count
        }
    }
}

#[cfg(feature = "preview-engine")]
fn shared_font_pool() -> &'static FontPool {
    static POOL: OnceLock<FontPool> = OnceLock::new();
    POOL.get_or_init(|| {
        let mut pool = FontPool::new();
        for bytes in bundled_font_bytes()
            .into_iter()
            .chain(bundled_script_font_bytes())
        {
            let _ = pool.register_font_bytes(bytes.to_vec());
        }
        pool
    })
}

#[cfg(feature = "preview-engine")]
fn shared_rasterizer() -> &'static SvgRasterizer {
    static RASTER: OnceLock<SvgRasterizer> = OnceLock::new();
    RASTER.get_or_init(|| SvgRasterizer::new(shared_font_pool()))
}

/// Convert an RGBA8 [`RgbaImageBuffer`] into a GPUI BGRA8 [`RenderImage`].
#[cfg(feature = "preview-engine")]
pub fn rgba_buffer_to_render_image(buf: &RgbaImageBuffer) -> Option<Arc<RenderImage>> {
    if buf.width_px == 0 || buf.height_px == 0 {
        return None;
    }
    let mut bgra = buf.pixels.clone();
    for px in bgra.chunks_exact_mut(4) {
        ui::swap_rgba_pa_to_bgra(px);
    }
    let img = image::RgbaImage::from_raw(buf.width_px, buf.height_px, bgra)?;
    Some(Arc::new(RenderImage::new(vec![image::Frame::new(img)])))
}

#[cfg(feature = "preview-engine")]
fn hsla_to_css_hex(color: Hsla) -> String {
    let rgba: ui::Rgba = color.into();
    let r = (rgba.r.clamp(0.0, 1.0) * 255.0).round() as u8;
    let g = (rgba.g.clamp(0.0, 1.0) * 255.0).round() as u8;
    let b = (rgba.b.clamp(0.0, 1.0) * 255.0).round() as u8;
    format!("#{r:02x}{g:02x}{b:02x}")
}

#[cfg(feature = "preview-engine")]
type MathCacheKey = (String, bool, u32, String);

/// Render and cache a LaTeX math expression through any registered [`MathPreviewProvider`]
/// or (when `preview-engine` is enabled) through pure-Rust RaTeX outlines.
pub fn render_math_cached(
    latex: &str,
    display: bool,
    font_size_pt: f32,
    color: Hsla,
) -> Option<MathRenderSlot> {
    let trimmed = latex.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(guard) = math_provider_slot().read()
        && let Some(provider) = guard.as_ref()
        && let Some(slot) = provider.render_math(trimmed, display, font_size_pt, color)
    {
        return Some(slot);
    }

    #[cfg(feature = "preview-engine")]
    {
        let color_css = hsla_to_css_hex(color);
        let key = (
            trimmed.to_string(),
            display,
            font_size_pt.to_bits(),
            color_css.clone(),
        );
        static CACHE: OnceLock<RwLock<HashMap<MathCacheKey, Option<MathRenderSlot>>>> =
            OnceLock::new();
        let cache = CACHE.get_or_init(|| RwLock::new(HashMap::new()));
        if let Ok(guard) = cache.read()
            && let Some(hit) = guard.get(&key)
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
        let rendered = render_latex_rgba(
            trimmed,
            &options,
            shared_font_pool(),
            shared_rasterizer(),
            2.0,
        )
        .ok()
        .and_then(|out| {
            let image = rgba_buffer_to_render_image(&out.image)?;
            Some(MathRenderSlot {
                image,
                width_pt: out.width_pt as f32,
                ascent_pt: out.ascent_pt as f32,
                descent_pt: out.descent_pt as f32,
            })
        });

        if let Ok(mut guard) = cache.write() {
            if guard.len() > 256 {
                guard.clear();
            }
            guard.insert(key, rendered.clone());
        }
        rendered
    }
    #[cfg(not(feature = "preview-engine"))]
    {
        let _ = (display, font_size_pt, color);
        None
    }
}

/// Render a single PDF page from an [`EmbeddedPdfDocument`] into a [`PdfPreviewPage`].
pub fn render_pdf_page(
    doc: &EmbeddedPdfDocument,
    page_index: usize,
    scale: f32,
) -> Option<PdfPreviewPage> {
    #[cfg(feature = "preview-engine")]
    {
        let page_count = doc.renderer.page_count();
        if page_count == 0 {
            return None;
        }
        let idx = page_index.min(page_count - 1);
        let buf = doc
            .renderer
            .render_page(PdfRenderRequest::for_page(idx, scale))
            .ok()?;
        let image = rgba_buffer_to_render_image(&buf)?;
        Some(PdfPreviewPage {
            page_index: idx,
            page_count,
            image,
            width_pt: buf.logical_width,
            height_pt: buf.logical_height,
        })
    }
    #[cfg(not(feature = "preview-engine"))]
    {
        if doc.page_count == 0 {
            return None;
        }
        let idx = page_index.min(doc.page_count - 1);
        if let Ok(guard) = pdf_provider_slot().read()
            && let Some(provider) = guard.as_ref()
        {
            return provider.render_pdf_page(&doc.bytes, idx, scale);
        }
        // Honest fallback: without `preview-engine` or a registered host `PdfPageProvider`,
        // return `None` so `attachment_body` renders a clean file card rather than a fake box.
        None
    }
}

/// Construct an [`EmbeddedPdfDocument`] from raw PDF bytes.
pub fn parse_pdf_renderer(bytes: &[u8]) -> Option<EmbeddedPdfDocument> {
    #[cfg(feature = "preview-engine")]
    {
        HayroPdfRenderer::from_bytes(bytes.to_vec())
            .ok()
            .map(|renderer| EmbeddedPdfDocument { renderer })
    }
    #[cfg(not(feature = "preview-engine"))]
    {
        if !bytes.starts_with(b"%PDF-") {
            return None;
        }
        let page_count = pdf_provider_slot().read().ok().and_then(|guard| {
            guard
                .as_ref()
                .and_then(|provider| provider.page_count(bytes))
        })?;
        (page_count > 0).then(|| EmbeddedPdfDocument {
            bytes: bytes.to_vec(),
            page_count,
        })
    }
}

impl super::FlowPass<'_> {
    pub(super) fn latex_body(&mut self, latex: &str, width: f32) -> super::BlockBody {
        use super::{
            BlockBody, CARD_BLOCK_MARGIN, FlowKind, FlowRect, InlineAlign, InlineStyle, Prim,
        };
        use crate::theme::{FONT_SANS, TYPOGRAPHY};

        let pad_x = 16.0;
        let pad_y = 14.0;
        let inner = (width - 2.0 * pad_x).max(1.0);
        let empty = latex.trim().is_empty();
        if !empty
            && let Some(math) = render_math_cached(latex, true, 18.0, self.palette.text_primary)
        {
            let natural_w = math.width_pt.max(1.0);
            let natural_h = (math.ascent_pt + math.descent_pt).max(18.0);
            let scale = if natural_w > inner {
                inner / natural_w
            } else {
                1.0
            };
            let img_w = (natural_w * scale).round().max(1.0);
            let img_h = (natural_h * scale).round().max(1.0);
            let height = (img_h + 2.0 * pad_y).max(56.0);
            let img_x = ((width - img_w) / 2.0).floor().max(pad_x);
            let img_y = ((height - img_h) / 2.0).floor().max(pad_y);
            return BlockBody {
                kind: FlowKind::Latex,
                width,
                height,
                margin_top: CARD_BLOCK_MARGIN,
                margin_bottom: CARD_BLOCK_MARGIN,
                plain: latex.to_string(),
                prims: vec![
                    Prim::Quad {
                        rect: FlowRect::new(0.0, 0.0, width, height),
                        fill: Some(self.palette.background_secondary),
                        border: Some(self.palette.border),
                        radius: 8.0,
                        dashed: false,
                    },
                    Prim::Image {
                        rect: FlowRect::new(img_x, img_y, img_w, img_h),
                        image: math.image,
                    },
                ],
                text: None,
                prefix: None,
                code_scroll: None,
                pdf_controls: None,
                table_cells: Vec::new(),
            };
        }
        if !empty {
            let (mw, mh, mut math_prims) = super::math_layout::layout_math_2d(
                latex,
                18.0,
                self.palette.text_primary,
                self.window,
            );
            let height = (mh + 2.0 * pad_y).max(56.0);
            let offset_x = ((width - mw) / 2.0).floor().max(pad_x);
            let offset_y = ((height - mh) / 2.0).floor().max(pad_y);
            for prim in &mut math_prims {
                match prim {
                    Prim::Text { x, y, .. } => {
                        *x += offset_x;
                        *y += offset_y;
                    }
                    Prim::Quad { rect, .. }
                    | Prim::Image { rect, .. }
                    | Prim::Icon { rect, .. } => {
                        *rect = rect.translated(offset_x, offset_y);
                    }
                    _ => {}
                }
            }
            let mut prims = Vec::with_capacity(math_prims.len() + 1);
            prims.push(Prim::Quad {
                rect: FlowRect::new(0.0, 0.0, width, height),
                fill: Some(self.palette.background_secondary),
                border: Some(self.palette.border),
                radius: 8.0,
                dashed: false,
            });
            prims.extend(math_prims);
            return BlockBody {
                kind: FlowKind::Latex,
                width,
                height,
                margin_top: CARD_BLOCK_MARGIN,
                margin_bottom: CARD_BLOCK_MARGIN,
                plain: latex.to_string(),
                prims,
                text: None,
                prefix: None,
                code_scroll: None,
                pdf_controls: None,
                table_cells: Vec::new(),
            };
        }
        let style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_sm_px,
            400.0,
            self.palette.text_secondary,
        );
        let layout = self.plain_inline("Add an equation", style, inner, 22.0, InlineAlign::Center);
        let height = (layout.height() + 2.0 * pad_y).max(52.0);
        let text_y = ((height - layout.height()) / 2.0).floor().max(pad_y);
        BlockBody {
            kind: FlowKind::Latex,
            width,
            height,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: "Add an equation".to_string(),
            prims: vec![
                Prim::Quad {
                    rect: FlowRect::new(0.0, 0.0, width, height),
                    fill: Some(self.palette.background_secondary),
                    border: Some(self.palette.border),
                    radius: 8.0,
                    dashed: false,
                },
                Prim::Text {
                    x: pad_x,
                    y: text_y,
                    layout,
                    clip: Some(FlowRect::new(pad_x, pad_y, inner, height - 2.0 * pad_y)),
                },
            ],
            text: None,
            prefix: None,
            code_scroll: None,
            pdf_controls: None,
            table_cells: Vec::new(),
        }
    }

    pub(super) fn unknown_body(
        &mut self,
        flavour: &str,
        block_id: &str,
        width: f32,
    ) -> super::BlockBody {
        use super::{
            BlockBody, CARD_BLOCK_MARGIN, FlowKind, FlowRect, InlineAlign, InlineStyle, Prim,
            inline::truncate_to_width,
        };
        use crate::theme::{FONT_CODE, FONT_SANS, TYPOGRAPHY};

        let pad = 12.0;
        let inner = (width - 2.0 * pad).max(1.0);
        let title_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_sm_px,
            500.0,
            self.palette.text_secondary,
        );
        let id_style = InlineStyle::new(
            FONT_CODE,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_secondary,
        );
        let label = format!("Unsupported block: {flavour}");
        let title = self.plain_inline(&label, title_style, inner, 22.0, InlineAlign::Left);
        let id_text = truncate_to_width(self.window, block_id, &id_style, inner)
            .text
            .to_string();
        let id = self.plain_inline(&id_text, id_style, inner, 20.0, InlineAlign::Left);
        let height = pad + title.height() + id.height() + pad;
        let id_y = pad + title.height();
        BlockBody {
            kind: FlowKind::Unknown,
            width,
            height,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: format!("[Unsupported block: {flavour}]"),
            prims: vec![
                Prim::Quad {
                    rect: FlowRect::new(0.0, 0.0, width, height),
                    fill: None,
                    border: Some(self.palette.divider),
                    radius: 8.0,
                    dashed: true,
                },
                Prim::Text {
                    x: pad,
                    y: pad,
                    layout: title,
                    clip: None,
                },
                Prim::Text {
                    x: pad,
                    y: id_y,
                    layout: id,
                    clip: None,
                },
            ],
            text: None,
            prefix: None,
            code_scroll: None,
            pdf_controls: None,
            table_cells: Vec::new(),
        }
    }

    pub(super) fn surface_ref_body(
        &mut self,
        reference: &str,
        ref_flavour: &str,
        caption: &str,
        width: f32,
    ) -> super::BlockBody {
        use super::{
            BlockBody, CARD_BLOCK_MARGIN, FlowKind, FlowRect, InlineAlign, InlineStyle, Prim,
            inline::truncate_to_width,
        };
        use crate::theme::{FONT_CODE, FONT_SANS, TYPOGRAPHY};
        let card_h = 84.0;
        let pad = 14.0;
        let inner_w = (width - pad * 2.0 - 32.0).max(40.0);
        let title = if caption.is_empty() {
            reference
        } else {
            caption
        };
        let title_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_sm_px,
            600.0,
            self.palette.text_primary,
        );
        let sub_style = InlineStyle::new(
            FONT_CODE,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_secondary,
        );
        let title_str = truncate_to_width(self.window, title, &title_style, inner_w)
            .text
            .to_string();
        let sub = format!("Surface ref  {ref_flavour}  {reference}");
        let sub_str = truncate_to_width(self.window, &sub, &sub_style, inner_w)
            .text
            .to_string();
        BlockBody {
            kind: FlowKind::SurfaceRef,
            width,
            height: card_h,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: title.to_string(),
            prims: vec![
                Prim::Quad {
                    rect: FlowRect::new(0.0, 0.0, width, card_h),
                    fill: Some(self.palette.background_secondary),
                    border: Some(self.palette.card_border),
                    radius: 8.0,
                    dashed: false,
                },
                Prim::Icon {
                    rect: FlowRect::new(pad, 16.0, 20.0, 20.0),
                    icon: crate::theme::IconPaint::named("EdgelessIcon"),
                    color: self.palette.icon,
                },
                Prim::Text {
                    x: pad + 28.0,
                    y: 14.0,
                    layout: self.plain_inline(
                        &title_str,
                        title_style,
                        inner_w,
                        22.0,
                        InlineAlign::Left,
                    ),
                    clip: None,
                },
                Prim::Text {
                    x: pad + 28.0,
                    y: 42.0,
                    layout: self.plain_inline(
                        &sub_str,
                        sub_style,
                        inner_w,
                        18.0,
                        InlineAlign::Left,
                    ),
                    clip: None,
                },
            ],
            text: None,
            prefix: None,
            code_scroll: None,
            pdf_controls: None,
            table_cells: Vec::new(),
        }
    }
}
