//! Kanban view renderer for `affine:database` (`0.27.5` `kanban/kanban-view-manager.ts`).

use blocksuite_playground_doc::read::{DatabaseColumn, DatabaseGroupBy};

use crate::{
    block_flow::{FlowRect, InlineAlign, InlineStyle},
    theme::{FONT_SANS, TYPOGRAPHY},
};

use super::{
    DatabaseHitKind, DatabaseHitTarget, InlineAxis, format_database_date, format_database_number,
    format_database_progress, group_database_rows,
    render::{DatabasePrim, DbRenderCtx},
    resolve_tag_color,
};

const LANE_WIDTH: f32 = 240.0;
const LANE_GAP: f32 = 12.0;
const LANE_PAD: f32 = 10.0;
const CARD_GAP: f32 = 8.0;
const CARD_PAD: f32 = 10.0;
const PAD_X: f32 = 8.0;

pub(super) fn render_kanban_view(
    ctx: &DbRenderCtx<'_>,
    top_y: f32,
) -> (f32, f32, Vec<DatabasePrim>, Vec<DatabaseHitTarget>) {
    let mut prims = Vec::new();
    let mut hits = Vec::new();

    // Resolve groupBy column (fallback to first `select` / `multi-select` / `checkbox` column).
    let fallback_group = ctx
        .data
        .columns
        .iter()
        .find(|c| {
            matches!(
                c.column_type.as_str(),
                "select" | "multi-select" | "checkbox"
            )
        })
        .map(|c| DatabaseGroupBy {
            kind: "groupBy".to_string(),
            column_id: c.id.clone(),
            name: c.column_type.clone(),
            sort: None,
            hide_empty: None,
        });
    let Some(group_by) = ctx.view.group_by.as_ref().or(fallback_group.as_ref()) else {
        let empty_rect = FlowRect::new(PAD_X, top_y, (ctx.width - 2.0 * PAD_X).max(1.0), 64.0);
        prims.push(DatabasePrim::Quad {
            rect: empty_rect,
            fill: Some(ctx.palette.background_secondary),
            border: Some(ctx.palette.border),
            radius: 6.0,
            dashed: false,
        });
        prims.push(ctx.single_line_clipped(
            "No groupable property available for Kanban view",
            InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_sm_px,
                400.0,
                ctx.palette.text_secondary,
            ),
            empty_rect.x + 12.0,
            empty_rect.y,
            (empty_rect.w - 24.0).max(1.0),
            64.0,
            InlineAlign::Center,
        ));
        return (64.0, 0.0, prims, hits);
    };

    let buckets = group_database_rows(
        ctx.rows,
        group_by,
        &ctx.view.group_properties,
        ctx.data,
        ctx.now_ms,
        ctx.offset_at_ms,
    );
    let lane_count = buckets.len().max(1);
    let total_kanban_w =
        lane_count as f32 * LANE_WIDTH + lane_count.saturating_sub(1) as f32 * LANE_GAP;
    let axis = InlineAxis::new(ctx.direction, total_kanban_w);
    let ordered_lanes = axis.order_indices(buckets.len());

    // Visible card properties ordered by `view.columns` first, then remaining schema columns
    // (mirroring `0.27.5` `kanban-view-manager.ts` `propertiesRaw$`), excluding title & groupBy.
    let visible_prop_ids = kanban_visible_columns(ctx.view, ctx.data, &group_by.column_id);

    let align = if ctx.direction.is_rtl() {
        InlineAlign::Right
    } else {
        InlineAlign::Left
    };

    let mut max_lane_h = 110.0_f32;
    let inner_avail_w = (ctx.width - 2.0 * PAD_X).max(1.0);
    let mut lane_x = if ctx.direction.is_rtl() && total_kanban_w < inner_avail_w {
        ctx.width - PAD_X - total_kanban_w
    } else {
        PAD_X
    };

    for &b_idx in &ordered_lanes {
        let bucket = &buckets[b_idx];
        let lane_start_idx = prims.len();
        // Placeholder background quad; height is updated after laying out cards.
        prims.push(DatabasePrim::Quad {
            rect: FlowRect::new(lane_x, top_y, LANE_WIDTH, 110.0),
            fill: Some(ctx.palette.background_secondary),
            border: Some(ctx.palette.border),
            radius: 8.0,
            dashed: false,
        });

        let mut cy = top_y + LANE_PAD;
        // Lane header: colored tag pill + card count.
        let (pill_bg, pill_ink) = bucket
            .color
            .as_deref()
            .map_or((ctx.palette.hover, ctx.palette.text_primary), |c| {
                resolve_tag_color(c, ctx.theme)
            });
        let pill_style = InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px, 600.0, pill_ink);
        let max_pill_w = (LANE_WIDTH - 56.0).max(24.0);
        let (_, pill_layout) = ctx.truncate_text(
            &bucket.label,
            pill_style,
            (max_pill_w - 14.0).max(1.0),
            22.0,
        );
        let pill_w = (pill_layout.content_width().ceil() + 14.0).min(max_pill_w);
        let pill_x = if ctx.direction.is_rtl() {
            lane_x + LANE_WIDTH - LANE_PAD - pill_w
        } else {
            lane_x + LANE_PAD
        };
        prims.push(DatabasePrim::Quad {
            rect: FlowRect::new(pill_x, cy, pill_w, 22.0),
            fill: Some(pill_bg),
            border: None,
            radius: 4.0,
            dashed: false,
        });
        prims.push(DatabasePrim::Text {
            x: pill_x + 7.0,
            y: cy,
            layout: pill_layout,
            clip: Some(FlowRect::new(
                pill_x + 4.0,
                cy,
                (pill_w - 8.0).max(1.0),
                22.0,
            )),
        });

        let count_str = bucket.rows.len().to_string();
        let count_x = if ctx.direction.is_rtl() {
            lane_x + LANE_PAD
        } else {
            pill_x + pill_w + 8.0
        };
        prims.push(ctx.single_line_clipped(
            &count_str,
            InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_xs_px,
                500.0,
                ctx.palette.text_secondary,
            ),
            count_x,
            cy,
            28.0,
            22.0,
            InlineAlign::Left,
        ));
        cy += 30.0;

        // Cards inside this lane.
        let card_w = LANE_WIDTH - 2.0 * LANE_PAD;
        for row in &bucket.rows {
            let mut prop_lines: Vec<(String, Option<(ui::Hsla, ui::Hsla)>)> = Vec::new();
            for col in &visible_prop_ids {
                let Some(val) = ctx.data.cells.get(&(row.row_id.clone(), col.id.clone())) else {
                    continue;
                };
                if val.is_empty() {
                    continue;
                }
                match col.column_type.as_str() {
                    "select" | "multi-select" => {
                        let opts = col.select_options();
                        for id in val.as_string_list() {
                            let (lbl, clr) = opts
                                .iter()
                                .find(|o| o.id == id || o.value == id)
                                .map_or((id.clone(), "var(--affine-tag-gray)"), |o| {
                                    (o.value.clone(), o.color.as_str())
                                });
                            prop_lines.push((lbl, Some(resolve_tag_color(clr, ctx.theme))));
                        }
                    }
                    "progress" => {
                        if let Some(p) = val.as_i64() {
                            let (_, lbl) = format_database_progress(p);
                            prop_lines.push((format!("{}: {lbl}", col.name), None));
                        }
                    }
                    "number" => {
                        if let Some(n) = val.as_f64() {
                            let fmt = col
                                .data
                                .get("format")
                                .and_then(serde_json::Value::as_str)
                                .unwrap_or("number");
                            let dec = col
                                .data
                                .get("decimal")
                                .and_then(serde_json::Value::as_u64)
                                .map(|d| d as usize);
                            prop_lines.push((format_database_number(n, fmt, dec), None));
                        }
                    }
                    "date" => {
                        if let Some(ts) = val.as_i64() {
                            prop_lines
                                .push((format_database_date(ts, (ctx.offset_at_ms)(ts)), None));
                        }
                    }
                    "checkbox" => {
                        let checked = val.as_bool().unwrap_or(false);
                        prop_lines.push((
                            format!("{}: {}", col.name, if checked { "Done" } else { "Open" }),
                            None,
                        ));
                    }
                    _ => {
                        if let Some(s) = val.as_str()
                            && !s.is_empty()
                        {
                            prop_lines.push((s.to_string(), None));
                        }
                    }
                }
            }

            let card_h = 34.0 + (prop_lines.len() as f32 * 22.0);
            let card_rect = FlowRect::new(lane_x + LANE_PAD, cy, card_w, card_h);
            prims.push(DatabasePrim::Quad {
                rect: card_rect,
                fill: Some(ctx.palette.background),
                border: Some(ctx.palette.border),
                radius: 6.0,
                dashed: false,
            });
            let card_title = if row.title.plain.is_empty() {
                "Untitled"
            } else {
                row.title.plain.as_str()
            };
            prims.push(ctx.single_line_clipped(
                card_title,
                InlineStyle::new(
                    FONT_SANS,
                    TYPOGRAPHY.font_sm_px,
                    500.0,
                    ctx.palette.text_primary,
                ),
                card_rect.x + CARD_PAD,
                card_rect.y + 6.0,
                (card_w - 2.0 * CARD_PAD).max(1.0),
                22.0,
                align,
            ));

            let mut py = card_rect.y + 30.0;
            for (text, pill_colors) in prop_lines {
                if let Some((bg, ink)) = pill_colors {
                    let style = InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px, 500.0, ink);
                    let max_pw = (card_w - 2.0 * CARD_PAD).max(1.0);
                    let (_, layout) =
                        ctx.truncate_text(&text, style, (max_pw - 10.0).max(1.0), 18.0);
                    let pw = (layout.content_width().ceil() + 10.0).min(max_pw);
                    let px_pos = if ctx.direction.is_rtl() {
                        card_rect.right() - CARD_PAD - pw
                    } else {
                        card_rect.x + CARD_PAD
                    };
                    prims.push(DatabasePrim::Quad {
                        rect: FlowRect::new(px_pos, py, pw, 18.0),
                        fill: Some(bg),
                        border: None,
                        radius: 4.0,
                        dashed: false,
                    });
                    prims.push(DatabasePrim::Text {
                        x: px_pos + 5.0,
                        y: py,
                        layout,
                        clip: Some(FlowRect::new(px_pos + 3.0, py, (pw - 6.0).max(1.0), 18.0)),
                    });
                } else {
                    prims.push(ctx.single_line_clipped(
                        &text,
                        InlineStyle::new(
                            FONT_SANS,
                            TYPOGRAPHY.font_xs_px,
                            400.0,
                            ctx.palette.text_secondary,
                        ),
                        card_rect.x + CARD_PAD,
                        py,
                        (card_w - 2.0 * CARD_PAD).max(1.0),
                        18.0,
                        align,
                    ));
                }
                py += 22.0;
            }

            if ctx.mobile_readonly {
                hits.push(DatabaseHitTarget {
                    rect: card_rect,
                    kind: DatabaseHitKind::CellReadOnly,
                    scrolls_x: true,
                });
            }
            cy += card_h + CARD_GAP;
        }

        let lane_h = (cy - top_y + LANE_PAD - CARD_GAP).max(110.0);
        if let Some(DatabasePrim::Quad { rect, .. }) = prims.get_mut(lane_start_idx) {
            rect.h = lane_h;
        }
        max_lane_h = max_lane_h.max(lane_h);
        lane_x += LANE_WIDTH + LANE_GAP;
    }

    let max_scroll_x = (total_kanban_w + 2.0 * PAD_X - ctx.width).max(0.0).ceil();
    (max_lane_h, max_scroll_x, prims, hits)
}

