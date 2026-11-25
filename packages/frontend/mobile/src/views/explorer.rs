//! Mobile `Explorer` (`All Docs`) tab with true pre-order DFS folder hierarchy and
//! drill-down sub-views for `Folder`, `Collection`, `Tag`, and `Trash`.

use affine_client::{DirectKind, FolderForestState, NavTarget, Origin};
use ui::{
    Context, Direction, InteractiveElement, IntoElement, ParentElement, StatefulInteractiveElement,
    Styled, div, px, svg,
};
use ui_kit::LogicalStyled;

use crate::{a11y::derive_explorer_doc_origin, state::MobileAppState, strings::MobileStrings};

use super::{
    A11yBoundsMap, CHEVRON_LEFT_SVG, EXPLORER_ICON_SVG, MobileFlexExt, MobilePalette,
    MobileShellView, a11y_bounds_probe,
};

#[derive(Clone, Copy)]
struct ExplorerEnv<'a> {
    palette: MobilePalette,
    dir: Direction,
    strings: &'static MobileStrings,
    a11y_bounds: &'a A11yBoundsMap,
}

fn row_dir(dir: Direction) -> ui::Div {
    let d = div().flex().flex_row().items_center();
    if dir.is_rtl() {
        d.dir_rtl()
    } else {
        d.dir_ltr()
    }
}

pub(super) fn render_explorer(
    state: &mut MobileAppState,
    viewport_h: f32,
    palette: MobilePalette,
    dir: Direction,
    strings: &'static MobileStrings,
    a11y_bounds: &A11yBoundsMap,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let env = ExplorerEnv {
        palette,
        dir,
        strings,
        a11y_bounds,
    };
    let cur_target = state
        .history
        .current()
        .map(|e| e.target.clone())
        .unwrap_or(NavTarget::AllDocs);

    match cur_target {
        NavTarget::Folder(folder_id) => {
            render_folder_drilldown(state, &folder_id, env, cx).into_any_element()
        }
        NavTarget::Collection(col_id) if col_id.is_empty() => {
            render_collections_index(state, env, cx).into_any_element()
        }
        NavTarget::Collection(col_id) => {
            render_collection_drilldown(state, &col_id, env, cx).into_any_element()
        }
        NavTarget::Tag(tag_id) if tag_id.is_empty() => {
            render_tags_index(state, env, cx).into_any_element()
        }
        NavTarget::Tag(tag_id) => render_tag_drilldown(state, &tag_id, env, cx).into_any_element(),
        NavTarget::Trash => render_trash_drilldown(state, env, cx).into_any_element(),
        _ => render_all_docs_root(state, viewport_h, env, cx).into_any_element(),
    }
}

