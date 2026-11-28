//! Top view control bar (`Filter` / `Sort` / `Group by`) and interactive rule popovers for
//! `affine:database`, persisting rules directly to `DataView` JSON (`0.27.5` wire format).

use blocksuite_playground_doc::read::{DatabaseColumn, DatabaseGroupBy, DatabaseView};
use serde_json::{Value as JsonValue, json};

use crate::{
    block_flow::{FlowRect, InlineAlign, InlineStyle},
    theme::{FONT_SANS, TYPOGRAPHY},
};

use super::{
    InlineAxis,
    authoring::{ActiveToolbarPanel, DatabaseAuthoringHit, DatabaseAuthoringHitKind},
    render::{DatabasePrim, DbRenderCtx},
};

/// One parsed filter rule from `view.filter.conditions`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FilterRuleItem {
    pub column_id: String,
    pub function: String,
    pub value: String,
}

/// One parsed sort rule from `view.sort.sortBy`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SortRuleItem {
    pub column_id: String,
    pub desc: bool,
}

/// Supported filter operators exposed in the Filter bar (`0.27.5` wire function names).
pub const FILTER_OPERATORS: [(&str, &str); 6] = [
    ("is", "is"),
    ("isNot", "is not"),
    ("contains", "contains"),
    ("isEmpty", "is empty"),
    ("greatThan", ">"),
    ("lessThan", "<"),
];

pub fn filter_op_label(func: &str) -> &'static str {
    FILTER_OPERATORS
        .iter()
        .find(|(id, _)| *id == func)
        .map_or("is", |(_, label)| *label)
}

/// Parse flat filter rules from `view.filter` (`{ type: "group", op: "and", conditions: [...] }`).
pub fn parse_filter_rules(filter: Option<&JsonValue>) -> Vec<FilterRuleItem> {
    let Some(conditions) = filter
        .and_then(|f| f.get("conditions"))
        .and_then(JsonValue::as_array)
    else {
        return Vec::new();
    };
    conditions
        .iter()
        .filter_map(|c| {
            let col_id = c.get("left")?.get("name")?.as_str()?.to_string();
            let func = c.get("function")?.as_str()?.to_string();
            let value = c
                .get("args")
                .and_then(JsonValue::as_array)
                .and_then(|a| a.first())
                .and_then(|v| v.get("value"))
                .map(|v| match v {
                    JsonValue::String(s) => s.clone(),
                    JsonValue::Number(n) => n.to_string(),
                    JsonValue::Bool(b) => b.to_string(),
                    _ => String::new(),
                })
                .unwrap_or_default();
            Some(FilterRuleItem {
                column_id: col_id,
                function: func,
                value,
            })
        })
        .collect()
}

/// Serialize `FilterRuleItem` list into BlockSuite `0.27.5` `FilterGroup` JSON.
pub fn build_filter_json(rules: &[FilterRuleItem], columns: &[DatabaseColumn]) -> JsonValue {
    let conditions: Vec<JsonValue> = rules
        .iter()
        .map(|r| {
            let col_type = columns
                .iter()
                .find(|c| c.id == r.column_id)
                .map_or("rich-text", |c| c.column_type.as_str());
            let args = if matches!(r.function.as_str(), "isEmpty" | "isNotEmpty") {
                Vec::new()
            } else {
                let val_json = match col_type {
                    "number" | "progress" => r
                        .value
                        .trim()
                        .parse::<f64>()
                        .ok()
                        .and_then(serde_json::Number::from_f64)
                        .map_or_else(|| json!(r.value), JsonValue::Number),
                    "checkbox" => json!(matches!(
                        r.value.trim().to_ascii_lowercase().as_str(),
                        "true" | "1" | "yes"
                    )),
                    _ => json!(r.value),
                };
                vec![json!({ "type": "constant", "value": val_json })]
            };
            json!({
                "type": "filter",
                "left": { "type": "ref", "name": r.column_id },
                "function": r.function,
                "args": args,
            })
        })
        .collect();
    json!({
        "type": "group",
        "op": "and",
        "conditions": conditions,
    })
}