pub(crate) fn kanban_visible_columns<'a>(
    view: &blocksuite_playground_doc::read::DatabaseView,
    data: &'a blocksuite_playground_doc::read::DatabaseData,
    group_by_col_id: &str,
) -> Vec<&'a DatabaseColumn> {
    let mut visible: Vec<&DatabaseColumn> = Vec::new();
    let mut seen: std::collections::HashSet<&str> = std::collections::HashSet::new();
    for vc in &view.columns {
        seen.insert(vc.id.as_str());
        if vc.hide == Some(true) || vc.id == group_by_col_id {
            continue;
        }
        if let Some(col) = data.columns.iter().find(|c| c.id == vc.id)
            && col.column_type != "title"
        {
            visible.push(col);
        }
    }
    for col in &data.columns {
        if seen.contains(col.id.as_str()) || col.column_type == "title" || col.id == group_by_col_id
        {
            continue;
        }
        visible.push(col);
    }
    visible
}

#[cfg(test)]
mod tests {
    use super::*;
    use blocksuite_playground_doc::read::{
        DatabaseColumn, DatabaseData, DatabaseView, DatabaseViewColumn, DatabaseViewMode, RichText,
    };
    use serde_json::json;
    use std::collections::BTreeMap;

    #[test]
    fn kanban_card_fields_follow_view_columns_order() {
        let col = |id: &str, ty: &str| DatabaseColumn {
            id: id.into(),
            column_type: ty.into(),
            name: id.into(),
            data: json!({}),
        };
        let data = DatabaseData {
            title: RichText::default(),
            columns: vec![
                col("title", "title"),
                col("col-status", "select"),
                col("col-tags", "multi-select"),
                col("col-start", "date"),
                col("col-end", "date"),
                col("col-progress", "progress"),
                col("col-budget", "number"),
            ],
            views: vec![],
            cells: BTreeMap::new(),
            rows: vec![],
        };
        let mut view = DatabaseView {
            id: "v-k".into(),
            name: "Kanban".into(),
            mode: DatabaseViewMode::Kanban,
            columns: vec![
                DatabaseViewColumn {
                    id: "title".into(),
                    width: None,
                    hide: None,
                    stat_calc_type: None,
                },
                DatabaseViewColumn {
                    id: "col-tags".into(),
                    width: None,
                    hide: None,
                    stat_calc_type: None,
                },
                DatabaseViewColumn {
                    id: "col-progress".into(),
                    width: None,
                    hide: None,
                    stat_calc_type: None,
                },
                DatabaseViewColumn {
                    id: "col-budget".into(),
                    width: None,
                    hide: None,
                    stat_calc_type: None,
                },
            ],
            filter: None,
            sort: None,
            group_by: None,
            group_properties: vec![],
            header: None,
            date: None,
            card: None,
            ui: None,
            extra: BTreeMap::new(),
        };
        let ids: Vec<&str> = kanban_visible_columns(&view, &data, "col-status")
            .into_iter()
            .map(|c| c.id.as_str())
            .collect();
        assert_eq!(
            ids,
            vec![
                "col-tags",
                "col-progress",
                "col-budget",
                "col-start",
                "col-end"
            ]
        );

        // Reordering `view.columns` and hiding `col-progress` changes card visible fields
        // without truncating at 3 columns (`0.27.5` `kanban/pc/card.ts`).
        view.columns = vec![
            DatabaseViewColumn {
                id: "col-budget".into(),
                width: None,
                hide: None,
                stat_calc_type: None,
            },
            DatabaseViewColumn {
                id: "col-progress".into(),
                width: None,
                hide: Some(true),
                stat_calc_type: None,
            },
            DatabaseViewColumn {
                id: "col-start".into(),
                width: None,
                hide: None,
                stat_calc_type: None,
            },
        ];
        let reordered: Vec<&str> = kanban_visible_columns(&view, &data, "col-status")
            .into_iter()
            .map(|c| c.id.as_str())
            .collect();
        assert_eq!(
            reordered,
            vec!["col-budget", "col-start", "col-tags", "col-end"]
        );
    }
}
