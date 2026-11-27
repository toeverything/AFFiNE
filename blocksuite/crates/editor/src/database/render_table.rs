//! Table view renderer for `affine:database` (`0.27.5` `table/consts.ts` & `table-view-manager.ts`).

use blocksuite_playground_doc::read::{
    DatabaseCellValue, DatabaseColumn, DatabaseData, DatabaseRow, DatabaseView,
};

use crate::{
    block_flow::{FlowRect, InlineAlign, InlineStyle},
    theme::{FONT_SANS, IconPaint, TYPOGRAPHY},
};

use super::{
    DatabaseHitKind, DatabaseHitTarget, InlineAxis, column_icon_name, format_database_created_time,
    format_database_date, format_database_number, format_database_progress, group_database_rows,
    isolate_ltr,
    render::{DatabasePrim, DbRenderCtx},
    resolve_tag_color,
};

const DEFAULT_COLUMN_WIDTH: f32 = 180.0;
const TITLE_DEFAULT_WIDTH: f32 = 220.0;
const MIN_COLUMN_WIDTH: f32 = 65.0;
const HEADER_HEIGHT: f32 = 34.0;
const ROW_HEIGHT: f32 = 34.0;
const GROUP_HEADER_HEIGHT: f32 = 30.0;
const PAD_X: f32 = 8.0;

struct ResolvedTableCol<'a> {
    id: String,
    name: String,
    col_type: String,
    width: f32,
    schema: Option<&'a DatabaseColumn>,
}

