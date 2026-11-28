//! Pointer drag selection and horizontal/vertical viewport reveal for focused `affine:table` cells.

use ui::{Context, MouseButton, MouseMoveEvent, Window};

use super::TableCellDragMode;
use crate::{PlaygroundView, TOPBAR_HEIGHT, block_flow::page_geometry};

impl PlaygroundView {
    /// Mark the active table cell to be revealed vertically on the next frame and immediately
    /// scroll its wide table horizontally so the active cell and caret stay inside the viewport.
    pub(crate) fn reveal_table_cell(&mut self) {
        self.editor.reveal = true;
        self.reveal_table_cell_horizontal();
    }

    /// Scroll a wide table sideways so the focused cell and its caret stay in view.
    pub(crate) fn reveal_table_cell_horizontal(&mut self) {
        let Some(cell) = self.table_cell.as_ref() else {
            return;
        };
        let Some(layout) = self.flow_layout() else {
            return;
        };
        let Some(block) = layout.block(&cell.block_id) else {
            return;
        };
        let Some(code) = block.body.code_scroll else {
            return;
        };
        let Some(hit) = block
            .body
            .table_cells
            .iter()
            .find(|c| c.row_id == cell.row_id && c.column_id == cell.column_id)
        else {
            return;
        };
        let (cx_local, _) = hit.text.caret(cell.input.focus());
        let cell_left = hit.rect.x - code.area.x;
        let cell_right = hit.rect.right() - code.area.x;
        let caret_x = hit.text_origin.0 + cx_local - code.area.x;
        self.overlays
            .reveal_table_cell_x(&cell.block_id, cell_left, cell_right, caret_x, code);
    }

    /// Extend the active table cell's text selection while dragging with the primary button.
    pub(crate) fn table_cell_mouse_move(
        &mut self,
        event: &MouseMoveEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if event.pressed_button != Some(MouseButton::Left) {
            if let Some(cell) = self.table_cell.as_mut() {
                cell.dragging = false;
            }
            return;
        }
        let Some((block_id, row_id, column_id, drag_mode, text)) =
            self.table_cell.as_ref().filter(|c| c.dragging).map(|c| {
                (
                    c.block_id.clone(),
                    c.row_id.clone(),
                    c.column_id.clone(),
                    c.drag_mode,
                    c.input.text.clone(),
                )
            })
        else {
            return;
        };
        let Some(layout) = self.flow_layout() else {
            return;
        };
        let Some((bx, by, hit)) =
            Self::find_table_cell_hit(&layout, &block_id, &row_id, &column_id)
        else {
            return;
        };
        let geom = page_geometry(f32::from(window.viewport_size().width));
        let local_x = f32::from(event.position.x) - geom.column_x - bx
            + self.overlays.code_scroll_x(&block_id);
        let local_y = f32::from(event.position.y) - TOPBAR_HEIGHT + self.scroll_y - by;
        let off = hit.hit_text(local_x, local_y, &text).utf16_offset as usize;
        if let Some(cell) = self.table_cell.as_mut() {
            match drag_mode {
                TableCellDragMode::Character => {
                    cell.input.move_caret(off, true);
                }
                TableCellDragMode::Word(a_start, a_end) => {
                    let r = crate::editor_session::word_range(&text, off as u64);
                    let (f_start, f_end) = (r.start as usize, r.end as usize);
                    if f_start >= a_start {
                        cell.input.select(a_start..f_end);
                    } else {
                        cell.input.select(a_end..a_end);
                        cell.input.move_caret(f_start, true);
                    }
                }
                TableCellDragMode::All => {
                    let len = blocksuite_editor::inline_input::utf16_len(&text);
                    cell.input.select(0..len);
                }
            }
            cell.goal_x = None;
        }
        self.reveal_table_cell();
        self.table_cell_update_anchors();
        self.reset_caret_blink(cx);
        window.notify_text_selection_changed(&self.editor_focus);
        cx.notify();
    }
}
