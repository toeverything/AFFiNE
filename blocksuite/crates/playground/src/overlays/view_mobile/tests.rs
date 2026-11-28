//! Comprehensive `0.27.5` `defaultKeyboardToolbarConfig` integration tests,
//! soft-wrapped equation navigation/hit-test checks, surgical per-formula layout
//! invalidation checks, and offscreen PNG evidence generator.

use std::{cell::Cell, cell::RefCell, rc::Rc, time::Duration};

use blocksuite_playground_doc::{
    read::BlockContent,
    schema::{BlockSpec, ListType, ParagraphType},
};
use ui::{
    AppContext, Application, ApplicationHandle, Bounds, EntityInputHandler, FrameSnapshot,
    HeadlessPlatform, HeadlessWindow, KeyDownEvent, Keystroke, Modifiers, PlatformInput,
    WindowBounds, WindowHandle, WindowOptions, audit_frame_snapshot, point, px, size,
};
use y_octo::{Any, TextDeltaOp};

use crate::{
    PlaygroundOptions, PlaygroundTheme, PlaygroundView,
    block_flow::ImageSlot,
    overlays::{
        ActiveSelection, HighlightColor, KEYBOARD_TOOLBAR_HEIGHT, KeyboardToolbarAction,
        KeyboardToolbarLevel, KeyboardToolbarPanel, OverlayEvent, SlashCommand,
    },
    register_bundled_fonts,
};

pub(super) struct MobileSession {
    pub(super) platform: Rc<HeadlessPlatform>,
    pub(super) app: ApplicationHandle,
    pub(super) window: WindowHandle<PlaygroundView>,
    pub(super) headless: HeadlessWindow,
}

impl MobileSession {
    pub(super) fn open(width: u32, height: u32, theme: PlaygroundTheme) -> Self {
        Self::open_with_options(
            width,
            height,
            PlaygroundOptions {
                theme,
                ..PlaygroundOptions::default()
            },
        )
    }

