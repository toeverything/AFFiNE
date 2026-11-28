//! Mobile shell `Home` tab screen and bottom 4-TabBar with full
//! `.on_click(cx.listener(...))` bindings, vertical scroll viewport, and RTL alignment.

use affine_client::{DirectKind, Origin};
use ui::{
    Context, Direction, Hsla, InteractiveElement, IntoElement, ParentElement,
    StatefulInteractiveElement, Styled, div, px, svg,
};
use ui_kit::{LogicalStyled, MicroIconKind, evaluate_micro_icon};

use crate::{
    state::{MobileAppState, MobileSheet, MobileTab},
    strings::MobileStrings,
};

use super::{
    A11yBoundsMap, CHEVRON_DOWN_SVG, EXPLORER_ICON_SVG, HOME_ICON_SVG, JOURNALS_ICON_SVG,
    MobileFlexExt, MobilePalette, MobileShellView, PLUS_ICON_SVG, SEARCH_ICON_SVG,
    SETTINGS_ICON_SVG, STAR_ICON_SVG, a11y_bounds_probe,
};

fn row_dir(dir: Direction) -> ui::Div {
    let d = div().flex().flex_row().items_center();
    if dir.is_rtl() {
        d.dir_rtl()
    } else {
        d.dir_ltr()
    }
}

