//! iOS 27 multi-document workspace drawer (`pane_corner = 38pt`, fixed short title,
//! `44×44pt` concentric circular liquid-glass close control, workspace identity + sync card,
//! live document filter, Favorites, Recent Documents, All Docs list, and New Document action).

use affine_client::WorkspaceSyncStatus;
use ui::{
    Context, Direction, Hsla, InteractiveElement, IntoElement, ParentElement,
    StatefulInteractiveElement, Styled, div, px, svg,
};
use ui_kit::LogicalStyled;

use crate::{
    state::{MobileAppState, MobileSheet},
    strings::MobileStrings,
};

use super::{
    A11yBoundsMap, CLOSE_ICON_SVG, MobileFlexExt, MobilePalette, MobileShellView, PLUS_ICON_SVG,
    SEARCH_ICON_SVG, STAR_ICON_SVG, a11y_bounds_probe,
};

fn row_dir(dir: Direction) -> ui::Div {
    let d = div().flex().flex_row().items_center();
    if dir.is_rtl() {
        d.dir_rtl()
    } else {
        d.dir_ltr()
    }
}

/// Format the localized sync status badge label and indicator color.
pub(super) fn sync_status_badge(
    status: WorkspaceSyncStatus,
    strings: &'static MobileStrings,
    palette: MobilePalette,
) -> (String, Hsla, Hsla) {
    match status {
        WorkspaceSyncStatus::Synced => (
            strings.sync_synced.to_string(),
            palette.accent,
            palette.accent_soft,
        ),
        WorkspaceSyncStatus::Syncing { pending_updates } => (
            if pending_updates > 0 {
                format!("{} ({pending_updates})", strings.sync_syncing)
            } else {
                strings.sync_syncing.to_string()
            },
            palette.accent,
            palette.accent_soft,
        ),
        WorkspaceSyncStatus::Connecting => (
            strings.sync_connecting.to_string(),
            palette.text_secondary,
            palette.bg_pill,
        ),
        WorkspaceSyncStatus::ReconnectScheduled {
            pending_updates, ..
        } => (
            if pending_updates > 0 {
                format!("{} ({pending_updates})", strings.sync_offline)
            } else {
                strings.sync_offline.to_string()
            },
            palette.text_secondary,
            palette.bg_pill,
        ),
        WorkspaceSyncStatus::Offline => (
            strings.sync_offline.to_string(),
            palette.text_secondary,
            palette.bg_pill,
        ),
        WorkspaceSyncStatus::AuthRequired | WorkspaceSyncStatus::PermissionRevoked => (
            strings.sync_auth_required.to_string(),
            palette.danger,
            palette.danger_soft,
        ),
    }
}

/// Return the filtered, ordered `(favorites, recent, all_docs)` document IDs & display titles
/// shown in the workspace drawer for `state`.
pub(crate) fn drawer_doc_sections(
    state: &MobileAppState,
) -> (
    Vec<(String, String)>,
    Vec<(String, String)>,
    Vec<(String, String)>,
) {
    let locale = state.locale();
    let needle = state.drawer_filter.trim().to_ascii_lowercase();
    let active: Vec<_> = state
        .active_workspace()
        .docs
        .iter()
        .filter(|d| !d.trashed)
        .filter(|d| {
            if needle.is_empty() {
                return true;
            }
            d.title.to_ascii_lowercase().contains(&needle)
                || d.body_preview.to_ascii_lowercase().contains(&needle)
                || d.tags
                    .iter()
                    .any(|t| t.to_ascii_lowercase().contains(&needle))
        })
        .collect();

    let favorites = active
        .iter()
        .filter(|d| d.is_favorite)
        .map(|d| (d.id.clone(), d.display_title(locale)))
        .collect();

    let mut recent_sorted = active.clone();
    recent_sorted.sort_by_key(|a| std::cmp::Reverse(a.updated_at_ms));
    let recent = recent_sorted
        .iter()
        .take(3)
        .map(|d| (d.id.clone(), d.display_title(locale)))
        .collect();

    let all_docs = active
        .iter()
        .map(|d| (d.id.clone(), d.display_title(locale)))
        .collect();

    (favorites, recent, all_docs)
}

