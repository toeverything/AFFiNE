use ui::{
    AnyElement, ClickEvent, Context, FontWeight, Hsla, MouseDownEvent, SharedString, TextRun,
    Window, div, prelude::*, px,
};

use crate::{
    block_flow::FlowRect,
    theme::{FONT_SANS, Palette, TYPOGRAPHY},
};

use super::*;

const BOOKMARK_FIELD_WIDTH: f32 = 220.0;
const BOOKMARK_APPLY_WIDTH: f32 = 56.0;
const BOOKMARK_CANCEL_WIDTH: f32 = 56.0;
const BOOKMARK_PAD: f32 = 6.0;
const BOOKMARK_GAP: f32 = 4.0;

/// Floating URL input prompt opened by the mobile keyboard toolbar's `Bookmark` action.
/// Cancelling (`Escape`, `Cancel`, outside press, or empty/invalid URL) writes zero blocks.
#[derive(Clone, Debug, PartialEq)]
pub struct BookmarkPrompt {
    pub block_id: String,
    pub input: LinkBar,
    pub(super) presence: Presence,
    pub(super) rect: Option<FlowRect>,
}

impl Overlays {
    /// Active bookmark URL prompt, if open (not closing).
    pub fn bookmark_prompt(&self) -> Option<&BookmarkPrompt> {
        self.bookmark.as_ref().filter(|p| !p.presence.closing)
    }

    /// Mutable access to the open bookmark URL prompt.
    pub fn bookmark_prompt_mut(&mut self) -> Option<&mut BookmarkPrompt> {
        self.bookmark.as_mut().filter(|p| !p.presence.closing)
    }

    /// Open and focus the bookmark URL prompt anchored to `block_id`.
    pub fn open_bookmark_prompt(&mut self, block_id: String, now_ms: f64) {
        self.close_slash(now_ms);
        self.close_linked_doc(now_ms);
        self.close_link_field();
        self.close_equation_editor_at(now_ms);
        let presence = match self.bookmark.take() {
            Some(existing) => existing.presence.reopened(now_ms),
            None => Presence::opening(now_ms),
        };
        self.bookmark = Some(BookmarkPrompt {
            block_id,
            input: LinkBar::new(String::new()),
            presence,
            rect: None,
        });
    }

    /// Close the bookmark URL prompt immediately without inserting a block.
    pub fn close_bookmark_prompt(&mut self) {
        self.bookmark = None;
    }

    /// Dismiss the bookmark URL prompt with a fade-out transition (zero document writes).
    pub fn close_bookmark_prompt_at(&mut self, now_ms: f64) -> bool {
        match self.bookmark_prompt_mut() {
            Some(prompt) => {
                prompt.presence.close(now_ms);
                true
            }
            None => false,
        }
    }

    pub(super) fn apply_bookmark(&mut self, now_ms: f64, effects: &mut OverlayEffects) {
        let Some(prompt) = self.bookmark_prompt_mut() else {
            return;
        };
        let raw = prompt.input.clone().into_committed_text();
        let url = if raw.trim().starts_with('/') {
            String::new()
        } else {
            normalize_url(&raw)
        };
        if url.starts_with("http://") || url.starts_with("https://") {
            effects.edits.push(DocEdit::Bookmark {
                block_id: prompt.block_id.clone(),
                url,
            });
        }
        prompt.presence.close(now_ms);
        effects.redraw = true;
    }