/// Parse sort rules from `view.sort` (`{ sortBy: [{ ref: { name }, desc }] }`).
pub fn parse_sort_rules(sort: Option<&JsonValue>) -> Vec<SortRuleItem> {
    let Some(list) = sort
        .and_then(|s| s.get("sortBy"))
        .and_then(JsonValue::as_array)
    else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|r| {
            let col_id = r.get("ref")?.get("name")?.as_str()?.to_string();
            let desc = r.get("desc").and_then(JsonValue::as_bool).unwrap_or(false);
            Some(SortRuleItem {
                column_id: col_id,
                desc,
            })
        })
        .collect()
}

/// Serialize `SortRuleItem` list into BlockSuite `0.27.5` `view.sort` JSON.
pub fn build_sort_json(rules: &[SortRuleItem]) -> JsonValue {
    let sort_by: Vec<JsonValue> = rules
        .iter()
        .map(|r| {
            json!({
                "ref": { "type": "ref", "name": r.column_id },
                "desc": r.desc,
            })
        })
        .collect();
    json!({ "sortBy": sort_by })
}

/// Build a `DatabaseGroupBy` struct for a column id (`0.27.5` `group-by/define.ts`).
pub fn build_group_by_for_column(col: &DatabaseColumn) -> DatabaseGroupBy {
    let name = match col.column_type.as_str() {
        "select" => "select",
        "multi-select" => "multi-select",
        "checkbox" => "checkbox",
        "number" | "progress" => "number",
        "date" => "date-month",
        _ => "text",
    };
    DatabaseGroupBy {
        kind: "groupBy".to_string(),
        column_id: col.id.clone(),
        name: name.to_string(),
        sort: None,
        hide_empty: None,
    }
}

fn column_name_for<'a>(view_cols: &'a [DatabaseColumn], col_id: &'a str) -> &'a str {
    if col_id == "title" {
        return view_cols
            .iter()
            .find(|c| c.id == "title" || c.column_type == "title")
            .map_or("Title", |c| c.name.as_str());
    }
    view_cols
        .iter()
        .find(|c| c.id == col_id)
        .map_or(col_id, |c| c.name.as_str())
}

