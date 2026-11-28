//! Host-shell embedding geometry (`canvas_rect` single source of truth for painting and input)
//! and unified mode/page switch cleanup shared by standalone chrome and host shells.

use ui::{AnyElement, Context, Pixels, Point, Size, Window, canvas, point, prelude::*, px, size};

use crate::{PlaygroundMode, PlaygroundView, TOPBAR_HEIGHT, overlays::InlineTargetEnd};

impl PlaygroundView {
    /// Override the viewport bounds when embedded inside a host shell (e.g. desktop or mobile).
    pub fn set_embedded_bounds(&mut self, width: f32, height: f32) {
        self.embedded_bounds = Some((width.max(1.0), height.max(1.0)));
    }

    /// Record the logical window origin `(origin_x, origin_y)` where a host shell embeds this view.
    pub fn set_embedded_origin(&mut self, origin_x: f32, origin_y: f32) {
        self.embedded_origin
            .set((origin_x.max(0.0), origin_y.max(0.0)));
    }

    /// Record both embedded origin and dimensions in one call for host shells.
    pub fn set_canvas_rect(&mut self, origin_x: f32, origin_y: f32, width: f32, height: f32) {
        self.set_embedded_origin(origin_x, origin_y);
        self.set_embedded_bounds(width, height);
    }

    /// Return the currently active workspace page id, if any.
    pub fn active_page_id(&self) -> Option<&str> {
        self.page_id.as_deref()
    }

    /// Shared mode-switch cleanup contract used by both `set_mode` and `set_mode_immediate`.
    pub(crate) fn apply_mode_switch_cleanup(
        &mut self,
        target: PlaygroundMode,
        mut window: Option<&mut Window>,
        cx: &mut Context<Self>,
    ) {
        let prev_mode = self.mode;
        // Commit and close any active inline edit (table cell or Edgeless label) before switching.
        self.finish_inline_targets(
            InlineTargetEnd::CommitPreedit,
            window.as_deref_mut(),
            Some(cx),
        );
        let was_editing_spatial = self.edgeless.authoring.editing_spatial_block().is_some();
        if was_editing_spatial && let Some(w) = window.as_deref_mut() {
            self.edgeless_commit_inline_edit(w, cx);
        } else {
            self.edgeless.authoring.inline_edit = None;
        }
        if prev_mode == PlaygroundMode::Page
            && target == PlaygroundMode::Edgeless
            && !was_editing_spatial
        {
            self.saved_page_selection = self.editor.selection.take();
        }
        self.edgeless.authoring.reset_transient();
        let selection_invalid_for_target = was_editing_spatial
            || target == PlaygroundMode::Edgeless
            || self.editor.selection.as_ref().is_some_and(|sel| {
                self.page_snapshot()
                    .and_then(|snap| snap.block(&sel.focus.block_id))
                    .is_none()
            });
        if selection_invalid_for_target {
            self.editor.clear_preedit_state();
            self.editor.selection = None;
            self.editor.block_selection.clear();
            self.announce_selection(cx);
        }
        self.page_scroll_fling = None;
        self.code_scroll_fling = None;
        self.edgeless_pan_fling = None;
        self.touch_long_press_anchor = None;
        self.touch_selection_menu_open = false;
        self.edgeless_readonly_selection_target = None;
        self.mode = target;
        self.dirty_text = None;
        self.context_paste_task = None;
        self.context_menu_target = None;
        self.overlays.reset();
        if target == PlaygroundMode::Page && self.editor.selection.is_none() {
            self.editor.selection = self.saved_page_selection.take();
        }
        self.prune_dangling_selection(window, cx);
    }

    /// Switch mode immediately without requiring a `Window` reference (used by host shells).
    pub fn set_mode_immediate(&mut self, mode: PlaygroundMode, cx: &mut Context<Self>) {
        if self.mode == mode {
            return;
        }
        self.apply_mode_switch_cleanup(mode, None, cx);
        self.edgeless.camera_initialized = false;
        self.pill_motion = None;
        cx.notify();
    }

    /// Select the active page id inside the workspace and rebuild layout/document snapshots.
    ///
    /// Switching to a different `page_id` runs the full `switch_active_page` cleanup contract
    /// (clearing stale selections, preedit, inline targets, overlays, edgeless authoring, and
    /// resetting `scroll_y = 0.0`) without re-invoking the host `on_active_doc_changed` callback.
    pub fn set_active_page_id(&mut self, page_id: &str, cx: &mut Context<Self>) {
        if self.page_id.as_deref() != Some(page_id) {
            self.switch_active_page(page_id, None, false, cx);
            return;
        }
        self.refresh_document();
        let stale_sel = self.editor.selection.as_ref().is_some_and(|sel| {
            self.page_snapshot()
                .and_then(|snap| snap.block(&sel.focus.block_id))
                .is_none()
        });
        if stale_sel {
            self.editor.clear_preedit_state();
            self.editor.selection = None;
            self.announce_selection(cx);
        }
        if let Some(snap) = self.page_snapshot().cloned() {
            self.editor
                .block_selection
                .retain(|id| snap.block(id).is_some());
        } else {
            self.editor.block_selection.clear();
        }
        cx.notify();
    }

