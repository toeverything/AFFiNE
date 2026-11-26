//! Equation soft-wrap navigation/click hit-testing, per-formula surgical layout
//! invalidation tests, and offscreen PNG evidence generator for mobile keyboard toolbar.

use std::{collections::HashMap, sync::Arc, sync::RwLock};

use blocksuite_playground_doc::schema::{BlockSpec, ParagraphType};
use ui::{Modifiers, MouseButton, MouseDownEvent, PlatformInput, audit_frame_snapshot, point, px};
use y_octo::Any;

use crate::{
    HOME_PAGE_ID, PlaygroundTheme,
    block_flow::{
        MathPreviewProvider, MathRenderResult, MathRenderSlot, bump_latex_formula_revision,
        page_geometry, register_math_preview_provider, rgba_pixels_to_render_image,
    },
    overlays::{ActiveSelection, EquationTarget, KeyboardToolbarAction, OverlayEvent},
    room_client::DocState,
};

use super::tests::MobileSession;

#[test]
fn equation_editor_soft_wrap_up_down_and_multiline_click_hit_testing() {
    let session = MobileSession::open(390, 844, PlaygroundTheme::Light);
    let long_single_line = r"\frac{x_1 + x_2 + x_3 + x_4 + x_5}{y_1 + y_2 + y_3} + \sqrt{a_1^2 + a_2^2 + a_3^2 + a_4^2} + \sum_{k=0}^{n} k^3";
    assert!(!long_single_line.contains('\n'));

    session.edit(|page| {
        page.add_block(
            "eq-wrap",
            BlockSpec::Latex {
                latex: long_single_line.into(),
            },
            Some("showcase-note"),
            Some(0),
            7_000_000,
        )
        .expect("add latex block");
    });
    session.overlay(OverlayEvent::OpenEquationEditor {
        target: EquationTarget::Block {
            block_id: "eq-wrap".into(),
        },
        initial: long_single_line.into(),
    });
    let snap = session.frame();
    assert!(audit_frame_snapshot(&snap).is_empty());

    let line_ranges: Vec<(usize, usize)> = session.view(|v| {
        v.overlays()
            .equation_editor()
            .expect("open equation editor")
            .visual_line_ranges()
    });
    assert!(
        line_ranges.len() >= 3,
        "expected long single-line formula to soft-wrap into >=3 visual rows, got {line_ranges:?}"
    );
    let total_u16 = long_single_line.encode_utf16().count();

    // Caret starts at end (last visual row); Up must step to the middle wrapped row, NOT jump to 0!
    let caret_end = session.view(|v| {
        v.overlays()
            .equation_editor()
            .unwrap()
            .input
            .shown_selection()
            .0
            .end
    });
    assert_eq!(caret_end, total_u16);

    session.key("up");
    let caret_prev_row = session.view(|v| {
        v.overlays()
            .equation_editor()
            .unwrap()
            .input
            .shown_selection()
            .0
            .end
    });
    let mid_idx = line_ranges.len() - 2;
    assert!(
        caret_prev_row >= line_ranges[mid_idx].0 && caret_prev_row < line_ranges[mid_idx].1,
        "Up from last wrapped row must land on middle wrapped row {:?}, got {}",
        line_ranges[mid_idx],
        caret_prev_row
    );

    // Down from middle wrapped row must step back to the last wrapped row!
    session.key("down");
    let caret_down = session.view(|v| {
        v.overlays()
            .equation_editor()
            .unwrap()
            .input
            .shown_selection()
            .0
            .end
    });
    assert!(
        caret_down >= line_ranges.last().unwrap().0,
        "Down must return to last wrapped row {:?}, got {}",
        line_ranges.last(),
        caret_down
    );

    // Move caret to 0 first, then click on visual row 2 (3rd row) and verify caret lands on row 2!
    for _ in 0..line_ranges.len() {
        session.key("up");
    }
    assert_eq!(
        session.view(|v| v
            .overlays()
            .equation_editor()
            .unwrap()
            .input
            .shown_selection()
            .0
            .end),
        0
    );

    let input_bounds = snap.elements["overlay.equation_editor.input"].bounds;
    let row2_click_x = input_bounds.x + 28.0;
    let row2_click_y = input_bounds.y + 5.0 + 2.0 * 20.0 + 10.0;
    session
        .headless
        .dispatch_input(PlatformInput::MouseDown(MouseDownEvent {
            button: MouseButton::Left,
            position: point(px(row2_click_x), px(row2_click_y)),
            modifiers: Modifiers::default(),
            click_count: 1,
            first_mouse: false,
        }));
    session.platform.run_until_parked();
    let clicked_caret = session.view(|v| {
        v.overlays()
            .equation_editor()
            .unwrap()
            .input
            .shown_selection()
            .0
            .end
    });
    assert!(
        clicked_caret >= line_ranges[2].0 && clicked_caret <= line_ranges[2].1,
        "clicking visual row 2 must place caret inside {:?}, got {}",
        line_ranges[2],
        clicked_caret
    );
}

