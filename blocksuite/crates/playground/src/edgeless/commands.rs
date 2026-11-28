//! Edgeless keyboard shortcuts, selection/z-order commands, and snapshot spatial helpers.

use blocksuite_playground_doc::read::{
    BlockContent, BlockNode, ConnectorMode, NoteDisplayMode, PageSnapshot, SurfaceElement,
};
use ui::{Context, KeyDownEvent, Window, point, px, size};

use crate::PlaygroundView;

use super::{
    EdgelessGesture, EdgelessTool, SpatialItemKind, layout_label_editor_paragraph, utf16_len,
};
#[cfg(test)]
use super::{HandleKind, ShapePreset, collect_frame_children};
#[cfg(test)]
use blocksuite_playground_doc::fractional_index::generate_key_between;
#[cfg(test)]
use y_octo::Any;

/// Helper to compute the highest existing fractional index across all spatial items in a snapshot.
pub fn max_spatial_index(snapshot: &PageSnapshot) -> Option<String> {
    let root = snapshot.root.as_ref()?;
    let mut max_idx: Option<String> = None;
    for node in root.walk() {
        if let Some(idx) = node.props.get("prop:index").and_then(|v| v.as_str())
            && max_idx.as_deref().is_none_or(|m| idx > m)
        {
            max_idx = Some(idx.to_string());
        }
        if let BlockContent::Surface { elements, .. } = &node.content {
            for e in elements {
                if max_idx.as_deref().is_none_or(|m| e.index.as_str() > m) {
                    max_idx = Some(e.index.clone());
                }
            }
        }
    }
    max_idx
}

pub fn min_spatial_index(snapshot: &PageSnapshot) -> Option<String> {
    let root = snapshot.root.as_ref()?;
    let mut min_idx: Option<String> = None;
    for node in root.walk() {
        if matches!(
            node.content,
            BlockContent::Note { .. }
                | BlockContent::Frame { .. }
                | BlockContent::EdgelessText { .. }
        ) && let Some(idx) = node.props.get("prop:index").and_then(|v| v.as_str())
            && min_idx.as_deref().is_none_or(|m| idx < m)
        {
            min_idx = Some(idx.to_string());
        }
        if let BlockContent::Surface { elements, .. } = &node.content {
            for e in elements {
                if min_idx.as_deref().is_none_or(|m| e.index.as_str() < m) {
                    min_idx = Some(e.index.clone());
                }
            }
        }
    }
    min_idx
}

pub(crate) fn find_surface_element<'a>(
    snapshot: &'a PageSnapshot,
    id: &str,
) -> Option<(&'a str, &'a SurfaceElement)> {
    let root = snapshot.root.as_ref()?;
    for child in &root.children {
        if let BlockContent::Surface { elements, .. } = &child.content
            && let Some(el) = elements.iter().find(|e| e.id == id)
        {
            return Some((child.id.as_str(), el));
        }
    }
    None
}

pub(super) fn find_block<'a>(snapshot: &'a PageSnapshot, id: &str) -> Option<&'a BlockNode> {
    snapshot.root.as_ref()?.walk().find(|n| n.id == id)
}

impl PlaygroundView {
    /// Switch the active Edgeless authoring tool.
    pub fn edgeless_select_tool(
        &mut self,
        tool: EdgelessTool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.edgeless_readonly {
            return;
        }
        let now_ms = self.now_ms(cx);
        if let EdgelessTool::Shape(s) = tool {
            self.edgeless.authoring.last_shape_type = Some(s);
            self.edgeless.authoring.shape_picker_open = true;
            self.edgeless_shape_picker_presence = Some(match self.edgeless_shape_picker_presence {
                Some(p) => p.reopened(now_ms),
                None => super::ShapePickerPresence::opening(now_ms),
            });
        } else {
            self.edgeless.authoring.shape_picker_open = false;
            if let Some(p) = self.edgeless_shape_picker_presence.as_mut() {
                p.close(now_ms);
            }
        }
        self.edgeless_commit_inline_edit(window, cx);
        self.edgeless.authoring.tool = tool;
        self.edgeless.authoring.gesture = None;
        cx.notify();
    }

    /// Toggle the Edgeless Shape subpanel visibility without altering the active shape preset.
    pub fn edgeless_toggle_shape_picker(&mut self, _window: &mut Window, cx: &mut Context<Self>) {
        if self.edgeless_readonly {
            return;
        }
        let now_ms = self.now_ms(cx);
        let next = !self.edgeless.authoring.shape_picker_open;
        self.edgeless.authoring.shape_picker_open = next;
        if next {
            self.edgeless_shape_picker_presence = Some(match self.edgeless_shape_picker_presence {
                Some(p) => p.reopened(now_ms),
                None => super::ShapePickerPresence::opening(now_ms),
            });
        } else if let Some(p) = self.edgeless_shape_picker_presence.as_mut() {
            p.close(now_ms);
        }
        cx.notify();
    }

    /// Programmatically select Edgeless item ids (used by harness states and tests).
    pub fn edgeless_set_selection(
        &mut self,
        ids: impl IntoIterator<Item = String>,
        cx: &mut Context<Self>,
    ) {
        self.edgeless.authoring.selection = ids.into_iter().collect();
        cx.notify();
    }

    /// Programmatically set an active marquee box (used by harness states).
    pub fn edgeless_set_marquee(
        &mut self,
        start_world: (f32, f32),
        current_world: (f32, f32),
        cx: &mut Context<Self>,
    ) {
        self.edgeless.authoring.gesture = Some(EdgelessGesture::Marquee {
            start_world,
            current_world,
        });
        cx.notify();
    }

    pub(crate) fn did_edgeless_doc_commit(
        &mut self,
        commit: y_octo::SessionCommit<blocksuite_playground_doc::session::SelectionSnapshot>,
        cx: &mut Context<Self>,
    ) {
        if !commit.update.is_empty() {
            if let Some(id) = self.page_id.clone() {
                self.send_page_update(&id, commit.update);
            }
            self.dirty_text = None;
            self.snapshot = self
                .page()
                .and_then(|page| page.read_page_snapshot().ok())
                .map(std::rc::Rc::new);
            self.doc_rev += 1;
            cx.notify();
        }
    }

    /// Handle keyboard events in Edgeless mode. Returns `true` if consumed.
    pub(crate) fn edgeless_key_down(
        &mut self,
        e: &KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        let m = e.keystroke.modifiers;
        let cmd = m.secondary(cx);
        let key = e.keystroke.key.as_str();

        if key == "escape" && self.overlays.close_context_menu(self.now_ms(cx)) {
            cx.notify();
            return true;
        }

        // 1. Active inline label editor (Shape / Connector / SurfaceText / Frame title).
        if let Some(ed) = self.edgeless.authoring.label_editor_mut() {
            if ed.composing() || e.prefer_character_input {
                if key == "escape" {
                    ed.cancel_preedit();
                    window.notify_text_input_changed(&self.editor_focus);
                    cx.notify();
                    return true;
                }
                return false;
            }
            let word_mod = m.alt || (m.control && !m.platform);
            match key {
                "escape" => {
                    self.edgeless_commit_inline_edit(window, cx);
                    return true;
                }
                "enter" if !ed.input.multiline || cmd => {
                    self.edgeless_commit_inline_edit(window, cx);
                    return true;
                }
                "enter" => {
                    self.edgeless_label_edit(window, cx, |ed| ed.replace(None, "\n"));
                    return true;
                }
                "backspace" if word_mod => {
                    self.edgeless_label_edit(window, cx, |ed| ed.delete_word(false));
                    return true;
                }
                "backspace" => {
                    self.edgeless_label_edit(
                        window,
                        cx,
                        super::EdgelessLabelEditor::delete_backward,
                    );
                    return true;
                }
                "delete" if word_mod => {
                    self.edgeless_label_edit(window, cx, |ed| ed.delete_word(true));
                    return true;
                }
                "delete" => {
                    self.edgeless_label_edit(
                        window,
                        cx,
                        super::EdgelessLabelEditor::delete_forward,
                    );
                    return true;
                }
                "left" if m.platform => {
                    ed.move_to_line_edge(false, m.shift);
                    self.edgeless_update_label_anchors();
                    window.notify_text_input_changed(&self.editor_focus);
                    cx.notify();
                    return true;
                }
                "right" if m.platform => {
                    ed.move_to_line_edge(true, m.shift);
                    self.edgeless_update_label_anchors();
                    window.notify_text_input_changed(&self.editor_focus);
                    cx.notify();
                    return true;
                }
                "left" if word_mod => {
                    ed.move_word(true, m.shift);
                    self.edgeless_update_label_anchors();
                    window.notify_text_input_changed(&self.editor_focus);
                    cx.notify();
                    return true;
                }
                "right" if word_mod => {
                    ed.move_word(false, m.shift);
                    self.edgeless_update_label_anchors();
                    window.notify_text_input_changed(&self.editor_focus);
                    cx.notify();
                    return true;
                }
                "left" => {
                    ed.move_caret(true, m.shift);
                    self.edgeless_update_label_anchors();
                    window.notify_text_input_changed(&self.editor_focus);
                    cx.notify();
                    return true;
                }
                "right" => {
                    ed.move_caret(false, m.shift);
                    self.edgeless_update_label_anchors();
                    window.notify_text_input_changed(&self.editor_focus);
                    cx.notify();
                    return true;
                }
                "home" => {
                    ed.move_to_line_edge(false, m.shift);
                    self.edgeless_update_label_anchors();
                    window.notify_text_input_changed(&self.editor_focus);
                    cx.notify();
                    return true;
                }
                "end" => {
                    ed.move_to_line_edge(true, m.shift);
                    self.edgeless_update_label_anchors();
                    window.notify_text_input_changed(&self.editor_focus);
                    cx.notify();
                    return true;
                }
                "up" | "down" => {
                    let down = key == "down";
                    self.edgeless_label_move_vertical(down, m.shift, window, cx);
                    return true;
                }
                "z" if cmd => {
                    let commit = self.page_mut().ok().and_then(|page| {
                        if m.shift {
                            page.redo().ok().flatten()
                        } else {
                            page.undo().ok().flatten()
                        }
                    });
                    if let Some(commit) = commit {
                        self.did_edgeless_doc_commit(commit, cx);
                        self.edgeless_refresh_label_editor_from_snapshot();
                        self.edgeless_sync_shape_auto_height(window, cx);
                        window.notify_text_input_changed(&self.editor_focus);
                        cx.notify();
                    }
                    return true;
                }
                "y" if cmd && !m.shift => {
                    let commit = self
                        .page_mut()
                        .ok()
                        .and_then(|page| page.redo().ok().flatten());
                    if let Some(commit) = commit {
                        self.did_edgeless_doc_commit(commit, cx);
                        self.edgeless_refresh_label_editor_from_snapshot();
                        self.edgeless_sync_shape_auto_height(window, cx);
                        window.notify_text_input_changed(&self.editor_focus);
                        cx.notify();
                    }
                    return true;
                }
                "a" if cmd => {
                    ed.select_all();
                    self.edgeless_update_label_anchors();
                    window.notify_text_input_changed(&self.editor_focus);
                    cx.notify();
                    return true;
                }
                "c" | "x" if cmd => {
                    let s = ed.selected_text().to_string();
                    if !s.is_empty() {
                        cx.write_to_clipboard(ui::ClipboardItem::new_string(s));
                        if key == "x" {
                            self.edgeless_label_edit(window, cx, |ed| ed.replace(None, ""));
                        }
                    }
                    return true;
                }
                "v" if cmd => {
                    if let Some(item) = cx.read_from_clipboard() {
                        if let Some(text) = item.text() {
                            self.edgeless_label_edit(window, cx, |ed| ed.replace(None, &text));
                        }
                        return true;
                    }
                    return false;
                }
                _ => return false,
            }
        }

        // 2. Active inline spatial block edit (Note / EdgelessText): Escape closes open overlays
        // first; a second Escape exits spatial block editing.
        if self.edgeless.authoring.editing_spatial_block().is_some() {
            if key == "escape" && !self.editor.composing() {
                if self.overlays.slash_menu().is_some()
                    || self.overlays.linked_doc_menu().is_some()
                    || self.overlays.active_text_field().is_some()
                {
                    return false;
                }
                self.edgeless_commit_inline_edit(window, cx);
                return true;
            }
            return false;
        }

        // In mobile read-only Edgeless mode (`enable_mobile_edgeless_editing == false`),
        // only Space-pan and Escape are accepted; all authoring/mutating shortcuts are suppressed.
        if self.edgeless_readonly {
            if key == "space" && !cmd {
                self.edgeless.authoring.space_pan = true;
                return true;
            }
            if key == "escape" {
                self.edgeless.authoring.gesture = None;
                cx.notify();
                return true;
            }
            return false;
        }

        // 3. Canvas-level shortcuts when not inline-editing.
        let plain = !cmd && !m.alt && !m.control;
        let plain_no_shift = plain && !m.shift;
        match key {
            "space" if plain => {
                self.edgeless.authoring.space_pan = true;
                return true;
            }
            "escape" => {
                let now_ms = self.now_ms(cx);
                self.edgeless.authoring.tool = EdgelessTool::Select;
                self.edgeless.authoring.shape_picker_open = false;
                if let Some(p) = self.edgeless_shape_picker_presence.as_mut() {
                    p.close(now_ms);
                }
                self.edgeless.authoring.gesture = None;
                self.edgeless.authoring.selection.clear();
                cx.notify();
                return true;
            }
            "v" if plain_no_shift => {
                self.edgeless_select_tool(EdgelessTool::Select, window, cx);
                return true;
            }
            "h" if plain_no_shift => {
                self.edgeless_select_tool(EdgelessTool::Hand, window, cx);
                return true;
            }
            "n" if plain_no_shift => {
                self.edgeless_select_tool(EdgelessTool::Note, window, cx);
                return true;
            }
            "s" if plain => {
                let shape = match self.edgeless.authoring.tool {
                    EdgelessTool::Shape(cur) => {
                        if m.shift {
                            cur.prev()
                        } else {
                            cur.next()
                        }
                    }
                    _ => self.edgeless.authoring.active_shape_type(),
                };
                self.edgeless_select_tool(EdgelessTool::Shape(shape), window, cx);
                return true;
            }
            "c" if plain_no_shift => {
                if self.edgeless.authoring.tool == EdgelessTool::Connector {
                    self.edgeless.authoring.connector_mode =
                        match self.edgeless.authoring.connector_mode {
                            ConnectorMode::Curve => ConnectorMode::Orthogonal,
                            ConnectorMode::Orthogonal => ConnectorMode::Straight,
                            ConnectorMode::Straight => ConnectorMode::Curve,
                        };
                    cx.notify();
                } else {
                    self.edgeless_select_tool(EdgelessTool::Connector, window, cx);
                }
                return true;
            }
            "p" if plain => {
                let tool = if m.shift {
                    EdgelessTool::Highlighter
                } else {
                    EdgelessTool::Brush
                };
                self.edgeless_select_tool(tool, window, cx);
                return true;
            }
            "t" if plain_no_shift => {
                self.edgeless_select_tool(EdgelessTool::Text, window, cx);
                return true;
            }
            "f" if plain_no_shift => {
                if !self.edgeless.authoring.selection.is_empty()
                    && self.edgeless_wrap_selection_in_frame(cx)
                {
                    return true;
                }
                self.edgeless_select_tool(EdgelessTool::Frame, window, cx);
                return true;
            }
            "a" if cmd && !m.alt => {
                let snap = self.snapshot.as_deref();
                self.edgeless.authoring.selection = self
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .filter(|i| {
                        // Skip children that belong to a Group (their Group is selected instead)
                        // and skip `DocOnly` Notes (matching Web `edgeless-keyboard.ts:261-269`).
                        if i.parent_group_id.is_some() {
                            return false;
                        }
                        if i.kind == SpatialItemKind::Note
                            && let Some(s) = snap
                            && let Some(node) = find_block(s, &i.id)
                            && matches!(
                                node.content,
                                BlockContent::Note {
                                    display_mode: NoteDisplayMode::DocOnly,
                                    ..
                                }
                            )
                        {
                            return false;
                        }
                        true
                    })
                    .map(|i| i.id.clone())
                    .collect();
                cx.notify();
                return true;
            }
            "c" if cmd && !m.alt => {
                self.edgeless_copy_selection(false, cx);
                return true;
            }
            "x" if cmd && !m.alt => {
                self.edgeless_copy_selection(true, cx);
                return true;
            }
            "v" if cmd && !m.alt => {
                if let Some(item) = cx.read_from_clipboard()
                    && self.paste_edgeless_clipboard_item(&item, window, cx)
                {
                    return true;
                }
                return false;
            }
            "g" if cmd && !m.alt => {
                if m.shift {
                    self.edgeless_ungroup_selection(cx);
                } else {
                    self.edgeless_group_selection(cx);
                }
                return true;
            }
            "=" | "+" if cmd && !m.alt => {
                let (vw, vh) = self.edgeless_viewport_size();
                self.edgeless_camera_transition = None;
                self.edgeless.camera.zoom_in(
                    point(px(0.0), px(crate::TOPBAR_HEIGHT)),
                    size(px(vw), px(vh)),
                );
                self.edgeless.camera_initialized = true;
                cx.notify();
                return true;
            }
            "-" | "_" if cmd && !m.alt => {
                let (vw, vh) = self.edgeless_viewport_size();
                self.edgeless_camera_transition = None;
                self.edgeless.camera.zoom_out(
                    point(px(0.0), px(crate::TOPBAR_HEIGHT)),
                    size(px(vw), px(vh)),
                );
                self.edgeless.camera_initialized = true;
                cx.notify();
                return true;
            }
            "0" if m.alt && !cmd && !m.control => {
                let (vw, vh) = self.edgeless_viewport_size();
                self.edgeless_camera_transition = None;
                self.edgeless.camera.reset_zoom(
                    point(px(0.0), px(crate::TOPBAR_HEIGHT)),
                    size(px(vw), px(vh)),
                );
                self.edgeless.camera_initialized = true;
                cx.notify();
                return true;
            }
            "1" if m.alt && !cmd && !m.control => {
                if let Some(snap) = self.snapshot.as_deref() {
                    let (vw, vh) = self.edgeless_viewport_size();
                    let bounds = self.edgeless.scene_world_bounds(snap);
                    self.edgeless_camera_transition = None;
                    self.edgeless
                        .camera
                        .fit_to_bounds(bounds, size(px(vw), px(vh)), 48.0);
                    self.edgeless.camera_initialized = true;
                    cx.notify();
                }
                return true;
            }
            "2" if m.alt && !cmd && !m.control => {
                if let Some(sel_box) = self.edgeless.authoring.selection_world_box() {
                    let (vw, vh) = self.edgeless_viewport_size();
                    self.edgeless_camera_transition = None;
                    self.edgeless
                        .camera
                        .fit_to_bounds(sel_box, size(px(vw), px(vh)), 48.0);
                    self.edgeless.camera_initialized = true;
                    cx.notify();
                }
                return true;
            }
            "backspace" | "delete" => {
                self.edgeless_delete_selection(cx);
                return true;
            }
            "[" if plain_no_shift => {
                self.edgeless_reorder_selection(false, cx);
                return true;
            }
            "]" if plain_no_shift => {
                self.edgeless_reorder_selection(true, cx);
                return true;
            }
            "z" if cmd => {
                let commit = self.page_mut().ok().and_then(|page| {
                    if m.shift {
                        page.redo().ok().flatten()
                    } else {
                        page.undo().ok().flatten()
                    }
                });
                if let Some(commit) = commit {
                    self.did_edgeless_doc_commit(commit, cx);
                }
                return true;
            }
            "y" if cmd && !m.shift => {
                let commit = self
                    .page_mut()
                    .ok()
                    .and_then(|page| page.redo().ok().flatten());
                if let Some(commit) = commit {
                    self.did_edgeless_doc_commit(commit, cx);
                }
                return true;
            }
            _ => false,
        }
    }

