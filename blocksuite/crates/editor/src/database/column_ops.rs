//! Column schema lifecycle UI & operations for `affine:database`:
//! column type metadata, column header action menu popover (rename, type switcher,
//! insert left/right, delete), and column resize/reorder helpers.

use blocksuite_playground_doc::{
    read::{DatabaseColumn, DatabaseData, DatabaseView},
    schema::DatabaseColumnSpec,
    session::PageDocSession,
};
use serde_json::json;

use crate::{
    block_flow::{FlowRect, InlineAlign, InlineStyle},
    theme::{FONT_SANS, IconPaint, TYPOGRAPHY},
};

use super::{
    authoring::{ColumnMenuState, DatabaseAuthoringHit, DatabaseAuthoringHitKind},
    column_icon_name,
    render::{DatabasePrim, DbRenderCtx},
};

/// Default widths for resolved Table view columns.
pub(super) const DEFAULT_COLUMN_WIDTH: f32 = 180.0;
pub(super) const TITLE_DEFAULT_WIDTH: f32 = 220.0;
pub(super) const MIN_COLUMN_WIDTH: f32 = 65.0;

/// One visible Table column resolved from `view.columns` and schema fallback.
pub(super) struct ResolvedTableCol<'a> {
    pub id: String,
    pub name: String,
    pub col_type: String,
    pub width: f32,
    pub schema: Option<&'a DatabaseColumn>,
}

/// Resolve visible Table columns in display order, respecting explicit `hide: true`.
pub(super) fn resolve_visible_columns<'a>(
    view: &'a DatabaseView,
    data: &'a DatabaseData,
) -> Vec<ResolvedTableCol<'a>> {
    let mut result = Vec::new();
    let explicit_title_col_id = view
        .header
        .as_ref()
        .and_then(|h| h.title_column.as_deref())
        .or_else(|| {
            data.columns
                .iter()
                .find(|c| c.column_type == "title")
                .map(|c| c.id.as_str())
        });
    // Only synthesize a fallback `"title"` column when `data.columns` is completely empty.
    let title_col_id = explicit_title_col_id.or_else(|| data.columns.is_empty().then_some("title"));

    if let Some(title_col_id) = title_col_id {
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
    }

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

/// Canonical `0.27.5` column types selectable from the column type switcher.
pub const COLUMN_TYPES: [(&str, &str); 9] = [
    ("title", "Title"),
    ("rich-text", "Text"),
    ("select", "Select"),
    ("multi-select", "Multi-select"),
    ("number", "Number"),
    ("checkbox", "Checkbox"),
    ("date", "Date"),
    ("progress", "Progress"),
    ("link", "URL"),
];

/// Default tag color palette for newly created `select` / `multi-select` options.
pub const TAG_COLOR_PALETTE: [&str; 9] = [
    "var(--affine-tag-blue)",
    "var(--affine-tag-green)",
    "var(--affine-tag-purple)",
    "var(--affine-tag-orange)",
    "var(--affine-tag-teal)",
    "var(--affine-tag-pink)",
    "var(--affine-tag-yellow)",
    "var(--affine-tag-red)",
    "var(--affine-tag-gray)",
];

/// Human-readable display label for a BlockSuite column type wire id.
pub fn column_type_label(col_type: &str) -> &'static str {
    COLUMN_TYPES
        .iter()
        .find(|(id, _)| *id == col_type)
        .map_or("Text", |(_, label)| *label)
}

/// Build a fresh `DatabaseColumnSpec` with `0.27.5`-compatible default `data`.
pub fn make_new_column_spec(id: String, name: String, col_type: &str) -> DatabaseColumnSpec {
    let data = match col_type {
        "select" | "multi-select" => json!({ "options": [] }),
        "number" => json!({ "format": "number" }),
        _ => json!({}),
    };
    DatabaseColumnSpec {
        id,
        column_type: col_type.to_string(),
        name,
        data,
    }
}

/// Apply a column insertion to the left or right of `anchor_col_id` in one undo step.
#[allow(clippy::too_many_arguments)]
pub fn insert_column_relative(
    page: &mut PageDocSession,
    block_id: &str,
    view_id: &str,
    columns: &[DatabaseColumn],
    anchor_col_id: &str,
    right: bool,
    new_col_id: String,
    new_name: String,
    col_type: &str,
    now_ms: u64,
) -> blocksuite_playground_doc::DocResult<bool> {
    let anchor_idx = columns
        .iter()
        .position(|c| c.id == anchor_col_id)
        .unwrap_or(columns.len());
    let insert_idx = if right {
        (anchor_idx + 1).min(columns.len())
    } else {
        // Never insert before column 0 if column 0 is `title`.
        let is_title_zero = columns.first().is_some_and(|c| c.column_type == "title");
        if is_title_zero && anchor_idx == 0 {
            1
        } else {
            anchor_idx
        }
    };
    let spec = make_new_column_spec(new_col_id, new_name, col_type);
    let commit =
        page.add_database_column(block_id, Some(view_id), spec, Some(insert_idx), now_ms)?;
    Ok(commit.is_some())
}

