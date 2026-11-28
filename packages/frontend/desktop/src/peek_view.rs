//! Centered `PeekView` modal for previewing and editing `@` referenced documents
//! via a live embedded `Entity<PlaygroundView>`, adhering to iOS 27 `pane_corner = 38pt`
//! geometry (`22pt` concentric inner card, fixed short `Peek` title, `36×36pt` close button,
//! and bottom action bar).

use playground::PlaygroundView;
use ui::{
    Context, Entity, FontWeight, InteractiveElement, IntoElement, ParentElement,
    StatefulInteractiveElement, Styled, div, px, svg,
};
use ui_tokens::FONT_SANS;

use crate::{
    CLOSE_ICON_SVG, DOC_ICON_SVG, DesktopFlexExt, DesktopPalette, SPLIT_ICON_SVG,
    workbench::DesktopShellView,
};

/// Actions that promote or dismiss [`PeekViewState`].
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PeekAction {
    OpenInCurrentPane,
    OpenInSplitView,
    Close,
}

/// State machine for the centered document `PeekView` modal.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PeekViewState {
    pub doc_id: Option<String>,
    pub source_doc_id: Option<String>,
    pub scroll_y: f32,
}

impl PeekViewState {
    pub fn is_open(&self) -> bool {
        self.doc_id.is_some()
    }

    pub fn open(&mut self, target_doc_id: impl Into<String>, source_doc_id: Option<String>) {
        self.doc_id = Some(target_doc_id.into());
        self.source_doc_id = source_doc_id;
        self.scroll_y = 0.0;
    }

    pub fn close(&mut self) {
        self.doc_id = None;
        self.source_doc_id = None;
        self.scroll_y = 0.0;
    }
}

/// Render the centered `PeekView` modal following iOS 27 `pane_corner = 38pt` geometry.
pub(crate) fn render_peek_view_modal(
    peek_entity: Option<Entity<PlaygroundView>>,
    palette: DesktopPalette,
    cx: &mut Context<DesktopShellView>,
) -> impl IntoElement {
    let body: ui::AnyElement = if let Some(entity) = peek_entity {
        div()
            .flex()
            .flex_col()
            .w_full()
            .h_full()
            .overflow_hidden()
            .child(entity)
            .into_any_element()
    } else {
        div()
            .flex()
            .items_center()
            .justify_center()
            .w_full()
            .h_full()
            .text_size(px(14.0))
            .text_color(palette.text_muted)
            .child("Document not found")
            .into_any_element()
    };

    div()
        .id("desktop.peek.backdrop")
        .absolute()
        .top(px(0.0))
        .left(px(0.0))
        .w_full()
        .h_full()
        .bg(palette.scrim)
        .flex()
        .items_center()
        .justify_center()
        .child(
            div()
                .id("desktop.peek.modal")
                .snapshot("desktop.peek.modal", Some("desktop.shell.root"))
                .w(px(780.0))
                .h(px(580.0))
                .rounded(px(38.0))
                .bg(palette.bg_elevated)
                .border_1()
                .border_color(palette.border_strong)
                .font_family(FONT_SANS)
                .flex()
                .flex_col()
                .p(px(16.0))
                .gap(px(12.0))
                .child(
                    // Fixed short title "Peek" + top-right 36x36 (r=18) circular close button
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .w_full()
                        .px(px(4.0))
                        .pt(px(4.0))
                        .child(
                            div()
                                .flex()
                                .flex_row()
                                .items_center()
                                .gap(px(8.0))
                                .child(
                                    svg()
                                        .data(DOC_ICON_SVG)
                                        .w(px(16.0))
                                        .h(px(16.0))
                                        .flex_shrink(0.0)
                                        .text_color(palette.accent),
                                )
                                .child(
                                    div()
                                        .text_size(px(15.0))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(palette.text_primary)
                                        .child("Peek"),
                                ),
                        )
                        .child(
                            div()
                                .id("desktop.peek.close")
                                .snapshot("desktop.peek.close", Some("desktop.peek.modal"))
                                .w(px(36.0))
                                .h(px(36.0))
                                .rounded(px(18.0))
                                .bg(palette.bg_pill)
                                .flex()
                                .items_center()
                                .justify_center()
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.state.apply_peek_action(PeekAction::Close);
                                    cx.notify();
                                }))
                                .child(
                                    svg()
                                        .data(CLOSE_ICON_SVG)
                                        .w(px(14.0))
                                        .h(px(14.0))
                                        .text_color(palette.text_primary),
                                ),
                        ),
                )
                .child(
                    // Concentric inner live editor card (R_inner = 38 - 16 = 22px)
                    div()
                        .id("desktop.peek.card")
                        .snapshot("desktop.peek.card", Some("desktop.peek.modal"))
                        .flex()
                        .flex_col()
                        .flex_1()
                        .min_h_0()
                        .w_full()
                        .rounded(px(22.0))
                        .overflow_hidden()
                        .bg(palette.bg_canvas)
                        .border_1()
                        .border_color(palette.border)
                        .child(body),
                )
                .child(
                    // Clean bottom action bar (separated from the top-right close button)
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .w_full()
                        .px(px(4.0))
                        .child(
                            div()
                                .text_size(px(12.0))
                                .text_color(palette.text_muted)
                                .child("Live editable preview"),
                        )
                        .child(
                            div()
                                .flex()
                                .flex_row()
                                .items_center()
                                .gap(px(8.0))
                                .child(
                                    div()
                                        .id("desktop.peek.open_split")
                                        .snapshot(
                                            "desktop.peek.open_split",
                                            Some("desktop.peek.modal"),
                                        )
                                        .h(px(34.0))
                                        .px(px(14.0))
                                        .rounded(px(14.0))
                                        .bg(palette.bg_pill)
                                        .border_1()
                                        .border_color(palette.border)
                                        .flex()
                                        .flex_row()
                                        .items_center()
                                        .gap(px(6.0))
                                        .text_size(px(12.5))
                                        .font_weight(FontWeight::MEDIUM)
                                        .text_color(palette.text_primary)
                                        .on_click(cx.listener(|this, _, _, cx| {
                                            this.state
                                                .apply_peek_action(PeekAction::OpenInSplitView);
                                            cx.notify();
                                        }))
                                        .child(
                                            svg()
                                                .data(SPLIT_ICON_SVG)
                                                .w(px(14.0))
                                                .h(px(14.0))
                                                .text_color(palette.text_primary),
                                        )
                                        .child("Open in Split View"),
                                )
                                .child(
                                    div()
                                        .id("desktop.peek.open_current")
                                        .snapshot(
                                            "desktop.peek.open_current",
                                            Some("desktop.peek.modal"),
                                        )
                                        .h(px(34.0))
                                        .px(px(14.0))
                                        .rounded(px(14.0))
                                        .bg(palette.accent)
                                        .flex()
                                        .items_center()
                                        .justify_center()
                                        .text_size(px(12.5))
                                        .font_weight(FontWeight::MEDIUM)
                                        .text_color(ui::hsla(0.0, 0.0, 1.0, 1.0))
                                        .on_click(cx.listener(|this, _, _, cx| {
                                            this.state
                                                .apply_peek_action(PeekAction::OpenInCurrentPane);
                                            cx.notify();
                                        }))
                                        .child("Open in Current Pane"),
                                ),
                        ),
                ),
        )
}
