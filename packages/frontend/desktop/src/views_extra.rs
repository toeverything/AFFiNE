//! Secondary desktop views: scrollable document list routes (`All Docs`, `Favorites`,
//! `Journals`, `Folder`, `Collection`, `Tag`), `Trash` management, and right `DocInfo / Outline` panel.

use ui::{
    Context, FontWeight, InteractiveElement, IntoElement, ParentElement, ScrollEvent,
    StatefulInteractiveElement, Styled, div, px, svg,
};
use ui_tokens::FONT_SANS;

use crate::{
    DOC_ICON_SVG, DesktopFlexExt, DesktopPalette, EDGELESS_ICON_SVG, PEEK_ICON_SVG, SPLIT_ICON_SVG,
    TRASH_ICON_SVG,
    doc_store::{DesktopDocMeta, DesktopDocStore},
    workbench::{DesktopShellView, DocInspectorTab},
};

/// Render a scrollable list view for All Docs, Favorites, Journals, Folder, Collection, or Tag routes.
pub(crate) fn render_doc_list_view(
    pane_idx: usize,
    heading: &str,
    subtitle: &str,
    docs: Vec<&DesktopDocMeta>,
    scroll_y: f32,
    palette: DesktopPalette,
    cx: &mut Context<DesktopShellView>,
) -> impl IntoElement {
    let doc_count = docs.len();
    let mut rows = div()
        .flex()
        .flex_col()
        .w_full()
        .gap(px(8.0))
        .mt(px(-scroll_y));
    if docs.is_empty() {
        rows = rows.child(
            div()
                .p(px(24.0))
                .rounded(px(12.0))
                .bg(palette.bg_surface)
                .border_1()
                .border_color(palette.border)
                .text_size(px(13.0))
                .text_color(palette.text_muted)
                .child("No documents in this view."),
        );
    } else {
        for doc in docs {
            let id_open = doc.id.clone();
            let id_split = doc.id.clone();
            let id_peek = doc.id.clone();
            let is_edgeless = doc.default_mode == affine_store::directory::DocMode::Edgeless;
            let mut tag_chips = div().flex().flex_row().items_center().gap(px(6.0));
            for tag in &doc.tags {
                tag_chips = tag_chips.child(
                    div()
                        .px(px(7.0))
                        .py(px(2.0))
                        .rounded(px(5.0))
                        .bg(palette.accent_soft)
                        .text_size(px(11.0))
                        .text_color(palette.accent)
                        .child(format!("#{tag}")),
                );
            }
            rows = rows.child(
                div()
                    .id(ui::SharedString::from(format!(
                        "desktop.list.doc.{}",
                        doc.id
                    )))
                    .flex()
                    .flex_row()
                    .items_center()
                    .justify_between()
                    .w_full()
                    .px(px(14.0))
                    .py(px(12.0))
                    .rounded(px(10.0))
                    .bg(palette.bg_surface)
                    .border_1()
                    .border_color(palette.border)
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.state.open_doc_in_active_pane(&id_open);
                        cx.notify();
                    }))
                    .child(
                        div()
                            .flex()
                            .flex_row()
                            .items_start()
                            .gap(px(10.0))
                            .flex_1()
                            .min_w_0()
                            .child(
                                svg()
                                    .data(if is_edgeless {
                                        EDGELESS_ICON_SVG
                                    } else {
                                        DOC_ICON_SVG
                                    })
                                    .w(px(16.0))
                                    .h(px(16.0))
                                    .text_color(palette.accent),
                            )
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .gap(px(4.0))
                                    .flex_1()
                                    .min_w_0()
                                    .child(
                                        div()
                                            .text_size(px(14.0))
                                            .font_weight(FontWeight::MEDIUM)
                                            .text_color(palette.text_primary)
                                            .child(doc.title.clone()),
                                    )
                                    .child(
                                        div()
                                            .text_size(px(12.0))
                                            .text_color(palette.text_muted)
                                            .child(doc.summary.clone()),
                                    )
                                    .child(tag_chips),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_row()
                            .items_center()
                            .gap(px(6.0))
                            .child(
                                div()
                                    .id(ui::SharedString::from(format!(
                                        "desktop.list.peek.{}",
                                        doc.id
                                    )))
                                    .h(px(28.0))
                                    .px(px(8.0))
                                    .rounded(px(6.0))
                                    .bg(palette.bg_pill)
                                    .flex()
                                    .flex_row()
                                    .items_center()
                                    .gap(px(4.0))
                                    .text_size(px(11.5))
                                    .text_color(palette.text_secondary)
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        this.state.open_peek_view(&id_peek);
                                        cx.notify();
                                    }))
                                    .child(
                                        svg()
                                            .data(PEEK_ICON_SVG)
                                            .w(px(13.0))
                                            .h(px(13.0))
                                            .text_color(palette.text_secondary),
                                    )
                                    .child("Peek"),
                            )
                            .child(
                                div()
                                    .id(ui::SharedString::from(format!(
                                        "desktop.list.split.{}",
                                        doc.id
                                    )))
                                    .h(px(28.0))
                                    .px(px(8.0))
                                    .rounded(px(6.0))
                                    .bg(palette.bg_pill)
                                    .flex()
                                    .flex_row()
                                    .items_center()
                                    .gap(px(4.0))
                                    .text_size(px(11.5))
                                    .text_color(palette.text_secondary)
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        this.state.open_doc_in_split(&id_split);
                                        cx.notify();
                                    }))
                                    .child(
                                        svg()
                                            .data(SPLIT_ICON_SVG)
                                            .w(px(13.0))
                                            .h(px(13.0))
                                            .text_color(palette.text_secondary),
                                    )
                                    .child("Split"),
                            ),
                    ),
            );
        }
    }

    div()
        .flex()
        .flex_col()
        .w_full()
        .h_full()
        .p(px(28.0))
        .gap(px(18.0))
        .font_family(FONT_SANS)
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(4.0))
                .child(
                    div()
                        .text_size(px(22.0))
                        .font_weight(FontWeight::BOLD)
                        .text_color(palette.text_primary)
                        .child(heading.to_string()),
                )
                .child(
                    div()
                        .text_size(px(13.0))
                        .text_color(palette.text_muted)
                        .child(subtitle.to_string()),
                ),
        )
        .child(
            div()
                .id(ui::SharedString::from(format!(
                    "desktop.list.scroll.{pane_idx}"
                )))
                .flex_1()
                .min_h_0()
                .w_full()
                .overflow_hidden()
                .on_scroll(cx.listener(move |this, event: &ScrollEvent, _, cx| {
                    let dy: f32 = event.delta.pixel_delta(px(20.0)).y.into();
                    let max_scroll = (doc_count as f32 * 86.0 - 400.0).max(0.0);
                    if let Some(pane) = this.state.split.panes.get_mut(pane_idx) {
                        pane.scroll_y = (pane.scroll_y - dy).clamp(0.0, max_scroll);
                        cx.notify();
                    }
                }))
                .child(rows),
        )
}

