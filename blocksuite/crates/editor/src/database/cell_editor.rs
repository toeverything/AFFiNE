//! In-place cell property editors for `affine:database` (Table & Kanban):
//! validation/parsing for Number, Date, URL, Progress, RichText, Title;
//! Select / Multi-select dropdown popover rendering (toggle, create colored pill, rename/delete);
//! and Tab / Shift+Tab navigation across editable cells.

use blocksuite_playground_doc::{
    read::{DatabaseCellValue, DatabaseColumn, DatabaseData, DatabaseRow},
    schema::DatabaseCellSpec,
};

use crate::{
    block_flow::{FlowRect, InlineAlign, InlineStyle},
    theme::{FONT_SANS, IconPaint, TYPOGRAPHY},
};

use super::{
    authoring::{ActiveCellEditor, DatabaseAuthoringHit, DatabaseAuthoringHitKind},
    calendar::days_from_civil,
    column_ops::TAG_COLOR_PALETTE,
    format_database_date,
    render::{DatabasePrim, DbRenderCtx},
    resolve_tag_color,
};

/// Result of validating and parsing an inline cell draft string for commit.
#[derive(Clone, Debug, PartialEq)]
pub enum ParsedCellInput {
    /// Update the row's `affine:paragraph` title text.
    RowTitle(String),
    /// Update `prop:cells[row_id][col_id]` with this typed CRDT spec.
    Cell(DatabaseCellSpec),
}

/// Whether a column supports direct in-place editing (as opposed to read-only computed columns).
pub fn is_editable_column_type(col_type: &str) -> bool {
    !matches!(col_type, "created-time" | "image")
}

/// Format an existing cell value into its initial editable draft string.
pub fn initial_cell_draft(
    data: &DatabaseData,
    row: &DatabaseRow,
    col: &DatabaseColumn,
    offset_at_ms: &dyn Fn(i64) -> i32,
) -> String {
    if col.column_type == "title" {
        return row.title.plain.clone();
    }
    let Some(val) = data.cells.get(&(row.row_id.clone(), col.id.clone())) else {
        return String::new();
    };
    match col.column_type.as_str() {
        "rich-text" | "link" => val.as_str().unwrap_or_default().to_string(),
        "number" => val
            .as_f64()
            .map(|n| {
                if n.fract().abs() < 1e-9 {
                    format!("{n:.0}")
                } else {
                    n.to_string()
                }
            })
            .unwrap_or_default(),
        "progress" => val
            .as_i64()
            .map(|v| v.clamp(0, 100).to_string())
            .unwrap_or_else(|| "0".to_string()),
        "date" => val
            .as_i64()
            .map(|ts| {
                format_database_date(ts, offset_at_ms(ts))
                    .trim_matches(['\u{2066}', '\u{2069}'])
                    .replace('/', "-")
            })
            .unwrap_or_default(),
        _ => val.as_str().unwrap_or_default().to_string(),
    }
}

/// Validate and parse `draft` for `col_type`, returning either a ready-to-commit value or a
/// user-facing inline validation message.
pub fn parse_cell_draft(
    col_type: &str,
    draft: &str,
    offset_at_ms: &dyn Fn(i64) -> i32,
) -> Result<ParsedCellInput, String> {
    let trimmed = draft.trim();
    match col_type {
        "title" => Ok(ParsedCellInput::RowTitle(draft.to_string())),
        "rich-text" => Ok(ParsedCellInput::Cell(DatabaseCellSpec::RichText(
            draft.to_string(),
        ))),
        "number" => {
            if trimmed.is_empty() {
                return Ok(ParsedCellInput::Cell(DatabaseCellSpec::Null));
            }
            let cleaned: String = trimmed
                .chars()
                .filter(|c| !matches!(c, ',' | '$' | '€' | '£' | '¥' | '₹' | ' '))
                .collect();
            let parsed = if let Some(pct) = cleaned.strip_suffix('%') {
                pct.trim().parse::<f64>().ok().map(|v| v / 100.0)
            } else {
                cleaned.parse::<f64>().ok()
            };
            match parsed.filter(|n| n.is_finite()) {
                Some(n) => Ok(ParsedCellInput::Cell(DatabaseCellSpec::Number(n))),
                None => Err("Enter a valid number".to_string()),
            }
        }
        "progress" => {
            if trimmed.is_empty() {
                return Ok(ParsedCellInput::Cell(DatabaseCellSpec::Integer(0)));
            }
            let num_str = trimmed.trim_end_matches('%').trim();
            match num_str.parse::<f64>().ok().filter(|n| n.is_finite()) {
                Some(n) => Ok(ParsedCellInput::Cell(DatabaseCellSpec::Integer(
                    (n.round() as i64).clamp(0, 100),
                ))),
                None => Err("Enter 0–100".to_string()),
            }
        }
        "date" => {
            if trimmed.is_empty() {
                return Ok(ParsedCellInput::Cell(DatabaseCellSpec::Null));
            }
            parse_date_input_ms(trimmed, offset_at_ms)
                .map(|ms| ParsedCellInput::Cell(DatabaseCellSpec::Integer(ms)))
                .ok_or_else(|| "Use YYYY-MM-DD".to_string())
        }
        "link" => {
            if trimmed.is_empty() {
                return Ok(ParsedCellInput::Cell(DatabaseCellSpec::Text(String::new())));
            }
            normalize_url_input(trimmed)
                .map(|url| ParsedCellInput::Cell(DatabaseCellSpec::Text(url)))
                .ok_or_else(|| "Enter a valid URL".to_string())
        }
        _ => Ok(ParsedCellInput::Cell(DatabaseCellSpec::Text(
            draft.to_string(),
        ))),
    }
}

