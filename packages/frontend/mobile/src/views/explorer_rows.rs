//! Reusable row and header builders for the mobile `Explorer` (`All Docs`) route.

use affine_client::{DirectKind, NavTarget, Origin};
use ui::{
    Context, Direction, InteractiveElement, IntoElement, ParentElement, StatefulInteractiveElement,
    Styled, div, px, svg,
};
use ui_kit::LogicalStyled;

use crate::{a11y::derive_explorer_doc_origin, state::MobileAppState, strings::MobileStrings};

use super::{
    A11yBoundsMap, CHEVRON_LEFT_SVG, MobileFlexExt, MobilePalette, MobileShellView, PLUS_ICON_SVG,
    a11y_bounds_probe,
};

#[derive(Clone, Copy)]
pub(super) struct ExplorerEnv<'a> {
    pub palette: MobilePalette,
    pub dir: Direction,
    pub strings: &'static MobileStrings,
    pub a11y_bounds: &'a A11yBoundsMap,
}

pub(super) fn row_dir(dir: Direction) -> ui::Div {
    let d = div().flex().flex_row().items_center();
    if dir.is_rtl() {
        d.dir_rtl()
    } else {
        d.dir_ltr()
    }
}

pub(super) fn new_doc_button(
    folder_id: Option<String>,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let palette = env.palette;
    div()
        .id("mobile.explorer.new_doc_btn")
        .snapshot("mobile.explorer.new_doc_btn", Some("mobile.shell.root"))
        .relative()
        .w(px(44.0))
        .h(px(44.0))
        .flex_shrink(0.0)
        .rounded(px(10.0))
        .bg(palette.accent_soft)
        .flex()
        .items_center()
        .justify_center()
        .on_click(cx.listener(move |this, _, _, cx| {
            let t = this.now_ms(cx);
            this.state.create_doc(folder_id.as_deref(), t);
            cx.notify();
        }))
        .child(a11y_bounds_probe(
            "mobile.explorer.new_doc_btn",
            env.a11y_bounds.clone(),
        ))
        .child(
            svg()
                .data(PLUS_ICON_SVG)
                .w(px(18.0))
                .h(px(18.0))
                .text_color(palette.accent),
        )
}

#[allow(clippy::too_many_arguments)]
pub(super) fn explorer_doc_row(
    ws_id: &str,
    doc_id: String,
    doc_title: String,
    row_h: f32,
    top_border: bool,
    publish_visible: bool,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let (palette, dir) = (env.palette, env.dir);
    let row_id = format!(
        "mobile.explorer.doc.{}",
        crate::encode_scoped_doc_target(ws_id, &doc_id)
    );
    let mut row = row_dir(dir)
        .id(row_id.clone())
        .relative()
        .w_full()
        .h(px(row_h))
        .flex_shrink(0.0)
        .ps(px(14.0), dir)
        .pe(px(14.0), dir)
        .overflow_hidden()
        .on_click(cx.listener(move |this, _, _, cx| {
            let origin = derive_explorer_doc_origin(&mut this.state, &doc_id);
            this.state.open_doc(&doc_id, origin);
            cx.notify();
        }))
        .child(
            div()
                .flex_1()
                .min_w(px(0.0))
                .text_size(px(14.0))
                .text_color(palette.text_primary)
                .align_start_for(dir)
                .overflow_hidden()
                .child(doc_title),
        );
    if publish_visible {
        row = row
            .snapshot(row_id.clone(), Some("mobile.shell.root"))
            .child(a11y_bounds_probe(row_id, env.a11y_bounds.clone()));
    }
    if top_border {
        row = row.border_t(px(1.0)).border_color(palette.border);
    }
    row
}

/// Vertical scrollable viewport for Explorer content with wheel and pointer-drag scrolling.
pub(super) fn explorer_scroll_viewport(
    scroll_y: f32,
    max_scroll: f32,
    inner: ui::AnyElement,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    div()
        .id("mobile.explorer.scroll_viewport")
        .flex_1()
        .min_h(px(0.0))
        .w_full()
        .relative()
        .overflow_hidden()
        .on_scroll(cx.listener(move |this, event: &ui::ScrollEvent, _, cx| {
            let dy: f32 = event.delta.pixel_delta(px(24.0)).y.into();
            if dy.abs() > 0.01 {
                this.state.scroll_explorer_by(-dy, max_scroll);
                cx.notify();
            }
        }))
        .child(div().w_full().mt(px(-scroll_y)).child(inner))
}

pub(super) fn drilldown_header(
    title: String,
    parent_target: NavTarget,
    back_label: String,
    new_doc_folder_id: Option<String>,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let (palette, dir) = (env.palette, env.dir);
    let mut bar = row_dir(dir)
        .id("mobile.explorer.header")
        .snapshot("mobile.explorer.header", Some("mobile.shell.root"))
        .w_full()
        .h(px(56.0))
        .flex_shrink(0.0)
        .bg(palette.bg_surface)
        .border_b_1()
        .border_color(palette.border)
        .ps(px(8.0), dir)
        .pe(px(12.0), dir)
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
        );
    if let Some(fid) = new_doc_folder_id {
        bar = bar.child(new_doc_button(Some(fid), env, cx));
    }
    bar
}

#[allow(clippy::too_many_arguments)]
pub(super) fn explorer_meta_row(
    id: &'static str,
    label: &'static str,
    count: usize,
    target: NavTarget,
    row_h: f32,
    publish_visible: bool,
    env: ExplorerEnv<'_>,
    top_border: bool,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let (palette, dir) = (env.palette, env.dir);
    let mut row = row_dir(dir)
        .id(id)
        .relative()
        .w_full()
        .h(px(row_h))
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
    if publish_visible {
        row = row
            .snapshot(id, Some("mobile.shell.root"))
            .child(a11y_bounds_probe(id, env.a11y_bounds.clone()));
    }
    if top_border {
        row = row.border_t(px(1.0)).border_color(palette.border);
    }
    row
}