/// Render the scrollable Trash view with Restore and Permanent Delete controls.
pub(crate) fn render_trash_view(
    pane_idx: usize,
    store: &DesktopDocStore,
    scroll_y: f32,
    palette: DesktopPalette,
    cx: &mut Context<DesktopShellView>,
) -> impl IntoElement {
    let trashed = store.trashed_docs();
    let trashed_count = trashed.len();
    let mut rows = div()
        .flex()
        .flex_col()
        .w_full()
        .gap(px(10.0))
        .mt(px(-scroll_y));
    if trashed.is_empty() {
        rows = rows.child(
            div()
                .p(px(24.0))
                .rounded(px(12.0))
                .bg(palette.bg_surface)
                .border_1()
                .border_color(palette.border)
                .text_size(px(13.0))
                .text_color(palette.text_muted)
                .child("Trash is empty."),
        );
    } else {
        for doc in trashed {
            let id_restore = doc.id.clone();
            let id_delete = doc.id.clone();
            rows = rows.child(
                div()
                    .id(ui::SharedString::from(format!(
                        "desktop.trash.row.{}",
                        doc.id
                    )))
                    .snapshot(
                        ui::SharedString::from(format!("desktop.trash.row.{}", doc.id)),
                        Some("desktop.workbench"),
                    )
                    .flex()
                    .flex_row()
                    .items_center()
                    .justify_between()
                    .w_full()
                    .px(px(16.0))
                    .py(px(12.0))
                    .rounded(px(12.0))
                    .bg(palette.bg_surface)
                    .border_1()
                    .border_color(palette.border)
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(3.0))
                            .child(
                                div()
                                    .text_size(px(14.0))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(palette.text_primary)
                                    .child(doc.title.clone()),
                            )
                            .child(
                                div()
                                    .text_size(px(12.0))
                                    .text_color(palette.text_muted)
                                    .child(doc.summary.clone()),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_row()
                            .items_center()
                            .gap(px(8.0))
                            .child(
                                div()
                                    .id(ui::SharedString::from(format!(
                                        "desktop.trash.restore.{}",
                                        doc.id
                                    )))
                                    .h(px(30.0))
                                    .px(px(12.0))
                                    .rounded(px(7.0))
                                    .bg(palette.accent_soft)
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .text_size(px(12.0))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(palette.accent)
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        this.state.restore_doc(&id_restore);
                                        cx.notify();
                                    }))
                                    .child("Restore"),
                            )
                            .child(
                                div()
                                    .id(ui::SharedString::from(format!(
                                        "desktop.trash.delete.{}",
                                        doc.id
                                    )))
                                    .h(px(30.0))
                                    .px(px(12.0))
                                    .rounded(px(7.0))
                                    .bg(palette.danger_soft)
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .text_size(px(12.0))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(palette.danger)
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        this.state.permanently_delete_doc(&id_delete);
                                        cx.notify();
                                    }))
                                    .child("Delete Permanently"),
                            ),
                    ),
            );
        }
    }

    div()
        .id("desktop.trash.view")
        .snapshot("desktop.trash.view", Some("desktop.workbench"))
        .flex()
        .flex_col()
        .w_full()
        .h_full()
        .p(px(28.0))
        .gap(px(18.0))
        .font_family(FONT_SANS)
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(10.0))
                .child(
                    svg()
                        .data(TRASH_ICON_SVG)
                        .w(px(20.0))
                        .h(px(20.0))
                        .text_color(palette.danger),
                )
                .child(
                    div()
                        .text_size(px(22.0))
                        .font_weight(FontWeight::BOLD)
                        .text_color(palette.text_primary)
                        .child("Trash"),
                ),
        )
        .child(
            div()
                .text_size(px(13.0))
                .text_color(palette.text_muted)
                .child("Soft-deleted documents can be restored or permanently removed."),
        )
        .child(
            div()
                .id(ui::SharedString::from(format!(
                    "desktop.trash.scroll.{pane_idx}"
                )))
                .flex_1()
                .min_h_0()
                .w_full()
                .overflow_hidden()
                .on_scroll(cx.listener(move |this, event: &ScrollEvent, _, cx| {
                    let dy: f32 = event.delta.pixel_delta(px(20.0)).y.into();
                    let max_scroll = (trashed_count as f32 * 76.0 - 400.0).max(0.0);
                    if let Some(pane) = this.state.split.panes.get_mut(pane_idx) {
                        pane.scroll_y = (pane.scroll_y - dy).clamp(0.0, max_scroll);
                        cx.notify();
                    }
                }))
                .child(rows),
        )
}