    pub(crate) fn switch_active_page(
        &mut self,
        page_id: &str,
        mut window: Option<&mut Window>,
        notify_host: bool,
        cx: &mut Context<Self>,
    ) {
        self.editor.preedit = None;
        self.finish_inline_targets(
            InlineTargetEnd::DiscardPreedit,
            window.as_deref_mut(),
            Some(cx),
        );
        self.editor = Default::default();
        self.saved_page_selection = None;
        self.overlays.reset();
        self.reading_anchor = None;
        self.flow = crate::block_flow::BlockFlow::new();
        self.flow.database_state.mobile_readonly = self.database_readonly;
        self.flow.database_state.clock_ms = self.local_calendar_now(cx).0;
        self.layout = None;
        self.edgeless = crate::edgeless::EdgelessCanvasState::new();
        self.active_touch_owner = crate::TouchStrokeOwner::None;
        self.touch_long_press_anchor = None;
        self.touch_scroll_axis_lock = None;
        self.scrollbar_drag = None;
        self.edgeless_readonly_selection_target = None;
        self.page_scroll_fling = None;
        self.code_scroll_fling = None;
        self.edgeless_pan_fling = None;
        self.touch_selection_menu_open = false;
        self.database_record_sheet = None;
        self.scroll_y = 0.0;
        self.page_id = Some(page_id.to_string());
        self.refresh_document();
        if notify_host && let Some(cb) = self.on_active_doc_changed.as_mut() {
            cb(page_id);
        }
        if let Some(w) = window {
            w.notify_text_input_changed(&self.editor_focus);
            w.notify_text_selection_changed(&self.editor_focus);
        }
        cx.notify();
    }

    /// Logical window origin `(x, y)` of the active editor canvas.
    pub fn canvas_origin(&self) -> Point<Pixels> {
        let topbar = self.topbar_height();
        let (ox, oy) = if self.hide_chrome {
            self.embedded_origin.get()
        } else {
            (0.0, 0.0)
        };
        point(px(ox), px(oy + topbar))
    }

    /// Single authoritative `(origin, size)` of the active editor canvas in window coordinates,
    /// unifying standalone topbar mode and host-embedded mode for both painting and input hit-testing.
    pub fn canvas_rect(&self, window: &Window) -> (Point<Pixels>, Size<Pixels>) {
        let vp = window.viewport_size();
        let (raw_w, raw_h) = self
            .embedded_bounds
            .unwrap_or((f32::from(vp.width), f32::from(vp.height)));
        let topbar = self.topbar_height();
        (
            self.canvas_origin(),
            size(px(raw_w.floor()), px((raw_h - topbar).max(0.0).floor())),
        )
    }

    pub(crate) fn canvas_rect_cached(&self) -> (Point<Pixels>, Size<Pixels>) {
        let topbar = self.topbar_height();
        (
            self.canvas_origin(),
            size(
                px(self.window_size.0),
                px((self.window_size.1 - topbar).max(0.0)),
            ),
        )
    }

    /// Monotonic revision counter bumped on every document edit in this view.
    pub fn doc_rev(&self) -> u64 {
        self.doc_rev
    }

    pub(crate) fn topbar_height(&self) -> f32 {
        if self.hide_chrome { 0.0 } else { TOPBAR_HEIGHT }
    }

    pub(crate) fn embedded_origin_probe(&self) -> AnyElement {
        let origin_cell = self.embedded_origin.clone();
        canvas(
            |bounds, _, _| bounds,
            move |bounds, _, _, _| {
                origin_cell.set((f32::from(bounds.origin.x), f32::from(bounds.origin.y)));
            },
        )
        .absolute()
        .left(px(0.0))
        .top(px(0.0))
        .w(px(0.0))
        .h(px(0.0))
        .into_any_element()
    }
}

#[cfg(test)]
mod tests {
    use blocksuite_playground_doc::schema::{BlockSpec, ParagraphType};
    use ui::{
        Application, Bounds, EntityInputHandler, HeadlessPlatform, WindowBounds, WindowOptions,
        point, prelude::*, px, size,
    };

    use crate::{
        PlaygroundMode, PlaygroundOptions, PlaygroundView,
        edgeless::{EdgelessInlineEdit, EdgelessLabelEditor, LabelTarget},
        editor_session::{DocPoint, DocumentSelection},
    };

