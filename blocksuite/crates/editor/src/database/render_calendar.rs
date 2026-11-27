//! Calendar view renderer for `affine:database` (`0.27.5` `calendar/layout.ts` &
//! `calendar-view-manager.ts`).

use blocksuite_playground_doc::read::DatabaseCellValue;

use crate::{
    block_flow::{FlowRect, InlineAlign, InlineStyle, civil_from_days},
    theme::{FONT_SANS, TYPOGRAPHY},
};

use super::{
    CalendarEntry, DatabaseHitKind, DatabaseHitTarget, InlineAxis, create_calendar_month_layout,
    isolate_ltr, local_day_index,
    render::{DatabasePrim, DbRenderCtx},
    resolve_tag_color,
};

const PAD_X: f32 = 8.0;
const NAV_HEIGHT: f32 = 30.0;
const WEEKDAY_HEADER_HEIGHT: f32 = 24.0;
const DAY_NUMBER_HEIGHT: f32 = 22.0;
const EVENT_CHIP_HEIGHT: f32 = 18.0;
const EVENT_CHIP_GAP: f32 = 3.0;
const MIN_WEEK_HEIGHT: f32 = 64.0;
const WEEKDAYS: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

pub(super) fn render_calendar_view(
    ctx: &DbRenderCtx<'_>,
    top_y: f32,
) -> (f32, f32, Vec<DatabasePrim>, Vec<DatabaseHitTarget>) {
    let mut prims = Vec::new();
    let mut hits = Vec::new();

    // Resolve mapped start/end date columns.
    let start_col_id = ctx
        .view
        .date
        .as_ref()
        .and_then(|d| d.start_column_id.as_deref())
        .filter(|id| {
            ctx.data
                .columns
                .iter()
                .any(|c| c.id == *id && c.column_type == "date")
        });
    let end_col_id = ctx
        .view
        .date
        .as_ref()
        .and_then(|d| d.end_column_id.as_deref())
        .filter(|id| {
            ctx.data
                .columns
                .iter()
                .any(|c| c.id == *id && c.column_type == "date")
        });

    let Some(start_col_id) = start_col_id else {
        let empty_rect = FlowRect::new(PAD_X, top_y, (ctx.width - 2.0 * PAD_X).max(1.0), 76.0);
        prims.push(DatabasePrim::Quad {
            rect: empty_rect,
            fill: Some(ctx.palette.background_secondary),
            border: Some(ctx.palette.border),
            radius: 6.0,
            dashed: false,
        });
        prims.push(ctx.single_line_clipped(
            "Select a Date property to display records on the calendar.",
            InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_sm_px,
                400.0,
                ctx.palette.text_secondary,
            ),
            empty_rect.x + 12.0,
            empty_rect.y,
            (empty_rect.w - 24.0).max(1.0),
            76.0,
            InlineAlign::Center,
        ));
        return (76.0, 0.0, prims, hits);
    };

    // Determine displayed month: explicit UI override -> first entry month -> `now_ms` local month.
    let today_day = local_day_index(ctx.now_ms, ctx.offset_at_ms);
    let (today_y, today_m, _) = civil_from_days(today_day);
    let entries: Vec<CalendarEntry> = ctx
        .rows
        .iter()
        .filter_map(|row| {
            let start_at = ctx
                .data
                .cells
                .get(&(row.row_id.clone(), start_col_id.to_string()))
                .and_then(DatabaseCellValue::as_i64)?;
            let end_at = end_col_id.and_then(|eid| {
                ctx.data
                    .cells
                    .get(&(row.row_id.clone(), eid.to_string()))
                    .and_then(DatabaseCellValue::as_i64)
                    .filter(|&e| e >= start_at)
            });
            // Derive optional accent color from the first select column if present.
            let color = ctx
                .data
                .columns
                .iter()
                .find(|c| c.column_type == "select")
                .and_then(|c| {
                    let val = ctx
                        .data
                        .cells
                        .get(&(row.row_id.clone(), c.id.clone()))
                        .and_then(DatabaseCellValue::as_str)?;
                    c.select_options()
                        .into_iter()
                        .find(|o| o.id == val || o.value == val)
                        .map(|o| o.color)
                });
            Some(CalendarEntry {
                id: format!("database:{}", row.row_id),
                row_id: row.row_id.clone(),
                title: if row.title.plain.is_empty() {
                    "Untitled".to_string()
                } else {
                    row.title.plain.clone()
                },
                color,
                start_at_ms: start_at,
                end_at_ms: end_at,
                badges: Vec::new(),
            })
        })
        .collect();

    let (year, month) = ctx.ui_state.calendar_month.unwrap_or_else(|| {
        if let Some(first) = entries.first() {
            let d = local_day_index(first.start_at_ms, ctx.offset_at_ms);
            let (ey, em, _) = civil_from_days(d);
            (ey as i32, em)
        } else {
            (today_y as i32, today_m)
        }
    });

    let layout = create_calendar_month_layout(year, month, &entries, 0, ctx.offset_at_ms);
    let grid_w = (ctx.width - 2.0 * PAD_X).max(280.0);
    let col_w = (grid_w / 7.0).floor();
    let actual_grid_w = col_w * 7.0;
    let axis = InlineAxis::new(ctx.direction, actual_grid_w);

    // 1. Month navigation bar: `YYYY-MM` + `< | Today | >` (mirrored in RTL).
    let mut y = top_y;
    let btn_h = 26.0;
    let nav_buttons: [(&str, f32, DatabaseHitKind); 3] = if ctx.direction.is_rtl() {
        [
            (">", 28.0, DatabaseHitKind::CalendarNextMonth),
            ("Today", 54.0, DatabaseHitKind::CalendarToday),
            ("<", 28.0, DatabaseHitKind::CalendarPrevMonth),
        ]
    } else {
        [
            ("<", 28.0, DatabaseHitKind::CalendarPrevMonth),
            ("Today", 54.0, DatabaseHitKind::CalendarToday),
            (">", 28.0, DatabaseHitKind::CalendarNextMonth),
        ]
    };
    let month_label = isolate_ltr(&format!("{year:04}-{month:02}"));
    let (month_x, month_align) = if ctx.direction.is_rtl() {
        (PAD_X + (actual_grid_w - 140.0).max(0.0), InlineAlign::Right)
    } else {
        (PAD_X, InlineAlign::Left)
    };
    prims.push(ctx.single_line_clipped(
        &month_label,
        InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_base_px,
            600.0,
            ctx.palette.text_primary,
        ),
        month_x,
        y,
        140.0,
        NAV_HEIGHT,
        month_align,
    ));

    let total_nav_w: f32 = nav_buttons.iter().map(|(_, w, _)| *w).sum::<f32>() + 12.0;
    let mut bx = if ctx.direction.is_rtl() {
        PAD_X
    } else {
        PAD_X + (actual_grid_w - total_nav_w).max(144.0)
    };
    for (label, bw, kind) in nav_buttons {
        let rect = FlowRect::new(bx, y + 2.0, bw, btn_h);
        prims.push(DatabasePrim::Quad {
            rect,
            fill: Some(ctx.palette.background_secondary),
            border: Some(ctx.palette.border),
            radius: 5.0,
            dashed: false,
        });
        prims.push(ctx.single_line_clipped(
            label,
            InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_xs_px + 1.0,
                500.0,
                ctx.palette.text_primary,
            ),
            rect.x,
            rect.y,
            rect.w,
            rect.h,
            InlineAlign::Center,
        ));
        hits.push(DatabaseHitTarget {
            rect,
            kind,
            scrolls_x: false,
        });
        bx += bw + 6.0;
    }
    y += NAV_HEIGHT + 6.0;

    // 2. Weekday header row (mirrored in RTL via `InlineAxis::map_col_span`).
    for (col_idx, name) in WEEKDAYS.iter().enumerate() {
        let visual_col = axis.map_col_span(7, col_idx, 1);
        let rect = FlowRect::new(
            PAD_X + visual_col as f32 * col_w,
            y,
            col_w,
            WEEKDAY_HEADER_HEIGHT,
        );
        prims.push(DatabasePrim::Quad {
            rect,
            fill: Some(ctx.palette.background_secondary),
            border: Some(ctx.palette.border),
            radius: 0.0,
            dashed: false,
        });
        prims.push(ctx.single_line_clipped(
            name,
            InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_xs_px,
                500.0,
                ctx.palette.text_secondary,
            ),
            rect.x + 4.0,
            rect.y,
            (rect.w - 8.0).max(1.0),
            WEEKDAY_HEADER_HEIGHT,
            InlineAlign::Center,
        ));
    }
    y += WEEKDAY_HEADER_HEIGHT;

    // 3. Week rows, multi-day range segments, and single-day entries.
    for (week_index, week) in layout.weeks.iter().enumerate() {
        let max_slots = week
            .iter()
            .map(|d| d.segment_slots + d.entries.len())
            .max()
            .unwrap_or(0);
        let week_h =
            (DAY_NUMBER_HEIGHT + max_slots as f32 * (EVENT_CHIP_HEIGHT + EVENT_CHIP_GAP) + 8.0)
                .max(MIN_WEEK_HEIGHT);

        // Day cells.
        for (col_idx, day) in week.iter().enumerate() {
            let visual_col = axis.map_col_span(7, col_idx, 1);
            let cell_rect = FlowRect::new(PAD_X + visual_col as f32 * col_w, y, col_w, week_h);
            let is_today = day.day_index == today_day;
            prims.push(DatabasePrim::Quad {
                rect: cell_rect,
                fill: Some(if day.in_month {
                    ctx.palette.background
                } else {
                    ctx.palette.background_secondary.opacity(0.45)
                }),
                border: Some(ctx.palette.border),
                radius: 0.0,
                dashed: false,
            });
            let day_label = isolate_ltr(&day.day.to_string());
            let day_ink = if is_today {
                ctx.palette.on_accent
            } else if day.in_month {
                ctx.palette.text_primary
            } else {
                ctx.palette.text_secondary
            };
            if is_today {
                let badge_x = if ctx.direction.is_rtl() {
                    cell_rect.x + 4.0
                } else {
                    cell_rect.right() - 24.0
                };
                prims.push(DatabasePrim::Quad {
                    rect: FlowRect::new(badge_x, cell_rect.y + 3.0, 20.0, 18.0),
                    fill: Some(ctx.palette.brand),
                    border: None,
                    radius: 9.0,
                    dashed: false,
                });
                prims.push(ctx.single_line_clipped(
                    &day_label,
                    InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px, 600.0, day_ink),
                    badge_x,
                    cell_rect.y + 3.0,
                    20.0,
                    18.0,
                    InlineAlign::Center,
                ));
            } else {
                let day_align = if ctx.direction.is_rtl() {
                    InlineAlign::Left
                } else {
                    InlineAlign::Right
                };
                prims.push(ctx.single_line_clipped(
                    &day_label,
                    InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px, 500.0, day_ink),
                    cell_rect.x + 5.0,
                    cell_rect.y + 2.0,
                    (cell_rect.w - 10.0).max(1.0),
                    DAY_NUMBER_HEIGHT,
                    day_align,
                ));
            }

            // Single-day event chips stacked below any range segments in this day.
            let mut chip_y = y
                + DAY_NUMBER_HEIGHT
                + day.segment_slots as f32 * (EVENT_CHIP_HEIGHT + EVENT_CHIP_GAP);
            for entry in &day.entries {
                let (bg, ink) = entry.color.as_deref().map_or(
                    (ctx.palette.brand.opacity(0.18), ctx.palette.text_primary),
                    |c| resolve_tag_color(c, ctx.theme),
                );
                let chip_rect = FlowRect::new(
                    cell_rect.x + 3.0,
                    chip_y,
                    (cell_rect.w - 6.0).max(1.0),
                    EVENT_CHIP_HEIGHT,
                );
                prims.push(DatabasePrim::Quad {
                    rect: chip_rect,
                    fill: Some(bg),
                    border: None,
                    radius: 4.0,
                    dashed: false,
                });
                let event_align = if ctx.direction.is_rtl() {
                    InlineAlign::Right
                } else {
                    InlineAlign::Left
                };
                prims.push(ctx.single_line_clipped(
                    &entry.title,
                    InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px - 1.0, 500.0, ink),
                    chip_rect.x + 4.0,
                    chip_rect.y,
                    (chip_rect.w - 8.0).max(1.0),
                    EVENT_CHIP_HEIGHT,
                    event_align,
                ));
                chip_y += EVENT_CHIP_HEIGHT + EVENT_CHIP_GAP;
            }
            if ctx.mobile_readonly {
                hits.push(DatabaseHitTarget {
                    rect: cell_rect,
                    kind: DatabaseHitKind::CellReadOnly,
                    scrolls_x: false,
                });
            }
        }

        // Multi-day range segments for this week (mirrored cleanly in RTL via `map_col_span`).
        for seg in layout
            .segments
            .iter()
            .filter(|s| s.week_index == week_index)
        {
            let visual_start = axis.map_col_span(7, seg.start_index, seg.span);
            let seg_x = PAD_X
                + visual_start as f32 * col_w
                + if seg.starts_before_week { 0.0 } else { 3.0 };
            let seg_right_trim = if seg.ends_after_week { 0.0 } else { 3.0 };
            let seg_w = (seg.span as f32 * col_w
                - if seg.starts_before_week { 0.0 } else { 3.0 }
                - seg_right_trim)
                .max(8.0);
            let seg_y =
                y + DAY_NUMBER_HEIGHT + seg.slot as f32 * (EVENT_CHIP_HEIGHT + EVENT_CHIP_GAP);
            let (bg, ink) = seg.entry.color.as_deref().map_or(
                (ctx.palette.brand.opacity(0.24), ctx.palette.text_primary),
                |c| resolve_tag_color(c, ctx.theme),
            );
            let seg_rect = FlowRect::new(seg_x, seg_y, seg_w, EVENT_CHIP_HEIGHT);
            prims.push(DatabasePrim::Quad {
                rect: seg_rect,
                fill: Some(bg),
                border: Some(ctx.palette.brand.opacity(0.4)),
                radius: if seg.starts_before_week && seg.ends_after_week {
                    0.0
                } else {
                    4.0
                },
                dashed: false,
            });
            let seg_align = if ctx.direction.is_rtl() {
                InlineAlign::Right
            } else {
                InlineAlign::Left
            };
            prims.push(ctx.single_line_clipped(
                &seg.entry.title,
                InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px - 1.0, 500.0, ink),
                seg_rect.x + 5.0,
                seg_rect.y,
                (seg_rect.w - 10.0).max(1.0),
                EVENT_CHIP_HEIGHT,
                seg_align,
            ));
        }

        y += week_h;
    }

    let max_scroll_x = (actual_grid_w + 2.0 * PAD_X - ctx.width).max(0.0).ceil();
    (y - top_y, max_scroll_x, prims, hits)
}
