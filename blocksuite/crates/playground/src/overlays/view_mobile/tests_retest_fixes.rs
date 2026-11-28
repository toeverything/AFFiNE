//! Deterministic regression tests for collaborative record sheet release, single-truth record
//! sheet wrapping & touch ownership, RTL mobile database view-tab swiping, Edgeless connector
//! multiline growth & frame title inline-edit alignment, touch selection menu dismissal, linked
//! document navigation, and table-cell vertical `goal_x` + paragraph triple-click.

use std::{cell::RefCell, rc::Rc};

use blocksuite_playground_doc::schema::{
    BlockSpec, ConnectorEndpointSpec, ParagraphType, SurfaceElementSpec,
};
use ui::{
    AppContext, Bounds, EntityInputHandler, HeadlessPlatform, KeyDownEvent, Keystroke, Modifiers,
    MouseButton, MouseDownEvent, ScrollDelta, ScrollEvent, ScrollSource, TouchPhase, WindowBounds,
    WindowOptions, point, px, size,
};

use crate::{
    FormFactor, HOME_PAGE_ID, PlaygroundMode, PlaygroundOptions, PlaygroundView,
    editor_session::{DocPoint, DocumentSelection},
    overlays::OverlayEvent,
    room_client::DocState,
};

struct TestHarness {
    platform: Rc<HeadlessPlatform>,
    app: ui::ApplicationHandle,
    win: ui::WindowHandle<PlaygroundView>,
    hw: ui::HeadlessWindow,
}

impl TestHarness {
    fn open(w: u32, h: u32, options: PlaygroundOptions, state: DocState) -> Self {
        let platform = HeadlessPlatform::new(w, h, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let win = app.update(|cx| {
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(w as f32), px(h as f32)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| {
                    cx.new(|cx| {
                        let mut v = PlaygroundView::with_options(options, cx);
                        v.set_document(state, cx);
                        v
                    })
                },
            )
            .unwrap()
        });
        let hw = platform.windows().into_iter().next().unwrap();
        let h = Self {
            platform,
            app,
            win,
            hw,
        };
        h.pump();
        h
    }

    fn pump(&self) {
        for _ in 0..3 {
            self.hw.request_frame();
            self.platform.run_until_parked();
        }
    }

    fn view<R>(
        &self,
        f: impl FnOnce(&mut PlaygroundView, &mut ui::Window, &mut ui::Context<PlaygroundView>) -> R,
    ) -> R {
        self.app.update(|cx| self.win.update(cx, f).unwrap())
    }

    fn save_evidence_png(&self, filename: &str) {
        self.pump();
        if let Ok(dir) = std::env::var("P5_EVIDENCE_DIR") {
            let _ = std::fs::create_dir_all(&dir);
            self.view(|_, w, _| {
                if let Ok(img) = w.render_to_image() {
                    let _ = img.save(format!("{dir}/{filename}"));
                }
            });
        }
    }
}

fn key_down(key: &str) -> KeyDownEvent {
    KeyDownEvent {
        keystroke: Keystroke {
            key: key.to_string(),
            modifiers: Modifiers::default(),
            key_char: None,
        },
        is_held: false,
        prefer_character_input: false,
    }
}

fn para(text: &str) -> BlockSpec {
    BlockSpec::Paragraph {
        paragraph_type: ParagraphType::Text,
        text: text.into(),
    }
}