/// Render the floating column header menu popover (and optional type-picker submenu),
/// clamped strictly within `[8, ctx.width - 8]` so it never clips outside the database card.
#[allow(clippy::too_many_arguments)]
pub(super) fn render_column_menu_popover(
    ctx: &DbRenderCtx<'_>,
    menu: &ColumnMenuState,
    anchor_x: f32,
    anchor_y: f32,
    prims: &mut Vec<DatabasePrim>,
    authoring_hits: &mut Vec<DatabaseAuthoringHit>,
) -> f32 {
    let col = ctx.data.columns.iter().find(|c| c.id == menu.column_id);
    let is_title = col.is_some_and(|c| c.column_type == "title") || menu.column_id == "title";
    let current_type = col.map_or("rich-text", |c| c.column_type.as_str());

    let menu_w = 216.0_f32.min((ctx.width - 16.0).max(160.0));
    let pad = 6.0_f32;
    let row_h = 28.0_f32;
    let input_h = 28.0_f32;

    // Rows: rename input + Type button (non-title) + Insert left + Insert right + Delete (non-title).
    let mut rows: Vec<(&str, &str, DatabaseAuthoringHitKind, bool)> = Vec::new();
    if !is_title {
        rows.push((
            "ToggleTypeSubmenu",
            "Type",
            DatabaseAuthoringHitKind::ColumnMenuToggleTypeSubmenu,
            false,
        ));
    }
    rows.push((
        "InsertLeft",
        "Insert left",
        DatabaseAuthoringHitKind::ColumnMenuInsertLeft {
            column_id: menu.column_id.clone(),
        },
        false,
    ));
    rows.push((
        "InsertRight",
        "Insert right",
        DatabaseAuthoringHitKind::ColumnMenuInsertRight {
            column_id: menu.column_id.clone(),
        },
        false,
    ));
    if !is_title {
        rows.push((
            "Delete",
            "Delete column",
            DatabaseAuthoringHitKind::ColumnMenuDelete {
                column_id: menu.column_id.clone(),
            },
            true,
        ));
    }

    let menu_h = pad * 2.0 + input_h + 8.0 + rows.len() as f32 * row_h;
    let clamped_x = anchor_x.clamp(8.0, (ctx.width - 8.0 - menu_w).max(8.0));
    let menu_rect = FlowRect::new(clamped_x, anchor_y, menu_w, menu_h);

    // Popover card (8px radius, 6px padding, concentric 4px inner rows).
    prims.push(DatabasePrim::Quad {
        rect: menu_rect,
        fill: Some(ctx.palette.panel),
        border: Some(ctx.palette.border),
        radius: 8.0,
        dashed: false,
    });

    // Rename text box at top of menu.
    let input_rect = FlowRect::new(
        menu_rect.x + pad,
        menu_rect.y + pad,
        (menu_w - 2.0 * pad).max(1.0),
        input_h,
    );
    prims.push(DatabasePrim::Quad {
        rect: input_rect,
        fill: Some(ctx.palette.background),
        border: Some(ctx.palette.brand),
        radius: 4.0,
        dashed: false,
    });
    let display_draft = if menu.rename_draft.is_empty() {
        "Column name"
    } else {
        menu.rename_draft.as_str()
    };
    let draft_ink = if menu.rename_draft.is_empty() {
        ctx.palette.placeholder
    } else {
        ctx.palette.text_primary
    };
    prims.push(ctx.single_line_clipped(
        display_draft,
        InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px + 1.0, 500.0, draft_ink),
        input_rect.x + 8.0,
        input_rect.y,
        (input_rect.w - 16.0).max(1.0),
        input_h,
        InlineAlign::Left,
    ));
    authoring_hits.push(DatabaseAuthoringHit {
        rect: input_rect,
        kind: DatabaseAuthoringHitKind::ColumnMenuRenameInput,
        scrolls_x: false,
    });

    // Single divider below rename input.
    let div_y = input_rect.bottom() + 4.0;
    prims.push(DatabasePrim::Quad {
        rect: FlowRect::new(menu_rect.x + pad, div_y, (menu_w - 2.0 * pad).max(1.0), 1.0),
        fill: Some(ctx.palette.border),
        border: None,
        radius: 0.0,
        dashed: false,
    });

    let mut ry = div_y + 4.0;
    let mut type_row_y = ry;
    for (tag, label, hit_kind, is_danger) in rows {
        let row_rect = FlowRect::new(menu_rect.x + pad, ry, (menu_w - 2.0 * pad).max(1.0), row_h);
        if tag == "ToggleTypeSubmenu" {
            type_row_y = ry;
            if menu.type_submenu_open {
                prims.push(DatabasePrim::Quad {
                    rect: row_rect,
                    fill: Some(ctx.palette.hover),
                    border: None,
                    radius: 4.0,
                    dashed: false,
                });
            }
        }
        let icon_name = match tag {
            "ToggleTypeSubmenu" => column_icon_name(current_type),
            "InsertLeft" | "InsertRight" => "PlusIcon",
            "Delete" => "DeleteIcon",
            _ => "SquareIcon",
        };
        let ink = if is_danger {
            ctx.theme
                .css_var("--affine-v2-status-error")
                .unwrap_or(ctx.palette.text_primary)
        } else {
            ctx.palette.text_primary
        };
        prims.push(DatabasePrim::Icon {
            rect: FlowRect::new(row_rect.x + 6.0, row_rect.y + 7.0, 14.0, 14.0),
            icon: IconPaint::named(icon_name),
            color: if is_danger { ink } else { ctx.palette.icon },
        });
        let label_w = if tag == "ToggleTypeSubmenu" {
            (row_rect.w - 92.0).max(1.0)
        } else {
            (row_rect.w - 30.0).max(1.0)
        };
        prims.push(ctx.single_line_clipped(
            label,
            InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px + 1.0, 400.0, ink),
            row_rect.x + 26.0,
            row_rect.y,
            label_w,
            row_h,
            InlineAlign::Left,
        ));
        if tag == "ToggleTypeSubmenu" {
            let type_badge = format!("{} ›", column_type_label(current_type));
            prims.push(ctx.single_line_clipped(
                &type_badge,
                InlineStyle::new(
                    FONT_SANS,
                    TYPOGRAPHY.font_xs_px,
                    500.0,
                    ctx.palette.text_secondary,
                ),
                row_rect.right() - 78.0,
                row_rect.y,
                72.0,
                row_h,
                InlineAlign::Right,
            ));
        }
        authoring_hits.push(DatabaseAuthoringHit {
            rect: row_rect,
            kind: hit_kind,
            scrolls_x: false,
        });
        ry += row_h;
    }

    let mut max_bottom = menu_rect.bottom();

    // Optional column type switcher submenu (placed to right of menu, flipping left if needed).
    if menu.type_submenu_open && !is_title {
        let sub_w = 164.0_f32;
        let sub_types: Vec<(&str, &str)> = COLUMN_TYPES
            .iter()
            .copied()
            .filter(|(id, _)| *id != "title")
            .collect();
        let sub_h = pad * 2.0 + sub_types.len() as f32 * 26.0;
        let right_x = menu_rect.right() + 4.0;
        let sub_x = if right_x + sub_w <= ctx.width - 8.0 {
            right_x
        } else {
            (menu_rect.x - sub_w - 4.0).max(8.0)
        };
        let sub_rect = FlowRect::new(sub_x, type_row_y - 2.0, sub_w, sub_h);
        prims.push(DatabasePrim::Quad {
            rect: sub_rect,
            fill: Some(ctx.palette.panel),
            border: Some(ctx.palette.border),
            radius: 8.0,
            dashed: false,
        });
        let mut sy = sub_rect.y + pad;
        for (type_id, type_label) in sub_types {
            let active = type_id == current_type;
            let item_rect = FlowRect::new(sub_rect.x + pad, sy, (sub_w - 2.0 * pad).max(1.0), 26.0);
            if active {
                prims.push(DatabasePrim::Quad {
                    rect: item_rect,
                    fill: Some(ctx.palette.hover),
                    border: None,
                    radius: 4.0,
                    dashed: false,
                });
            }
            prims.push(DatabasePrim::Icon {
                rect: FlowRect::new(item_rect.x + 6.0, item_rect.y + 6.0, 14.0, 14.0),
                icon: IconPaint::named(column_icon_name(type_id)),
                color: if active {
                    ctx.palette.brand
                } else {
                    ctx.palette.icon
                },
            });
            prims.push(ctx.single_line_clipped(
                type_label,
                InlineStyle::new(
                    FONT_SANS,
                    TYPOGRAPHY.font_xs_px + 1.0,
                    if active { 500.0 } else { 400.0 },
                    if active {
                        ctx.palette.brand
                    } else {
                        ctx.palette.text_primary
                    },
                ),
                item_rect.x + 26.0,
                item_rect.y,
                (item_rect.w - 32.0).max(1.0),
                26.0,
                InlineAlign::Left,
            ));
            authoring_hits.push(DatabaseAuthoringHit {
                rect: item_rect,
                kind: DatabaseAuthoringHitKind::ColumnMenuSelectType {
                    column_id: menu.column_id.clone(),
                    target_type: type_id.to_string(),
                },
                scrolls_x: false,
            });
            sy += 26.0;
        }
        max_bottom = max_bottom.max(sub_rect.bottom());
    }

    max_bottom
}
