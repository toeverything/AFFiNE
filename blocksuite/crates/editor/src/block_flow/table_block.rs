//! Layout and paint builder for `affine:table` blocks (BlockSuite `table/src/consts.ts` &
//! `table-cell.ts:535-543` parity).
//!
//! - Unset `column.width` auto-sizes per column in `[120.0, 240.0]` (`DefaultColumnWidth`..`ColumnMaxWidth`)
//!   based on intrinsic cell text widths; explicit `column.width` uses `w.max(60.0)` (`ColumnMinWidth`).
//! - Total table width is `max-content` (sum of column widths), never stretched to fill the column.
//! - Zero automatic header row grey background or bold weight; cell background priority is
//!   `column.background_color ?? row.background_color ?? default`.
//! - Tables wider than the available container width expose horizontal scrolling via `code_scroll`.

use blocksuite_playground_doc::read::{RichText, TableData, TextAlign as BlockAlign};

use crate::theme::TYPOGRAPHY;

use super::{
    BlockBody, CARD_BLOCK_MARGIN, CodeScroll, FlowKind, FlowPass, FlowRect, Prim, TextSpec,
    body::TableCellHit,
};

const DEFAULT_COLUMN_WIDTH: f32 = 120.0;
const COLUMN_MAX_WIDTH: f32 = 240.0;
const COLUMN_MIN_WIDTH: f32 = 60.0;
const TABLE_PAD_TOP: f32 = 10.0;
const TABLE_PAD_BOTTOM: f32 = 18.0;
const TABLE_PAD_LEFT: f32 = 10.0;
const CELL_PAD_X: f32 = 10.0;
const CELL_PAD_Y: f32 = 8.0;
const CELL_LINE_H: f32 = 20.0;

fn resolve_table_bg(raw: Option<&str>, theme: crate::theme::PlaygroundTheme) -> Option<ui::Hsla> {
    let raw = raw?.trim();
    if raw.is_empty() {
        return None;
    }
    theme.css_color(raw).or_else(|| theme.css_var(raw))
}