fn render_all_docs_root(
    state: &mut MobileAppState,
    viewport_h: f32,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let (palette, dir, strings) = (env.palette, env.dir, env.strings);
    let compact = viewport_h < 460.0;
    let forest_state = state.forest_state();
    let folder_items: Vec<(String, String, usize)> = match forest_state {
        FolderForestState::Ready(forest) => forest
            .dfs_folders()
            .into_iter()
            .map(|(f, depth)| (f.id.clone(), f.data.clone(), depth))
            .collect(),
        FolderForestState::Unresolved => Vec::new(),
    };
    let trash_count = state.docs.iter().filter(|d| d.trashed).count();

    let header = row_dir(dir)
        .id("mobile.explorer.header")
        .snapshot("mobile.explorer.header", Some("mobile.shell.root"))
        .w_full()
        .h(px(56.0))
        .flex_shrink(0.0)
        .bg(palette.bg_surface)
        .border_b_1()
        .border_color(palette.border)
        .ps(px(16.0), dir)
        .pe(px(16.0), dir)
        .child(
            div()
                .w_full()
                .text_size(px(18.0))
                .text_color(palette.text_primary)
                .align_start_for(dir)
                .child(strings.tab_explorer),
        );

    let mut folder_card = div()
        .w_full()
        .rounded(px(12.0))
        .bg(palette.bg_surface)
        .border_1()
        .border_color(palette.border)
        .flex()
        .flex_col()
        .overflow_hidden();

    for (idx, (id, name, depth)) in folder_items.into_iter().enumerate() {
        let indent = 14.0 + (depth.min(6) as f32) * 16.0;
        let folder_id = id.clone();
        let row_id = format!("mobile.explorer.folder.{id}");
        let mut row = row_dir(dir)
            .id(row_id.clone())
            .snapshot(row_id.clone(), Some("mobile.shell.root"))
            .relative()
            .w_full()
            .h(px(46.0))
            .gap(px(10.0))
            .ps(px(indent), dir)
            .pe(px(14.0), dir)
            .overflow_hidden()
            .on_click(cx.listener(move |this, _, _, cx| {
                this.state.navigate_target(
                    NavTarget::Folder(folder_id.clone()),
                    Origin::Direct(DirectKind::AllDocs),
                );
                cx.notify();
            }))
            .child(a11y_bounds_probe(row_id, env.a11y_bounds.clone()))
            .child(
                svg()
                    .data(EXPLORER_ICON_SVG)
                    .mirror_in_rtl(true)
                    .w(px(16.0))
                    .h(px(16.0))
                    .text_color(palette.accent),
            )
            .child(
                div()
                    .flex_1()
                    .min_w(px(0.0))
                    .text_size(px(14.0))
                    .text_color(palette.text_primary)
                    .align_start_for(dir)
                    .child(name),
            );
        if idx > 0 {
            row = row.border_t(px(1.0)).border_color(palette.border);
        }
        folder_card = folder_card.child(row);
    }

    let org_card = div()
        .w_full()
        .rounded(px(12.0))
        .bg(palette.bg_surface)
        .border_1()
        .border_color(palette.border)
        .flex()
        .flex_col()
        .overflow_hidden()
        .child(explorer_meta_row(
            "mobile.explorer.collections",
            strings.collections,
            state.collections.len(),
            NavTarget::Collection(String::new()),
            env,
            false,
            cx,
        ))
        .child(explorer_meta_row(
            "mobile.explorer.tags",
            strings.tags,
            state.tags.len(),
            NavTarget::Tag(String::new()),
            env,
            true,
            cx,
        ))
        .child(explorer_meta_row(
            "mobile.explorer.trash",
            strings.trash,
            trash_count,
            NavTarget::Trash,
            env,
            true,
            cx,
        ));

    let content = if compact {
        row_dir(dir)
            .flex_1()
            .min_h(px(0.0))
            .p(px(12.0))
            .gap(px(12.0))
            .items_start()
            .overflow_hidden()
            .child(div().flex_1().min_w(px(0.0)).child(folder_card))
            .child(div().flex_1().min_w(px(0.0)).child(org_card))
    } else {
        div()
            .flex_1()
            .min_h(px(0.0))
            .p(px(16.0))
            .flex()
            .flex_col()
            .gap(px(12.0))
            .overflow_hidden()
            .child(
                div()
                    .w_full()
                    .text_size(px(12.0))
                    .text_color(palette.text_secondary)
                    .align_start_for(dir)
                    .child(strings.folders),
            )
            .child(folder_card)
            .child(org_card)
    };

    div()
        .size_full()
        .flex()
        .flex_col()
        .overflow_hidden()
        .child(header)
        .child(content)
}

fn drilldown_header(
    title: String,
    parent_target: NavTarget,
    back_label: String,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let (palette, dir) = (env.palette, env.dir);
    row_dir(dir)
        .id("mobile.explorer.header")
        .snapshot("mobile.explorer.header", Some("mobile.shell.root"))
        .w_full()
        .h(px(56.0))
        .flex_shrink(0.0)
        .bg(palette.bg_surface)
        .border_b_1()
        .border_color(palette.border)
        .ps(px(8.0), dir)
        .pe(px(16.0), dir)
        .gap(px(8.0))
        .child(
            row_dir(dir)
                .id("mobile.explorer.back_btn")
                .snapshot("mobile.explorer.back_btn", Some("mobile.shell.root"))
                .relative()
                .h(px(44.0))
                .min_w(px(64.0))
                .gap(px(4.0))
                .ps(px(4.0), dir)
                .pe(px(8.0), dir)
                .on_click(cx.listener(move |this, _, _, cx| {
                    let t = this.now_ms(cx);
                    this.state
                        .navigate_back_or_replace(parent_target.clone(), t);
                    cx.notify();
                }))
                .child(a11y_bounds_probe(
                    "mobile.explorer.back_btn",
                    env.a11y_bounds.clone(),
                ))
                .child(
                    svg()
                        .data(CHEVRON_LEFT_SVG)
                        .mirror_in_rtl(true)
                        .w(px(15.0))
                        .h(px(15.0))
                        .text_color(palette.accent),
                )
                .child(
                    div()
                        .text_size(px(14.0))
                        .text_color(palette.accent)
                        .child(back_label),
                ),
        )
        .child(
            div()
                .flex_1()
                .min_w(px(0.0))
                .text_size(px(16.0))
                .text_color(palette.text_primary)
                .align_start_for(dir)
                .child(title),
        )
}