/// Render the desktop view control bar (`Filter`, `Sort`, `Group by` buttons + active rule chips
/// + any open dropdown panel cleanly above view content). Returns the updated vertical `y`.
#[allow(clippy::too_many_arguments)]
pub(super) fn render_view_toolbar(
    ctx: &DbRenderCtx<'_>,
    view: &DatabaseView,
    start_y: f32,
    prims: &mut Vec<DatabasePrim>,
    authoring_hits: &mut Vec<DatabaseAuthoringHit>,
) -> f32 {
    if ctx.mobile_readonly {
        return start_y;
    }

    let filter_rules = parse_filter_rules(view.filter.as_ref());
    let sort_rules = parse_sort_rules(view.sort.as_ref());
    let active_panel = ctx.ui_state.authoring.toolbar_panel;

    let strip_left = 8.0_f32;
    let strip_right = (ctx.width - 8.0).max(strip_left + 1.0);
    let axis = InlineAxis::new(ctx.direction, ctx.width);
    let btn_h = 26.0_f32;
    let gap = 6.0_f32;
    let mut cursor = strip_left;
    let mut y = start_y;
    let mut panel_anchor = None;

    let filter_label = if filter_rules.is_empty() {
        "Filter".to_string()
    } else {
        format!("Filter ({})", filter_rules.len())
    };
    let sort_label = if sort_rules.is_empty() {
        "Sort".to_string()
    } else {
        format!("Sort ({})", sort_rules.len())
    };
    let group_label = match &view.group_by {
        Some(gb) => format!(
            "Group: {}",
            column_name_for(&ctx.data.columns, &gb.column_id)
        ),
        None => "Group by".to_string(),
    };

    let buttons = [
        (
            ActiveToolbarPanel::Filter,
            filter_label,
            !filter_rules.is_empty(),
            DatabaseAuthoringHitKind::ToolbarToggleFilter,
        ),
        (
            ActiveToolbarPanel::Sort,
            sort_label,
            !sort_rules.is_empty(),
            DatabaseAuthoringHitKind::ToolbarToggleSort,
        ),
        (
            ActiveToolbarPanel::GroupBy,
            group_label,
            view.group_by.is_some(),
            DatabaseAuthoringHitKind::ToolbarToggleGroupBy,
        ),
    ];

    for (panel_kind, label, is_active_rule, hit_kind) in buttons {
        let is_open = active_panel == Some(panel_kind);
        let style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            500.0,
            if is_open || is_active_rule {
                ctx.palette.brand
            } else {
                ctx.palette.text_secondary
            },
        );
        let (_, layout) = ctx.truncate_text(&label, style, 140.0, btn_h);
        let btn_w = (layout.content_width().ceil() + 20.0).clamp(58.0, 160.0);
        if cursor + btn_w > strip_right && cursor > strip_left {
            cursor = strip_left;
            y += btn_h + 6.0;
        }
        let rect = axis.map_rect(FlowRect::new(cursor, y, btn_w, btn_h));
        prims.push(DatabasePrim::Quad {
            rect,
            fill: Some(if is_open {
                ctx.palette.brand.opacity(0.14)
            } else if is_active_rule {
                ctx.palette.brand.opacity(0.08)
            } else {
                ctx.palette.background_secondary
            }),
            border: Some(if is_open || is_active_rule {
                ctx.palette.brand.opacity(0.55)
            } else {
                ctx.palette.border
            }),
            radius: 6.0,
            dashed: false,
        });
        prims.push(DatabasePrim::Text {
            x: rect.x + 10.0,
            y: rect.y,
            layout,
            clip: Some(FlowRect::new(
                rect.x + 6.0,
                rect.y,
                (rect.w - 12.0).max(1.0),
                btn_h,
            )),
        });
        authoring_hits.push(DatabaseAuthoringHit {
            rect,
            kind: hit_kind,
            scrolls_x: false,
        });
        if is_open {
            panel_anchor = Some((rect.x, rect.bottom() + 4.0));
        }
        cursor += btn_w + gap;
    }

    y += btn_h + 6.0;

    // Active Filter & Sort rule chips strip (rendered cleanly below controls when rules exist).
    if !filter_rules.is_empty() || !sort_rules.is_empty() {
        let chip_h = 24.0_f32;
        let mut cx = strip_left;
        let mut emit_chip = |text: &str,
                             accent: bool,
                             body_hit: Option<DatabaseAuthoringHitKind>,
                             remove_hit: DatabaseAuthoringHitKind,
                             prims: &mut Vec<DatabasePrim>,
                             hits: &mut Vec<DatabaseAuthoringHit>| {
            let style = InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_xs_px,
                500.0,
                ctx.palette.text_primary,
            );
            let max_text_w = (strip_right - strip_left - 34.0).clamp(40.0, 210.0);
            let (_, layout) = ctx.truncate_text(text, style, max_text_w, chip_h);
            let chip_w = (layout.content_width().ceil() + 30.0).min(strip_right - strip_left);
            if cx + chip_w > strip_right && cx > strip_left {
                cx = strip_left;
                y += chip_h + 5.0;
            }
            let chip_rect = axis.map_rect(FlowRect::new(cx, y, chip_w, chip_h));
            prims.push(DatabasePrim::Quad {
                rect: chip_rect,
                fill: Some(if accent {
                    ctx.palette.brand.opacity(0.1)
                } else {
                    ctx.palette.background_secondary
                }),
                border: Some(if accent {
                    ctx.palette.brand.opacity(0.35)
                } else {
                    ctx.palette.border
                }),
                radius: 12.0,
                dashed: false,
            });
            prims.push(DatabasePrim::Text {
                x: chip_rect.x + 8.0,
                y: chip_rect.y,
                layout,
                clip: Some(FlowRect::new(
                    chip_rect.x + 6.0,
                    chip_rect.y,
                    (chip_rect.w - 26.0).max(1.0),
                    chip_h,
                )),
            });
            if let Some(kind) = body_hit {
                hits.push(DatabaseAuthoringHit {
                    rect: FlowRect::new(
                        chip_rect.x,
                        chip_rect.y,
                        (chip_rect.w - 22.0).max(1.0),
                        chip_h,
                    ),
                    kind,
                    scrolls_x: false,
                });
            }
            let remove_rect =
                FlowRect::new(chip_rect.right() - 20.0, chip_rect.y + 2.0, 18.0, 20.0);
            prims.push(ctx.single_line_clipped(
                "×",
                InlineStyle::new(
                    FONT_SANS,
                    TYPOGRAPHY.font_xs_px + 2.0,
                    500.0,
                    ctx.palette.text_secondary,
                ),
                remove_rect.x,
                remove_rect.y,
                remove_rect.w,
                remove_rect.h,
                InlineAlign::Center,
            ));
            hits.push(DatabaseAuthoringHit {
                rect: remove_rect,
                kind: remove_hit,
                scrolls_x: false,
            });
            cx += chip_w + 6.0;
        };

        for (idx, rule) in filter_rules.iter().enumerate() {
            let col_name = column_name_for(&ctx.data.columns, &rule.column_id);
            let op_lbl = filter_op_label(&rule.function);
            let chip_text = if rule.value.is_empty() {
                format!("{col_name} {op_lbl}")
            } else {
                format!("{col_name} {op_lbl} {}", rule.value)
            };
            emit_chip(
                &chip_text,
                true,
                None,
                DatabaseAuthoringHitKind::ToolbarRemoveFilter { index: idx },
                prims,
                authoring_hits,
            );
        }

        for (idx, rule) in sort_rules.iter().enumerate() {
            let col_name = column_name_for(&ctx.data.columns, &rule.column_id);
            let dir_glyph = if rule.desc { "↓" } else { "↑" };
            let chip_text = format!("Sort: {col_name} {dir_glyph}");
            emit_chip(
                &chip_text,
                false,
                Some(DatabaseAuthoringHitKind::ToolbarToggleSortDir { index: idx }),
                DatabaseAuthoringHitKind::ToolbarRemoveSort { index: idx },
                prims,
                authoring_hits,
            );
        }
        y += chip_h + 6.0;
    }

    if let Some(panel) = active_panel {
        let ax = panel_anchor.map_or(8.0, |(x, _)| x);
        let bottom = render_toolbar_panel_popover(ctx, panel, ax, y, prims, authoring_hits);
        y = bottom + 8.0;
    }
    y
}

