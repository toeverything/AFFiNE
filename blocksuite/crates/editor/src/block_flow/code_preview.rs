//! Code-block live preview provider (`mermaid`, `typst`, `html`) and zero-writeback
//! source/preview mode switching for `affine:code` blocks.

use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex, OnceLock, RwLock, Weak},
};

use ui::RenderImage;

use crate::{
    highlight::{LanguageId, resolve_language},
    theme::PlaygroundTheme,
};

use super::{
    BlockBody, CARD_BLOCK_MARGIN, CODE_PADDING, CODE_RADIUS, FlowKind, FlowPass, FlowRect,
    InlineAlign, InlineStyle, Prim, preview::bump_preview_revision,
};

/// Code-block languages that support live visual preview switching when backed by a provider.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum CodePreviewKind {
    Mermaid,
    Typst,
    Html,
}

impl CodePreviewKind {
    pub fn from_language(language: &str) -> Option<Self> {
        match resolve_language(language) {
            LanguageId::Mermaid => Some(Self::Mermaid),
            LanguageId::Typst => Some(Self::Typst),
            LanguageId::Html => Some(Self::Html),
            _ => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Mermaid => "Mermaid",
            Self::Typst => "Typst",
            Self::Html => "HTML",
        }
    }
}

/// Rasterized bitmap output for a `mermaid` or `typst` code block preview.
#[derive(Clone)]
pub struct CodePreviewSlot {
    pub image: Arc<RenderImage>,
    pub width_pt: f32,
    pub height_pt: f32,
}

/// Three-state outcome of rendering a code block preview.
#[derive(Clone)]
pub enum CodePreviewResult {
    Ready(CodePreviewSlot),
    Pending,
    Error(String),
}

/// Narrow host port supplying rasterized `mermaid` / `typst` code block previews
/// (backed by Dedicated Web Workers on `wasm32`, or `blocksuite-preview` on native hosts).
pub trait CodePreviewProvider: Send + Sync {
    /// Returns `true` when this provider genuinely renders `kind`.
    fn supports(&self, kind: CodePreviewKind) -> bool;

    fn render_code_preview(
        &self,
        kind: CodePreviewKind,
        source: &str,
        theme: PlaygroundTheme,
        dpr: f32,
    ) -> CodePreviewResult;
}

fn code_preview_provider_slot() -> &'static RwLock<Option<Arc<dyn CodePreviewProvider>>> {
    static SLOT: OnceLock<RwLock<Option<Arc<dyn CodePreviewProvider>>>> = OnceLock::new();
    SLOT.get_or_init(|| RwLock::new(None))
}

/// Whether a [`CodePreviewProvider`] is currently registered.
pub fn has_code_preview_provider() -> bool {
    code_preview_provider_slot()
        .read()
        .ok()
        .is_some_and(|g| g.is_some())
}

/// Whether a custom or default [`super::PdfPageProvider`] is currently registered.
pub fn has_pdf_page_provider() -> bool {
    super::preview::pdf_provider_slot()
        .read()
        .ok()
        .is_some_and(|g| g.is_some())
}

/// Whether a custom or default [`super::MathPreviewProvider`] is currently registered.
pub fn has_math_preview_provider() -> bool {
    super::preview::math_provider_slot()
        .read()
        .ok()
        .is_some_and(|g| g.is_some())
}

/// Guard keeping a preview-wakeup listener alive until the owning view drops.
#[must_use]
pub struct PreviewWakeupSubscription(#[allow(dead_code)] Arc<dyn Fn() + Send + Sync>);

fn preview_wakeup_listeners() -> &'static Mutex<Vec<Weak<dyn Fn() + Send + Sync>>> {
    static SLOT: OnceLock<Mutex<Vec<Weak<dyn Fn() + Send + Sync>>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(Vec::new()))
}

/// Subscribe a wakeup callback invoked whenever an async background preview transitions
/// from `Pending` to `Ready`/`Error`, so every live view requests a fresh frame automatically.
pub fn subscribe_preview_wakeup(cb: Arc<dyn Fn() + Send + Sync>) -> PreviewWakeupSubscription {
    let mut list = preview_wakeup_listeners()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    list.retain(|w| w.strong_count() > 0);
    list.push(Arc::downgrade(&cb));
    PreviewWakeupSubscription(cb)
}