impl FlowPass<'_> {
    pub(super) fn table_body(
        &mut self,
        data: &TableData,
        width: f32,
        is_focused: bool,
    ) -> BlockBody {
        let row_count = data.rows.len().max(1);
        let axis = crate::database::InlineAxis::new(self.direction, width);
        let ordered_cols = axis.order_indices(data.columns.len());
        let spec = TextSpec {
            font_size: TYPOGRAPHY.font_sm_px,
            font_weight: 400.0,
            line_height: CELL_LINE_H,
            baseline: 15.0,
            letter_spacing: 0.0,
            margin_top: 0.0,
            margin_bottom: 0.0,
        };
        let empty_rich = RichText::default();
        let block_align = match self.direction {
            ui::Direction::Ltr => BlockAlign::Left,
            ui::Direction::Rtl => BlockAlign::Right,
        };

        // Compute `max-content` column widths: explicit `column.width` (>= 60px), or intrinsic
        // cell width clamped to `[120.0, 240.0]`.
        let col_widths: Vec<f32> = ordered_cols
            .iter()
            .map(|&c_idx| {
                let col = &data.columns[c_idx];
                if let Some(explicit) = col.width {
                    return (explicit as f32).max(COLUMN_MIN_WIDTH).round();
                }
                let mut widest = DEFAULT_COLUMN_WIDTH;
                for row in &data.rows {
                    let Some(cell) = data.cells.get(&(row.row_id.clone(), col.column_id.clone()))
                    else {
                        continue;
                    };
                    if cell.text.plain.is_empty() {
                        continue;
                    }
                    let measured = self.block_text(
                        &cell.text,
                        &spec,
                        self.palette.text_primary,
                        COLUMN_MAX_WIDTH - 2.0 * CELL_PAD_X,
                        block_align,
                    );
                    let needed = measured.content_width().ceil() + 2.0 * CELL_PAD_X + 2.0;
                    widest = widest.max(needed);
                    if widest >= COLUMN_MAX_WIDTH {
                        return COLUMN_MAX_WIDTH;
                    }
                }
                widest.clamp(DEFAULT_COLUMN_WIDTH, COLUMN_MAX_WIDTH).ceil()
            })
            .collect();

        let table_content_w: f32 = col_widths.iter().sum::<f32>().max(DEFAULT_COLUMN_WIDTH);
        let mut prims = Vec::new();
        let mut table_cells = Vec::new();
        let mut y = TABLE_PAD_TOP;
        let mut plain_rows = Vec::with_capacity(row_count);

        for row in &data.rows {
            let row_bg = resolve_table_bg(row.background_color.as_deref(), self.input.theme);
            let mut row_layouts = Vec::with_capacity(ordered_cols.len());
            let mut row_h = CELL_LINE_H + 2.0 * CELL_PAD_Y;
            let mut row_texts = Vec::with_capacity(ordered_cols.len());

            for (visual_col, &c_idx) in ordered_cols.iter().enumerate() {
                let col = &data.columns[c_idx];
                let col_w = col_widths[visual_col];
                let col_bg = resolve_table_bg(col.background_color.as_deref(), self.input.theme);
                let inner_w = (col_w - 2.0 * CELL_PAD_X).max(1.0);
                let rich = data
                    .cells
                    .get(&(row.row_id.clone(), col.column_id.clone()))
                    .map(|c| &c.text)
                    .unwrap_or(&empty_rich);
                row_texts.push(rich.plain.clone());
                let layout =
                    self.block_text(rich, &spec, self.palette.text_primary, inner_w, block_align);
                row_h = row_h.max(layout.height() + 2.0 * CELL_PAD_Y);
                row_layouts.push((col.column_id.clone(), col_w, col_bg.or(row_bg), layout));
            }
            plain_rows.push(row_texts.join(" | "));

            let mut cell_x = TABLE_PAD_LEFT;
            for (col_id, col_w, cell_bg, layout) in row_layouts {
                let cell_rect = FlowRect::new(cell_x, y, col_w, row_h);
                prims.push(Prim::Quad {
                    rect: cell_rect,
                    fill: Some(cell_bg.unwrap_or(self.palette.background)),
                    border: Some(self.palette.border),
                    radius: 0.0,
                    dashed: false,
                });
                let text_x = cell_x + CELL_PAD_X;
                let text_y = y + CELL_PAD_Y;
                prims.push(layout.prim(text_x, text_y));
                table_cells.push(TableCellHit {
                    row_id: row.row_id.clone(),
                    column_id: col_id,
                    rect: cell_rect,
                    text_origin: (text_x, text_y),
                    text: layout,
                });
                cell_x += col_w;
            }
            y += row_h;
        }

        if data.rows.is_empty() {
            let empty_h = 36.0;
            prims.push(Prim::Quad {
                rect: FlowRect::new(TABLE_PAD_LEFT, TABLE_PAD_TOP, table_content_w, empty_h),
                fill: Some(self.palette.background),
                border: Some(self.palette.border),
                radius: 0.0,
                dashed: false,
            });
            y += empty_h;
        }

        // Reserve a bottom toolbar slot ONLY while this editable table block is actively focused
        // and too wide for a side toolbar (`0px` extra gap on unfocused or read-only tables).
        const TABLE_TOOLBAR_RESERVE_H: f32 = 52.0;
        let fits_side_toolbar = TABLE_PAD_LEFT + table_content_w + 10.0 + 236.0 <= width + 24.0;
        let bottom_pad = if !is_focused || fits_side_toolbar {
            TABLE_PAD_BOTTOM
        } else {
            TABLE_PAD_BOTTOM + TABLE_TOOLBAR_RESERVE_H
        };
        let height = (y + bottom_pad).max(TABLE_PAD_TOP + 36.0 + bottom_pad);
        let total_needed_w = TABLE_PAD_LEFT + table_content_w + TABLE_PAD_LEFT;
        let max_scroll_x = (total_needed_w - width).max(0.0).ceil();
        let code_scroll = (max_scroll_x > 0.0).then(|| CodeScroll {
            area: FlowRect::new(0.0, 0.0, width, (y + TABLE_PAD_BOTTOM).min(height)),
            max_x: max_scroll_x,
            initial_x: 0.0,
        });

        BlockBody {
            kind: FlowKind::Table,
            width,
            height,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: plain_rows.join("\n"),
            prims,
            text: None,
            prefix: None,
            code_scroll,
            pdf_controls: None,
            table_cells,
        }
    }
}
