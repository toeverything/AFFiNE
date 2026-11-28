//! Batch 6 R2 regression tests: mode-scoped selection invariant, collapsed heading
//! section drag + Escape cancel, Database `+ New record` live layout refresh,
//! `@ Edgeless notes` linked page + `< Back`, and Edgeless multi-kind copy/paste + Linux word-delete.

use blocksuite_playground_doc::schema::{BlockSpec, ParagraphType};
use ui::{KeyDownEvent, Keystroke, Modifiers};

use super::{
    OverlayEvent,
    tests_b6::{make_key, open_doc, simple_doc, type_chars},
};
use crate::{
    HOME_PAGE_ID,
    editor_session::{DocPoint, DocumentSelection},
    showcase::seed_showcase_doc,
};

#[test]
fn mode_scoped_selection_invariant_blocks_hidden_edgeless_text_and_restores_cleanly() {
    let state = seed_showcase_doc().unwrap();
    let (_platform, app, win, hw) = open_doc(state);

    app.update(|cx| {
        win.update(cx, |view, window, cx| {
            // 1. Host startup `focus_first_text_block` in Page mode MUST skip `showcase-edgeless-text-p`
            //    under `Surface` and focus a Page-visible block instead.
            view.focus_first_text_block(window, cx);
            let focused_id = view
                .document_selection()
                .expect("caret placed")
                .focus
                .block_id
                .clone();
            assert_ne!(
                focused_id, "showcase-edgeless-text-p",
                "focus_first_text_block must never focus Surface-parented EdgelessText in Page mode"
            );
            assert!(
                view.flow_layout().unwrap().block(&focused_id).is_some(),
                "focused block must be laid out in Page mode"
            );

            // 2. Direct attempt to set selection to `showcase-edgeless-text-p` in Page mode is rejected.
            view.change_selection(
                DocumentSelection::caret(DocPoint::new("showcase-edgeless-text-p", 0)),
                window,
                cx,
            );
            assert!(
                view.document_selection().is_none(),
                "change_selection must reject blocks unaddressable in Page mode"
            );

            // 3. Click below last block -> Undo -> typing must NEVER mutate `showcase-edgeless-text-p`.
            let before_et = view
                .block_text("showcase-edgeless-text-p")
                .unwrap()
                .to_string();
            let layout = view.flow_layout().unwrap();
            let last = layout.blocks.last().unwrap();
            view.handle_click_below_last_block(last, window, cx);
            let cmd = Modifiers {
                platform: cfg!(target_os = "macos"),
                control: !cfg!(target_os = "macos"),
                ..Default::default()
            };
            view.editor_key_down(
                &KeyDownEvent {
                    keystroke: Keystroke {
                        key: "z".to_string(),
                        modifiers: cmd,
                        ..Default::default()
                    },
                    is_held: false,
                    prefer_character_input: false,
                },
                window,
                cx,
            );
            type_chars(view, "Z", window, cx);
            assert_eq!(
                view.block_text("showcase-edgeless-text-p").unwrap(),
                before_et,
                "typing after Undo in Page mode must never write into hidden EdgelessText"
            );
        })
        .unwrap();
    });
    hw.request_frame();
}

