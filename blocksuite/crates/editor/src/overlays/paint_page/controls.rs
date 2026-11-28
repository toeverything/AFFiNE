//! Interactive Page-layer controls for `affine:code` (Copy, Wrap, Preview)
//! and `affine:embed-*` external embed cards (real block selection + external URL open).

use blocksuite_playground_doc::read::{BlockContent, ExternalEmbedKind};
use ui::{
    AnyElement, ClickEvent, Context, FontWeight, Hsla, MouseButton, SharedString, prelude::*, px,
};

use crate::{
    block_flow::{
        CODE_RADIUS, CodePreviewKind, FlowBlock, FlowRect, PAGE_SURFACE_ID, PageViewport,
    },
    theme::{Palette, TYPOGRAPHY},
};

use super::{
    COPIED_LABEL_WIDTH, COPY_BUTTON_INSET, COPY_BUTTON_SIZE, OverlayEvent, OverlayHost,
    OverlayScene, Overlays, emit, icon, place,
};

impl Overlays {
    #[allow(clippy::too_many_arguments)]
    pub(super) fn push_code_controls<V: OverlayHost>(
        &self,
        block: &FlowBlock,
        rect: FlowRect,
        hovered: bool,
        scene: &OverlayScene<'_>,
        viewport: PageViewport,
        palette: &Palette,
        hover_filled: Hsla,
        cx: &mut Context<V>,
        elements: &mut Vec<AnyElement>,
    ) {
        let copied = self.copied_block() == Some(block.block_id.as_str());
        let focused = scene.focused_code_block == Some(block.block_id.as_str());
        let touch_browse = scene.form_factor != crate::block_flow::FormFactor::Desktop;
        let (code_lang, code_wrap) = scene
            .snapshot
            .block(&block.block_id)
            .and_then(|n| match &n.content {
                BlockContent::Code { language, wrap, .. } => Some((language.as_str(), *wrap)),
                _ => None,
            })
            .unwrap_or(("", false));
        let preview_kind = CodePreviewKind::from_language(code_lang)
            .filter(|k| crate::block_flow::code_preview_supported(*k));
        if !hovered && !copied && !focused && !touch_browse && preview_kind.is_none() {
            return;
        }
        let subtle = touch_browse && !hovered && !focused && !copied;
        let width = if copied {
            COPIED_LABEL_WIDTH
        } else {
            COPY_BUTTON_SIZE
        };
        let target = FlowRect::new(
            rect.right() - COPY_BUTTON_INSET - width,
            rect.y + COPY_BUTTON_INSET,
            width,
            COPY_BUTTON_SIZE,
        );
        let event = OverlayEvent::CopyCode(block.block_id.clone());
        let mut element = place(viewport.to_local(&target))
            .id(SharedString::from(format!("copy-{}", block.block_id)))
            .rounded(px(CODE_RADIUS - COPY_BUTTON_INSET))
            .bg(if subtle {
                palette.background.opacity(0.6)
            } else {
                palette.background
            })
            .border_1()
            .border_color(if subtle {
                palette.border.opacity(0.6)
            } else {
                palette.border
            })
            .flex()
            .items_center()
            .justify_center()
            .cursor_pointer()
            .hover(move |style| style.bg(hover_filled))
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .on_click(emit(cx, move |_: &ClickEvent| event.clone()));
        if viewport.fully_visible(&target) {
            element = element
                .snapshot(
                    SharedString::from(format!("{}.copy", block.snapshot_id)),
                    Some(PAGE_SURFACE_ID),
                )
                .snapshot_focused(copied || focused)
                .snapshot_text(if copied { "Copied" } else { "Copy" });
        }
        let element = if copied {
            element
                .text_size(px(TYPOGRAPHY.font_xs_px))
                .font_weight(FontWeight::MEDIUM)
                .text_color(palette.text_secondary)
                .child("Copied")
        } else {
            element.child(icon(
                "CopyIcon",
                16.0,
                if subtle {
                    palette.icon.opacity(0.55)
                } else {
                    palette.icon
                },
            ))
        };
        elements.push(element.into_any_element());

        let mut cursor_x = target.x - 4.0;
        let wrap_w = 46.0;
        if cursor_x - wrap_w >= rect.x + 96.0 {
            cursor_x -= wrap_w;
            let wrap_rect = FlowRect::new(cursor_x, target.y, wrap_w, COPY_BUTTON_SIZE);
            let wrap_ev = OverlayEvent::ToggleCodeWrap(block.block_id.clone());
            let mut wrap_el = place(viewport.to_local(&wrap_rect))
                .id(SharedString::from(format!("wrap-{}", block.block_id)))
                .rounded(px(CODE_RADIUS - COPY_BUTTON_INSET))
                .bg(if code_wrap {
                    palette.brand.opacity(0.14)
                } else {
                    palette.background
                })
                .border_1()
                .border_color(if code_wrap {
                    palette.brand
                } else {
                    palette.border
                })
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .hover(move |s| s.bg(hover_filled))
                .text_size(px(11.0))
                .font_weight(FontWeight::MEDIUM)
                .text_color(if code_wrap {
                    palette.brand
                } else {
                    palette.text_secondary
                })
                .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .on_click(emit(cx, move |_: &ClickEvent| wrap_ev.clone()))
                .child("Wrap");
            if viewport.fully_visible(&wrap_rect) {
                wrap_el = wrap_el
                    .snapshot(
                        SharedString::from(format!("{}.wrap", block.snapshot_id)),
                        Some(PAGE_SURFACE_ID),
                    )
                    .snapshot_focused(code_wrap)
                    .snapshot_text("Wrap");
            }
            elements.push(wrap_el.into_any_element());
            cursor_x -= 4.0;
        }

        if preview_kind.is_some() {
            let prev_w = 56.0;
            if cursor_x - prev_w >= rect.x + 96.0 {
                cursor_x -= prev_w;
                let prev_rect = FlowRect::new(cursor_x, target.y, prev_w, COPY_BUTTON_SIZE);
                let in_preview = block.body.text.is_none();
                let prev_label = if in_preview { "Code" } else { "Preview" };
                let prev_ev = OverlayEvent::ToggleCodePreview(block.block_id.clone());
                let mut prev_el = place(viewport.to_local(&prev_rect))
                    .id(SharedString::from(format!("preview-{}", block.block_id)))
                    .rounded(px(CODE_RADIUS - COPY_BUTTON_INSET))
                    .bg(if in_preview {
                        palette.brand.opacity(0.14)
                    } else {
                        palette.background
                    })
                    .border_1()
                    .border_color(if in_preview {
                        palette.brand
                    } else {
                        palette.border
                    })
                    .flex()
                    .items_center()
                    .justify_center()
                    .cursor_pointer()
                    .hover(move |s| s.bg(hover_filled))
                    .text_size(px(11.0))
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(if in_preview {
                        palette.brand
                    } else {
                        palette.text_secondary
                    })
                    .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                    .on_click(emit(cx, move |_: &ClickEvent| prev_ev.clone()))
                    .child(prev_label);
                if viewport.fully_visible(&prev_rect) {
                    prev_el = prev_el
                        .snapshot(
                            SharedString::from(format!("{}.preview", block.snapshot_id)),
                            Some(PAGE_SURFACE_ID),
                        )
                        .snapshot_focused(in_preview)
                        .snapshot_text(prev_label);
                }
                elements.push(prev_el.into_any_element());
            }
        }
    }

