//! Targeted regression tests for B6 Overlays, Slash/`@` menus, multi-block drag,
//! multi-click drag selection, and desktop Table/Database interactions.

use blocksuite_playground_doc::{
    read::BlockContent,
    schema::{BlockSpec, ListType, ParagraphType},
};
use ui::{
    AppContext, EntityInputHandler, KeyDownEvent, Keystroke, Modifiers, MouseButton,
    MouseDownEvent, MouseMoveEvent, MouseUpEvent, ScrollDelta, ScrollEvent, ScrollSource,
    TouchPhase, point, px,
};

use crate::{
    HOME_PAGE_ID, PlaygroundView,
    editor_session::{DocPoint, DocumentSelection},
    overlays::{OverlayEvent, SlashCommand},
    room_client::DocState,
    showcase::seed_showcase_doc,
};

fn make_key(key: &str, shift: bool) -> KeyDownEvent {
    KeyDownEvent {
        keystroke: Keystroke {
            key: key.to_string(),
            modifiers: Modifiers {
                shift,
                ..Default::default()
            },
            ..Default::default()
        },
        is_held: false,
        prefer_character_input: false,
    }
}

fn make_mouse_down(x: f32, y: f32, click_count: usize, shift: bool) -> MouseDownEvent {
    MouseDownEvent {
        button: MouseButton::Left,
        position: point(px(x), px(y)),
        modifiers: Modifiers {
            shift,
            ..Default::default()
        },
        click_count,
        first_mouse: false,
    }
}

fn make_mouse_move(x: f32, y: f32, pressed: bool) -> MouseMoveEvent {
    MouseMoveEvent {
        position: point(px(x), px(y)),
        pressed_button: pressed.then_some(MouseButton::Left),
        modifiers: Modifiers::default(),
    }
}

fn make_mouse_up(x: f32, y: f32) -> MouseUpEvent {
    MouseUpEvent {
        button: MouseButton::Left,
        position: point(px(x), px(y)),
        modifiers: Modifiers::default(),
        click_count: 1,
    }
}

fn open_doc(
    state: DocState,
) -> (
    std::rc::Rc<ui::HeadlessPlatform>,
    ui::ApplicationHandle,
    ui::WindowHandle<PlaygroundView>,
    ui::HeadlessWindow,
) {
    let platform = ui::HeadlessPlatform::new(1280, 800, 1.0);
    let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
        crate::register_bundled_fonts(cx).unwrap();
    });
    let win = app.update(|cx| {
        cx.open_window(ui::WindowOptions::default(), |_w, cx| {
            cx.new(|cx| {
                let mut v = PlaygroundView::new(cx);
                v.set_document(state, cx);
                v
            })
        })
        .unwrap()
    });
    let hw = platform.windows().into_iter().next().unwrap();
    hw.request_frame();
    (platform, app, win, hw)
}