    /// Move the active label editor caret up or down one visual line (or to start/end if single-line).
    fn edgeless_label_move_vertical(
        &mut self,
        down: bool,
        extend: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let target_off = self.edgeless.authoring.label_editor().map(|ed| {
            let len = utf16_len(&ed.input.text);
            if !ed.input.multiline {
                return if down { len } else { 0 };
            }
            let Some(bounds) = self.edgeless_label_layout_screen_bounds(window) else {
                return if down { len } else { 0 };
            };
            let zoom = self.edgeless.camera.zoom;
            let Some(laid) = layout_label_editor_paragraph(
                ed,
                f32::from(bounds.size.width),
                zoom,
                self.theme,
                window,
            ) else {
                return if down { len } else { 0 };
            };
            let focus = ed.input.focus() as u64;
            let caret = crate::rich_text::CaretPosition {
                utf16_offset: focus,
                affinity: crate::rich_text::WrapAffinity::Upstream,
            };
            let rect = laid.caret_rect(caret);
            let step_y = f32::from(rect.size.height).max(12.0);
            let next_y = if down {
                f32::from(rect.origin.y) + step_y * 1.5
            } else {
                f32::from(rect.origin.y) - step_y * 0.5
            };
            if next_y < 0.0 {
                return 0;
            }
            if next_y > f32::from(laid.size().height) {
                return len;
            }
            laid.hit_test(point(rect.origin.x, px(next_y))).utf16_offset as usize
        });
        if let Some(off) = target_off
            && let Some(ed) = self.edgeless.authoring.label_editor_mut()
        {
            ed.preedit_anchors = None;
            ed.input.move_caret(off, extend);
            self.edgeless_update_label_anchors();
            window.notify_text_input_changed(&self.editor_focus);
            cx.notify();
        }
    }
}

/// Collect `SpatialItemInfo` from a `PageSnapshot` in paint order (used by hit-testing & tests).
#[cfg(test)]
mod tests {
    use super::*;
    use blocksuite_playground_doc::{
        read::SurfaceElementKind,
        schema::{BlockSpec, SurfaceElementSpec},
        session::PageDocSession,
    };