#[test]
fn edgeless_connector_multiline_growth_and_frame_title_alignment() {
    let mut state = DocState::new("edgeless-inline-bounds", 320).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Edgeless Bounds", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Edgeless Bounds".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block("surf", BlockSpec::Surface, Some("root"), None, 2)
            .unwrap();
        page.add_block(
            "frame-1",
            BlockSpec::Frame {
                title: "Workspace Overview".into(),
                xywh: Some("[40,80,360,220]".into()),
                presentation_index: Some("a0".into()),
            },
            Some("surf"),
            None,
            3,
        )
        .unwrap();
        page.add_surface_element(
            "surf",
            "conn-1",
            "a1",
            SurfaceElementSpec::Connector {
                mode: 0,
                seed: 1,
                source: ConnectorEndpointSpec::point(60.0, 340.0),
                target: ConnectorEndpointSpec::point(360.0, 340.0),
                text: Some("Line 1".into()),
                label_xywh: None,
            },
            4,
        )
        .unwrap();
    }

    let h = TestHarness::open(1280, 800, PlaygroundOptions::default(), state);
    h.view(|v, w, cx| v.set_mode(PlaygroundMode::Edgeless, w, cx));
    h.pump();

    // Connector inline edit grows dynamically on newline and supports single-step Undo.
    let (h1, h2, h3) = h.view(|v, w, cx| {
        assert!(v.edgeless_begin_inline_edit("conn-1", w, cx));
        let h1 = f32::from(v.edgeless_label_screen_bounds(w).unwrap().size.height);
        v.editor_key_down(&key_down("enter"), w, cx);
        let h2 = f32::from(v.edgeless_label_screen_bounds(w).unwrap().size.height);
        v.replace_text_in_range(None, "Line 2", w, cx);
        v.editor_key_down(&key_down("enter"), w, cx);
        let h3 = f32::from(v.edgeless_label_screen_bounds(w).unwrap().size.height);
        (h1, h2, h3)
    });
    h.save_evidence_png("p5-h3-connector-multiline-after.png");
    h.view(|v, w, cx| {
        v.edgeless_commit_inline_edit(w, cx);
    });
    assert!(
        h2 > h1 + 8.0 && h3 > h2 + 8.0,
        "connector edit box must grow on each newline (h1={h1}, h2={h2}, h3={h3})"
    );
    h.view(|v, w, cx| {
        v.history(false, w, cx).unwrap();
    });
    let restored = h.view(|v, _, _| {
        let snap = v.page_snapshot().unwrap();
        snap.root
            .as_ref()
            .unwrap()
            .walk()
            .find_map(|n| match &n.content {
                blocksuite_playground_doc::read::BlockContent::Surface { elements, .. } => elements
                    .iter()
                    .find(|e| e.id == "conn-1")
                    .and_then(|e| match &e.kind {
                        blocksuite_playground_doc::read::SurfaceElementKind::Connector(c) => {
                            Some(c.text.plain.clone())
                        }
                        _ => None,
                    }),
                _ => None,
            })
            .unwrap()
    });
    assert_eq!(restored, "Line 1");

    // Frame title inline edit fits "Workspace Overview" on one line without wrapping.
    let frame_lines = h.view(|v, w, cx| {
        assert!(v.edgeless_begin_inline_edit("frame-1", w, cx));
        let bounds = v.edgeless_label_screen_bounds(w).unwrap();
        let ed = v.edgeless.authoring.label_editor().unwrap();
        let laid = blocksuite_editor::edgeless::layout_label_editor_paragraph(
            ed,
            f32::from(bounds.size.width),
            v.edgeless.camera.zoom,
            v.theme,
            w,
        )
        .unwrap();
        laid.lines().len()
    });
    h.save_evidence_png("p5-h9-frame-title-after.png");
    assert_eq!(
        frame_lines, 1,
        "frame title inline edit must fit 'Workspace Overview' on a single line"
    );
}