/// Parse `YYYY-MM-DD` or `YYYY/MM/DD` into local midnight UTC ms via `offset_at_ms`.
pub fn parse_date_input_ms(raw: &str, offset_at_ms: &dyn Fn(i64) -> i32) -> Option<i64> {
    let trimmed = raw.trim();
    let sep = if trimmed.contains('-') {
        '-'
    } else if trimmed.contains('/') {
        '/'
    } else {
        return None;
    };
    let mut parts = trimmed.split(sep);
    let y: i32 = parts.next()?.trim().parse().ok()?;
    let m: u32 = parts.next()?.trim().parse().ok()?;
    let d: u32 = parts.next()?.trim().parse().ok()?;
    if parts.next().is_some() || !(1900..=2200).contains(&y) || !(1..=12).contains(&m) {
        return None;
    }
    let max_d = days_in_month_local(y, m);
    if d == 0 || d > max_d {
        return None;
    }
    let day_idx = days_from_civil(y, m, d);
    let utc_midnight = day_idx * 86_400_000;
    let offset_min = offset_at_ms(utc_midnight);
    Some(utc_midnight - i64::from(offset_min) * 60_000)
}

fn days_in_month_local(year: i32, month: u32) -> u32 {
    let (ny, nm) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    (days_from_civil(ny, nm, 1) - days_from_civil(year, month, 1)) as u32
}

/// Validate and normalize a URL cell value (`http://`, `https://`, `mailto:`, or domain).
pub fn normalize_url_input(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.chars().any(char::is_whitespace) {
        return None;
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:")
    {
        Some(trimmed.to_string())
    } else if trimmed.contains('.') && !trimmed.starts_with('.') && !trimmed.ends_with('.') {
        Some(format!("https://{trimmed}"))
    } else {
        None
    }
}

/// Compute a `0..=100` progress value from a horizontal click/drag ratio inside a progress bar.
pub fn progress_from_bar_x(click_x: f32, bar_x: f32, bar_w: f32) -> i64 {
    if bar_w <= 1.0 {
        return 0;
    }
    let ratio = ((click_x - bar_x) / bar_w).clamp(0.0, 1.0);
    (ratio * 100.0).round() as i64
}

/// Step to the next (`forward = true`) or previous (`forward = false`) editable cell across
/// visible rows and columns (wrapping across rows).
pub fn next_editable_cell(
    rows: &[DatabaseRow],
    cols: &[(String, String)],
    current_row_id: &str,
    current_col_id: &str,
    forward: bool,
) -> Option<(String, String, String)> {
    let editable_cols: Vec<&(String, String)> = cols
        .iter()
        .filter(|(_, ty)| is_editable_column_type(ty))
        .collect();
    if rows.is_empty() || editable_cols.is_empty() {
        return None;
    }
    let r_idx = rows.iter().position(|r| r.row_id == current_row_id)?;
    let c_idx = editable_cols
        .iter()
        .position(|(id, _)| id == current_col_id)
        .unwrap_or(0);
    let total = rows.len() * editable_cols.len();
    let flat = r_idx * editable_cols.len() + c_idx;
    let next_flat = if forward {
        (flat + 1) % total
    } else {
        (flat + total - 1) % total
    };
    let next_row = &rows[next_flat / editable_cols.len()];
    let (next_col_id, next_col_type) = editable_cols[next_flat % editable_cols.len()];
    Some((
        next_row.row_id.clone(),
        next_col_id.clone(),
        next_col_type.clone(),
    ))
}

/// Pick the next tag color from the 9-color palette based on existing option count.
pub fn next_tag_color(existing_count: usize) -> &'static str {
    TAG_COLOR_PALETTE[existing_count % TAG_COLOR_PALETTE.len()]
}