    #[test]
    fn set_mode_immediate_clears_edgeless_label_editor_and_blocks_leaked_typing() {
        let platform = HeadlessPlatform::new(960, 720, 1.0);
        let mut options = PlaygroundOptions::default();
        options.hide_chrome = true;
        options.mode = PlaygroundMode::Edgeless;

        let win_cell: std::rc::Rc<std::cell::RefCell<Option<ui::WindowHandle<PlaygroundView>>>> =
            std::rc::Rc::new(std::cell::RefCell::new(None));
        let win_out = win_cell.clone();
        let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
            crate::register_bundled_fonts(cx).unwrap();
            let win = cx
                .open_window(
                    WindowOptions {
                        window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                            point(px(0.0), px(0.0)),
                            size(px(960.0), px(720.0)),
                        ))),
                        ..WindowOptions::default()
                    },
                    |_, cx| cx.new(|cx| PlaygroundView::with_options(options, cx)),
                )
                .unwrap();
            *win_out.borrow_mut() = Some(win);
        });
        let win = win_cell.borrow_mut().take().unwrap();
        let hw = platform.windows().into_iter().next().unwrap();
        hw.request_frame();

        app.update(|cx| {
            win.update(cx, |v, window, cx| {
                // Simulate an active Edgeless connector label editor with an uncommitted mark.
                let mut ed = EdgelessLabelEditor::new(
                    LabelTarget::Connector {
                        surface_id: "surface-1".into(),
                        id: "conn-1".into(),
                    },
                    "initial".to_string(),
                    blocksuite_editor::edgeless::WorldRect::new(10.0, 10.0, 120.0, 32.0),
                    0.0,
                    false,
                );
                ed.input.mark(None, "draft", None);
                v.edgeless.authoring.inline_edit = Some(EdgelessInlineEdit::Label(ed));
                v.edgeless_readonly_selection_target = Some(("note-1".into(), true));

                // Host shell switches immediately back to Page without a Window reference.
                v.set_mode_immediate(PlaygroundMode::Page, cx);

                assert_eq!(v.mode, PlaygroundMode::Page);
                assert!(
                    v.edgeless.authoring.label_editor().is_none(),
                    "set_mode_immediate must clear active Edgeless label_editor"
                );
                assert!(
                    v.edgeless.authoring.editing_spatial_block().is_none(),
                    "set_mode_immediate must clear spatial block inline_edit"
                );
                assert!(v.edgeless_readonly_selection_target.is_none());
                assert!(v.table_cell.is_none());

                // Typing without a Page selection must NOT route into a hidden label editor.
                v.replace_text_in_range(None, "leaked", window, cx);
                assert!(v.edgeless.authoring.label_editor().is_none());
            })
            .unwrap();
        });
    }

    #[test]
    fn set_active_page_id_clears_stale_selection_preedit_and_scroll() {
        let platform = HeadlessPlatform::new(960, 720, 1.0);
        let mut options = PlaygroundOptions::default();
        options.hide_chrome = true;

        let win_cell: std::rc::Rc<std::cell::RefCell<Option<ui::WindowHandle<PlaygroundView>>>> =
            std::rc::Rc::new(std::cell::RefCell::new(None));
        let win_out = win_cell.clone();
        let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
            crate::register_bundled_fonts(cx).unwrap();
            let win = cx
                .open_window(
                    WindowOptions {
                        window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                            point(px(0.0), px(0.0)),
                            size(px(960.0), px(720.0)),
                        ))),
                        ..WindowOptions::default()
                    },
                    |_, cx| cx.new(|cx| PlaygroundView::with_options(options, cx)),
                )
                .unwrap();
            *win_out.borrow_mut() = Some(win);
        });
        let win = win_cell.borrow_mut().take().unwrap();
        let hw = platform.windows().into_iter().next().unwrap();
        hw.request_frame();

        app.update(|cx| {
            win.update(cx, |v, _, cx| {
                v.edit_document(cx, |ds| {
                    let _ = ds.workspace.create_page("doc-b", "Second Doc", 2);
                    if let Ok(page) = ds.workspace.ensure_page("doc-b") {
                        let _ = page.add_block(
                            "b-root",
                            BlockSpec::Page {
                                title: "Second Doc".into(),
                            },
                            None,
                            None,
                            2,
                        );
                        let _ = page.add_block(
                            "b-note",
                            BlockSpec::Note { xywh: None },
                            Some("b-root"),
                            None,
                            2,
                        );
                        let _ = page.add_block(
                            "b-p1",
                            BlockSpec::Paragraph {
                                paragraph_type: ParagraphType::Text,
                                text: "Hello second doc".into(),
                            },
                            Some("b-note"),
                            None,
                            2,
                        );
                    }
                });

                // Seed stale selection, block_selection, and non-zero scroll on doc-a.
                v.editor.selection = Some(DocumentSelection::caret(DocPoint::new("stale-id", 0)));
                v.editor.block_selection = vec!["stale-id".into()];
                v.scroll_y = 148.0;

                // Switch to doc-b via host shell API.
                v.set_active_page_id("doc-b", cx);

                assert_eq!(v.active_page_id(), Some("doc-b"));
                assert!(
                    v.document_selection().is_none(),
                    "switching page_id must clear stale selection from previous doc"
                );
                assert!(
                    v.block_selection().is_empty(),
                    "switching page_id must clear stale block_selection"
                );
                assert_eq!(
                    v.scroll_offset(),
                    0.0,
                    "switching page_id must reset scroll_y to 0.0"
                );
                assert!(v.table_cell.is_none());
                assert!(
                    v.page_snapshot().and_then(|s| s.block("b-p1")).is_some(),
                    "snapshot must reflect newly activated doc-b"
                );
            })
            .unwrap();
        });
    }
}