#[test]
fn touch_selection_menu_dismisses_on_typing_ime_key_and_scroll() {
    let mut state = DocState::new("menu-dismiss", 330).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Menu", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Menu".into(),
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
        page.add_block("p1", para("alpha beta gamma"), Some("note"), None, 3)
            .unwrap();
    }
    let h = TestHarness::open(
        390,
        844,
        PlaygroundOptions::for_form_factor(FormFactor::Phone),
        state,
    );
    let open_menu = |h: &TestHarness| {
        h.view(|v, w, cx| {
            v.select_document_range(
                DocumentSelection {
                    anchor: DocPoint::new("p1", 0),
                    focus: DocPoint::new("p1", 5),
                },
                w,
                cx,
            );
            v.touch_selection_menu_open = true;
            cx.notify();
        });
    };

    // 1. Typing dismisses menu.
    open_menu(&h);
    h.view(|v, w, cx| v.replace_text_in_range(None, "x", w, cx));
    assert!(!h.view(|v, _, _| v.touch_selection_menu_open));

    // 2. IME composition dismisses menu.
    open_menu(&h);
    h.view(|v, w, cx| v.replace_and_mark_text_in_range(None, "ni", None, w, cx));
    assert!(!h.view(|v, _, _| v.touch_selection_menu_open));
    h.view(|v, w, cx| v.unmark_text(w, cx));

    // 3. Key press dismisses menu.
    open_menu(&h);
    h.view(|v, w, cx| v.editor_key_down(&key_down("right"), w, cx));
    assert!(!h.view(|v, _, _| v.touch_selection_menu_open));

    // 4. Scroll dismisses menu.
    open_menu(&h);
    h.view(|v, w, cx| {
        v.on_scroll(
            &ScrollEvent {
                position: point(px(195.0), px(300.0)),
                delta: ScrollDelta::Pixels(point(px(0.0), px(-40.0))),
                modifiers: Modifiers::default(),
                touch_phase: TouchPhase::Moved,
                source: ScrollSource::Pointer,
            },
            w,
            cx,
        );
    });
    assert!(!h.view(|v, _, _| v.touch_selection_menu_open));
}