/// Render the right docked Document Info & Outline (TOC) inspector side panel.
pub(crate) fn render_doc_inspector(
    tab: DocInspectorTab,
    doc_id: Option<&str>,
    store: &DesktopDocStore,
    palette: DesktopPalette,
    cx: &mut Context<DesktopShellView>,
) -> impl IntoElement {
    let mut body = div()
        .flex()
        .flex_col()
        .gap(px(10.0))
        .w_full()
        .flex_1()
        .min_h_0();
    match (tab, doc_id) {
        (DocInspectorTab::Outline, Some(id)) => {
            let headings = store.outline_headings(id);
            if headings.is_empty() {
                body = body.child(
                    div()
                        .text_size(px(12.5))
                        .text_color(palette.text_muted)
                        .child("No headings in this document."),
                );
            } else {
                for h in headings {
                    let indent = (h.level.saturating_sub(1) as f32) * 12.0;
                    body = body.child(
                        div()
                            .pl(px(indent))
                            .py(px(3.0))
                            .text_size(px(12.5))
                            .font_weight(if h.level == 1 {
                                FontWeight::MEDIUM
                            } else {
                                FontWeight::NORMAL
                            })
                            .text_color(palette.text_primary)
                            .child(h.text),
                    );
                }
            }
        }
        (DocInspectorTab::Info, Some(id)) => {
            if let Some(entry) = store.get_doc(id) {
                let backlinks = store.backlinks_for(id);
                let block_count = entry.snapshot.root.as_ref().map_or(0, |r| r.walk().count());
                body = body
                    .child(info_row("Document ID", entry.meta.id.clone(), palette))
                    .child(info_row(
                        "Mode",
                        entry.meta.default_mode.as_str().to_string(),
                        palette,
                    ))
                    .child(info_row(
                        "CRDT Revision",
                        entry.revision.to_string(),
                        palette,
                    ))
                    .child(info_row("Blocks", block_count.to_string(), palette))
                    .child(info_row("Backlinks", backlinks.len().to_string(), palette));
                if !backlinks.is_empty() {
                    body = body.child(
                        div()
                            .pt(px(8.0))
                            .text_size(px(11.5))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(palette.text_muted)
                            .child("LINKED FROM"),
                    );
                    for bl in backlinks {
                        let target_id = bl.id.clone();
                        body = body.child(
                            div()
                                .id(ui::SharedString::from(format!(
                                    "desktop.inspector.bl.{}",
                                    bl.id
                                )))
                                .px(px(8.0))
                                .py(px(6.0))
                                .rounded(px(6.0))
                                .bg(palette.bg_surface)
                                .text_size(px(12.0))
                                .text_color(palette.accent)
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.state.open_peek_view(&target_id);
                                    cx.notify();
                                }))
                                .child(bl.title.clone()),
                        );
                    }
                }
            }
        }
        (_, None) => {
            body = body.child(
                div()
                    .text_size(px(12.5))
                    .text_color(palette.text_muted)
                    .child("Open a document to inspect its outline and metadata."),
            );
        }
    }

    div()
        .id("desktop.inspector")
        .snapshot("desktop.inspector", Some("desktop.shell.root"))
        .w(px(250.0))
        .h_full()
        .flex_shrink(0.0)
        .bg(palette.bg_sidebar)
        .border_l_1()
        .border_color(palette.border)
        .font_family(FONT_SANS)
        .flex()
        .flex_col()
        .p(px(14.0))
        .gap(px(12.0))
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap(px(4.0))
                .p(px(3.0))
                .rounded(px(8.0))
                .bg(palette.bg_pill)
                .child(inspector_tab_btn(
                    "desktop.inspector.tab.outline",
                    "Outline",
                    tab == DocInspectorTab::Outline,
                    DocInspectorTab::Outline,
                    palette,
                    cx,
                ))
                .child(inspector_tab_btn(
                    "desktop.inspector.tab.info",
                    "Info",
                    tab == DocInspectorTab::Info,
                    DocInspectorTab::Info,
                    palette,
                    cx,
                )),
        )
        .child(body)
}