fn simple_doc(blocks: Vec<(&str, BlockSpec)>) -> DocState {
    let mut state = DocState::new("b6-test", 77).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "B6 Test", 1)
        .unwrap();
    let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
    page.add_block(
        "root",
        BlockSpec::Page {
            title: "B6 Test".into(),
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
    for (i, (id, spec)) in blocks.into_iter().enumerate() {
        page.add_block(id, spec, Some("note"), None, 3 + i as u64)
            .unwrap();
    }
    state
}

#[test]
fn desktop_database_click_never_selects_whole_block_or_deletes_table() {
    let state = seed_showcase_doc().unwrap();
    let (_platform, app, win, hw) = open_doc(state);

    app.update(|cx| {
        win.update(cx, |view, window, cx| {
            assert!(!view.database_readonly);
            let layout = view.flow_layout().unwrap();
            let db_block = layout
                .blocks
                .iter()
                .find(|b| b.body.kind == crate::block_flow::FlowKind::Database)
                .expect("showcase database");
            let db_id = db_block.block_id.clone();
            let geom = crate::block_flow::page_geometry(1280.0);
            // Scroll the database into view and click inside a non-checkbox cell area.
            view.scroll_y = (db_block.y - 80.0).max(0.0);
            let sx = geom.column_x + db_block.x + 80.0;
            let sy = crate::TOPBAR_HEIGHT + (db_block.y - view.scroll_y) + 120.0;
            view.page_mouse_down(&make_mouse_down(sx, sy, 1, false), window, cx);
            assert!(
                view.block_selection().is_empty(),
                "clicking inside desktop database must not whole-block select database"
            );
            // Pressing Backspace/Delete must NOT delete the database block.
            view.editor_key_down(&make_key("backspace", false), window, cx);
            view.editor_key_down(&make_key("delete", false), window, cx);
            assert!(
                view.page_snapshot().unwrap().block(&db_id).is_some(),
                "database block must survive Backspace/Delete after cell click"
            );
        })
        .unwrap();
    });
    hw.request_frame();
}

fn type_chars(
    view: &mut PlaygroundView,
    text: &str,
    window: &mut ui::Window,
    cx: &mut ui::Context<PlaygroundView>,
) {
    for ch in text.chars() {
        let mut buf = [0u8; 4];
        view.replace_text_in_range(None, ch.encode_utf8(&mut buf), window, cx);
    }
}

#[test]
fn slash_menu_allows_spaces_hides_on_no_match_and_inserts_table_equation_database() {
    let state = simple_doc(vec![
        (
            "p1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: String::new(),
            },
        ),
        (
            "p2",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: String::new(),
            },
        ),
        (
            "p3",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: String::new(),
            },
        ),
        (
            "p4",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: String::new(),
            },
        ),
        (
            "p5",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: String::new(),
            },
        ),
        (
            "p6",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: String::new(),
            },
        ),
    ]);
    let (_platform, app, win, hw) = open_doc(state);

    // 1. P1-7: `/heading 1` with inter-word space stays open and converts to H1; `/ ` closes.
    app.update(|cx| {
        win.update(cx, |view, window, cx| {
            view.select_document_range(
                DocumentSelection::caret(DocPoint::new("p1", 0)),
                window,
                cx,
            );
            type_chars(view, "/heading 1", window, cx);
            assert_eq!(
                view.overlays().slash_menu().map(|m| m.query.as_str()),
                Some("heading 1"),
                "inter-word space must keep typed slash menu open"
            );
            view.editor_key_down(&make_key("enter", false), window, cx);
            let node = view.page_snapshot().unwrap().block("p1").unwrap();
            assert!(matches!(
                node.content,
                BlockContent::Paragraph {
                    kind: ParagraphType::H1,
                    ..
                }
            ));

            // Leading space `/ ` closes slash menu immediately.
            view.select_document_range(
                DocumentSelection::caret(DocPoint::new("p2", 0)),
                window,
                cx,
            );
            type_chars(view, "/", window, cx);
            assert!(view.overlays().slash_menu().is_some());
            type_chars(view, " ", window, cx);
            assert!(
                view.overlays().slash_menu().is_none(),
                "leading space after `/` must close slash menu"
            );
        })
        .unwrap();
    });

    // 2. P1-8: URL `https://example.com` hides slash menu popover (no `overlay.slash_menu`).
    app.update(|cx| {
        win.update(cx, |view, window, cx| {
            view.select_document_range(
                DocumentSelection::caret(DocPoint::new("p3", 0)),
                window,
                cx,
            );
            type_chars(view, "https://example.com", window, cx);
        })
        .unwrap();
    });
    hw.request_frame();
    app.update(|cx| {
        win.update(cx, |_view, window, _cx| {
            let snap = window.frame_snapshot();
            assert!(
                !snap.elements.contains_key("overlay.slash_menu"),
                "unmatched URL slash query must hide popover"
            );
            assert!(!snap.elements.contains_key("overlay.slash_menu.empty"));
        })
        .unwrap();
    });

    // 3. P1-9: Table, Equation, Database slash commands + single-step Undo.
    app.update(|cx| {
        win.update(cx, |view, window, cx| {
            view.select_document_range(
                DocumentSelection::caret(DocPoint::new("p4", 0)),
                window,
                cx,
            );
            type_chars(view, "/table", window, cx);
            view.editor_key_down(&make_key("enter", false), window, cx);
            assert!(
                view.active_table_cell().is_some(),
                "/table must insert affine:table and focus first cell"
            );
            // Single-step undo removes table and restores `/table`.
            view.history(false, window, cx).unwrap();
            assert_eq!(view.block_text("p4"), Some("/table"));

            // Equation
            view.select_document_range(
                DocumentSelection::caret(DocPoint::new("p5", 0)),
                window,
                cx,
            );
            type_chars(view, "/equation", window, cx);
            view.editor_key_down(&make_key("enter", false), window, cx);
            assert!(
                view.overlays().equation_editor().is_some(),
                "/equation must insert affine:latex and open equation editor"
            );
            view.overlays.close_equation_editor();
            view.history(false, window, cx).unwrap();
            assert_eq!(view.block_text("p5"), Some("/equation"));

            // Database (desktop)
            view.select_document_range(
                DocumentSelection::caret(DocPoint::new("p6", 0)),
                window,
                cx,
            );
            type_chars(view, "/database", window, cx);
            view.editor_key_down(&make_key("enter", false), window, cx);
            let has_db = view
                .page_snapshot()
                .unwrap()
                .block("note")
                .unwrap()
                .children
                .iter()
                .any(|c| matches!(c.content, BlockContent::Database(_)) && !c.children.is_empty());
            assert!(
                has_db,
                "/database must insert affine:database with initial row"
            );
            view.history(false, window, cx).unwrap();
            assert_eq!(view.block_text("p6"), Some("/database"));

            // Database hidden under database_readonly
            view.set_database_mobile_readonly(true, cx);
            assert!(
                !super::filter_slash_items_for("database", !view.database_readonly)
                    .iter()
                    .any(|item| item.command == SlashCommand::Database)
            );
        })
        .unwrap();
    });
}

