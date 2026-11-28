//! Hierarchical folder & document tree renderer for `AppSidebar`.

use ui::{
    Context, InteractiveElement, ParentElement, StatefulInteractiveElement, Styled, div, px, svg,
};

use crate::{
    CHEVRON_DOWN_SVG, CHEVRON_RIGHT_SVG, DOC_ICON_SVG, DesktopPalette, FOLDER_ICON_SVG,
    doc_store::DesktopDocStore,
    sidebar::{SidebarState, clip_label},
    split_view::DesktopRoute,
    workbench::DesktopShellView,
};

#[allow(clippy::too_many_arguments)]
pub(crate) fn append_folder_rows(
    mut col: ui::Div,
    sidebar: &SidebarState,
    store: &DesktopDocStore,
    active_route: &DesktopRoute,
    folder_id: &str,
    depth: usize,
    palette: DesktopPalette,
    cx: &mut Context<DesktopShellView>,
) -> ui::Div {
    let Some(folder) = store
        .folder_rows
        .iter()
        .find(|r| r.folder_type == "folder" && r.id == folder_id)
    else {
        return col;
    };
    let expanded = sidebar.expanded_folders.contains(folder_id);
    let fid = folder.id.clone();
    let fid_nav = folder.id.clone();
    let indent = (depth as f32) * 14.0;
    let active = matches!(active_route, DesktopRoute::Folder(id) if id == folder_id);

    col = col.child(
        div()
            .id(ui::SharedString::from(format!(
                "desktop.sidebar.folder.{folder_id}"
            )))
            .snapshot(
                ui::SharedString::from(format!("desktop.sidebar.folder.{folder_id}")),
                Some("desktop.sidebar"),
            )
            .flex()
            .flex_row()
            .items_center()
            .w_full()
            .h(px(28.0))
            .pl(px(8.0 + indent))
            .pr(px(8.0))
            .gap(px(6.0))
            .rounded(px(6.0))
            .bg(if active {
                palette.bg_active
            } else {
                ui::hsla(0.0, 0.0, 0.0, 0.0)
            })
            .on_click(cx.listener(move |this, _, _, cx| {
                this.state.sidebar.toggle_folder(&fid);
                this.state
                    .navigate_active_pane(DesktopRoute::Folder(fid_nav.clone()));
                cx.notify();
            }))
            .child(
                svg()
                    .data(if expanded {
                        CHEVRON_DOWN_SVG
                    } else {
                        CHEVRON_RIGHT_SVG
                    })
                    .w(px(11.0))
                    .h(px(11.0))
                    .text_color(palette.text_muted),
            )
            .child(
                svg()
                    .data(FOLDER_ICON_SVG)
                    .w(px(14.0))
                    .h(px(14.0))
                    .text_color(palette.text_secondary),
            )
            .child(
                div()
                    .text_size(px(12.5))
                    .text_color(palette.text_primary)
                    .child(folder.data.clone()),
            ),
    );

    if expanded && depth < 3 {
        let child_folders: Vec<String> = store
            .folder_rows
            .iter()
            .filter(|r| r.folder_type == "folder" && r.parent_id.as_deref() == Some(folder_id))
            .map(|r| r.id.clone())
            .collect();
        for child_id in child_folders {
            col = append_folder_rows(
                col,
                sidebar,
                store,
                active_route,
                &child_id,
                depth + 1,
                palette,
                cx,
            );
        }
        for doc in store.docs_in_folder(folder_id) {
            let doc_id = doc.id.clone();
            let doc_active = matches!(active_route, DesktopRoute::Doc(id) if id == &doc_id);
            let doc_label = clip_label(&doc.title, 22usize.saturating_sub(depth * 2));
            col = col.child(
                div()
                    .id(ui::SharedString::from(format!(
                        "desktop.sidebar.fdoc.{folder_id}.{doc_id}"
                    )))
                    .flex()
                    .flex_row()
                    .items_center()
                    .w_full()
                    .h(px(26.0))
                    .pl(px(26.0 + indent))
                    .pr(px(8.0))
                    .gap(px(6.0))
                    .rounded(px(6.0))
                    .overflow_hidden()
                    .bg(if doc_active {
                        palette.bg_active
                    } else {
                        ui::hsla(0.0, 0.0, 0.0, 0.0)
                    })
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.state.open_doc_in_active_pane(&doc_id);
                        cx.notify();
                    }))
                    .child(
                        svg()
                            .data(DOC_ICON_SVG)
                            .w(px(13.0))
                            .h(px(13.0))
                            .flex_shrink(0.0)
                            .text_color(if doc_active {
                                palette.accent
                            } else {
                                palette.text_muted
                            }),
                    )
                    .child(
                        div()
                            .text_size(px(12.5))
                            .text_color(if doc_active {
                                palette.accent
                            } else {
                                palette.text_secondary
                            })
                            .child(doc_label),
                    ),
            );
        }
    }
    col
}