    pub(super) fn open_with_options(width: u32, height: u32, options: PlaygroundOptions) -> Self {
        let platform = HeadlessPlatform::new(width, height, 1.0);
        let handle_cell: Rc<RefCell<Option<WindowHandle<PlaygroundView>>>> =
            Rc::new(RefCell::new(None));
        let handle_out = handle_cell.clone();
        let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
            register_bundled_fonts(cx).expect("bundled fonts");
            let window = cx
                .open_window(
                    WindowOptions {
                        window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                            point(px(0.0), px(0.0)),
                            size(px(width as f32), px(height as f32)),
                        ))),
                        ..WindowOptions::default()
                    },
                    |_, cx| cx.new(|cx| PlaygroundView::with_options(options, cx)),
                )
                .expect("open headless window");
            *handle_out.borrow_mut() = Some(window);
        });
        let window = handle_cell.borrow_mut().take().expect("window opened");
        let headless = platform
            .windows()
            .into_iter()
            .next()
            .expect("headless window registered");
        let session = Self {
            platform,
            app,
            window,
            headless,
        };
        session.frame();
        session.platform.run_until_parked();
        session
    }

    pub(super) fn edit(
        &self,
        f: impl FnOnce(&mut blocksuite_playground_doc::session::PageDocSession),
    ) {
        self.app.update(|cx| {
            self.window
                .update(cx, |v, _, cx| {
                    let page = v.page_mut().expect("active page");
                    f(page);
                    v.refresh_document();
                    cx.notify();
                })
                .unwrap();
        });
    }

    pub(super) fn overlay(&self, event: OverlayEvent) {
        self.app.update(|cx| {
            self.window
                .update(cx, |v, w, cx| v.dispatch_overlay(event, w, cx))
                .unwrap();
        });
    }

    pub(super) fn frame(&self) -> FrameSnapshot {
        self.headless.request_frame();
        self.app.update(|cx| {
            self.window
                .update(cx, |_, window, _| window.frame_snapshot().clone())
                .unwrap()
        })
    }

    pub(super) fn click_id(&self, snap: &FrameSnapshot, id: &str) {
        let b = snap
            .elements
            .get(id)
            .unwrap_or_else(|| panic!("missing snapshot element {id}"))
            .bounds;
        self.headless
            .simulate_click(point(px(b.x + b.width * 0.5), px(b.y + b.height * 0.5)));
        self.platform.run_until_parked();
    }

    pub(super) fn key(&self, key: &str) {
        self.frame();
        self.platform.run_until_parked();
        self.headless
            .dispatch_input(PlatformInput::KeyDown(KeyDownEvent {
                keystroke: Keystroke {
                    modifiers: Modifiers::default(),
                    key: key.to_string(),
                    key_char: (key.chars().count() == 1).then(|| key.to_string()),
                },
                is_held: false,
                prefer_character_input: false,
            }));
        self.platform.run_until_parked();
    }

    pub(super) fn type_into_field(&self, text: &str) {
        self.app.update(|cx| {
            self.window
                .update(cx, |v, w, cx| {
                    v.replace_text_in_range(None, text, w, cx);
                })
                .unwrap();
        });
        self.frame();
    }

    pub(super) fn text(&self, block_id: &str) -> blocksuite_playground_doc::read::RichText {
        self.app.update(|cx| {
            self.window
                .update(cx, |v, _, _| {
                    v.page()
                        .expect("page")
                        .read_editable_text(block_id)
                        .expect("text")
                        .0
                })
                .unwrap()
        })
    }

    pub(super) fn block_count(&self, parent_id: &str) -> usize {
        self.app.update(|cx| {
            self.window
                .update(cx, |v, _, _| {
                    v.page_snapshot()
                        .and_then(|s| s.block(parent_id))
                        .map(|n| n.children.len())
                        .unwrap_or(0)
                })
                .unwrap()
        })
    }

    pub(super) fn view<R>(&self, f: impl FnOnce(&PlaygroundView) -> R) -> R {
        self.app
            .update(|cx| self.window.update(cx, |v, _, _| f(v)).unwrap())
    }

    pub(super) fn save_png(&self, path: &std::path::Path, label: &str) {
        let snap = self.frame();
        let violations = audit_frame_snapshot(&snap);
        assert!(
            violations.is_empty(),
            "audit violations in {label}: {violations:#?}"
        );
        let img = self
            .app
            .update(|cx| {
                self.window
                    .update(cx, |_, window, _| window.render_to_image())
                    .unwrap()
            })
            .expect("render image");
        img.save(path)
            .unwrap_or_else(|e| panic!("save {}: {e}", path.display()));
    }
}

pub(super) fn encode_test_png(width: u32, height: u32) -> Vec<u8> {
    let mut img = image::RgbaImage::new(width, height);
    for (x, y, px) in img.enumerate_pixels_mut() {
        *px = image::Rgba([(x * 17) as u8, (y * 29) as u8, 180, 255]);
    }
    let mut out = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut out);
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut cursor, image::ImageFormat::Png)
        .expect("encode test png");
    out
}

