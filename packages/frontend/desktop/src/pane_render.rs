//! Per-pane content renderer: mounts real interactive `Entity<PlaygroundView>` for
//! live Page / Edgeless editing, and scrollable list/Trash views for secondary routes.

use ui::{AnyElement, Context, IntoElement, ParentElement, Styled, div, px};
use ui_tokens::ThemeMode;

use crate::{
    DesktopFlexExt, DesktopPalette,
    doc_store::DesktopDocStore,
    editor_host::DesktopEditorHost,
    split_view::{DesktopRoute, PaneState},
    views_extra::{render_doc_list_view, render_trash_view},
    workbench::DesktopShellView,
};

/// Render the body of one workbench pane (live interactive `Entity<PlaygroundView>` or scrollable list).
#[allow(clippy::too_many_arguments)]
pub(crate) fn render_pane_content(
    pane: &mut PaneState,
    pane_idx: usize,
    store: &mut DesktopDocStore,
    editor_host: &mut DesktopEditorHost,
    theme: ThemeMode,
    palette: DesktopPalette,
    origin_x: f32,
    origin_y: f32,
    pane_width: f32,
    pane_height: f32,
    cx: &mut Context<DesktopShellView>,
) -> AnyElement {
    let scroll_y = pane.scroll_y;
    match pane.active_route().clone() {
        DesktopRoute::Doc(doc_id) => {
            let Some(entity) = editor_host.ensure_pane_editor(
                pane.id,
                &doc_id,
                pane.active_mode(),
                theme,
                origin_x,
                origin_y,
                pane_width,
                pane_height,
                store,
                cx,
            ) else {
                return div()
                    .flex()
                    .items_center()
                    .justify_center()
                    .w_full()
                    .h_full()
                    .text_size(px(14.0))
                    .text_color(palette.text_muted)
                    .child("Document not found")
                    .into_any_element();
            };

            div()
                .relative()
                .flex()
                .flex_col()
                .w(px(pane_width))
                .h(px(pane_height))
                .overflow_hidden()
                .bg(palette.bg_canvas)
                .child(entity)
                .into_any_element()
        }
        DesktopRoute::AllDocs => render_doc_list_view(
            pane_idx,
            "All Docs",
            "All active collaborative documents in this workspace.",
            store.visible_docs(),
            scroll_y,
            palette,
            cx,
        )
        .into_any_element(),
        DesktopRoute::Favorites => render_doc_list_view(
            pane_idx,
            "Favorites",
            "Starred documents pinned for instant access.",
            store.favorite_docs(),
            scroll_y,
            palette,
            cx,
        )
        .into_any_element(),
        DesktopRoute::Journals => render_doc_list_view(
            pane_idx,
            "Journals",
            "Daily journal notes organized by date.",
            store.journal_docs(),
            scroll_y,
            palette,
            cx,
        )
        .into_any_element(),
        DesktopRoute::Folder(folder_id) => {
            let name = store
                .folder_rows
                .iter()
                .find(|r| r.id == folder_id)
                .map(|r| r.data.as_str())
                .unwrap_or("Folder");
            render_doc_list_view(
                pane_idx,
                name,
                "Documents organized inside this folder.",
                store.docs_in_folder(&folder_id),
                scroll_y,
                palette,
                cx,
            )
            .into_any_element()
        }
        DesktopRoute::Collection(col_id) => {
            let name = store
                .collections
                .iter()
                .find(|c| c.id == col_id)
                .map(|c| c.name.as_str())
                .unwrap_or("Collection");
            render_doc_list_view(
                pane_idx,
                name,
                "Smart collection filtered dynamically by rules.",
                store.docs_for_collection(&col_id),
                scroll_y,
                palette,
                cx,
            )
            .into_any_element()
        }
        DesktopRoute::Tag(tag) => render_doc_list_view(
            pane_idx,
            &format!("#{tag}"),
            "Documents carrying this workspace tag.",
            store.docs_for_tag(&tag),
            scroll_y,
            palette,
            cx,
        )
        .into_any_element(),
        DesktopRoute::Trash => {
            render_trash_view(pane_idx, store, scroll_y, palette, cx).into_any_element()
        }
    }
}
