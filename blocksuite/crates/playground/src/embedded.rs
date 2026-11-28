//! Embedded host shell geometry (`canvas_rect`, `set_embedded_rect`, `set_embedded_bounds`)
//! and immediate mode/page switching helpers for `PlaygroundView`.

use ui::{Context, Pixels, Point, Size, Window, point, px, size};

use crate::editor_session::{DocPoint, DocumentSelection, text_content};
use crate::overlays::InlineTargetEnd;
use crate::{PlaygroundMode, PlaygroundView, TOPBAR_HEIGHT};

impl PlaygroundView {
    /// Set explicit embedded pane geometry `(origin_x, origin_y, width, height)` in window
    /// coordinates when hosted inside a multi-pane workbench or modal overlay.
    pub fn set_embedded_rect(&mut self, origin_x: f32, origin_y: f32, width: f32, height: f32) {
        self.embedded_rect = Some((origin_x, origin_y, width.max(1.0), height.max(1.0)));
    }

    /// Backwards-compatible wrapper setting embedded pane dimensions at origin `(0, 0)`.
    pub fn set_embedded_bounds(&mut self, width: f32, height: f32) {
        self.set_embedded_rect(0.0, 0.0, width, height);
    }

    /// Switch mode immediately without requiring a `Window` reference (used by host shells).
    /// Shares the exact inline-edit commit and selection-pruning core with [`Self::set_mode`].
    pub fn set_mode_immediate(&mut self, mode: PlaygroundMode, cx: &mut Context<Self>) {
        self.transition_mode_core(mode, None, false, cx);
    }

    /// Select the active page id inside the workspace, committing/clearing any stale inline
    /// edits or selections from the previous page, rebuilding layout/document snapshots, and
    /// placing a collapsed caret in the new page's first editable block when in Page mode.
    pub fn set_active_page_id(&mut self, page_id: &str, cx: &mut Context<Self>) {
        self.finish_inline_targets(InlineTargetEnd::CommitPreedit, None, Some(cx));
        if self.edgeless.authoring.editing_spatial_block().is_some() {
            self.edgeless_commit_inline_edit_inner(None, cx);
        }
        self.switch_active_page(page_id, None, cx);
        if self.mode == PlaygroundMode::Page
            && let Some(first_id) = self.first_page_editable_block_id()
        {
            self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(first_id, 0)));
            self.announce_selection(cx);
            cx.notify();
        }
    }

    fn first_page_editable_block_id(&self) -> Option<String> {
        let root = self.snapshot.as_deref()?.root.as_ref()?;
        root.children
            .iter()
            .filter(|c| c.is_page_visible_note())
            .flat_map(|note| note.walk())
            .find(|node| text_content(node).is_some())
            .map(|node| node.id.clone())
            .or_else(|| Some(root.id.clone()))
    }

    pub(crate) fn topbar_height(&self) -> f32 {
        if self.hide_chrome { 0.0 } else { TOPBAR_HEIGHT }
    }

    pub(crate) fn effective_viewport_size(&self, window: &Window) -> (f32, f32) {
        self.embedded_rect
            .map(|(_, _, w, h)| (w, h))
            .unwrap_or_else(|| {
                let vp = window.viewport_size();
                (f32::from(vp.width), f32::from(vp.height))
            })
    }

    /// Single authoritative editable canvas rectangle `(origin, size)` in window coordinates.
    ///
    /// Standalone mode returns `((0, TOPBAR_HEIGHT), (win_w, win_h - TOPBAR_HEIGHT))`.
    /// Embedded `hide_chrome` mode returns `((origin_x, origin_y), (pane_w, pane_h))`.
    pub fn canvas_rect(&self, window: &Window) -> (Point<Pixels>, Size<Pixels>) {
        let vp = window.viewport_size();
        if self.hide_chrome {
            let (ox, oy, w, h) =
                self.embedded_rect
                    .unwrap_or((0.0, 0.0, f32::from(vp.width), f32::from(vp.height)));
            (point(px(ox), px(oy)), size(px(w), px(h)))
        } else {
            let h = (f32::from(vp.height) - TOPBAR_HEIGHT).max(0.0);
            (point(px(0.0), px(TOPBAR_HEIGHT)), size(vp.width, px(h)))
        }
    }

    /// Window-coordinate origin `(x, y)` of the editable canvas.
    pub fn canvas_origin_px(&self) -> (f32, f32) {
        let o = self.canvas_origin();
        (f32::from(o.x), f32::from(o.y))
    }

    /// Cached editable canvas dimensions `(width, height)` from the last layout/embed update.
    pub fn canvas_rect_cached_size(&self) -> (f32, f32) {
        if let Some((_, _, w, h)) = self.embedded_rect {
            (w, h)
        } else {
            (
                self.window_size.0.max(1.0),
                (self.window_size.1 - self.topbar_height()).max(1.0),
            )
        }
    }

    /// Window-coordinate origin of the editable canvas (deducted by pointer & overlay hit-tests).
    pub(crate) fn canvas_origin(&self) -> Point<Pixels> {
        if self.hide_chrome {
            let (ox, oy) = self
                .embedded_rect
                .map(|(x, y, _, _)| (x, y))
                .unwrap_or((0.0, 0.0));
            point(px(ox), px(oy))
        } else {
            point(px(0.0), px(TOPBAR_HEIGHT))
        }
    }
}