#[test]
fn per_formula_worker_delivery_relayouts_single_block_and_ignores_stale_reply() {
    struct ResetMath;
    impl Drop for ResetMath {
        fn drop(&mut self) {
            register_math_preview_provider(None);
        }
    }
    let _provider_lock = crate::GLOBAL_PREVIEW_PROVIDER_TEST_LOCK
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let _reset = ResetMath;

    struct MockAsyncMathProvider {
        ready: RwLock<HashMap<String, MathRenderSlot>>,
    }
    impl MathPreviewProvider for MockAsyncMathProvider {
        fn render_math(
            &self,
            latex: &str,
            _display: bool,
            _font_size_pt: f32,
            _color: ui::Hsla,
            _dpr: f32,
        ) -> MathRenderResult {
            if let Some(slot) = self.ready.read().unwrap().get(latex.trim()) {
                MathRenderResult::Ready(slot.clone())
            } else {
                MathRenderResult::Pending
            }
        }
    }

    let provider = Arc::new(MockAsyncMathProvider {
        ready: RwLock::new(HashMap::new()),
    });
    register_math_preview_provider(Some(provider.clone()));

    let session = MobileSession::open(390, 844, PlaygroundTheme::Light);
    session.edit(|page| {
        page.add_block(
            "math-a",
            BlockSpec::Latex {
                latex: r"E = mc^2".into(),
            },
            Some("showcase-note"),
            Some(0),
            8_000_000,
        )
        .expect("math-a");
        page.add_block(
            "math-b",
            BlockSpec::Latex {
                latex: r"\frac{1}{2}".into(),
            },
            Some("showcase-note"),
            Some(1),
            8_000_001,
        )
        .expect("math-b");
    });
    let _ = session.frame();

    let dummy_img = rgba_pixels_to_render_image(8, 4, &[20_u8; 8 * 4 * 4]).expect("render image");
    provider.ready.write().unwrap().insert(
        r"E = mc^2".to_string(),
        MathRenderSlot {
            image: dummy_img.clone(),
            width_pt: 48.0,
            ascent_pt: 14.0,
            descent_pt: 4.0,
        },
    );
    bump_latex_formula_revision(r"E = mc^2");

    // Delivering `math-a` must re-layout ONLY `math-a` (1 block laid out; `math-b` & siblings reused).
    let laid_out_a = session.app.update(|cx| {
        session
            .window
            .update(cx, |v, w, _| {
                let col_w = page_geometry(f32::from(w.viewport_size().width)).column_width;
                v.ensure_layout(col_w, w).unwrap().stats.laid_out
            })
            .unwrap()
    });
    assert_eq!(
        laid_out_a, 1,
        "worker completion for formula A must re-layout only block A"
    );

    // Rapidly edit `math-b` from `\frac{1}{2}` to `\sqrt{2}`, then deliver stale `\frac{1}{2}` late.
    session.edit(|page| {
        page.set_block_prop(
            "math-b",
            "prop:latex",
            y_octo::SessionValue::Any(Any::String(r"\sqrt{2}".into())),
            8_000_010,
        )
        .expect("edit math-b");
    });
    let _ = session.frame();

    provider.ready.write().unwrap().insert(
        r"\frac{1}{2}".to_string(),
        MathRenderSlot {
            image: dummy_img,
            width_pt: 24.0,
            ascent_pt: 18.0,
            descent_pt: 12.0,
        },
    );
    bump_latex_formula_revision(r"\frac{1}{2}");

    let (laid_out_stale, plain_b) = session.app.update(|cx| {
        session
            .window
            .update(cx, |v, w, _| {
                let col_w = page_geometry(f32::from(w.viewport_size().width)).column_width;
                let layout = v.ensure_layout(col_w, w).unwrap();
                let b_plain = layout.block("math-b").unwrap().body.plain.clone();
                (layout.stats.laid_out, b_plain)
            })
            .unwrap()
    });
    register_math_preview_provider(None);

    assert_eq!(
        laid_out_stale, 0,
        "late stale worker reply for superseded formula must trigger 0 block relayouts"
    );
    assert_eq!(plain_b, r"\sqrt{2}");
}

