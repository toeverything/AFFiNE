//! In-place live `Y.Text` editing state for a focused `affine:table` cell.

use std::ops::{Deref, DerefMut};

use crate::inline_input::AnchoredInlineInput;

/// Granularity of an active pointer drag inside a focused table cell.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum TableCellDragMode {
    #[default]
    Character,
    Word(usize, usize),
    All,
}

/// Focused `affine:table` cell edited directly in place against its live `Y.Text`.
#[derive(Clone, Debug)]
pub struct InlineTableCell {
    pub block_id: String,
    pub row_id: String,
    pub column_id: String,
    pub anchored: AnchoredInlineInput,
    pub goal_x: Option<f32>,
    pub dragging: bool,
    pub drag_mode: TableCellDragMode,
}

impl Deref for InlineTableCell {
    type Target = AnchoredInlineInput;

    fn deref(&self) -> &Self::Target {
        &self.anchored
    }
}

impl DerefMut for InlineTableCell {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.anchored
    }
}

impl InlineTableCell {
    pub fn new(block_id: String, row_id: String, column_id: String, initial: String) -> Self {
        Self {
            block_id,
            row_id,
            column_id,
            anchored: AnchoredInlineInput::new(initial, true),
            goal_x: None,
            dragging: false,
            drag_mode: TableCellDragMode::Character,
        }
    }
}
