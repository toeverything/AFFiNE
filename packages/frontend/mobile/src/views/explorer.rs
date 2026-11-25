//! Mobile `Explorer` (`All Docs`) tab with true pre-order DFS folder hierarchy and
//! drill-down sub-views for `Folder`, `Collection`, `Tag`, and `Trash`.

use affine_client::{DirectKind, FolderForestState, NavTarget, Origin};
use ui::{
    Context, Direction, InteractiveElement, IntoElement, ParentElement, StatefulInteractiveElement,
    Styled, div, px, svg,
};
use ui_kit::LogicalStyled;

use crate::{state::MobileAppState, strings::MobileStrings};

use super::{
    A11yBoundsMap, EXPLORER_ICON_SVG, MobileFlexExt, MobilePalette, MobileShellView,
    a11y_bounds_probe,
    explorer_rows::{
        ExplorerEnv, drilldown_header, explorer_compact_meta_cell, explorer_doc_row,
        explorer_meta_row, explorer_scroll_viewport, new_doc_button, render_collection_drilldown,
        render_tag_drilldown, render_trash_drilldown, row_dir,
    },
};

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
            render_folder_drilldown(state, &folder_id, viewport_h, env, cx).into_any_element()
        }
        NavTarget::Collection(col_id) if col_id.is_empty() => {
            render_collections_index(state, viewport_h, env, cx).into_any_element()
        }
        NavTarget::Collection(col_id) => {
            render_collection_drilldown(state, &col_id, viewport_h, env, cx).into_any_element()
        }
        NavTarget::Tag(tag_id) if tag_id.is_empty() => {
            render_tags_index(state, viewport_h, env, cx).into_any_element()
        }
        NavTarget::Tag(tag_id) => {
            render_tag_drilldown(state, &tag_id, viewport_h, env, cx).into_any_element()
        }
        NavTarget::Trash => render_trash_drilldown(state, viewport_h, env, cx).into_any_element(),
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
    let locale = state.locale();
    let ws_id = state.active_workspace_id().to_string();
    let compact = viewport_h < 460.0;
    let tight_portrait = !compact && viewport_h < 620.0;
    let row_h = if compact || tight_portrait {
        44.0
    } else {
        46.0
    };
    let avail_h = (viewport_h - 56.0 - 64.0).max(44.0);
    let pad = if compact || tight_portrait {
        10.0
    } else {
        16.0
    };
    let gap = if tight_portrait { 8.0 } else { 12.0 };
    let heading_h = 16.0;

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
    let active_docs: Vec<(String, String)> = state
        .docs
        .iter()
        .filter(|d| !d.trashed)
        .map(|d| (d.id.clone(), d.display_title(locale)))
        .collect();

    let folder_h = (folder_items.len() as f32) * row_h + 2.0;
    let org_h = if tight_portrait {
        44.0 + 2.0
    } else {
        3.0 * row_h + 2.0
    };
    let docs_h = if active_docs.is_empty() {
        0.0
    } else {
        (active_docs.len() as f32) * row_h + 2.0
    };
    let docs_top = if compact {
        pad + 1.0
    } else {
        pad + heading_h + gap + folder_h + gap + org_h + gap + heading_h + gap + 1.0
    };
    let content_h = if compact {
        pad * 2.0 + folder_h.max(org_h).max(docs_h)
    } else if active_docs.is_empty() {
        pad * 2.0 + heading_h + gap + folder_h + gap + org_h
    } else {
        pad * 2.0 + heading_h + gap + folder_h + gap + org_h + gap + heading_h + gap + docs_h
    };
    let max_scroll = (content_h - avail_h).max(0.0);
    state.explorer_scroll_y = state.explorer_scroll_y.clamp(0.0, max_scroll);
    let scroll_y = state.explorer_scroll_y;
    let is_visible = |top_in_content: f32, h: f32| -> bool {
        let vis_top = top_in_content - scroll_y;
        vis_top >= -1.0 && vis_top + h <= avail_h + 1.0
    };

    let header = row_dir(dir)
        .id("mobile.explorer.header")
        .snapshot("mobile.explorer.header", Some("mobile.shell.root"))
        .w_full()
        .h(px(56.0))
        .flex_shrink(0.0)
        .justify_between()
        .bg(palette.bg_surface)
        .border_b_1()
        .border_color(palette.border)
        .ps(px(16.0), dir)
        .pe(px(12.0), dir)
        .child(
            div()
                .flex_1()
                .min_w(px(0.0))
                .text_size(px(18.0))
                .text_color(palette.text_primary)
                .align_start_for(dir)
                .child(strings.tab_explorer),
        )
        .child(new_doc_button(None, env, cx));

    let folder_top = if compact {
        pad + 1.0
    } else {
        pad + heading_h + gap + 1.0
    };
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
        let row_vis = is_visible(folder_top + (idx as f32) * row_h, row_h);
        let mut row = row_dir(dir)
            .id(row_id.clone())
            .relative()
            .w_full()
            .h(px(row_h))
            .flex_shrink(0.0)
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
        if row_vis {
            row = row
                .snapshot(row_id.clone(), Some("mobile.shell.root"))
                .child(a11y_bounds_probe(row_id, env.a11y_bounds.clone()));
        }
        if idx > 0 {
            row = row.border_t(px(1.0)).border_color(palette.border);
        }
        folder_card = folder_card.child(row);
    }

    let org_top = if compact {
        pad + 1.0
    } else {
        pad + heading_h + gap + folder_h + gap + 1.0
    };
    let org_card = if tight_portrait {
        row_dir(dir)
            .w_full()
            .rounded(px(12.0))
            .bg(palette.bg_surface)
            .border_1()
            .border_color(palette.border)
            .overflow_hidden()
            .child(explorer_compact_meta_cell(
                "mobile.explorer.collections",
                strings.collections,
                state.collections.len(),
                NavTarget::Collection(String::new()),
                env,
                false,
                cx,
            ))
            .child(explorer_compact_meta_cell(
                "mobile.explorer.tags",
                strings.tags,
                state.tags.len(),
                NavTarget::Tag(String::new()),
                env,
                true,
                cx,
            ))
            .child(explorer_compact_meta_cell(
                "mobile.explorer.trash",
                strings.trash,
                trash_count,
                NavTarget::Trash,
                env,
                true,
                cx,
            ))
            .into_any_element()
    } else {
        div()
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
                row_h,
                is_visible(org_top, row_h),
                env,
                false,
                cx,
            ))
            .child(explorer_meta_row(
                "mobile.explorer.tags",
                strings.tags,
                state.tags.len(),
                NavTarget::Tag(String::new()),
                row_h,
                is_visible(org_top + row_h, row_h),
                env,
                true,
                cx,
            ))
            .child(explorer_meta_row(
                "mobile.explorer.trash",
                strings.trash,
                trash_count,
                NavTarget::Trash,
                row_h,
                is_visible(org_top + row_h * 2.0, row_h),
                env,
                true,
                cx,
            ))
            .into_any_element()
    };

    let docs_card_opt = if active_docs.is_empty() {
        None
    } else {
        let mut docs_card = div()
            .w_full()
            .rounded(px(12.0))
            .bg(palette.bg_surface)
            .border_1()
            .border_color(palette.border)
            .flex()
            .flex_col()
            .overflow_hidden();
        for (idx, (doc_id, doc_title)) in active_docs.into_iter().enumerate() {
            let row_vis = is_visible(docs_top + (idx as f32) * row_h, row_h);
            docs_card = docs_card.child(explorer_doc_row(
                &ws_id,
                doc_id,
                doc_title,
                row_h,
                idx > 0,
                row_vis,
                env,
                cx,
            ));
        }
        Some(docs_card)
    };

    let inner: ui::AnyElement = if compact {
        let mut row = row_dir(dir)
            .w_full()
            .p(px(pad))
            .gap(px(10.0))
            .items_start()
            .child(div().flex_1().min_w(px(0.0)).child(folder_card))
            .child(div().flex_1().min_w(px(0.0)).child(org_card));
        if let Some(docs_card) = docs_card_opt {
            row = row.child(div().flex_1().min_w(px(0.0)).child(docs_card));
        }
        row.into_any_element()
    } else {
        let mut col = div()
            .w_full()
            .p(px(pad))
            .flex()
            .flex_col()
            .gap(px(gap))
            .child(
                div()
                    .w_full()
                    .h(px(heading_h))
                    .text_size(px(12.0))
                    .text_color(palette.text_secondary)
                    .align_start_for(dir)
                    .child(strings.folders),
            )
            .child(folder_card)
            .child(org_card);
        if let Some(docs_card) = docs_card_opt {
            col = col
                .child(
                    div()
                        .w_full()
                        .h(px(heading_h))
                        .text_size(px(12.0))
                        .text_color(palette.text_secondary)
                        .align_start_for(dir)
                        .child(strings.documents_heading),
                )
                .child(docs_card);
        }
        col.into_any_element()
    };

    div()
        .size_full()
        .flex()
        .flex_col()
        .overflow_hidden()
        .child(header)
        .child(explorer_scroll_viewport(scroll_y, max_scroll, inner, cx))
}