#[test]
fn keyboard_toolbar_0275_highlights_marks_and_link_single_step_undo() {
    let session = MobileSession::open(390, 844, PlaygroundTheme::Light);
    session.edit(|page| {
        page.add_block(
            "hl-p",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Hello highlight world".into(),
            },
            Some("showcase-note"),
            Some(0),
            5_000_000,
        )
        .expect("add paragraph");
    });

    session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection {
        block_id: "hl-p".into(),
        start_utf16: 6,
        end_utf16: 15,
    })));
    session.overlay(OverlayEvent::SetKeyboardToolbarVisible(true));
    let frame = session.frame();
    assert!(audit_frame_snapshot(&frame).is_empty());
    assert_eq!(
        session.view(|v| v.overlays().keyboard_toolbar_level()),
        KeyboardToolbarLevel::TextStyle
    );

    for (action, key) in [
        (KeyboardToolbarAction::Bold, "bold"),
        (KeyboardToolbarAction::Italic, "italic"),
        (KeyboardToolbarAction::Underline, "underline"),
        (KeyboardToolbarAction::Strike, "strike"),
        (KeyboardToolbarAction::InlineCode, "code"),
    ] {
        session.overlay(OverlayEvent::KeyboardToolbar(action));
        let marked = session.text("hl-p");
        assert!(
            marked.delta.iter().any(|op| matches!(
                op,
                TextDeltaOp::Insert { format: Some(f), .. } if f.get(key) == Some(&Any::True)
            )),
            "mark {key} not applied"
        );
        session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Undo));
        let undone = session.text("hl-p");
        assert!(
            undone.delta.iter().all(|op| !matches!(
                op,
                TextDeltaOp::Insert { format: Some(f), .. } if f.get(key) == Some(&Any::True)
            )),
            "mark {key} not undone in 1 step"
        );
    }

    session.overlay(OverlayEvent::KeyboardToolbar(
        KeyboardToolbarAction::ToggleHighlightPanel,
    ));
    let hl_frame = session.frame();
    assert!(audit_frame_snapshot(&hl_frame).is_empty());
    assert!(
        hl_frame
            .elements
            .contains_key("overlay.keyboard_toolbar.panel.color.red")
    );
    assert!(
        hl_frame
            .elements
            .contains_key("overlay.keyboard_toolbar.panel.background.yellow")
    );

    session.overlay(OverlayEvent::KeyboardToolbar(
        KeyboardToolbarAction::SetTextColor(HighlightColor::Red),
    ));
    let colored = session.text("hl-p");
    assert!(colored.delta.iter().any(|op| matches!(
        op,
        TextDeltaOp::Insert { format: Some(f), .. }
            if f.get("color") == Some(&Any::String("var(--affine-v2-text-highlight-fg-red)".into()))
    )));
    session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Undo));
    let after_fg_undo = session.text("hl-p");
    assert!(after_fg_undo.delta.iter().all(|op| !matches!(
        op,
        TextDeltaOp::Insert { format: Some(f), .. } if f.contains_key("color")
    )));

    session.overlay(OverlayEvent::KeyboardToolbar(
        KeyboardToolbarAction::SetBgColor(HighlightColor::Yellow),
    ));
    let bg_colored = session.text("hl-p");
    assert!(bg_colored.delta.iter().any(|op| matches!(
        op,
        TextDeltaOp::Insert { format: Some(f), .. }
            if f.get("background")
                == Some(&Any::String("var(--affine-v2-text-highlight-bg-yellow)".into()))
    )));
    session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Undo));
    let after_bg_undo = session.text("hl-p");
    assert!(after_bg_undo.delta.iter().all(|op| !matches!(
        op,
        TextDeltaOp::Insert { format: Some(f), .. } if f.contains_key("background")
    )));

    session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Link));
    let _ = session.frame();
    assert!(session.view(|v| v.overlays().link_field().is_some()));
}