/// Render the floating `Select` / `Multi-select` option picker popover anchored below the active
/// cell, supporting toggling pills, creating a new colored option, and deleting options.
#[allow(clippy::too_many_arguments)]
pub(super) fn render_select_popover(
    ctx: &DbRenderCtx<'_>,
    editor: &ActiveCellEditor,
    anchor_x: f32,
    anchor_y: f32,
    prims: &mut Vec<DatabasePrim>,
    authoring_hits: &mut Vec<DatabaseAuthoringHit>,
) -> f32 {
    let Some(col) = ctx.data.columns.iter().find(|c| c.id == editor.column_id) else {
        return anchor_y;
    };
    let options = col.select_options();
    let selected_ids: Vec<String> = ctx
        .data
        .cells
        .get(&(editor.row_id.clone(), editor.column_id.clone()))
        .map(DatabaseCellValue::as_string_list)
        .unwrap_or_default();

    let query = editor.select_filter.trim();
    let query_lower = query.to_ascii_lowercase();
    let filtered: Vec<_> = options
        .iter()
        .filter(|o| query_lower.is_empty() || o.value.to_ascii_lowercase().contains(&query_lower))
        .collect();
    let exact_match =
        !query.is_empty() && options.iter().any(|o| o.value.eq_ignore_ascii_case(query));
    let show_create = !query.is_empty() && !exact_match;

    let pop_w = 236.0_f32.min((ctx.width - 16.0).max(176.0));
    let pad = 6.0_f32;
    let input_h = 28.0_f32;
    let row_h = 28.0_f32;
    let create_rows = usize::from(show_create);
    let list_rows = filtered.len().max(usize::from(!show_create));
    let pop_h = pad * 2.0 + input_h + 8.0 + (list_rows + create_rows) as f32 * row_h;

    let clamped_x = anchor_x.clamp(8.0, (ctx.width - 8.0 - pop_w).max(8.0));
    let pop_rect = FlowRect::new(clamped_x, anchor_y, pop_w, pop_h);

    prims.push(DatabasePrim::Quad {
        rect: pop_rect,
        fill: Some(ctx.palette.panel),
        border: Some(ctx.palette.border),
        radius: 8.0,
        dashed: false,
    });

    // Search / create input field.
    let input_rect = FlowRect::new(
        pop_rect.x + pad,
        pop_rect.y + pad,
        (pop_w - 2.0 * pad).max(1.0),
        input_h,
    );
    prims.push(DatabasePrim::Quad {
        rect: input_rect,
        fill: Some(ctx.palette.background),
        border: Some(ctx.palette.brand),
        radius: 4.0,
        dashed: false,
    });
    let prompt = if editor.select_filter.is_empty() {
        "Search or create option…"
    } else {
        editor.select_filter.as_str()
    };
    let prompt_ink = if editor.select_filter.is_empty() {
        ctx.palette.placeholder
    } else {
        ctx.palette.text_primary
    };
    prims.push(ctx.single_line_clipped(
        prompt,
        InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px + 1.0, 400.0, prompt_ink),
        input_rect.x + 8.0,
        input_rect.y,
        (input_rect.w - 16.0).max(1.0),
        input_h,
        InlineAlign::Left,
    ));

    // Single divider below input.
    let div_y = input_rect.bottom() + 4.0;
    prims.push(DatabasePrim::Quad {
        rect: FlowRect::new(pop_rect.x + pad, div_y, (pop_w - 2.0 * pad).max(1.0), 1.0),
        fill: Some(ctx.palette.border),
        border: None,
        radius: 0.0,
        dashed: false,
    });

    let mut ry = div_y + 4.0;
    if filtered.is_empty() && !show_create {
        let empty_rect = FlowRect::new(pop_rect.x + pad, ry, (pop_w - 2.0 * pad).max(1.0), row_h);
        prims.push(ctx.single_line_clipped(
            "No options yet",
            InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_xs_px,
                400.0,
                ctx.palette.text_secondary,
            ),
            empty_rect.x + 8.0,
            empty_rect.y,
            (empty_rect.w - 16.0).max(1.0),
            row_h,
            InlineAlign::Left,
        ));
    } else {
        for opt in filtered {
            let is_selected = selected_ids
                .iter()
                .any(|id| id == &opt.id || id == &opt.value);
            let row_rect = FlowRect::new(pop_rect.x + pad, ry, (pop_w - 2.0 * pad).max(1.0), row_h);
            if is_selected {
                prims.push(DatabasePrim::Quad {
                    rect: row_rect,
                    fill: Some(ctx.palette.hover),
                    border: None,
                    radius: 4.0,
                    dashed: false,
                });
            }
            let (bg, ink) = resolve_tag_color(&opt.color, ctx.theme);
            let pill_style = InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px, 500.0, ink);
            let max_pill_w = (row_rect.w - 58.0).max(32.0);
            let (_, pill_layout) =
                ctx.truncate_text(&opt.value, pill_style, (max_pill_w - 12.0).max(1.0), 20.0);
            let pill_w = (pill_layout.content_width().ceil() + 12.0).min(max_pill_w);
            let pill_rect = FlowRect::new(row_rect.x + 6.0, row_rect.y + 4.0, pill_w, 20.0);
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
                layout: pill_layout,
                clip: Some(FlowRect::new(
                    pill_rect.x + 4.0,
                    pill_rect.y,
                    (pill_rect.w - 8.0).max(1.0),
                    20.0,
                )),
            });

            if is_selected {
                prims.push(DatabasePrim::Icon {
                    rect: FlowRect::new(row_rect.right() - 42.0, row_rect.y + 7.0, 14.0, 14.0),
                    icon: IconPaint::named("CheckBoxCheckLinearIcon"),
                    color: ctx.palette.brand,
                });
            }

            // Delete option button on trailing edge (22x22 target).
            let del_rect = FlowRect::new(row_rect.right() - 24.0, row_rect.y + 3.0, 22.0, 22.0);
            prims.push(ctx.single_line_clipped(
                "×",
                InlineStyle::new(
                    FONT_SANS,
                    TYPOGRAPHY.font_sm_px,
                    500.0,
                    ctx.palette.text_secondary,
                ),
                del_rect.x,
                del_rect.y,
                del_rect.w,
                del_rect.h,
                InlineAlign::Center,
            ));

            let select_hit_rect =
                FlowRect::new(row_rect.x, row_rect.y, (row_rect.w - 26.0).max(1.0), row_h);
            authoring_hits.push(DatabaseAuthoringHit {
                rect: select_hit_rect,
                kind: DatabaseAuthoringHitKind::SelectToggleOption {
                    row_id: editor.row_id.clone(),
                    column_id: editor.column_id.clone(),
                    option_id: opt.id.clone(),
                },
                scrolls_x: false,
            });
            authoring_hits.push(DatabaseAuthoringHit {
                rect: del_rect,
                kind: DatabaseAuthoringHitKind::SelectDeleteOption {
                    column_id: editor.column_id.clone(),
                    option_id: opt.id.clone(),
                },
                scrolls_x: false,
            });
            ry += row_h;
        }
    }

    if show_create {
        let create_rect = FlowRect::new(pop_rect.x + pad, ry, (pop_w - 2.0 * pad).max(1.0), row_h);
        prims.push(DatabasePrim::Quad {
            rect: create_rect,
            fill: Some(ctx.palette.background_secondary),
            border: None,
            radius: 4.0,
            dashed: false,
        });
        let color = next_tag_color(options.len());
        let (bg, ink) = resolve_tag_color(color, ctx.theme);
        prims.push(ctx.single_line_clipped(
            "Create",
            InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_xs_px,
                500.0,
                ctx.palette.text_secondary,
            ),
            create_rect.x + 6.0,
            create_rect.y,
            44.0,
            row_h,
            InlineAlign::Left,
        ));
        let pill_style = InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px, 500.0, ink);
        let max_pw = (create_rect.w - 60.0).max(24.0);
        let (_, pill_layout) = ctx.truncate_text(query, pill_style, (max_pw - 12.0).max(1.0), 20.0);
        let pw = (pill_layout.content_width().ceil() + 12.0).min(max_pw);
        let pill_rect = FlowRect::new(create_rect.x + 52.0, create_rect.y + 4.0, pw, 20.0);
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
            layout: pill_layout,
            clip: Some(FlowRect::new(
                pill_rect.x + 4.0,
                pill_rect.y,
                (pill_rect.w - 8.0).max(1.0),
                20.0,
            )),
        });
        authoring_hits.push(DatabaseAuthoringHit {
            rect: create_rect,
            kind: DatabaseAuthoringHitKind::SelectCreateOption {
                row_id: editor.row_id.clone(),
                column_id: editor.column_id.clone(),
                label: query.to_string(),
                color: color.to_string(),
            },
            scrolls_x: false,
        });
    }

    pop_rect.bottom()
}