#[test]
fn collapsed_heading_drag_packs_section_escape_cancels_drag_and_db_new_record_redraws_live() {
    let state = simple_doc(vec![
        (
            "h2-a",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::H2,
                text: "Section A".into(),
            },
        ),
        (
            "body-a",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Hidden A body".into(),
            },
        ),
        (
            "h2-b",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::H2,
                text: "Section B".into(),
            },
        ),
        (
            "body-b",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Visible B body".into(),
            },
        ),
    ]);
    let (_platform, app, win, hw) = open_doc(state);

    app.update(|cx| {
        win.update(cx, |view, window, cx| {
            // Collapse Section A (`h2-a`) and verify `resolve_multi_drag_ids("h2-a")` packs `["h2-a", "body-a"]`.
            view.dispatch_overlay(OverlayEvent::ToggleCollapsed("h2-a".into()), window, cx);
            assert_eq!(
                view.resolve_multi_drag_ids("h2-a"),
                vec!["h2-a".to_string(), "body-a".to_string()],
                "dragging collapsed heading must pack its hidden section siblings"
            );

            // Start drag on `h2-a`, press Escape -> drag must cancel without entering block_selection!
            view.dispatch_overlay(OverlayEvent::DragStart("h2-a".into()), window, cx);
            view.editor_key_down(&make_key("escape", false), window, cx);
            assert!(
                view.block_selection().is_empty(),
                "Escape during active drag must cancel drag without mutating block_selection"
            );

            // Reorder collapsed `["h2-a", "body-a"]` after `body-b` (index 4) -> both move together!
            view.run_reorder_many("note", vec!["h2-a".into(), "body-a".into()], 4, window, cx)
                .unwrap();
            let children: Vec<String> = view
                .page_snapshot()
                .unwrap()
                .block("note")
                .unwrap()
                .children
                .iter()
                .map(|c| c.id.clone())
                .collect();
            assert_eq!(children, vec!["h2-b", "body-b", "h2-a", "body-a"]);

            // Cycle rejection on `run_reorder_many` into self or descendant is a safe no-op.
            view.run_reorder_many("h2-a", vec!["h2-a".into()], 0, window, cx)
                .unwrap();
        })
        .unwrap();
    });
    hw.request_frame();

    // Also verify showcase `@ Edgeless notes` target page is populated + `< Back` restores `HOME_PAGE_ID`
    // + Database `+ New record` typing invalidates `Database` layout cache immediately!
    let showcase = seed_showcase_doc().unwrap();
    let (_p2, app2, win2, hw2) = open_doc(showcase);
    let (db_id, body_before, row_id) = app2.update(|cx| {
        win2.update(cx, |view, window, cx| {
            let layout0 = view.flow_layout().unwrap();
            let db_block0 = layout0
                .blocks
                .iter()
                .find(|b| b.body.kind == crate::block_flow::FlowKind::Database)
                .unwrap();
            let db_id = db_block0.block_id.clone();
            let body_before = db_block0.body.clone();
            let row_id = view.fresh_block_id();
            let commit = view
                .page_mut()
                .unwrap()
                .add_database_row(&db_id, &row_id, 5_000)
                .unwrap();
            view.apply_database_commit(commit, Some(window), cx);
            (db_id, body_before, row_id)
        })
        .unwrap()
    });
    hw2.request_frame();
    let body_after_add = app2.update(|cx| {
        win2.update(cx, |view, window, cx| {
            let body_after_add = view
                .flow_layout()
                .unwrap()
                .block(&db_id)
                .unwrap()
                .body
                .clone();
            assert!(
                !std::rc::Rc::ptr_eq(&body_before, &body_after_add),
                "Database FlowBlock must rebuild after + New record"
            );
            view.select_document_range(
                DocumentSelection::caret(DocPoint::new(&row_id, 0)),
                window,
                cx,
            );
            let rev_before = view.doc_rev;
            type_chars(view, "Live row title", window, cx);
            assert!(view.doc_rev > rev_before);
            assert_eq!(view.block_text(&row_id).unwrap(), "Live row title");
            body_after_add
        })
        .unwrap()
    });
    hw2.request_frame();
    app2.update(|cx| {
        win2.update(cx, |view, window, cx| {
            let layout1 = view.flow_layout().unwrap();
            let db_after = layout1.block(&db_id).unwrap();
            assert!(
                !std::rc::Rc::ptr_eq(&body_after_add, &db_after.body),
                "Database FlowBlock layout cache must rebuild immediately when typing into new row"
            );

            assert!(view.open_linked_doc("doc:edgeless-notes", Some(window), cx));
            assert!(
                view.page_snapshot().unwrap().root.is_some(),
                "doc:edgeless-notes must have a populated Page/Surface/Note tree"
            );
            assert!(view.render_nav_back(&view.theme.palette(), cx).is_some());
            assert!(view.navigate_back(Some(window), cx));
            assert_eq!(view.active_doc_id(), Some(HOME_PAGE_ID));
        })
        .unwrap();
    });
    hw2.request_frame();
}