#[allow(clippy::too_many_arguments)]
pub(super) fn render_workspace_drawer(
    state: &MobileAppState,
    viewport_w: f32,
    viewport_h: f32,
    progress: f32,
    accepts_input: bool,
    palette: MobilePalette,
    dir: Direction,
    strings: &'static MobileStrings,
    a11y_bounds: &A11yBoundsMap,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let p = progress.clamp(0.0, 1.0);
    let compact = viewport_h < 460.0;
    let is_tablet = viewport_w >= 720.0 && !compact;
    let ws = state.active_workspace();
    let (sync_label, sync_fg, sync_bg) = sync_status_badge(ws.sync_status, strings, palette);
    let (favorites, recent, all_docs) = drawer_doc_sections(state);

    // Liquid-glass concentric circular close button (`44×44pt`, `r=22pt`, iOS 27 standard).
    let glass_bg = Hsla {
        a: 0.72,
        ..palette.bg_pill
    };
    let mut close_btn = div()
        .id("mobile.drawer.close_btn")
        .snapshot("mobile.drawer.close_btn", Some("mobile.sheet.panel"))
        .relative()
        .w(px(44.0))
        .h(px(44.0))
        .flex_shrink(0.0)
        .rounded(px(22.0))
        .bg(glass_bg)
        .border_1()
        .border_color(palette.border)
        .flex()
        .items_center()
        .justify_center()
        .child(a11y_bounds_probe(
            "mobile.drawer.close_btn",
            a11y_bounds.clone(),
        ))
        .child(
            svg()
                .data(CLOSE_ICON_SVG)
                .w(px(16.0))
                .h(px(16.0))
                .text_color(palette.text_primary),
        );
    if accepts_input {
        close_btn = close_btn.on_click(cx.listener(|this, _, _, cx| {
            let t = this.now_ms(cx);
            this.state.close_sheet(t);
            cx.notify();
        }));
    }

    // Header: fixed short centered Semibold title + concentric 44pt liquid-glass close control.
    let header_row = row_dir(dir)
        .w_full()
        .h(px(44.0))
        .flex_shrink(0.0)
        .justify_between()
        .child(close_btn)
        .child(
            div()
                .flex_1()
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(16.0))
                .text_color(palette.text_primary)
                .child(strings.drawer_title),
        )
        .child(div().w(px(44.0)).h(px(44.0)).flex_shrink(0.0));

    // Top concentric workspace identity & live sync status card (`r = 22pt`, `38 - 16 = 22`).
    let mut switch_ws_btn = div()
        .id("mobile.drawer.switch_ws_btn")
        .snapshot("mobile.drawer.switch_ws_btn", Some("mobile.sheet.panel"))
        .relative()
        .h(px(44.0))
        .min_w(px(44.0))
        .px(px(12.0))
        .rounded(px(14.0))
        .bg(palette.bg_pill)
        .flex()
        .items_center()
        .justify_center()
        .text_size(px(12.0))
        .text_color(palette.text_primary)
        .child(a11y_bounds_probe(
            "mobile.drawer.switch_ws_btn",
            a11y_bounds.clone(),
        ))
        .child(strings.switch_workspace);
    if accepts_input {
        switch_ws_btn = switch_ws_btn.on_click(cx.listener(|this, _, _, cx| {
            let t = this.now_ms(cx);
            this.state.open_sheet_from(
                MobileSheet::WorkspaceSelector,
                Some("mobile.drawer.switch_ws_btn"),
                t,
            );
            cx.notify();
        }));
    }

    let ws_card = row_dir(dir)
        .w_full()
        .p(px(12.0))
        .rounded(px(22.0))
        .bg(palette.bg_canvas)
        .border_1()
        .border_color(palette.border)
        .justify_between()
        .gap(px(8.0))
        .child(
            div()
                .flex_1()
                .min_w(px(0.0))
                .flex()
                .flex_col()
                .gap(px(4.0))
                .child(
                    div()
                        .w_full()
                        .text_size(px(15.0))
                        .text_color(palette.text_primary)
                        .align_start_for(dir)
                        .overflow_hidden()
                        .child(ws.summary.name.clone()),
                )
                .child(
                    row_dir(dir).gap(px(6.0)).child(
                        div()
                            .id("mobile.drawer.sync_badge")
                            .snapshot("mobile.drawer.sync_badge", Some("mobile.sheet.panel"))
                            .px(px(8.0))
                            .py(px(2.0))
                            .rounded(px(10.0))
                            .bg(sync_bg)
                            .text_size(px(11.0))
                            .text_color(sync_fg)
                            .child(sync_label),
                    ),
                ),
        )
        .child(switch_ws_btn);

    // Search filter display bar + New Document action row.
    let filter_text = if state.drawer_filter.is_empty() {
        strings.drawer_filter_placeholder.to_string()
    } else {
        state.drawer_filter.clone()
    };
    let filter_color = if state.drawer_filter.is_empty() {
        palette.text_subtle
    } else {
        palette.text_primary
    };
    let filter_bar = row_dir(dir)
        .id("mobile.drawer.filter_bar")
        .snapshot("mobile.drawer.filter_bar", Some("mobile.sheet.panel"))
        .flex_1()
        .min_w(px(0.0))
        .h(px(44.0))
        .px(px(12.0))
        .rounded(px(14.0))
        .bg(palette.bg_canvas)
        .border_1()
        .border_color(palette.border)
        .gap(px(8.0))
        .overflow_hidden()
        .child(
            svg()
                .data(SEARCH_ICON_SVG)
                .w(px(15.0))
                .h(px(15.0))
                .text_color(palette.text_muted),
        )
        .child(
            div()
                .flex_1()
                .min_w(px(0.0))
                .text_size(px(13.0))
                .text_color(filter_color)
                .align_start_for(dir)
                .overflow_hidden()
                .child(filter_text),
        );

    let mut new_doc_btn = row_dir(dir)
        .id("mobile.drawer.new_doc_btn")
        .snapshot("mobile.drawer.new_doc_btn", Some("mobile.sheet.panel"))
        .relative()
        .h(px(44.0))
        .min_w(px(44.0))
        .px(px(12.0))
        .rounded(px(14.0))
        .bg(palette.accent)
        .gap(px(6.0))
        .flex_shrink(0.0)
        .child(a11y_bounds_probe(
            "mobile.drawer.new_doc_btn",
            a11y_bounds.clone(),
        ))
        .child(
            svg()
                .data(PLUS_ICON_SVG)
                .w(px(16.0))
                .h(px(16.0))
                .text_color(ui::hsla(0.0, 0.0, 1.0, 1.0)),
        );
    if viewport_w >= 360.0 {
        new_doc_btn = new_doc_btn.child(
            div()
                .text_size(px(13.0))
                .text_color(ui::hsla(0.0, 0.0, 1.0, 1.0))
                .child(strings.new_doc_label),
        );
    }
    if accepts_input {
        new_doc_btn = new_doc_btn.on_click(cx.listener(|this, _, _, cx| {
            let t = this.now_ms(cx);
            this.state.close_sheet(t);
            this.state.create_doc(None, t);
            cx.notify();
        }));
    }

    let action_row = row_dir(dir)
        .w_full()
        .gap(px(8.0))
        .child(filter_bar)
        .child(new_doc_btn);

    let build_doc_group = |heading: &str,
                           prefix: &str,
                           items: &[(String, String)],
                           show_star: bool,
                           max_items: usize|
     -> ui::Div {
        let mut box_el = div()
            .w_full()
            .rounded(px(20.0))
            .bg(palette.bg_canvas)
            .border_1()
            .border_color(palette.border)
            .flex()
            .flex_col()
            .overflow_hidden();

        for (idx, (doc_id, title)) in items.iter().take(max_items).enumerate() {
            let row_id = format!("mobile.drawer.{prefix}.{doc_id}");
            let click_doc_id = doc_id.clone();
            let mut row = row_dir(dir)
                .id(row_id.clone())
                .snapshot(row_id.clone(), Some("mobile.sheet.panel"))
                .relative()
                .w_full()
                .h(px(44.0))
                .flex_shrink(0.0)
                .ps(px(14.0), dir)
                .pe(px(14.0), dir)
                .gap(px(8.0))
                .overflow_hidden()
                .child(a11y_bounds_probe(row_id, a11y_bounds.clone()));
            if show_star {
                row = row.child(
                    svg()
                        .data(STAR_ICON_SVG)
                        .w(px(13.0))
                        .h(px(13.0))
                        .text_color(palette.accent),
                );
            }
            row = row.child(
                div()
                    .flex_1()
                    .min_w(px(0.0))
                    .text_size(px(13.0))
                    .text_color(palette.text_primary)
                    .align_start_for(dir)
                    .overflow_hidden()
                    .child(title.clone()),
            );
            if accepts_input {
                row = row.on_click(cx.listener(move |this, _, _, cx| {
                    let t = this.now_ms(cx);
                    this.state.open_document(&click_doc_id, t);
                    cx.notify();
                }));
            }
            if idx > 0 {
                row = row.border_t(px(1.0)).border_color(palette.border);
            }
            box_el = box_el.child(row);
        }

        div()
            .w_full()
            .flex()
            .flex_col()
            .gap(px(5.0))
            .child(
                div()
                    .w_full()
                    .ps(px(4.0), dir)
                    .text_size(px(11.0))
                    .text_color(palette.text_secondary)
                    .align_start_for(dir)
                    .child(heading.to_string()),
            )
            .child(box_el)
    };

    let mut body = div()
        .w_full()
        .flex()
        .flex_col()
        .gap(px(if compact { 8.0 } else { 10.0 }))
        .overflow_hidden()
        .child(ws_card)
        .child(action_row);

    if compact {
        if !all_docs.is_empty() {
            body = body.child(build_doc_group(
                strings.all_docs_heading,
                "doc",
                &all_docs,
                false,
                2,
            ));
        }
    } else {
        if !favorites.is_empty() {
            body = body.child(build_doc_group(
                strings.favorites,
                "fav",
                &favorites,
                true,
                2,
            ));
        }
        if !recent.is_empty() && viewport_h >= 720.0 {
            body = body.child(build_doc_group(
                strings.recent_docs,
                "recent",
                &recent,
                false,
                2,
            ));
        }
        if !all_docs.is_empty() {
            body = body.child(build_doc_group(
                strings.all_docs_heading,
                "doc",
                &all_docs,
                false,
                if is_tablet { 6 } else { 3 },
            ));
        }
    }

    let scrim_bg = Hsla {
        a: palette.scrim.a * p,
        ..palette.scrim
    };

    let mut panel = div()
        .id("mobile.sheet.panel")
        .snapshot("mobile.sheet.panel", Some("mobile.sheet.backdrop"))
        .relative()
        .p(px(16.0))
        .rounded(px(38.0))
        .bg(palette.bg_elevated)
        .border_1()
        .border_color(palette.border)
        .opacity(p)
        .flex()
        .flex_col()
        .gap(px(if compact { 8.0 } else { 12.0 }))
        .overflow_hidden()
        .child(a11y_bounds_probe("app.sheet.dialog", a11y_bounds.clone()));

    if is_tablet {
        panel = panel.w(px(360.0)).h(px((viewport_h - 32.0).max(260.0)));
    } else {
        panel = panel
            .w_full()
            .max_h(px((viewport_h - 24.0).max(180.0)))
            .child(
                div().w_full().flex().justify_center().child(
                    div()
                        .w(px(36.0))
                        .h(px(4.0))
                        .rounded(px(2.0))
                        .bg(palette.border),
                ),
            );
    }

    panel = panel.child(header_row).child(body);
    if accepts_input {
        panel = panel.on_click(cx.listener(|_, _, _, cx| cx.stop_propagation()));
    }

    let mut backdrop = div()
        .id("mobile.sheet.backdrop")
        .snapshot("mobile.sheet.backdrop", Some("mobile.shell.root"))
        .absolute()
        .inset_0()
        .bg(scrim_bg)
        .flex();
    backdrop = if is_tablet {
        backdrop.flex_row().items_center().p(px(16.0)).child(panel)
    } else {
        backdrop.flex_col().justify_end().child(panel)
    };
    if accepts_input {
        backdrop = backdrop.occlude().on_click(cx.listener(|this, _, _, cx| {
            let t = this.now_ms(cx);
            this.state.close_sheet(t);
            cx.notify();
        }));
    }
    backdrop
}