fn render_folder_drilldown(
    state: &mut MobileAppState,
    folder_id: &str,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let (palette, dir, strings) = (env.palette, env.dir, env.strings);
    let forest_state = state.forest_state();
    let (title, parent_target, back_label, child_folders, doc_entries) = match forest_state {
        FolderForestState::Ready(forest) => {
            let chain = forest.folder_chain(folder_id).unwrap_or(&[]);
            let title = chain
                .last()
                .map(|s| s.name.clone())
                .unwrap_or_else(|| folder_id.to_string());
            let (parent_target, back_label) = if chain.len() >= 2 {
                let parent = &chain[chain.len() - 2];
                (
                    NavTarget::Folder(parent.folder_id.clone()),
                    parent.name.clone(),
                )
            } else {
                (NavTarget::AllDocs, strings.tab_explorer.to_string())
            };
            let subs: Vec<(String, String)> = forest
                .child_folders(Some(folder_id))
                .into_iter()
                .map(|f| (f.id.clone(), f.data.clone()))
                .collect();
            let docs: Vec<(String, String, String)> = forest
                .doc_links_in_folder(folder_id)
                .into_iter()
                .filter_map(|p| {
                    let doc = state.doc_by_id(&p.doc_id)?;
                    (!doc.trashed).then(|| (p.link_id.clone(), doc.id.clone(), doc.title.clone()))
                })
                .collect();
            (title, parent_target, back_label, subs, docs)
        }
        FolderForestState::Unresolved => (
            folder_id.to_string(),
            NavTarget::AllDocs,
            strings.tab_explorer.to_string(),
            Vec::new(),
            Vec::new(),
        ),
    };

    let mut list = div()
        .w_full()
        .rounded(px(12.0))
        .bg(palette.bg_surface)
        .border_1()
        .border_color(palette.border)
        .flex()
        .flex_col()
        .overflow_hidden();

    let mut row_idx = 0usize;
    for (sub_id, sub_name) in child_folders {
        let nav_id = sub_id.clone();
        let row_id = format!("mobile.explorer.folder.{sub_id}");
        let mut row = row_dir(dir)
            .id(row_id.clone())
            .snapshot(row_id.clone(), Some("mobile.shell.root"))
            .relative()
            .w_full()
            .h(px(46.0))
            .gap(px(10.0))
            .ps(px(14.0), dir)
            .pe(px(14.0), dir)
            .on_click(cx.listener(move |this, _, _, cx| {
                this.state.navigate_target(
                    NavTarget::Folder(nav_id.clone()),
                    Origin::Direct(DirectKind::AllDocs),
                );
                cx.notify();
            }))
            .child(a11y_bounds_probe(row_id, env.a11y_bounds.clone()))
            .child(
                svg()
                    .data(EXPLORER_ICON_SVG)
                    .mirror_in_rtl(true)
                    .w(px(16.0))
                    .h(px(16.0))
                    .text_color(palette.accent),
            )
            .child(
                div()
                    .flex_1()
                    .min_w(px(0.0))
                    .text_size(px(14.0))
                    .text_color(palette.text_primary)
                    .align_start_for(dir)
                    .child(sub_name),
            );
        if row_idx > 0 {
            row = row.border_t(px(1.0)).border_color(palette.border);
        }
        list = list.child(row);
        row_idx += 1;
    }

    for (_link_id, doc_id, doc_title) in doc_entries {
        let row_id = format!("mobile.explorer.doc.{doc_id}");
        let mut row = row_dir(dir)
            .id(row_id.clone())
            .snapshot(row_id.clone(), Some("mobile.shell.root"))
            .relative()
            .w_full()
            .h(px(46.0))
            .ps(px(14.0), dir)
            .pe(px(14.0), dir)
            .on_click(cx.listener(move |this, _, _, cx| {
                let origin = derive_explorer_doc_origin(&mut this.state, &doc_id);
                this.state.open_doc(&doc_id, origin);
                cx.notify();
            }))
            .child(a11y_bounds_probe(row_id, env.a11y_bounds.clone()))
            .child(
                div()
                    .flex_1()
                    .min_w(px(0.0))
                    .text_size(px(14.0))
                    .text_color(palette.text_primary)
                    .align_start_for(dir)
                    .child(doc_title),
            );
        if row_idx > 0 {
            row = row.border_t(px(1.0)).border_color(palette.border);
        }
        list = list.child(row);
        row_idx += 1;
    }

    div()
        .size_full()
        .flex()
        .flex_col()
        .overflow_hidden()
        .child(drilldown_header(title, parent_target, back_label, env, cx))
        .child(div().flex_1().min_h(px(0.0)).p(px(16.0)).child(list))
}