fn render_folder_drilldown(
    state: &mut MobileAppState,
    folder_id: &str,
    viewport_h: f32,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let (palette, dir, strings) = (env.palette, env.dir, env.strings);
    let locale = state.locale();
    let ws_id = state.active_workspace_id().to_string();
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
                    (!doc.trashed)
                        .then(|| (p.link_id.clone(), doc.id.clone(), doc.display_title(locale)))
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

    let avail_h = (viewport_h - 56.0 - 64.0).max(44.0);
    let total_rows = child_folders.len() + doc_entries.len();
    let content_h = 32.0 + (total_rows as f32) * 46.0 + 2.0;
    let max_scroll = (content_h - avail_h).max(0.0);
    state.explorer_scroll_y = state.explorer_scroll_y.clamp(0.0, max_scroll);
    let scroll_y = state.explorer_scroll_y;

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
        let top = 17.0 + (row_idx as f32) * 46.0 - scroll_y;
        let row_vis = top >= -1.0 && top + 46.0 <= avail_h + 1.0;
        let mut row = row_dir(dir)
            .id(row_id.clone())
            .relative()
            .w_full()
            .h(px(46.0))
            .flex_shrink(0.0)
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
        if row_vis {
            row = row
                .snapshot(row_id.clone(), Some("mobile.shell.root"))
                .child(a11y_bounds_probe(row_id, env.a11y_bounds.clone()));
        }
        if row_idx > 0 {
            row = row.border_t(px(1.0)).border_color(palette.border);
        }
        list = list.child(row);
        row_idx += 1;
    }

    for (_link_id, doc_id, doc_title) in doc_entries {
        let top = 17.0 + (row_idx as f32) * 46.0 - scroll_y;
        let row_vis = top >= -1.0 && top + 46.0 <= avail_h + 1.0;
        list = list.child(explorer_doc_row(
            &ws_id,
            doc_id,
            doc_title,
            46.0,
            row_idx > 0,
            row_vis,
            env,
            cx,
        ));
        row_idx += 1;
    }

    let inner = div().w_full().p(px(16.0)).child(list).into_any_element();
    div()
        .size_full()
        .flex()
        .flex_col()
        .overflow_hidden()
        .child(drilldown_header(
            title,
            parent_target,
            back_label,
            Some(folder_id.to_string()),
            env,
            cx,
        ))
        .child(explorer_scroll_viewport(scroll_y, max_scroll, inner, cx))
}