fn inspector_tab_btn(
    id: &'static str,
    label: &'static str,
    active: bool,
    target: DocInspectorTab,
    palette: DesktopPalette,
    cx: &mut Context<DesktopShellView>,
) -> ui::Stateful<ui::Div> {
    div()
        .id(id)
        .flex_1()
        .h(px(26.0))
        .rounded(px(6.0))
        .bg(if active {
            palette.bg_elevated
        } else {
            ui::hsla(0.0, 0.0, 0.0, 0.0)
        })
        .flex()
        .items_center()
        .justify_center()
        .text_size(px(12.0))
        .font_weight(if active {
            FontWeight::MEDIUM
        } else {
            FontWeight::NORMAL
        })
        .text_color(if active {
            palette.text_primary
        } else {
            palette.text_muted
        })
        .on_click(cx.listener(move |this, _, _, cx| {
            this.state.inspector_tab = Some(target);
            cx.notify();
        }))
        .child(label)
}

fn info_row(label: &'static str, value: String, palette: DesktopPalette) -> ui::Div {
    div()
        .flex()
        .flex_row()
        .items_center()
        .justify_between()
        .w_full()
        .py(px(4.0))
        .child(
            div()
                .text_size(px(12.0))
                .text_color(palette.text_muted)
                .child(label),
        )
        .child(
            div()
                .text_size(px(12.0))
                .font_weight(FontWeight::MEDIUM)
                .text_color(palette.text_primary)
                .child(value),
        )
}