fn render_collections_index(
    state: &MobileAppState,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let items: Vec<(String, String, usize, NavTarget)> = state
        .collections
        .iter()
        .map(|col| {
            let count = state
                .docs
                .iter()
                .filter(|d| !d.trashed && col.doc_ids.iter().any(|id| id == &d.id))
                .count();
            (
                format!("mobile.explorer.collection.{}", col.id),
                col.name.clone(),
                count,
                NavTarget::Collection(col.id.clone()),
            )
        })
        .collect();
    render_index_list(
        env.strings.collections.to_string(),
        env.strings.tab_explorer.to_string(),
        items,
        env,
        cx,
    )
}

fn render_tags_index(
    state: &MobileAppState,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let items: Vec<(String, String, usize, NavTarget)> = state
        .tags
        .iter()
        .map(|(tag_id, tag_name)| {
            let count = state
                .docs
                .iter()
                .filter(|d| !d.trashed && d.tags.iter().any(|t| t == tag_id))
                .count();
            (
                format!("mobile.explorer.tag.{tag_id}"),
                format!("#{tag_name}"),
                count,
                NavTarget::Tag(tag_id.clone()),
            )
        })
        .collect();
    render_index_list(
        env.strings.tags.to_string(),
        env.strings.tab_explorer.to_string(),
        items,
        env,
        cx,
    )
}

fn render_index_list(
    title: String,
    back_label: String,
    items: Vec<(String, String, usize, NavTarget)>,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let (palette, dir) = (env.palette, env.dir);
    let mut list = div()
        .w_full()
        .rounded(px(12.0))
        .bg(palette.bg_surface)
        .border_1()
        .border_color(palette.border)
        .flex()
        .flex_col()
        .overflow_hidden();
    for (idx, (row_id, label, count, target)) in items.into_iter().enumerate() {
        let mut row = row_dir(dir)
            .id(row_id.clone())
            .snapshot(row_id.clone(), Some("mobile.shell.root"))
            .relative()
            .w_full()
            .h(px(46.0))
            .justify_between()
            .ps(px(14.0), dir)
            .pe(px(14.0), dir)
            .on_click(cx.listener(move |this, _, _, cx| {
                this.state
                    .navigate_target(target.clone(), Origin::Direct(DirectKind::AllDocs));
                cx.notify();
            }))
            .child(a11y_bounds_probe(row_id, env.a11y_bounds.clone()))
            .child(
                div()
                    .text_size(px(14.0))
                    .text_color(palette.text_primary)
                    .child(label),
            )
            .child(
                div()
                    .px(px(8.0))
                    .py(px(2.0))
                    .rounded(px(8.0))
                    .bg(palette.bg_pill)
                    .text_size(px(12.0))
                    .text_color(palette.text_secondary)
                    .child(count.to_string()),
            );
        if idx > 0 {
            row = row.border_t(px(1.0)).border_color(palette.border);
        }
        list = list.child(row);
    }
    div()
        .size_full()
        .flex()
        .flex_col()
        .overflow_hidden()
        .child(drilldown_header(
            title,
            NavTarget::AllDocs,
            back_label,
            env,
            cx,
        ))
        .child(div().flex_1().min_h(px(0.0)).p(px(16.0)).child(list))
}

fn render_collection_drilldown(
    state: &MobileAppState,
    col_id: &str,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let col = state.collections.iter().find(|c| c.id == col_id);
    let title = col
        .map(|c| c.name.clone())
        .unwrap_or_else(|| env.strings.collections.to_string());
    let docs: Vec<(String, String)> = match col {
        Some(c) => state
            .docs
            .iter()
            .filter(|d| !d.trashed && c.doc_ids.iter().any(|id| id == &d.id))
            .map(|d| (d.id.clone(), d.title.clone()))
            .collect(),
        None => Vec::new(),
    };
    render_doc_list_drilldown(
        title,
        NavTarget::Collection(String::new()),
        env.strings.collections.to_string(),
        docs,
        env,
        cx,
    )
}

