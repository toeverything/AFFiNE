//! Pure UTF-16 + IME inline label editor state for Edgeless shapes, connectors, text, and frames.

use std::ops::{Deref, DerefMut, Range};

use blocksuite_playground_doc::session::{PageDocSession, SelectionSnapshot};
use y_octo::{RelativePosition, SessionCommit};

pub use crate::inline_input::{
    AnchoredInlineInput, TextSplice as LabelSplice, utf16_len, utf16_to_byte,
};

use super::WorldRect;

/// Target of an inline UTF-16 + IME label editor on the Edgeless canvas.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LabelTarget {
    Shape { surface_id: String, id: String },
    Connector { surface_id: String, id: String },
    SurfaceText { surface_id: String, id: String },
    FrameTitle { id: String },
}

impl LabelTarget {
    pub fn rotates_in_place(&self) -> bool {
        matches!(self, Self::Shape { .. } | Self::SurfaceText { .. })
    }

    pub fn item_id(&self) -> &str {
        match self {
            Self::Shape { id, .. }
            | Self::Connector { id, .. }
            | Self::SurfaceText { id, .. }
            | Self::FrameTitle { id } => id,
        }
    }

    pub fn splice(
        &self,
        page: &mut PageDocSession,
        (start, del_len, insert): LabelSplice,
        now_ms: u64,
    ) -> Option<SessionCommit<SelectionSnapshot>> {
        match self {
            Self::Shape { surface_id, id }
            | Self::Connector { surface_id, id }
            | Self::SurfaceText { surface_id, id } => page
                .splice_surface_element_text(
                    surface_id,
                    id,
                    "text",
                    start as u64,
                    del_len as u64,
                    &insert,
                    now_ms,
                )
                .ok()
                .flatten(),
            Self::FrameTitle { id } => page
                .splice_block_title_text(id, start as u64, del_len as u64, &insert, now_ms)
                .ok()
                .flatten(),
        }
    }

    pub fn encode_pos(&self, page: &PageDocSession, offset: usize) -> Option<RelativePosition> {
        match self {
            Self::Shape { surface_id, id }
            | Self::Connector { surface_id, id }
            | Self::SurfaceText { surface_id, id } => page
                .encode_surface_text_relative_position(surface_id, id, "text", offset as u64)
                .ok()
                .flatten(),
            Self::FrameTitle { id } => page
                .encode_block_title_relative_position(id, offset as u64)
                .ok()
                .flatten(),
        }
    }

    pub fn resolve_pos(&self, page: &PageDocSession, pos: &RelativePosition) -> Option<usize> {
        let off = match self {
            Self::Shape { surface_id, id }
            | Self::Connector { surface_id, id }
            | Self::SurfaceText { surface_id, id } => page
                .resolve_surface_text_relative_position(surface_id, id, "text", pos)
                .ok()
                .flatten()?,
            Self::FrameTitle { id } => page
                .resolve_block_title_relative_position(id, pos)
                .ok()
                .flatten()?,
        };
        Some(off as usize)
    }
}

/// Visual text layout parameters copied from a Shape or SurfaceText element so in-place editing
/// matches the static label's font, color, alignment, and padding.
#[derive(Clone, Debug)]
pub struct ShapeTextStyle {
    pub font_family: String,
    pub font_size: f32,
    pub font_weight: f32,
    pub font_style: String,
    pub color: blocksuite_playground_doc::read::ColorValue,
    pub text_align: blocksuite_playground_doc::read::TextAlign,
    pub vertical_align: blocksuite_playground_doc::read::VerticalAlign,
    pub padding: [f32; 2],
}

/// Inline UTF-16 + IME editor for Shape, Connector, SurfaceText, and Frame title labels.
#[derive(Clone, Debug)]
pub struct EdgelessLabelEditor {
    pub target: LabelTarget,
    pub original_text: String,
    pub anchored: AnchoredInlineInput,
    pub world_rect: WorldRect,
    pub rotate_deg: f32,
    pub shape_style: Option<ShapeTextStyle>,
    pub created_new_text: bool,
    pub dirty: bool,
}

impl Deref for EdgelessLabelEditor {
    type Target = AnchoredInlineInput;

    fn deref(&self) -> &Self::Target {
        &self.anchored
    }
}

impl DerefMut for EdgelessLabelEditor {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.anchored
    }
}