pub(super) fn render_table_view(
    ctx: &DbRenderCtx<'_>,
    top_y: f32,
) -> (f32, f32, Vec<DatabasePrim>, Vec<DatabaseHitTarget>) {
    let cols = resolve_visible_columns(ctx.view, ctx.data);
    let total_table_w: f32 = cols.iter().map(|c| c.width).sum::<f32>().max(180.0);
    let inner_avail_w = (ctx.width - 2.0 * PAD_X).max(1.0);
    let start_x = if ctx.direction.is_rtl() && total_table_w < inner_avail_w {
        ctx.width - PAD_X - total_table_w
    } else {
        PAD_X
    };
    let axis = InlineAxis::new(ctx.direction, total_table_w);
    let ordered_col_indices = axis.order_indices(cols.len());

    let mut prims = Vec::new();
    let mut hits = Vec::new();
    let mut y = top_y;

    // 1. Table header row.
    let mut col_x = start_x;
    for &c_idx in &ordered_col_indices {
        let col = &cols[c_idx];
        let cell_rect = FlowRect::new(col_x, y, col.width, HEADER_HEIGHT);
        prims.push(DatabasePrim::Quad {
            rect: cell_rect,
            fill: Some(ctx.palette.background_secondary),
            border: Some(ctx.palette.border),
            radius: 0.0,
            dashed: false,
        });
        let icon_x = if ctx.direction.is_rtl() {
            cell_rect.right() - 22.0
        } else {
            cell_rect.x + 8.0
        };
        prims.push(DatabasePrim::Icon {
            rect: FlowRect::new(icon_x, cell_rect.y + 10.0, 14.0, 14.0),
            icon: IconPaint::named(column_icon_name(&col.col_type)),
            color: ctx.palette.icon,
        });
        let text_x = if ctx.direction.is_rtl() {
            cell_rect.x + 8.0
        } else {
            cell_rect.x + 26.0
        };
        let text_w = (cell_rect.w - 34.0).max(1.0);
        let style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px + 1.0,
            500.0,
            ctx.palette.text_secondary,
        );
        let align = if ctx.direction.is_rtl() {
            InlineAlign::Right
        } else {
            InlineAlign::Left
        };
        prims.push(ctx.single_line_clipped(
            &col.name,
            style,
            text_x,
            cell_rect.y,
            text_w,
            HEADER_HEIGHT,
            align,
        ));
        col_x += col.width;
    }
    y += HEADER_HEIGHT;

    // 2. Rows (optionally grouped by `view.group_by`).
    if let Some(group_by) = &ctx.view.group_by {
        let buckets = group_database_rows(
            ctx.rows,
            group_by,
            &ctx.view.group_properties,
            ctx.data,
            ctx.now_ms,
            ctx.offset_at_ms,
        );
        for bucket in buckets {
            let collapsed = ctx.ui_state.collapsed_groups.contains(&bucket.key);
            let group_rect = FlowRect::new(start_x, y, total_table_w, GROUP_HEADER_HEIGHT);
            prims.push(DatabasePrim::Quad {
                rect: group_rect,
                fill: Some(ctx.palette.background_secondary.opacity(0.6)),
                border: Some(ctx.palette.border),
                radius: 0.0,
                dashed: false,
            });
            let chev_x = if ctx.direction.is_rtl() {
                group_rect.right() - 22.0
            } else {
                group_rect.x + 8.0
            };
            prims.push(DatabasePrim::Chevron {
                rect: FlowRect::new(chev_x, group_rect.y + 8.0, 14.0, 14.0),
                collapsed,
                color: ctx.palette.icon,
            });
            let pill_label = format!("{} ({})", bucket.label, bucket.rows.len());
            let (pill_bg, pill_ink) = bucket
                .color
                .as_deref()
                .map_or((ctx.palette.hover, ctx.palette.text_primary), |c| {
                    resolve_tag_color(c, ctx.theme)
                });
            let label_x = if ctx.direction.is_rtl() {
                group_rect.x + 8.0
            } else {
                group_rect.x + 28.0
            };
            let label_w = (group_rect.w - 36.0).max(1.0);
            let pill_style = InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px, 500.0, pill_ink);
            let (_, pill_layout) =
                ctx.truncate_text(&pill_label, pill_style, (label_w - 12.0).max(1.0), 20.0);
            let pill_w = (pill_layout.content_width().ceil() + 12.0).min(label_w);
            let pill_x = if ctx.direction.is_rtl() {
                group_rect.right() - 28.0 - pill_w
            } else {
                label_x
            };
            prims.push(DatabasePrim::Quad {
                rect: FlowRect::new(pill_x, group_rect.y + 5.0, pill_w, 20.0),
                fill: Some(pill_bg),
                border: None,
                radius: 4.0,
                dashed: false,
            });
            prims.push(DatabasePrim::Text {
                x: pill_x + 6.0,
                y: group_rect.y + 5.0,
                layout: pill_layout,
                clip: Some(FlowRect::new(
                    pill_x + 4.0,
                    group_rect.y + 5.0,
                    (pill_w - 8.0).max(1.0),
                    20.0,
                )),
            });
            hits.push(DatabaseHitTarget {
                rect: group_rect,
                kind: DatabaseHitKind::ToggleGroup {
                    group_key: bucket.key.clone(),
                },
                scrolls_x: true,
            });
            y += GROUP_HEADER_HEIGHT;

            if !collapsed {
                for row in &bucket.rows {
                    render_table_row(
                        ctx,
                        &cols,
                        &ordered_col_indices,
                        row,
                        start_x,
                        y,
                        &mut prims,
                        &mut hits,
                    );
                    y += ROW_HEIGHT;
                }
            }
        }
    } else if ctx.rows.is_empty() {
        let empty_rect = FlowRect::new(start_x, y, total_table_w, ROW_HEIGHT);
        prims.push(DatabasePrim::Quad {
            rect: empty_rect,
            fill: Some(ctx.palette.background),
            border: Some(ctx.palette.border),
            radius: 0.0,
            dashed: false,
        });
        prims.push(ctx.single_line_clipped(
            "No records",
            InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_xs_px + 1.0,
                400.0,
                ctx.palette.text_secondary,
            ),
            empty_rect.x + 10.0,
            empty_rect.y,
            (empty_rect.w - 20.0).max(1.0),
            ROW_HEIGHT,
            InlineAlign::Left,
        ));
        y += ROW_HEIGHT;
    } else {
        for row in ctx.rows {
            render_table_row(
                ctx,
                &cols,
                &ordered_col_indices,
                row,
                start_x,
                y,
                &mut prims,
                &mut hits,
            );
            y += ROW_HEIGHT;
        }
    }

    // 3. Desktop "+ New record" footer row (hidden in mobile read-only mode).
    if !ctx.mobile_readonly {
        let add_rect = FlowRect::new(start_x, y, total_table_w, 30.0);
        prims.push(DatabasePrim::Quad {
            rect: add_rect,
            fill: Some(ctx.palette.background),
            border: Some(ctx.palette.border),
            radius: 0.0,
            dashed: false,
        });
        let add_align = if ctx.direction.is_rtl() {
            InlineAlign::Right
        } else {
            InlineAlign::Left
        };
        prims.push(ctx.single_line_clipped(
            "+ New record",
            InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_xs_px + 1.0,
                400.0,
                ctx.palette.text_secondary,
            ),
            add_rect.x + 10.0,
            add_rect.y,
            (add_rect.w - 20.0).max(1.0),
            30.0,
            add_align,
        ));
        hits.push(DatabaseHitTarget {
            rect: add_rect,
            kind: DatabaseHitKind::AddRow,
            scrolls_x: true,
        });
        y += 30.0;
    }

    let max_scroll_x = (total_table_w + 2.0 * PAD_X - ctx.width).max(0.0).ceil();
    (y - top_y, max_scroll_x, prims, hits)
}