#[test]
fn keyboard_toolbar_0275_local_dates_image_picker_bookmark_prompt_and_table_gate() {
    let session = MobileSession::open(390, 844, PlaygroundTheme::Light);
    session.edit(|page| {
        page.add_block(
            "ops-p1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: String::new(),
            },
            Some("showcase-note"),
            Some(0),
            6_000_000,
        )
        .expect("add p1");
        page.add_block(
            "ops-p2",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Second block".into(),
            },
            Some("showcase-note"),
            Some(1),
            6_000_001,
        )
        .expect("add p2");
    });

    session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
        "ops-p2", 12,
    ))));
    session.overlay(OverlayEvent::SetKeyboardToolbarVisible(true));
    let base_count = session.block_count("showcase-note");

    // Duplicate & Delete each undo in 1 step.
    session.overlay(OverlayEvent::KeyboardToolbar(
        KeyboardToolbarAction::Duplicate,
    ));
    assert_eq!(session.block_count("showcase-note"), base_count + 1);
    session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Undo));
    assert_eq!(session.block_count("showcase-note"), base_count);

    session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
        "ops-p2", 0,
    ))));
    session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Delete));
    assert_eq!(session.block_count("showcase-note"), base_count - 1);
    session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Undo));
    assert_eq!(session.block_count("showcase-note"), base_count);

    let scroll_more_panel = |dy: f32| {
        let s = session.frame();
        let p = s.elements["overlay.keyboard_toolbar.panel"].bounds;
        session
            .headless
            .dispatch_input(PlatformInput::Scroll(ui::ScrollEvent {
                position: point(px(p.x + p.width * 0.5), px(p.y + p.height * 0.5)),
                delta: ui::ScrollDelta::Pixels(point(px(0.0), px(dy))),
                modifiers: Modifiers::default(),
                touch_phase: ui::TouchPhase::Moved,
                source: ui::ScrollSource::Pointer,
            }));
        session.platform.run_until_parked();
        session.frame()
    };

    // 1a. Deterministic UTC+0 daytime calendar clock (`2026-11-26T14:05:00Z` = `1_795_701_900_000` ms):
    // must format via the test clock without depending on host wall-clock time.
    session.app.update(|cx| {
        session
            .window
            .update(cx, |v, _, _| {
                v.set_calendar_clock(Some(Rc::new(|| (1_795_701_900_000_i64, 0))));
            })
            .unwrap();
    });
    session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
        "ops-p1", 0,
    ))));
    session.overlay(OverlayEvent::KeyboardToolbar(
        KeyboardToolbarAction::ToggleMorePanel,
    ));
    let more_snap = scroll_more_panel(-800.0);
    session.click_id(&more_snap, "overlay.keyboard_toolbar.panel.date.date_today");
    assert_eq!(session.text("ops-p1").plain, "2026-11-26");
    session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Undo));
    assert_eq!(session.text("ops-p1").plain, "");

    // 1b. Cross-midnight local timezone rollover via visible panel buttons:
    // UTC = 2026-11-26T16:30:00Z (1795710600000 ms), local offset = +480 min (UTC+8) -> 2026-11-27 00:30!
    session.app.update(|cx| {
        session
            .window
            .update(cx, |v, _, _| {
                v.set_calendar_clock(Some(Rc::new(|| (1_795_710_600_000_i64, 480))));
            })
            .unwrap();
    });
    for (tile_id, expected) in [
        (
            "overlay.keyboard_toolbar.panel.date.date_today",
            "2026-11-27",
        ),
        (
            "overlay.keyboard_toolbar.panel.date.date_yesterday",
            "2026-11-26",
        ),
        (
            "overlay.keyboard_toolbar.panel.date.date_tomorrow",
            "2026-11-28",
        ),
        (
            "overlay.keyboard_toolbar.panel.date.date_now",
            "11-27 00:30",
        ),
    ] {
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "ops-p1", 0,
        ))));
        if session.view(|v| v.overlays().keyboard_toolbar_active_panel())
            != Some(KeyboardToolbarPanel::More)
        {
            session.overlay(OverlayEvent::KeyboardToolbar(
                KeyboardToolbarAction::ToggleMorePanel,
            ));
        }
        let snap = scroll_more_panel(-800.0);
        session.click_id(&snap, tile_id);
        assert_eq!(
            session.text("ops-p1").plain,
            expected,
            "mismatch for visible button {tile_id}"
        );
        session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Undo));
        assert_eq!(session.text("ops-p1").plain, "");
    }
    if session.view(|v| v.overlays().keyboard_toolbar_active_panel())
        == Some(KeyboardToolbarPanel::More)
    {
        session.overlay(OverlayEvent::KeyboardToolbar(
            KeyboardToolbarAction::ToggleMorePanel,
        ));
    }

    // 2. Native default without registered `image_picker` hides `Image`; once host registers picker,
    // cancelling writes ZERO blocks and delivering real PNG inserts SHA-256 content-addressed Image!
    let pre_picker_snap = session.frame();
    assert!(
        !pre_picker_snap
            .elements
            .contains_key("overlay.keyboard_toolbar.image"),
        "native PlaygroundView without a registered image picker must hide Image button"
    );

    let picker_calls = Rc::new(Cell::new(0usize));
    let picker_calls_cb = picker_calls.clone();
    session.app.update(|cx| {
        session
            .window
            .update(cx, |v, _, cx| {
                v.set_image_picker(Some(Rc::new(move || {
                    picker_calls_cb.set(picker_calls_cb.get() + 1);
                })));
                cx.notify();
            })
            .unwrap();
    });
    let top_snap = session.frame();
    session.click_id(&top_snap, "overlay.keyboard_toolbar.image");
    assert_eq!(picker_calls.get(), 1);
    assert_eq!(
        session.block_count("showcase-note"),
        base_count,
        "cancelling/unfulfilled image picker must write zero placeholder blocks"
    );

    let png_bytes = encode_test_png(16, 10);
    session.overlay(OverlayEvent::InsertImageBytes {
        bytes: png_bytes,
        caption: "Picked photo".into(),
    });
    assert_eq!(session.block_count("showcase-note"), base_count + 1);
    let inserted_img = session.view(|v| {
        v.page_snapshot()
            .and_then(|s| s.block("showcase-note").cloned())
            .and_then(|note| {
                note.children
                    .into_iter()
                    .find_map(|child| match child.content {
                        BlockContent::Image {
                            source_id,
                            caption,
                            width,
                            height,
                        } if caption == "Picked photo" => {
                            let ready =
                                matches!(v.images.get(&source_id), Some(ImageSlot::Ready(_)));
                            Some((source_id, width, height, ready))
                        }
                        _ => None,
                    })
            })
    });
    let (src_id, img_w, img_h, is_ready) = inserted_img.expect("inserted picked image block");
    assert_eq!(
        super::actions::sha256_base64url(b""),
        "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU=",
        "empty SHA-256 base64url test vector must match BlockSuite 0.27.5 sha()"
    );
    assert_eq!(
        src_id.len(),
        44,
        "source_id must be 44-char padded base64url SHA-256 matching 0.27.5 sha()"
    );
    assert!(
        src_id.ends_with('=')
            && src_id[..43]
                .bytes()
                .all(|b| { b.is_ascii_alphanumeric() || b == b'-' || b == b'_' }),
        "source_id must be base64url SHA-256: {src_id}"
    );
    assert_eq!((img_w, img_h), (Some(16.0), Some(10.0)));
    assert!(
        is_ready,
        "picked image blob must decode to ImageSlot::Ready"
    );
    session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Undo));
    assert_eq!(session.block_count("showcase-note"), base_count);

    // 3. Visible `Bookmark` button in `More` panel: Escape & Cancel write ZERO blocks; Apply inserts Bookmark!
    session.overlay(OverlayEvent::KeyboardToolbar(
        KeyboardToolbarAction::ToggleMorePanel,
    ));
    let cm_snap = scroll_more_panel(-240.0);
    session.click_id(
        &cm_snap,
        "overlay.keyboard_toolbar.panel.content_media.bookmark",
    );
    let bm_snap = session.frame();
    assert!(audit_frame_snapshot(&bm_snap).is_empty());
    assert!(bm_snap.elements.contains_key("overlay.bookmark_prompt"));
    assert_eq!(
        session.block_count("showcase-note"),
        base_count,
        "opening bookmark prompt must not pre-insert a placeholder bookmark"
    );
    session.key("escape");
    assert_eq!(
        session.block_count("showcase-note"),
        base_count,
        "cancelling bookmark prompt with Escape must leave document unchanged"
    );

    session.overlay(OverlayEvent::KeyboardToolbar(
        KeyboardToolbarAction::Bookmark,
    ));
    let bm_cancel_snap = session.frame();
    session.type_into_field("https://ignored-on-cancel.example");
    session.click_id(&bm_cancel_snap, "overlay.bookmark_prompt.cancel");
    assert_eq!(
        session.block_count("showcase-note"),
        base_count,
        "clicking Cancel on bookmark prompt must write zero blocks"
    );

    session.overlay(OverlayEvent::KeyboardToolbar(
        KeyboardToolbarAction::Bookmark,
    ));
    let _ = session.frame();
    session.type_into_field("/relative-only-path");
    let bm_rel = session.frame();
    session.click_id(&bm_rel, "overlay.bookmark_prompt.apply");
    assert_eq!(
        session.block_count("showcase-note"),
        base_count,
        "relative path in BookmarkPrompt must be rejected without writing a bookmark block"
    );

    session.overlay(OverlayEvent::KeyboardToolbar(
        KeyboardToolbarAction::Bookmark,
    ));
    let _ = session.frame();
    session.type_into_field("docs.affine.pro/mobile");
    let bm_typed = session.frame();
    session.click_id(&bm_typed, "overlay.bookmark_prompt.apply");
    assert_eq!(session.block_count("showcase-note"), base_count + 1);
    let bookmark_url = session.view(|v| {
        v.page_snapshot()
            .and_then(|s| s.block("showcase-note").cloned())
            .and_then(|note| {
                note.children
                    .into_iter()
                    .find_map(|child| match child.content {
                        BlockContent::Bookmark { url, .. } => Some(url),
                        _ => None,
                    })
            })
    });
    assert_eq!(
        bookmark_url.as_deref(),
        Some("https://docs.affine.pro/mobile")
    );
    session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Undo));
    assert_eq!(session.block_count("showcase-note"), base_count);

    // 4. Table, Callout, EquationBlock, Divider, Toggle each insert & undo in 1 step.
    for action in [
        KeyboardToolbarAction::Table,
        KeyboardToolbarAction::Callout,
        KeyboardToolbarAction::EquationBlock,
        KeyboardToolbarAction::Slash(SlashCommand::Divider),
        KeyboardToolbarAction::Slash(SlashCommand::List(ListType::Toggle)),
    ] {
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "ops-p1", 0,
        ))));
        session.overlay(OverlayEvent::KeyboardToolbar(action));
        session.overlay(OverlayEvent::CloseEquationEditor);
        session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Undo));
    }

    // 5. Table-cell focus gate disables non-Undo/Redo/Dismiss buttons and collapses open panels.
    session.edit(|page| {
        page.add_block(
            "gate-tbl",
            BlockSpec::Table {
                rows: vec![vec!["A".into(), "B".into()]],
            },
            Some("showcase-note"),
            Some(0),
            6_000_100,
        )
        .expect("add table");
    });
    session.overlay(OverlayEvent::KeyboardToolbar(
        KeyboardToolbarAction::ToggleMorePanel,
    ));
    assert_eq!(
        session.view(|v| v.overlays().keyboard_toolbar_active_panel()),
        Some(KeyboardToolbarPanel::More)
    );
    session.overlay(OverlayEvent::FocusTableCell {
        block_id: "gate-tbl".into(),
        row_id: "row-0".into(),
        column_id: "col-0".into(),
        screen_pos: None,
    });
    session.platform.advance_clock(Duration::from_millis(160));
    let gated = session.frame();
    assert!(audit_frame_snapshot(&gated).is_empty());
    assert_eq!(
        session.view(|v| v.overlays().keyboard_toolbar_active_panel()),
        None
    );
    assert_eq!(
        gated
            .elements
            .get("overlay.keyboard_toolbar")
            .map(|e| e.bounds.height),
        Some(KEYBOARD_TOOLBAR_HEIGHT)
    );
}