#[test]
fn edgeless_note_and_text_relayout_when_async_math_preview_arrives() {
    struct ResetMath;
    impl Drop for ResetMath {
        fn drop(&mut self) {
            register_math_preview_provider(None);
        }
    }
    let _provider_lock = crate::GLOBAL_PREVIEW_PROVIDER_TEST_LOCK
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let _reset = ResetMath;

    struct MockAsyncMath {
        ready: RwLock<HashMap<String, MathRenderSlot>>,
    }
    impl MathPreviewProvider for MockAsyncMath {
        fn render_math(
            &self,
            latex: &str,
            _display: bool,
            _font_size_pt: f32,
            _color: ui::Hsla,
            _dpr: f32,
        ) -> MathRenderResult {
            if let Some(slot) = self.ready.read().unwrap().get(latex.trim()) {
                MathRenderResult::Ready(slot.clone())
            } else {
                MathRenderResult::Pending
            }
        }
    }

    let provider = Arc::new(MockAsyncMath {
        ready: RwLock::new(HashMap::new()),
    });
    register_math_preview_provider(Some(provider.clone()));

    let session = MobileSession::open(800, 600, PlaygroundTheme::Light);
    session.edit(|page| {
        page.add_block(
            "eg-math",
            BlockSpec::Latex {
                latex: r"\sum_{i=1}^n i".into(),
            },
            Some("showcase-edgeless-note"),
            Some(0),
            9_000_001,
        )
        .expect("add edgeless note math");
        page.add_block(
            "et-math",
            BlockSpec::Latex {
                latex: r"\alpha + \beta".into(),
            },
            Some("showcase-edgeless-text"),
            Some(0),
            9_000_002,
        )
        .expect("add edgeless text math");
    });
    session.app.update(|cx| {
        session
            .window
            .update(cx, |v, w, cx| {
                v.set_mode(crate::PlaygroundMode::Edgeless, w, cx);
            })
            .unwrap();
    });
    let _ = session.frame();

    // Steady Edgeless frame with no changes must do 0 relayouts.
    let _ = session.frame();
    assert_eq!(session.view(|v| v.edgeless.last_frame_relayouts), 0);

    // Deliver async worker result ONLY for `eg-math` (without bumping doc_rev or env_rev!).
    let img = rgba_pixels_to_render_image(32, 16, &[40_u8; 32 * 16 * 4]).expect("math img");
    provider.ready.write().unwrap().insert(
        r"\sum_{i=1}^n i".to_string(),
        MathRenderSlot {
            image: img,
            width_pt: 96.0,
            ascent_pt: 28.0,
            descent_pt: 12.0,
        },
    );
    bump_latex_formula_revision(r"\sum_{i=1}^n i");
    session.app.update(|cx| {
        session.window.update(cx, |_, _, cx| cx.notify()).unwrap();
    });
    let _ = session.frame();
    let note_relayouts = session.view(|v| v.edgeless.last_frame_relayouts);
    assert_eq!(
        note_relayouts, 1,
        "Edgeless Note must relayout when async math preview arrives"
    );

    // Deliver async worker result ONLY for `et-math` inside `EdgelessText`!
    let img_et = rgba_pixels_to_render_image(28, 14, &[60_u8; 28 * 14 * 4]).expect("et math img");
    provider.ready.write().unwrap().insert(
        r"\alpha + \beta".to_string(),
        MathRenderSlot {
            image: img_et,
            width_pt: 84.0,
            ascent_pt: 20.0,
            descent_pt: 8.0,
        },
    );
    bump_latex_formula_revision(r"\alpha + \beta");
    session.app.update(|cx| {
        session.window.update(cx, |_, _, cx| cx.notify()).unwrap();
    });
    let _ = session.frame();
    let text_relayouts = session.view(|v| v.edgeless.last_frame_relayouts);
    register_math_preview_provider(None);

    assert_eq!(
        text_relayouts, 1,
        "EdgelessText must also relayout when async math preview arrives"
    );
}

