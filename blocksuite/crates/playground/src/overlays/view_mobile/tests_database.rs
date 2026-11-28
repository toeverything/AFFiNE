//! End-to-end headless tests for `affine:database` Table / Kanban / Calendar views,
//! zero-writeback view switching, calendar month stepping with `America/New_York` DST
//! timezone injection, mobile read-only gating, and offscreen PNG evidence capture.

use blocksuite_playground_doc::read::BlockContent;
use ui::{PlatformInput, ScrollDelta, ScrollEvent, ScrollSource, TouchPhase, point, px};

use crate::{PlaygroundTheme, database::DatabaseHitKind};

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
    let block_y = s.app.update(|cx| {
        s.window
            .update(cx, |v, _, _| {
                v.flow_layout()
                    .and_then(|l| l.block("showcase-database").map(|b| b.y))
                    .unwrap_or(0.0)
            })
            .unwrap()
    });
    let vp = s.frame().viewport;
    let pos = point(px(vp.width * 0.5), px(vp.height * 0.5));
    for delta in [100_000.0, -(block_y - 72.0).max(0.0)] {
        s.headless
            .dispatch_input(PlatformInput::Scroll(ScrollEvent {
                position: pos,
                delta: ScrollDelta::Pixels(point(px(0.0), px(delta))),
                modifiers: ui::Modifiers::default(),
                touch_phase: TouchPhase::Moved,
                source: ScrollSource::Pointer,
            }));
        s.platform.run_until_parked();
        s.frame();
    }
}

#[test]
fn database_view_switching_and_calendar_stepping_have_zero_writeback() {
    let s = MobileSession::open(1280, 2400, PlaygroundTheme::Light);
    let before_bytes = encode_page_bytes(&s);

    // Default view is Table View.
    let snap = s.frame();
    let text = snap.elements["page.block.showcase-database"]
        .text
        .as_deref()
        .unwrap_or("");
    assert!(text.contains("Tasks [table: Table View]"), "got {text:?}");

    // Switch to Kanban View -> zero CRDT writeback.
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.set_database_active_view("showcase-database", "view-kanban", cx);
            })
            .unwrap();
    });
    let snap_kanban = s.frame();
    let text_kanban = snap_kanban.elements["page.block.showcase-database"]
        .text
        .as_deref()
        .unwrap_or("");
    assert!(
        text_kanban.contains("Tasks [kanban: Kanban View]"),
        "got {text_kanban:?}"
    );
    assert_eq!(
        encode_page_bytes(&s),
        before_bytes,
        "kanban switch must be 0 writeback"
    );

    // Step Calendar forward from unset `calendar_month` when host clock is in 2026-11 while
    // records live in 2026-03: must advance from the displayed initial month (2026-03 -> 2026-04),
    // never jumping to 2026-12.
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                // 2026-11-15T12:00:00Z (EST -300)
                v.set_calendar_clock(Some(std::rc::Rc::new(|| (1_794_744_000_000, -300))));
                v.set_calendar_offset_at(
                    |utc_ms| {
                        if (1_772_953_200_000..1_793_512_800_000).contains(&utc_ms) {
                            -240
                        } else {
                            -300
                        }
                    },
                    cx,
                );
                v.set_database_active_view("showcase-database", "view-calendar", cx);
            })
            .unwrap();
    });
    let snap_cal = s.frame();
    let text_cal = snap_cal.elements["page.block.showcase-database"]
        .text
        .as_deref()
        .unwrap_or("");
    assert!(
        text_cal.contains("Tasks [calendar: Calendar View]") && text_cal.contains("2026-03"),
        "expected initial calendar month 2026-03 from records, got {text_cal:?}"
    );

    // Step Calendar forward one month -> 2026-04 (NOT 2026-12), zero CRDT writeback.
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.step_database_calendar_month("showcase-database", 1, cx);
            })
            .unwrap();
    });
    let snap_apr = s.frame();
    let text_apr = snap_apr.elements["page.block.showcase-database"]
        .text
        .as_deref()
        .unwrap_or("");
    assert!(
        text_apr.contains("2026-04"),
        "expected 2026-03 + 1 => 2026-04, got {text_apr:?}"
    );
    assert_eq!(
        encode_page_bytes(&s),
        before_bytes,
        "calendar stepping must be 0 writeback"
    );

    // Jump to Today -> 2026-11 (from injected clock), zero CRDT writeback.
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.set_database_calendar_today("showcase-database", cx);
            })
            .unwrap();
    });
    let snap_today = s.frame();
    let text_today = snap_today.elements["page.block.showcase-database"]
        .text
        .as_deref()
        .unwrap_or("");
    assert!(
        text_today.contains("2026-11"),
        "expected Today jump to 2026-11, got {text_today:?}"
    );
    assert_eq!(
        encode_page_bytes(&s),
        before_bytes,
        "today jump must be 0 writeback"
    );
}