#[test]
fn linked_doc_reference_chip_and_embed_card_switch_active_document() {
    let mut state = DocState::new("doc-nav", 340).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Home Doc", 1)
        .unwrap();
    state
        .workspace
        .create_page("doc:target", "Target Doc", 2)
        .unwrap();
    {
        let target = state.workspace.ensure_page("doc:target").unwrap();
        target
            .add_block(
                "t-root",
                BlockSpec::Page {
                    title: "Target Doc".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
        target
            .add_block(
                "t-note",
                BlockSpec::Note { xywh: None },
                Some("t-root"),
                None,
                2,
            )
            .unwrap();
        target
            .add_block(
                "t-p1",
                para("Arrived in target doc"),
                Some("t-note"),
                None,
                3,
            )
            .unwrap();
    }
    {
        let home = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        home.add_block(
            "h-root",
            BlockSpec::Page {
                title: "Home Doc".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        home.add_block(
            "h-note",
            BlockSpec::Note { xywh: None },
            Some("h-root"),
            None,
            2,
        )
        .unwrap();
        home.add_block("h-p1", para("See "), Some("h-note"), None, 3)
            .unwrap();
    }

    let h = TestHarness::open(1280, 800, PlaygroundOptions::default(), state);
    h.view(|v, w, cx| {
        v.insert_inline_reference_chip("h-p1", 4, 0, "doc:target", w, cx)
            .unwrap();
    });
    let observed = Rc::new(RefCell::new(Vec::<String>::new()));
    let obs_clone = Rc::clone(&observed);
    h.view(|v, _, _| {
        v.set_on_active_doc_changed(Box::new(move |id| {
            obs_clone.borrow_mut().push(id.to_string())
        }));
    });
    h.pump();

    // Click the inline @ ReferenceChip on h-p1.
    let chip_pt = h.view(|v, w, _| {
        let layout = v.flow_layout().unwrap();
        let geom = crate::page_geometry(f32::from(w.viewport_size().width));
        let block = layout.block("h-p1").unwrap();
        let text = block.body.text.as_ref().unwrap();
        let crate::block_flow::FlowTextLayout::Rich(rich) = &text.layout else {
            panic!("expected rich layout");
        };
        let dec = rich
            .inline_decorations()
            .iter()
            .find(|d| matches!(d.kind, crate::rich_text::DecorationKind::ReferenceChip(_)))
            .expect("ReferenceChip decoration");
        point(
            px(geom.column_x + block.x + text.x + f32::from(dec.bounds.origin.x) + 6.0),
            px(crate::TOPBAR_HEIGHT + block.y + text.y + f32::from(dec.bounds.origin.y) + 6.0),
        )
    });
    // Put an uncommitted IME preedit on the home page before clicking the @ ReferenceChip,
    // and verify switching pages discards it and blocks stale input from polluting Target Doc title.
    h.view(|v, w, cx| {
        v.select_document_range(DocumentSelection::caret(DocPoint::new("h-p1", 0)), w, cx);
        v.replace_and_mark_text_in_range(None, "ni", None, w, cx);
        v.page_mouse_down(
            &MouseDownEvent {
                button: MouseButton::Left,
                position: chip_pt,
                modifiers: Modifiers::default(),
                click_count: 1,
                first_mouse: false,
            },
            w,
            cx,
        );
    });
    h.pump();
    h.view(|v, w, cx| {
        v.replace_text_in_range(None, "ni", w, cx);
    });
    assert_eq!(
        h.view(|v, _, _| v.active_doc_id().map(str::to_string)),
        Some("doc:target".into())
    );
    assert_eq!(
        h.view(|v, _, _| v.block_text("t-root").map(str::to_string)),
        Some("Target Doc".into()),
        "stale IME input after switching active page must never overwrite the new page title"
    );
    assert_eq!(
        h.view(|v, _, _| v.block_text("t-p1").map(str::to_string)),
        Some("Arrived in target doc".into())
    );
    assert_eq!(*observed.borrow(), vec!["doc:target".to_string()]);

    // Navigate back returns to HOME_PAGE_ID.
    assert!(h.view(|v, w, cx| v.navigate_back(Some(w), cx)));
    assert_eq!(
        h.view(|v, _, _| v.active_doc_id().map(str::to_string)),
        Some(HOME_PAGE_ID.into())
    );

    // OpenEmbedDoc switches to existing doc; missing doc shows toast without crashing.
    h.view(|v, w, cx| {
        v.dispatch_overlay(
            OverlayEvent::OpenEmbedDoc {
                page_id: "doc:target".into(),
            },
            w,
            cx,
        );
    });
    assert_eq!(
        h.view(|v, _, _| v.active_doc_id().map(str::to_string)),
        Some("doc:target".into())
    );
    h.view(|v, w, cx| {
        v.dispatch_overlay(
            OverlayEvent::OpenEmbedDoc {
                page_id: "doc:missing".into(),
            },
            w,
            cx,
        );
    });
    assert_eq!(
        h.view(|v, _, _| v.active_doc_id().map(str::to_string)),
        Some("doc:target".into()),
        "missing linked doc must keep current document active"
    );
}

#[test]
fn table_cell_vertical_goal_x_and_paragraph_triple_click() {
    let mut state = DocState::new("table-goal-x", 350).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Table Goal X", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Table Goal X".into(),
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
        page.add_block("p1", para("first second third"), Some("note"), None, 3)
            .unwrap();
        page.add_block(
            "tbl",
            BlockSpec::Table {
                rows: vec![
                    vec!["abcdefghij".into()],
                    vec!["xy".into()],
                    vec!["0123456789".into()],
                ],
            },
            Some("note"),
            None,
            4,
        )
        .unwrap();
    }

    let h = TestHarness::open(1280, 800, PlaygroundOptions::default(), state);

    // 1. Triple-click on paragraph selects entire paragraph [0..len_utf16].
    let p1_pt = h.view(|v, w, _| {
        let geom = crate::page_geometry(f32::from(w.viewport_size().width));
        let layout = v.flow_layout().unwrap();
        let b = layout.block("p1").unwrap();
        point(
            px(geom.column_x + b.x + 12.0),
            px(crate::TOPBAR_HEIGHT + b.y + 10.0),
        )
    });
    h.view(|v, w, cx| {
        v.page_mouse_down(
            &MouseDownEvent {
                button: MouseButton::Left,
                position: p1_pt,
                modifiers: Modifiers::default(),
                click_count: 3,
                first_mouse: false,
            },
            w,
            cx,
        );
    });
    let sel = h.view(|v, _, _| v.document_selection().cloned()).unwrap();
    assert_eq!(sel.anchor.block_id, "p1");
    assert_eq!(sel.anchor.offset(), 0);
    assert_eq!(
        sel.focus.offset(),
        "first second third".encode_utf16().count() as u64
    );

    // 2. Table cell Up/Down preserves horizontal goal_x across short middle row.
    h.view(|v, w, cx| {
        v.focus_table_cell("tbl".into(), "row-0".into(), "col-0".into(), None, w, cx);
        v.table_cell.as_mut().unwrap().input.select(7..7);
        assert!(v.table_cell_key_down(&key_down("down"), w, cx));
        assert_eq!(v.active_table_cell().unwrap().row_id, "row-1");
        assert!(v.table_cell_key_down(&key_down("down"), w, cx));
        let row2 = v.active_table_cell().unwrap();
        assert_eq!(row2.row_id, "row-2");
        assert!(
            row2.input.focus() >= 5,
            "Down across short row must preserve horizontal goal_x, got col {}",
            row2.input.focus()
        );
        assert!(v.table_cell_key_down(&key_down("up"), w, cx));
        assert!(v.table_cell_key_down(&key_down("up"), w, cx));
        let row0 = v.active_table_cell().unwrap();
        assert_eq!(row0.row_id, "row-0");
        assert!(
            (row0.input.focus() as isize - 7).abs() <= 1,
            "Up back to row-0 must land near original column 7, got {}",
            row0.input.focus()
        );
    });
}

#[test]
fn click_below_last_block_appends_paragraph_and_code_mode_toggles_cleanly() {
    let mut state = DocState::new("tail-click-and-code", 360).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Tail Click", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        let page_spec = BlockSpec::Page {
            title: "Tail Click".into(),
        };
        page.add_block("root", page_spec, None, None, 1).unwrap();
        page.add_block(
            "note",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            2,
        )
        .unwrap();
        let code = BlockSpec::Code {
            text: "let x = 1;".into(),
            language: Some("rust".into()),
            caption: String::new(),
        };
        page.add_block("code-1", code, Some("note"), None, 3)
            .unwrap();
        let bm = BlockSpec::Bookmark {
            url: "https://affine.pro".into(),
            title: Some("AFFiNE".into()),
            description: None,
        };
        page.add_block("bm-1", bm, Some("note"), None, 4).unwrap();
        let db = BlockSpec::Database(PlaygroundView::showcase_database_spec());
        page.add_block("db-1", db, Some("note"), None, 5).unwrap();
        page.add_block("showcase-db-row-1", para("Row 1"), Some("db-1"), None, 6)
            .unwrap();
        // Trailing edgeless-only note ensures tail click appends to the visible Page note.
        let hidden = BlockSpec::Note {
            xywh: Some("[0,0,400,200]".into()),
        };
        page.add_block("edgeless-note", hidden, Some("root"), None, 7)
            .unwrap();
        let mode = y_octo::SessionValue::Any(y_octo::Any::String("edgeless".into()));
        page.set_block_prop("edgeless-note", "prop:displayMode", mode, 8)
            .unwrap();
    }

    let h = TestHarness::open(1280, 800, PlaygroundOptions::default(), state);
    let click = |position| MouseDownEvent {
        button: MouseButton::Left,
        position,
        modifiers: Modifiers::default(),
        click_count: 1,
        first_mouse: false,
    };

    // 1. Focusing code-1 enables wants_code_input_mode; prose disables it.
    h.view(|v, w, cx| {
        v.select_document_range(DocumentSelection::caret(DocPoint::new("code-1", 4)), w, cx);
        assert!(v.wants_code_input_mode());
    });

    // 2. Clicking below the last block (db-1) appends a trailing empty paragraph.
    let below_pt = h.view(|v, w, _| {
        let last = v
            .flow_layout()
            .unwrap()
            .blocks
            .last()
            .unwrap()
            .rect()
            .bottom();
        let geom = crate::page_geometry(f32::from(w.viewport_size().width));
        point(
            px(geom.column_x + 40.0),
            px(crate::TOPBAR_HEIGHT + last + 40.0),
        )
    });
    h.view(|v, w, cx| {
        v.page_mouse_down(&click(below_pt), w, cx);
        let new_id = v
            .document_selection()
            .expect("focuses new trailing paragraph")
            .focus
            .block_id
            .clone();
        assert_ne!(new_id, "code-1");
        assert!(!v.wants_code_input_mode());
        v.replace_text_in_range(None, "After database", w, cx);
        assert_eq!(v.block_text("code-1"), Some("let x = 1;"));
        assert_eq!(v.block_text(&new_id), Some("After database"));
    });

    // 3. Undoing typing then undoing trailing-paragraph append restores `"code-1@4"` caret.
    h.view(|v, w, cx| {
        v.history(false, w, cx).unwrap();
        v.history(false, w, cx).unwrap();
        assert_eq!(
            v.document_selection().cloned(),
            Some(DocumentSelection::caret(DocPoint::new("code-1", 4)))
        );
        v.replace_text_in_range(None, "Z", w, cx);
        assert_eq!(v.block_text("code-1"), Some("let Zx = 1;"));
    });

    // 4. Tail-click with no prior selection (`None`) + Undo clears selection and keyboard request.
    h.view(|v, w, cx| {
        v.clear_body_selection(w, cx);
        assert_eq!(v.document_selection(), None);
        v.page_mouse_down(&click(below_pt), w, cx);
        assert!(v.document_selection().is_some() && v.wants_software_keyboard());
        v.history(false, w, cx).unwrap();
        assert_eq!(v.document_selection(), None);
        assert!(!v.wants_software_keyboard());
    });

    // 5. Empty heading (`H2`) as last block focuses in place instead of appending a new paragraph.
    h.view(|v, w, cx| {
        let now_ms = v.now_ms(cx) as u64;
        let h2 = BlockSpec::Paragraph {
            paragraph_type: ParagraphType::H2,
            text: String::new(),
        };
        let commit = v
            .page_mut()
            .unwrap()
            .add_block("tail-empty-h2", h2, Some("note"), None, now_ms)
            .unwrap();
        v.did_edit(commit, None, w, cx);
        v.clear_body_selection(w, cx);
    });
    h.pump();
    let h2_below_pt = h.view(|v, w, _| {
        let layout = v.flow_layout().unwrap();
        let last = layout.blocks.last().unwrap();
        assert_eq!(last.block_id, "tail-empty-h2");
        let geom = crate::page_geometry(f32::from(w.viewport_size().width));
        point(
            px(geom.column_x + 40.0),
            px(crate::TOPBAR_HEIGHT + last.rect().bottom() + 40.0),
        )
    });
    h.view(|v, w, cx| {
        let count_before = v.flow_layout().unwrap().blocks.len();
        v.page_mouse_down(&click(h2_below_pt), w, cx);
        assert_eq!(v.flow_layout().unwrap().blocks.len(), count_before);
        assert_eq!(
            v.document_selection().cloned(),
            Some(DocumentSelection::caret(DocPoint::new("tail-empty-h2", 0)))
        );
    });

    // 6. Database `+ New record` (`AddRow`) + Undo clears selection without leaving a stale row caret.
    h.view(|v, w, cx| {
        v.clear_body_selection(w, cx);
        let add_hit = v
            .database_hits("db-1")
            .iter()
            .find(|t| matches!(t.kind, blocksuite_editor::database::DatabaseHitKind::AddRow))
            .expect("AddRow hit target")
            .rect;
        assert!(v.click_database_point("db-1", add_hit.x + 4.0, add_hit.y + 4.0, Some(w), cx));
        assert!(v.document_selection().is_some());
        v.history(false, w, cx).unwrap();
        assert_eq!(v.document_selection(), None);
        assert!(!v.wants_software_keyboard());
    });
}