fn render_collections_index(
    state: &mut MobileAppState,
    viewport_h: f32,
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
        state,
        env.strings.collections.to_string(),
        env.strings.tab_explorer.to_string(),
        items,
        viewport_h,
        env,
        cx,
    )
}

fn render_tags_index(
    state: &mut MobileAppState,
    viewport_h: f32,
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
        state,
        env.strings.tags.to_string(),
        env.strings.tab_explorer.to_string(),
        items,
        viewport_h,
        env,
        cx,
    )
}

#[allow(clippy::too_many_arguments)]
fn render_index_list(
    state: &mut MobileAppState,
    title: String,
    back_label: String,
    items: Vec<(String, String, usize, NavTarget)>,
    viewport_h: f32,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let (palette, dir) = (env.palette, env.dir);
    let avail_h = (viewport_h - 56.0 - 64.0).max(44.0);
    let content_h = 32.0 + (items.len() as f32) * 46.0 + 2.0;
    let max_scroll = (content_h - avail_h).max(0.0);
    state.explorer_scroll_y = state.explorer_scroll_y.clamp(0.0, max_scroll);
    let scroll_y = state.explorer_scroll_y;

    let inner: ui::AnyElement = if items.is_empty() {
        div().w_full().p(px(16.0)).into_any_element()
    } else {
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
            let top = 17.0 + (idx as f32) * 46.0 - scroll_y;
            let row_vis = top >= -1.0 && top + 46.0 <= avail_h + 1.0;
            let mut row = row_dir(dir)
                .id(row_id.clone())
                .relative()
                .w_full()
                .h(px(46.0))
                .flex_shrink(0.0)
                .justify_between()
                .ps(px(14.0), dir)
                .pe(px(14.0), dir)
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state
                        .navigate_target(target.clone(), Origin::Direct(DirectKind::AllDocs));
                    cx.notify();
                }))
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
            if row_vis {
                row = row
                    .snapshot(row_id.clone(), Some("mobile.shell.root"))
                    .child(a11y_bounds_probe(row_id, env.a11y_bounds.clone()));
            }
            if idx > 0 {
                row = row.border_t(px(1.0)).border_color(palette.border);
            }
            list = list.child(row);
        }
        div().w_full().p(px(16.0)).child(list).into_any_element()
    };

    div()
        .size_full()
        .flex()
        .flex_col()
        .overflow_hidden()
        .child(drilldown_header(
            title,
            NavTarget::AllDocs,
            back_label,
            None,
            env,
            cx,
        ))
        .child(explorer_scroll_viewport(scroll_y, max_scroll, inner, cx))
}