#[test]
fn database_mobile_readonly_gates_edits_and_desktop_checkbox_toggles_with_undo() {
    let s = MobileSession::open(390, 2400, PlaygroundTheme::Light);
    let before_bytes = encode_page_bytes(&s);

    // Enable mobile read-only mode.
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.set_database_mobile_readonly(true, cx);
            })
            .unwrap();
    });
    s.frame();

    // Find a CellReadOnly hit box and click it -> shows notice banner, 0 writeback.
    let cell_pt = s.app.update(|cx| {
        s.window
            .update(cx, |v, _, _| {
                let hit = v
                    .database_hits("showcase-database")
                    .iter()
                    .find(|h| h.kind == DatabaseHitKind::CellReadOnly)
                    .expect("CellReadOnly hit in mobile readonly mode");
                (hit.rect.x + hit.rect.w * 0.5, hit.rect.y + hit.rect.h * 0.5)
            })
            .unwrap()
    });
    let handled = s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.click_database_point("showcase-database", cell_pt.0, cell_pt.1, None, cx)
            })
            .unwrap()
    });
    assert!(handled);
    let _snap_ro = s.frame();
    let (sheet_open, toast_visible) = s.app.update(|cx| {
        s.window
            .update(cx, |v, _, _| {
                (
                    v.database_record_sheet().is_some(),
                    v.overlays().context_toast_message().is_some(),
                )
            })
            .unwrap()
    });
    assert!(sheet_open, "mobile readonly row tap must open Record sheet");
    assert!(
        toast_visible,
        "mobile readonly tap must show one-time toast"
    );
    assert_eq!(
        encode_page_bytes(&s),
        before_bytes,
        "mobile readonly click must be 0 writeback"
    );

    // Verify off-screen scrolled hit outside CodeScroll.area is rejected on 390px viewport.
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.set_database_mobile_readonly(false, cx);
            })
            .unwrap();
    });
    s.frame();
    let offscreen_cb_pt = s.app.update(|cx| {
        s.window
            .update(cx, |v, _, _| {
                let hit = v
                    .database_hits("showcase-database")
                    .iter()
                    .find(|h| {
                        matches!(
                            h.kind,
                            DatabaseHitKind::ToggleCheckbox { current: false, .. }
                        )
                    })
                    .expect("unchecked checkbox hit");
                (hit.rect.x + hit.rect.w * 0.5, hit.rect.y + hit.rect.h * 0.5)
            })
            .unwrap()
    });
    let offscreen_handled = s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.click_database_point(
                    "showcase-database",
                    offscreen_cb_pt.0,
                    offscreen_cb_pt.1,
                    None,
                    cx,
                )
            })
            .unwrap()
    });
    assert!(
        !offscreen_handled,
        "clipped checkbox outside CodeScroll.area must not be clickable"
    );

    // Desktop mode (1280px, checkbox visible inside CodeScroll.area): toggle -> CRDT write, undo & redo.
    let s = MobileSession::open(1280, 2400, PlaygroundTheme::Light);
    let before_bytes = encode_page_bytes(&s);
    let cb_pt = s.app.update(|cx| {
        s.window
            .update(cx, |v, _, _| {
                let hit = v
                    .database_hits("showcase-database")
                    .iter()
                    .find(|h| {
                        matches!(
                            h.kind,
                            DatabaseHitKind::ToggleCheckbox { current: false, .. }
                        )
                    })
                    .expect("unchecked checkbox hit in desktop mode");
                (hit.rect.x + hit.rect.w * 0.5, hit.rect.y + hit.rect.h * 0.5)
            })
            .unwrap()
    });
    let toggled = s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.click_database_point("showcase-database", cb_pt.0, cb_pt.1, None, cx)
            })
            .unwrap()
    });
    assert!(toggled);
    let after_toggle = encode_page_bytes(&s);
    assert_ne!(
        after_toggle, before_bytes,
        "desktop checkbox toggle must write CRDT"
    );

    // Verify cell is now true, then undo restores it to false, and redo returns it to true.
    let read_done = || {
        s.app.update(|cx| {
            s.window
                .update(cx, |v, _, _| {
                    let snap = v.page_snapshot().unwrap();
                    let BlockContent::Database(db) =
                        &snap.block("showcase-database").unwrap().content
                    else {
                        panic!("expected database");
                    };
                    db.cells[&("showcase-db-row-1".into(), "col-done".into())].as_bool()
                })
                .unwrap()
        })
    };
    assert_eq!(read_done(), Some(true));

    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                assert!(v.page_mut().unwrap().undo().unwrap().is_some());
                v.refresh_document();
                cx.notify();
            })
            .unwrap();
    });
    assert_eq!(
        read_done(),
        Some(false),
        "undo must restore checkbox to false"
    );

    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                assert!(v.page_mut().unwrap().redo().unwrap().is_some());
                v.refresh_document();
                cx.notify();
            })
            .unwrap();
    });
    assert_eq!(
        read_done(),
        Some(true),
        "redo must restore checkbox to true"
    );
}

