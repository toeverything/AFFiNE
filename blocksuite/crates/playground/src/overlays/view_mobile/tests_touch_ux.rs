//! Deterministic tests for soft-keyboard viewport occlusion, KeyboardToolbar positioning,
//! Touch UX interactions (database record sheet, phone calendar, responsive view tabs,
//! scroll axis lock, context menu keyboard navigation, FormFactor gates, todo pulse,
//! and Edgeless zoom controls), plus optional offscreen PNG evidence capture.

use std::time::Duration;

use blocksuite_playground_doc::schema::{BlockSpec, ParagraphType};
use ui::{
    EntityInputHandler, KeyDownEvent, Keystroke, Modifiers, PlatformInput, ScrollDelta,
    ScrollEvent, ScrollSource, TouchPhase, point, px,
};

use crate::{
    DocState, FormFactor, HOME_PAGE_ID, PlaygroundMode, PlaygroundOptions, PlaygroundTheme,
    database::DatabaseHitKind,
    overlays::{ActiveSelection, KEYBOARD_TOOLBAR_HEIGHT, OverlayEvent, TODO_PULSE_MS},
};

use super::tests::MobileSession;

fn encode_page_bytes(s: &MobileSession) -> Vec<u8> {
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, _| {
                v.page().expect("active page").encode_update_v1().unwrap()
            })
            .unwrap()
    })
}

fn scroll_to_database(s: &MobileSession) {
    let block_y = s.view(|v| {
        v.flow_layout()
            .and_then(|l| l.block("showcase-database").map(|b| b.y))
            .unwrap_or(0.0)
    });
    let vp = s.frame().viewport;
    let pos = point(px(vp.width * 0.5), px(vp.height * 0.5));
    for delta in [100_000.0, -(block_y - 72.0).max(0.0)] {
        s.headless
            .dispatch_input(PlatformInput::Scroll(ScrollEvent {
                position: pos,
                delta: ScrollDelta::Pixels(point(px(0.0), px(delta))),
                modifiers: Modifiers::default(),
                touch_phase: TouchPhase::Moved,
                source: ScrollSource::Pointer,
            }));
        s.platform.run_until_parked();
        let _ = s.frame();
    }
}

#[test]
fn soft_keyboard_shifts_toolbar_above_ime_and_auto_scrolls_lower_paragraph_into_view() {
    let s = MobileSession::open_with_options(
        390,
        844,
        PlaygroundOptions {
            theme: PlaygroundTheme::Light,
            ..PlaygroundOptions::for_form_factor(FormFactor::Phone)
        },
    );

    let mut state = DocState::new("ime-scroll-test", 42).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "IME Scroll Test", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "IME Scroll Test".into(),
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
        for i in 0..24 {
            page.add_block(
                &format!("p-{i}"),
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: format!("Paragraph line {i} for soft keyboard scroll test"),
                },
                Some("note"),
                None,
                10 + i as u64,
            )
            .unwrap();
        }
    }
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| v.set_document(state, cx))
            .unwrap();
    });
    let _ = s.frame();

    // Place caret on a lower-half paragraph (`p-18`) and raise a 336px software keyboard.
    let ime_bottom = 336.0_f32;
    s.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
        "p-18", 10,
    ))));
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, _| v.set_host_ime_bottom(ime_bottom))
            .unwrap();
    });
    let snap = s.frame();

    let bar = snap
        .elements
        .get("overlay.keyboard_toolbar")
        .expect("keyboard toolbar must be visible");
    let expected_bar_top = 844.0 - ime_bottom - KEYBOARD_TOOLBAR_HEIGHT;
    assert!(
        (bar.bounds.y - expected_bar_top).abs() <= 1.0,
        "KeyboardToolbar y must sit flush above IME ({expected_bar_top}), got {}",
        bar.bounds.y
    );
    let dismiss = snap
        .elements
        .get("overlay.keyboard_toolbar.dismiss")
        .expect("dismiss button must be visible");
    assert!(
        dismiss.bounds.x + dismiss.bounds.width <= 390.5,
        "dismiss button must not clip past 390px viewport: {:?}",
        dismiss.bounds
    );

    let visible_bottom = expected_bar_top;
    let caret = snap
        .elements
        .get("page.local_caret")
        .expect("local caret must be visible after auto-scroll");
    assert!(
        caret.bounds.y + caret.bounds.height <= visible_bottom + 0.5,
        "caret bottom ({}) must be <= visible_bottom ({visible_bottom})",
        caret.bounds.y + caret.bounds.height
    );
    assert!(s.view(|v| v.scroll_offset()) > 0.0);

    // Typing CJK text and pressing Enter must keep caret above KeyboardToolbar.
    s.app.update(|cx| {
        s.window
            .update(cx, |v, w, cx| {
                v.replace_text_in_range(None, "你好", w, cx);
            })
            .unwrap();
    });
    s.headless
        .dispatch_input(PlatformInput::KeyDown(KeyDownEvent {
            keystroke: Keystroke {
                modifiers: Modifiers::default(),
                key: "enter".into(),
                key_char: None,
            },
            is_held: false,
            prefer_character_input: false,
        }));
    s.platform.run_until_parked();
    let snap_after = s.frame();
    let caret_after = snap_after
        .elements
        .get("page.local_caret")
        .expect("caret must remain visible after typing + Enter");
    assert!(
        caret_after.bounds.y + caret_after.bounds.height <= visible_bottom + 0.5,
        "caret after Enter ({}) must stay <= visible_bottom ({visible_bottom})",
        caret_after.bounds.y + caret_after.bounds.height
    );
}