#[cfg(test)]
mod tests {
    use std::rc::Rc;

    use blocksuite_playground_doc::read::{BlockContent, SurfaceElementKind};
    use blocksuite_playground_doc::schema::{
        BlockSpec, ConnectorEndpointSpec, ParagraphType, SurfaceElementSpec,
    };
    use ui::{
        AppContext, Bounds, EntityInputHandler, HeadlessPlatform, WindowBounds, WindowOptions,
        point, px, size,
    };

    use super::*;
    use crate::room_client::DocState;
    use crate::{HOME_PAGE_ID, PlaygroundOptions};

    fn open_view(
        state: DocState,
    ) -> (
        Rc<HeadlessPlatform>,
        ui::ApplicationHandle,
        ui::WindowHandle<PlaygroundView>,
        ui::HeadlessWindow,
    ) {
        let platform = HeadlessPlatform::new(1280, 800, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let win = app.update(|cx| {
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(1280.0), px(800.0)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| {
                    cx.new(|cx| {
                        let mut v = PlaygroundView::with_options(
                            PlaygroundOptions {
                                hide_chrome: true,
                                ..PlaygroundOptions::default()
                            },
                            cx,
                        );
                        v.set_document(state, cx);
                        v
                    })
                },
            )
            .unwrap()
        });
        let hw = platform.windows().into_iter().next().unwrap();
        hw.request_frame();
        platform.run_until_parked();
        (platform, app, win, hw)
    }