/// Lay out a database `title` or `rich-text` cell preserving inline styles (bold, italic,
/// underline, strikethrough, inline code, foreground/background colors, links, `@reference`
/// document title chips) and multiline wrapping.
pub(super) fn layout_rich_cell(
    ctx: &DbRenderCtx<'_>,
    rt: &blocksuite_playground_doc::read::RichText,
    weight: f32,
    ink: ui::Hsla,
    max_width: f32,
    align: InlineAlign,
) -> Option<std::sync::Arc<crate::rich_text::LaidOutRichParagraph>> {
    if rt.delta.is_empty() && rt.plain.is_empty() {
        return None;
    }
    let paragraph =
        crate::rich_text::RichParagraph::from_delta_with_resolver(rt.delta.clone(), |page_id| {
            ctx.page_titles.get(page_id).cloned()
        })
        .ok()?;
    let mut style = crate::rich_text::RichParagraphStyle::from_theme(ctx.theme.mode());
    let code_font_size = (TYPOGRAPHY.font_sm_px - 2.0).max(9.0);
    let code_scale = code_font_size / style.code_font_size;
    style.code_font_size = code_font_size;
    style.code_baseline *= code_scale;
    style.code_descent *= code_scale;
    style.font_size = TYPOGRAPHY.font_sm_px;
    style.base_weight = ui::FontWeight(weight);
    style.line_height = 20.0;
    style.align = match align {
        InlineAlign::Left => ui::TextAlign::Left,
        InlineAlign::Center => ui::TextAlign::Center,
        InlineAlign::Right => ui::TextAlign::Right,
    };
    style.text_color = ink;
    style.dpr = ctx.window.scale_factor();
    Some(std::sync::Arc::new(paragraph.layout(
        ctx.window.text_system(),
        &style,
        max_width.max(1.0),
    )))
}