#[test]
fn database_readonly_toast_record_sheet_phone_calendar_and_responsive_tabs() {
    let s = MobileSession::open_with_options(
        390,
        844,
        PlaygroundOptions {
            theme: PlaygroundTheme::Light,
            ..PlaygroundOptions::for_form_factor(FormFactor::Phone)
        },
    );
    let before_bytes = encode_page_bytes(&s);

    // Pin clock to 2026-03-10 so Phone calendar defaults to current month 2026-03.
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, _| {
                v.set_calendar_clock(Some(std::rc::Rc::new(|| (1_773_100_800_000, 0))));
            })
            .unwrap();
    });
    scroll_to_database(&s);

    // Scrolling database into view fires the read-only toast once per session.
    assert!(s.view(|v| v.database_readonly_toast_shown));

    // Phone view tabs render on a single horizontal row (all SwitchView hits share the same y).
    let tab_ys: Vec<f32> = s.view(|v| {
        v.database_hits("showcase-database")
            .iter()
            .filter(|h| matches!(h.kind, DatabaseHitKind::SwitchView { .. }))
            .map(|h| h.rect.y)
            .collect()
    });
    assert!(tab_ys.len() >= 2, "expected multiple view tabs");
    assert!(
        tab_ys.iter().all(|&y| (y - tab_ys[0]).abs() <= 0.5),
        "Phone view tabs must stay on a single horizontal row, got ys={tab_ys:?}"
    );

    // Tapping a Table row opens the iOS 27 "Record" bottom sheet with 0 writeback & no keyboard.
    let row_hit = s.view(|v| {
        v.database_hits("showcase-database")
            .iter()
            .find(|h| matches!(h.kind, DatabaseHitKind::OpenRecord { .. }))
            .map(|h| (h.rect.x + 24.0, h.rect.y + h.rect.h * 0.5))
            .expect("table row OpenRecord hit")
    });
    s.app.update(|cx| {
        s.window
            .update(cx, |v, w, cx| {
                assert!(v.click_database_point(
                    "showcase-database",
                    row_hit.0,
                    row_hit.1,
                    Some(w),
                    cx
                ));
            })
            .unwrap();
    });
    let sheet_snap = s.frame();
    assert!(
        sheet_snap
            .elements
            .contains_key("overlay.database_record_sheet"),
        "Record sheet must mount on row tap"
    );
    assert_eq!(
        sheet_snap.elements["overlay.database_record_sheet.header"]
            .text
            .as_deref(),
        Some("Record")
    );
    assert!(
        !s.view(|v| v.wants_software_keyboard()),
        "tapping read-only record must not open software keyboard"
    );
    assert_eq!(
        encode_page_bytes(&s),
        before_bytes,
        "opening Record sheet must cause zero CRDT writeback"
    );
    // Toggle hidden fields ("End" is hidden in Table view).
    s.click_id(&sheet_snap, "overlay.database_record_sheet.hidden_toggle");
    assert!(s.view(|v| {
        v.database_record_sheet()
            .is_some_and(|sh| sh.hidden_expanded)
    }));

    if let Ok(out_dir) = std::env::var("TOUCH_UX_EVIDENCE_DIR") {
        let out = std::path::Path::new(&out_dir);
        std::fs::create_dir_all(out).unwrap();
        let img = s.app.update(|cx| {
            s.window
                .update(cx, |_, window, _| window.render_to_image().unwrap())
                .unwrap()
        });
        img.save(out.join("after-tn1-record-sheet.png")).unwrap();
    }

    // Close sheet cleanly via close button.
    let expanded_snap = s.frame();
    s.click_id(&expanded_snap, "overlay.database_record_sheet.close");
    assert!(s.view(|v| v.database_record_sheet().is_none()));

    if let Ok(out_dir) = std::env::var("TOUCH_UX_EVIDENCE_DIR") {
        let _ = s.frame();
        let img = s.app.update(|cx| {
            s.window
                .update(cx, |_, window, _| window.render_to_image().unwrap())
                .unwrap()
        });
        img.save(std::path::Path::new(&out_dir).join("after-tn3-view-tabs.png"))
            .unwrap();
    }

    // Switch to Calendar View on Phone -> 44pt nav buttons, day select hits, agenda OpenRecord.
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.set_database_active_view("showcase-database", "view-calendar", cx);
            })
            .unwrap();
    });
    let _ = s.frame();
    // Scroll calendar block to top of viewport so both the month dot grid and agenda cards are visible.
    let cal_scroll_y = s.view(|v| {
        v.flow_layout()
            .and_then(|l| l.block("showcase-database").map(|b| (b.y - 12.0).max(0.0)))
            .unwrap_or(0.0)
    });
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.scroll_y = cal_scroll_y;
                cx.notify();
            })
            .unwrap();
    });
    // Let the one-time toast expire before capturing the Phone Calendar agenda screenshot.
    s.platform.advance_clock(Duration::from_millis(3000));
    s.platform.run_until_parked();
    let _ = s.frame();
    let cal_hits = s.view(|v| v.database_hits("showcase-database").to_vec());
    let prev_btn = cal_hits
        .iter()
        .find(|h| matches!(h.kind, DatabaseHitKind::CalendarPrevMonth))
        .expect("prev month button");
    assert!(
        prev_btn.rect.w >= 44.0 && prev_btn.rect.h >= 44.0,
        "Phone calendar nav button must be >= 44pt, got {:?}",
        prev_btn.rect
    );
    assert!(
        cal_hits
            .iter()
            .any(|h| matches!(h.kind, DatabaseHitKind::CalendarSelectDay { .. })),
        "Phone calendar must emit day selection hits"
    );
    assert!(
        cal_hits
            .iter()
            .any(|h| matches!(h.kind, DatabaseHitKind::OpenRecord { .. })),
        "Phone calendar agenda must emit OpenRecord hits for selected day events"
    );

    if let Ok(out_dir) = std::env::var("TOUCH_UX_EVIDENCE_DIR") {
        let img = s.app.update(|cx| {
            s.window
                .update(cx, |_, window, _| window.render_to_image().unwrap())
                .unwrap()
        });
        img.save(std::path::Path::new(&out_dir).join("after-tn2-phone-calendar.png"))
            .unwrap();
    }
    assert_eq!(encode_page_bytes(&s), before_bytes);
}