#[allow(clippy::too_many_arguments)]
fn render_table_row(
    ctx: &DbRenderCtx<'_>,
    cols: &[ResolvedTableCol<'_>],
    ordered_col_indices: &[usize],
    row: &DatabaseRow,
    start_x: f32,
    y: f32,
    prims: &mut Vec<DatabasePrim>,
    hits: &mut Vec<DatabaseHitTarget>,
) {
    let align = if ctx.direction.is_rtl() {
        InlineAlign::Right
    } else {
        InlineAlign::Left
    };
    let mut cell_x = start_x;
    for &c_idx in ordered_col_indices {
        let col = &cols[c_idx];
        let cell_rect = FlowRect::new(cell_x, y, col.width, ROW_HEIGHT);
        prims.push(DatabasePrim::Quad {
            rect: cell_rect,
            fill: Some(ctx.palette.background),
            border: Some(ctx.palette.border),
            radius: 0.0,
            dashed: false,
        });
        let inner_x = cell_rect.x + 8.0;
        let inner_w = (cell_rect.w - 16.0).max(1.0);
        let cell_val = ctx.data.cells.get(&(row.row_id.clone(), col.id.clone()));

        match col.col_type.as_str() {
            "title" => {
                let text = if row.title.plain.is_empty() {
                    "Untitled"
                } else {
                    row.title.plain.as_str()
                };
                let ink = if row.title.plain.is_empty() {
                    ctx.palette.placeholder
                } else {
                    ctx.palette.text_primary
                };
                prims.push(ctx.single_line_clipped(
                    text,
                    InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_sm_px, 500.0, ink),
                    inner_x,
                    cell_rect.y,
                    inner_w,
                    ROW_HEIGHT,
                    align,
                ));
                if ctx.mobile_readonly {
                    hits.push(DatabaseHitTarget {
                        rect: cell_rect,
                        kind: DatabaseHitKind::CellReadOnly,
                        scrolls_x: true,
                    });
                }
            }
            "select" | "multi-select" => {
                let ids = cell_val
                    .map(DatabaseCellValue::as_string_list)
                    .unwrap_or_default();
                let options = col
                    .schema
                    .map(DatabaseColumn::select_options)
                    .unwrap_or_default();
                let mut px_cursor = inner_x;
                for opt_id in ids {
                    let (label, color) = options
                        .iter()
                        .find(|o| o.id == opt_id || o.value == opt_id)
                        .map_or((opt_id.as_str(), "var(--affine-tag-gray)"), |o| {
                            (o.value.as_str(), o.color.as_str())
                        });
                    let (bg, ink) = resolve_tag_color(color, ctx.theme);
                    let style = InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px, 500.0, ink);
                    let max_text_w = (inner_w - 12.0).max(1.0);
                    let (_, measured) = ctx.truncate_text(label, style, max_text_w, 20.0);
                    let pill_w = (measured.content_width().ceil() + 12.0).min(inner_w);
                    if px_cursor + pill_w > cell_rect.right() - 6.0 && px_cursor > inner_x {
                        break;
                    }
                    let pill_rect = FlowRect::new(px_cursor, cell_rect.y + 7.0, pill_w, 20.0);
                    prims.push(DatabasePrim::Quad {
                        rect: pill_rect,
                        fill: Some(bg),
                        border: None,
                        radius: 4.0,
                        dashed: false,
                    });
                    prims.push(DatabasePrim::Text {
                        x: pill_rect.x + 6.0,
                        y: pill_rect.y,
                        layout: measured,
                        clip: Some(FlowRect::new(
                            pill_rect.x + 4.0,
                            pill_rect.y,
                            (pill_rect.w - 8.0).max(1.0),
                            20.0,
                        )),
                    });
                    px_cursor += pill_w + 4.0;
                }
                if ctx.mobile_readonly {
                    hits.push(DatabaseHitTarget {
                        rect: cell_rect,
                        kind: DatabaseHitKind::CellReadOnly,
                        scrolls_x: true,
                    });
                }
            }
            "checkbox" => {
                let checked = cell_val
                    .and_then(DatabaseCellValue::as_bool)
                    .unwrap_or(false);
                let box_x = if ctx.direction.is_rtl() {
                    cell_rect.right() - 26.0
                } else {
                    inner_x
                };
                let icon_name = if checked {
                    "CheckBoxCheckSolidIcon"
                } else {
                    "CheckBoxUnIcon"
                };
                prims.push(DatabasePrim::Icon {
                    rect: FlowRect::new(box_x, cell_rect.y + 8.0, 18.0, 18.0),
                    icon: IconPaint::named(icon_name),
                    color: if checked {
                        ctx.palette.brand
                    } else {
                        ctx.palette.icon
                    },
                });
                hits.push(DatabaseHitTarget {
                    rect: cell_rect,
                    kind: if ctx.mobile_readonly {
                        DatabaseHitKind::CellReadOnly
                    } else {
                        DatabaseHitKind::ToggleCheckbox {
                            row_id: row.row_id.clone(),
                            column_id: col.id.clone(),
                            current: checked,
                        }
                    },
                    scrolls_x: true,
                });
            }
            "progress" => {
                let raw = cell_val.and_then(DatabaseCellValue::as_i64).unwrap_or(0);
                let (ratio, label) = format_database_progress(raw);
                let bar_w = (inner_w - 42.0).max(24.0);
                let bar_y = cell_rect.y + 13.0;
                prims.push(DatabasePrim::Quad {
                    rect: FlowRect::new(inner_x, bar_y, bar_w, 8.0),
                    fill: Some(ctx.palette.background_secondary),
                    border: Some(ctx.palette.border),
                    radius: 4.0,
                    dashed: false,
                });
                if ratio > 0.0 {
                    prims.push(DatabasePrim::Quad {
                        rect: FlowRect::new(inner_x, bar_y, (bar_w * ratio).max(4.0), 8.0),
                        fill: Some(ctx.palette.brand),
                        border: None,
                        radius: 4.0,
                        dashed: false,
                    });
                }
                prims.push(ctx.single_line_clipped(
                    &label,
                    InlineStyle::new(
                        FONT_SANS,
                        TYPOGRAPHY.font_xs_px,
                        500.0,
                        ctx.palette.text_secondary,
                    ),
                    inner_x + bar_w + 6.0,
                    cell_rect.y,
                    36.0,
                    ROW_HEIGHT,
                    InlineAlign::Right,
                ));
                if ctx.mobile_readonly {
                    hits.push(DatabaseHitTarget {
                        rect: cell_rect,
                        kind: DatabaseHitKind::CellReadOnly,
                        scrolls_x: true,
                    });
                }
            }
            "number" => {
                if let Some(val) = cell_val.and_then(DatabaseCellValue::as_f64) {
                    let fmt = col
                        .schema
                        .and_then(|c| c.data.get("format"))
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("number");
                    let dec = col
                        .schema
                        .and_then(|c| c.data.get("decimal"))
                        .and_then(serde_json::Value::as_u64)
                        .map(|d| d as usize);
                    let formatted = format_database_number(val, fmt, dec);
                    prims.push(ctx.single_line_clipped(
                        &formatted,
                        InlineStyle::new(
                            FONT_SANS,
                            TYPOGRAPHY.font_sm_px,
                            400.0,
                            ctx.palette.text_primary,
                        ),
                        inner_x,
                        cell_rect.y,
                        inner_w,
                        ROW_HEIGHT,
                        InlineAlign::Right,
                    ));
                }
                if ctx.mobile_readonly {
                    hits.push(DatabaseHitTarget {
                        rect: cell_rect,
                        kind: DatabaseHitKind::CellReadOnly,
                        scrolls_x: true,
                    });
                }
            }
            "date" => {
                if let Some(ts) = cell_val.and_then(DatabaseCellValue::as_i64) {
                    let formatted = format_database_date(ts, (ctx.offset_at_ms)(ts));
                    prims.push(ctx.single_line_clipped(
                        &formatted,
                        InlineStyle::new(
                            FONT_SANS,
                            TYPOGRAPHY.font_sm_px,
                            400.0,
                            ctx.palette.text_primary,
                        ),
                        inner_x,
                        cell_rect.y,
                        inner_w,
                        ROW_HEIGHT,
                        align,
                    ));
                }
                if ctx.mobile_readonly {
                    hits.push(DatabaseHitTarget {
                        rect: cell_rect,
                        kind: DatabaseHitKind::CellReadOnly,
                        scrolls_x: true,
                    });
                }
            }
            "created-time" => {
                if let Some(ts) = row.created_at {
                    let formatted = format_database_created_time(ts, (ctx.offset_at_ms)(ts));
                    prims.push(ctx.single_line_clipped(
                        &formatted,
                        InlineStyle::new(
                            FONT_SANS,
                            TYPOGRAPHY.font_xs_px + 1.0,
                            400.0,
                            ctx.palette.text_secondary,
                        ),
                        inner_x,
                        cell_rect.y,
                        inner_w,
                        ROW_HEIGHT,
                        align,
                    ));
                }
            }
            "link" => {
                if let Some(url) = cell_val.and_then(DatabaseCellValue::as_str)
                    && !url.is_empty()
                {
                    let formatted = isolate_ltr(url);
                    prims.push(ctx.single_line_clipped(
                        &formatted,
                        InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_sm_px, 400.0, ctx.palette.link),
                        inner_x,
                        cell_rect.y,
                        inner_w,
                        ROW_HEIGHT,
                        align,
                    ));
                }
                if ctx.mobile_readonly {
                    hits.push(DatabaseHitTarget {
                        rect: cell_rect,
                        kind: DatabaseHitKind::CellReadOnly,
                        scrolls_x: true,
                    });
                }
            }
            _ => {
                let text = match cell_val {
                    Some(DatabaseCellValue::RichText(rt)) => rt.plain.clone(),
                    Some(DatabaseCellValue::Text(s)) => s.clone(),
                    Some(DatabaseCellValue::Integer(n)) => isolate_ltr(&n.to_string()),
                    Some(DatabaseCellValue::Number(n)) => isolate_ltr(&n.to_string()),
                    Some(DatabaseCellValue::Bool(b)) => b.to_string(),
                    Some(DatabaseCellValue::MultiSelect(v)) => v.join(", "),
                    Some(DatabaseCellValue::Json(v)) if !v.is_null() => v.to_string(),
                    _ => String::new(),
                };
                if !text.is_empty() {
                    prims.push(ctx.single_line_clipped(
                        &text,
                        InlineStyle::new(
                            FONT_SANS,
                            TYPOGRAPHY.font_sm_px,
                            400.0,
                            ctx.palette.text_primary,
                        ),
                        inner_x,
                        cell_rect.y,
                        inner_w,
                        ROW_HEIGHT,
                        align,
                    ));
                }
                if ctx.mobile_readonly {
                    hits.push(DatabaseHitTarget {
                        rect: cell_rect,
                        kind: DatabaseHitKind::CellReadOnly,
                        scrolls_x: true,
                    });
                }
            }
        }
        cell_x += col.width;
    }
}