#[test]
fn non_active_workspace_page_body_edit_invalidates_default_doc_directory() {
    use blocksuite_editor::WorkspaceDocDirectory as _;

    let session = MobileSession::open(390, 844, PlaygroundTheme::Light);
    let ref_id = blocksuite_editor::EditorDocId::new("doc:edgeless-notes");
    let before = session
        .view(|v| v.default_doc_directory.doc_preview(&ref_id))
        .expect("initial preview for non-active workspace page");

    // Mutate ONLY the body of the non-active page (`doc:edgeless-notes`), keeping its title unchanged!
    session.app.update(|cx| {
        session
            .window
            .update(cx, |v, _, cx| {
                let peer_page = v
                    .state
                    .workspace
                    .page_mut("doc:edgeless-notes")
                    .expect("non-active page");
                peer_page
                    .add_block(
                        "remote-body-p1",
                        BlockSpec::Paragraph {
                            paragraph_type: ParagraphType::Text,
                            text: "Fresh collaborator body update".into(),
                        },
                        Some("edgeless-notes-note"),
                        Some(0),
                        9_100_000,
                    )
                    .or_else(|_| {
                        peer_page.add_block(
                            "edgeless-notes-root",
                            BlockSpec::Page {
                                title: "Edgeless notes".into(),
                            },
                            None,
                            None,
                            9_100_001,
                        )?;
                        peer_page.add_block(
                            "edgeless-notes-note",
                            BlockSpec::Note { xywh: None },
                            Some("edgeless-notes-root"),
                            None,
                            9_100_002,
                        )?;
                        peer_page.add_block(
                            "remote-body-p1",
                            BlockSpec::Paragraph {
                                paragraph_type: ParagraphType::Text,
                                text: "Fresh collaborator body update".into(),
                            },
                            Some("edgeless-notes-note"),
                            Some(0),
                            9_100_003,
                        )
                    })
                    .expect("mutate non-active page body");
                v.refresh_document();
                cx.notify();
            })
            .unwrap();
    });

    let after = session
        .view(|v| v.default_doc_directory.doc_preview(&ref_id))
        .expect("updated preview");
    assert!(
        after.snippet.contains("Fresh collaborator body update"),
        "non-active page snippet must refresh on body edit, got {:?}",
        after.snippet
    );
    assert!(
        after.revision > before.revision,
        "non-active page preview revision must increment ({} -> {})",
        before.revision,
        after.revision
    );

    // Subsequent local edit on active `HOME_PAGE_ID` must NOT bump `doc:edgeless-notes` revision!
    session.edit(|page| {
        page.insert_text("showcase-h1", "prop:text", 0, "!", 9_100_010)
            .expect("local active edit");
    });
    let after_local = session
        .view(|v| v.default_doc_directory.doc_preview(&ref_id))
        .unwrap();
    assert_eq!(after_local.revision, after.revision);

    // Pure Yjs text deletion from a remote collaborator leaves `encode_state_vector_v1()`
    // byte-for-byte unchanged, yet MUST still invalidate the cached non-active page excerpt!
    session.app.update(|cx| {
        session
            .window
            .update(cx, |v, _, cx| {
                let full_state = v
                    .state
                    .workspace
                    .page("doc:edgeless-notes")
                    .expect("non-active page")
                    .encode_update_v1()
                    .expect("encode non-active page");
                let mut remote_peer = blocksuite_playground_doc::session::PageDocSession::new(
                    "doc:edgeless-notes",
                    999_777,
                )
                .expect("remote peer");
                remote_peer
                    .apply_remote_update_v1(&full_state)
                    .expect("sync remote peer");
                let del_len = "Fresh collaborator body update".encode_utf16().count() as u64;
                let del_commit = remote_peer
                    .remove_text("remote-body-p1", "prop:text", 0, del_len, 9_100_020)
                    .expect("remove text")
                    .expect("delete commit");

                let local_page = v
                    .state
                    .workspace
                    .page_mut("doc:edgeless-notes")
                    .expect("non-active page mut");
                let sv_before = local_page.encode_state_vector_v1().expect("sv before");
                local_page
                    .apply_remote_update_v1(&del_commit.update)
                    .expect("apply pure delete update");
                let sv_after = local_page.encode_state_vector_v1().expect("sv after");
                assert_eq!(
                    sv_before, sv_after,
                    "pure Yjs deletion must not advance state vector"
                );
                v.refresh_document();
                cx.notify();
            })
            .unwrap();
    });

    let after_del = session
        .view(|v| v.default_doc_directory.doc_preview(&ref_id))
        .expect("preview after pure delete");
    assert!(
        !after_del.snippet.contains("Fresh collaborator body update"),
        "deleted paragraph text must not linger in non-active page snippet: {:?}",
        after_del.snippet
    );
    assert!(
        after_del.revision > after_local.revision,
        "pure delete on non-active page must advance preview revision ({} -> {})",
        after_local.revision,
        after_del.revision
    );
}

