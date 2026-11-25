//! Mobile shell primary tab screens (`Home`, `Journals`) with full
//! `.on_click(cx.listener(...))` bindings, RTL alignment, and pure calendar week derivation.

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
    SETTINGS_ICON_SVG, STAR_ICON_SVG, a11y_bounds_probe, a11y_bounds_probe_border,
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
    state: &MobileAppState,
    viewport_h: f32,
    palette: MobilePalette,
    dir: Direction,
    strings: &'static MobileStrings,
    a11y_bounds: &A11yBoundsMap,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let ws = state.active_workspace();
    let locale = state.locale();
    let compact = viewport_h < 460.0;

    let header = row_dir(dir)
        .id("mobile.home.header")
        .snapshot("mobile.home.header", Some("mobile.shell.root"))
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
            row_dir(dir)
                .id("mobile.home.workspace_btn")
                .snapshot("mobile.home.workspace_btn", Some("mobile.shell.root"))
                .relative()
                .h(px(44.0))
                .min_w(px(44.0))
                .gap(px(8.0))
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
                        .text_size(px(16.0))
                        .text_color(palette.text_primary)
                        .child(ws.name.clone()),
                )
                .child(
                    svg()
                        .data(CHEVRON_DOWN_SVG)
                        .w(px(14.0))
                        .h(px(14.0))
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
                        .child(
                            svg()
                                .data(SETTINGS_ICON_SVG)
                                .w(px(18.0))
                                .h(px(18.0))
                                .text_color(palette.text_secondary),
                        ),
                ),
        );

    let mut fav_row = row_dir(dir)
        .w_full()
        .flex_shrink(0.0)
        .items_stretch()
        .gap(px(10.0));
    for doc in state
        .docs
        .iter()
        .filter(|d| !d.trashed && d.is_favorite)
        .take(2)
    {
        let doc_id = doc.id.clone();
        fav_row = fav_row.child(
            div()
                .id(format!("mobile.home.fav.{doc_id}"))
                .snapshot(
                    format!("mobile.home.fav.{doc_id}"),
                    Some("mobile.shell.root"),
                )
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
                        .open_doc(&doc_id, Origin::Direct(DirectKind::Home));
                    cx.notify();
                }))
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
                        .child(doc.display_title(locale)),
                ),
        );
    }

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

    let tight_portrait = !compact && viewport_h < 620.0;
    let active_docs: Vec<_> = state.docs.iter().filter(|d| !d.trashed).collect();
    let max_recent = if compact { 2 } else { active_docs.len() };
    for (idx, doc) in active_docs.iter().take(max_recent).enumerate() {
        let doc_id = doc.id.clone();
        let mut row = div()
            .id(format!("mobile.home.doc.{doc_id}"))
            .snapshot(
                format!("mobile.home.doc.{doc_id}"),
                Some("mobile.shell.root"),
            )
            .w_full()
            .min_h(px(if compact {
                46.0
            } else if tight_portrait {
                64.0
            } else {
                72.0
            }))
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
                    .open_doc(&doc_id, Origin::Direct(DirectKind::Home));
                cx.notify();
            }));
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
                .child(doc.display_title(locale)),
        );
        if !compact {
            row = row.child(
                div()
                    .w_full()
                    .text_size(px(12.0))
                    .text_color(palette.text_secondary)
                    .align_start_for(dir)
                    .overflow_hidden()
                    .child(doc.body_preview.clone()),
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

    let body: ui::AnyElement = if compact {
        row_dir(dir)
            .flex_1()
            .min_h(px(0.0))
            .p(px(10.0))
            .gap(px(10.0))
            .items_start()
            .overflow_hidden()
            .child(div().flex_1().min_w(px(0.0)).child(fav_section))
            .child(div().flex_1().min_w(px(0.0)).child(recent_section))
            .into_any_element()
    } else {
        div()
            .flex_1()
            .min_h(px(0.0))
            .p(px(if tight_portrait { 10.0 } else { 16.0 }))
            .flex()
            .flex_col()
            .gap(px(if tight_portrait { 8.0 } else { 14.0 }))
            .overflow_hidden()
            .child(fav_section)
            .child(recent_section)
            .into_any_element()
    };

    div()
        .size_full()
        .flex()
        .flex_col()
        .overflow_hidden()
        .child(header)
        .child(body)
}

#[allow(clippy::too_many_arguments)]
pub(super) fn render_journals(
    state: &MobileAppState,
    viewport_w: f32,
    viewport_h: f32,
    palette: MobilePalette,
    dir: Direction,
    strings: &'static MobileStrings,
    a11y_bounds: &A11yBoundsMap,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let selected_date = state.selected_journal_date.clone();
    let header = row_dir(dir)
        .id("mobile.journals.header")
        .snapshot("mobile.journals.header", Some("mobile.shell.root"))
        .w_full()
        .h(px(56.0))
        .flex_shrink(0.0)
        .justify_between()
        .bg(palette.bg_surface)
        .border_b_1()
        .border_color(palette.border)
        .ps(px(16.0), dir)
        .pe(px(16.0), dir)
        .child(
            div()
                .text_size(px(18.0))
                .text_color(palette.text_primary)
                .child(strings.tab_journals),
        )
        .child(
            div()
                .px(px(10.0))
                .py(px(4.0))
                .rounded(px(8.0))
                .bg(palette.accent_soft)
                .text_size(px(12.0))
                .text_color(palette.accent)
                .child(selected_date.clone()),
        );

    let compact = viewport_h < 460.0;
    let day_pill_h = if compact { 44.0 } else { 52.0 };
    let week = week_days_for_date(&state.today_date);
    let make_day_pill =
        |idx: usize, day_num: String, iso_date: String, cx: &mut Context<MobileShellView>| {
            let day_lbl = strings.weekday_short[idx];
            let is_selected = iso_date == selected_date;
            let is_today = iso_date == state.today_date;
            let day_id = format!("mobile.journals.day.{iso_date}");
            let click_date = iso_date.clone();
            div()
                .id(day_id.clone())
                .snapshot(day_id.clone(), Some("mobile.shell.root"))
                .relative()
                .flex_1()
                .min_w(px(44.0))
                .h(px(day_pill_h))
                .rounded(px(10.0))
                .bg(if is_selected {
                    palette.accent
                } else {
                    palette.bg_surface
                })
                .border_1()
                .border_color(if is_selected || is_today {
                    palette.accent
                } else {
                    palette.border
                })
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .gap(px(2.0))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state.select_journal_date(&click_date);
                    cx.notify();
                }))
                .child(a11y_bounds_probe_border(day_id, a11y_bounds.clone(), 1.0))
                .child(
                    div()
                        .text_size(px(10.0))
                        .text_color(if is_selected {
                            ui::hsla(0.0, 0.0, 1.0, 0.85)
                        } else {
                            palette.text_secondary
                        })
                        .child(day_lbl),
                )
                .child(
                    div()
                        .text_size(px(13.0))
                        .text_color(if is_selected {
                            ui::hsla(0.0, 0.0, 1.0, 1.0)
                        } else {
                            palette.text_primary
                        })
                        .child(day_num),
                )
        };

    let day_strip: ui::AnyElement = if viewport_w < 364.0 {
        let mut top_row = row_dir(dir).w_full().gap(px(4.0));
        let mut bottom_row = row_dir(dir).w_full().gap(px(4.0));
        for (idx, (_, day_num, iso_date)) in week.into_iter().enumerate() {
            let pill = make_day_pill(idx, day_num, iso_date, cx);
            if idx < 4 {
                top_row = top_row.child(pill);
            } else {
                bottom_row = bottom_row.child(pill);
            }
        }
        div()
            .w_full()
            .flex()
            .flex_col()
            .gap(px(6.0))
            .child(top_row)
            .child(bottom_row)
            .into_any_element()
    } else {
        let mut single_row = row_dir(dir).w_full().justify_between().gap(px(4.0));
        for (idx, (_, day_num, iso_date)) in week.into_iter().enumerate() {
            single_row = single_row.child(make_day_pill(idx, day_num, iso_date, cx));
        }
        single_row.into_any_element()
    };

    let selected_doc = state
        .docs
        .iter()
        .find(|d| !d.trashed && d.journal_date.as_deref() == Some(selected_date.as_str()));
    let has_entry = selected_doc.is_some();
    let card_eyebrow = if selected_date == state.today_date {
        strings.today_journal.to_string()
    } else {
        selected_date.clone()
    };
    let card_title = selected_doc
        .map(|d| d.title.clone())
        .unwrap_or_else(|| format!("Journal {selected_date}"));
    let card_preview = selected_doc
        .map(|d| d.body_preview.clone())
        .unwrap_or_else(|| strings.no_journal_for_date.to_string());
    let cta_label = if has_entry {
        strings.open_journal
    } else {
        strings.create_journal
    };
    let card_date = selected_date.clone();
    let btn_date = selected_date;

    let today_card = div()
        .id("mobile.journals.today_card")
        .snapshot("mobile.journals.today_card", Some("mobile.shell.root"))
        .w_full()
        .p(px(if compact { 10.0 } else { 14.0 }))
        .rounded(px(12.0))
        .bg(palette.bg_surface)
        .border_1()
        .border_color(palette.border)
        .flex()
        .flex_col()
        .gap(px(if compact { 3.0 } else { 6.0 }))
        .on_click(cx.listener(move |this, _, _, cx| {
            let t = this.now_ms(cx);
            this.state.open_or_create_journal_for_date(&card_date, t);
            cx.notify();
        }))
        .child(
            div()
                .w_full()
                .text_size(px(12.0))
                .text_color(palette.accent)
                .align_start_for(dir)
                .child(card_eyebrow),
        )
        .child(
            div()
                .w_full()
                .text_size(px(15.0))
                .text_color(palette.text_primary)
                .align_start_for(dir)
                .child(card_title),
        )
        .child(
            div()
                .w_full()
                .text_size(px(13.0))
                .text_color(palette.text_secondary)
                .align_start_for(dir)
                .child(card_preview),
        );

    let create_btn = div()
        .id("mobile.journals.create_btn")
        .snapshot("mobile.journals.create_btn", Some("mobile.shell.root"))
        .relative()
        .w_full()
        .h(px(46.0))
        .px(px(14.0))
        .rounded(px(12.0))
        .bg(palette.accent)
        .text_color(ui::hsla(0.0, 0.0, 1.0, 1.0))
        .text_size(px(14.0))
        .flex()
        .items_center()
        .justify_center()
        .on_click(cx.listener(move |this, _, _, cx| {
            let t = this.now_ms(cx);
            this.state.open_or_create_journal_for_date(&btn_date, t);
            cx.notify();
        }))
        .child(a11y_bounds_probe(
            "mobile.journals.create_btn",
            a11y_bounds.clone(),
        ))
        .child(cta_label);

    let mut content = div()
        .flex_1()
        .min_h(px(0.0))
        .p(px(if compact { 10.0 } else { 16.0 }))
        .flex()
        .flex_col()
        .gap(px(if compact { 10.0 } else { 14.0 }))
        .overflow_hidden()
        .child(day_strip);
    if compact {
        content = content.child(
            row_dir(dir)
                .w_full()
                .gap(px(10.0))
                .items_center()
                .child(div().flex_1().min_w(px(0.0)).child(today_card))
                .child(div().w(px(184.0)).flex_shrink(0.0).child(create_btn)),
        );
    } else {
        content = content.child(today_card).child(create_btn);
    }

    div()
        .size_full()
        .flex()
        .flex_col()
        .overflow_hidden()
        .child(header)
        .child(content)
}