pub(super) fn render_home(
    state: &mut MobileAppState,
    viewport_h: f32,
    palette: MobilePalette,
    dir: Direction,
    strings: &'static MobileStrings,
    a11y_bounds: &A11yBoundsMap,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let ws_name = state.active_workspace().summary.name.clone();
    let locale = state.locale();
    let compact = viewport_h < 460.0;

    let header = row_dir(dir)
        .id("mobile.home.header")
        .snapshot("mobile.home.header", Some("mobile.shell.root"))
        .w_full()
        .h(px(56.0))
        .flex_shrink(0.0)
        .justify_between()
        .gap(px(8.0))
        .bg(palette.bg_surface)
        .border_b_1()
        .border_color(palette.border)
        .ps(px(16.0), dir)
        .pe(px(12.0), dir)
        .child(
            row_dir(dir)
                .id("mobile.home.workspace_btn")
                .snapshot("mobile.home.workspace_btn", Some("mobile.shell.root"))
                .relative()
                .flex_1()
                .min_w(px(0.0))
                .h(px(44.0))
                .gap(px(8.0))
                .overflow_hidden()
                .on_click(cx.listener(|this, _, _, cx| {
                    let t = this.now_ms(cx);
                    this.state.open_sheet_from(
                        MobileSheet::WorkspaceSelector,
                        Some("mobile.home.workspace_btn"),
                        t,
                    );
                    cx.notify();
                }))
                .child(a11y_bounds_probe(
                    "mobile.home.workspace_btn",
                    a11y_bounds.clone(),
                ))
                .child(
                    div()
                        .w(px(28.0))
                        .h(px(28.0))
                        .flex_shrink(0.0)
                        .rounded(px(8.0))
                        .bg(palette.accent)
                        .text_color(ui::hsla(0.0, 0.0, 1.0, 1.0))
                        .text_size(px(13.0))
                        .flex()
                        .items_center()
                        .justify_center()
                        .child("A"),
                )
                .child(
                    div()
                        .flex_1()
                        .min_w(px(0.0))
                        .overflow_hidden()
                        .text_size(px(16.0))
                        .text_color(palette.text_primary)
                        .align_start_for(dir)
                        .child(ws_name),
                )
                .child(
                    svg()
                        .data(CHEVRON_DOWN_SVG)
                        .w(px(14.0))
                        .h(px(14.0))
                        .flex_shrink(0.0)
                        .text_color(palette.text_secondary),
                ),
        )
        .child(
            row_dir(dir)
                .flex_shrink(0.0)
                .gap(px(8.0))
                .child(
                    div()
                        .id("mobile.home.new_doc_btn")
                        .snapshot("mobile.home.new_doc_btn", Some("mobile.shell.root"))
                        .relative()
                        .w(px(44.0))
                        .h(px(44.0))
                        .rounded(px(10.0))
                        .bg(palette.accent_soft)
                        .flex()
                        .items_center()
                        .justify_center()
                        .on_click(cx.listener(|this, _, _, cx| {
                            let t = this.now_ms(cx);
                            this.state.create_doc(None, t);
                            cx.notify();
                        }))
                        .child(a11y_bounds_probe(
                            "mobile.home.new_doc_btn",
                            a11y_bounds.clone(),
                        ))
                        .child(
                            svg()
                                .data(PLUS_ICON_SVG)
                                .w(px(18.0))
                                .h(px(18.0))
                                .text_color(palette.accent),
                        ),
                )
                .child(
                    div()
                        .id("mobile.home.settings_btn")
                        .snapshot("mobile.home.settings_btn", Some("mobile.shell.root"))
                        .relative()
                        .w(px(44.0))
                        .h(px(44.0))
                        .rounded(px(10.0))
                        .bg(palette.bg_pill)
                        .flex()
                        .items_center()
                        .justify_center()
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.state.open_settings();
                            cx.notify();
                        }))
                        .child(a11y_bounds_probe(
                            "mobile.home.settings_btn",
                            a11y_bounds.clone(),
                        ))
                        .child(
                            svg()
                                .data(SETTINGS_ICON_SVG)
                                .w(px(18.0))
                                .h(px(18.0))
                                .text_color(palette.text_secondary),
                        ),
                ),
        );

    let fav_docs: Vec<(String, String)> = state
        .active_workspace()
        .docs
        .iter()
        .filter(|d| !d.trashed && d.is_favorite)
        .take(2)
        .map(|d| (d.id.clone(), d.display_title(locale)))
        .collect();
    let mut fav_row = row_dir(dir)
        .w_full()
        .flex_shrink(0.0)
        .items_stretch()
        .gap(px(10.0));
    for (doc_id, title) in &fav_docs {
        let click_id = doc_id.clone();
        let node_id = format!("mobile.home.fav.{doc_id}");
        fav_row = fav_row.child(
            div()
                .id(node_id.clone())
                .snapshot(node_id.clone(), Some("mobile.shell.root"))
                .relative()
                .flex_1()
                .min_w(px(0.0))
                .min_h(px(if compact { 64.0 } else { 80.0 }))
                .p(px(12.0))
                .rounded(px(12.0))
                .bg(palette.bg_surface)
                .border_1()
                .border_color(palette.border)
                .flex()
                .flex_col()
                .gap(px(5.0))
                .overflow_hidden()
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state
                        .open_doc(&click_id, Origin::Direct(DirectKind::Home));
                    cx.notify();
                }))
                .child(a11y_bounds_probe(node_id, a11y_bounds.clone()))
                .child(
                    svg()
                        .data(STAR_ICON_SVG)
                        .w(px(14.0))
                        .h(px(14.0))
                        .text_color(palette.accent),
                )
                .child(
                    div()
                        .w_full()
                        .text_size(px(13.0))
                        .text_color(palette.text_primary)
                        .align_start_for(dir)
                        .overflow_hidden()
                        .child(title.clone()),
                ),
        );
    }

    let tight_portrait = !compact && viewport_h < 620.0;
    let active_docs: Vec<(String, String, String)> = state
        .active_workspace()
        .docs
        .iter()
        .filter(|d| !d.trashed)
        .map(|d| {
            (
                d.id.clone(),
                d.display_title(locale),
                d.body_preview.clone(),
            )
        })
        .collect();
    let row_h = if compact {
        46.0
    } else if tight_portrait {
        64.0
    } else {
        72.0
    };
    let max_recent = if compact { 2 } else { active_docs.len() };
    let mut recent_list = div()
        .w_full()
        .flex_shrink(0.0)
        .rounded(px(12.0))
        .bg(palette.bg_surface)
        .border_1()
        .border_color(palette.border)
        .flex()
        .flex_col()
        .overflow_hidden();

    for (idx, (doc_id, title, preview)) in active_docs.iter().take(max_recent).enumerate() {
        let click_id = doc_id.clone();
        let node_id = format!("mobile.home.doc.{doc_id}");
        let mut row = div()
            .id(node_id.clone())
            .snapshot(node_id.clone(), Some("mobile.shell.root"))
            .relative()
            .w_full()
            .min_h(px(row_h))
            .flex_shrink(0.0)
            .px(px(14.0))
            .py(px(if compact || tight_portrait { 6.0 } else { 9.0 }))
            .flex()
            .flex_col()
            .justify_center()
            .gap(px(4.0))
            .overflow_hidden()
            .on_click(cx.listener(move |this, _, _, cx| {
                this.state
                    .open_doc(&click_id, Origin::Direct(DirectKind::Home));
                cx.notify();
            }))
            .child(a11y_bounds_probe(node_id, a11y_bounds.clone()));
        if idx > 0 {
            row = row.border_t(px(1.0)).border_color(palette.border);
        }
        row = row.child(
            div()
                .w_full()
                .text_size(px(14.0))
                .text_color(palette.text_primary)
                .align_start_for(dir)
                .overflow_hidden()
                .child(title.clone()),
        );
        if !compact {
            row = row.child(
                div()
                    .w_full()
                    .text_size(px(12.0))
                    .text_color(palette.text_secondary)
                    .align_start_for(dir)
                    .overflow_hidden()
                    .child(preview.clone()),
            );
        }
        recent_list = recent_list.child(row);
    }

    let fav_section = div()
        .w_full()
        .flex()
        .flex_col()
        .gap(px(6.0))
        .child(
            div()
                .w_full()
                .text_size(px(12.0))
                .text_color(palette.text_secondary)
                .align_start_for(dir)
                .child(strings.favorites),
        )
        .child(fav_row);

    let recent_section = div()
        .w_full()
        .flex()
        .flex_col()
        .gap(px(6.0))
        .child(
            div()
                .w_full()
                .text_size(px(12.0))
                .text_color(palette.text_secondary)
                .align_start_for(dir)
                .child(strings.recent_docs),
        )
        .child(recent_list);

    let avail_h = (viewport_h - 56.0 - 64.0).max(44.0);
    let pad = if compact || tight_portrait {
        10.0
    } else {
        16.0
    };
    let gap = if tight_portrait { 8.0 } else { 14.0 };
    let fav_h: f32 = if fav_docs.is_empty() {
        0.0
    } else {
        22.0 + if compact { 64.0 } else { 80.0 }
    };
    let recent_h: f32 = 22.0 + (active_docs.len().min(max_recent) as f32) * row_h + 4.0;
    let content_h = if compact {
        pad * 2.0 + fav_h.max(recent_h)
    } else {
        pad * 2.0 + fav_h + gap + recent_h
    };
    let max_scroll = (content_h - avail_h).max(0.0);
    state.home_scroll_y = state.home_scroll_y.clamp(0.0, max_scroll);
    let scroll_y = state.home_scroll_y;

    let inner: ui::AnyElement = if compact {
        row_dir(dir)
            .w_full()
            .p(px(pad))
            .gap(px(10.0))
            .items_start()
            .child(div().flex_1().min_w(px(0.0)).child(fav_section))
            .child(div().flex_1().min_w(px(0.0)).child(recent_section))
            .into_any_element()
    } else {
        div()
            .w_full()
            .p(px(pad))
            .flex()
            .flex_col()
            .gap(px(gap))
            .child(fav_section)
            .child(recent_section)
            .into_any_element()
    };

    let body = div()
        .id("mobile.home.scroll_viewport")
        .flex_1()
        .min_h(px(0.0))
        .w_full()
        .relative()
        .overflow_hidden()
        .on_scroll(cx.listener(move |this, event: &ui::ScrollEvent, _, cx| {
            let dy: f32 = event.delta.pixel_delta(px(24.0)).y.into();
            if dy.abs() > 0.01 {
                this.state.home_scroll_y = (this.state.home_scroll_y - dy).clamp(0.0, max_scroll);
                cx.notify();
            }
        }))
        .child(div().w_full().mt(px(-scroll_y)).child(inner));

    div()
        .size_full()
        .flex()
        .flex_col()
        .overflow_hidden()
        .child(header)
        .child(body)
}