#[test]
fn linked_doc_menu_consumes_tab_and_closes_when_caret_moves_before_at() {
    let state = simple_doc(vec![
        (
            "l1",
            BlockSpec::List {
                list_type: ListType::Bulleted,
                text: "Parent".into(),
                checked: false,
                order: None,
            },
        ),
        (
            "l2",
            BlockSpec::List {
                list_type: ListType::Bulleted,
                text: String::new(),
                checked: false,
                order: None,
            },
        ),
    ]);
    let (_platform, app, win, _hw) = open_doc(state);

    app.update(|cx| {
        win.update(cx, |view, window, cx| {
            view.select_document_range(
                DocumentSelection::caret(DocPoint::new("l2", 0)),
                window,
                cx,
            );
            view.replace_text_in_range(None, "@", window, cx);
            assert!(view.overlays().linked_doc_menu().is_some());
            // P1-10: Tab cycles selection without indenting `l2` under `l1`.
            view.editor_key_down(&make_key("tab", false), window, cx);
            let l1_children = view
                .page_snapshot()
                .unwrap()
                .block("l1")
                .unwrap()
                .children
                .len();
            assert_eq!(l1_children, 0, "Tab in @ menu must not indent list item");

            // P1-11: ArrowLeft moves caret before `@` (`|@`) and closes menu immediately.
            view.editor_key_down(&make_key("left", false), window, cx);
            assert!(
                view.overlays().linked_doc_menu().is_none(),
                "moving caret before `@` must close linked-doc menu"
            );
        })
        .unwrap();
    });
}