/// Notify all live wakeup subscribers outside the lock after bumping the preview revision.
pub fn notify_preview_wakeup() {
    let active: Vec<Arc<dyn Fn() + Send + Sync>> = {
        let mut list = preview_wakeup_listeners()
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        let mut out = Vec::with_capacity(list.len());
        list.retain(|w| match w.upgrade() {
            Some(cb) => {
                out.push(cb);
                true
            }
            None => false,
        });
        out
    };
    for cb in active {
        cb();
    }
}

/// Register a host/worker [`CodePreviewProvider`] for `mermaid` and `typst` code blocks.
pub fn register_code_preview_provider(provider: Option<Arc<dyn CodePreviewProvider>>) {
    if let Ok(mut guard) = code_preview_provider_slot().write() {
        *guard = provider;
    }
    bump_preview_revision();
}

/// Returns `true` only when `kind` has a real renderer available in the current runtime.
pub fn code_preview_supported(kind: CodePreviewKind) -> bool {
    match kind {
        CodePreviewKind::Html => cfg!(target_arch = "wasm32"),
        CodePreviewKind::Mermaid | CodePreviewKind::Typst => code_preview_provider_slot()
            .read()
            .ok()
            .and_then(|g| g.as_ref().map(|p| p.supports(kind)))
            .unwrap_or(false),
    }
}

fn code_preview_revisions() -> &'static RwLock<(
    HashMap<(CodePreviewKind, String), u64>,
    VecDeque<(CodePreviewKind, String)>,
)> {
    static REVS: OnceLock<
        RwLock<(
            HashMap<(CodePreviewKind, String), u64>,
            VecDeque<(CodePreviewKind, String)>,
        )>,
    > = OnceLock::new();
    REVS.get_or_init(|| RwLock::new((HashMap::new(), VecDeque::new())))
}

/// Per-source revision stamp (`0` before any async worker delivery) so resolving one background
/// `mermaid` or `typst` diagram invalidates only blocks displaying that `(kind, source)`.
pub fn code_preview_revision(kind: CodePreviewKind, source: &str) -> u64 {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return 0;
    }
    code_preview_revisions()
        .read()
        .ok()
        .and_then(|g| g.0.get(&(kind, trimmed.to_string())).copied())
        .unwrap_or(0)
}

/// Bumps the per-source revision stamp for `(kind, source)` and increments [`bump_preview_revision`].
pub fn bump_code_preview_revision(kind: CodePreviewKind, source: &str) -> u64 {
    let trimmed = source.trim();
    if !trimmed.is_empty()
        && let Ok(mut guard) = code_preview_revisions().write()
    {
        let (map, order) = &mut *guard;
        let key = (kind, trimmed.to_string());
        let next = map.get(&key).copied().unwrap_or(0).wrapping_add(1);
        if !map.contains_key(&key) {
            while map.len() >= 1024 {
                let Some(oldest) = order.pop_front() else {
                    break;
                };
                map.remove(&oldest);
            }
            order.push_back(key.clone());
        }
        map.insert(key, next);
    }
    bump_preview_revision()
}

/// Query the registered [`CodePreviewProvider`] for a `mermaid` or `typst` preview.
pub fn query_code_preview_provider(
    kind: CodePreviewKind,
    source: &str,
    theme: PlaygroundTheme,
    dpr: f32,
) -> Option<CodePreviewResult> {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return Some(CodePreviewResult::Error("Empty diagram".to_string()));
    }
    let norm_dpr = if dpr.is_finite() && dpr > 0.0 {
        dpr.clamp(1.0, 4.0)
    } else {
        2.0
    };
    let guard = code_preview_provider_slot().read().ok()?;
    let provider = guard.as_ref()?;
    if !provider.supports(kind) {
        return None;
    }
    Some(provider.render_code_preview(kind, trimmed, theme, norm_dpr))
}