fn render_tag_drilldown(
    state: &MobileAppState,
    tag_id: &str,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let title = state
        .tags
        .iter()
        .find(|(id, _)| id == tag_id)
        .map(|(_, name)| format!("#{name}"))
        .unwrap_or_else(|| format!("#{tag_id}"));
    let docs: Vec<(String, String)> = state
        .docs
        .iter()
        .filter(|d| !d.trashed && d.tags.iter().any(|t| t == tag_id))
        .map(|d| (d.id.clone(), d.title.clone()))
        .collect();
    render_doc_list_drilldown(
        title,
        NavTarget::Tag(String::new()),
        env.strings.tags.to_string(),
        docs,
        env,
        cx,
    )
}

fn render_trash_drilldown(
    state: &MobileAppState,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let docs: Vec<(String, String)> = state
        .docs
        .iter()
        .filter(|d| d.trashed)
        .map(|d| (d.id.clone(), d.title.clone()))
        .collect();
    render_doc_list_drilldown(
        env.strings.trash.to_string(),
        NavTarget::AllDocs,
        env.strings.tab_explorer.to_string(),
        docs,
        env,
        cx,
    )
}

fn render_doc_list_drilldown(
    title: String,
    parent_target: NavTarget,
    back_label: String,
    docs: Vec<(String, String)>,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let (palette, dir) = (env.palette, env.dir);
    let mut list = div()
        .w_full()
        .rounded(px(12.0))
        .bg(palette.bg_surface)
        .border_1()
        .border_color(palette.border)
        .flex()
        .flex_col()
        .overflow_hidden();

    for (idx, (doc_id, doc_title)) in docs.into_iter().enumerate() {
        let row_id = format!("mobile.explorer.doc.{doc_id}");
        let mut row = row_dir(dir)
            .id(row_id.clone())
            .snapshot(row_id.clone(), Some("mobile.shell.root"))
            .relative()
            .w_full()
            .h(px(46.0))
            .ps(px(14.0), dir)
            .pe(px(14.0), dir)
            .on_click(cx.listener(move |this, _, _, cx| {
                let origin = derive_explorer_doc_origin(&mut this.state, &doc_id);
                this.state.open_doc(&doc_id, origin);
                cx.notify();
            }))
            .child(a11y_bounds_probe(row_id, env.a11y_bounds.clone()))
            .child(
                div()
                    .flex_1()
                    .min_w(px(0.0))
                    .text_size(px(14.0))
                    .text_color(palette.text_primary)
                    .align_start_for(dir)
                    .child(doc_title),
            );
        if idx > 0 {
            row = row.border_t(px(1.0)).border_color(palette.border);
        }
        list = list.child(row);
    }

    div()
        .size_full()
        .flex()
        .flex_col()
        .overflow_hidden()
        .child(drilldown_header(title, parent_target, back_label, env, cx))
        .child(div().flex_1().min_h(px(0.0)).p(px(16.0)).child(list))
}

#[allow(clippy::too_many_arguments)]
fn explorer_meta_row(
    id: &'static str,
    label: &'static str,
    count: usize,
    target: NavTarget,
    env: ExplorerEnv<'_>,
    top_border: bool,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let (palette, dir) = (env.palette, env.dir);
    let mut row = row_dir(dir)
        .id(id)
        .snapshot(id, Some("mobile.shell.root"))
        .relative()
        .w_full()
        .h(px(46.0))
        .justify_between()
        .ps(px(14.0), dir)
        .pe(px(14.0), dir)
        .on_click(cx.listener(move |this, _, _, cx| {
            this.state
                .navigate_target(target.clone(), Origin::Direct(DirectKind::AllDocs));
            cx.notify();
        }))
        .child(a11y_bounds_probe(id, env.a11y_bounds.clone()))
        .child(
            div()
                .text_size(px(14.0))
                .text_color(palette.text_primary)
                .child(label),
        )
        .child(
            div()
                .px(px(8.0))
                .py(px(2.0))
                .rounded(px(8.0))
                .bg(palette.bg_pill)
                .text_size(px(12.0))
                .text_color(palette.text_secondary)
                .child(count.to_string()),
        );
    if top_border {
        row = row.border_t(px(1.0)).border_color(palette.border);
    }
    row
}