fn resolve_visible_columns<'a>(
    view: &'a DatabaseView,
    data: &'a DatabaseData,
) -> Vec<ResolvedTableCol<'a>> {
    let mut result = Vec::new();
    let title_col_id = view
        .header
        .as_ref()
        .and_then(|h| h.title_column.as_deref())
        .or_else(|| {
            data.columns
                .iter()
                .find(|c| c.column_type == "title")
                .map(|c| c.id.as_str())
        })
        .unwrap_or("title");

    // Always place the title column first if not explicitly hidden.
    let title_view_col = view.columns.iter().find(|c| c.id == title_col_id);
    if !title_view_col.is_some_and(|c| c.hide == Some(true)) {
        let title_schema = data.columns.iter().find(|c| c.id == title_col_id);
        let title_w = title_view_col
            .and_then(|c| c.width)
            .map_or(TITLE_DEFAULT_WIDTH, |w| (w as f32).max(MIN_COLUMN_WIDTH));
        result.push(ResolvedTableCol {
            id: title_col_id.to_string(),
            name: title_schema
                .map(|c| c.name.clone())
                .filter(|n| !n.is_empty())
                .unwrap_or_else(|| "Title".to_string()),
            col_type: "title".to_string(),
            width: title_w.round(),
            schema: title_schema,
        });
    }

    // Add ordered view columns, then any remaining schema columns.
    let mut seen: Vec<String> = result.iter().map(|c| c.id.clone()).collect();
    for vc in &view.columns {
        if seen.contains(&vc.id) || vc.id == "type" {
            continue;
        }
        seen.push(vc.id.clone());
        if vc.hide == Some(true) {
            continue;
        }
        let Some(schema) = data.columns.iter().find(|c| c.id == vc.id) else {
            continue;
        };
        let w = vc
            .width
            .map_or(DEFAULT_COLUMN_WIDTH, |w| (w as f32).max(MIN_COLUMN_WIDTH));
        result.push(ResolvedTableCol {
            id: schema.id.clone(),
            name: schema.name.clone(),
            col_type: schema.column_type.clone(),
            width: w.round(),
            schema: Some(schema),
        });
    }
    for schema in &data.columns {
        if seen.contains(&schema.id) || schema.column_type == "title" {
            continue;
        }
        seen.push(schema.id.clone());
        result.push(ResolvedTableCol {
            id: schema.id.clone(),
            name: schema.name.clone(),
            col_type: schema.column_type.clone(),
            width: DEFAULT_COLUMN_WIDTH,
            schema: Some(schema),
        });
    }
    result
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
    fn table_resolve_visible_columns_excludes_hidden_view_columns() {
        let data = DatabaseData {
            title: RichText {
                plain: "T".into(),
                delta: vec![],
            },
            columns: vec![
                DatabaseColumn {
                    id: "title".into(),
                    column_type: "title".into(),
                    name: "Title".into(),
                    data: json!({}),
                },
                DatabaseColumn {
                    id: "col-visible".into(),
                    column_type: "select".into(),
                    name: "Status".into(),
                    data: json!({}),
                },
                DatabaseColumn {
                    id: "col-hidden".into(),
                    column_type: "date".into(),
                    name: "End".into(),
                    data: json!({}),
                },
                DatabaseColumn {
                    id: "col-extra".into(),
                    column_type: "number".into(),
                    name: "Score".into(),
                    data: json!({}),
                },
            ],
            views: vec![],
            cells: BTreeMap::new(),
            rows: vec![],
        };
        let view = DatabaseView {
            id: "v-table".into(),
            name: "Table".into(),
            mode: DatabaseViewMode::Table,
            columns: vec![
                DatabaseViewColumn {
                    id: "title".into(),
                    width: Some(180.0),
                    hide: None,
                    stat_calc_type: None,
                },
                DatabaseViewColumn {
                    id: "col-visible".into(),
                    width: Some(120.0),
                    hide: None,
                    stat_calc_type: None,
                },
                DatabaseViewColumn {
                    id: "col-hidden".into(),
                    width: Some(120.0),
                    hide: Some(true),
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
        let ids: Vec<String> = resolve_visible_columns(&view, &data)
            .into_iter()
            .map(|c| c.id)
            .collect();
        assert_eq!(ids, vec!["title", "col-visible", "col-extra"]);
        assert!(
            !ids.iter().any(|id| id == "col-hidden"),
            "hidden view column must not reappear via schema fallback"
        );
    }
}