/// Pure calendar week derivation (Monday..Sunday) from an ISO `YYYY-MM-DD` date string.
/// Returns `(weekday_short, day_number, full_iso_date)` for each of the 7 days.
pub(crate) fn week_days_for_date(iso_date: &str) -> Vec<(&'static str, String, String)> {
    const LABELS: [&str; 7] = ["M", "T", "W", "T", "F", "S", "S"];
    let Some((y, m, d)) = parse_iso_date(iso_date) else {
        return LABELS
            .iter()
            .enumerate()
            .map(|(i, lbl)| (*lbl, (i + 1).to_string(), format!("2026-01-{:02}", i + 1)))
            .collect();
    };
    let z = days_from_civil(y, m, d);
    // 1970-01-01 was Thursday (index 3 in Mon=0..Sun=6).
    let weekday = (z + 3).rem_euclid(7);
    let monday = z - weekday;
    (0..7)
        .map(|offset| {
            let day_z = monday + offset;
            let (dy, dm, dd) = civil_from_days(day_z);
            (
                LABELS[offset as usize],
                dd.to_string(),
                format!("{dy:04}-{dm:02}-{dd:02}"),
            )
        })
        .collect()
}

fn parse_iso_date(s: &str) -> Option<(i32, u32, u32)> {
    let mut parts = s.split('-');
    let y: i32 = parts.next()?.parse().ok()?;
    let m: u32 = parts.next()?.parse().ok()?;
    let d: u32 = parts.next()?.parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    Some((y, m, d))
}

