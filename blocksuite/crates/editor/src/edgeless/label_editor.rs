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

/// Screen-space `(box_x, box_y, box_w, box_h, layout_x, layout_y, layout_w, layout_h)` relative
/// to `vp_origin` for an open [`EdgelessLabelEditor`].
///
/// Connector labels grow dynamically in width and height as multi-line text is edited (including
/// trailing newlines) while staying centered on the connector anchor. Frame titles expand
/// horizontally to fit the full single-line title plus horizontal padding and caret room.
#[allow(clippy::too_many_arguments)]
pub fn label_editor_screen_box(
    editor: &EdgelessLabelEditor,
    camera: super::EdgelessCamera,
    vp_origin: ui::Point<ui::Pixels>,
    vp_w: f32,
    vp_h: f32,
    theme: crate::theme::PlaygroundTheme,
    window: &ui::Window,
) -> (f32, f32, f32, f32, f32, f32, f32, f32) {
    let tl = camera.world_to_screen(
        ui::point(ui::px(editor.world_rect.x), ui::px(editor.world_rect.y)),
        vp_origin,
    );
    let br = camera.world_to_screen(
        ui::point(
            ui::px(editor.world_rect.right()),
            ui::px(editor.world_rect.bottom()),
        ),
        vp_origin,
    );
    let ox = f32::from(vp_origin.x);
    let oy = f32::from(vp_origin.y);
    let raw_x = f32::from(tl.x) - ox;
    let raw_y = f32::from(tl.y) - oy;
    let raw_w = (f32::from(br.x) - f32::from(tl.x)).max(0.5);
    let raw_h = (f32::from(br.y) - f32::from(tl.y)).max(0.5);
    let max_vp_w = (vp_w - 16.0).max(1.0);
    let max_vp_h = (vp_h - 16.0).max(1.0);

    if editor.target.rotates_in_place() {
        let aabb_w = super::rotated_bounds(editor.world_rect, editor.effective_rotate_deg());
        let aabb_tl =
            camera.world_to_screen(ui::point(ui::px(aabb_w.x), ui::px(aabb_w.y)), vp_origin);
        let aabb_br = camera.world_to_screen(
            ui::point(ui::px(aabb_w.right()), ui::px(aabb_w.bottom())),
            vp_origin,
        );
        let bleed = if matches!(editor.target, LabelTarget::SurfaceText { .. }) {
            2.0
        } else {
            0.0
        };
        let x0 = (f32::from(aabb_tl.x) - ox - bleed).clamp(0.0, vp_w);
        let y0 = (f32::from(aabb_tl.y) - oy - bleed).clamp(0.0, vp_h);
        let x1 = (f32::from(aabb_br.x) - ox + bleed).clamp(0.0, vp_w);
        let y1 = (f32::from(aabb_br.y) - oy + bleed).clamp(0.0, vp_h);
        return (x0, y0, x1 - x0, y1 - y0, raw_x, raw_y, raw_w, raw_h);
    }

    if matches!(editor.target, LabelTarget::Connector { .. }) {
        let zoom = camera.zoom;
        let min_w = (48.0 * zoom).max(20.0);
        let min_h = (24.0 * zoom).max(14.0);
        let pad_x = editor
            .shape_style
            .as_ref()
            .map_or(6.0, |st| st.padding[1] * zoom);
        let pad_y = editor
            .shape_style
            .as_ref()
            .map_or(6.0, |st| st.padding[0] * zoom);
        let (mut content_w, mut content_h) = (0.0_f32, 0.0_f32);
        if let Some(laid) =
            super::layout_label_editor_paragraph(editor, max_vp_w, zoom, theme, window)
        {
            let line_max_w = laid
                .lines()
                .iter()
                .map(|l| f32::from(l.width))
                .fold(0.0_f32, f32::max);
            content_w = line_max_w.ceil() + 2.0 * pad_x + 8.0;
            let mut text_h = f32::from(laid.size().height);
            let display = editor.display_text();
            let logical_lines = display.split('\n').count();
            if display.ends_with('\n') && laid.lines().len() < logical_lines {
                let lh = if !laid.lines().is_empty() {
                    (text_h / laid.lines().len() as f32).max(12.0 * zoom)
                } else {
                    (16.0 * zoom).max(12.0)
                };
                text_h += lh;
            }
            content_h = text_h.ceil() + 2.0 * pad_y + 4.0;
        }
        let w = raw_w.max(content_w).max(min_w).min(max_vp_w);
        let h = raw_h.max(content_h).max(min_h).min(max_vp_h);
        let cx = raw_x + raw_w * 0.5;
        let cy = raw_y + raw_h * 0.5;
        let x = (cx - w * 0.5).clamp(8.0, (vp_w - w - 8.0).max(8.0));
        let y = (cy - h * 0.5).clamp(8.0, (vp_h - h - 8.0).max(8.0));
        return (x, y, w, h, x, y, w, h);
    }

    let pad_x = 6.0_f32;
    let measured_w =
        super::layout_label_editor_paragraph(editor, 1e6_f32, camera.zoom, theme, window)
            .map(|laid| {
                laid.lines()
                    .iter()
                    .map(|l| f32::from(l.width))
                    .fold(0.0_f32, f32::max)
                    .ceil()
                    + 2.0 * pad_x
                    + 8.0
            })
            .unwrap_or(0.0);
    let w = raw_w.max(measured_w).max(120.0).min(max_vp_w);
    let h = raw_h.max(32.0).min(max_vp_h);
    let x = raw_x.clamp(8.0, (vp_w - w - 8.0).max(8.0));
    let y = raw_y.clamp(8.0, (vp_h - h - 8.0).max(8.0));
    (x, y, w, h, x, y, w, h)
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