/// Pre-lay out rich-text and title cells for one Table row and compute the expanded row height
/// (clamped to `[min_row_h, 120.0]`).
pub(super) fn prelayout_table_row_rich_cells(
    ctx: &DbRenderCtx<'_>,
    cols: &[super::column_ops::ResolvedTableCol<'_>],
    ordered_col_indices: &[usize],
    row: &blocksuite_playground_doc::read::DatabaseRow,
    min_row_h: f32,
    align: InlineAlign,
) -> (
    Vec<Option<std::sync::Arc<crate::rich_text::LaidOutRichParagraph>>>,
    f32,
) {
    let mut layouts = Vec::with_capacity(ordered_col_indices.len());
    let mut row_h = min_row_h;
    for &c_idx in ordered_col_indices {
        let col = &cols[c_idx];
        let inner_w = (col.width - 16.0).max(1.0);
        let is_editing = ctx
            .ui_state
            .authoring
            .active_cell
            .as_ref()
            .is_some_and(|e| e.row_id == row.row_id && e.column_id == col.id);
        let laid = if is_editing {
            None
        } else if col.col_type == "title" {
            layout_rich_cell(
                ctx,
                &row.title,
                500.0,
                ctx.palette.text_primary,
                inner_w,
                align,
            )
        } else if let Some(blocksuite_playground_doc::read::DatabaseCellValue::RichText(rt)) =
            ctx.data.cells.get(&(row.row_id.clone(), col.id.clone()))
        {
            layout_rich_cell(ctx, rt, 400.0, ctx.palette.text_primary, inner_w, align)
        } else {
            None
        };
        if let Some(ref l) = laid {
            let h = l.lines().len().max(1) as f32 * f32::from(l.line_height());
            row_h = row_h.max((h + 12.0).ceil()).min(120.0);
        }
        layouts.push(laid);
    }
    (layouts, row_h)
}

/// Build a clipped [`DatabasePrim::Rich`] vertically centered (single-line) or top-padded
/// (multi-line) inside `cell_rect`.
pub(super) fn rich_cell_prim(
    laid: std::sync::Arc<crate::rich_text::LaidOutRichParagraph>,
    inner_x: f32,
    inner_w: f32,
    cell_rect: FlowRect,
) -> DatabasePrim {
    let h = laid.lines().len().max(1) as f32 * f32::from(laid.line_height());
    let text_y = if h <= cell_rect.h - 8.0 {
        cell_rect.y + ((cell_rect.h - h) * 0.5).floor()
    } else {
        cell_rect.y + 6.0
    };
    DatabasePrim::Rich {
        x: inner_x,
        y: text_y,
        layout: laid,
        clip: Some(FlowRect::new(
            inner_x,
            cell_rect.y + 2.0,
            inner_w,
            (cell_rect.h - 4.0).max(1.0),
        )),
    }
}