pub(super) fn render_bottom_tabbar(
    state: &MobileAppState,
    now_ms: f64,
    palette: MobilePalette,
    dir: Direction,
    strings: &'static MobileStrings,
    a11y_bounds: &A11yBoundsMap,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let mut bar = div()
        .id("mobile.tabbar")
        .snapshot("mobile.tabbar", Some("mobile.shell.root"))
        .relative()
        .w_full()
        .h(px(64.0))
        .flex_shrink(0.0)
        .bg(palette.bg_surface)
        .border_t(px(1.0))
        .border_color(palette.border)
        .flex()
        .flex_row()
        .items_center()
        .justify_between()
        .ps(px(8.0), dir)
        .pe(px(8.0), dir)
        .child(a11y_bounds_probe("app.nav.tabbar", a11y_bounds.clone()));
    bar = if dir.is_rtl() {
        bar.dir_rtl()
    } else {
        bar.dir_ltr()
    };

    for tab in MobileTab::ALL {
        let active = state.active_tab == tab;
        let elapsed = (now_ms - state.tab_anim_start_ms).max(0.0);
        let frame = evaluate_micro_icon(tab.micro_icon(), if active { elapsed } else { 0.0 });
        let label = match tab {
            MobileTab::Home => strings.tab_home,
            MobileTab::Explorer => strings.tab_explorer,
            MobileTab::Journals => strings.tab_journals,
            MobileTab::Search => strings.tab_search,
        };
        let icon_bytes = match tab.micro_icon() {
            MicroIconKind::Home => HOME_ICON_SVG,
            MicroIconKind::Explorer => EXPLORER_ICON_SVG,
            MicroIconKind::Journals => JOURNALS_ICON_SVG,
            MicroIconKind::Search => SEARCH_ICON_SVG,
            MicroIconKind::SyncSpinner => SETTINGS_ICON_SVG,
        };
        let icon_color = if active {
            Hsla {
                a: palette.accent.a * frame.opacity.clamp(0.2, 1.0),
                ..palette.accent
            }
        } else {
            palette.text_muted
        };
        let label_color = if active {
            palette.accent
        } else {
            palette.text_muted
        };

        let mut tab_el = div()
            .id(tab.id())
            .snapshot(tab.id(), Some("mobile.tabbar"))
            .relative()
            .flex_1()
            .h(px(52.0))
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap(px(3.0))
            .on_click(cx.listener(move |this, _, _, cx| {
                let t = this.now_ms(cx);
                this.state.switch_tab(tab, t);
                cx.notify();
            }))
            .child(a11y_bounds_probe(tab.id(), a11y_bounds.clone()))
            .child(
                svg()
                    .data(icon_bytes)
                    .mirror_in_rtl(frame.mirror_in_rtl)
                    .w(px(20.0 * frame.scale))
                    .h(px(20.0 * frame.scale))
                    .text_color(icon_color),
            )
            .child(
                div()
                    .text_size(px(11.0))
                    .text_color(label_color)
                    .child(label),
            );
        if active {
            tab_el = tab_el.child(
                div()
                    .w(px(6.0))
                    .h(px(2.5))
                    .rounded(px(2.0))
                    .bg(palette.accent),
            );
        }
        bar = bar.child(tab_el);
    }

    bar
}