#[test]
fn edgeless_copy_cut_paste_note_shape_frame_edgeless_text_and_atomic_delete_sole_note() {
    let state = seed_showcase_doc().unwrap();
    let (_platform, app, win, hw) = open_doc(state);

    app.update(|cx| {
        win.update(cx, |view, window, cx| {
            view.set_mode(crate::PlaygroundMode::Edgeless, window, cx);
        })
        .unwrap();
    });
    hw.request_frame();

    let shape_id = app.update(|cx| {
        win.update(cx, |view, window, cx| {
            let shape_id = view
                .edgeless
                .authoring
                .painted_items
                .iter()
                .find(|i| i.kind == crate::edgeless::SpatialItemKind::Shape)
                .unwrap()
                .id
                .clone();
            view.edgeless.authoring.selection = [
                "showcase-note".to_string(),
                shape_id.clone(),
                "showcase-frame".to_string(),
                "showcase-edgeless-text".to_string(),
            ]
            .into_iter()
            .collect();
            assert!(view.edgeless_copy_selection(false, cx));
            let clip = cx.read_from_clipboard().expect("clipboard item");
            let plain = clip.text().unwrap_or_default();
            assert!(
                !plain.trim_start().starts_with('{'),
                "clipboard text/plain must be human-readable summary, not raw JSON"
            );
            let count_before = view
                .page_snapshot()
                .unwrap()
                .root
                .as_ref()
                .unwrap()
                .walk()
                .count();
            assert!(view.paste_edgeless_clipboard_item(&clip, window, cx));
            let snap_after = view.page_snapshot().unwrap();
            let count_after = snap_after.root.as_ref().unwrap().walk().count();
            assert!(
                count_after > count_before + 2,
                "pasting Note+Shape+Frame+EdgelessText must materialize spatial blocks as well as surface elements"
            );
            shape_id
        })
        .unwrap()
    });
    hw.request_frame();

    app.update(|cx| {
        win.update(cx, |view, window, cx| {
            assert!(view.edgeless_begin_inline_edit(&shape_id, window, cx));
            view.edgeless
                .authoring
                .label_editor_mut()
                .unwrap()
                .replace(None, " alpha beta");
            view.edgeless_key_down(
                &KeyDownEvent {
                    keystroke: Keystroke {
                        key: "backspace".into(),
                        modifiers: Modifiers {
                            control: true,
                            platform: false,
                            ..Default::default()
                        },
                        ..Default::default()
                    },
                    is_held: false,
                    prefer_character_input: false,
                },
                window,
                cx,
            );
            let label_after = view
                .edgeless
                .authoring
                .label_editor()
                .unwrap()
                .display_text()
                .to_string();
            assert!(
                !label_after.ends_with("beta"),
                "Ctrl+Backspace on Linux/Windows must delete full word, got {label_after:?}"
            );
            view.edgeless_commit_inline_edit(window, cx);

            // Astra R2 regression: Frame `prop:childElementIds` with `unselected-original: false`
            // must NOT flip to `true` or retain uncloned canvas IDs on copy/paste, and deleting
            // the pasted Frame must leave `unselected-original` intact on the canvas.
            let mut unit_map = std::collections::HashMap::new();
            unit_map.insert("selected-child".to_string(), "cloned-child".to_string());
            let remapped = crate::edgeless::paste_convert::remap_group_children(
                &serde_json::json!({
                    "selected-child": true,
                    "unselected-original": false,
                    "uncloned-true": true
                }),
                &unit_map,
            );
            assert_eq!(
                remapped,
                y_octo::SessionValue::Map(vec![(
                    "cloned-child".to_string(),
                    y_octo::SessionValue::Any(y_octo::Any::True),
                )]),
                "remap_group_children must drop false entries and uncloned IDs"
            );

            let page_id = view.page_id.clone().unwrap();
            {
                let page = view.state.workspace.page_mut(&page_id).unwrap();
                page.structural_edit(5_000, |page| {
                    let block = y_octo::TypeTarget::Path(
                        y_octo::TypePath::root("blocks").key("showcase-frame"),
                    );
                    match page
                        .inner()
                        .get_map_value(&block, "prop:childElementIds")
                        .unwrap()
                    {
                        Some(y_octo::SessionReadValue::Map(map_id)) => {
                            let target = y_octo::TypeTarget::Identity(map_id);
                            page.inner_mut()
                                .map_set(
                                    &target,
                                    shape_id.clone(),
                                    y_octo::SessionValue::Any(y_octo::Any::False),
                                )
                                .unwrap();
                        }
                        _ => {
                            page.inner_mut()
                                .map_set(
                                    &block,
                                    "prop:childElementIds".into(),
                                    y_octo::SessionValue::Map(vec![(
                                        shape_id.clone(),
                                        y_octo::SessionValue::Any(y_octo::Any::False),
                                    )]),
                                )
                                .unwrap();
                        }
                    }
                    Ok(())
                })
                .unwrap();
            }
            view.refresh_document();
        })
        .unwrap();
    });
    hw.request_frame();

    app.update(|cx| {
        win.update(cx, |view, window, cx| {
            let frames_before: std::collections::BTreeSet<String> = view
                .page_snapshot()
                .unwrap()
                .root
                .as_ref()
                .unwrap()
                .walk()
                .filter(|b| b.flavour == "affine:frame")
                .map(|b| b.id.clone())
                .collect();
            view.edgeless.authoring.selection =
                ["showcase-frame".to_string()].into_iter().collect();
            assert!(view.edgeless_copy_selection(false, cx));
            let frame_clip = cx.read_from_clipboard().expect("frame clipboard");
            assert!(view.paste_edgeless_clipboard_item(&frame_clip, window, cx));
            let pasted_frame_id = view
                .page_snapshot()
                .unwrap()
                .root
                .as_ref()
                .unwrap()
                .walk()
                .find(|b| b.flavour == "affine:frame" && !frames_before.contains(&b.id))
                .expect("pasted frame")
                .id
                .clone();
            let to_delete: std::collections::BTreeSet<String> =
                [pasted_frame_id.clone()].into_iter().collect();
            view.edgeless_delete_ids(&to_delete, cx);
            let snap_post_del = view.page_snapshot().unwrap();
            assert!(
                crate::edgeless::find_surface_element(&snap_post_del, &shape_id).is_some(),
                "deleting pasted Frame must NOT cascade-delete unselected-original ({shape_id})"
            );
        })
        .unwrap();
    });
    hw.request_frame();
}