#[allow(clippy::too_many_arguments)]
pub(super) fn explorer_compact_meta_cell(
    id: &'static str,
    label: &'static str,
    count: usize,
    target: NavTarget,
    env: ExplorerEnv<'_>,
    leading_border: bool,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let (palette, dir) = (env.palette, env.dir);
    let mut cell = row_dir(dir)
        .id(id)
        .snapshot(id, Some("mobile.shell.root"))
        .relative()
        .flex_1()
        .min_w(px(0.0))
        .h(px(44.0))
        .justify_center()
        .gap(px(4.0))
        .px(px(6.0))
        .overflow_hidden()
        .on_click(cx.listener(move |this, _, _, cx| {
            this.state
                .navigate_target(target.clone(), Origin::Direct(DirectKind::AllDocs));
            cx.notify();
        }))
        .child(a11y_bounds_probe(id, env.a11y_bounds.clone()))
        .child(
            div()
                .text_size(px(12.0))
                .text_color(palette.text_primary)
                .overflow_hidden()
                .child(label),
        )
        .child(
            div()
                .text_size(px(11.0))
                .text_color(palette.text_secondary)
                .child(count.to_string()),
        );
    if leading_border {
        cell = if dir.is_rtl() {
            cell.border_r(px(1.0)).border_color(palette.border)
        } else {
            cell.border_l(px(1.0)).border_color(palette.border)
        };
    }
    cell
}

pub(super) fn render_collection_drilldown(
    state: &mut MobileAppState,
    col_id: &str,
    viewport_h: f32,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let locale = state.locale();
    let ws_id = state.active_workspace_id().to_string();
    let col = state
        .active_workspace()
        .collections
        .iter()
        .find(|c| c.id == col_id);
    let title = col
        .map(|c| c.name.clone())
        .unwrap_or_else(|| env.strings.collections.to_string());
    let docs: Vec<(String, String)> = match col {
        Some(c) => state
            .active_workspace()
            .docs
            .iter()
            .filter(|d| !d.trashed && c.doc_ids.iter().any(|id| id == &d.id))
            .map(|d| (d.id.clone(), d.display_title(locale)))
            .collect(),
        None => Vec::new(),
    };
    render_doc_list_drilldown(
        state,
        ws_id,
        title,
        NavTarget::Collection(String::new()),
        env.strings.collections.to_string(),
        docs,
        viewport_h,
        env,
        cx,
    )
}

pub(super) fn render_tag_drilldown(
    state: &mut MobileAppState,
    tag_id: &str,
    viewport_h: f32,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let locale = state.locale();
    let ws_id = state.active_workspace_id().to_string();
    let title = state
        .active_workspace()
        .tags
        .iter()
        .find(|(id, _)| id == tag_id)
        .map(|(_, name)| format!("#{name}"))
        .unwrap_or_else(|| format!("#{tag_id}"));
    let docs: Vec<(String, String)> = state
        .active_workspace()
        .docs
        .iter()
        .filter(|d| !d.trashed && d.tags.iter().any(|t| t == tag_id))
        .map(|d| (d.id.clone(), d.display_title(locale)))
        .collect();
    render_doc_list_drilldown(
        state,
        ws_id,
        title,
        NavTarget::Tag(String::new()),
        env.strings.tags.to_string(),
        docs,
        viewport_h,
        env,
        cx,
    )
}

pub(super) fn render_trash_drilldown(
    state: &mut MobileAppState,
    viewport_h: f32,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let locale = state.locale();
    let ws_id = state.active_workspace_id().to_string();
    let docs: Vec<(String, String)> = state
        .active_workspace()
        .docs
        .iter()
        .filter(|d| d.trashed)
        .map(|d| (d.id.clone(), d.display_title(locale)))
        .collect();
    render_doc_list_drilldown(
        state,
        ws_id,
        env.strings.trash.to_string(),
        NavTarget::AllDocs,
        env.strings.tab_explorer.to_string(),
        docs,
        viewport_h,
        env,
        cx,
    )
}

#[allow(clippy::too_many_arguments)]
fn render_doc_list_drilldown(
    state: &mut MobileAppState,
    ws_id: String,
    title: String,
    parent_target: NavTarget,
    back_label: String,
    docs: Vec<(String, String)>,
    viewport_h: f32,
    env: ExplorerEnv<'_>,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let palette = env.palette;
    let avail_h = (viewport_h - 56.0 - 64.0).max(44.0);
    let content_h = 32.0 + (docs.len() as f32) * 46.0 + 2.0;
    let max_scroll = (content_h - avail_h).max(0.0);
    state.explorer_scroll_y = state.explorer_scroll_y.clamp(0.0, max_scroll);
    let scroll_y = state.explorer_scroll_y;

    let inner: ui::AnyElement = if docs.is_empty() {
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

        for (idx, (doc_id, doc_title)) in docs.into_iter().enumerate() {
            let top = 17.0 + (idx as f32) * 46.0 - scroll_y;
            let row_vis = top >= -1.0 && top + 46.0 <= avail_h + 1.0;
            list = list.child(explorer_doc_row(
                &ws_id,
                doc_id,
                doc_title,
                46.0,
                idx > 0,
                row_vis,
                env,
                cx,
            ));
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
            parent_target,
            back_label,
            None,
            env,
            cx,
        ))
        .child(explorer_scroll_viewport(scroll_y, max_scroll, inner, cx))
}