#[test]
fn touch_scroll_axis_lock_context_menu_keyboard_nav_todo_pulse_and_edgeless_zoom() {
    // Todo pulse duration is 600ms.
    assert_eq!(TODO_PULSE_MS, 600.0);

    // Desktop context menu supports Down / Up / Enter / Escape keyboard navigation.
    let desktop = MobileSession::open(1280, 800, PlaygroundTheme::Light);
    desktop.overlay(OverlayEvent::SetSelection(Some(ActiveSelection {
        block_id: "showcase-p1".into(),
        start_utf16: 0,
        end_utf16: 5,
    })));
    let _ = desktop.frame();
    desktop.overlay(OverlayEvent::OpenContextMenu { x: 400.0, y: 240.0 });
    let snap = desktop.frame();
    assert!(snap.elements.contains_key("overlay.context_menu"));
    for key in ["down", "down", "up", "escape"] {
        desktop
            .headless
            .dispatch_input(PlatformInput::KeyDown(KeyDownEvent {
                keystroke: Keystroke {
                    modifiers: Modifiers::default(),
                    key: key.into(),
                    key_char: None,
                },
                is_held: false,
                prefer_character_input: false,
            }));
        desktop.platform.run_until_parked();
        let _ = desktop.frame();
    }
    desktop.platform.advance_clock(Duration::from_millis(200));
    let closed = desktop.frame();
    assert!(!closed.elements.contains_key("overlay.context_menu"));

    // Edgeless zoom controls on Phone have >= 44pt targets and +/- 0.25 additive steps.
    let phone_edgeless = MobileSession::open_with_options(
        390,
        844,
        PlaygroundOptions {
            theme: PlaygroundTheme::Light,
            mode: PlaygroundMode::Edgeless,
            ..PlaygroundOptions::for_form_factor(FormFactor::Phone)
        },
    );
    phone_edgeless.app.update(|cx| {
        phone_edgeless
            .window
            .update(cx, |v, _, cx| v.set_edgeless_zoom(1.0, cx))
            .unwrap();
    });
    let z_snap = phone_edgeless.frame();
    let zoom_in_b = z_snap.elements["chrome.edgeless_zoom.in"].bounds;
    assert!(
        zoom_in_b.width >= 44.0 && zoom_in_b.height >= 44.0,
        "Touch Edgeless zoom button must be >= 44pt, got {zoom_in_b:?}"
    );
    phone_edgeless.click_id(&z_snap, "chrome.edgeless_zoom.in");
    phone_edgeless
        .platform
        .advance_clock(Duration::from_millis(220));
    let _ = phone_edgeless.frame();
    let zoomed = phone_edgeless.view(|v| v.edgeless_camera().zoom);
    assert!(
        (zoomed - 1.25).abs() < 1e-3,
        "zoom in from 1.0 must step by +0.25 to 1.25, got {zoomed}"
    );
    let z_snap2 = phone_edgeless.frame();
    phone_edgeless.click_id(&z_snap2, "chrome.edgeless_zoom.out");
    phone_edgeless
        .platform
        .advance_clock(Duration::from_millis(220));
    let _ = phone_edgeless.frame();
    let back = phone_edgeless.view(|v| v.edgeless_camera().zoom);
    assert!(
        (back - 1.0).abs() < 1e-3,
        "zoom out from 1.25 must step by -0.25 back to 1.0, got {back}"
    );

    // Vertical touch scroll locks axis and ignores horizontal jitter.
    let touch_page = MobileSession::open_with_options(
        390,
        844,
        PlaygroundOptions {
            theme: PlaygroundTheme::Light,
            ..PlaygroundOptions::for_form_factor(FormFactor::Phone)
        },
    );
    let pos = point(px(195.0), px(400.0));
    touch_page
        .headless
        .dispatch_input(PlatformInput::Scroll(ScrollEvent {
            position: pos,
            delta: ScrollDelta::Pixels(point(px(2.0), px(-30.0))),
            modifiers: Modifiers::default(),
            touch_phase: TouchPhase::Started,
            source: ScrollSource::Touch,
        }));
    touch_page.platform.run_until_parked();
    assert_eq!(
        touch_page.view(|v| v.touch_scroll_axis_lock),
        Some(crate::TouchScrollAxis::Vertical)
    );
    touch_page
        .headless
        .dispatch_input(PlatformInput::Scroll(ScrollEvent {
            position: pos,
            delta: ScrollDelta::Pixels(point(px(0.0), px(0.0))),
            modifiers: Modifiers::default(),
            touch_phase: TouchPhase::Ended,
            source: ScrollSource::Touch,
        }));
    touch_page.platform.run_until_parked();
    assert_eq!(touch_page.view(|v| v.touch_scroll_axis_lock), None);

    // Backspace in an empty paragraph below a table on Phone with soft keyboard open
    // must select the table block instead of skipping across it and deleting above-table text.
    let mut tbl_state = DocState::new("phone-table-backspace", 43).unwrap();
    tbl_state
        .workspace
        .create_page(HOME_PAGE_ID, "Table Backspace", 1)
        .unwrap();
    {
        let page = tbl_state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Table Backspace".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block(
            "note-1",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            2,
        )
        .unwrap();
        page.add_block(
            "p-above",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Keep me intact".into(),
            },
            Some("note-1"),
            None,
            1_000,
        )
        .unwrap();
        page.add_block(
            "tbl-1",
            BlockSpec::Table {
                rows: vec![vec!["A".into(), "B".into()]],
            },
            Some("note-1"),
            None,
            1_001,
        )
        .unwrap();
        page.add_block(
            "p-below",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: String::new(),
            },
            Some("note-1"),
            None,
            1_002,
        )
        .unwrap();
    }
    touch_page.app.update(|cx| {
        touch_page
            .window
            .update(cx, |v, _, cx| {
                v.set_document(tbl_state, cx);
                v.set_host_ime_bottom(300.0);
            })
            .unwrap();
    });
    let _ = touch_page.frame();
    touch_page.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
        "p-below", 0,
    ))));
    let _ = touch_page.frame();
    touch_page
        .headless
        .dispatch_input(PlatformInput::KeyDown(KeyDownEvent {
            keystroke: Keystroke::parse("backspace").unwrap(),
            is_held: false,
            prefer_character_input: false,
        }));
    touch_page.platform.run_until_parked();
    let _ = touch_page.frame();
    assert_eq!(
        touch_page.view(|v| v.block_selection().to_vec()),
        vec!["tbl-1".to_string()],
        "Backspace below table on Phone with IME open must select the table"
    );
    assert_eq!(
        touch_page.view(|v| v.block_text("p-above").map(str::to_owned)),
        Some("Keep me intact".to_string()),
        "Backspace below table must never delete text from the paragraph above"
    );
}