    pub(super) fn push_external_embed_controls<V: OverlayHost>(
        &self,
        block: &FlowBlock,
        rect: FlowRect,
        scene: &OverlayScene<'_>,
        viewport: PageViewport,
        cx: &mut Context<V>,
        elements: &mut Vec<AnyElement>,
    ) {
        let embed_meta = scene
            .snapshot
            .block(&block.block_id)
            .and_then(|n| match &n.content {
                BlockContent::ExternalEmbed { kind, url, .. } => Some((*kind, url.as_str())),
                _ => None,
            });
        let has_open_action = embed_meta.is_some_and(|(kind, url)| {
            if kind == ExternalEmbedKind::Html {
                cfg!(target_arch = "wasm32")
            } else {
                let u = url.trim();
                u.starts_with("https://") || u.starts_with("http://")
            }
        });
        let select_ev = OverlayEvent::ExternalEmbedInteract {
            block_id: block.block_id.clone(),
            activate: false,
        };
        let activate_ev = OverlayEvent::ExternalEmbedInteract {
            block_id: block.block_id.clone(),
            activate: true,
        };
        let mut shield = place(viewport.to_local(&rect))
            .id(SharedString::from(format!(
                "embed-shield-{}",
                block.block_id
            )))
            .cursor_pointer()
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .on_click(emit(cx, move |ev: &ClickEvent| {
                if ev.click_count() >= 2 && has_open_action {
                    activate_ev.clone()
                } else {
                    select_ev.clone()
                }
            }));
        if viewport.fully_visible(&rect) {
            shield = shield.snapshot(
                SharedString::from(format!("{}.embed_shield", block.snapshot_id)),
                Some(PAGE_SURFACE_ID),
            );
        }
        elements.push(shield.into_any_element());

        if has_open_action {
            let touch = scene.form_factor != crate::block_flow::FormFactor::Desktop;
            let pill_w = 64.0;
            let pill_h = if touch { 32.0 } else { 24.0 };
            let pill_rect = FlowRect::new(
                (rect.right() - 14.0 - pill_w).max(rect.x + 14.0),
                rect.y + 13.0,
                pill_w,
                pill_h,
            );
            let act_ev = OverlayEvent::ExternalEmbedInteract {
                block_id: block.block_id.clone(),
                activate: true,
            };
            let mut act_btn = place(viewport.to_local(&pill_rect))
                .id(SharedString::from(format!(
                    "embed-activate-{}",
                    block.block_id
                )))
                .cursor_pointer()
                .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .on_click(emit(cx, move |_: &ClickEvent| act_ev.clone()));
            if viewport.fully_visible(&pill_rect) {
                act_btn = act_btn.snapshot(
                    SharedString::from(format!("{}.embed_activate", block.snapshot_id)),
                    Some(PAGE_SURFACE_ID),
                );
            }
            elements.push(act_btn.into_any_element());
        }
    }
}