    #[test]
    fn set_mode_immediate_commits_and_closes_edgeless_connector_label_editor() {
        let mut state = DocState::new("ws-embedded-mode", 71).unwrap();
        state.workspace.initialize_meta().unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Mode Test", 1)
            .unwrap();
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "Mode Test".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note { xywh: None },
                Some("root"),
                None,
                2,
            )
            .unwrap();
            page.add_block(
                "p1",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: "Body".into(),
                },
                Some("note"),
                None,
                3,
            )
            .unwrap();
            page.add_block("surf", BlockSpec::Surface, Some("root"), None, 4)
                .unwrap();
            page.add_surface_element(
                "surf",
                "conn-1",
                "a0",
                SurfaceElementSpec::Connector {
                    mode: 0,
                    seed: 1,
                    source: ConnectorEndpointSpec::point(60.0, 240.0),
                    target: ConnectorEndpointSpec::point(360.0, 240.0),
                    text: Some("Label".into()),
                    label_xywh: None,
                },
                5,
            )
            .unwrap();
            page.stop_capturing().unwrap();
        }
        let (platform, app, win, hw) = open_view(state);

        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.set_mode(PlaygroundMode::Edgeless, w, cx);
            })
            .unwrap();
        });
        hw.request_frame();
        platform.run_until_parked();

        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                assert!(
                    v.edgeless_begin_inline_edit("conn-1", w, cx),
                    "expected connector label editor to open"
                );
                assert!(v.edgeless.authoring.label_editor().is_some());
                v.set_mode_immediate(PlaygroundMode::Page, cx);
                assert_eq!(v.mode, PlaygroundMode::Page);
                assert!(
                    v.edgeless.authoring.label_editor().is_none(),
                    "set_mode_immediate must close active Edgeless label editor"
                );
                v.replace_text_in_range(None, "Z", w, cx);
            })
            .unwrap();
        });

        let connector_label = app.update(|cx| {
            win.update(cx, |v, _w, _cx| {
                let snap = v.snapshot.as_deref().expect("snapshot");
                let root = snap.root.as_ref().expect("root");
                root.children.iter().find_map(|c| match &c.content {
                    BlockContent::Surface { elements, .. } => elements.iter().find_map(|el| {
                        if el.id == "conn-1"
                            && let SurfaceElementKind::Connector(conn) = &el.kind
                        {
                            Some(conn.text.plain.clone())
                        } else {
                            None
                        }
                    }),
                    _ => None,
                })
            })
            .unwrap()
        });
        assert_eq!(
            connector_label.as_deref(),
            Some("Label"),
            "typing after set_mode_immediate(Page) must not leak into hidden connector label"
        );
    }

    #[test]
    fn set_active_page_id_resets_stale_selection_and_routes_typing_to_new_doc() {
        let mut state = DocState::new("ws-embedded-pages", 72).unwrap();
        state.workspace.initialize_meta().unwrap();
        state.workspace.create_page("doc-a", "Doc A", 1).unwrap();
        state.workspace.create_page("doc-b", "Doc B", 2).unwrap();
        {
            let page_a = state.workspace.ensure_page("doc-a").unwrap();
            page_a
                .add_block(
                    "root-a",
                    BlockSpec::Page {
                        title: "Doc A".into(),
                    },
                    None,
                    None,
                    1,
                )
                .unwrap();
            page_a
                .add_block(
                    "note-a",
                    BlockSpec::Note { xywh: None },
                    Some("root-a"),
                    None,
                    2,
                )
                .unwrap();
            page_a
                .add_block(
                    "a1",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "hello world".into(),
                    },
                    Some("note-a"),
                    None,
                    3,
                )
                .unwrap();
            page_a.stop_capturing().unwrap();

            let page_b = state.workspace.ensure_page("doc-b").unwrap();
            page_b
                .add_block(
                    "root-b",
                    BlockSpec::Page {
                        title: "Doc B".into(),
                    },
                    None,
                    None,
                    4,
                )
                .unwrap();
            page_b
                .add_block(
                    "note-b",
                    BlockSpec::Note { xywh: None },
                    Some("root-b"),
                    None,
                    5,
                )
                .unwrap();
            page_b
                .add_block(
                    "b1",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "beta".into(),
                    },
                    Some("note-b"),
                    None,
                    6,
                )
                .unwrap();
            page_b.stop_capturing().unwrap();
        }
        let (platform, app, win, hw) = open_view(state);

        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.set_active_page_id("doc-a", cx);
                v.change_selection(DocumentSelection::caret(DocPoint::new("a1", 5)), w, cx);
                assert_eq!(
                    v.editor
                        .selection
                        .as_ref()
                        .map(|s| s.focus.block_id.as_str()),
                    Some("a1")
                );
            })
            .unwrap();
        });
        hw.request_frame();
        platform.run_until_parked();

        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.set_active_page_id("doc-b", cx);
                assert_ne!(
                    v.editor
                        .selection
                        .as_ref()
                        .map(|s| s.focus.block_id.as_str()),
                    Some("a1"),
                    "stale selection from doc-a must be cleared on set_active_page_id"
                );
                assert_eq!(
                    v.editor
                        .selection
                        .as_ref()
                        .map(|s| s.focus.block_id.as_str()),
                    Some("b1"),
                    "caret should land on doc-b's first editable block"
                );
                v.replace_text_in_range(None, "X", w, cx);
            })
            .unwrap();
        });

        let (doc_a_text, doc_b_text) = app.update(|cx| {
            win.update(cx, |v, _w, _cx| {
                let snap_a = v
                    .state
                    .workspace
                    .page("doc-a")
                    .unwrap()
                    .read_page_snapshot()
                    .unwrap();
                let snap_b = v
                    .state
                    .workspace
                    .page("doc-b")
                    .unwrap()
                    .read_page_snapshot()
                    .unwrap();
                let a = snap_a
                    .block("a1")
                    .and_then(text_content)
                    .map(str::to_string);
                let b = snap_b
                    .block("b1")
                    .and_then(text_content)
                    .map(str::to_string);
                (a, b)
            })
            .unwrap()
        });
        assert_eq!(doc_b_text.as_deref(), Some("Xbeta"));
        assert_eq!(doc_a_text.as_deref(), Some("hello world"));
    }
}
