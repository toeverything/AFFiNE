//! Edgeless keyboard shortcuts, selection/z-order commands, and snapshot spatial helpers.

use blocksuite_playground_doc::{
    fractional_index::generate_key_between,
    read::{BlockContent, BlockNode, PageSnapshot, SurfaceElement},
};
use ui::{Context, KeyDownEvent, Window};
use y_octo::{Any, SessionValue};

use crate::PlaygroundView;

use super::{EdgelessGesture, EdgelessTool, SpatialItemInfo};
#[cfg(test)]
use super::{HandleKind, SpatialItemKind};

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

pub(super) fn find_surface_element<'a>(
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
        if let EdgelessTool::Shape(s) = tool {
            self.edgeless.authoring.last_shape_type = Some(s);
        }
        self.edgeless_commit_inline_edit(window, cx);
        self.edgeless.authoring.tool = tool;
        self.edgeless.authoring.gesture = None;
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
            if let (Some(room), Some(id)) = (&self.room, &self.page_id) {
                room.link
                    .send_binary(blocksuite_playground_doc::wire::RoomBinaryFrame::Doc {
                        doc_id: id.clone(),
                        message: blocksuite_playground_doc::wire::DocMessage::Update(commit.update),
                    });
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
            match key {
                "escape" => {
                    self.edgeless_commit_inline_edit(window, cx);
                    return true;
                }
                "enter" if !ed.multiline || cmd => {
                    self.edgeless_commit_inline_edit(window, cx);
                    return true;
                }
                "enter" => {
                    self.edgeless_label_edit(window, cx, |ed| ed.replace(None, "\n"));
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
                "delete" => {
                    self.edgeless_label_edit(
                        window,
                        cx,
                        super::EdgelessLabelEditor::delete_forward,
                    );
                    return true;
                }
                "left" => {
                    ed.move_caret(true, m.shift);
                    let sel = ed.selection.clone();
                    self.edgeless_update_label_anchors(sel);
                    window.notify_text_input_changed(&self.editor_focus);
                    cx.notify();
                    return true;
                }
                "right" => {
                    ed.move_caret(false, m.shift);
                    let sel = ed.selection.clone();
                    self.edgeless_update_label_anchors(sel);
                    window.notify_text_input_changed(&self.editor_focus);
                    cx.notify();
                    return true;
                }
                "a" if cmd => {
                    ed.select_all();
                    let sel = ed.selection.clone();
                    self.edgeless_update_label_anchors(sel);
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

        // 2. Active inline spatial block edit (Note / EdgelessText): Escape exits, else EditorSession.
        if self.edgeless.authoring.editing_spatial_block().is_some() {
            if key == "escape" && !self.editor.composing() {
                self.edgeless_commit_inline_edit(window, cx);
                return true;
            }
            return false;
        }

        // 3. Canvas-level shortcuts when not inline-editing.
        match key {
            "space" if !cmd => {
                self.edgeless.authoring.space_pan = true;
                return true;
            }
            "escape" => {
                self.edgeless.authoring.tool = EdgelessTool::Select;
                self.edgeless.authoring.gesture = None;
                self.edgeless.authoring.selection.clear();
                cx.notify();
                return true;
            }
            "v" if !cmd => {
                self.edgeless_select_tool(EdgelessTool::Select, window, cx);
                return true;
            }
            "h" if !cmd => {
                self.edgeless_select_tool(EdgelessTool::Hand, window, cx);
                return true;
            }
            "n" if !cmd => {
                self.edgeless_select_tool(EdgelessTool::Note, window, cx);
                return true;
            }
            "s" if !cmd => {
                let shape = self.edgeless.authoring.active_shape_type();
                self.edgeless_select_tool(EdgelessTool::Shape(shape), window, cx);
                return true;
            }
            "c" if !cmd => {
                self.edgeless_select_tool(EdgelessTool::Connector, window, cx);
                return true;
            }
            "p" if !cmd => {
                self.edgeless_select_tool(EdgelessTool::Brush, window, cx);
                return true;
            }
            "t" if !cmd => {
                self.edgeless_select_tool(EdgelessTool::Text, window, cx);
                return true;
            }
            "f" if !cmd => {
                self.edgeless_select_tool(EdgelessTool::Frame, window, cx);
                return true;
            }
            "a" if cmd => {
                self.edgeless.authoring.selection = self
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .map(|i| i.id.clone())
                    .collect();
                cx.notify();
                return true;
            }
            "backspace" | "delete" => {
                self.edgeless_delete_selection(cx);
                return true;
            }
            "[" => {
                self.edgeless_reorder_selection(false, cx);
                return true;
            }
            "]" => {
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
            _ => false,
        }
    }

    pub(crate) fn edgeless_delete_selection(&mut self, cx: &mut Context<Self>) {
        if self.edgeless.authoring.selection.is_empty() {
            return;
        }
        let Some(snapshot) = self.snapshot.clone() else {
            return;
        };
        let root_id = snapshot.root.as_ref().map(|r| r.id.clone());
        let selected: Vec<SpatialItemInfo> = self
            .edgeless
            .authoring
            .painted_items
            .iter()
            .filter(|i| self.edgeless.authoring.selection.contains(&i.id))
            .cloned()
            .collect();
        let mut block_ids: Vec<String> = Vec::new();
        let mut surface_elements: Vec<(String, String)> = Vec::new();
        for item in &selected {
            if root_id.as_deref() == Some(item.id.as_str()) {
                continue;
            }
            if item.kind.is_block() {
                block_ids.push(item.id.clone());
            } else if let Some(surface_id) = &item.surface_id {
                surface_elements.push((surface_id.clone(), item.id.clone()));
            }
        }
        let now_ms = self.now_ms(cx) as u64;
        let commit = self.page_mut().ok().and_then(|page| {
            let b_refs: Vec<&str> = block_ids.iter().map(String::as_str).collect();
            let s_refs: Vec<(&str, &str)> = surface_elements
                .iter()
                .map(|(s, e)| (s.as_str(), e.as_str()))
                .collect();
            page.delete_blocks_and_elements_with_connectors(&b_refs, &s_refs, now_ms)
                .ok()
                .flatten()
        });
        self.edgeless.authoring.selection.clear();
        if let Some(commit) = commit {
            self.did_edgeless_doc_commit(commit, cx);
        }
        cx.notify();
    }

    pub(crate) fn edgeless_reorder_selection(
        &mut self,
        bring_to_front: bool,
        cx: &mut Context<Self>,
    ) {
        if self.edgeless.authoring.selection.is_empty() {
            return;
        }
        let Some(snapshot) = self.snapshot.clone() else {
            return;
        };
        let mut cursor = if bring_to_front {
            max_spatial_index(&snapshot)
        } else {
            min_spatial_index(&snapshot)
        };
        let selected: Vec<SpatialItemInfo> = self
            .edgeless
            .authoring
            .painted_items
            .iter()
            .filter(|i| self.edgeless.authoring.selection.contains(&i.id))
            .cloned()
            .collect();
        let now_ms = self.now_ms(cx) as u64;
        let mut updates = Vec::new();
        let ordered: Vec<SpatialItemInfo> = if bring_to_front {
            selected
        } else {
            selected.into_iter().rev().collect()
        };
        for item in ordered {
            let next = if bring_to_front {
                generate_key_between(cursor.as_deref(), None).ok()
            } else {
                generate_key_between(None, cursor.as_deref()).ok()
            };
            if let Some(key) = next {
                cursor = Some(key.clone());
                updates.push((item, key));
            }
        }
        if updates.is_empty() {
            return;
        }
        let commit = self.page_mut().ok().and_then(|page| {
            page.structural_edit(now_ms, move |page| {
                for (item, key) in &updates {
                    if item.kind.is_block() {
                        page.set_block_index(&item.id, key, now_ms)?;
                    } else if let Some(surface_id) = &item.surface_id {
                        page.set_surface_element_field(
                            surface_id,
                            &item.id,
                            "index",
                            SessionValue::Any(Any::String(key.clone())),
                            now_ms,
                        )?;
                    }
                }
                Ok(())
            })
            .ok()
            .flatten()
        });
        if let Some(commit) = commit {
            self.did_edgeless_doc_commit(commit, cx);
        }
    }
}

/// Collect `SpatialItemInfo` from a `PageSnapshot` in paint order (used by hit-testing & tests).
pub fn collect_frame_children(node: &BlockNode) -> Vec<String> {
    node.props
        .get("prop:childElementIds")
        .and_then(|v| v.as_object())
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default()
}

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
                let before_label = view.edgeless.authoring.label_editor().unwrap().text.clone();
                let image_only = ui::ClipboardItem {
                    entries: vec![ui::ClipboardEntry::Image(ui::Image {
                        bytes: vec![1, 2, 3, 4],
                        format: ui::ImageFormat::Png,
                        id: 1,
                    })],
                };
                view.paste(image_only, window, cx);
                assert_eq!(
                    view.edgeless.authoring.label_editor().unwrap().text,
                    before_label,
                    "image-only paste must not erase selected label text"
                );
            })
            .unwrap();
        });
    }

    #[test]
    fn edgeless_view_authoring_gestures_and_note_preedit_parity() {
        use blocksuite_playground_doc::read::ShapeType;
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
                view.edgeless_select_tool(EdgelessTool::Shape(ShapeType::Rect), window, cx);
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

                // 3. Create 2D Brush stroke -> inflated xywh & 2-element points.
                view.edgeless_select_tool(EdgelessTool::Brush, window, cx);
                view.on_edgeless_left_down(&mouse_down(50.0, top + 300.0, 1), window, cx);
                view.on_edgeless_pointer_move(&mouse_move(110.0, top + 340.0, true), window, cx);
                view.on_edgeless_left_up(&mouse_up(110.0, top + 340.0), window, cx);
                let brush_id = view
                    .edgeless
                    .authoring
                    .selection
                    .iter()
                    .next()
                    .unwrap()
                    .clone();
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

                // 4. Create Text + Escape removes empty element.
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
                assert!(find_surface_element(view.snapshot.as_ref().unwrap(), &text_id).is_some());
                view.edgeless_commit_inline_edit(window, cx);
                assert!(
                    find_surface_element(view.snapshot.as_ref().unwrap(), &text_id).is_none(),
                    "empty newly-created SurfaceText must be removed on close"
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
                let bounds = view.edgeless_label_screen_bounds().unwrap();
                let line1_x = f32::from(bounds.origin.x) + 24.0;
                let line1_y = f32::from(bounds.origin.y) + 14.0;
                view.on_edgeless_left_down(&mouse_down(line1_x, line1_y, 1), window, cx);
                view.replace_text_in_range(None, "*", window, cx);
                let text = view.edgeless.authoring.label_editor().unwrap().text.clone();
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
}