fn days_from_civil(y: i32, m: u32, d: u32) -> i64 {
    let y = i64::from(y) - if m <= 2 { 1 } else { 0 };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let m = i64::from(m);
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + i64::from(d) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let y = y + if m <= 2 { 1 } else { 0 };
    (y as i32, m as u32, d as u32)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn week_days_derivation_handles_regular_and_month_boundary_dates() {
        // 2026-11-25 is Wednesday -> Monday Nov 23 .. Sunday Nov 29.
        let week = week_days_for_date("2026-11-25");
        assert_eq!(week.len(), 7);
        assert_eq!(week[0], ("M", "23".to_string(), "2026-11-23".to_string()));
        assert_eq!(week[2], ("W", "25".to_string(), "2026-11-25".to_string()));
        assert_eq!(week[6], ("S", "29".to_string(), "2026-11-29".to_string()));

        // 2024-02-29 (leap day, Thursday) -> Monday Feb 26 .. Sunday Mar 3.
        let leap = week_days_for_date("2024-02-29");
        assert_eq!(leap[0], ("M", "26".to_string(), "2024-02-26".to_string()));
        assert_eq!(leap[3], ("T", "29".to_string(), "2024-02-29".to_string()));
        assert_eq!(leap[4], ("F", "1".to_string(), "2024-03-01".to_string()));
    }
}