#[test]
fn multi_block_drag_reorders_all_selected_blocks_atomically() {
    let state = simple_doc(vec![
        (
            "b1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "One".into(),
            },
        ),
        (
            "b2",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Two".into(),
            },
        ),
        (
            "b3",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Three".into(),
            },
        ),
    ]);
    let (_platform, app, win, _hw) = open_doc(state);

    app.update(|cx| {
        win.update(cx, |view, window, cx| {
            view.editor.block_selection = vec!["b1".into(), "b2".into()];
            view.dispatch_overlay(OverlayEvent::DragStart("b1".into()), window, cx);
            let layout = view.flow_layout().unwrap();
            let b3 = layout.block("b3").unwrap();
            let geom = crate::block_flow::page_geometry(1280.0);
            let drop_x = geom.column_x + b3.x + 20.0;
            let drop_y = crate::TOPBAR_HEIGHT + b3.rect().bottom() + 4.0;
            view.dispatch_overlay(
                OverlayEvent::PointerMoved {
                    x: drop_x,
                    y: drop_y,
                    pressed: true,
                },
                window,
                cx,
            );
            view.dispatch_overlay(OverlayEvent::PointerUp, window, cx);
            let order: Vec<String> = view
                .page_snapshot()
                .unwrap()
                .block("note")
                .unwrap()
                .children
                .iter()
                .map(|c| c.id.clone())
                .collect();
            assert_eq!(order, vec!["b3", "b1", "b2"]);
            assert_eq!(
                view.block_selection(),
                &["b1".to_string(), "b2".to_string()]
            );
            // Single-step Undo restores original order.
            view.history(false, window, cx).unwrap();
            let restored: Vec<String> = view
                .page_snapshot()
                .unwrap()
                .block("note")
                .unwrap()
                .children
                .iter()
                .map(|c| c.id.clone())
                .collect();
            assert_eq!(restored, vec!["b1", "b2", "b3"]);
        })
        .unwrap();
    });
}

#[test]
fn double_and_triple_click_drag_extend_by_word_and_paragraph() {
    let state = simple_doc(vec![
        (
            "p1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "alpha beta gamma".into(),
            },
        ),
        (
            "p2",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "delta epsilon".into(),
            },
        ),
    ]);
    let (_platform, app, win, _hw) = open_doc(state);

    app.update(|cx| {
        win.update(cx, |view, window, cx| {
            let layout = view.flow_layout().unwrap();
            let p1 = layout.block("p1").unwrap();
            let p2 = layout.block("p2").unwrap();
            let geom = crate::block_flow::page_geometry(1280.0);
            let p1_y = crate::TOPBAR_HEIGHT + p1.y + p1.body.height * 0.5;
            let p2_y = crate::TOPBAR_HEIGHT + p2.y + p2.body.height * 0.5;
            // Double-click "alpha" then drag into "beta".
            let alpha_x = geom.column_x + p1.x + 12.0;
            let beta_x = geom.column_x + p1.x + 56.0;
            view.page_mouse_down(&make_mouse_down(alpha_x, p1_y, 2, false), window, cx);
            assert!(view.editor.dragging, "double-click must stay draggable");
            view.root_mouse_move(&make_mouse_move(beta_x, p1_y, true), window, cx);
            view.root_mouse_up(&make_mouse_up(beta_x, p1_y), window, cx);
            let sel = view.document_selection().unwrap();
            assert_eq!(sel.anchor.offset(), 0);
            assert_eq!(sel.focus.offset(), 10, "word-drag must cover 'alpha beta'");

            // Triple-click p1 then drag into p2.
            view.page_mouse_down(&make_mouse_down(alpha_x, p1_y, 3, false), window, cx);
            view.root_mouse_move(&make_mouse_move(alpha_x, p2_y, true), window, cx);
            view.root_mouse_up(&make_mouse_up(alpha_x, p2_y), window, cx);
            let sel = view.document_selection().unwrap();
            assert_eq!(sel.anchor.block_id, "p1");
            assert_eq!(sel.anchor.offset(), 0);
            assert_eq!(sel.focus.block_id, "p2");
            assert_eq!(sel.focus.offset(), 13, "paragraph-drag must cover full p2");
        })
        .unwrap();
    });
}