impl EdgelessLabelEditor {
    pub fn new(
        target: LabelTarget,
        initial: String,
        world_rect: WorldRect,
        rotate_deg: f32,
        multiline: bool,
    ) -> Self {
        Self {
            target,
            original_text: initial.clone(),
            anchored: AnchoredInlineInput::new(initial, multiline),
            world_rect,
            rotate_deg,
            shape_style: None,
            created_new_text: false,
            dirty: false,
        }
    }

    pub fn effective_rotate_deg(&self) -> f32 {
        if self.target.rotates_in_place() {
            self.rotate_deg
        } else {
            0.0
        }
    }

    pub fn with_shape_style(mut self, style: ShapeTextStyle) -> Self {
        self.shape_style = Some(style);
        self
    }

    pub fn composing(&self) -> bool {
        self.input.composing()
    }

    pub fn display_text(&self) -> String {
        self.input.display_text()
    }

    pub fn shown_selection(&self) -> (Range<usize>, bool) {
        self.input.shown_selection()
    }

    pub fn marked_range(&self) -> Option<Range<usize>> {
        self.input.marked_range()
    }

    pub fn text_for_range(&self, range: Range<usize>) -> (String, Range<usize>) {
        self.input.text_for_range(range)
    }

    pub fn cancel_preedit(&mut self) {
        self.input.cancel_preedit();
        self.preedit_anchors = None;
    }

    pub fn replace(&mut self, range: Option<Range<usize>>, text: &str) -> Option<LabelSplice> {
        self.preedit_anchors = None;
        let splice = self.input.replace(range, text);
        if splice.is_some() {
            self.dirty = true;
        }
        splice
    }

    pub fn mark(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        selected: Option<Range<usize>>,
    ) {
        if text.is_empty() {
            self.preedit_anchors = None;
        }
        self.input.mark(range, text, selected);
    }

    pub fn unmark(&mut self) -> Option<LabelSplice> {
        self.preedit_anchors = None;
        let splice = self.input.unmark();
        if splice.is_some() {
            self.dirty = true;
        }
        splice
    }

    pub fn select(&mut self, range: Range<usize>) {
        self.preedit_anchors = None;
        self.input.select(range);
    }

    pub fn delete_backward(&mut self) -> Option<LabelSplice> {
        self.preedit_anchors = None;
        let splice = self.input.delete_backward();
        if splice.is_some() {
            self.dirty = true;
        }
        splice
    }

    pub fn delete_forward(&mut self) -> Option<LabelSplice> {
        self.preedit_anchors = None;
        let splice = self.input.delete_forward();
        if splice.is_some() {
            self.dirty = true;
        }
        splice
    }

    pub fn move_caret(&mut self, left: bool, extend: bool) {
        self.preedit_anchors = None;
        self.input.step_caret(left, extend);
    }

    pub fn select_all(&mut self) {
        self.preedit_anchors = None;
        self.input.select_all();
    }

    pub fn selected_text(&self) -> &str {
        self.input.selected_text()
    }
}

/// Active inline editing session on the Edgeless canvas.
#[derive(Clone, Debug)]
pub enum EdgelessInlineEdit {
    /// Live rich-text `EditorSession` editing inside a Note or EdgelessText block.
    SpatialBlock {
        block_id: String,
        is_note: bool,
        created_new: bool,
    },
    /// Inline UTF-16 + IME editing on a Shape, Connector, SurfaceText, or Frame title.
    Label(EdgelessLabelEditor),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn label_editor_ime_preedit_cancel_and_commit() {
        let mut ed = EdgelessLabelEditor::new(
            LabelTarget::Shape {
                surface_id: "surf".into(),
                id: "s1".into(),
            },
            "hello".into(),
            WorldRect::new(0.0, 0.0, 160.0, 80.0),
            0.0,
            true,
        );
        ed.select(1..4);
        assert_eq!(ed.selected_text(), "ell");
        ed.mark(None, "nihao", None);
        assert!(ed.composing());
        assert_eq!(ed.display_text(), "hnihaoo");
        ed.replace(None, "");
        assert!(!ed.composing());
        assert_eq!(ed.display_text(), "hello");
        assert_eq!(ed.selected_text(), "ell");
        ed.mark(None, "你好", None);
        ed.unmark();
        assert!(!ed.composing());
        assert_eq!(ed.display_text(), "h你好o");
    }
}
