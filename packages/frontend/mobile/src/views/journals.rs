//! Mobile `Journals` tab screen with prev/next week navigation, Today jump,
//! journal-exists day indicators, and pure Gregorian calendar week derivation.

use ui::{
    Context, Direction, InteractiveElement, IntoElement, ParentElement, StatefulInteractiveElement,
    Styled, div, px, svg,
};
use ui_kit::LogicalStyled;

use crate::{state::MobileAppState, strings::MobileStrings};

use super::{
    A11yBoundsMap, CHEVRON_LEFT_SVG, CHEVRON_RIGHT_SVG, MobileFlexExt, MobilePalette,
    MobileShellView, a11y_bounds_probe, a11y_bounds_probe_border,
};

fn row_dir(dir: Direction) -> ui::Div {
    let d = div().flex().flex_row().items_center();
    if dir.is_rtl() {
        d.dir_rtl()
    } else {
        d.dir_ltr()
    }
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
    let locale = state.locale();
    let selected_date = state.selected_journal_date.clone();
    let prev_week_date = shift_iso_date(&selected_date, -7);
    let next_week_date = shift_iso_date(&selected_date, 7);
    let is_today_selected = selected_date == state.today_date;

    let mut header_actions = row_dir(dir).flex_shrink(0.0).gap(px(4.0));
    if !is_today_selected {
        let today_target = state.today_date.clone();
        header_actions = header_actions.child(
            div()
                .id("mobile.journals.today_btn")
                .snapshot("mobile.journals.today_btn", Some("mobile.shell.root"))
                .relative()
                .h(px(44.0))
                .min_w(px(44.0))
                .px(px(10.0))
                .rounded(px(8.0))
                .bg(palette.accent_soft)
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(12.0))
                .text_color(palette.accent)
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state.select_journal_date(&today_target);
                    cx.notify();
                }))
                .child(a11y_bounds_probe(
                    "mobile.journals.today_btn",
                    a11y_bounds.clone(),
                ))
                .child(strings.today_btn_label),
        );
    }
    header_actions = header_actions
        .child(
            div()
                .id("mobile.journals.prev_week_btn")
                .snapshot("mobile.journals.prev_week_btn", Some("mobile.shell.root"))
                .relative()
                .w(px(44.0))
                .h(px(44.0))
                .rounded(px(8.0))
                .flex()
                .items_center()
                .justify_center()
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state.select_journal_date(&prev_week_date);
                    cx.notify();
                }))
                .child(a11y_bounds_probe(
                    "mobile.journals.prev_week_btn",
                    a11y_bounds.clone(),
                ))
                .child(
                    svg()
                        .data(CHEVRON_LEFT_SVG)
                        .mirror_in_rtl(true)
                        .w(px(15.0))
                        .h(px(15.0))
                        .text_color(palette.text_secondary),
                ),
        )
        .child(
            div()
                .px(px(8.0))
                .py(px(4.0))
                .rounded(px(8.0))
                .bg(palette.accent_soft)
                .text_size(px(12.0))
                .text_color(palette.accent)
                .child(selected_date.clone()),
        )
        .child(
            div()
                .id("mobile.journals.next_week_btn")
                .snapshot("mobile.journals.next_week_btn", Some("mobile.shell.root"))
                .relative()
                .w(px(44.0))
                .h(px(44.0))
                .rounded(px(8.0))
                .flex()
                .items_center()
                .justify_center()
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state.select_journal_date(&next_week_date);
                    cx.notify();
                }))
                .child(a11y_bounds_probe(
                    "mobile.journals.next_week_btn",
                    a11y_bounds.clone(),
                ))
                .child(
                    svg()
                        .data(CHEVRON_RIGHT_SVG)
                        .mirror_in_rtl(true)
                        .w(px(15.0))
                        .h(px(15.0))
                        .text_color(palette.text_secondary),
                ),
        );

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
        .pe(px(8.0), dir)
        .child(
            div()
                .flex_1()
                .min_w(px(0.0))
                .overflow_hidden()
                .text_size(px(18.0))
                .text_color(palette.text_primary)
                .align_start_for(dir)
                .child(strings.tab_journals),
        )
        .child(header_actions);

    let compact = viewport_h < 460.0;
    let day_pill_h = if compact { 44.0 } else { 54.0 };
    let week = week_days_for_date(&state.selected_journal_date);
    let make_day_pill =
        |idx: usize, day_num: String, iso_date: String, cx: &mut Context<MobileShellView>| {
            let day_lbl = strings.weekday_short[idx];
            let is_selected = iso_date == selected_date;
            let is_today = iso_date == state.today_date;
            let has_doc = state
                .active_workspace()
                .docs
                .iter()
                .any(|d| !d.trashed && d.journal_date.as_deref() == Some(iso_date.as_str()));
            let day_id = format!("mobile.journals.day.{iso_date}");
            let click_date = iso_date.clone();
            let mut pill = div()
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
                );
            if has_doc {
                pill = pill.child(div().w(px(4.0)).h(px(4.0)).rounded(px(2.0)).bg(
                    if is_selected {
                        ui::hsla(0.0, 0.0, 1.0, 0.95)
                    } else {
                        palette.accent
                    },
                ));
            }
            pill
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
        .active_workspace()
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
        .unwrap_or_else(|| strings.journal_title(locale, &selected_date));
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

/// Shift an ISO `YYYY-MM-DD` date by `delta_days` days using pure civil calendar math.
pub(crate) fn shift_iso_date(iso_date: &str, delta_days: i64) -> String {
    let Some((y, m, d)) = parse_iso_date(iso_date) else {
        return iso_date.to_string();
    };
    let z = days_from_civil(y, m, d) + delta_days;
    let (ny, nm, nd) = civil_from_days(z);
    format!("{ny:04}-{nm:02}-{nd:02}")
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn week_days_derivation_handles_regular_and_month_boundary_dates() {
        let week = week_days_for_date("2026-11-25");
        assert_eq!(week.len(), 7);
        assert_eq!(week[0], ("M", "23".to_string(), "2026-11-23".to_string()));
        assert_eq!(week[2], ("W", "25".to_string(), "2026-11-25".to_string()));
        assert_eq!(week[6], ("S", "29".to_string(), "2026-11-29".to_string()));

        let leap = week_days_for_date("2024-02-29");
        assert_eq!(leap[0], ("M", "26".to_string(), "2024-02-26".to_string()));
        assert_eq!(leap[3], ("T", "29".to_string(), "2024-02-29".to_string()));
        assert_eq!(leap[4], ("F", "1".to_string(), "2024-03-01".to_string()));
        assert_eq!(shift_iso_date("2024-02-29", 7), "2024-03-07");
        assert_eq!(shift_iso_date("2024-03-01", -7), "2024-02-23");
    }
}