#[test]
fn table_cell_pointer_selection_wide_auto_scroll_and_shift_wheel() {
    let wide_row: Vec<String> = (0..10).map(|i| format!("col{i} alpha beta")).collect();
    let state = simple_doc(vec![(
        "tbl",
        BlockSpec::Table {
            rows: vec![wide_row.clone(), wide_row],
        },
    )]);
    let (_platform, app, win, hw) = open_doc(state);

    app.update(|cx| {
        win.update(cx, |view, window, cx| {
            let layout = view.flow_layout().unwrap();
            let block = layout.block("tbl").unwrap();
            let hit = block
                .body
                .table_cells
                .iter()
                .find(|c| c.row_id == "row-0" && c.column_id == "col-0")
                .unwrap();
            let geom = crate::block_flow::page_geometry(1280.0);
            let cell_y = crate::TOPBAR_HEIGHT + block.y + hit.rect.y + hit.rect.h * 0.5;
            let cell_x0 = geom.column_x + block.x + hit.text_origin.0 + 4.0;
            let cell_x1 = geom.column_x + block.x + hit.text_origin.0 + 70.0;

            // P1-12: Double-click selects word.
            view.dispatch_overlay(
                OverlayEvent::TableCellMouseDown {
                    block_id: "tbl".into(),
                    row_id: "row-0".into(),
                    column_id: "col-0".into(),
                    screen_pos: (cell_x0, cell_y),
                    click_count: 2,
                    shift: false,
                },
                window,
                cx,
            );
            view.root_mouse_up(&make_mouse_up(cell_x0, cell_y), window, cx);
            assert_eq!(
                view.active_table_cell().unwrap().input.selected_text(),
                "col0"
            );

            // P1-12: Triple-click selects full cell.
            view.dispatch_overlay(
                OverlayEvent::TableCellMouseDown {
                    block_id: "tbl".into(),
                    row_id: "row-0".into(),
                    column_id: "col-0".into(),
                    screen_pos: (cell_x0, cell_y),
                    click_count: 3,
                    shift: false,
                },
                window,
                cx,
            );
            view.root_mouse_up(&make_mouse_up(cell_x0, cell_y), window, cx);
            assert_eq!(
                view.active_table_cell().unwrap().input.selected_text(),
                "col0 alpha beta"
            );

            // P1-12: Drag selects range + Shift+click extends.
            view.dispatch_overlay(
                OverlayEvent::TableCellMouseDown {
                    block_id: "tbl".into(),
                    row_id: "row-0".into(),
                    column_id: "col-0".into(),
                    screen_pos: (cell_x0, cell_y),
                    click_count: 1,
                    shift: false,
                },
                window,
                cx,
            );
            view.root_mouse_move(&make_mouse_move(cell_x1, cell_y, true), window, cx);
            view.root_mouse_up(&make_mouse_up(cell_x1, cell_y), window, cx);
            assert!(
                !view.active_table_cell().unwrap().input.selection.is_empty(),
                "dragging in table cell must select text"
            );

            // P1-13: Focusing offscreen column col-8 auto-scrolls table horizontally.
            assert_eq!(view.overlays().code_scroll_x("tbl"), 0.0);
            view.focus_table_cell(
                "tbl".into(),
                "row-0".into(),
                "col-8".into(),
                None,
                window,
                cx,
            );
            assert!(
                view.overlays().code_scroll_x("tbl") > 0.0,
                "focusing offscreen wide table column must scroll horizontally"
            );

            // P1-24 Page: Shift+wheel scrolls wide table horizontally, not page vertically.
            let scroll_before = view.overlays().code_scroll_x("tbl");
            let page_y_before = view.scroll_y;
            view.on_scroll(
                &ScrollEvent {
                    position: point(px(cell_x0 + 40.0), px(cell_y)),
                    delta: ScrollDelta::Pixels(point(px(0.0), px(60.0))),
                    modifiers: Modifiers {
                        shift: true,
                        ..Default::default()
                    },
                    touch_phase: TouchPhase::Moved,
                    source: ScrollSource::Pointer,
                },
                window,
                cx,
            );
            assert_ne!(
                view.overlays().code_scroll_x("tbl"),
                scroll_before,
                "Shift+wheel over wide table must scroll horizontally"
            );
            assert_eq!(
                view.scroll_y, page_y_before,
                "Shift+wheel over wide table must not scroll page vertically"
            );
        })
        .unwrap();
    });
    hw.request_frame();
}