#[test]
fn database_offscreen_evidence_capture() {
    let Ok(out_dir) = std::env::var("DATABASE_EVIDENCE_DIR") else {
        return;
    };
    let out = std::path::PathBuf::from(out_dir);
    std::fs::create_dir_all(&out).expect("create evidence dir");

    let capture = |name: &str,
                   w: u32,
                   h: u32,
                   theme: PlaygroundTheme,
                   view_id: &str,
                   mobile_readonly: bool,
                   trigger_notice: bool| {
        let s = MobileSession::open(w, h, theme);
        s.app.update(|cx| {
            s.window
                .update(cx, |v, _, cx| {
                    v.set_calendar_clock(Some(std::rc::Rc::new(|| (1_772_960_400_000, -240))));
                    v.set_database_mobile_readonly(mobile_readonly, cx);
                    v.set_database_active_view("showcase-database", view_id, cx);
                })
                .unwrap();
        });
        s.frame();
        if trigger_notice {
            let cell_pt = s.app.update(|cx| {
                s.window
                    .update(cx, |v, _, _| {
                        v.database_hits("showcase-database")
                            .iter()
                            .find(|h| h.kind == DatabaseHitKind::CellReadOnly)
                            .map(|h| (h.rect.x + h.rect.w * 0.5, h.rect.y + h.rect.h * 0.5))
                    })
                    .unwrap()
            });
            if let Some((lx, ly)) = cell_pt {
                s.app.update(|cx| {
                    s.window
                        .update(cx, |v, _, cx| {
                            v.click_database_point("showcase-database", lx, ly, None, cx);
                        })
                        .unwrap();
                });
            }
        }
        if h < 2000 {
            scroll_to_database(&s);
        }
        s.frame();
        let img = s.app.update(|cx| {
            s.window
                .update(cx, |_, window, _| window.render_to_image().unwrap())
                .unwrap()
        });
        img.save(out.join(name)).expect("save png");
    };

    // Full-page same-dimension matches for before/after comparison (1280x2400 & 390x2400):
    capture(
        "after-table-desktop-light.png",
        1280,
        2400,
        PlaygroundTheme::Light,
        "view-table",
        false,
        false,
    );
    capture(
        "after-table-desktop-dark.png",
        1280,
        2400,
        PlaygroundTheme::Dark,
        "view-table",
        false,
        false,
    );
    capture(
        "after-kanban-desktop-light.png",
        1280,
        900,
        PlaygroundTheme::Light,
        "view-kanban",
        false,
        false,
    );
    capture(
        "after-kanban-desktop-dark.png",
        1280,
        900,
        PlaygroundTheme::Dark,
        "view-kanban",
        false,
        false,
    );
    capture(
        "after-calendar-desktop-light.png",
        1280,
        900,
        PlaygroundTheme::Light,
        "view-calendar",
        false,
        false,
    );
    capture(
        "after-calendar-desktop-dark.png",
        1280,
        900,
        PlaygroundTheme::Dark,
        "view-calendar",
        false,
        false,
    );
    capture(
        "after-table-mobile-light.png",
        390,
        844,
        PlaygroundTheme::Light,
        "view-table",
        true,
        true,
    );
    capture(
        "after-kanban-mobile-light.png",
        390,
        844,
        PlaygroundTheme::Light,
        "view-kanban",
        true,
        false,
    );
    capture(
        "after-calendar-mobile-light.png",
        390,
        844,
        PlaygroundTheme::Light,
        "view-calendar",
        true,
        false,
    );
}