impl<'a> FlowPass<'a> {
    /// Build a live visual preview body for a `mermaid`, `typst`, or `html` code block
    /// without mutating CRDT state (`0 writeback`).
    pub(super) fn code_preview_body(
        &mut self,
        kind: CodePreviewKind,
        language: &str,
        text: &str,
        caption: &str,
        width: f32,
    ) -> BlockBody {
        use crate::theme::{FONT_SANS, TYPOGRAPHY};

        let (raw_pad_x, pad_y) = CODE_PADDING;
        let pad_x = if kind == CodePreviewKind::Mermaid && width < 440.0 {
            8.0
        } else {
            raw_pad_x
        };
        let header_h = 34.0;
        let inner_w = (width - pad_x * 2.0).max(40.0);

        let mut prims = vec![Prim::Quad {
            rect: FlowRect::new(0.0, 0.0, width, 120.0),
            fill: Some(self.palette.code_background),
            border: Some(self.palette.border),
            radius: CODE_RADIUS,
            dashed: false,
        }];

        let lang_label = if language.trim().is_empty() {
            kind.label()
        } else {
            language.trim()
        };
        let label_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            500.0,
            self.palette.text_secondary,
        );
        prims.push(Prim::Text {
            x: pad_x,
            y: 9.0,
            layout: self.plain_inline(lang_label, label_style, 180.0, 18.0, InlineAlign::Left),
            clip: None,
        });

        let content_h = if kind == CodePreviewKind::Html {
            // Only `wasm32` enables HTML code preview (backed by a real `#embed-layer`
            // sandboxed iframe with `sandbox="allow-scripts"` and no `allow-same-origin`).
            let box_h = 160.0;
            prims.push(Prim::Quad {
                rect: FlowRect::new(pad_x, header_h, inner_w, box_h),
                fill: Some(self.palette.background),
                border: Some(self.palette.border),
                radius: 6.0,
                dashed: false,
            });
            box_h
        } else {
            let dpr = self.window.scale_factor();
            match query_code_preview_provider(kind, text, self.input.theme, dpr) {
                Some(CodePreviewResult::Ready(slot)) => {
                    let scale = if slot.width_pt > inner_w {
                        inner_w / slot.width_pt.max(1.0)
                    } else {
                        1.0
                    };
                    let img_w = (slot.width_pt * scale).round().max(1.0);
                    let img_h = (slot.height_pt * scale).round().max(1.0);
                    let img_x = ((width - img_w) * 0.5).floor().max(pad_x);
                    prims.push(Prim::Image {
                        rect: FlowRect::new(img_x, header_h, img_w, img_h),
                        image: slot.image,
                    });
                    img_h
                }
                Some(CodePreviewResult::Pending) => {
                    let style = InlineStyle::new(
                        FONT_SANS,
                        TYPOGRAPHY.font_xs_px,
                        400.0,
                        self.palette.text_secondary,
                    );
                    prims.push(Prim::Text {
                        x: pad_x,
                        y: header_h + 12.0,
                        layout: self.plain_inline(
                            &format!("Rendering {} preview...", kind.label()),
                            style,
                            inner_w,
                            20.0,
                            InlineAlign::Center,
                        ),
                        clip: None,
                    });
                    48.0
                }
                Some(CodePreviewResult::Error(msg)) => {
                    let style = InlineStyle::new(
                        FONT_SANS,
                        TYPOGRAPHY.font_xs_px,
                        500.0,
                        ui::rgb(0xeb4335).into(),
                    );
                    let err_text = format!("{} preview error: {msg}", kind.label());
                    let layout =
                        self.plain_inline(&err_text, style, inner_w, 18.0, InlineAlign::Left);
                    let err_h = layout.height().clamp(20.0, 120.0);
                    prims.push(Prim::Text {
                        x: pad_x,
                        y: header_h + 10.0,
                        layout,
                        clip: Some(FlowRect::new(pad_x, header_h + 8.0, inner_w, err_h + 4.0)),
                    });
                    (err_h + 22.0).max(48.0)
                }
                None => {
                    let style = InlineStyle::new(
                        FONT_SANS,
                        TYPOGRAPHY.font_xs_px,
                        400.0,
                        self.palette.text_secondary,
                    );
                    prims.push(Prim::Text {
                        x: pad_x,
                        y: header_h + 12.0,
                        layout: self.plain_inline(
                            &format!("{} preview renderer not available", kind.label()),
                            style,
                            inner_w,
                            20.0,
                            InlineAlign::Center,
                        ),
                        clip: None,
                    });
                    48.0
                }
            }
        };

        let height = header_h + content_h + pad_y;
        if let Some(Prim::Quad { rect, .. }) = prims.first_mut() {
            rect.h = height;
        }
        let mut body = BlockBody {
            kind: FlowKind::Code,
            width,
            height,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: text.to_string(),
            prims,
            text: None,
            prefix: None,
            code_scroll: None,
            pdf_controls: None,
            table_cells: Vec::new(),
        };
        self.push_caption(&mut body, caption);
        body
    }
}