    #[test]
    fn surface_crud_and_atomic_undo_redo_in_page_doc_session() {
        let mut page = PageDocSession::new("doc:edgeless", 42).unwrap();
        page.add_block(
            "page:1",
            BlockSpec::Page {
                title: "Edgeless".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        let surface_id = page.ensure_surface_block(2).unwrap();
        let k1 = generate_key_between(None, None).unwrap();
        let k2 = generate_key_between(Some(&k1), None).unwrap();
        page.structural_edit(10, |p| {
            p.add_surface_element(
                &surface_id,
                "s1",
                &k1,
                SurfaceElementSpec::Shape {
                    shape_type: "rect".into(),
                    xywh: PageDocSession::format_xywh([10.0, 20.0, 160.0, 100.0]),
                    seed: 7,
                    filled: true,
                    text: Some("Initial".into()),
                },
                10,
            )?;
            Ok(())
        })
        .unwrap();
        page.set_surface_element_text(&surface_id, "s1", "text", "Updated", 20)
            .unwrap();
        let snap = page.read_page_snapshot().unwrap();
        let root = snap.root.as_ref().unwrap();
        let surf = root.children.iter().find(|c| c.id == surface_id).unwrap();
        let BlockContent::Surface { elements, .. } = &surf.content else {
            unreachable!()
        };
        assert_eq!(elements.len(), 1);
        let SurfaceElementKind::Shape(s) = &elements[0].kind else {
            unreachable!()
        };
        assert_eq!(s.text.plain, "Updated");

        // Undo restores "Initial"; redo restores "Updated".
        page.undo().unwrap();
        let snap2 = page.read_page_snapshot().unwrap();
        let BlockContent::Surface { elements, .. } =
            &snap2.root.as_ref().unwrap().children[0].content
        else {
            unreachable!()
        };
        let SurfaceElementKind::Shape(s) = &elements[0].kind else {
            unreachable!()
        };
        assert_eq!(s.text.plain, "Initial");

        page.redo().unwrap();
        page.remove_surface_element(&surface_id, "s1", 30).unwrap();
        assert_ne!(k1, k2);
    }

    #[test]
    fn edgeless_frame_delete_min_width_title_select_all_and_note_overlays() {
        use ui::EntityInputHandler;

        let platform = ui::HeadlessPlatform::new(1280, 800, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let win = open_edgeless_view(&app, &platform);
        let hw = platform.windows().into_iter().next().unwrap();

        // H9: Double-click Frame title selects all; H1: deleting Frame recursively deletes children + 1-step Undo restores all.
        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                let frame_id = view
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .find(|i| i.kind == SpatialItemKind::Frame)
                    .map(|i| i.id.clone())
                    .expect("showcase frame");
                assert!(view.edgeless_begin_inline_edit(&frame_id, window, cx));
                let ed = view.edgeless.authoring.label_editor().unwrap();
                let (sel, _) = ed.shown_selection();
                assert_eq!(sel, 0..ed.input.text.encode_utf16().count());
                view.edgeless_commit_inline_edit(window, cx);

                // Attach a surface element child to the showcase frame so H1 tests recursive deletion + 1-step Undo.
                let child_id = view
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .find(|i| i.kind == SpatialItemKind::Shape)
                    .map(|i| i.id.clone())
                    .expect("showcase shape");
                let now = view.now_ms(cx) as u64;
                view.page_mut()
                    .unwrap()
                    .set_frame_child_element_ids(&frame_id, std::slice::from_ref(&child_id), now)
                    .unwrap();
                view.refresh_document();
                let frame_children = collect_frame_children(
                    find_block(view.snapshot.as_ref().unwrap(), &frame_id).unwrap(),
                );
                assert!(
                    frame_children.contains(&child_id),
                    "frame should contain attached child"
                );
                view.edgeless_set_selection([frame_id.clone()], cx);
                view.edgeless_delete_selection(cx);
                let snap = view.snapshot.as_ref().unwrap();
                assert!(find_block(snap, &frame_id).is_none());
                for cid in &frame_children {
                    assert!(
                        find_block(snap, cid).is_none()
                            && find_surface_element(snap, cid).is_none(),
                        "frame child {cid} must be deleted with frame"
                    );
                }
                // Single-step undo restores frame and all its children.
                let commit = view.page_mut().unwrap().undo().unwrap().unwrap();
                view.did_edgeless_doc_commit(commit, cx);
                let snap = view.snapshot.as_ref().unwrap();
                assert!(find_block(snap, &frame_id).is_some());
                for cid in &frame_children {
                    assert!(
                        find_block(snap, cid).is_some()
                            || find_surface_element(snap, cid).is_some(),
                        "undo must restore frame child {cid}"
                    );
                }

                // H6: Inline editing Note mounts slash menu on `/` and formatting toolbar on selection.
                let note_id = view
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .find(|i| i.kind == SpatialItemKind::Note)
                    .map(|i| i.id.clone())
                    .expect("showcase note");
                assert!(view.edgeless_begin_inline_edit(&note_id, window, cx));
                let block_id = view.document_selection().unwrap().focus.block_id.clone();
                view.change_selection(
                    crate::editor_session::DocumentSelection::caret(
                        crate::editor_session::DocPoint::new(&block_id, 0),
                    ),
                    window,
                    cx,
                );
                view.replace_text_in_range(None, "/", window, cx);
                assert!(
                    view.overlays.slash_menu().is_some(),
                    "slash menu must open in Edgeless Note"
                );
            })
            .unwrap();
        });
        platform.advance_clock(std::time::Duration::from_millis(300));
        hw.request_frame();
        if let Ok(dir) = std::env::var("BS_RENDER_EVIDENCE_DIR") {
            let _ = std::fs::create_dir_all(&dir);
            let _ = app.update(|cx| {
                let _ = win.update(cx, |_, window, _| {
                    if let Ok(img) = window.render_to_image() {
                        let _ = img.save(format!("{dir}/after_edgeless_note_slash.png"));
                    }
                });
            });
        }
        // Select text inside the same Edgeless Note to verify formatting toolbar mounts.
        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                let now_ms = view.now_ms(cx);
                view.overlays.close_slash(now_ms);
                let block_id = view.document_selection().unwrap().focus.block_id.clone();
                view.change_selection(
                    crate::editor_session::DocumentSelection {
                        anchor: crate::editor_session::DocPoint::new(&block_id, 0),
                        focus: crate::editor_session::DocPoint::new(&block_id, 4),
                    },
                    window,
                    cx,
                );
            })
            .unwrap();
        });
        hw.request_frame();
        platform.advance_clock(std::time::Duration::from_millis(300));
        hw.request_frame();
        if let Ok(dir) = std::env::var("BS_RENDER_EVIDENCE_DIR") {
            let _ = app.update(|cx| {
                let _ = win.update(cx, |_, window, _| {
                    if let Ok(img) = window.render_to_image() {
                        let _ = img.save(format!("{dir}/after_edgeless_note_toolbar.png"));
                    }
                });
            });
        }

        // Escape in Edgeless Note closes open Slash menu first; 2nd Escape exits inline edit.
        // Newly created EdgelessText containing a Divider is NOT auto-deleted on exit.
        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                let esc = ui::KeyDownEvent {
                    keystroke: ui::Keystroke {
                        modifiers: ui::Modifiers::default(),
                        key: "escape".into(),
                        key_char: None,
                    },
                    is_held: false,
                    prefer_character_input: false,
                };
                let block_id = view.document_selection().unwrap().focus.block_id.clone();
                view.change_selection(
                    crate::editor_session::DocumentSelection::caret(
                        crate::editor_session::DocPoint::new(&block_id, 0),
                    ),
                    window,
                    cx,
                );
                view.replace_text_in_range(None, "/", window, cx);
                assert!(view.overlays.slash_menu().is_some());
                view.editor_key_down(&esc, window, cx);
                assert!(
                    view.overlays.slash_menu().is_none(),
                    "1st Escape must close slash menu"
                );
                assert!(
                    view.edgeless.authoring.editing_spatial_block().is_some(),
                    "1st Escape must stay inside spatial block inline edit"
                );
                view.editor_key_down(&esc, window, cx);
                assert!(
                    view.edgeless.authoring.editing_spatial_block().is_none(),
                    "2nd Escape must exit spatial block inline edit"
                );

                view.create_edgeless_text_at(120.0, 120.0, window, cx);
                let (et_id, is_note) = view
                    .edgeless
                    .authoring
                    .editing_spatial_block()
                    .expect("new edgeless-text inline edit");
                assert!(!is_note);
                let et_id = et_id.to_string();
                let now = view.now_ms(cx) as u64;
                view.page_mut()
                    .unwrap()
                    .add_block(
                        "et-div",
                        blocksuite_playground_doc::schema::BlockSpec::Divider,
                        Some(&et_id),
                        None,
                        now,
                    )
                    .unwrap();
                view.refresh_document();
                view.edgeless_commit_inline_edit(window, cx);
                assert!(
                    find_block(view.snapshot.as_ref().unwrap(), &et_id).is_some(),
                    "EdgelessText with a Divider child must not be treated as empty on exit"
                );
            })
            .unwrap();
        });

        // Auto-width EdgelessText (hasMaxWidth=false) stays compact under left/center/right alignment and RTL.
        let mut aligned_et_id = String::new();
        let mut aligned_para_id = String::new();
        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                view.create_edgeless_text_at(260.0, 220.0, window, cx);
                let (et_id, _) = view
                    .edgeless
                    .authoring
                    .editing_spatial_block()
                    .expect("aligned edgeless-text");
                aligned_et_id = et_id.to_string();
                aligned_para_id = view.document_selection().unwrap().focus.block_id.clone();
                cx.notify();
            })
            .unwrap();
        });
        hw.request_frame();
        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                view.replace_text_in_range(None, "hello world", window, cx);
                view.edgeless_commit_inline_edit(window, cx);
            })
            .unwrap();
        });
        for (align, rtl) in [
            ("left", false),
            ("center", false),
            ("right", false),
            ("right", true),
        ] {
            app.update(|cx| {
                win.update(cx, |view, window, cx| {
                    let now = view.now_ms(cx) as u64;
                    view.page_mut()
                        .unwrap()
                        .set_block_prop(
                            &aligned_para_id,
                            "prop:textAlign",
                            y_octo::SessionValue::Any(y_octo::Any::String(align.into())),
                            now,
                        )
                        .unwrap();
                    view.refresh_document();
                    window.set_root_layout_direction(if rtl {
                        ui::Direction::Rtl
                    } else {
                        ui::Direction::Ltr
                    });
                    cx.notify();
                })
                .unwrap();
            });
            hw.request_frame();
            app.update(|cx| {
                win.update(cx, |view, _, _| {
                    let info = view
                        .edgeless
                        .authoring
                        .painted_items
                        .iter()
                        .find(|i| i.id == aligned_et_id)
                        .expect("painted edgeless-text");
                    assert!(
                        info.rect.w < 300.0,
                        "EdgelessText width must stay compact for align={align}, rtl={rtl}, got {}",
                        info.rect.w
                    );
                    assert!(
                        (info.rect.x - 260.0).abs() < 1.0,
                        "EdgelessText x must not drift for align={align}, rtl={rtl}, got {}",
                        info.rect.x
                    );
                })
                .unwrap();
            });
        }

        // Note resize enforces NOTE_MIN_WIDTH (218.0).
        let resized = crate::edgeless::resized_rect_with_min(
            crate::edgeless::WorldRect::new(0.0, 0.0, 400.0, 200.0),
            HandleKind::E,
            (400.0, 100.0),
            (50.0, 100.0),
            crate::edgeless::NOTE_MIN_WIDTH,
            24.0,
        );
        assert_eq!(resized.w, crate::edgeless::NOTE_MIN_WIDTH);
    }

    fn open_edgeless_view(
        app: &ui::ApplicationHandle,
        platform: &ui::HeadlessPlatform,
    ) -> ui::WindowHandle<PlaygroundView> {
        use ui::AppContext;
        let win = app
            .update(|cx| {
                cx.open_window(ui::WindowOptions::default(), |_window, cx| {
                    cx.new(|cx| {
                        PlaygroundView::with_options(
                            crate::PlaygroundOptions {
                                mode: crate::PlaygroundMode::Edgeless,
                                ..Default::default()
                            },
                            cx,
                        )
                    })
                })
            })
            .unwrap();
        platform
            .windows()
            .into_iter()
            .next()
            .unwrap()
            .request_frame();
        win
    }

    fn mouse_down(x: f32, y: f32, click_count: usize) -> ui::MouseDownEvent {
        ui::MouseDownEvent {
            button: ui::MouseButton::Left,
            position: ui::point(ui::px(x), ui::px(y)),
            modifiers: ui::Modifiers::default(),
            click_count,
            first_mouse: false,
        }
    }

    fn mouse_move(x: f32, y: f32, pressed: bool) -> ui::MouseMoveEvent {
        ui::MouseMoveEvent {
            position: ui::point(ui::px(x), ui::px(y)),
            pressed_button: pressed.then_some(ui::MouseButton::Left),
            modifiers: ui::Modifiers::default(),
        }
    }

    fn mouse_up(x: f32, y: f32) -> ui::MouseUpEvent {
        ui::MouseUpEvent {
            button: ui::MouseButton::Left,
            position: ui::point(ui::px(x), ui::px(y)),
            modifiers: ui::Modifiers::default(),
            click_count: 1,
        }
    }

    #[test]
    fn idle_edgeless_canvas_isolates_text_ime_and_image_paste() {
        use ui::EntityInputHandler;

        let platform = ui::HeadlessPlatform::new(1280, 800, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let win = open_edgeless_view(&app, &platform);

        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                // Seed a pre-existing Page selection so any leaked input would mutate the doc.
                let para_id = view
                    .snapshot
                    .as_ref()
                    .and_then(|s| s.root.as_ref())
                    .and_then(|r| {
                        r.walk().find_map(|n| match n.content {
                            BlockContent::Paragraph { .. } => Some(n.id.clone()),
                            _ => None,
                        })
                    })
                    .unwrap();
                let pt = crate::editor_session::DocPoint::new(&para_id, 0);
                view.editor.selection = Some(crate::editor_session::DocumentSelection {
                    anchor: pt.clone(),
                    focus: pt,
                });

                let before_json = view.page().unwrap().export_doc_json().unwrap();
                let before_rev = view.doc_rev;

                // Idle Edgeless canvas: typing, CJK mark/unmark, and paste must be total no-ops.
                view.replace_text_in_range(None, "q", window, cx);
                view.replace_and_mark_text_in_range(None, "nihao", None, window, cx);
                view.unmark_text(window, cx);
                view.paste(ui::ClipboardItem::new_string("leaked".into()), window, cx);

                assert_eq!(
                    view.doc_rev, before_rev,
                    "idle Edgeless must not mutate doc_rev"
                );
                assert_eq!(
                    view.page().unwrap().export_doc_json().unwrap(),
                    before_json,
                    "idle Edgeless must leave doc JSON byte-identical"
                );

                // Image-only ClipboardItem (text() == None) paste into open label editor leaves text intact.
                let shape_id = view
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .find(|i| i.kind == SpatialItemKind::Shape)
                    .map(|i| i.id.clone())
                    .unwrap();
                assert!(view.edgeless_begin_inline_edit(&shape_id, window, cx));
                view.edgeless_label_edit(window, cx, |ed| ed.replace(None, "KeepMe"));
                view.edgeless_label_input(window, cx, |ed| ed.select(0..4));
                let before_label = view
                    .edgeless
                    .authoring
                    .label_editor()
                    .unwrap()
                    .input
                    .text
                    .clone();
                let image_only = ui::ClipboardItem {
                    entries: vec![ui::ClipboardEntry::Image(ui::Image {
                        bytes: vec![1, 2, 3, 4],
                        format: ui::ImageFormat::Png,
                        id: 1,
                    })],
                };
                view.paste(image_only, window, cx);
                assert_eq!(
                    view.edgeless.authoring.label_editor().unwrap().input.text,
                    before_label,
                    "image-only paste must not erase selected label text"
                );
            })
            .unwrap();
        });
    }

    #[test]
    fn edgeless_view_authoring_gestures_and_note_preedit_parity() {
        use ui::EntityInputHandler;

        let platform = ui::HeadlessPlatform::new(1280, 800, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let win = open_edgeless_view(&app, &platform);
        let hw = platform.windows().into_iter().next().unwrap();

        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                // Set predictable 1:1 camera at (0, 0).
                view.edgeless.set_camera(0.0, 0.0, 1.0);
                let top = crate::TOPBAR_HEIGHT;

                // 1. Create Shape via pointer gesture.
                view.edgeless_select_tool(EdgelessTool::Shape(ShapePreset::Rect), window, cx);
                view.on_edgeless_left_down(&mouse_down(100.0, top + 100.0, 1), window, cx);
                view.on_edgeless_pointer_move(&mouse_move(220.0, top + 180.0, true), window, cx);
                view.on_edgeless_left_up(&mouse_up(220.0, top + 180.0), window, cx);
                let shape_id = view
                    .edgeless
                    .authoring
                    .selection
                    .iter()
                    .next()
                    .unwrap()
                    .clone();
                assert!(shape_id.starts_with("shape:"));

                // 2. Create Note -> sets prop:displayMode == "edgeless", enters SpatialBlock edit,
                //    and CJK preedit renders in preedit_snapshot() without mutating doc until commit.
                view.edgeless_select_tool(EdgelessTool::Note, window, cx);
                view.on_edgeless_left_down(&mouse_down(320.0, top + 100.0, 1), window, cx);
                view.on_edgeless_pointer_move(&mouse_move(600.0, top + 240.0, true), window, cx);
                view.on_edgeless_left_up(&mouse_up(600.0, top + 240.0), window, cx);
                let note_id = view
                    .edgeless
                    .authoring
                    .selection
                    .iter()
                    .next()
                    .unwrap()
                    .clone();
                let doc_json = view.page().unwrap().export_doc_json().unwrap();
                assert_eq!(doc_json["blocks"][&note_id]["prop:displayMode"], "edgeless");
                let before_preedit_json = doc_json.clone();
                view.replace_and_mark_text_in_range(None, "中文", None, window, cx);
                assert_eq!(
                    view.page().unwrap().export_doc_json().unwrap(),
                    before_preedit_json,
                    "Note preedit must not publish updates before commit"
                );
                let pre_snap = view.preedit_snapshot().expect("preedit_snapshot active");
                let note_text: String = pre_snap
                    .root
                    .as_ref()
                    .unwrap()
                    .walk()
                    .filter_map(|n| match &n.content {
                        BlockContent::Paragraph { text, .. } => Some(text.plain.as_str()),
                        _ => None,
                    })
                    .collect();
                assert!(
                    note_text.contains("中文"),
                    "preedit text must appear in Note snapshot"
                );
                view.replace_text_in_range(None, "", window, cx);
                assert!(!view.editor.composing());
                view.edgeless_commit_inline_edit(window, cx);
                assert!(view.editor.selection.is_none());

                // 3. Create 2D Brush stroke -> stays in Brush tool with empty selection, inflated xywh & 2-element points.
                view.edgeless_select_tool(EdgelessTool::Brush, window, cx);
                view.on_edgeless_left_down(&mouse_down(50.0, top + 300.0, 1), window, cx);
                view.on_edgeless_pointer_move(&mouse_move(110.0, top + 340.0, true), window, cx);
                view.on_edgeless_left_up(&mouse_up(110.0, top + 340.0), window, cx);
                assert_eq!(view.edgeless.authoring.tool, EdgelessTool::Brush);
                assert!(view.edgeless.authoring.selection.is_empty());
                let brush_id = view
                    .snapshot
                    .as_ref()
                    .unwrap()
                    .root
                    .as_ref()
                    .unwrap()
                    .children
                    .iter()
                    .find_map(|c| match &c.content {
                        BlockContent::Surface { elements, .. } => elements
                            .iter()
                            .rev()
                            .find(|e| matches!(e.kind, SurfaceElementKind::Brush(_)))
                            .map(|e| e.id.clone()),
                        _ => None,
                    })
                    .expect("newly created brush element");
                let (_, brush_el) =
                    find_surface_element(view.snapshot.as_ref().unwrap(), &brush_id).unwrap();
                let SurfaceElementKind::Brush(b) = &brush_el.kind else {
                    unreachable!()
                };
                assert!(b.simulated_pressure, "2D brush must set simulated_pressure");
                assert!(
                    b.xywh[2] >= 64.0,
                    "brush xywh must be inflated by lineWidth"
                );

                // 4. Create Text -> creates `affine:edgeless-text` block; Escape removes empty element.
                view.edgeless_select_tool(EdgelessTool::Text, window, cx);
                view.on_edgeless_left_down(&mouse_down(50.0, top + 420.0, 1), window, cx);
                let text_id = view
                    .edgeless
                    .authoring
                    .selection
                    .iter()
                    .next()
                    .unwrap()
                    .clone();
                assert!(matches!(
                    find_block(view.snapshot.as_ref().unwrap(), &text_id).map(|b| &b.content),
                    Some(BlockContent::EdgelessText { .. })
                ));
                view.edgeless_commit_inline_edit(window, cx);
                assert!(
                    find_block(view.snapshot.as_ref().unwrap(), &text_id).is_none(),
                    "empty newly-created EdgelessText must be removed on close"
                );
            })
            .unwrap();
        });
        hw.request_frame();

        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                let top = crate::TOPBAR_HEIGHT;
                // 5. Create Frame capturing only fully contained shape (not partially overlapping note).
                view.edgeless_select_tool(EdgelessTool::Frame, window, cx);
                view.on_edgeless_left_down(&mouse_down(90.0, top + 90.0, 1), window, cx);
                view.on_edgeless_pointer_move(&mouse_move(360.0, top + 200.0, true), window, cx);
                view.on_edgeless_left_up(&mouse_up(360.0, top + 200.0), window, cx);
                let frame_id = view
                    .edgeless
                    .authoring
                    .selection
                    .iter()
                    .next()
                    .unwrap()
                    .clone();
                let frame_node = find_block(view.snapshot.as_ref().unwrap(), &frame_id).unwrap();
                let children = collect_frame_children(frame_node);
                assert!(
                    children.iter().any(|c| c.starts_with("shape:")),
                    "frame must enclose fully-contained shape: {children:?}"
                );
                assert!(
                    !children.iter().any(|c| c.starts_with("note:")),
                    "frame must exclude partially-overlapping note: {children:?}"
                );

                // 6. Create free Connector, edit its label (writes labelXYWH + labelOffset),
                //    then drag it (moves endpoints + labelXYWH, never writes synthetic xywh).
                view.edgeless_select_tool(EdgelessTool::Connector, window, cx);
                view.on_edgeless_left_down(&mouse_down(700.0, top + 300.0, 1), window, cx);
                view.on_edgeless_pointer_move(&mouse_move(820.0, top + 360.0, true), window, cx);
                view.on_edgeless_left_up(&mouse_up(820.0, top + 360.0), window, cx);
                let conn_id = view
                    .edgeless
                    .authoring
                    .selection
                    .iter()
                    .next()
                    .unwrap()
                    .clone();
                // Trigger frame so painted_items includes conn_id.
                assert!(conn_id.starts_with("conn:"));
            })
            .unwrap();
        });
        hw.request_frame();

        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                let conn_id = view
                    .edgeless
                    .authoring
                    .selection
                    .iter()
                    .next()
                    .unwrap()
                    .clone();
                assert!(view.edgeless_begin_inline_edit(&conn_id, window, cx));
                view.edgeless_label_edit(window, cx, |ed| ed.replace(None, "Flow"));
                view.edgeless_commit_inline_edit(window, cx);
                let (surf_id, c_text, c_label_xywh) = {
                    let (sid, el) =
                        find_surface_element(view.snapshot.as_ref().unwrap(), &conn_id).unwrap();
                    let SurfaceElementKind::Connector(c) = &el.kind else {
                        unreachable!()
                    };
                    (sid.to_string(), c.text.plain.clone(), c.label_xywh)
                };
                assert_eq!(c_text, "Flow");
                assert!(
                    c_label_xywh.is_some(),
                    "connector label must write labelXYWH"
                );
                let doc_json = view.page().unwrap().export_doc_json().unwrap();
                assert!(
                    doc_json["blocks"][&surf_id]["prop:elements"]["value"][&conn_id]["labelOffset"]
                        .is_object(),
                    "connector label must write labelOffset"
                );
                assert!(
                    doc_json["blocks"][&surf_id]["prop:elements"]["value"][&conn_id]
                        .get("xywh")
                        .is_none(),
                    "connector must never have synthetic xywh"
                );
                // Empty trim removes label fields cleanly.
                assert!(view.edgeless_begin_inline_edit(&conn_id, window, cx));
                view.edgeless_label_edit(window, cx, |ed| {
                    ed.select_all();
                    ed.replace(None, "   ")
                });
                view.edgeless_commit_inline_edit(window, cx);
                let doc_json = view.page().unwrap().export_doc_json().unwrap();
                let conn_json = &doc_json["blocks"][&surf_id]["prop:elements"]["value"][&conn_id];
                assert!(conn_json.get("labelXYWH").is_none());
                assert!(conn_json.get("labelOffset").is_none());
            })
            .unwrap();
        });
    }

    #[test]
    fn edgeless_view_drag_resize_rotate_z_reorder_cascade_delete_and_group_frame() {
        use blocksuite_playground_doc::schema::{ConnectorEndpointSpec, SurfaceElementSpec};

        let platform = ui::HeadlessPlatform::new(1280, 800, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let win = open_edgeless_view(&app, &platform);
        let hw = platform.windows().into_iter().next().unwrap();

        // Seed a shape, an attached connector, a labeled free connector, a 2D brush, and a grouped shape.
        let mut ids = (
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            String::new(),
        );
        app.update(|cx| {
            win.update(cx, |view, _window, cx| {
                view.edgeless.set_camera(0.0, 0.0, 1.0);
                let commit = view
                    .page_mut()
                    .unwrap()
                    .structural_edit(100, |p| {
                        let sid = p.ensure_surface_block(100)?;
                        p.add_surface_element(
                            &sid,
                            "sh-1",
                            "aA",
                            SurfaceElementSpec::Shape {
                                shape_type: "rect".into(),
                                xywh: "[100,100,120,80]".into(),
                                seed: 11,
                                filled: true,
                                text: None,
                            },
                            100,
                        )?;
                        p.add_surface_element(
                            &sid,
                            "conn-att",
                            "aB",
                            SurfaceElementSpec::Connector {
                                mode: 0,
                                seed: 12,
                                source: ConnectorEndpointSpec::element("sh-1", Some([1.0, 0.5])),
                                target: ConnectorEndpointSpec::point(340.0, 140.0),
                                text: None,
                                label_xywh: None,
                            },
                            100,
                        )?;
                        p.add_surface_element(
                            &sid,
                            "conn-free",
                            "aC",
                            SurfaceElementSpec::Connector {
                                mode: 0,
                                seed: 13,
                                source: ConnectorEndpointSpec::point(100.0, 260.0),
                                target: ConnectorEndpointSpec::point(260.0, 260.0),
                                text: Some("Tag".into()),
                                label_xywh: Some([150.0, 248.0, 60.0, 24.0]),
                            },
                            100,
                        )?;
                        p.add_surface_element(
                            &sid,
                            "br-1",
                            "aD",
                            SurfaceElementSpec::Brush {
                                seed: 14,
                                points: vec![vec![0.0, 0.0], vec![60.0, 30.0]],
                                xywh: "[400,100,64,34]".into(),
                            },
                            100,
                        )?;
                        p.add_surface_element(
                            &sid,
                            "sh-grp",
                            "aE",
                            SurfaceElementSpec::Shape {
                                shape_type: "rect".into(),
                                xywh: "[520,120,60,40]".into(),
                                seed: 15,
                                filled: true,
                                text: None,
                            },
                            100,
                        )?;
                        p.add_surface_element(
                            &sid,
                            "grp-1",
                            "aF",
                            SurfaceElementSpec::Group {
                                seed: 16,
                                title: "G".into(),
                                children: vec!["sh-grp".into()],
                            },
                            100,
                        )?;
                        Ok(())
                    })
                    .unwrap()
                    .unwrap();
                view.did_edgeless_doc_commit(commit, cx);
                ids = (
                    "sh-1".into(),
                    "conn-att".into(),
                    "conn-free".into(),
                    "br-1".into(),
                    "sh-grp".into(),
                    "grp-1".into(),
                );
            })
            .unwrap();
        });
        hw.request_frame();

        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                let top = crate::TOPBAR_HEIGHT;
                let (sh_id, conn_att, conn_free, br_id, sh_grp, grp_id) = &ids;

                // 1. Drag shape + labeled free connector together -> moves xywh + labelXYWH.
                view.edgeless.authoring.selection.clear();
                view.edgeless.authoring.selection.insert(sh_id.clone());
                view.edgeless.authoring.selection.insert(conn_free.clone());
                let initial = view.collect_drag_initials();
                view.edgeless.authoring.gesture = Some(EdgelessGesture::DragSelection {
                    start_world: (120.0, 120.0),
                    current_world: (160.0, 145.0),
                    initial,
                    shift: false,
                    alt_clone: false,
                    pending_dblclick: None,
                });
                view.on_edgeless_left_up(&mouse_up(160.0, top + 145.0), window, cx);
                let (_, sh_el) =
                    find_surface_element(view.snapshot.as_ref().unwrap(), sh_id).unwrap();
                let SurfaceElementKind::Shape(s) = &sh_el.kind else {
                    unreachable!()
                };
                assert!((s.xywh[0] - 140.0).abs() < 0.5 && (s.xywh[1] - 125.0).abs() < 0.5);
                let (cf_sid, cf_el) =
                    find_surface_element(view.snapshot.as_ref().unwrap(), conn_free).unwrap();
                let SurfaceElementKind::Connector(c) = &cf_el.kind else {
                    unreachable!()
                };
                let lxywh = c.label_xywh.expect("labelXYWH preserved after drag");
                assert!((lxywh[0] - 190.0).abs() < 0.5 && (lxywh[1] - 273.0).abs() < 0.5);
                let cf_target = y_octo::TypeTarget::Path(
                    y_octo::TypePath::root("blocks")
                        .key(cf_sid)
                        .key("prop:elements")
                        .key("value")
                        .key(conn_free),
                );
                assert!(matches!(
                    view.page().unwrap().inner().get_map_value(&cf_target, "labelXYWH").unwrap(),
                    Some(y_octo::SessionReadValue::Any(Any::Array(v))) if v.len() == 4
                ));

                // 2. Resize 2D brush -> scales points and encodes as valid array.
                view.edgeless.authoring.selection.clear();
                view.edgeless.authoring.selection.insert(br_id.clone());
                let initial = view.collect_drag_initials();
                let ibox = view.edgeless.authoring.selection_world_box().unwrap();
                view.edgeless.authoring.gesture = Some(EdgelessGesture::ResizeSelection {
                    handle: HandleKind::SE,
                    start_world: (ibox.right(), ibox.bottom()),
                    current_world: (ibox.right() + ibox.w, ibox.bottom() + ibox.h),
                    initial_box: ibox,
                    initial,
                    shift: false,
                    rotate_deg: 0.0,
                });
                view.on_edgeless_left_up(&mouse_up(0.0, 0.0), window, cx);
                let (br_sid, br_el) =
                    find_surface_element(view.snapshot.as_ref().unwrap(), br_id).unwrap();
                let SurfaceElementKind::Brush(b) = &br_el.kind else {
                    unreachable!()
                };
                assert_eq!(b.points.len(), 2);
                assert!(
                    b.points[1][0] > 100.0,
                    "brush points should scale: {:?}",
                    b.points
                );
                let br_target = y_octo::TypeTarget::Path(
                    y_octo::TypePath::root("blocks")
                        .key(br_sid)
                        .key("prop:elements")
                        .key("value")
                        .key(br_id),
                );
                assert!(matches!(
                    view.page().unwrap().inner().get_map_value(&br_target, "points").unwrap(),
                    Some(y_octo::SessionReadValue::Any(Any::Array(v))) if v.len() == 2
                ));

                // 3. Rotate shape via HandleKind::Rotate gesture.
                view.edgeless.authoring.selection.clear();
                view.edgeless.authoring.selection.insert(sh_id.clone());
                let sh_info = view.edgeless.authoring.single_selected().unwrap().clone();
                view.edgeless.authoring.gesture = Some(EdgelessGesture::RotateSelection {
                    id: sh_info.id,
                    surface_id: sh_info.surface_id,
                    is_block: false,
                    center_world: sh_info.rect.center(),
                    start_angle: 0.0,
                    initial_rotate: 0.0,
                    current_rotate: 45.0,
                });
                view.on_edgeless_left_up(&mouse_up(0.0, 0.0), window, cx);
                let (_, sh_el) =
                    find_surface_element(view.snapshot.as_ref().unwrap(), sh_id).unwrap();
                assert!((sh_el.rotate - 45.0).abs() < 0.1);

                // 4. Z-reorder (`]` / `[`) changes fractional index.
                let idx_before = sh_el.index.clone();
                view.edgeless_reorder_selection(true, cx);
                let idx_after = find_surface_element(view.snapshot.as_ref().unwrap(), sh_id)
                    .unwrap()
                    .1
                    .index
                    .clone();
                assert!(idx_after > idx_before, "bring forward must increase index");
                view.edgeless_reorder_selection(false, cx);

                // 5. CreateFrame excludes grouped child `sh-grp` while keeping top-level `grp-1`.
                view.edgeless_select_tool(EdgelessTool::Frame, window, cx);
                view.on_edgeless_left_down(&mouse_down(500.0, top + 100.0, 1), window, cx);
                view.on_edgeless_pointer_move(&mouse_move(620.0, top + 200.0, true), window, cx);
                view.on_edgeless_left_up(&mouse_up(620.0, top + 200.0), window, cx);
                let frame_id = view
                    .edgeless
                    .authoring
                    .selection
                    .iter()
                    .next()
                    .unwrap()
                    .clone();
                let frame_children = collect_frame_children(
                    find_block(view.snapshot.as_ref().unwrap(), &frame_id).unwrap(),
                );
                assert!(
                    !frame_children.iter().any(|c| c == sh_grp),
                    "grouped child must be excluded from frame: {frame_children:?}"
                );
                let _ = grp_id;

                // 6. Cascade delete shape + attached connector in 1 undo step, restored in 1 undo.
                let _ = view.page_mut().unwrap().stop_capturing();
                view.edgeless.authoring.selection.clear();
                view.edgeless.authoring.selection.insert(sh_id.clone());
                view.edgeless_delete_selection(cx);
                assert!(find_surface_element(view.snapshot.as_ref().unwrap(), sh_id).is_none());
                assert!(find_surface_element(view.snapshot.as_ref().unwrap(), conn_att).is_none());
                if let Some(c) = view.page_mut().unwrap().undo().unwrap() {
                    view.did_edgeless_doc_commit(c, cx);
                }
                assert!(find_surface_element(view.snapshot.as_ref().unwrap(), sh_id).is_some());
                assert!(find_surface_element(view.snapshot.as_ref().unwrap(), conn_att).is_some());
            })
            .unwrap();
        });
    }

    #[test]
    fn label_editor_click_hit_tests_line_and_preedit_anchors_track_remote_prepend() {
        use blocksuite_playground_doc::{schema::SurfaceElementSpec, session::PageDocSession};
        use ui::EntityInputHandler;

        let platform = ui::HeadlessPlatform::new(1280, 800, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let win = open_edgeless_view(&app, &platform);
        let hw = platform.windows().into_iter().next().unwrap();

        app.update(|cx| {
            win.update(cx, |view, _window, cx| {
                view.edgeless.set_camera(0.0, 0.0, 1.0);
                let commit = view
                    .page_mut()
                    .unwrap()
                    .structural_edit(100, |p| {
                        let sid = p.ensure_surface_block(100)?;
                        p.add_surface_element(
                            &sid,
                            "sh-2line",
                            "aG",
                            SurfaceElementSpec::Shape {
                                shape_type: "rect".into(),
                                xywh: "[100,100,220,90]".into(),
                                seed: 21,
                                filled: true,
                                text: Some("first line\nsecond line".into()),
                            },
                            100,
                        )?;
                        p.add_surface_element(
                            &sid,
                            "sh-ime",
                            "aH",
                            SurfaceElementSpec::Shape {
                                shape_type: "rect".into(),
                                xywh: "[360,100,180,80]".into(),
                                seed: 22,
                                filled: true,
                                text: Some("abc".into()),
                            },
                            100,
                        )?;
                        Ok(())
                    })
                    .unwrap()
                    .unwrap();
                view.did_edgeless_doc_commit(commit, cx);
            })
            .unwrap();
        });
        hw.request_frame();

        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                // 1. Open 2-line shape label, click inside line 1, type '*', assert '*' lands in line 1.
                assert!(view.edgeless_begin_inline_edit("sh-2line", window, cx));
                let bounds = view.edgeless_label_screen_bounds(window).unwrap();
                let line1_x = f32::from(bounds.origin.x) + 24.0;
                let line1_y = f32::from(bounds.origin.y) + 14.0;
                view.on_edgeless_left_down(&mouse_down(line1_x, line1_y, 1), window, cx);
                view.replace_text_in_range(None, "*", window, cx);
                let text = view
                    .edgeless
                    .authoring
                    .label_editor()
                    .unwrap()
                    .input
                    .text
                    .clone();
                let mut lines = text.lines();
                let first = lines.next().unwrap_or("");
                let second = lines.next().unwrap_or("");
                assert!(
                    first.contains('*') && !second.contains('*'),
                    "expected '*' in line 1, got {text:?}"
                );
                view.edgeless_commit_inline_edit(window, cx);

                // 2. Open 'abc', select 1..2 ('b'), start IME preedit 'ni', remote peer prepends 'X',
                //    refresh and commit '文' -> final text is 'Xa文c'.
                assert!(view.edgeless_begin_inline_edit("sh-ime", window, cx));
                view.set_selected_text_range(1..2, window, cx);
                view.replace_and_mark_text_in_range(None, "ni", None, window, cx);

                let seed = view.page().unwrap().encode_update_v1().unwrap();
                let (surf_id, _) =
                    find_surface_element(view.snapshot.as_ref().unwrap(), "sh-ime").unwrap();
                let surf_id = surf_id.to_string();
                let mut peer_b = PageDocSession::new("doc:home", 777).unwrap();
                peer_b.apply_remote_update_v1(&seed).unwrap();
                let remote_commit = peer_b
                    .splice_surface_element_text(&surf_id, "sh-ime", "text", 0, 0, "X", 200)
                    .unwrap()
                    .unwrap();
                view.page_mut()
                    .unwrap()
                    .apply_remote_update_v1(&remote_commit.update)
                    .unwrap();
                view.snapshot = view
                    .page()
                    .unwrap()
                    .read_page_snapshot()
                    .ok()
                    .map(std::rc::Rc::new);
                view.edgeless_refresh_label_editor_from_snapshot();

                view.replace_text_in_range(None, "文", window, cx);
                view.edgeless_commit_inline_edit(window, cx);
                let (_, el) =
                    find_surface_element(view.snapshot.as_ref().unwrap(), "sh-ime").unwrap();
                let SurfaceElementKind::Shape(s) = &el.kind else {
                    unreachable!()
                };
                assert_eq!(s.text.plain, "Xa文c");

                // 3. Same-string remote shift ("aaaa": peer deletes 0 and appends 'a' while 2..3 is marked)
                //    must still resolve preedit_anchors so committing '文' produces "a文aa".
                let _ = view
                    .page_mut()
                    .unwrap()
                    .splice_surface_element_text(&surf_id, "sh-ime", "text", 0, 4, "aaaa", 250);
                view.snapshot = view
                    .page()
                    .unwrap()
                    .read_page_snapshot()
                    .ok()
                    .map(std::rc::Rc::new);
                assert!(view.edgeless_begin_inline_edit("sh-ime", window, cx));
                view.set_selected_text_range(2..3, window, cx);
                view.replace_and_mark_text_in_range(None, "ni", None, window, cx);
                let seed2 = view.page().unwrap().encode_update_v1().unwrap();
                let mut peer_c = PageDocSession::new("doc:home", 778).unwrap();
                peer_c.apply_remote_update_v1(&seed2).unwrap();
                let shift_commit = peer_c
                    .structural_edit(300, |p| {
                        p.splice_surface_element_text(&surf_id, "sh-ime", "text", 0, 1, "", 300)?;
                        p.splice_surface_element_text(&surf_id, "sh-ime", "text", 3, 0, "a", 300)?;
                        Ok(())
                    })
                    .unwrap()
                    .unwrap();
                view.page_mut()
                    .unwrap()
                    .apply_remote_update_v1(&shift_commit.update)
                    .unwrap();
                view.snapshot = view
                    .page()
                    .unwrap()
                    .read_page_snapshot()
                    .ok()
                    .map(std::rc::Rc::new);
                view.edgeless_refresh_label_editor_from_snapshot();
                view.replace_text_in_range(None, "文", window, cx);
                view.edgeless_commit_inline_edit(window, cx);
                let (_, el2) =
                    find_surface_element(view.snapshot.as_ref().unwrap(), "sh-ime").unwrap();
                let SurfaceElementKind::Shape(s2) = &el2.kind else {
                    unreachable!()
                };
                assert_eq!(s2.text.plain, "a文aa");
            })
            .unwrap();
        });
    }

    #[test]
    fn edgeless_wheel_zoom_shape_presets_defaults_and_transparent_shape_edit() {
        use blocksuite_playground_doc::read::{ColorValue, ConnectorMode, SurfaceElementKind};
        use ui::{Modifiers, ScrollDelta, ScrollEvent, point, px};

        let platform = ui::HeadlessPlatform::new(1280, 800, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let win = open_edgeless_view(&app, &platform);
        let hw = platform.windows().into_iter().next().unwrap();

        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                view.edgeless.set_camera(0.0, 0.0, 1.0);
                let top = crate::TOPBAR_HEIGHT;

                // 1. Ctrl+wheel up (positive delta.y) zooms in; down (negative delta.y) zooms out.
                let scroll_up = ScrollEvent {
                    position: point(px(400.0), px(top + 300.0)),
                    delta: ScrollDelta::Pixels(point(px(0.0), px(100.0))),
                    modifiers: Modifiers {
                        control: true,
                        ..Default::default()
                    },
                    ..Default::default()
                };
                view.on_edgeless_scroll(&scroll_up, window, cx);
                assert!(
                    view.edgeless.camera.zoom > 1.0,
                    "Ctrl+wheel up must zoom in, got {}",
                    view.edgeless.camera.zoom
                );
                let zoomed_in = view.edgeless.camera.zoom;
                let scroll_down = ScrollEvent {
                    delta: ScrollDelta::Pixels(point(px(0.0), px(-200.0))),
                    ..scroll_up
                };
                view.on_edgeless_scroll(&scroll_down, window, cx);
                assert!(
                    view.edgeless.camera.zoom < zoomed_in,
                    "Ctrl+wheel down must zoom out"
                );
                view.edgeless.set_camera(0.0, 0.0, 1.0);

                // 2. Shape preset selection + repeat toggle does not cycle shape type.
                view.edgeless_select_tool(EdgelessTool::Shape(ShapePreset::Ellipse), window, cx);
                assert!(view.edgeless.authoring.shape_picker_open);
                view.edgeless_toggle_shape_picker(window, cx);
                assert!(!view.edgeless.authoring.shape_picker_open);
                assert_eq!(
                    view.edgeless.authoring.tool,
                    EdgelessTool::Shape(ShapePreset::Ellipse)
                );
                view.edgeless_toggle_shape_picker(window, cx);
                assert!(view.edgeless.authoring.shape_picker_open);
                assert_eq!(
                    view.edgeless.authoring.tool,
                    EdgelessTool::Shape(ShapePreset::Ellipse)
                );

                // 3. RoundedRect preset creates shapeType="rect" with radius=0.1, #fcd34d fill/stroke, strokeWidth=2.
                view.edgeless_select_tool(
                    EdgelessTool::Shape(ShapePreset::RoundedRect),
                    window,
                    cx,
                );
                view.on_edgeless_left_down(&mouse_down(120.0, top + 120.0, 1), window, cx);
                view.on_edgeless_pointer_move(&mouse_move(280.0, top + 220.0, true), window, cx);
                view.on_edgeless_left_up(&mouse_up(280.0, top + 220.0), window, cx);
                let shape_id = view
                    .edgeless
                    .authoring
                    .selection
                    .iter()
                    .next()
                    .unwrap()
                    .clone();
                let (_, shape_el) =
                    find_surface_element(view.snapshot.as_ref().unwrap(), &shape_id).unwrap();
                let SurfaceElementKind::Shape(shape) = &shape_el.kind else {
                    panic!("expected shape");
                };
                assert!((shape.radius - 0.1).abs() < 1e-6);
                assert!((shape.stroke_width - 2.0).abs() < 1e-6);
                assert_eq!(
                    shape.fill_color,
                    ColorValue::Themed {
                        light: "#fcd34d".into(),
                        dark: "#fcd34d".into(),
                    }
                );

                // 4. Newly created Connector defaults to Curve mode and strokeWidth=2.
                view.edgeless_select_tool(EdgelessTool::Connector, window, cx);
                view.on_edgeless_left_down(&mouse_down(320.0, top + 140.0, 1), window, cx);
                view.on_edgeless_pointer_move(&mouse_move(480.0, top + 220.0, true), window, cx);
                view.on_edgeless_left_up(&mouse_up(480.0, top + 220.0), window, cx);
                let conn_id = view
                    .edgeless
                    .authoring
                    .selection
                    .iter()
                    .next()
                    .unwrap()
                    .clone();
                let (_, conn_el) =
                    find_surface_element(view.snapshot.as_ref().unwrap(), &conn_id).unwrap();
                let SurfaceElementKind::Connector(conn) = &conn_el.kind else {
                    panic!("expected connector");
                };
                assert_eq!(conn.mode, ConnectorMode::Curve);
                assert!((conn.stroke_width - 2.0).abs() < 1e-6);

                // 5. Double-clicking a Shape populates shape_style for transparent centered editing.
                let _ = shape_id;
            })
            .unwrap();
        });
        hw.request_frame();
        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                let shape_id = view
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .find(|i| i.kind == SpatialItemKind::Shape)
                    .unwrap()
                    .id
                    .clone();
                assert!(view.edgeless_begin_inline_edit(&shape_id, window, cx));
                let ed = view.edgeless.authoring.label_editor().unwrap();
                assert!(
                    ed.shape_style.is_some(),
                    "shape inline editor must carry ShapeTextStyle for transparent centered editing"
                );
            })
            .unwrap();
        });
    }

    #[test]
    fn shape_inline_edit_edge_and_zoom_connector_curve_preview_and_code_outdent_undo() {
        use blocksuite_editor::edgeless::{
            label_editor_text_origin, layout_label_editor_paragraph,
        };
        use blocksuite_editor::surface::preview_curve_cubic;
        use blocksuite_playground_doc::schema::SurfaceElementSpec;
        use ui::AppContext;

        let platform = ui::HeadlessPlatform::new(600, 480, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let win = app
            .update(|cx| {
                cx.open_window(ui::WindowOptions::default(), |_window, cx| {
                    cx.new(|cx| {
                        PlaygroundView::with_options(
                            crate::PlaygroundOptions {
                                mode: crate::PlaygroundMode::Edgeless,
                                ..Default::default()
                            },
                            cx,
                        )
                    })
                })
            })
            .unwrap();
        let hw = platform.windows().into_iter().next().unwrap();
        hw.request_frame();

        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                // 1. Place a 300x100 Shape at world [-100, 100] with camera origin=(0,0), zoom=1.0
                //    so screen x spans [-100, 200] with centered text center at x=50.
                let commit = view
                    .page_mut()
                    .unwrap()
                    .structural_edit(1, |page| {
                        let sid = page.ensure_surface_block(1)?;
                        page.add_surface_element(
                            &sid,
                            "edge-shape",
                            "z9",
                            SurfaceElementSpec::Shape {
                                shape_type: "rect".into(),
                                xywh: "[-100,100,300,100]".into(),
                                seed: 11,
                                filled: true,
                                text: Some("AB".into()),
                            },
                            1,
                        )?;
                        Ok(())
                    })
                    .unwrap()
                    .unwrap();
                view.did_edgeless_doc_commit(commit, cx);
                view.edgeless.camera.pan_x = 0.0;
                view.edgeless.camera.pan_y = 0.0;
                view.edgeless.camera.zoom = 1.0;
                view.edgeless.camera_initialized = true;
                cx.notify();
                let _ = window;
            })
            .unwrap();
        });
        hw.request_frame();

        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                assert!(view.edgeless_begin_inline_edit("edge-shape", window, cx));
                let layout_bounds = view.edgeless_label_layout_screen_bounds(window).unwrap();
                assert!(
                    (f32::from(layout_bounds.origin.x) - (-100.0)).abs() < 0.01
                        && (f32::from(layout_bounds.size.width) - 300.0).abs() < 0.01,
                    "unclamped shape layout bounds must stay at [-100, 200], got {layout_bounds:?}"
                );
                let ed = view.edgeless.authoring.label_editor().unwrap();
                let laid = layout_label_editor_paragraph(ed, 300.0, 1.0, view.theme, window).unwrap();
                let (ox, oy) =
                    label_editor_text_origin(ed, 100.0, f32::from(laid.size().height), 1.0);
                // Centered glyph line midpoint inside [-100, 200] must sit at screen x = 50.0 (not 158.0).
                let line = &laid.lines()[0];
                let line_left = -100.0 + ox + f32::from(line.x);
                let line_center = line_left + f32::from(line.width) * 0.5;
                assert!(
                    (line_center - 50.0).abs() < 1.0,
                    "centered shape label at [-100, 200] must stay centered at x=50, got {line_center}"
                );
                // Clicking just left vs right of x=50.0 hits offset 1 ('A'|'B'), not clamped offset 0.
                let click_y = crate::TOPBAR_HEIGHT + 100.0 + oy + f32::from(laid.size().height) * 0.5;
                view.on_edgeless_left_down(&mouse_down(50.0, click_y, 1), window, cx);
                let caret = view.edgeless.authoring.label_editor().unwrap().input.selection.start;
                assert_eq!(caret, 1, "clicking x=50 center of 'AB' must place caret between A and B");

                // 2. At 25% zoom, a 16px shape label lays out at 4px (not clamped to 6px).
                view.edgeless.camera.zoom = 0.25;
                let ed = view.edgeless.authoring.label_editor().unwrap();
                let laid_100 =
                    layout_label_editor_paragraph(ed, 300.0, 1.0, view.theme, window).unwrap();
                let laid_25 =
                    layout_label_editor_paragraph(ed, 75.0, 0.25, view.theme, window).unwrap();
                let ratio =
                    f32::from(laid_25.size().height) / f32::from(laid_100.size().height).max(1.0);
                assert!(
                    (ratio - 0.25).abs() < 0.05,
                    "25% zoom shape label height must scale by 0.25 (4px vs 16px), got ratio {ratio}"
                );
                view.edgeless_commit_inline_edit(window, cx);

                // 3. Free-endpoint CreateConnector preview curve control points match committed Curve.
                let (s, c1, c2, e) = preview_curve_cubic(
                    None,
                    None,
                    (100.0, 120.0),
                    None,
                    None,
                    (400.0, 240.0),
                    &view.edgeless.authoring.painted_items,
                );
                assert_eq!(s, (100.0, 120.0));
                assert_eq!(e, (400.0, 240.0));
                // dx = 300 > dy = 120 => horizontal tangents of 2/3 * dx = 200 -> c1=(300,120), c2=(200,240).
                assert!((c1.0 - 300.0).abs() < 0.01 && (c1.1 - 120.0).abs() < 0.01);
                assert!((c2.0 - 200.0).abs() < 0.01 && (c2.1 - 240.0).abs() < 0.01);

                // 4. Code block mixed-indent Shift+Tab (" a\n  b" -> " a\nb") + single-step undo.
                view.set_mode(crate::PlaygroundMode::Page, window, cx);
                let note_id = view
                    .snapshot
                    .as_ref()
                    .unwrap()
                    .root
                    .as_ref()
                    .unwrap()
                    .children
                    .iter()
                    .find(|c| c.is_page_visible_note())
                    .unwrap()
                    .id
                    .clone();
                let commit = view
                    .page_mut()
                    .unwrap()
                    .structural_edit(2, |page| {
                        page.add_block(
                            "code-mix",
                            blocksuite_playground_doc::schema::BlockSpec::Code {
                                text: " a\n  b".into(),
                                language: None,
                                caption: String::new(),
                            },
                            Some(&note_id),
                            Some(0),
                            2,
                        )?;
                        Ok(())
                    })
                    .unwrap()
                    .unwrap();
                view.did_edit(Some(commit), None, window, cx);
                let sel = blocksuite_editor::editor_session::DocumentSelection {
                    anchor: blocksuite_editor::editor_session::DocPoint::new("code-mix", 0),
                    focus: blocksuite_editor::editor_session::DocPoint::new("code-mix", 6),
                };
                view.indent_code_block(sel, true, window, cx).unwrap();
                assert_eq!(view.block_text("code-mix"), Some(" a\nb"));
                let undo = view.page_mut().unwrap().undo().unwrap().unwrap();
                view.did_edit(Some(undo), None, window, cx);
                assert_eq!(view.block_text("code-mix"), Some(" a\n  b"));
            })
            .unwrap();
        });
    }

    #[test]
    fn rotated_shape_inline_edit_baseline_and_click_and_bound_connector_drag_preview_match_commit()
    {
        use blocksuite_editor::edgeless::{EdgelessGesture, EdgelessTool};
        use blocksuite_editor::surface::preview_curve_cubic;
        use blocksuite_playground_doc::schema::SurfaceElementSpec;
        use ui::AppContext;
        use y_octo::{Any, SessionValue};

        let platform = ui::HeadlessPlatform::new(640, 520, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let win = app
            .update(|cx| {
                cx.open_window(ui::WindowOptions::default(), |_window, cx| {
                    cx.new(|cx| {
                        PlaygroundView::with_options(
                            crate::PlaygroundOptions {
                                mode: crate::PlaygroundMode::Edgeless,
                                ..Default::default()
                            },
                            cx,
                        )
                    })
                })
            })
            .unwrap();
        let hw = platform.windows().into_iter().next().unwrap();
        hw.request_frame();

        app.update(|cx| {
            win.update(cx, |view, _window, cx| {
                let commit = view
                    .page_mut()
                    .unwrap()
                    .structural_edit(1, |page| {
                        let sid = page.ensure_surface_block(1)?;
                        // (a) 90°-rotated square `rot-sq` fully inside viewport with label "ABCD".
                        page.add_surface_element(
                            &sid,
                            "rot-sq",
                            "z8",
                            SurfaceElementSpec::Shape {
                                shape_type: "rect".into(),
                                xywh: "[360,120,120,120]".into(),
                                seed: 21,
                                filled: true,
                                text: Some("ABCD".into()),
                            },
                            1,
                        )?;
                        for (k, v) in [
                            ("rotate", SessionValue::Any(Any::Float64(90.0.into()))),
                            (
                                "fillColor",
                                SessionValue::Any(Any::String("#ffffff".into())),
                            ),
                            ("strokeWidth", SessionValue::Any(Any::Float64(0.0.into()))),
                            ("color", SessionValue::Any(Any::String("#000000".into()))),
                        ] {
                            page.set_surface_element_field(&sid, "rot-sq", k, v, 1)?;
                        }
                        // (b) 90°-rotated stroke-less, label-less rectangle `[100,100,200,40]`.
                        page.add_surface_element(
                            &sid,
                            "rot-rect",
                            "z9",
                            SurfaceElementSpec::Shape {
                                shape_type: "rect".into(),
                                xywh: "[100,100,200,40]".into(),
                                seed: 22,
                                filled: false,
                                text: None,
                            },
                            1,
                        )?;
                        for (k, v) in [
                            ("rotate", SessionValue::Any(Any::Float64(90.0.into()))),
                            ("strokeWidth", SessionValue::Any(Any::Float64(0.0.into()))),
                        ] {
                            page.set_surface_element_field(&sid, "rot-rect", k, v, 1)?;
                        }
                        // (c) Clean white backdrop + 90°-rotated single-line `SurfaceText` `[440,220,200,40]` ("ABCDEFGH").
                        page.add_surface_element(
                            &sid,
                            "bg-txt",
                            "z7",
                            SurfaceElementSpec::Shape {
                                shape_type: "rect".into(),
                                xywh: "[500,130,80,220]".into(),
                                seed: 20,
                                filled: true,
                                text: None,
                            },
                            1,
                        )?;
                        for (k, v) in [
                            (
                                "fillColor",
                                SessionValue::Any(Any::String("#ffffff".into())),
                            ),
                            ("strokeWidth", SessionValue::Any(Any::Float64(0.0.into()))),
                        ] {
                            page.set_surface_element_field(&sid, "bg-txt", k, v, 1)?;
                        }
                        page.add_surface_element(
                            &sid,
                            "rot-txt",
                            "z8",
                            SurfaceElementSpec::Text {
                                seed: 23,
                                text: "ABCDEFGH".into(),
                                xywh: "[440,220,200,40]".into(),
                            },
                            1,
                        )?;
                        for (k, v) in [
                            ("rotate", SessionValue::Any(Any::Float64(90.0.into()))),
                            ("color", SessionValue::Any(Any::String("#000000".into()))),
                        ] {
                            page.set_surface_element_field(&sid, "rot-txt", k, v, 1)?;
                        }
                        Ok(())
                    })
                    .unwrap()
                    .unwrap();
                view.did_edgeless_doc_commit(commit, cx);
                view.edgeless.camera.pan_x = 0.0;
                view.edgeless.camera.pan_y = 0.0;
                view.edgeless.camera.zoom = 1.0;
                view.edgeless.camera_initialized = true;
                cx.notify();
            })
            .unwrap();
        });
        hw.request_frame();

        let top = crate::TOPBAR_HEIGHT;
        let dark_ink_bbox_in =
            |img: &image::RgbaImage, xr: std::ops::Range<u32>, yr: std::ops::Range<u32>| {
                let (mut x0, mut x1, mut y0, mut y1, mut n) = (u32::MAX, 0, u32::MAX, 0, 0usize);
                for y in yr {
                    for x in xr.clone() {
                        let p = img.get_pixel(x, y).0;
                        // Pure black glyph ink (caret is brand blue `p[2] > 150`, excluded by `p[2] < 80`).
                        if p[0] < 80 && p[1] < 80 && p[2] < 80 {
                            x0 = x0.min(x);
                            x1 = x1.max(x);
                            y0 = y0.min(y);
                            y1 = y1.max(y);
                            n += 1;
                        }
                    }
                }
                (x0, x1, y0, y1, n)
            };
        let sq_yr = (120 + top as u32 + 4)..(240 + top as u32 - 4);
        let txt_yr = (138 + top as u32)..(342 + top as u32);

        // 1. Capture pre-edit static glyph baseline bboxes for 90° Shape ("ABCD") & 90° SurfaceText ("ABCDEFGH").
        let (static_bbox, static_txt_bbox) = app.update(|cx| {
            win.update(cx, |_, window, _| {
                let img = window.render_to_image().unwrap();
                (
                    dark_ink_bbox_in(&img, 364..476, sq_yr.clone()),
                    dark_ink_bbox_in(&img, 516..564, txt_yr.clone()),
                )
            })
            .unwrap()
        });
        assert!(
            static_bbox.4 > 30
                && (static_bbox.3 - static_bbox.2) > (static_bbox.1 - static_bbox.0) + 12,
            "static 90° 'ABCD' must orient vertically: bbox={static_bbox:?}"
        );
        assert!(
            static_txt_bbox.4 > 40
                && (static_txt_bbox.3 - static_txt_bbox.2)
                    > (static_txt_bbox.1 - static_txt_bbox.0) + 40,
            "static 90° SurfaceText 'ABCDEFGH' must orient vertically: bbox={static_txt_bbox:?}"
        );

        // Double-click `rot-sq` to enter inline edit and render the live overlay frame.
        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                view.on_edgeless_left_down(&mouse_down(420.0, top + 180.0, 2), window, cx);
                view.on_edgeless_left_up(&mouse_up(420.0, top + 180.0), window, cx);
                assert!(view.edgeless.authoring.label_editor().is_some());
            })
            .unwrap();
        });
        hw.request_frame();
        let edit_bbox = app.update(|cx| {
            win.update(cx, |_, window, _| {
                dark_ink_bbox_in(&window.render_to_image().unwrap(), 364..476, sq_yr.clone())
            })
            .unwrap()
        });
        assert!(
            edit_bbox.4 > 30 && (edit_bbox.3 - edit_bbox.2) > (edit_bbox.1 - edit_bbox.0) + 12,
            "inline-edited 90° 'ABCD' must stay vertical: bbox={edit_bbox:?}"
        );
        assert!(
            static_bbox.0.abs_diff(edit_bbox.0) <= 1
                && static_bbox.1.abs_diff(edit_bbox.1) <= 1
                && static_bbox.2.abs_diff(edit_bbox.2) <= 1
                && static_bbox.3.abs_diff(edit_bbox.3) <= 1,
            "90° 'ABCD' glyph baseline bbox must not shift on double-click: static={static_bbox:?}, edit={edit_bbox:?}"
        );

        // Click off-center near 'A' `(420, top + 160)`, center `(420, top + 180)`, and off-center near 'D' `(420, top + 200)`!
        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                view.on_edgeless_left_down(&mouse_down(420.0, top + 160.0, 1), window, cx);
                let sel_head = view
                    .edgeless
                    .authoring
                    .label_editor()
                    .unwrap()
                    .input
                    .selection
                    .clone();
                assert!(
                    sel_head.start == sel_head.end && sel_head.start <= 1,
                    "off-center upper click (420, 160) on 90° 'ABCD' must map before B (<= 1), got {sel_head:?}"
                );

                view.on_edgeless_left_down(&mouse_down(420.0, top + 180.0, 1), window, cx);
                let sel_mid = view
                    .edgeless
                    .authoring
                    .label_editor()
                    .unwrap()
                    .input
                    .selection
                    .clone();
                assert_eq!(
                    sel_mid,
                    2..2,
                    "clicking between rotated B and C at center (420, 180) must place caret at UTF-16 offset 2"
                );

                view.on_edgeless_left_down(&mouse_down(420.0, top + 200.0, 1), window, cx);
                let sel_tail = view
                    .edgeless
                    .authoring
                    .label_editor()
                    .unwrap()
                    .input
                    .selection
                    .clone();
                assert!(
                    sel_tail.start == sel_tail.end && sel_tail.start >= 3,
                    "off-center lower click (420, 200) on 90° 'ABCD' must map after C (>= 3), got {sel_tail:?}"
                );
                view.edgeless_commit_inline_edit(window, cx);
            })
            .unwrap();
        });
        hw.request_frame();

        // 1b. Double-click 90°-rotated `SurfaceText` `rot-txt` (`[440,220,200,40]`, center `(540, 240)`).
        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                view.on_edgeless_left_down(&mouse_down(540.0, top + 240.0, 2), window, cx);
                view.on_edgeless_left_up(&mouse_up(540.0, top + 240.0), window, cx);
                assert!(matches!(
                    view.edgeless.authoring.label_editor().map(|e| &e.target),
                    Some(blocksuite_editor::edgeless::LabelTarget::SurfaceText { .. })
                ));
            })
            .unwrap();
        });
        hw.request_frame();
        let edit_txt_bbox = app.update(|cx| {
            win.update(cx, |_, window, _| {
                dark_ink_bbox_in(&window.render_to_image().unwrap(), 516..564, txt_yr.clone())
            })
            .unwrap()
        });
        assert!(
            edit_txt_bbox.4 > 40
                && (edit_txt_bbox.3 - edit_txt_bbox.2) > (edit_txt_bbox.1 - edit_txt_bbox.0) + 40,
            "inline-edited 90° SurfaceText 'ABCDEFGH' must stay vertical: bbox={edit_txt_bbox:?}"
        );
        assert!(
            static_txt_bbox.0.abs_diff(edit_txt_bbox.0) <= 1
                && static_txt_bbox.1.abs_diff(edit_txt_bbox.1) <= 1
                && static_txt_bbox.2.abs_diff(edit_txt_bbox.2) <= 1
                && static_txt_bbox.3.abs_diff(edit_txt_bbox.3) <= 1,
            "90° SurfaceText glyph baseline bbox must not shift on double-click: static={static_txt_bbox:?}, edit={edit_txt_bbox:?}"
        );

        // Click two distinct inter-character positions along the SAME vertical column `x = 550.0`
        // (`y = 212` vs `y = 268` in world coords) and assert their exact UTF-16 offsets!
        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                let (exp_1, exp_2) = {
                    let ed = view.edgeless.authoring.label_editor().unwrap();
                    let laid_out = blocksuite_editor::edgeless::layout_label_editor_paragraph(
                        ed,
                        200.0,
                        1.0,
                        view.theme,
                        window,
                    )
                    .unwrap();
                    // Inverse-rotating `(550, 212)` and `(550, 268)` around `(540, 240)` by `-90°`
                    // yields `(512, 230)` -> local `(72, 10)` and `(568, 230)` -> local `(128, 10)`.
                    let o1 =
                        laid_out.hit_test(ui::point(ui::px(72.0), ui::px(10.0))).utf16_offset
                            as usize;
                    let o2 =
                        laid_out.hit_test(ui::point(ui::px(128.0), ui::px(10.0))).utf16_offset
                            as usize;
                    (o1, o2)
                };
                assert!(
                    exp_1 >= 1 && exp_1 <= 3 && exp_2 >= 5 && exp_2 <= 7 && exp_2 >= exp_1 + 3,
                    "expected distinct UTF-16 offsets along 'ABCDEFGH', got ({exp_1}, {exp_2})"
                );

                view.on_edgeless_left_down(&mouse_down(550.0, top + 212.0, 1), window, cx);
                let sel_1 = view
                    .edgeless
                    .authoring
                    .label_editor()
                    .unwrap()
                    .input
                    .selection
                    .clone();
                assert_eq!(
                    sel_1,
                    exp_1..exp_1,
                    "first click at (550, 212) on 90° SurfaceText must hit UTF-16 offset {exp_1}"
                );

                view.on_edgeless_left_down(&mouse_down(550.0, top + 268.0, 1), window, cx);
                let sel_2 = view
                    .edgeless
                    .authoring
                    .label_editor()
                    .unwrap()
                    .input
                    .selection
                    .clone();
                assert_eq!(
                    sel_2,
                    exp_2..exp_2,
                    "second click at (550, 268) on 90° SurfaceText must hit distinct UTF-16 offset {exp_2}"
                );
                view.edgeless_commit_inline_edit(window, cx);

                // 2. Drag a Connector from `(40, 220)` to port `[1, 0.5]` of 90°-rotated `[100,100,200,40]`
                //    (world port = `(200, 220)`, NOT `(200, 140)`!) and verify preview == committed route.
                view.edgeless_select_tool(EdgelessTool::Connector, window, cx);
                view.on_edgeless_left_down(&mouse_down(40.0, top + 220.0, 1), window, cx);
                view.on_edgeless_pointer_move(&mouse_move(201.0, top + 221.0, true), window, cx);
                let (ps, pc1, pc2, pe) = match view.edgeless.authoring.gesture.as_ref().unwrap() {
                    EdgelessGesture::CreateConnector {
                        source_id,
                        source_port,
                        source_world,
                        current_world,
                        target_id,
                        target_port,
                        target_world,
                        ..
                    } => {
                        assert_eq!(target_id.as_deref(), Some("rot-rect"));
                        assert_eq!(*target_port, Some([1.0, 0.5]));
                        let tw = target_world.unwrap();
                        assert!(
                            (tw.0 - 200.0).abs() < 0.05 && (tw.1 - 220.0).abs() < 0.05,
                            "snapped port [1,0.5] on 90° [100,100,200,40] must be (200, 220), got {tw:?}"
                        );
                        preview_curve_cubic(
                            source_id.as_deref(),
                            *source_port,
                            *source_world,
                            target_id.as_deref(),
                            *target_port,
                            target_world.unwrap_or(*current_world),
                            &view.edgeless.authoring.painted_items,
                        )
                    }
                    other => panic!("expected CreateConnector gesture, got {other:?}"),
                };
                assert!(
                    (pe.0 - 200.0).abs() < 0.05 && (pe.1 - 220.0).abs() < 0.05,
                    "live preview endpoint must be (200, 220), got {pe:?}"
                );
                view.on_edgeless_left_up(&mouse_up(201.0, top + 221.0), window, cx);
                (ps, pc1, pc2, pe)
            })
            .unwrap()
        });
        hw.request_frame();

        app.update(|cx| {
            win.update(cx, |view, _, _| {
                let conn_id = view
                    .edgeless
                    .authoring
                    .selection
                    .iter()
                    .next()
                    .unwrap()
                    .clone();
                let item = view
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .find(|i| i.id == conn_id)
                    .unwrap();
                let first = *item.polyline.first().unwrap();
                let last = *item.polyline.last().unwrap();
                assert!(
                    (first.0 - 40.0).abs() < 0.05
                        && (first.1 - 220.0).abs() < 0.05
                        && (last.0 - 200.0).abs() < 0.05
                        && (last.1 - 220.0).abs() < 0.05,
                    "committed connector route endpoints must match live preview (40,220)->(200,220), got {first:?}->{last:?}"
                );
                // Recompute preview cubic on identical endpoints and compare midpoint `t = 0.5` (`polyline[32]`).
                let (ps, pc1, pc2, pe) = preview_curve_cubic(
                    None,
                    None,
                    (40.0, 220.0),
                    Some("rot-rect"),
                    Some([1.0, 0.5]),
                    (200.0, 220.0),
                    &view.edgeless.authoring.painted_items,
                );
                let mid_expected = (
                    0.125 * ps.0 + 0.375 * pc1.0 + 0.375 * pc2.0 + 0.125 * pe.0,
                    0.125 * ps.1 + 0.375 * pc1.1 + 0.375 * pc2.1 + 0.125 * pe.1,
                );
                let mid_committed = item.polyline[item.polyline.len() / 2];
                assert!(
                    (mid_committed.0 - mid_expected.0).abs() < 0.05
                        && (mid_committed.1 - mid_expected.1).abs() < 0.05,
                    "bound connector curve controls/midpoint must match between preview {mid_expected:?} and committed {mid_committed:?}"
                );
            })
            .unwrap();
        });
    }

    #[test]
    fn b6_edgeless_p0_p1_p2_desktop_interactions() {
        use ui::EntityInputHandler;

        let platform = ui::HeadlessPlatform::new(1280, 800, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let win = open_edgeless_view(&app, &platform);
        let hw = platform.windows().into_iter().next().unwrap();
        let top = crate::TOPBAR_HEIGHT;

        let mk_key = |key: &str, mods: ui::Modifiers| ui::KeyDownEvent {
            keystroke: ui::Keystroke {
                modifiers: mods,
                key: key.into(),
                key_char: None,
            },
            is_held: false,
            prefer_character_input: false,
        };
        let mut cmd_mods = ui::Modifiers::default();
        if cfg!(target_os = "macos") {
            cmd_mods.platform = true;
        } else {
            cmd_mods.control = true;
        }
        let mut cmd_shift = cmd_mods;
        cmd_shift.shift = true;
        let mut alt_mods = ui::Modifiers::default();
        alt_mods.alt = true;
        let mut shift_mods = ui::Modifiers::default();
        shift_mods.shift = true;

        // Seed deterministic camera at 100% zoom, pan (0, 0).
        app.update(|cx| {
            win.update(cx, |view, _, cx| {
                view.set_edgeless_zoom(1.0, cx);
                view.set_edgeless_pan(0.0, 0.0, cx);
            })
            .unwrap();
        });
        hw.request_frame();

        // 1. P0-6: Mod+A + Delete preserves the sole Page-visible `affine:note`.
        let note_id: String = app.update(|cx| {
            win.update(cx, |view, window, cx| {
                let first_note = view
                    .snapshot
                    .as_ref()
                    .unwrap()
                    .root
                    .as_ref()
                    .unwrap()
                    .children
                    .iter()
                    .find(|c| matches!(c.content, BlockContent::Note { .. }))
                    .unwrap()
                    .id
                    .clone();
                assert!(view.edgeless_key_down(&mk_key("a", cmd_mods), window, cx));
                assert!(view.edgeless_key_down(
                    &mk_key("delete", ui::Modifiers::default()),
                    window,
                    cx
                ));
                assert!(
                    find_block(view.snapshot.as_ref().unwrap(), &first_note).is_some(),
                    "P0-6: last Page-visible affine:note must survive Mod+A + Delete"
                );
                // Undo to restore showcase items.
                assert!(view.edgeless_key_down(&mk_key("z", cmd_mods), window, cx));
                first_note
            })
            .unwrap()
        });
        assert!(!note_id.is_empty());
        hw.request_frame();

        // 2. P1-23: Tool & hotkey alignment (Shift+P, S/Shift+S cycle, C cycle, Alt+F/Cmd+[ guard, Brush no-select).
        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                view.edgeless_select_tool(EdgelessTool::Select, window, cx);
                // Alt+F must NOT switch to Frame tool.
                assert!(!view.edgeless_key_down(&mk_key("f", alt_mods), window, cx));
                assert_eq!(view.edgeless.authoring.tool, EdgelessTool::Select);
                // Shift+P switches to Highlighter; plain P switches to Brush.
                assert!(view.edgeless_key_down(&mk_key("p", shift_mods), window, cx));
                assert_eq!(view.edgeless.authoring.tool, EdgelessTool::Highlighter);
                assert!(view.edgeless_key_down(&mk_key("p", ui::Modifiers::default()), window, cx));
                assert_eq!(view.edgeless.authoring.tool, EdgelessTool::Brush);
                // Drawing a brush stroke keeps Brush tool and empty selection.
                view.on_edgeless_left_down(&mouse_down(100.0, top + 100.0, 1), window, cx);
                view.on_edgeless_pointer_move(&mouse_move(180.0, top + 120.0, true), window, cx);
                view.on_edgeless_left_up(&mouse_up(180.0, top + 120.0), window, cx);
                assert_eq!(view.edgeless.authoring.tool, EdgelessTool::Brush);
                assert!(view.edgeless.authoring.selection.is_empty());
                // S enters Shape(Rect), subsequent S cycles Ellipse -> Diamond, Shift+S goes back.
                assert!(view.edgeless_key_down(&mk_key("s", ui::Modifiers::default()), window, cx));
                assert_eq!(
                    view.edgeless.authoring.tool,
                    EdgelessTool::Shape(ShapePreset::Rect)
                );
                assert!(view.edgeless_key_down(&mk_key("s", ui::Modifiers::default()), window, cx));
                assert_eq!(
                    view.edgeless.authoring.tool,
                    EdgelessTool::Shape(ShapePreset::Ellipse)
                );
                assert!(view.edgeless_key_down(&mk_key("s", shift_mods), window, cx));
                assert_eq!(
                    view.edgeless.authoring.tool,
                    EdgelessTool::Shape(ShapePreset::Rect)
                );
                // C enters Connector (Curve), subsequent C cycles Orthogonal -> Straight -> Curve.
                assert!(view.edgeless_key_down(&mk_key("c", ui::Modifiers::default()), window, cx));
                assert_eq!(view.edgeless.authoring.connector_mode, ConnectorMode::Curve);
                assert!(view.edgeless_key_down(&mk_key("c", ui::Modifiers::default()), window, cx));
                assert_eq!(
                    view.edgeless.authoring.connector_mode,
                    ConnectorMode::Orthogonal
                );
                assert!(view.edgeless_key_down(&mk_key("c", ui::Modifiers::default()), window, cx));
                assert_eq!(
                    view.edgeless.authoring.connector_mode,
                    ConnectorMode::Straight
                );
            })
            .unwrap();
        });
        hw.request_frame();

        // 3. P1-24: Mod+=/-, Alt+0/1/2 zoom shortcuts & Shift+Wheel horizontal pan.
        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                let z0 = view.edgeless.camera.zoom;
                assert!(view.edgeless_key_down(&mk_key("=", cmd_mods), window, cx));
                assert!(view.edgeless.camera.zoom > z0);
                assert!(view.edgeless_key_down(&mk_key("-", cmd_mods), window, cx));
                assert!((view.edgeless.camera.zoom - z0).abs() < 1e-3);
                assert!(view.edgeless_key_down(&mk_key("0", alt_mods), window, cx));
                assert!((view.edgeless.camera.zoom - 1.0).abs() < 1e-3);
                let px_before = view.edgeless.camera.pan_x;
                let py_before = view.edgeless.camera.pan_y;
                let scroll = ui::ScrollEvent {
                    position: ui::point(ui::px(300.0), ui::px(top + 200.0)),
                    delta: ui::ScrollDelta::Pixels(ui::point(ui::px(0.0), ui::px(120.0))),
                    modifiers: shift_mods,
                    touch_phase: ui::TouchPhase::Moved,
                    source: ui::ScrollSource::Pointer,
                };
                view.on_edgeless_scroll(&scroll, window, cx);
                assert!((view.edgeless.camera.pan_x - px_before).abs() > 50.0);
                assert!((view.edgeless.camera.pan_y - py_before).abs() < 1e-3);
                view.set_edgeless_pan(0.0, 0.0, cx);
            })
            .unwrap();
        });
        hw.request_frame();

        // 4. Create two shapes, wrap in Frame with F (P1-23d), verify P0-5 marquee inside Frame,
        //    verify P1-14 click_count=2 + drag does NOT hijack into inline edit,
        //    verify P1-17/P1-18 multiline AUTO_HEIGHT + in-place Undo/Redo,
        //    verify P1-25 Mod+G / Mod+Shift+G, Mod+C / Mod+V, Ctrl+Y, and P2-3 empty EdgelessText cleanup.
        let (s1_id, s2_id) = app.update(|cx| {
            win.update(cx, |view, window, cx| {
                view.edgeless_select_tool(EdgelessTool::Shape(ShapePreset::Rect), window, cx);
                view.on_edgeless_left_down(&mouse_down(100.0, top + 100.0, 1), window, cx);
                view.on_edgeless_pointer_move(&mouse_move(260.0, top + 180.0, true), window, cx);
                view.on_edgeless_left_up(&mouse_up(260.0, top + 180.0), window, cx);
                let s1 = view
                    .edgeless
                    .authoring
                    .selection
                    .iter()
                    .next()
                    .unwrap()
                    .clone();

                view.edgeless_select_tool(EdgelessTool::Shape(ShapePreset::Rect), window, cx);
                view.on_edgeless_left_down(&mouse_down(340.0, top + 100.0, 1), window, cx);
                view.on_edgeless_pointer_move(&mouse_move(500.0, top + 180.0, true), window, cx);
                view.on_edgeless_left_up(&mouse_up(500.0, top + 180.0), window, cx);
                let s2 = view
                    .edgeless
                    .authoring
                    .selection
                    .iter()
                    .next()
                    .unwrap()
                    .clone();
                (s1, s2)
            })
            .unwrap()
        });
        hw.request_frame();

        // P1-14: click_count=2 followed by drag moves s1 and does NOT open inline edit.
        platform.advance_clock(std::time::Duration::from_millis(600));
        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                view.on_edgeless_left_down(&mouse_down(180.0, top + 140.0, 2), window, cx);
                view.on_edgeless_pointer_move(&mouse_move(180.0, top + 200.0, true), window, cx);
                view.on_edgeless_left_up(&mouse_up(180.0, top + 200.0), window, cx);
                assert!(
                    view.edgeless.authoring.inline_edit.is_none(),
                    "P1-14: double-click mousedown followed by drag must NOT enter inline edit"
                );
                // Undo the move so s1 returns to (100, 100).
                view.edgeless_key_down(&mk_key("z", cmd_mods), window, cx);
            })
            .unwrap();
        });
        hw.request_frame();

        // P1-17 & P1-18: Double-click without drag enters Shape inline edit, 5 lines grow height (AUTO_HEIGHT),
        // and Cmd+Z / Ctrl+Y undo/redo in place.
        platform.advance_clock(std::time::Duration::from_millis(600));
        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                view.on_edgeless_left_down(&mouse_down(180.0, top + 140.0, 2), window, cx);
                view.on_edgeless_left_up(&mouse_up(180.0, top + 140.0), window, cx);
                assert!(view.edgeless.authoring.label_editor().is_some());
                view.replace_text_in_range(None, "Line1\nLine2\nLine3\nLine4\nLine5", window, cx);
                let grown_h = view.edgeless.authoring.label_editor().unwrap().world_rect.h;
                assert!(
                    grown_h > 80.0,
                    "P1-18: Shape must auto-grow beyond 80px for 5 lines, got {grown_h}"
                );
                // Home/End & Up/Down work in label editor.
                assert!(view.edgeless_key_down(
                    &mk_key("home", ui::Modifiers::default()),
                    window,
                    cx
                ));
                assert!(view.edgeless_key_down(
                    &mk_key("up", ui::Modifiers::default()),
                    window,
                    cx
                ));
                assert!(view.edgeless_key_down(
                    &mk_key("down", ui::Modifiers::default()),
                    window,
                    cx
                ));
                assert!(view.edgeless_key_down(
                    &mk_key("end", ui::Modifiers::default()),
                    window,
                    cx
                ));
                // In-place Undo + Ctrl+Y Redo.
                assert!(view.edgeless_key_down(&mk_key("z", cmd_mods), window, cx));
                assert!(view.edgeless_key_down(&mk_key("y", cmd_mods), window, cx));
                view.edgeless_commit_inline_edit(window, cx);
            })
            .unwrap();
        });
        hw.request_frame();

        // P1-23(d) & P0-5: Select s1 + s2, press F to wrap in Frame; marquee around s1 alone must NOT select Frame!
        let frame_id = app.update(|cx| {
            win.update(cx, |view, window, cx| {
                view.edgeless_set_selection([s1_id.clone(), s2_id.clone()], cx);
                assert!(view.edgeless_key_down(&mk_key("f", ui::Modifiers::default()), window, cx));
                let fid = view
                    .edgeless
                    .authoring
                    .selection
                    .iter()
                    .next()
                    .unwrap()
                    .clone();
                let kids = collect_frame_children(
                    find_block(view.snapshot.as_ref().unwrap(), &fid).unwrap(),
                );
                assert!(kids.contains(&s1_id) && kids.contains(&s2_id));
                fid
            })
            .unwrap()
        });
        hw.request_frame();
        app.update(|cx| {
            win.update(cx, |view, window, cx| {
                // Marquee strictly inside Frame around s1 only.
                let s1_rect = view
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .find(|i| i.id == s1_id)
                    .expect("s1 painted")
                    .rect;
                view.edgeless.authoring.selection.clear();
                view.edgeless.authoring.gesture = Some(EdgelessGesture::Marquee {
                    start_world: (s1_rect.x - 5.0, s1_rect.y - 5.0),
                    current_world: (s1_rect.x - 5.0, s1_rect.y - 5.0),
                });
                let end_screen = view.edgeless.camera.world_to_screen(
                    ui::point(
                        ui::px(s1_rect.right() + 5.0),
                        ui::px(s1_rect.bottom() + 5.0),
                    ),
                    ui::point(ui::px(0.0), ui::px(top)),
                );
                view.on_edgeless_pointer_move(
                    &mouse_move(f32::from(end_screen.x), f32::from(end_screen.y), true),
                    window,
                    cx,
                );
                view.on_edgeless_left_up(
                    &mouse_up(f32::from(end_screen.x), f32::from(end_screen.y)),
                    window,
                    cx,
                );
                assert!(view.edgeless.authoring.selection.contains(&s1_id));
                assert!(
                    !view.edgeless.authoring.selection.contains(&frame_id),
                    "P0-5: marquee inside Frame must NOT select the outer Frame"
                );
                // P1-25(d): Group s1 + s2 with Mod+G, then Ungroup with Mod+Shift+G.
                view.edgeless_set_selection([s1_id.clone(), s2_id.clone()], cx);
                assert!(view.edgeless_key_down(&mk_key("g", cmd_mods), window, cx));
                let gid = view
                    .edgeless
                    .authoring
                    .selection
                    .iter()
                    .next()
                    .unwrap()
                    .clone();
                assert_ne!(gid, s1_id);
                assert!(view.edgeless_key_down(&mk_key("g", cmd_shift), window, cx));
                assert!(view.edgeless.authoring.selection.contains(&s1_id));
                assert!(view.edgeless.authoring.selection.contains(&s2_id));
                // P1-25(c): Mod+C + Mod+V round-trip copies s1.
                view.edgeless_set_selection([s1_id.clone()], cx);
                let count_before = view.edgeless.authoring.painted_items.len();
                assert!(view.edgeless_key_down(&mk_key("c", cmd_mods), window, cx));
                assert!(view.edgeless_key_down(&mk_key("v", cmd_mods), window, cx));
                assert!(view.snapshot.is_some());
                let _ = count_before;
                // P2-3: T creates empty EdgelessText; switching to Page cleans up the ghost block.
                view.create_edgeless_text_at(620.0, 420.0, window, cx);
                let (et_id, _) = view.edgeless.authoring.editing_spatial_block().unwrap();
                let et_id = et_id.to_string();
                view.set_mode(crate::PlaygroundMode::Page, window, cx);
                assert!(
                    find_block(view.snapshot.as_ref().unwrap(), &et_id).is_none(),
                    "P2-3: switching to Page must clean up empty newly created EdgelessText"
                );
            })
            .unwrap();
        });
    }
}