#[allow(clippy::too_many_arguments)]
fn emit_panel_row(
    ctx: &DbRenderCtx<'_>,
    rect: FlowRect,
    label: &str,
    badge: Option<(&str, bool)>,
    highlighted: bool,
    hit_kind: DatabaseAuthoringHitKind,
    prims: &mut Vec<DatabasePrim>,
    hits: &mut Vec<DatabaseAuthoringHit>,
) {
    if highlighted {
        prims.push(DatabasePrim::Quad {
            rect,
            fill: Some(ctx.palette.hover),
            border: None,
            radius: 4.0,
            dashed: false,
        });
    }
    let label_w = if badge.is_some() {
        (rect.w - 64.0).max(1.0)
    } else {
        (rect.w - 16.0).max(1.0)
    };
    prims.push(ctx.single_line_clipped(
        label,
        InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px + 1.0,
            if highlighted { 500.0 } else { 400.0 },
            if highlighted && badge.is_none() {
                ctx.palette.brand
            } else {
                ctx.palette.text_primary
            },
        ),
        rect.x + 8.0,
        rect.y,
        label_w,
        rect.h,
        InlineAlign::Left,
    ));
    if let Some((text, active)) = badge {
        prims.push(ctx.single_line_clipped(
            text,
            InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_xs_px,
                500.0,
                if active {
                    ctx.palette.brand
                } else {
                    ctx.palette.text_secondary
                },
            ),
            rect.right() - 56.0,
            rect.y,
            50.0,
            rect.h,
            InlineAlign::Right,
        ));
    }
    hits.push(DatabaseAuthoringHit {
        rect,
        kind: hit_kind,
        scrolls_x: false,
    });
}

fn emit_panel_frame(
    ctx: &DbRenderCtx<'_>,
    rect: FlowRect,
    pad: f32,
    title: &str,
    prims: &mut Vec<DatabasePrim>,
) -> f32 {
    prims.push(DatabasePrim::Quad {
        rect,
        fill: Some(ctx.palette.panel),
        border: Some(ctx.palette.border),
        radius: 8.0,
        dashed: false,
    });
    prims.push(ctx.single_line_clipped(
        title,
        InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            600.0,
            ctx.palette.text_secondary,
        ),
        rect.x + pad,
        rect.y + pad,
        rect.w - 2.0 * pad,
        20.0,
        InlineAlign::Left,
    ));
    rect.y + pad + 22.0
}