#[test]
#[ignore = "offscreen PNG evidence generator for mobile keyboard toolbar"]
fn render_mobile_keyboard_toolbar_evidence() {
    let out_dir = std::env::var("KEYBOARD_TOOLBAR_OUT_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::PathBuf::from("target/keyboard-toolbar-after"));
    std::fs::create_dir_all(&out_dir).expect("create out_dir");

    let build_doc = |title: &str| {
        let mut state = DocState::new("kb-toolbar", 77).expect("doc");
        state
            .workspace
            .create_page(HOME_PAGE_ID, title, 1)
            .expect("page");
        let page = state.workspace.ensure_page(HOME_PAGE_ID).expect("page");
        page.add_block(
            "p-root",
            BlockSpec::Page {
                title: title.into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block("p-surface", BlockSpec::Surface, Some("p-root"), None, 2)
            .unwrap();
        page.add_block(
            "p-note",
            BlockSpec::Note { xywh: None },
            Some("p-root"),
            None,
            3,
        )
        .unwrap();
        page.add_block(
            "p-body",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Select text to open Aa formatting and highlight colors.".into(),
            },
            Some("p-note"),
            None,
            4,
        )
        .unwrap();
        page.add_block(
            "p-tbl",
            BlockSpec::Table {
                rows: vec![
                    vec!["Task".into(), "Status".into()],
                    vec!["KeyboardToolbar".into(), "Parity".into()],
                ],
            },
            Some("p-note"),
            None,
            5,
        )
        .unwrap();
        state
    };

    for (w, h, tag) in [(390, 844, "390"), (320, 568, "320")] {
        for (theme, tname) in [
            (PlaygroundTheme::Light, "light"),
            (PlaygroundTheme::Dark, "dark"),
        ] {
            let s = MobileSession::open(w, h, theme);
            let doc = build_doc("Mobile Keyboard Toolbar");
            s.app.update(|cx| {
                s.window
                    .update(cx, |v, _, cx| {
                        v.set_image_picker(Some(std::rc::Rc::new(|| {})));
                        v.set_document(doc, cx);
                    })
                    .unwrap();
            });
            s.frame();
            s.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
                "p-body", 0,
            ))));
            s.overlay(OverlayEvent::SetKeyboardToolbarVisible(true));
            s.save_png(
                &out_dir.join(format!("after-{tag}-01-default-{tname}.png")),
                &format!("after-{tag}-01-default-{tname}"),
            );

            if theme == PlaygroundTheme::Light {
                s.overlay(OverlayEvent::KeyboardToolbar(
                    KeyboardToolbarAction::ToggleMorePanel,
                ));
                s.save_png(
                    &out_dir.join(format!("after-{tag}-02-more-panel.png")),
                    &format!("after-{tag}-02-more-panel"),
                );
                s.overlay(OverlayEvent::KeyboardToolbar(
                    KeyboardToolbarAction::ToggleMorePanel,
                ));

                s.overlay(OverlayEvent::SetSelection(Some(ActiveSelection {
                    block_id: "p-body".into(),
                    start_utf16: 0,
                    end_utf16: 11,
                })));
                s.save_png(
                    &out_dir.join(format!("after-{tag}-03-autoshow-aa.png")),
                    &format!("after-{tag}-03-autoshow-aa"),
                );

                s.overlay(OverlayEvent::KeyboardToolbar(
                    KeyboardToolbarAction::ToggleHighlightPanel,
                ));
                s.save_png(
                    &out_dir.join(format!("after-{tag}-04-highlight-panel.png")),
                    &format!("after-{tag}-04-highlight-panel"),
                );

                s.overlay(OverlayEvent::FocusTableCell {
                    block_id: "p-tbl".into(),
                    row_id: "row-1".into(),
                    column_id: "col-0".into(),
                    screen_pos: None,
                });
                s.overlay(OverlayEvent::SetKeyboardToolbarVisible(true));
                s.save_png(
                    &out_dir.join(format!("after-{tag}-05-table-disabled.png")),
                    &format!("after-{tag}-05-table-disabled"),
                );

                s.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
                    "p-body", 0,
                ))));
                s.overlay(OverlayEvent::KeyboardToolbar(
                    KeyboardToolbarAction::Bookmark,
                ));
                s.platform
                    .advance_clock(std::time::Duration::from_millis(200));
                s.type_into_field("https://affine.pro");
                s.save_png(
                    &out_dir.join(format!("after-{tag}-06-bookmark-prompt.png")),
                    &format!("after-{tag}-06-bookmark-prompt"),
                );
            }
        }
    }
}