    pub(super) fn render_bookmark<V: OverlayHost>(
        &mut self,
        scene: &OverlayScene<'_>,
        palette: &Palette,
        now_ms: f64,
        window: &mut Window,
        cx: &mut Context<V>,
    ) -> Option<AnyElement> {
        let prompt = self.bookmark.as_mut()?;
        prompt.rect = None;
        let progress = prompt.presence.progress(now_ms);
        if prompt.presence.closing && progress <= 0.0 {
            return None;
        }
        let interactive = !prompt.presence.closing;
        let progress = if interactive {
            progress.max(0.01)
        } else {
            progress
        };
        let anchor_world = scene.layout.block(&prompt.block_id).map(|b| b.rect())?;
        if !scene.page_viewport().intersects(&anchor_world) {
            return None;
        }
        let anchor = scene.world_to_screen(&anchor_world);
        let viewport = scene.popover_viewport();
        let max_w = (viewport.w - 2.0 * POPOVER_EDGE_MARGIN).max(200.0);
        let desired_w = BOOKMARK_FIELD_WIDTH
            + BOOKMARK_APPLY_WIDTH
            + BOOKMARK_CANCEL_WIDTH
            + 2.0 * BOOKMARK_GAP
            + 2.0 * BOOKMARK_PAD
            + 2.0;
        let width = desired_w.min(max_w).floor();
        let field_width = (width
            - 2.0 * BOOKMARK_PAD
            - 2.0
            - 2.0 * BOOKMARK_GAP
            - BOOKMARK_APPLY_WIDTH
            - BOOKMARK_CANCEL_WIDTH)
            .max(84.0);
        let height = TOOLBAR_BUTTON + 2.0 * BOOKMARK_PAD + 2.0;
        let placed = place_popover(
            anchor,
            (width, height),
            viewport,
            Placement::BelowStart,
            POPOVER_GAP,
            POPOVER_EDGE_MARGIN,
        );
        prompt.rect = Some(placed.rect);
        prompt.input.bounds = Some(FlowRect::new(
            placed.rect.x + BOOKMARK_PAD + 1.0,
            placed.rect.y + BOOKMARK_PAD + 1.0,
            field_width,
            TOOLBAR_BUTTON,
        ));

        let text = prompt.input.text();
        let (selection, reversed) = prompt.input.shown_selection();
        let marked = prompt.input.marked_range();
        let shown = SharedString::from(text.clone());
        let mut font = ui::font(FONT_SANS);
        font.weight = FontWeight::NORMAL;
        let line = window.text_system().shape_line(
            shown.clone(),
            px(TYPOGRAPHY.font_xs_px),
            &[TextRun {
                len: shown.len(),
                font,
                color: palette.text_primary,
                background_color: None,
                underline: None,
                strikethrough: None,
            }],
            None,
        );
        let text_room = (field_width - 16.0).max(16.0);
        let inner_height = TOOLBAR_BUTTON - 2.0;
        let caret_height = 15.0;
        let caret_top = ((inner_height - caret_height) * 0.5).round();
        let x_at = |off: usize| f32::from(line.x_for_index(utf16_to_byte(&text, off)));
        let text_width = f32::from(line.width());
        let caret_x = x_at(if reversed {
            selection.start
        } else {
            selection.end
        });
        let scroll = if text_width + 1.0 <= text_room {
            0.0
        } else {
            (caret_x + 1.0 - text_room)
                .clamp(0.0, text_width + 1.0 - text_room)
                .round()
        };

        let mut inner = div()
            .relative()
            .flex_none()
            .w(px(text_room))
            .h(px(inner_height))
            .overflow_hidden();
        let strip = |from: usize, to: usize, top: f32, h: f32, color: Hsla| {
            div()
                .absolute()
                .left(px((x_at(from) - scroll).round()))
                .top(px(top))
                .w(px((x_at(to) - x_at(from)).round().max(1.0)))
                .h(px(h))
                .bg(color)
        };
        if marked.is_none() && !selection.is_empty() {
            inner = inner.child(strip(
                selection.start,
                selection.end,
                caret_top,
                caret_height,
                palette.brand.opacity(0.22),
            ));
        }
        inner = inner.child(if text.is_empty() {
            div()
                .absolute()
                .left(px(1.0))
                .top(px(0.0))
                .h(px(inner_height))
                .flex()
                .items_center()
                .whitespace_nowrap()
                .text_color(palette.placeholder)
                .child("Paste or type a bookmark link")
        } else {
            div()
                .absolute()
                .left(px(-scroll))
                .top(px(0.0))
                .h(px(inner_height))
                .flex()
                .items_center()
                .whitespace_nowrap()
                .text_color(palette.text_primary)
                .child(shown)
        });
        if let Some(m) = &marked {
            inner = inner.child(strip(
                m.start,
                m.end,
                caret_top + caret_height - 1.0,
                1.0,
                palette.text_secondary,
            ));
        }
        inner = inner.child(
            div()
                .absolute()
                .left(px((caret_x - scroll).round()))
                .top(px(caret_top))
                .w(px(1.0))
                .h(px(caret_height))
                .bg(palette.text_primary),
        );

        let field = div()
            .flex_none()
            .w(px(field_width))
            .h(px(TOOLBAR_BUTTON))
            .px(px(8.0))
            .rounded(px(4.0))
            .bg(palette.background)
            .border_1()
            .border_color(palette.brand)
            .flex()
            .items_center()
            .overflow_hidden()
            .text_size(px(TYPOGRAPHY.font_xs_px))
            .snapshot(
                "overlay.bookmark_prompt.input",
                Some("overlay.bookmark_prompt"),
            )
            .snapshot_focused(true)
            .snapshot_text(text)
            .child(inner);

        let mut apply = div()
            .id("bookmark_apply")
            .flex_none()
            .w(px(BOOKMARK_APPLY_WIDTH))
            .h(px(TOOLBAR_BUTTON))
            .rounded(px(4.0))
            .bg(palette.brand)
            .text_color(palette.on_accent)
            .flex()
            .items_center()
            .justify_center()
            .text_size(px(TYPOGRAPHY.font_xs_px))
            .font_weight(FontWeight::MEDIUM)
            .snapshot(
                "overlay.bookmark_prompt.apply",
                Some("overlay.bookmark_prompt"),
            )
            .snapshot_text("Apply")
            .child("Apply");

        let hover_bg = palette.hover;
        let mut cancel = div()
            .id("bookmark_cancel")
            .flex_none()
            .w(px(BOOKMARK_CANCEL_WIDTH))
            .h(px(TOOLBAR_BUTTON))
            .rounded(px(4.0))
            .text_color(palette.text_secondary)
            .flex()
            .items_center()
            .justify_center()
            .text_size(px(TYPOGRAPHY.font_xs_px))
            .font_weight(FontWeight::MEDIUM)
            .snapshot(
                "overlay.bookmark_prompt.cancel",
                Some("overlay.bookmark_prompt"),
            )
            .snapshot_text("Cancel")
            .child("Cancel");

        if interactive {
            apply = apply
                .cursor_pointer()
                .on_click(emit(cx, |_: &ClickEvent| OverlayEvent::BookmarkApply));
            cancel = cancel
                .cursor_pointer()
                .hover(move |s| s.bg(hover_bg))
                .on_click(emit(cx, |_: &ClickEvent| OverlayEvent::CloseBookmarkPrompt));
        }

        let mut root = place(placed.rect)
            .id("bookmark-prompt")
            .flex()
            .items_center()
            .gap(px(BOOKMARK_GAP))
            .p(px(BOOKMARK_PAD))
            .rounded(px(8.0))
            .bg(palette.panel)
            .border_1()
            .border_color(palette.border)
            .shadow(palette.theme.shadows("--affine-toolbar-shadow").into())
            .opacity(progress)
            .snapshot("overlay.bookmark_prompt", Some("root.canvas"))
            .snapshot_focused(interactive)
            .child(field)
            .child(apply)
            .child(cancel);
        if interactive {
            root = root
                .occlude()
                .on_mouse_down_out(emit(cx, |_: &MouseDownEvent| {
                    OverlayEvent::CloseBookmarkPrompt
                }));
        }
        Some(root.into_any_element())
    }
}
