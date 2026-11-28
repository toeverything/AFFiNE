//! Table view renderer for `affine:database` (`0.27.5` `table/consts.ts` & `table-view-manager.ts`).

use blocksuite_playground_doc::read::{DatabaseCellValue, DatabaseColumn, DatabaseRow};

use crate::{
    block_flow::{FlowRect, InlineAlign, InlineStyle},
    theme::{FONT_SANS, IconPaint, TYPOGRAPHY},
};

use super::{
    DatabaseAuthoringHit, DatabaseAuthoringHitKind, DatabaseHitKind, DatabaseHitTarget, InlineAxis,
    cell_editor::is_editable_column_type,
    column_icon_name,
    column_ops::{MIN_COLUMN_WIDTH, ResolvedTableCol, resolve_visible_columns},
    format_database_created_time, format_database_date, format_database_number,
    format_database_progress, group_database_rows, isolate_ltr,
    render::{DatabasePrim, DbRenderCtx},
    resolve_tag_color,
};

const HEADER_HEIGHT: f32 = 34.0;
const ROW_HEIGHT: f32 = 34.0;
const GROUP_HEADER_HEIGHT: f32 = 30.0;
const PAD_X: f32 = 8.0;

pub(super) fn render_table_view(
    ctx: &DbRenderCtx<'_>,
    top_y: f32,
) -> (
    f32,
    f32,
    Vec<DatabasePrim>,
    Vec<DatabaseHitTarget>,
    Vec<DatabaseAuthoringHit>,
    Option<(f32, f32)>,
) {
    let mut cols = resolve_visible_columns(ctx.view, ctx.data);
    if let Some(resize) = &ctx.ui_state.authoring.column_resize {
        if let Some(col) = cols.iter_mut().find(|c| c.id == resize.column_id) {
            col.width = (resize.preview_width_px as f32).max(MIN_COLUMN_WIDTH);
        }
    }
    let add_col_w = if ctx.mobile_readonly {
        0.0_f32
    } else {
        34.0_f32
    };
    let total_table_w: f32 = cols.iter().map(|c| c.width).sum::<f32>().max(180.0) + add_col_w;
    let inner_avail_w = (ctx.width - 2.0 * PAD_X).max(1.0);
    let start_x = if ctx.direction.is_rtl() && total_table_w < inner_avail_w {
        ctx.width - PAD_X - total_table_w
    } else {
        PAD_X
    };
    let axis = InlineAxis::new(ctx.direction, total_table_w - add_col_w);
    let ordered_col_indices = axis.order_indices(cols.len());

    let mut prims = Vec::new();
    let mut hits = Vec::new();
    let mut authoring_hits = Vec::new();
    let mut popover_anchor = None;
    let mut y = top_y;

    // 1. Table header row.
    let mut col_x = start_x;
    for &c_idx in &ordered_col_indices {
        let col = &cols[c_idx];
        let cell_rect = FlowRect::new(col_x, y, col.width, HEADER_HEIGHT);
        let menu_open = ctx
            .ui_state
            .authoring
            .column_menu
            .as_ref()
            .is_some_and(|m| m.column_id == col.id);
        prims.push(DatabasePrim::Quad {
            rect: cell_rect,
            fill: Some(if menu_open {
                ctx.palette.hover
            } else {
                ctx.palette.background_secondary
            }),
            border: Some(if menu_open {
                ctx.palette.brand
            } else {
                ctx.palette.border
            }),
            radius: 0.0,
            dashed: false,
        });
        let (icon_x, text_x, align) = if ctx.direction.is_rtl() {
            (
                cell_rect.right() - 22.0,
                cell_rect.x + 8.0,
                InlineAlign::Right,
            )
        } else {
            (cell_rect.x + 8.0, cell_rect.x + 26.0, InlineAlign::Left)
        };
        prims.push(DatabasePrim::Icon {
            rect: FlowRect::new(icon_x, cell_rect.y + 10.0, 14.0, 14.0),
            icon: IconPaint::named(column_icon_name(&col.col_type)),
            color: if menu_open {
                ctx.palette.brand
            } else {
                ctx.palette.icon
            },
        });
        let ink = if menu_open {
            ctx.palette.text_primary
        } else {
            ctx.palette.text_secondary
        };
        prims.push(ctx.single_line_clipped(
            &col.name,
            InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px + 1.0, 500.0, ink),
            text_x,
            cell_rect.y,
            (cell_rect.w - 34.0).max(1.0),
            HEADER_HEIGHT,
            align,
        ));
        if !ctx.mobile_readonly {
            if menu_open {
                popover_anchor = Some((cell_rect.x, cell_rect.bottom() + 2.0));
            }
            authoring_hits.push(DatabaseAuthoringHit {
                rect: FlowRect::new(
                    cell_rect.x + 4.0,
                    cell_rect.y,
                    (cell_rect.w - 8.0).max(1.0),
                    HEADER_HEIGHT,
                ),
                kind: DatabaseAuthoringHitKind::OpenColumnMenu {
                    column_id: col.id.clone(),
                },
                scrolls_x: true,
            });
            authoring_hits.push(DatabaseAuthoringHit {
                rect: FlowRect::new(cell_rect.right() - 4.0, cell_rect.y, 8.0, HEADER_HEIGHT),
                kind: DatabaseAuthoringHitKind::ResizeColumnHandle {
                    column_id: col.id.clone(),
                    current_width_px: col.width.round() as i32,
                },
                scrolls_x: true,
            });
        }
        col_x += col.width;
    }
    if !ctx.mobile_readonly {
        let add_col_rect = FlowRect::new(col_x, y, add_col_w, HEADER_HEIGHT);
        prims.push(DatabasePrim::Quad {
            rect: add_col_rect,
            fill: Some(ctx.palette.background_secondary),
            border: Some(ctx.palette.border),
            radius: 0.0,
            dashed: false,
        });
        prims.push(DatabasePrim::Icon {
            rect: FlowRect::new(add_col_rect.x + 10.0, add_col_rect.y + 10.0, 14.0, 14.0),
            icon: IconPaint::named("PlusIcon"),
            color: ctx.palette.icon,
        });
        authoring_hits.push(DatabaseAuthoringHit {
            rect: add_col_rect,
            kind: DatabaseAuthoringHitKind::AddColumn,
            scrolls_x: true,
        });
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
                    y += render_table_row(
                        ctx,
                        &cols,
                        &ordered_col_indices,
                        row,
                        start_x,
                        y,
                        &mut prims,
                        &mut hits,
                        &mut authoring_hits,
                        &mut popover_anchor,
                    );
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
            y += render_table_row(
                ctx,
                &cols,
                &ordered_col_indices,
                row,
                start_x,
                y,
                &mut prims,
                &mut hits,
                &mut authoring_hits,
                &mut popover_anchor,
            );
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
    (
        y - top_y,
        max_scroll_x,
        prims,
        hits,
        authoring_hits,
        popover_anchor,
    )
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
    authoring_hits: &mut Vec<DatabaseAuthoringHit>,
    popover_anchor: &mut Option<(f32, f32)>,
) -> f32 {
    let align = if ctx.direction.is_rtl() {
        InlineAlign::Right
    } else {
        InlineAlign::Left
    };
    // Pre-lay out rich-text & title cells so multi-line rich cells expand the row height cleanly.
    let (rich_layouts, row_h) = super::cell_editor::prelayout_table_row_rich_cells(
        ctx,
        cols,
        ordered_col_indices,
        row,
        ROW_HEIGHT,
        align,
    );

    let mut cell_x = start_x;
    for (slot_idx, &c_idx) in ordered_col_indices.iter().enumerate() {
        let col = &cols[c_idx];
        let cell_rect = FlowRect::new(cell_x, y, col.width, row_h);
        let active_ed = ctx
            .ui_state
            .authoring
            .active_cell
            .as_ref()
            .filter(|e| e.row_id == row.row_id && e.column_id == col.id);
        let border_color = match active_ed {
            Some(ed) if ed.error.is_some() => ctx
                .theme
                .css_var("--affine-v2-status-error")
                .unwrap_or(ctx.palette.brand),
            Some(_) => ctx.palette.brand,
            None => ctx.palette.border,
        };
        prims.push(DatabasePrim::Quad {
            rect: cell_rect,
            fill: Some(ctx.palette.background),
            border: Some(border_color),
            radius: 0.0,
            dashed: false,
        });
        let inner_x = cell_rect.x + 8.0;
        let inner_w = (cell_rect.w - 16.0).max(1.0);
        if let Some(ed) = active_ed {
            if matches!(col.col_type.as_str(), "select" | "multi-select") {
                *popover_anchor = Some((cell_rect.x, cell_rect.bottom() + 2.0));
            } else {
                let draft_text = if let Some(err) = &ed.error {
                    err.as_str()
                } else {
                    ed.draft.as_str()
                };
                let ink = if ed.error.is_some() {
                    border_color
                } else {
                    ctx.palette.text_primary
                };
                prims.push(ctx.single_line_clipped(
                    draft_text,
                    InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_sm_px, 400.0, ink),
                    inner_x,
                    cell_rect.y,
                    inner_w,
                    ROW_HEIGHT,
                    align,
                ));
                cell_x += col.width;
                continue;
            }
        }
        if !ctx.mobile_readonly
            && is_editable_column_type(&col.col_type)
            && col.col_type != "checkbox"
        {
            authoring_hits.push(DatabaseAuthoringHit {
                rect: cell_rect,
                kind: DatabaseAuthoringHitKind::EditCell {
                    row_id: row.row_id.clone(),
                    column_id: col.id.clone(),
                    col_type: col.col_type.clone(),
                },
                scrolls_x: true,
            });
        }
        let cell_val = ctx.data.cells.get(&(row.row_id.clone(), col.id.clone()));

        match col.col_type.as_str() {
            "title" => {
                if let Some(laid) = rich_layouts[slot_idx].clone() {
                    prims.push(super::cell_editor::rich_cell_prim(
                        laid, inner_x, inner_w, cell_rect,
                    ));
                } else {
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
                        row_h,
                        align,
                    ));
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
                let raw = ctx
                    .ui_state
                    .authoring
                    .progress_preview
                    .as_ref()
                    .filter(|p| p.row_id == row.row_id && p.column_id == col.id)
                    .map_or_else(
                        || cell_val.and_then(DatabaseCellValue::as_i64).unwrap_or(0),
                        |p| p.value,
                    );
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
                if !ctx.mobile_readonly {
                    authoring_hits.push(DatabaseAuthoringHit {
                        rect: FlowRect::new(inner_x, cell_rect.y + 4.0, bar_w, ROW_HEIGHT - 8.0),
                        kind: DatabaseAuthoringHitKind::SetProgress {
                            row_id: row.row_id.clone(),
                            column_id: col.id.clone(),
                        },
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
            }
            _ => {
                if let Some(laid) = rich_layouts[slot_idx].clone() {
                    prims.push(super::cell_editor::rich_cell_prim(
                        laid, inner_x, inner_w, cell_rect,
                    ));
                } else {
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
                            row_h,
                            align,
                        ));
                    }
                }
            }
        }
        if ctx.mobile_readonly && !matches!(col.col_type.as_str(), "checkbox" | "created-time") {
            hits.push(DatabaseHitTarget {
                rect: cell_rect,
                kind: DatabaseHitKind::CellReadOnly,
                scrolls_x: true,
            });
        }
        cell_x += col.width;
    }
    if ctx.mobile_readonly {
        hits.push(DatabaseHitTarget {
            rect: FlowRect::new(start_x, y, (cell_x - start_x).max(1.0), row_h),
            kind: DatabaseHitKind::OpenRecord {
                row_id: row.row_id.clone(),
            },
            scrolls_x: true,
        });
    }
    row_h
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

    #[test]
    fn resolve_visible_columns_omits_fake_title_when_schema_has_no_title_column() {
        let legacy_no_title = DatabaseData {
            title: RichText::default(),
            columns: vec![
                DatabaseColumn {
                    id: "c-rich".into(),
                    column_type: "rich-text".into(),
                    name: "Notes".into(),
                    data: json!({}),
                },
                DatabaseColumn {
                    id: "c-num".into(),
                    column_type: "number".into(),
                    name: "Amount".into(),
                    data: json!({}),
                },
            ],
            views: vec![],
            cells: BTreeMap::new(),
            rows: vec![],
        };
        let empty_view = DatabaseView {
            id: "v-table".into(),
            name: "Table".into(),
            mode: DatabaseViewMode::Table,
            columns: vec![],
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
        let ids: Vec<String> = resolve_visible_columns(&empty_view, &legacy_no_title)
            .into_iter()
            .map(|c| c.id)
            .collect();
        assert_eq!(ids, vec!["c-rich", "c-num"]);

        // Degenerate empty-schema database still synthesizes fallback "title" column.
        let degenerate = DatabaseData {
            title: RichText::default(),
            columns: vec![],
            views: vec![],
            cells: BTreeMap::new(),
            rows: vec![],
        };
        let fallback_ids: Vec<String> = resolve_visible_columns(&empty_view, &degenerate)
            .into_iter()
            .map(|c| c.id)
            .collect();
        assert_eq!(fallback_ids, vec!["title"]);
    }
}