/// Render the active toolbar dropdown panel (`Filter`, `Sort`, or `Group by`) above view content.
#[allow(clippy::too_many_arguments)]
pub(super) fn render_toolbar_panel_popover(
    ctx: &DbRenderCtx<'_>,
    panel: ActiveToolbarPanel,
    anchor_x: f32,
    anchor_y: f32,
    prims: &mut Vec<DatabasePrim>,
    authoring_hits: &mut Vec<DatabaseAuthoringHit>,
) -> f32 {
    let pad = 8.0_f32;
    let row_h = 28.0_f32;
    let pop_w = match panel {
        ActiveToolbarPanel::Filter => 290.0_f32,
        ActiveToolbarPanel::Sort => 240.0_f32,
        ActiveToolbarPanel::GroupBy => 210.0_f32,
    }
    .min((ctx.width - 16.0).max(170.0));
    let clamped_x = anchor_x.clamp(8.0, (ctx.width - 8.0 - pop_w).max(8.0));

    match panel {
        ActiveToolbarPanel::Filter => {
            let draft = &ctx.ui_state.authoring.filter_draft;
            let col_name = if draft.column_id.is_empty() {
                ctx.data
                    .columns
                    .first()
                    .map_or("Title", |c| c.name.as_str())
            } else {
                column_name_for(&ctx.data.columns, &draft.column_id)
            };
            let op_label = filter_op_label(&draft.function);
            let pop_h = pad * 2.0 + 22.0 + 28.0 + 8.0 + 28.0 + 8.0 + 28.0;
            let rect = FlowRect::new(clamped_x, anchor_y, pop_w, pop_h);
            let mut ry = emit_panel_frame(ctx, rect, pad, "Add filter rule", prims);

            // Column selector + Operator selector row.
            let col_w = ((pop_w - 2.0 * pad - 6.0) * 0.58).floor();
            let op_w = (pop_w - 2.0 * pad - 6.0 - col_w).max(44.0);
            let col_rect = FlowRect::new(rect.x + pad, ry, col_w, 28.0);
            let op_rect = FlowRect::new(col_rect.right() + 6.0, ry, op_w, 28.0);
            for (r, txt, kind) in [
                (
                    col_rect,
                    col_name.to_string(),
                    DatabaseAuthoringHitKind::FilterDraftCycleColumn,
                ),
                (
                    op_rect,
                    op_label.to_string(),
                    DatabaseAuthoringHitKind::FilterDraftCycleOp,
                ),
            ] {
                prims.push(DatabasePrim::Quad {
                    rect: r,
                    fill: Some(ctx.palette.background),
                    border: Some(ctx.palette.border),
                    radius: 4.0,
                    dashed: false,
                });
                prims.push(ctx.single_line_clipped(
                    &txt,
                    InlineStyle::new(
                        FONT_SANS,
                        TYPOGRAPHY.font_xs_px,
                        500.0,
                        ctx.palette.text_primary,
                    ),
                    r.x + 8.0,
                    r.y,
                    (r.w - 28.0).max(1.0),
                    28.0,
                    InlineAlign::Left,
                ));
                prims.push(DatabasePrim::Chevron {
                    rect: FlowRect::new(r.right() - 18.0, r.y + 8.0, 12.0, 12.0),
                    collapsed: false,
                    color: ctx.palette.icon,
                });
                authoring_hits.push(DatabaseAuthoringHit {
                    rect: r,
                    kind,
                    scrolls_x: false,
                });
            }
            ry += 36.0;

            // Value input row.
            let val_rect = FlowRect::new(rect.x + pad, ry, pop_w - 2.0 * pad, 28.0);
            prims.push(DatabasePrim::Quad {
                rect: val_rect,
                fill: Some(ctx.palette.background),
                border: Some(ctx.palette.brand),
                radius: 4.0,
                dashed: false,
            });
            let val_text = if draft.value.is_empty() {
                "Filter value…"
            } else {
                draft.value.as_str()
            };
            prims.push(ctx.single_line_clipped(
                val_text,
                InlineStyle::new(
                    FONT_SANS,
                    TYPOGRAPHY.font_xs_px,
                    400.0,
                    if draft.value.is_empty() {
                        ctx.palette.placeholder
                    } else {
                        ctx.palette.text_primary
                    },
                ),
                val_rect.x + 8.0,
                val_rect.y,
                (val_rect.w - 16.0).max(1.0),
                28.0,
                InlineAlign::Left,
            ));
            ry += 36.0;

            // Apply & Clear buttons.
            let apply_w = 88.0_f32;
            let apply_rect = FlowRect::new(rect.x + pad, ry, apply_w, 28.0);
            prims.push(DatabasePrim::Quad {
                rect: apply_rect,
                fill: Some(ctx.palette.brand),
                border: None,
                radius: 5.0,
                dashed: false,
            });
            prims.push(ctx.single_line_clipped(
                "Apply filter",
                InlineStyle::new(
                    FONT_SANS,
                    TYPOGRAPHY.font_xs_px,
                    600.0,
                    ctx.palette.on_accent,
                ),
                apply_rect.x,
                apply_rect.y,
                apply_rect.w,
                28.0,
                InlineAlign::Center,
            ));
            authoring_hits.push(DatabaseAuthoringHit {
                rect: apply_rect,
                kind: DatabaseAuthoringHitKind::FilterDraftApply,
                scrolls_x: false,
            });
            rect.bottom()
        }
        ActiveToolbarPanel::Sort => {
            let cols = &ctx.data.columns;
            let sort_rules = parse_sort_rules(ctx.view.sort.as_ref());
            let pop_h = pad * 2.0 + 22.0 + cols.len().max(1) as f32 * row_h;
            let rect = FlowRect::new(clamped_x, anchor_y, pop_w, pop_h);
            let mut ry = emit_panel_frame(ctx, rect, pad, "Sort by column", prims);
            for col in cols {
                let existing = sort_rules.iter().find(|r| r.column_id == col.id);
                let badge = match existing {
                    Some(r) if r.desc => ("Desc ↓", true),
                    Some(_) => ("Asc ↑", true),
                    None => ("+ Add", false),
                };
                emit_panel_row(
                    ctx,
                    FlowRect::new(rect.x + pad, ry, pop_w - 2.0 * pad, row_h),
                    &col.name,
                    Some(badge),
                    existing.is_some(),
                    DatabaseAuthoringHitKind::ToolbarAddOrFlipSort {
                        column_id: col.id.clone(),
                    },
                    prims,
                    authoring_hits,
                );
                ry += row_h;
            }
            rect.bottom()
        }
        ActiveToolbarPanel::GroupBy => {
            let groupable: Vec<&DatabaseColumn> = ctx
                .data
                .columns
                .iter()
                .filter(|c| {
                    matches!(
                        c.column_type.as_str(),
                        "select" | "multi-select" | "checkbox" | "number" | "date" | "rich-text"
                    )
                })
                .collect();
            let current_col = ctx.view.group_by.as_ref().map(|g| g.column_id.as_str());
            let pop_h = pad * 2.0 + 22.0 + (groupable.len() + 1) as f32 * row_h;
            let rect = FlowRect::new(clamped_x, anchor_y, pop_w, pop_h);
            let mut ry = emit_panel_frame(ctx, rect, pad, "Group by property", prims);
            emit_panel_row(
                ctx,
                FlowRect::new(rect.x + pad, ry, pop_w - 2.0 * pad, row_h),
                "None",
                None,
                current_col.is_none(),
                DatabaseAuthoringHitKind::ToolbarSetGroupBy { column_id: None },
                prims,
                authoring_hits,
            );
            ry += row_h;
            for col in groupable {
                emit_panel_row(
                    ctx,
                    FlowRect::new(rect.x + pad, ry, pop_w - 2.0 * pad, row_h),
                    &col.name,
                    None,
                    current_col == Some(col.id.as_str()),
                    DatabaseAuthoringHitKind::ToolbarSetGroupBy {
                        column_id: Some(col.id.clone()),
                    },
                    prims,
                    authoring_hits,
                );
                ry += row_h;
            }
            rect.bottom()
        }
    }
}
