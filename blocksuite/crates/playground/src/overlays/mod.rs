//! PlaygroundView glue for `blocksuite_editor::overlays`.

mod view;
mod view_context_menu;
mod view_edits;
mod view_linked_doc;
mod view_mobile;
mod view_scrollbar;
mod view_table_cell;

pub use blocksuite_editor::overlays::*;
pub(crate) use view_context_menu::ContextTargetSnapshot;
pub(crate) use view_table_cell::InlineTargetEnd;

impl OverlayHost for crate::PlaygroundView {
    fn dispatch_overlay(
        &mut self,
        event: OverlayEvent,
        window: &mut ui::Window,
        cx: &mut ui::Context<Self>,
    ) {
        crate::PlaygroundView::dispatch_overlay(self, event, window, cx);
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use blocksuite_playground_doc::{
        read::{BlockContent, BlockNode, RichText, TextAlign as BlockAlign},
        schema::{BlockSpec, ListType, ParagraphType},
    };
    use ui::{
        ClipboardItem, KeyDownEvent, Keystroke, MouseButton, MouseDownEvent, MouseMoveEvent,
        MouseUpEvent, ScrollEvent, Window, point, prelude::*, px, size,
    };
    use y_octo::{Any, SessionValue, TextDeltaOp, TextInsert};

    use super::*;
    use crate::{
        HOME_PAGE_ID, PlaygroundOptions, PlaygroundTheme, TOPBAR_HEIGHT,
        block_flow::{FlowRect, page_geometry},
        register_bundled_fonts,
    };
    use crate::{
        PlaygroundView,
        editor_session::{DocPoint, DocumentSelection},
    };
    use blocksuite_playground_doc::session::PageDocSession;
    use std::{cell::RefCell, rc::Rc};
    use ui::{
        Application, ApplicationHandle, Bounds, EntityInputHandler, FrameSnapshot,
        HeadlessPlatform, HeadlessWindow, Modifiers, PlatformInput, ScrollDelta, ScrollSource,
        SnapshotRect, TouchPhase, WindowBounds, WindowHandle, WindowOptions, audit_frame_snapshot,
    };

    struct Session {
        platform: Rc<HeadlessPlatform>,
        app: ApplicationHandle,
        window: WindowHandle<PlaygroundView>,
        headless: HeadlessWindow,
    }

    fn open(width: u32, height: u32, theme: PlaygroundTheme) -> Session {
        let platform = HeadlessPlatform::new(width, height, 1.0);
        let handle_cell: Rc<RefCell<Option<WindowHandle<PlaygroundView>>>> =
            Rc::new(RefCell::new(None));
        let handle_out = handle_cell.clone();
        let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
            register_bundled_fonts(cx).expect("register bundled fonts");
            let options = PlaygroundOptions {
                theme,
                ..PlaygroundOptions::default()
            };
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
        let session = Session {
            platform,
            app,
            window,
            headless,
        };
        // The first frame lays the page out and hands the view the keyboard focus.
        session.frame();
        session.platform.run_until_parked();
        session
    }

    impl Session {
        fn frame(&self) -> FrameSnapshot {
            self.headless.request_frame();
            self.app.update(|cx| {
                self.window
                    .update(cx, |_, window, _| window.frame_snapshot().clone())
                    .expect("read frame")
            })
        }

        fn view<R>(
            &self,
            f: impl FnOnce(&mut PlaygroundView, &mut Context<PlaygroundView>) -> R,
        ) -> R {
            self.app.update(|cx| {
                self.window
                    .update(cx, |view, _, cx| f(view, cx))
                    .expect("update view")
            })
        }

        fn update<R>(
            &self,
            f: impl FnOnce(&mut PlaygroundView, &mut Window, &mut Context<PlaygroundView>) -> R,
        ) -> R {
            self.app
                .update(|cx| self.window.update(cx, f).expect("update view"))
        }

        fn overlay(&self, event: OverlayEvent) {
            self.update(|view, window, cx| view.dispatch_overlay(event, window, cx));
        }

        /// Type text into the document through the platform input handler.
        fn insert(&self, text: &str) {
            for ch in text.chars() {
                self.update(|view, window, cx| {
                    view.replace_text_in_range(None, &ch.to_string(), window, cx);
                });
            }
            self.frame();
        }

        /// The platform's undo shortcut.
        fn undo(&self) {
            self.keystroke(Keystroke {
                modifiers: Modifiers {
                    platform: true,
                    control: true,
                    ..Modifiers::default()
                },
                key: "z".to_string(),
                key_char: None,
            });
            self.frame();
        }

        /// The editor's selection as `(anchor block, anchor, focus block, focus)`.
        fn selection(&self) -> Option<(String, u64, String, u64)> {
            self.view(|view, _| {
                view.document_selection().map(|selection| {
                    (
                        selection.anchor.block_id.clone(),
                        selection.anchor.offset(),
                        selection.focus.block_id.clone(),
                        selection.focus.offset(),
                    )
                })
            })
        }

        fn caret(&self) -> Option<(String, u64)> {
            self.selection()
                .filter(|(anchor, from, focus, to)| anchor == focus && from == to)
                .map(|(block, offset, _, _)| (block, offset))
        }

        /// Let every overlay transition finish, and return the frame after it.
        fn settle(&self) -> FrameSnapshot {
            self.frame();
            self.platform.run_until_parked();
            self.platform.advance_clock(Duration::from_millis(200));
            self.platform.run_until_parked();
            self.frame()
        }

        fn click(&self, snapshot: &FrameSnapshot, id: &str) {
            let bounds = element(snapshot, id).bounds;
            self.headless.simulate_click(point(
                px(bounds.x + bounds.width * 0.5),
                px(bounds.y + bounds.height * 0.5),
            ));
            self.platform.run_until_parked();
        }

        fn keystroke(&self, keystroke: Keystroke) {
            self.frame();
            self.platform.run_until_parked();
            self.headless
                .dispatch_input(PlatformInput::KeyDown(KeyDownEvent {
                    keystroke,
                    is_held: false,
                    prefer_character_input: false,
                }));
            self.platform.run_until_parked();
        }

        /// Press a named key (`enter`, `up`) or type a single character.
        fn key(&self, key: &str) {
            self.keystroke(Keystroke {
                modifiers: Modifiers::default(),
                key: key.to_string(),
                key_char: (key.chars().count() == 1).then(|| key.to_string()),
            });
        }

        /// Type text the way a keyboard does: each key goes to the key handlers first
        /// and, when none of them takes it, to the input handler as text.
        fn type_text(&self, text: &str) {
            for ch in text.chars() {
                self.frame();
                self.platform.run_until_parked();
                let keystroke = Keystroke {
                    modifiers: Modifiers::default(),
                    key: ch.to_string(),
                    key_char: Some(ch.to_string()),
                };
                self.app.update(|cx| {
                    ui::AnyWindowHandle::from(self.window)
                        .update(cx, |_, window, cx| window.dispatch_keystroke(keystroke, cx))
                        .expect("dispatch keystroke")
                });
                self.platform.run_until_parked();
            }
        }

        /// A key with the platform's command modifier.
        fn command(&self, key: &str) {
            self.keystroke(Keystroke {
                modifiers: Modifiers {
                    platform: true,
                    control: true,
                    ..Modifiers::default()
                },
                key: key.to_string(),
                key_char: None,
            });
        }

        /// A key with `Shift` held.
        fn shift(&self, key: &str) {
            self.keystroke(Keystroke {
                modifiers: Modifiers {
                    shift: true,
                    ..Modifiers::default()
                },
                key: key.to_string(),
                key_char: None,
            });
        }

        /// A second editor of the same page, holding everything this one has.
        fn peer(&self) -> PageDocSession {
            let mut peer = PageDocSession::new(HOME_PAGE_ID, 4242).expect("peer");
            self.send_to(&mut peer);
            peer
        }

        /// Bring `peer` up to date with this editor.
        fn send_to(&self, peer: &mut PageDocSession) {
            let update = self.view(|view, _| {
                view.document()
                    .workspace
                    .page(HOME_PAGE_ID)
                    .expect("page")
                    .encode_update_v1()
                    .expect("update")
            });
            peer.apply_remote_update_v1(&update).expect("peer applies");
        }

        /// Apply a peer's update the way the room hands it in.
        fn receive(&self, update: &[u8]) {
            self.view(|view, cx| {
                view.edit_document(cx, |state| {
                    state
                        .workspace
                        .page_mut(HOME_PAGE_ID)
                        .expect("page")
                        .apply_remote_update_v1(update)
                        .expect("apply remote update");
                });
            });
            self.frame();
        }

        /// State vector of the page: equal before and after means nothing was written.
        fn written(&self) -> Vec<u8> {
            self.view(|view, _| {
                view.document()
                    .workspace
                    .page(HOME_PAGE_ID)
                    .expect("page")
                    .encode_state_vector_v1()
                    .expect("state vector")
            })
        }

        /// What the platform's text input reads: the text, the selection and the range
        /// of a running composition.
        fn input(
            &self,
        ) -> (
            String,
            std::ops::Range<usize>,
            Option<std::ops::Range<usize>>,
        ) {
            self.update(|view, window, cx| {
                let mut covered = None;
                let text = view
                    .text_for_range(0..10_000, &mut covered, window, cx)
                    .expect("input text");
                let selection = view
                    .selected_text_range(false, window, cx)
                    .expect("input selection");
                (text, selection.range, view.marked_text_range(window, cx))
            })
        }

        fn compose(&self, text: &str) {
            self.update(|view, window, cx| {
                view.replace_and_mark_text_in_range(None, text, None, window, cx);
            });
        }

        fn pointer(&self, x: f32, y: f32, pressed: bool) {
            self.headless
                .dispatch_input(PlatformInput::MouseMove(MouseMoveEvent {
                    position: point(px(x), px(y)),
                    pressed_button: pressed.then_some(MouseButton::Left),
                    modifiers: Modifiers::default(),
                }));
            self.platform.run_until_parked();
        }

        fn press(&self, x: f32, y: f32, click_count: usize) {
            self.pointer(x, y, false);
            self.headless
                .dispatch_input(PlatformInput::MouseDown(MouseDownEvent {
                    button: MouseButton::Left,
                    position: point(px(x), px(y)),
                    modifiers: Modifiers::default(),
                    click_count,
                    first_mouse: false,
                }));
            self.platform.run_until_parked();
        }

        fn release(&self, x: f32, y: f32) {
            self.headless
                .dispatch_input(PlatformInput::MouseUp(MouseUpEvent {
                    button: MouseButton::Left,
                    position: point(px(x), px(y)),
                    modifiers: Modifiers::default(),
                    click_count: 1,
                }));
            self.platform.run_until_parked();
        }

        fn scroll(&self, x: f32, y: f32, delta_x: f32, delta_y: f32) {
            self.pointer(x, y, false);
            self.headless
                .dispatch_input(PlatformInput::Scroll(ScrollEvent {
                    position: point(px(x), px(y)),
                    delta: ScrollDelta::Pixels(point(px(delta_x), px(delta_y))),
                    modifiers: Modifiers::default(),
                    touch_phase: TouchPhase::Moved,
                    source: ScrollSource::Pointer,
                }));
            self.platform.run_until_parked();
        }

        fn node(&self, block_id: &str) -> Option<BlockNode> {
            self.view(|view, _| {
                view.page_snapshot()
                    .and_then(|snapshot| snapshot.block(block_id))
                    .cloned()
            })
        }

        fn children(&self, parent_id: &str) -> Vec<String> {
            self.node(parent_id)
                .map(|node| node.children.into_iter().map(|child| child.id).collect())
                .unwrap_or_default()
        }

        fn text(&self, block_id: &str) -> RichText {
            self.node(block_id)
                .and_then(|node| block_text(&node).cloned())
                .unwrap_or_else(|| panic!("{block_id} has no text"))
        }

        /// Select the first occurrence of `needle` in a block; returns the UTF-16 range.
        fn select(&self, block_id: &str, needle: &str) -> (usize, usize) {
            let plain = self.text(block_id).plain;
            let at = plain.find(needle).expect("needle in block text");
            let start = plain[..at].encode_utf16().count();
            let end = start + needle.encode_utf16().count();
            self.overlay(OverlayEvent::SetSelection(Some(ActiveSelection {
                block_id: block_id.to_string(),
                start_utf16: start,
                end_utf16: end,
            })));
            (start, end)
        }

        fn edit(&self, edit: impl FnOnce(&mut PageDocSession)) {
            self.view(|view, cx| {
                view.edit_document(cx, |state| {
                    edit(
                        state
                            .workspace
                            .page_mut(HOME_PAGE_ID)
                            .expect("showcase page"),
                    );
                });
            });
            self.frame();
        }

        fn open_slash(&self, block_id: &str) -> FrameSnapshot {
            self.overlay(OverlayEvent::OpenSlashMenu {
                block_id: block_id.to_string(),
                utf16_offset: 0,
                anchor: None,
            });
            self.settle()
        }

        fn slash_query(&self) -> Option<String> {
            self.view(|view, _| view.overlays().slash_menu().map(|menu| menu.query.clone()))
        }
    }

    fn element<'a>(snapshot: &'a FrameSnapshot, id: &str) -> &'a ui::DebugElementSnapshot {
        snapshot
            .elements
            .get(id)
            .unwrap_or_else(|| panic!("{id} is not in the frame"))
    }

    fn center(rect: SnapshotRect) -> (f32, f32) {
        (rect.x + rect.width * 0.5, rect.y + rect.height * 0.5)
    }

    fn assert_no_violations(snapshot: &FrameSnapshot, context: &str) {
        let violations = audit_frame_snapshot(snapshot);
        assert!(violations.is_empty(), "{context}: {violations:#?}");
    }

    fn empty_paragraph(session: &Session, id: &str, index: u64) {
        session.edit(|page| {
            page.add_block(
                id,
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: String::new(),
                },
                Some("showcase-note"),
                Some(index),
                2_000_000,
            )
            .expect("add empty paragraph");
        });
    }

    #[test]
    fn popovers_flip_at_the_top_bar_and_the_bottom_edge_and_stay_inside_the_window() {
        let viewport = FlowRect::new(0.0, TOPBAR_HEIGHT, 1280.0, 800.0 - TOPBAR_HEIGHT);
        let place = |anchor: FlowRect, size: (f32, f32), preferred: Placement| {
            place_popover(anchor, size, viewport, preferred, 8.0, 8.0)
        };

        // Room on the preferred side: above and centered, below and left-aligned.
        let above = place(
            FlowRect::new(600.0, 400.0, 80.0, 24.0),
            (280.0, 36.0),
            Placement::Above,
        );
        assert_eq!(above.side, PopoverSide::Above);
        assert!(!above.flipped);
        assert_eq!(above.rect, FlowRect::new(500.0, 356.0, 280.0, 36.0));
        let below = place(
            FlowRect::new(300.0, 200.0, 1.0, 24.0),
            (280.0, 390.0),
            Placement::BelowStart,
        );
        assert_eq!(below.side, PopoverSide::Below);
        assert!(!below.flipped);
        assert_eq!(below.rect, FlowRect::new(300.0, 232.0, 280.0, 390.0));

        // Too close to the top bar: the toolbar flips below the selection's last line.
        let flipped = place(
            FlowRect::new(600.0, 70.0, 80.0, 48.0),
            (280.0, 36.0),
            Placement::Above,
        );
        assert_eq!(flipped.side, PopoverSide::Below);
        assert!(flipped.flipped);
        assert_eq!(flipped.rect.y, 70.0 + 48.0 + 8.0);
        // One pixel of room above the margin is enough to stay.
        let stays = place(
            FlowRect::new(600.0, TOPBAR_HEIGHT + 8.0 + 36.0 + 8.0, 80.0, 24.0),
            (280.0, 36.0),
            Placement::Above,
        );
        assert_eq!(stays.side, PopoverSide::Above);
        assert_eq!(stays.rect.y, TOPBAR_HEIGHT + 8.0);

        // Too close to the bottom edge: the menu flips above its caret.
        let flipped = place(
            FlowRect::new(300.0, 700.0, 1.0, 24.0),
            (280.0, 390.0),
            Placement::BelowStart,
        );
        assert_eq!(flipped.side, PopoverSide::Above);
        assert!(flipped.flipped);
        assert_eq!(flipped.rect.bottom(), 700.0 - 8.0);
        assert_eq!(flipped.rect.x, 300.0);

        // Horizontal clamping at both edges.
        let left = place(
            FlowRect::new(4.0, 400.0, 20.0, 24.0),
            (280.0, 36.0),
            Placement::Above,
        );
        assert_eq!(left.rect.x, 8.0);
        let right = place(
            FlowRect::new(1200.0, 400.0, 1.0, 24.0),
            (280.0, 100.0),
            Placement::BelowStart,
        );
        assert_eq!(right.rect.right(), 1280.0 - 8.0);

        // No room on either side: the roomier side, held inside the viewport.
        let squeezed = place(
            FlowRect::new(300.0, 300.0, 1.0, 24.0),
            (280.0, 600.0),
            Placement::BelowStart,
        );
        assert_eq!(squeezed.side, PopoverSide::Below);
        assert!(squeezed.rect.y >= TOPBAR_HEIGHT + 8.0);
        assert!(squeezed.rect.bottom() <= 800.0 - 8.0);

        // Fractional anchors land on the pixel grid.
        let snapped = place(
            FlowRect::new(301.3, 199.6, 0.7, 24.2),
            (280.0, 100.0),
            Placement::BelowStart,
        );
        assert_eq!(snapped.rect.x.fract(), 0.0);
        assert_eq!(snapped.rect.y.fract(), 0.0);

        // A narrow window keeps the popover inside its margins.
        let narrow = place_popover(
            FlowRect::new(200.0, 400.0, 60.0, 24.0),
            (287.0, 36.0),
            FlowRect::new(0.0, TOPBAR_HEIGHT, 320.0, 800.0 - TOPBAR_HEIGHT),
            Placement::Above,
            8.0,
            8.0,
        );
        assert_eq!(narrow.rect.x, 320.0 - 8.0 - 287.0);
        assert!(narrow.rect.x >= 8.0);
    }

    #[test]
    fn transitions_ease_out_and_end_exactly_on_their_target() {
        assert_eq!(ease_out_cubic(0.0), 0.0);
        assert_eq!(ease_out_cubic(1.0), 1.0);
        assert!(ease_out_cubic(0.5) > 0.5);
        let motion = EaseOut::new(0.3, 1.0, 100.0);
        assert_eq!(motion.value_at(100.0), 0.3);
        assert_eq!(motion.value_at(100.0 + OVERLAY_MOTION_MS), 1.0);
        assert_eq!(motion.value_at(10_000.0), 1.0);
        for fps in [60.0, 120.0, 24.0, 7.0] {
            let dt = 1000.0 / fps;
            let (mut now, mut last) = (100.0, motion.value_at(100.0));
            while now < 100.0 + OVERLAY_MOTION_MS {
                now += dt;
                let next = motion.value_at(now);
                assert!(next >= last);
                last = next;
            }
            assert_eq!(last, 1.0);
        }

        // A popover reopened mid fade-out carries on from where the fade got to.
        let mut presence = Presence::opening(0.0);
        assert_eq!(presence.progress(0.0), 0.0);
        assert_eq!(presence.progress(150.0), 1.0);
        presence.close(200.0);
        assert!(presence.progress(250.0) < 1.0 && presence.progress(250.0) > 0.0);
        assert!(!presence.gone(250.0));
        let reopened = presence.reopened(250.0);
        assert_eq!(reopened.progress(250.0), presence.progress(250.0));
        assert_eq!(reopened.progress(400.0), 1.0);
        assert!(presence.gone(350.0));
    }

    #[test]
    fn slash_items_filter_by_title_and_keyword_and_group_without_dangling_headers() {
        let ids = |query: &str| -> Vec<&str> {
            filter_slash_items(query)
                .into_iter()
                .map(|item| item.id)
                .collect()
        };
        assert_eq!(ids("").len(), SLASH_ITEMS.len());
        assert_eq!(ids("h1"), ["h1"]);
        assert_eq!(ids("todo"), ["todo"]);
        assert_eq!(ids("code"), ["code"]);
        assert_eq!(ids("quote"), ["quote"]);
        assert_eq!(ids("div"), ["divider"]);
        assert_eq!(ids("linked"), ["linked_doc"]);
        assert_eq!(ids("newdoc"), ["new_doc"]);
        assert_eq!(ids("tdl"), ["todo", "bulleted"]);
        assert_eq!(ids("do")[0], "new_doc");
        assert_eq!(ids("h")[0], "h1");
        assert_eq!(ids("HEADING"), ["h1", "h2", "h3", "h4", "h5", "h6"]);
        assert_eq!(ids("heading 3"), ["h3"]);
        assert_eq!(ids("list"), ["todo", "toggle", "bulleted", "numbered"]);
        assert!(ids("zzz").is_empty());
        // Every generated icon exists.
        for item in &SLASH_ITEMS {
            assert!(
                crate::theme::icon_by_name(item.icon).is_some(),
                "{}",
                item.icon
            );
        }

        // Each group is headed once, a header is always followed by an item, and the list
        // neither starts nor ends on a gap.
        let (rows, height) = slash_rows(&filter_slash_items(""));
        let headers: Vec<&str> = rows
            .iter()
            .filter_map(|(row, _, _)| match row {
                SlashRow::Header(group) => Some(*group),
                _ => None,
            })
            .collect();
        assert_eq!(headers, ["Basic", "List"]);
        // BlockSuite's order: text, the headings, code, quote, divider, new doc, linked doc, then the lists.
        assert_eq!(
            ids(""),
            [
                "text",
                "h1",
                "h2",
                "h3",
                "h4",
                "h5",
                "h6",
                "code",
                "quote",
                "divider",
                "new_doc",
                "linked_doc",
                "bulleted",
                "numbered",
                "todo",
                "toggle"
            ]
        );
        assert_eq!(rows.first().map(|(_, y, _)| *y), Some(0.0));
        assert!(matches!(rows.last(), Some((SlashRow::Item(15), _, _))));
        let (_, last_y, last_height) = rows[rows.len() - 1];
        assert_eq!(last_y + last_height, height);
        for pair in rows.windows(2) {
            if let (SlashRow::Header(_), _, _) = pair[0] {
                assert!(matches!(pair[1].0, SlashRow::Item(_)));
            }
        }
        // Without results the list keeps one row.
        let (rows, height) = slash_rows(&[]);
        assert_eq!(rows, [(SlashRow::Empty, 0.0, SLASH_ITEM_HEIGHT)]);
        assert_eq!(height, SLASH_ITEM_HEIGHT);

        // Filtered queries hide group headers while keeping every matching item.
        let filtered_items = filter_slash_items("tdo");
        let (filtered_rows, filtered_height) = slash_rows_for_query(&filtered_items, "tdo");
        assert!(
            filtered_rows
                .iter()
                .all(|(row, _, _)| !matches!(row, SlashRow::Header(_))),
            "filtered slash rows must omit group headers"
        );
        assert_eq!(
            filtered_height,
            filtered_items.len() as f32 * SLASH_ITEM_HEIGHT
        );
        for item in &SLASH_ITEMS {
            assert!(
                !item.description.is_empty(),
                "slash item {} must have a description",
                item.id
            );
        }
    }

    #[test]
    fn marks_urls_and_drop_slots_follow_their_rules() {
        let insert = |text: &str, marks: &[(&str, Any)]| TextDeltaOp::Insert {
            insert: TextInsert::Text(text.to_string()),
            format: (!marks.is_empty()).then(|| {
                marks
                    .iter()
                    .map(|(key, value)| (key.to_string(), value.clone()))
                    .collect()
            }),
        };
        let link = Any::String("https://affine.pro".to_string());
        let text = RichText {
            plain: "plain bold both link".to_string(),
            delta: vec![
                insert("plain ", &[]),
                insert("bold ", &[("bold", Any::True)]),
                insert("both ", &[("bold", Any::True), ("italic", Any::True)]),
                insert("link", &[("link", link)]),
            ],
        };
        assert_eq!(marks_in_range(&text, 0, 5), MarkState::default());
        assert!(marks_in_range(&text, 6, 10).bold);
        // A mark counts only when the whole range carries it.
        assert!(!marks_in_range(&text, 3, 10).bold);
        let both = marks_in_range(&text, 6, 15);
        assert!(both.bold && !both.italic);
        assert!(marks_in_range(&text, 11, 15).italic);
        assert_eq!(
            marks_in_range(&text, 16, 20).link.as_deref(),
            Some("https://affine.pro")
        );
        assert_eq!(marks_in_range(&text, 12, 20).link, None);
        assert_eq!(marks_in_range(&text, 4, 4), MarkState::default());

        assert_eq!(normalize_url(" affine.pro "), "https://affine.pro");
        assert_eq!(normalize_url("http://a.b"), "http://a.b");
        assert_eq!(normalize_url("mailto:a@b.c"), "mailto:a@b.c");
        assert_eq!(normalize_url(""), "");
        assert_eq!(normalize_url("javascript://foo"), "");
        assert_eq!(normalize_url("javascript:alert(1)"), "");
        assert_eq!(normalize_url("vbscript:msgbox(1)"), "");
        assert_eq!(
            normalize_url("data:text/html,<script>alert(1)</script>"),
            ""
        );

        let slot = |insert_index: usize| DropSlot {
            parent_id: "note".to_string(),
            insert_index,
            old_index: 2,
            indicator_world_y: 0.0,
            indicator_world_x: 0.0,
            indicator_world_width: 0.0,
        };
        // Dropping right before or right after itself moves nothing.
        assert_eq!(slot(2).reorder_index(), None);
        assert_eq!(slot(3).reorder_index(), None);
        assert_eq!(slot(0).reorder_index(), Some(0));
        // Moving down, the index counts the block as already removed.
        assert_eq!(slot(5).reorder_index(), Some(4));
    }

    #[test]
    fn slash_menu_filters_navigates_and_converts_blocks() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        empty_paragraph(&session, "t-empty", 2);

        session.overlay(OverlayEvent::OpenSlashMenu {
            block_id: "t-empty".to_string(),
            utf16_offset: 0,
            anchor: None,
        });
        // Opening mounts on its first frame with live hitboxes and minimal non-zero opacity.
        let first = session.frame();
        let first_menu = element(&first, "overlay.slash_menu");
        assert!(first_menu.opacity > 0.0 && first_menu.opacity <= 0.02);
        assert!(first_menu.interactive);
        let opened = session.settle();
        assert_no_violations(&opened, "slash menu");
        let menu = element(&opened, "overlay.slash_menu");
        assert_eq!(menu.opacity, 1.0);
        assert!(menu.interactive);
        assert_eq!((menu.corner_radius, menu.padding), (8.0, 4.0));
        let block = element(&opened, "page.block.t-empty").bounds;
        // Below the caret of the empty paragraph, starting at its left edge.
        assert_eq!(menu.bounds.x, block.x);
        assert_eq!(menu.bounds.y, block.bottom() + POPOVER_GAP);
        assert_eq!(menu.bounds.width, SLASH_MENU_WIDTH);
        // The query row, the capped list, and the padding around them; no border.
        assert_eq!(menu.bounds.height, 28.0 + SLASH_LIST_MAX_HEIGHT + 8.0);
        let first_item = element(&opened, "overlay.slash_menu.item.text");
        assert!(first_item.focused && first_item.interactive);
        // Rows sit flush inside the padding and round concentrically with the menu.
        assert_eq!(first_item.bounds.x, menu.bounds.x + 4.0);
        assert_eq!(first_item.corner_radius, 4.0);
        assert_eq!(first_item.bounds.height, SLASH_ITEM_HEIGHT);
        assert_eq!(
            element(&opened, "overlay.slash_menu.group.basic").bounds.y,
            element(&opened, "overlay.slash_menu.query").bounds.bottom()
        );

        // Up wraps to the last item and scrolls it into view; Down wraps back.
        session.key("up");
        let wrapped = session.frame();
        assert_no_violations(&wrapped, "slash menu scrolled");
        assert!(element(&wrapped, "overlay.slash_menu.item.toggle").focused);
        assert!(
            !wrapped
                .elements
                .contains_key("overlay.slash_menu.item.text")
        );
        let menu_bounds = element(&wrapped, "overlay.slash_menu").bounds;
        assert!(
            element(&wrapped, "overlay.slash_menu.item.toggle")
                .bounds
                .bottom()
                <= menu_bounds.bottom()
        );
        session.key("down");
        assert!(element(&session.frame(), "overlay.slash_menu.item.text").focused);
        session.key("down");
        let second = session.frame();
        assert!(element(&second, "overlay.slash_menu.item.h1").focused);
        assert!(!element(&second, "overlay.slash_menu.item.text").focused);

        // A menu opened on its own keeps its filter to itself: typing filters, Backspace
        // widens, and the document is left alone.
        session.type_text("h2");
        assert_eq!(session.slash_query().as_deref(), Some("h2"));
        assert_eq!(session.text("t-empty").plain, "");
        let filtered = session.frame();
        assert_no_violations(&filtered, "slash menu filtered");
        assert!(element(&filtered, "overlay.slash_menu.item.h2").focused);
        assert!(!filtered.elements.contains_key("overlay.slash_menu.item.h1"));
        assert!(
            !filtered
                .elements
                .contains_key("overlay.slash_menu.group.basic")
        );
        assert_eq!(
            element(&filtered, "overlay.slash_menu.query")
                .text
                .as_deref(),
            Some("h2")
        );
        session.key("backspace");
        let widened = session.frame();
        for id in ["h1", "h2", "h3", "h4", "h5", "h6"] {
            element(&widened, &format!("overlay.slash_menu.item.{id}"));
        }
        assert!(
            !widened
                .elements
                .contains_key("overlay.slash_menu.item.text")
        );

        // Enter turns the empty paragraph into the heading in place and closes the menu.
        session.type_text("2");
        session.key("enter");
        assert!(matches!(
            session.node("t-empty").map(|node| node.content),
            Some(BlockContent::Paragraph {
                kind: ParagraphType::H2,
                ..
            })
        ));
        assert_eq!(session.children("showcase-note")[2], "t-empty");
        assert_eq!(session.slash_query(), None);
        let closed = session.settle();
        assert!(!closed.elements.contains_key("overlay.slash_menu"));
        assert_no_violations(&closed, "slash menu closed");
        // The caret sits in the converted block.
        assert_eq!(session.caret(), Some(("t-empty".to_string(), 0)));
        element(&closed, "page.local_caret");
        let count = session.children("showcase-note").len();

        // A block with text is converted as well and keeps its text; across flavours it
        // becomes a fresh block in the same place.
        let quote_index = session
            .children("showcase-note")
            .iter()
            .position(|id| id == "showcase-quote")
            .expect("quote");
        let quote_text = session.text("showcase-quote").plain;
        session.open_slash("showcase-quote");
        session.type_text("todo");
        let filtered = session.frame();
        session.click(&filtered, "overlay.slash_menu.item.todo");
        let children = session.children("showcase-note");
        assert_eq!(children.len(), count);
        let converted = children[quote_index].clone();
        assert_ne!(converted, "showcase-quote");
        assert!(session.node("showcase-quote").is_none());
        assert!(matches!(
            session.node(&converted).map(|node| node.content),
            Some(BlockContent::List {
                kind: ListType::Todo,
                checked: false,
                ..
            })
        ));
        assert_eq!(session.text(&converted).plain, quote_text);
        assert_eq!(session.slash_query(), None);
        assert_eq!(session.caret(), Some((converted.clone(), 0)));
        // One undo takes the whole command back.
        session.undo();
        assert_eq!(
            session.children("showcase-note")[quote_index],
            "showcase-quote"
        );
        assert!(session.node(&converted).is_none());
        assert_eq!(session.text("showcase-quote").plain, quote_text);

        // No results: one quiet row instead of a collapsed menu. `Tab` and the arrows do
        // nothing, and `Enter` closes the menu without touching the block.
        session.settle();
        session.open_slash("showcase-quote");
        session.type_text("zzz");
        let empty = session.frame();
        assert_no_violations(&empty, "slash menu without results");
        let row = element(&empty, "overlay.slash_menu.empty");
        assert_eq!(row.text.as_deref(), Some("No results"));
        assert_eq!(row.bounds.height, SLASH_ITEM_HEIGHT);
        assert!(element(&empty, "overlay.slash_menu").bounds.height >= SLASH_ITEM_HEIGHT + 28.0);
        let written = session.written();
        session.key("down");
        session.key("tab");
        assert_eq!(session.slash_query().as_deref(), Some("zzz"));
        session.key("enter");
        assert_eq!(session.slash_query(), None);
        assert_eq!(session.written(), written);
        assert_eq!(session.children("showcase-note").len(), count);

        // Backspace on an empty filter and a click outside both dismiss the menu.
        session.settle();
        session.open_slash("showcase-quote");
        session.key("backspace");
        assert_eq!(session.slash_query(), None);
        session.settle();
        let opened = session.open_slash("showcase-quote");
        session.click(&opened, "page.title_block");
        assert_eq!(session.slash_query(), None);
        assert!(!session.settle().elements.contains_key("overlay.slash_menu"));
    }

    #[test]
    fn typing_a_slash_filters_in_the_document_and_runs_as_one_undo_step() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        empty_paragraph(&session, "t-empty", 2);
        let caret_in = |block: &str| {
            session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
                block, 0,
            ))));
            session.frame();
        };
        let heading = |id: &str| {
            matches!(
                session.node(id).map(|node| node.content),
                Some(BlockContent::Paragraph {
                    kind: ParagraphType::H2,
                    ..
                })
            )
        };

        // `/` typed into a paragraph opens the menu on that character; what follows is
        // both document text and the menu's filter, so the menu shows no query row.
        caret_in("t-empty");
        session.insert("/");
        let menu = session
            .view(|view, _| view.overlays().slash_menu().cloned())
            .expect("typed slash menu");
        assert!(menu.query_in_document);
        assert_eq!((menu.block_id.as_str(), menu.utf16_offset), ("t-empty", 0));
        session.insert("h2");
        assert_eq!(session.text("t-empty").plain, "/h2");
        assert_eq!(session.slash_query().as_deref(), Some("h2"));
        let typed = session.settle();
        assert_no_violations(&typed, "typed slash menu");
        assert!(!typed.elements.contains_key("overlay.slash_menu.query"));
        assert!(element(&typed, "overlay.slash_menu.item.h2").focused);
        let caret = element(&typed, "page.local_caret").bounds;
        let menu_bounds = element(&typed, "overlay.slash_menu").bounds;
        assert!(menu_bounds.x <= caret.x && menu_bounds.y >= caret.bottom());

        // Backspace edits the document, and the filter follows.
        session.key("backspace");
        assert_eq!(session.text("t-empty").plain, "/h");
        assert_eq!(session.slash_query().as_deref(), Some("h"));
        session.insert("2");

        // Enter removes the typed text and converts the paragraph in place.
        session.key("enter");
        assert!(heading("t-empty"));
        assert_eq!(session.text("t-empty").plain, "");
        assert_eq!(session.caret(), Some(("t-empty".to_string(), 0)));
        assert_eq!(session.slash_query(), None);
        // One undo restores the typed command in the original paragraph.
        session.undo();
        assert!(!heading("t-empty"));
        assert_eq!(session.text("t-empty").plain, "/h2");
        assert_eq!(session.caret(), Some(("t-empty".to_string(), 3)));
        assert_eq!(session.slash_query(), None);

        // A numbered list replaces the empty paragraph with a fresh block that a peer
        // receives; the following numbered item is renumbered after it.
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection {
            block_id: "t-empty".to_string(),
            start_utf16: 0,
            end_utf16: 3,
        })));
        session.key("backspace");
        assert_eq!(session.text("t-empty").plain, "");
        let numbered_at = session
            .children("showcase-note")
            .iter()
            .position(|id| id == "showcase-numbered-1")
            .expect("numbered item");
        session.edit(|page| {
            page.reparent_block(
                "t-empty",
                "showcase-note",
                "showcase-note",
                numbered_at as u64 - 1,
                2_000_100,
            )
            .expect("move the empty paragraph before the numbered list");
        });
        let slot = session
            .children("showcase-note")
            .iter()
            .position(|id| id == "t-empty")
            .expect("empty paragraph");
        caret_in("t-empty");
        session.insert("/num");
        assert_eq!(session.slash_query().as_deref(), Some("num"));
        session.key("enter");
        assert!(session.node("t-empty").is_none());
        let fresh = session.children("showcase-note")[slot].clone();
        let order = |id: &str| match session.node(id).map(|node| node.content) {
            Some(BlockContent::List {
                kind: ListType::Numbered,
                order,
                ..
            }) => order,
            other => panic!("{id} is not a numbered item: {other:?}"),
        };
        assert_eq!(order(&fresh), Some(1));
        assert_eq!(order("showcase-numbered-1"), Some(2));
        assert_eq!(session.caret(), Some((fresh.clone(), 0)));
        let mut peer = PageDocSession::new(HOME_PAGE_ID, 4242).expect("peer");
        let update = session.view(|view, _| {
            view.document()
                .workspace
                .page(HOME_PAGE_ID)
                .expect("page")
                .encode_update_v1()
                .expect("update")
        });
        peer.apply_remote_update_v1(&update).expect("peer applies");
        assert_eq!(
            peer.read_unknown_block(&fresh)
                .expect("fresh block")
                .flavour,
            "affine:list"
        );
        session.undo();
        assert_eq!(session.text("t-empty").plain, "/num");
        assert!(session.node(&fresh).is_none());
        assert_eq!(order("showcase-numbered-1"), Some(1));

        // Escape closes the menu and leaves the typed text as text; whitespace after the
        // command closes it too, and so does moving the caret away.
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "showcase-quote",
            0,
        ))));
        session.insert("/co");
        assert_eq!(session.slash_query().as_deref(), Some("co"));
        session.key("escape");
        assert_eq!(session.slash_query(), None);
        assert!(session.text("showcase-quote").plain.starts_with("/coEvery"));
        session.insert("/x");
        assert_eq!(session.slash_query().as_deref(), Some("x"));
        session.insert(" ");
        assert_eq!(session.slash_query(), None);
        session.insert("/");
        assert!(session.slash_query().is_some());
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "showcase-h1",
            0,
        ))));
        assert_eq!(session.slash_query(), None);

        // A divider goes right below the block. With a text block after it the caret
        // moves on to that block.
        empty_paragraph(&session, "t-rule", 0);
        caret_in("t-rule");
        session.insert("/div");
        session.key("enter");
        let children = session.children("showcase-note");
        assert_eq!(children[0], "t-rule");
        assert_eq!(session.text("t-rule").plain, "");
        assert!(matches!(
            session.node(&children[1]).map(|node| node.content),
            Some(BlockContent::Divider)
        ));
        assert_eq!(children[2], "showcase-h1");
        assert_eq!(session.caret(), Some(("showcase-h1".to_string(), 0)));
        session.undo();
        assert_eq!(session.text("t-rule").plain, "/div");
        assert_eq!(session.children("showcase-note")[1], "showcase-h1");

        // Before a block that holds no text the caret stays where the command was typed.
        let before_divider = session
            .children("showcase-note")
            .iter()
            .position(|id| id == "showcase-divider")
            .expect("divider");
        empty_paragraph(&session, "t-stay", before_divider as u64);
        caret_in("t-stay");
        session.insert("/div");
        session.key("enter");
        let children = session.children("showcase-note");
        assert_eq!(children[before_divider], "t-stay");
        assert!(matches!(
            session
                .node(&children[before_divider + 1])
                .map(|node| node.content),
            Some(BlockContent::Divider)
        ));
        assert_eq!(children[before_divider + 2], "showcase-divider");
        assert_eq!(session.caret(), Some(("t-stay".to_string(), 0)));

        // After the last block of its parent the divider is followed by an empty
        // paragraph to go on typing in; one undo takes both back.
        let last = session.children("showcase-note").len();
        empty_paragraph(&session, "t-last", last as u64);
        caret_in("t-last");
        session.insert("/div");
        session.key("enter");
        let children = session.children("showcase-note");
        assert_eq!(children.len(), last + 3);
        assert_eq!(children[last], "t-last");
        assert!(matches!(
            session.node(&children[last + 1]).map(|node| node.content),
            Some(BlockContent::Divider)
        ));
        let trailing = children[last + 2].clone();
        assert!(matches!(
            session.node(&trailing).map(|node| node.content),
            Some(BlockContent::Paragraph {
                kind: ParagraphType::Text,
                ..
            })
        ));
        assert_eq!(session.text(&trailing).plain, "");
        assert_eq!(session.caret(), Some((trailing, 0)));
        session.undo();
        assert_eq!(session.children("showcase-note").len(), last + 1);
        assert_eq!(session.text("t-last").plain, "/div");

        // A block with other text is converted with that text: `Buy milk/todo` becomes a
        // to-do item reading `Buy milk`, the caret where the command was typed, and one
        // undo restores the paragraph as typed.
        caret_in("t-rule");
        session.command("a");
        session.key("backspace");
        session.insert("Buy milk/todo");
        assert_eq!(session.slash_query().as_deref(), Some("todo"));
        session.key("enter");
        assert!(session.node("t-rule").is_none());
        let item = session.children("showcase-note")[0].clone();
        assert!(matches!(
            session.node(&item).map(|node| node.content),
            Some(BlockContent::List {
                kind: ListType::Todo,
                checked: false,
                ..
            })
        ));
        assert_eq!(session.text(&item).plain, "Buy milk");
        assert_eq!(session.caret(), Some((item.clone(), 8)));
        session.undo();
        assert!(session.node(&item).is_none());
        assert!(matches!(
            session.node("t-rule").map(|node| node.content),
            Some(BlockContent::Paragraph {
                kind: ParagraphType::Text,
                ..
            })
        ));
        assert_eq!(session.text("t-rule").plain, "Buy milk/todo");
        assert_eq!(session.caret(), Some(("t-rule".to_string(), 13)));

        // Code takes the text along too.
        session.command("a");
        session.key("backspace");
        session.insert("Intro /code");
        session.key("enter");
        let code = session.children("showcase-note")[0].clone();
        assert!(matches!(
            session.node(&code).map(|node| node.content),
            Some(BlockContent::Code { text, .. }) if text == "Intro "
        ));
        assert_eq!(session.caret(), Some((code, 6)));
        session.undo();
        assert_eq!(session.text("t-rule").plain, "Intro /code");

        // Inside a code block and in the title a `/` is just a character.
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "showcase-code",
            0,
        ))));
        session.insert("/");
        assert_eq!(session.slash_query(), None);
        assert_no_violations(&session.settle(), "after typed slash commands");
    }

    #[test]
    fn format_toolbar_toggles_marks_alignment_and_links() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let block = "showcase-quote";
        let (start, end) = session.select(block, "Every block");
        let marks = || marks_in_range(&session.text(block), start, end);
        let frame = session.settle();
        assert_no_violations(&frame, "format toolbar");
        assert!(session.view(|view, _| view.overlays().format_toolbar_open()));

        let toolbar = element(&frame, "overlay.format_toolbar");
        assert_eq!(toolbar.opacity, 1.0);
        assert_eq!((toolbar.corner_radius, toolbar.padding), (8.0, 4.0));
        // Above the selection's first line with the popover gap, centered on it.
        let selection = element(&frame, "page.selection").bounds;
        assert_eq!(toolbar.bounds.bottom() + POPOVER_GAP, selection.y);
        assert!((center(toolbar.bounds).0 - center(selection).0).abs() <= 1.0);
        for action in FormatAction::ALL {
            let button = element(&frame, &format!("overlay.format_toolbar.{}", action.id()));
            assert!(button.interactive, "{action:?}");
            assert!(
                button.bounds.width >= 28.0 && button.bounds.height >= 28.0,
                "{action:?}"
            );
            assert_eq!(button.corner_radius, 4.0, "{action:?}");
            assert_eq!(
                button.focused,
                action == FormatAction::AlignLeft,
                "{action:?}"
            );
        }
        // Buttons sit edge to edge, so the pointer never falls between two of them.
        let bold = element(&frame, "overlay.format_toolbar.bold").bounds;
        let italic = element(&frame, "overlay.format_toolbar.italic").bounds;
        assert_eq!(bold.right(), italic.x);

        // Every mark toggles on, shows as active, and one undo takes it off again.
        for (action, read) in [
            (
                FormatAction::Bold,
                (|marks: &MarkState| marks.bold) as fn(&MarkState) -> bool,
            ),
            (FormatAction::Italic, |marks| marks.italic),
            (FormatAction::Underline, |marks| marks.underline),
            (FormatAction::Strike, |marks| marks.strike),
            (FormatAction::Code, |marks| marks.code),
        ] {
            let id = format!("overlay.format_toolbar.{}", action.id());
            assert!(!read(&marks()), "{action:?}");
            session.click(&session.frame(), &id);
            assert!(read(&marks()), "{action:?} on");
            let active = session.frame();
            assert_no_violations(&active, "format toolbar active");
            assert!(element(&active, &id).focused, "{action:?}");
            session.undo();
            assert!(!read(&marks()), "{action:?} undone");
            assert!(!element(&session.frame(), &id).focused, "{action:?}");
            // A second click on an active mark clears it.
            session.click(&session.frame(), &id);
            session.click(&session.frame(), &id);
            assert!(!read(&marks()), "{action:?} off");
        }
        // The selection outlives the edits.
        assert_eq!(
            session.selection(),
            Some((
                block.to_string(),
                start as u64,
                block.to_string(),
                end as u64
            ))
        );

        // Alignment is a block property, undone in one step.
        let align = || match session.node(block).map(|node| node.content) {
            Some(BlockContent::Paragraph { text_align, .. }) => text_align,
            _ => None,
        };
        assert_eq!(align(), None);
        session.click(&session.frame(), "overlay.format_toolbar.align_center");
        assert_eq!(align(), Some(BlockAlign::Center));
        let centered = session.frame();
        assert!(element(&centered, "overlay.format_toolbar.align_center").focused);
        assert!(!element(&centered, "overlay.format_toolbar.align_left").focused);
        session.undo();
        assert_eq!(align(), None);
        session.click(&session.frame(), "overlay.format_toolbar.align_right");
        assert_eq!(align(), Some(BlockAlign::Right));
        session.click(&session.frame(), "overlay.format_toolbar.align_left");
        assert_eq!(align(), Some(BlockAlign::Left));

        // The link field opens attached to the toolbar and takes the keyboard.
        let before = session.frame();
        assert!(
            !before
                .elements
                .contains_key("overlay.format_toolbar.link_input")
        );
        session.click(&before, "overlay.format_toolbar.link");
        let linking = session.frame();
        assert_no_violations(&linking, "link field");
        let field = element(&linking, "overlay.format_toolbar.link_input");
        // The field's caret is the only one: the document keeps its selection wash.
        element(&before, "page.local_caret");
        element(&linking, "page.selection");
        assert!(!linking.elements.contains_key("page.local_caret"));
        let grown = element(&linking, "overlay.format_toolbar").bounds;
        let single = element(&before, "overlay.format_toolbar").bounds;
        assert_eq!(grown.height, single.height + 32.0);
        assert!(
            field.bounds.y
                >= element(&linking, "overlay.format_toolbar.bold")
                    .bounds
                    .bottom()
        );
        for id in ["link_apply", "link_remove"] {
            let button = element(&linking, &format!("overlay.format_toolbar.{id}"));
            assert!(button.interactive && button.bounds.height >= 28.0, "{id}");
        }
        let text_before = session.text(block).plain;
        // Typed keys reach the field as text through the input handler, like text from
        // an input method, and none of it reaches the document.
        session.type_text("affine.pro/x");
        session.key("backspace");
        session.key("backspace");
        session.insert("/d");
        assert_eq!(
            session.view(|view, _| view.overlays().link_url().map(str::to_string)),
            Some("affine.pro/d".to_string())
        );
        assert_eq!(session.text(block).plain, text_before);
        assert_eq!(session.slash_query(), None);
        session.key("enter");
        assert_eq!(marks().link.as_deref(), Some("https://affine.pro/d"));
        let linked = session.frame();
        assert!(
            !linked
                .elements
                .contains_key("overlay.format_toolbar.link_input")
        );
        assert!(element(&linked, "overlay.format_toolbar.link").focused);
        session.undo();
        assert_eq!(marks().link, None);

        // Opened over a link the field shows it; Apply rewrites it and Remove clears it.
        session.click(&session.frame(), "overlay.format_toolbar.link");
        session.type_text("affine.pro");
        session.click(&session.frame(), "overlay.format_toolbar.link_apply");
        assert_eq!(marks().link.as_deref(), Some("https://affine.pro"));
        session.click(&session.frame(), "overlay.format_toolbar.link");
        assert_eq!(
            session.view(|view, _| view.overlays().link_url().map(str::to_string)),
            Some("https://affine.pro".to_string())
        );
        session.overlay(OverlayEvent::Paste("/docs".to_string()));
        session.click(&session.frame(), "overlay.format_toolbar.link_apply");
        assert_eq!(marks().link.as_deref(), Some("https://affine.pro/docs"));
        session.click(&session.frame(), "overlay.format_toolbar.link");
        session.click(&session.frame(), "overlay.format_toolbar.link_remove");
        assert_eq!(marks().link, None);

        // Without a selection the toolbar fades out without handlers and unmounts.
        session.overlay(OverlayEvent::SetSelection(None));
        session.frame();
        assert!(!session.view(|view, _| view.overlays().format_toolbar_open()));
        session.platform.advance_clock(Duration::from_millis(50));
        let fading = session.frame();
        assert_no_violations(&fading, "format toolbar fading");
        let toolbar = element(&fading, "overlay.format_toolbar");
        assert!(toolbar.opacity > 0.0 && toolbar.opacity < 1.0);
        assert!(!element(&fading, "overlay.format_toolbar.bold").interactive);
        assert!(
            !session
                .settle()
                .elements
                .contains_key("overlay.format_toolbar")
        );
    }

    #[test]
    fn format_toolbar_spans_blocks_and_stays_away_from_code_and_the_title() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let select = |anchor: (&str, u64), focus: (&str, u64)| {
            session.update(|view, window, cx| {
                view.select_document_range(
                    DocumentSelection {
                        anchor: DocPoint::new(anchor.0, anchor.1),
                        focus: DocPoint::new(focus.0, focus.1),
                    },
                    window,
                    cx,
                );
            });
            session.settle()
        };
        let bold =
            |id: &str, from: usize, to: usize| marks_in_range(&session.text(id), from, to).bold;

        // From the middle of one list item to the middle of the next.
        let frame = select(("showcase-numbered-1", 6), ("showcase-numbered-2", 6));
        assert_no_violations(&frame, "cross-block toolbar");
        let toolbar = element(&frame, "overlay.format_toolbar").bounds;
        let first = element(&frame, "page.block.showcase-numbered-1").bounds;
        assert_eq!(toolbar.bottom() + POPOVER_GAP, first.y);
        session.click(&frame, "overlay.format_toolbar.bold");
        assert!(bold("showcase-numbered-1", 6, 10) && bold("showcase-numbered-2", 0, 6));
        assert!(!bold("showcase-numbered-1", 0, 6));
        assert!(element(&session.frame(), "overlay.format_toolbar.bold").focused);
        // Alignment reaches every selected block, and all of it is one undo step each.
        session.click(&session.frame(), "overlay.format_toolbar.align_right");
        let aligned = |id: &str| match session.node(id).map(|node| node.content) {
            Some(BlockContent::List { text_align, .. }) => text_align,
            _ => None,
        };
        assert_eq!(aligned("showcase-numbered-1"), Some(BlockAlign::Right));
        assert_eq!(aligned("showcase-numbered-2"), Some(BlockAlign::Right));
        session.undo();
        assert_eq!(aligned("showcase-numbered-1"), None);
        assert_eq!(aligned("showcase-numbered-2"), None);
        session.undo();
        assert!(!bold("showcase-numbered-1", 6, 10) && !bold("showcase-numbered-2", 0, 6));

        // Code and the title carry no inline marks: no toolbar over them.
        let frame = select(("showcase-code", 0), ("showcase-code", 7));
        assert!(!frame.elements.contains_key("overlay.format_toolbar"));
        let frame = select(("showcase-page", 0), ("showcase-page", 6));
        assert!(!frame.elements.contains_key("overlay.format_toolbar"));
        // A composition in progress keeps it away as well.
        select(("showcase-quote", 0), ("showcase-quote", 5));
        assert!(session.view(|view, _| view.overlays().format_toolbar_open()));
        session.update(|view, window, cx| {
            view.replace_and_mark_text_in_range(None, "ni", None, window, cx);
        });
        assert!(
            !session
                .settle()
                .elements
                .contains_key("overlay.format_toolbar")
        );
    }

    #[test]
    fn format_toolbar_flips_below_a_selection_under_the_top_bar() {
        let session = open(1280, 800, PlaygroundTheme::Dark);
        let block_y = session.view(|view, _| {
            view.flow_layout()
                .and_then(|layout| layout.block("showcase-quote").map(|block| block.y))
                .expect("quote")
        });
        session.scroll(640.0, 400.0, 0.0, -block_y);
        session.select("showcase-quote", "block below");
        // Selecting brought the caret into view; put the line under the top bar again.
        session.frame();
        let scrolled = session.view(|view, _| view.scroll_offset());
        session.scroll(640.0, 400.0, 0.0, scrolled - block_y);
        let frame = session.settle();
        assert_no_violations(&frame, "flipped toolbar");
        let toolbar = element(&frame, "overlay.format_toolbar").bounds;
        let selection = element(&frame, "page.selection").bounds;
        assert!(selection.y - TOPBAR_HEIGHT < toolbar.height + 2.0 * POPOVER_GAP);
        assert_eq!(toolbar.y, selection.bottom() + POPOVER_GAP);

        // Scrolled back, the same selection has room above again.
        session.scroll(640.0, 400.0, 0.0, block_y);
        let frame = session.settle();
        let toolbar = element(&frame, "overlay.format_toolbar").bounds;
        let selection = element(&frame, "page.selection").bounds;
        assert_eq!(toolbar.bottom() + POPOVER_GAP, selection.y);
    }

    #[test]
    fn dragging_over_text_selects_it_and_opens_the_toolbar() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let frame = session.frame();
        let quote = element(&frame, "page.block.showcase-quote").bounds;
        let (x, y) = (quote.x + 18.0, quote.y + 23.0);

        // A click places the caret; the toolbar waits for a selection.
        session.press(x, y, 1);
        session.release(x, y);
        assert_eq!(session.caret(), Some(("showcase-quote".to_string(), 0)));
        let placed = session.settle();
        assert!(!placed.elements.contains_key("overlay.format_toolbar"));
        element(&placed, "page.local_caret");

        // Dragging extends the selection; the toolbar opens once the button is released.
        session.press(x, y, 1);
        session.pointer(x + 160.0, y, true);
        let (anchor, from, focus, to) = session.selection().expect("selection while dragging");
        assert_eq!(
            (anchor.as_str(), from, focus.as_str()),
            ("showcase-quote", 0, "showcase-quote")
        );
        assert!(to > 5);
        assert!(
            !session
                .settle()
                .elements
                .contains_key("overlay.format_toolbar")
        );
        session.release(x + 160.0, y);
        let frame = session.settle();
        assert_no_violations(&frame, "mouse selection");
        assert!(session.view(|view, _| view.overlays().format_toolbar_open()));
        let wash = element(&frame, "page.selection").bounds;
        assert!(wash.x <= x && wash.right() >= x + 150.0 && wash.right() <= x + 175.0);
        // One caret and one wash: the editor paints the selection, the overlays do not.
        element(&frame, "page.local_caret");
        element(&frame, "overlay.format_toolbar");

        // Clicking a toolbar button keeps the selection and edits it; undo reverts it.
        session.click(&frame, "overlay.format_toolbar.bold");
        assert!(marks_in_range(&session.text("showcase-quote"), 0, to as usize).bold);
        assert_eq!(session.selection().map(|selection| selection.3), Some(to));
        session.undo();
        assert!(!marks_in_range(&session.text("showcase-quote"), 0, to as usize).bold);

        // A double click selects the word under the pointer and opens the toolbar at once.
        session.press(x + 22.0, y, 2);
        let (_, from, _, to) = session.selection().expect("word selection");
        let plain: Vec<u16> = session
            .text("showcase-quote")
            .plain
            .encode_utf16()
            .collect();
        let selected = String::from_utf16_lossy(&plain[from as usize..to as usize]);
        assert_eq!(selected, "Every");
        assert!(
            session
                .settle()
                .elements
                .contains_key("overlay.format_toolbar")
        );
        session.release(x + 22.0, y);

        // A click elsewhere collapses the selection and closes the toolbar.
        let heading = element(&session.frame(), "page.block.showcase-h1").bounds;
        let (away_x, away_y) = (heading.x + 300.0, heading.y + 18.0);
        session.press(away_x, away_y, 1);
        session.release(away_x, away_y);
        assert!(session.caret().is_some());
        assert!(
            !session
                .settle()
                .elements
                .contains_key("overlay.format_toolbar")
        );
    }

    #[test]
    fn todo_toggle_heading_and_code_controls_edit_the_document() {
        let session = open(1280, 1700, PlaygroundTheme::Light);
        let frame = session.frame();
        assert_no_violations(&frame, "controls at rest");

        // To-do box: a 24px target over the box; clicking flips `prop:checked`.
        let checked = |id: &str| match session.node(id).map(|node| node.content) {
            Some(BlockContent::List { checked, .. }) => checked,
            _ => panic!("{id} is not a list item"),
        };
        let target = element(&frame, "page.block.showcase-todo-open.checkbox");
        assert!(target.interactive);
        assert_eq!((target.bounds.width, target.bounds.height), (24.0, 24.0));
        let row = element(&frame, "page.block.showcase-todo-open").bounds;
        assert_eq!(target.bounds.x, row.x);
        assert_eq!(center(target.bounds).1, row.y + 12.0);
        assert!(!checked("showcase-todo-open"));
        session.click(&frame, "page.block.showcase-todo-open.checkbox");
        assert!(checked("showcase-todo-open"));
        session.click(&frame, "page.block.showcase-todo-done.checkbox");
        assert!(!checked("showcase-todo-done"));
        // The click neither placed a caret nor moved the box.
        assert_eq!(session.selection(), None);
        let after = session.frame();
        assert_eq!(
            element(&after, "page.block.showcase-todo-open.checkbox").bounds,
            target.bounds
        );
        // Each click is its own undo step.
        session.undo();
        assert!(checked("showcase-todo-done") && checked("showcase-todo-open"));
        session.undo();
        assert!(!checked("showcase-todo-open"));

        // Toggle chevron: expanding lays the child out; the chevron turns for 150 ms.
        let collapsed = |id: &str| match session.node(id).map(|node| node.content) {
            Some(
                BlockContent::List { collapsed, .. } | BlockContent::Paragraph { collapsed, .. },
            ) => collapsed,
            _ => panic!("{id} cannot collapse"),
        };
        let laid_out = |id: &str| {
            session.view(|view, _| {
                view.flow_layout()
                    .is_some_and(|layout| layout.block(id).is_some())
            })
        };
        let turning = |id: &str| session.view(|view, _| view.overlays().chevron_turning(id));
        assert!(collapsed("showcase-toggle-closed"));
        assert!(!laid_out("showcase-toggle-closed-child"));
        session.click(&after, "page.block.showcase-toggle-closed.toggle");
        assert!(!collapsed("showcase-toggle-closed"));
        assert!(turning("showcase-toggle-closed"));
        session.platform.advance_clock(Duration::from_millis(60));
        let mid = session.frame();
        assert_no_violations(&mid, "chevron turning");
        assert!(laid_out("showcase-toggle-closed-child"));
        assert!(turning("showcase-toggle-closed"));
        let settled = session.settle();
        assert!(!turning("showcase-toggle-closed"));
        session.click(&settled, "page.block.showcase-toggle-closed.toggle");
        assert!(collapsed("showcase-toggle-closed"));
        session.settle();
        assert!(!laid_out("showcase-toggle-closed-child"));

        // Heading chevron: shown on the heading's row only, in the gutter beside it.
        let frame = session.frame();
        assert!(
            !frame
                .elements
                .contains_key("page.block.showcase-h2.collapse")
        );
        let heading = element(&frame, "page.block.showcase-h2").bounds;
        let (heading_x, heading_y) = center(heading);
        session.pointer(heading_x, heading_y, false);
        let hovered = session.frame();
        assert_no_violations(&hovered, "heading hovered");
        let chevron = element(&hovered, "page.block.showcase-h2.collapse");
        assert!(chevron.interactive);
        assert_eq!((chevron.bounds.width, chevron.bounds.height), (24.0, 24.0));
        assert_eq!(chevron.bounds.right(), heading.x);
        assert_eq!(center(chevron.bounds).1, heading_y);
        session.click(&hovered, "page.block.showcase-h2.collapse");
        assert!(collapsed("showcase-h2"));
        assert!(turning("showcase-h2"));
        session.settle();
        // The section under the heading is hidden up to the end of the page here.
        assert!(!laid_out("showcase-quote"));
        // Collapsed, the marker stays clickable without the pointer on the row.
        session.pointer(900.0, 60.0, false);
        let away = session.frame();
        assert_no_violations(&away, "heading collapsed");
        session.click(&away, "page.block.showcase-h2.collapse");
        assert!(!collapsed("showcase-h2"));
        session.settle();
        assert!(laid_out("showcase-quote"));

        // Code block: the copy button shows on hover, copies, and reads `Copied` for 1.5 s.
        let frame = session.frame();
        assert!(!frame.elements.contains_key("page.block.showcase-code.copy"));
        let code = element(&frame, "page.block.showcase-code").bounds;
        let (code_x, code_y) = center(code);
        session.pointer(code_x, code_y, false);
        let hovered = session.frame();
        assert_no_violations(&hovered, "code hovered");
        let copy = element(&hovered, "page.block.showcase-code.copy");
        assert_eq!(copy.text.as_deref(), Some("Copy"));
        assert!(copy.interactive);
        assert_eq!((copy.bounds.width, copy.bounds.height), (28.0, 28.0));
        assert_eq!(copy.bounds.right(), code.right() - 4.0);
        assert_eq!(copy.bounds.y, code.y + 4.0);
        session.click(&hovered, "page.block.showcase-code.copy");
        let clipboard = session
            .app
            .update(|cx| cx.read_from_clipboard().and_then(|item| item.text()));
        assert_eq!(
            clipboard.as_deref(),
            Some("fn main() {\n    println!(\"hello, blocks\");\n}")
        );
        let copied = session.frame();
        assert_no_violations(&copied, "code copied");
        let label = element(&copied, "page.block.showcase-code.copy");
        assert_eq!(label.text.as_deref(), Some("Copied"));
        assert_eq!(label.bounds.right(), code.right() - 4.0);
        // The label holds on the scheduler clock, also with the pointer gone.
        session.pointer(900.0, 60.0, false);
        session.platform.advance_clock(Duration::from_millis(1_400));
        session.platform.run_until_parked();
        assert_eq!(
            element(&session.frame(), "page.block.showcase-code.copy")
                .text
                .as_deref(),
            Some("Copied")
        );
        session.platform.advance_clock(Duration::from_millis(200));
        session.platform.run_until_parked();
        assert!(
            !session
                .frame()
                .elements
                .contains_key("page.block.showcase-code.copy")
        );
    }

    #[test]
    fn unwrapped_code_scrolls_sideways_within_its_lines() {
        let session = open(1280, 1700, PlaygroundTheme::Light);
        let long_line = format!("let long = \"{}\";\n", "x".repeat(200));
        session.edit(|page| {
            page.insert_text("showcase-code", "prop:text", 0, &long_line, 2_000_000)
                .expect("insert long line");
            page.set_block_prop(
                "showcase-code",
                "prop:wrap",
                SessionValue::Any(Any::False),
                2_000_001,
            )
            .expect("unwrap");
        });
        let frame = session.frame();
        assert_no_violations(&frame, "unwrapped code");
        let range = session.view(|view, _| {
            view.flow_layout()
                .and_then(|layout| {
                    layout
                        .block("showcase-code")
                        .and_then(|block| block.body.code_scroll)
                })
                .expect("the long line overflows the code area")
        });
        assert!(range.max_x > 100.0, "{range:?}");
        let scroll_x = || session.view(|view, _| view.overlays().code_scroll_x("showcase-code"));
        let code = element(&frame, "page.block.showcase-code").bounds;
        let (x, y) = center(code);

        session.scroll(x, y, -60.0, 0.0);
        assert_eq!(scroll_x(), 60.0);
        // The page did not move, and the block keeps its place.
        assert_eq!(
            element(&session.frame(), "page.block.showcase-code").bounds,
            code
        );
        // A mostly vertical scroll is the page's.
        session.scroll(x, y, -5.0, -40.0);
        assert_eq!(scroll_x(), 60.0);
        // Both ends clamp.
        session.scroll(x, y, -100_000.0, 0.0);
        assert_eq!(scroll_x(), range.max_x);
        session.scroll(x, y, 100_000.0, 0.0);
        assert_eq!(scroll_x(), 0.0);
        // Outside the code block nothing scrolls sideways.
        let title = center(element(&frame, "page.title_block").bounds);
        session.scroll(title.0, title.1, -60.0, 0.0);
        assert_eq!(scroll_x(), 0.0);

        // The caret takes the lines with it: at the end of the long line the block has
        // scrolled to its end and the caret sits inside the code area.
        let line_end = long_line.encode_utf16().count() - 1;
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "showcase-code",
            line_end,
        ))));
        let revealed = session.frame();
        assert_no_violations(&revealed, "caret in scrolled code");
        assert_eq!(scroll_x(), range.max_x);
        let caret = element(&revealed, "page.local_caret").bounds;
        assert!(caret.x > code.x + 52.0 && caret.right() <= code.right() - 18.0);
        // A click on the scrolled text lands on the character under the pointer.
        session.press(caret.x - 1.0, caret.y + 4.0, 1);
        session.release(caret.x - 1.0, caret.y + 4.0);
        let (_, clicked) = session.caret().expect("caret in code");
        assert!(clicked as usize + 1 >= line_end && clicked as usize <= line_end);
        // Back at the start of the line the block scrolls back.
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "showcase-code",
            0,
        ))));
        session.frame();
        assert_eq!(scroll_x(), 0.0);

        // A wrapped code block has nothing to scroll.
        session.scroll(x, y, -60.0, 0.0);
        session.edit(|page| {
            page.set_block_prop(
                "showcase-code",
                "prop:wrap",
                SessionValue::Any(Any::True),
                2_000_002,
            )
            .expect("wrap");
        });
        assert_eq!(scroll_x(), 0.0);
        assert_no_violations(&session.frame(), "wrapped code");
    }

    #[test]
    fn drag_handle_reorders_a_block_among_its_siblings() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let frame = session.frame();
        assert!(!frame.elements.contains_key("overlay.drag_handle"));
        let geometry = page_geometry(1280.0);
        let quote = element(&frame, "page.block.showcase-quote").bounds;
        let (quote_x, quote_y) = center(quote);

        // The handle appears with the pointer, left of the block on its first line.
        session.pointer(quote_x, quote_y, false);
        let hovered = session.frame();
        assert_no_violations(&hovered, "drag handle");
        let handle = element(&hovered, "overlay.drag_handle");
        assert!(handle.interactive && handle.opacity == 1.0);
        assert_eq!((handle.bounds.width, handle.bounds.height), (24.0, 24.0));
        assert_eq!(handle.bounds.right(), geometry.column_x);
        assert_eq!(center(handle.bounds).1, quote.y + 10.0 + 13.0);
        assert_eq!(handle.text.as_deref(), Some("showcase-quote"));
        assert!(!hovered.elements.contains_key("overlay.drop_indicator"));
        // On the block's row the handle is a bar; with the pointer on the handle itself
        // it turns into its dots, and back when the pointer returns to the row.
        assert!(!session.view(|view, _| view.overlays().drag_handle_hot()));
        let on_handle = center(handle.bounds);
        session.pointer(on_handle.0, on_handle.1, false);
        assert!(session.view(|view, _| view.overlays().drag_handle_hot()));
        assert_no_violations(&session.frame(), "drag handle under the pointer");
        session.pointer(quote_x, quote_y, false);
        assert!(!session.view(|view, _| view.overlays().drag_handle_hot()));

        // Dragging shows the nearest slot among the block's siblings and selects no text.
        let (handle_x, handle_y) = center(handle.bounds);
        let first = element(&hovered, "page.block.showcase-numbered-1").bounds;
        let second = element(&hovered, "page.block.showcase-numbered-2").bounds;
        session.press(handle_x, handle_y, 1);
        assert_eq!(
            session.view(|view, _| view.overlays().dragged_block().map(str::to_string)),
            Some("showcase-quote".to_string())
        );
        session.pointer(handle_x, first.bottom() + 2.0, true);
        assert_eq!(session.selection(), None);
        let dragging = session.frame();
        assert_no_violations(&dragging, "drop indicator");
        let indicator = element(&dragging, "overlay.drop_indicator");
        assert!(!indicator.interactive);
        assert_eq!(indicator.bounds.height, DROP_INDICATOR_THICKNESS);
        assert_eq!(indicator.bounds.x, geometry.column_x);
        assert_eq!(indicator.bounds.width, geometry.column_width);
        assert!(indicator.bounds.y >= first.bottom() && indicator.bounds.bottom() <= second.y);
        assert!(element(&dragging, "overlay.drag_handle").focused);

        // Releasing moves the block there; one undo moves it back.
        let before = session.children("showcase-note");
        session.release(handle_x, first.bottom() + 2.0);
        let after = session.children("showcase-note");
        let position = |children: &[String], id: &str| {
            children
                .iter()
                .position(|child| child == id)
                .expect("child")
        };
        assert_eq!(after.len(), before.len());
        assert_eq!(
            position(&after, "showcase-quote"),
            position(&after, "showcase-numbered-1") + 1
        );
        assert_eq!(
            position(&after, "showcase-numbered-2"),
            position(&after, "showcase-quote") + 1
        );
        assert!(session.view(|view, _| view.overlays().dragged_block().is_none()));
        let dropped = session.frame();
        assert_no_violations(&dropped, "after drop");
        assert!(!dropped.elements.contains_key("overlay.drop_indicator"));
        let moved = element(&dropped, "page.block.showcase-quote").bounds;
        assert!(moved.y > element(&dropped, "page.block.showcase-numbered-1").bounds.y);
        session.undo();
        assert_eq!(session.children("showcase-note"), before);
        session.keystroke(Keystroke {
            modifiers: Modifiers {
                platform: true,
                control: true,
                shift: true,
                ..Modifiers::default()
            },
            key: "z".to_string(),
            key_char: None,
        });
        assert_eq!(session.children("showcase-note"), after);

        // Dropping a block into its own slot leaves the document alone.
        let dropped = session.frame();
        let moved = element(&dropped, "page.block.showcase-quote").bounds;
        let (x, y) = center(moved);
        session.pointer(x, y, false);
        let hovered = session.frame();
        let (handle_x, handle_y) = center(element(&hovered, "overlay.drag_handle").bounds);
        session.press(handle_x, handle_y, 1);
        session.pointer(handle_x, handle_y + 6.0, true);
        assert!(session.view(|view, _| view.overlays().drop_slot().is_some()));
        session.release(handle_x, handle_y + 6.0);
        assert_eq!(session.children("showcase-note"), after);

        // A nested block moves among its own siblings only; `showcase-bullet-nested` has a
        // child (`showcase-bullet-deep`), so its drag handle sits one step left of its gutter chevron.
        let frame = session.frame();
        let nested = center(element(&frame, "page.block.showcase-bullet-nested").bounds);
        session.pointer(nested.0, nested.1, false);
        let hovered = session.frame();
        let handle = element(&hovered, "overlay.drag_handle").bounds;
        assert_eq!(handle.right(), geometry.column_x);
        session.press(center(handle).0, center(handle).1, 1);
        session.pointer(center(handle).0, 700.0, true);
        let slot = session
            .view(|view, _| view.overlays().drop_slot().cloned())
            .expect("slot");
        assert_eq!(slot.parent_id, "showcase-bullet");
        assert_eq!(slot.reorder_index(), None);
        session.release(center(handle).0, 700.0);
        assert_eq!(
            session.children("showcase-bullet"),
            ["showcase-bullet-nested"]
        );
    }

    #[test]
    fn narrow_windows_keep_the_handle_and_popovers_inside() {
        for theme in [PlaygroundTheme::Light, PlaygroundTheme::Dark] {
            let session = open(320, 800, theme);
            let frame = session.frame();
            let intro = center(element(&frame, "page.block.showcase-intro").bounds);
            session.pointer(intro.0, intro.1, false);
            let hovered = session.frame();
            assert_no_violations(&hovered, "narrow handle");
            let handle = element(&hovered, "overlay.drag_handle").bounds;
            assert_eq!(handle.x, DRAG_HANDLE_MIN_X);
            assert_eq!(handle.width, 24.0);

            // A heading keeps the narrow gutter for its collapse chevron.
            let heading = center(element(&hovered, "page.block.showcase-h1").bounds);
            session.pointer(heading.0, heading.1, false);
            let hovered = session.frame();
            assert_no_violations(&hovered, "narrow heading");
            assert!(!hovered.elements.contains_key("overlay.drag_handle"));
            assert_eq!(
                element(&hovered, "page.block.showcase-h1.collapse")
                    .bounds
                    .x,
                0.0
            );

            // On narrow 320px viewports, non-collapsed selection shows the docked bottom
            // `KeyboardToolbar` and suppresses the duplicate floating `FormatToolbar`, while
            // triggering `Link` from the bottom bar opens a clamped link-only input bar.
            session.select("showcase-intro", "y-octo document");
            let frame = session.settle();
            assert_no_violations(&frame, "narrow mobile keyboard toolbar");
            assert!(frame.elements.contains_key("overlay.keyboard_toolbar"));
            assert!(!frame.elements.contains_key("overlay.format_toolbar"));

            session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Link));
            let frame = session.frame();
            assert_no_violations(&frame, "narrow mobile link field");
            let link_bar = element(&frame, "overlay.format_toolbar").bounds;
            assert!(link_bar.x >= POPOVER_EDGE_MARGIN);
            assert!(link_bar.right() <= 320.0 - POPOVER_EDGE_MARGIN);
            let field = element(&frame, "overlay.format_toolbar.link_input").bounds;
            assert!(field.width >= 100.0);

            // When the software keyboard is dismissed on a narrow desktop window, the full
            // floating `FormatToolbar` also stays clamped between the margins.
            session.overlay(OverlayEvent::Format(FormatAction::Link));
            session.view(|view, cx| view.set_software_keyboard_visible(false, cx));
            let frame = session.settle();
            assert_no_violations(&frame, "narrow desktop toolbar");
            let toolbar = element(&frame, "overlay.format_toolbar").bounds;
            assert!(toolbar.x >= POPOVER_EDGE_MARGIN);
            assert!(toolbar.right() <= 320.0 - POPOVER_EDGE_MARGIN);

            let frame = session.open_slash("showcase-h1");
            assert_no_violations(&frame, "narrow slash menu");
            let menu = element(&frame, "overlay.slash_menu").bounds;
            assert_eq!(menu.width, SLASH_MENU_WIDTH);
            assert!(menu.x >= POPOVER_EDGE_MARGIN);
            assert!(menu.right() <= 320.0 - POPOVER_EDGE_MARGIN);
            // The toolbar gave way to the menu.
            assert!(!frame.elements.contains_key("overlay.format_toolbar"));
        }
    }

    #[test]
    fn link_field_edits_like_a_one_line_input() {
        let mut link = LinkBar::new("abc".to_string());
        assert_eq!(
            (link.input.selection.clone(), link.input.reversed),
            (3..3, false)
        );

        // A composition shows over the selection and leaves the URL alone until it
        // commits; abandoning it restores the selection.
        link.select(1..2);
        link.mark(None, "w", None);
        link.mark(None, "wen", Some(1..3));
        assert_eq!(link.text(), "awenc");
        assert_eq!(link.url(), "abc");
        assert_eq!(link.marked_range(), Some(1..4));
        assert_eq!(link.shown_selection(), (2..4, false));
        assert_eq!(link.text_for_range(1..4), ("wen".to_string(), 1..4));
        link.mark(None, "", None);
        assert_eq!(
            (link.text().as_str(), link.input.selection.clone()),
            ("abc", 1..2)
        );
        link.mark(None, "wen", None);
        link.replace(None, "文");
        assert_eq!((link.url(), link.input.selection.clone()), ("a文c", 2..2));
        assert!(!link.composing());
        link.mark(None, "x", None);
        link.unmark();
        assert_eq!(link.url(), "a文xc");

        // Control characters never get in: the field is one line.
        link.select(0..100);
        link.replace(None, "a\nb\tc");
        assert_eq!(link.url(), "abc");

        // Caret keys, with `Shift` extending and the command modifier jumping.
        assert!(link.key("home", false, false));
        assert_eq!(link.input.selection, 0..0);
        assert!(link.key("right", false, false));
        assert!(link.key("right", true, false));
        assert_eq!(
            (link.input.selection.clone(), link.input.reversed),
            (1..2, false)
        );
        assert!(link.key("left", true, false));
        assert!(link.key("left", true, false));
        assert_eq!(
            (link.input.selection.clone(), link.input.reversed),
            (0..1, true)
        );
        // An arrow collapses a selection to the side it points at.
        assert!(link.key("right", false, false));
        assert_eq!(link.input.selection, 1..1);
        assert!(link.key("end", true, false));
        assert_eq!(link.input.selection, 1..3);
        assert!(link.key("backspace", false, false));
        assert_eq!((link.url(), link.input.selection.clone()), ("a", 1..1));
        link.replace(None, "😀b");
        assert!(link.key("left", false, false));
        // A character outside the basic plane is two units and one step.
        assert!(link.key("left", false, false));
        assert_eq!(link.input.selection, 1..1);
        assert!(link.key("delete", false, false));
        assert_eq!(link.url(), "ab");
        assert!(link.key("a", false, true));
        assert_eq!(link.input.selection, 0..2);
        assert!(link.key("delete", false, false));
        assert_eq!(link.url(), "");
        // Anything else is not the field's key.
        assert!(!link.key("x", false, false));
        assert!(!link.key("a", false, false));
    }

    #[test]
    fn the_link_field_is_the_text_input_while_it_is_open() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let block = "showcase-quote";
        let (start, end) = session.select(block, "Every block");
        let frame = session.settle();
        let document_input = session.input();
        session.click(&frame, "overlay.format_toolbar.link");
        let written = session.written();
        let text = session.text(block).plain;
        let selection = session.selection();
        // The platform reads the field now, not the block.
        assert_eq!(session.input(), (String::new(), 0..0, None));

        session.insert("abc");
        assert_eq!(session.input(), ("abc".to_string(), 3..3, None));
        session.update(|view, window, cx| view.set_selected_text_range(1..2, window, cx));
        assert_eq!(session.input().1, 1..2);

        // Successive previews of a composition over the selected `b`: the field shows
        // them, the URL and the document stay as they are, and the toolbar stays up.
        for preview in ["w", "we", "wen"] {
            session.compose(preview);
        }
        assert_eq!(session.input(), ("awenc".to_string(), 4..4, Some(1..4)));
        assert_eq!(
            session.view(|view, _| view.overlays().link_url().map(str::to_string)),
            Some("abc".to_string())
        );
        assert!(!session.view(|view, _| view.editor.composing()));
        let composing = session.settle();
        assert_no_violations(&composing, "composition in the link field");
        assert_eq!(
            element(&composing, "overlay.format_toolbar.link_input")
                .text
                .as_deref(),
            Some("awenc")
        );
        // Candidates open at the field.
        let field = element(&composing, "overlay.format_toolbar.link_input").bounds;
        let bounds = session
            .update(|view, window, cx| view.bounds_for_range(1..4, Bounds::default(), window, cx))
            .expect("bounds of the composition");
        assert_eq!(
            (
                f32::from(bounds.origin.x),
                f32::from(bounds.origin.y),
                f32::from(bounds.size.width),
                f32::from(bounds.size.height)
            ),
            (field.x, field.y, field.width, field.height)
        );

        // The input method cancels: text and selection are back.
        session.compose("");
        assert_eq!(session.input(), ("abc".to_string(), 1..2, None));
        // `Escape` abandons a composition too, and keeps the field open.
        session.compose("wen");
        session.key("escape");
        assert_eq!(session.input(), ("abc".to_string(), 1..2, None));
        // Keys of a running composition are the input method's: `Enter` neither applies
        // the link nor splits the block.
        session.compose("wen");
        session.key("enter");
        assert_eq!(session.input().2, Some(1..4));
        // The commit lands once, over the selection.
        session.update(|view, window, cx| view.replace_text_in_range(None, "文", window, cx));
        assert_eq!(session.input(), ("a文c".to_string(), 2..2, None));

        // None of it wrote to the document or moved its selection.
        assert_eq!(session.written(), written);
        assert_eq!(session.text(block).plain, text);
        assert_eq!(session.selection(), selection);

        // Caret keys, typed keys and a keyboard paste all edit the field.
        session.command("a");
        session.type_text("x.io");
        session.key("home");
        session.key("delete");
        session.key("end");
        assert_eq!(session.input(), (".io".to_string(), 3..3, None));
        session.update(|_, _, cx| {
            cx.write_to_clipboard(ClipboardItem::new_string("/p\n".to_string()));
        });
        session.command("v");
        assert_eq!(session.input(), (".io/p".to_string(), 5..5, None));
        session.shift("left");
        session.command("x");
        assert_eq!(session.input(), (".io/".to_string(), 4..4, None));
        session.command("v");
        assert_eq!(session.input().0, ".io/p");
        assert_eq!(session.written(), written);
        assert_no_violations(&session.frame(), "edited link field");

        // `Enter` applies it as one edit, and the block is the text input again.
        session.key("enter");
        assert_ne!(session.written(), written);
        assert_eq!(
            marks_in_range(&session.text(block), start, end)
                .link
                .as_deref(),
            Some("https://.io/p")
        );
        assert_eq!(session.input(), document_input);

        // A press on the page closes the field unapplied.
        session.click(&session.frame(), "overlay.format_toolbar.link");
        session.insert("zzz");
        let heading = element(&session.frame(), "page.block.showcase-h1").bounds;
        session.press(heading.x + 40.0, heading.y + 18.0, 1);
        session.release(heading.x + 40.0, heading.y + 18.0);
        assert!(!session.view(|view, _| view.overlays().link_url().is_some()));
        assert_eq!(session.input().0, session.text("showcase-h1").plain);
    }

    #[test]
    fn a_typed_slash_follows_its_character_through_remote_edits() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let caret_in = |block: &str| {
            session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
                block, 0,
            ))));
            session.frame();
        };
        let menu = || {
            session.view(|view, _| {
                view.overlays()
                    .slash_menu()
                    .map(|menu| (menu.utf16_offset, menu.query.clone()))
            })
        };
        let insert = |peer: &mut PageDocSession, block: &str, at: u64, text: &str| {
            peer.insert_text(block, "prop:text", at, text, 3_000_000)
                .expect("peer inserts")
                .expect("commit")
                .update
        };
        let remove = |peer: &mut PageDocSession, block: &str, at: u64| {
            peer.remove_text(block, "prop:text", at, 1, 3_000_001)
                .expect("peer removes")
                .expect("commit")
                .update
        };

        // A peer types `X` in front of the `/` while `/h2` is being typed: the menu moves
        // along with its character, and running it removes `/h2` only.
        empty_paragraph(&session, "t-a", 2);
        caret_in("t-a");
        session.insert("/h2");
        assert_eq!(menu(), Some((0, "h2".to_string())));
        let mut peer = session.peer();
        session.receive(&insert(&mut peer, "t-a", 0, "X"));
        assert_eq!(session.text("t-a").plain, "X/h2");
        assert_eq!(menu(), Some((1, "h2".to_string())));
        assert_eq!(session.caret(), Some(("t-a".to_string(), 4)));
        let following = session.settle();
        assert_no_violations(&following, "slash menu after a remote edit");
        let caret = element(&following, "page.local_caret").bounds;
        assert!(element(&following, "overlay.slash_menu").bounds.x < caret.x);
        session.key("enter");
        assert!(matches!(
            session.node("t-a").map(|node| node.content),
            Some(BlockContent::Paragraph {
                kind: ParagraphType::H2,
                ..
            })
        ));
        assert_eq!(session.text("t-a").plain, "X");
        assert_eq!(session.caret(), Some(("t-a".to_string(), 1)));
        // Undo restores the typed command and keeps the peer's text.
        session.undo();
        assert!(matches!(
            session.node("t-a").map(|node| node.content),
            Some(BlockContent::Paragraph {
                kind: ParagraphType::Text,
                ..
            })
        ));
        assert_eq!(session.text("t-a").plain, "X/h2");

        // A peer deletes the `/`: the menu goes, and `Enter` is the document's again.
        empty_paragraph(&session, "t-b", 2);
        caret_in("t-b");
        session.insert("/h");
        assert_eq!(menu(), Some((0, "h".to_string())));
        session.send_to(&mut peer);
        session.receive(&remove(&mut peer, "t-b", 0));
        assert_eq!(session.text("t-b").plain, "h");
        assert_eq!(menu(), None);
        assert!(session.view(|view, _| view.editor.slash_trigger.is_none()));

        // A peer replaces the `/` by one of its own: the text reads the same, but it is
        // another character, and the menu does not run on it.
        empty_paragraph(&session, "t-c", 2);
        caret_in("t-c");
        session.insert("/h");
        session.send_to(&mut peer);
        let removed = remove(&mut peer, "t-c", 0);
        let typed = insert(&mut peer, "t-c", 0, "/");
        // Both arrive before the editor looks again, as one batch from the room.
        session.view(|view, cx| {
            view.edit_document(cx, |state| {
                let page = state.workspace.page_mut(HOME_PAGE_ID).expect("page");
                page.apply_remote_update_v1(&removed).expect("removal");
                page.apply_remote_update_v1(&typed).expect("insertion");
            });
        });
        session.frame();
        assert_eq!(session.text("t-c").plain, "/h");
        assert_eq!(menu(), None);
        let written = session.written();
        session.overlay(OverlayEvent::SlashExecute(0));
        assert_eq!(session.written(), written);
        assert_eq!(session.text("t-c").plain, "/h");
    }

    #[test]
    fn slash_menu_keys_never_reach_the_block() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        // A paragraph with a sibling before it, which `Tab` would indent it under.
        empty_paragraph(&session, "t-keys", 2);
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "t-keys", 0,
        ))));
        session.frame();
        let selected =
            || session.view(|view, _| view.overlays().slash_menu().map(|menu| menu.selected));
        let parent = |session: &Session| {
            session.view(|view, _| {
                let snapshot = view.page_snapshot().expect("page");
                find_parent(snapshot.root.as_ref().expect("root"), "t-keys")
                    .map(|(parent, index)| (parent.id.clone(), index))
            })
        };
        session.insert("/");
        let written = session.written();
        let place = parent(&session);

        // `Tab` and `Shift+Tab` step through the items.
        assert_eq!(selected(), Some(0));
        session.key("tab");
        session.key("tab");
        assert_eq!(selected(), Some(2));
        session.shift("tab");
        assert_eq!(selected(), Some(1));
        session.shift("tab");
        session.shift("tab");
        assert_eq!(selected(), Some(SLASH_ITEMS.len() - 1));
        assert_eq!(session.written(), written);
        assert_eq!(parent(&session), place);

        // Without a match `Tab` does nothing, while `Enter` closes the in-document menu
        // and passes through to split the block (C.2).
        session.insert("zzz");
        let count = session.children("showcase-note").len();
        session.key("tab");
        session.shift("tab");
        assert_eq!(session.slash_query().as_deref(), Some("zzz"));
        session.key("enter");
        assert_eq!(session.slash_query(), None);
        assert_eq!(parent(&session), place);
        assert_eq!(session.children("showcase-note").len(), count + 1);
        assert_eq!(session.text("t-keys").plain, "/zzz");
    }

    #[test]
    fn alignment_covers_empty_blocks_and_reads_what_children_inherit() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let paragraph = |id: &str, text: &str, parent: &str, index: u64| {
            let (id, text, parent) = (id.to_string(), text.to_string(), parent.to_string());
            session.edit(move |page| {
                page.add_block(
                    &id,
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text,
                    },
                    Some(&parent),
                    Some(index),
                    2_000_000,
                )
                .expect("add paragraph");
            });
        };
        let select = |anchor: (&str, u64), focus: (&str, u64)| {
            session.update(|view, window, cx| {
                view.select_document_range(
                    DocumentSelection {
                        anchor: DocPoint::new(anchor.0, anchor.1),
                        focus: DocPoint::new(focus.0, focus.1),
                    },
                    window,
                    cx,
                );
            });
            session.settle()
        };
        let aligned = |id: &str| match session.node(id).map(|node| node.content) {
            Some(BlockContent::Paragraph { text_align, .. }) => text_align,
            _ => None,
        };

        // `A`, an empty paragraph, `B`: aligning the selection reaches all three as one
        // undo step.
        paragraph("t-a", "A", "showcase-note", 0);
        paragraph("t-empty", "", "showcase-note", 1);
        paragraph("t-b", "B", "showcase-note", 2);
        let frame = select(("t-a", 0), ("t-b", 1));
        assert_no_violations(&frame, "toolbar over an empty block");
        assert!(element(&frame, "overlay.format_toolbar.align_left").focused);
        session.click(&frame, "overlay.format_toolbar.align_center");
        for id in ["t-a", "t-empty", "t-b"] {
            assert_eq!(aligned(id), Some(BlockAlign::Center), "{id}");
        }
        assert!(element(&session.frame(), "overlay.format_toolbar.align_center").focused);
        session.undo();
        for id in ["t-a", "t-empty", "t-b"] {
            assert_eq!(aligned(id), None, "{id}");
        }
        // With the empty block aligned on its own the three no longer agree.
        session.edit(|page| {
            page.set_block_prop(
                "t-empty",
                "prop:textAlign",
                SessionValue::Any(Any::String("right".to_string())),
                2_000_010,
            )
            .expect("align the empty paragraph");
        });
        let frame = select(("t-a", 0), ("t-b", 1));
        for id in ["align_left", "align_center", "align_right"] {
            assert!(!element(&frame, &format!("overlay.format_toolbar.{id}")).focused);
        }

        // A child that sets no alignment shows its parent's, as it is drawn.
        paragraph("t-child", "Child", "t-b", 0);
        session.edit(|page| {
            page.set_block_prop(
                "t-b",
                "prop:textAlign",
                SessionValue::Any(Any::String("right".to_string())),
                2_000_020,
            )
            .expect("align the parent");
        });
        assert_eq!(aligned("t-child"), None);
        let frame = select(("t-child", 0), ("t-child", 5));
        assert!(element(&frame, "overlay.format_toolbar.align_right").focused);
        assert!(!element(&frame, "overlay.format_toolbar.align_left").focused);
    }

    #[test]
    fn popovers_shield_the_blocks_under_them_from_the_pointer() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let hovered =
            || session.view(|view, _| view.overlays().hovered_block().map(str::to_string));
        session.select("showcase-quote", "Every block");
        let frame = session.settle();
        let quote = center(element(&frame, "page.block.showcase-quote").bounds);
        let toolbar = element(&frame, "overlay.format_toolbar").bounds;
        // Near its top edge the toolbar lies over what is above the quote.
        let (x, y) = (center(toolbar).0, toolbar.y + 4.0);
        session.pointer(toolbar.right() + 40.0, y, false);
        assert_ne!(hovered().as_deref(), Some("showcase-quote"));

        session.pointer(quote.0, quote.1, false);
        assert_eq!(hovered().as_deref(), Some("showcase-quote"));
        // Onto the toolbar: the block under it does not take the hover.
        session.pointer(x, y, false);
        assert_eq!(hovered().as_deref(), Some("showcase-quote"));
        assert!(!session.view(|view, _| view.overlays().drag_handle_hot()));

        // The slash menu shields what it covers as well.
        let frame = session.open_slash("showcase-h1");
        let menu = element(&frame, "overlay.slash_menu").bounds;
        session.pointer(menu.x - 20.0, menu.y + 60.0, false);
        let beside = hovered();
        assert!(beside.is_some() && beside.as_deref() != Some("showcase-quote"));
        session.pointer(quote.0, quote.1, false);
        assert_eq!(hovered().as_deref(), Some("showcase-quote"));
        session.pointer(menu.x + 40.0, menu.y + 60.0, false);
        assert_eq!(hovered().as_deref(), Some("showcase-quote"));
    }

    #[test]
    fn carets_and_selections_follow_a_sideways_scrolled_code_block() {
        use blocksuite_playground_doc::awareness::{
            AwarenessPayload, RoomAwareness, TextSelectionState,
        };
        let session = open(1280, 1700, PlaygroundTheme::Light);
        let long_line = format!("let long = \"{}\";\n", "x".repeat(200));
        session.edit(|page| {
            page.insert_text("showcase-code", "prop:text", 0, &long_line, 2_000_000)
                .expect("insert long line");
            page.set_block_prop(
                "showcase-code",
                "prop:wrap",
                SessionValue::Any(Any::False),
                2_000_001,
            )
            .expect("unwrap");
        });
        // A collaborator's caret in the long line, and the local caret further along.
        let client = 0x5c01_u64;
        let caret_id = format!("page.presence.{client}.caret");
        let label_id = format!("page.presence.{client}.label");
        let mut peer = RoomAwareness::new(client).expect("peer awareness");
        let mut announce = |offset: u64| {
            let mut payload = AwarenessPayload::new("Kim", "var(--affine-multi-players-green)");
            payload
                .set_text_selection(
                    HOME_PAGE_ID,
                    TextSelectionState::caret("showcase-code", offset),
                )
                .expect("selection");
            let update = peer.set_local_payload(&payload, 0).expect("payload");
            session.view(|view, cx| {
                view.edit_document(cx, |state| {
                    state
                        .awareness
                        .apply_update(&update, 0)
                        .expect("apply awareness");
                });
            });
        };
        announce(30);
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "showcase-code",
            40,
        ))));
        let unscrolled = session.frame();
        let code = element(&unscrolled, "page.block.showcase-code").bounds;
        let remote = element(&unscrolled, &caret_id).bounds;
        let label = element(&unscrolled, &label_id).bounds;
        let local = element(&unscrolled, "page.local_caret").bounds;
        let ime = |range: std::ops::Range<usize>| {
            session.update(|view, window, cx| {
                view.bounds_for_range(range, Bounds::default(), window, cx)
            })
        };
        // World and screen space round differently in the last bit.
        let close = |a: f32, b: f32| (a - b).abs() < 0.01;
        let at_caret = ime(40..40).expect("bounds at the caret");
        assert!(close(f32::from(at_caret.origin.x), local.x));
        assert!(close(f32::from(at_caret.origin.y), local.y));
        let span = ime(36..40).expect("bounds of a range");

        // Scrolled by 60 px, everything laid out on the lines moves left by as much: the
        // collaborator's caret and name tag, the local caret, and what the input method
        // is told about a caret and a range.
        let (x, y) = center(code);
        session.scroll(x, y, -60.0, 0.0);
        assert_eq!(
            session.view(|view, _| view.overlays().code_scroll_x("showcase-code")),
            60.0
        );
        let scrolled = session.frame();
        assert_no_violations(&scrolled, "presence in scrolled code");
        assert_eq!(element(&scrolled, &caret_id).bounds.x, remote.x - 60.0);
        assert_eq!(element(&scrolled, &caret_id).bounds.y, remote.y);
        assert_eq!(element(&scrolled, &label_id).bounds.x, label.x - 60.0);
        assert_eq!(
            element(&scrolled, "page.local_caret").bounds.x,
            local.x - 60.0
        );
        let moved = ime(40..40).expect("bounds at the scrolled caret");
        assert!(close(
            f32::from(moved.origin.x),
            f32::from(at_caret.origin.x) - 60.0
        ));
        let moved_span = ime(36..40).expect("bounds of the scrolled range");
        assert!(close(
            f32::from(moved_span.origin.x),
            f32::from(span.origin.x) - 60.0
        ));
        assert!(close(
            f32::from(moved_span.size.width),
            f32::from(span.size.width)
        ));

        // What scrolled out past the left edge of the code area is not shown at all, and
        // a range cut by that edge is cut for the input method too.
        announce(2);
        let hidden = session.frame();
        assert_no_violations(&hidden, "presence scrolled out of code");
        assert!(!hidden.elements.contains_key(&caret_id));
        assert!(!hidden.elements.contains_key(&label_id));
        assert_eq!(ime(0..3), None);
        let cut = ime(0..40).expect("bounds of a range cut by the code area");
        assert!(f32::from(cut.origin.x) > code.x);
        assert!(close(
            f32::from(cut.origin.x) + f32::from(cut.size.width),
            f32::from(moved.origin.x)
        ));
    }

    #[test]
    fn link_bar_empty_replace_during_preedit_restores_url_and_selection() {
        let mut bar = LinkBar::new("abc".into());
        bar.select(1..2);
        assert_eq!(bar.selected_text(), "b");
        bar.mark(None, "ni", None);
        assert!(bar.composing());
        assert_eq!(bar.text(), "anic");
        // Chromium sends compositionend("") on IME cancel: must restore "abc" with "b" selected.
        bar.replace(None, "");
        assert!(!bar.composing());
        assert_eq!(bar.url(), "abc");
        assert_eq!(bar.selected_text(), "b");
        assert_eq!(bar.shown_selection(), (1..2, false));
    }

    #[test]
    fn link_bar_non_text_clipboard_paste_does_not_erase_selection() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        let _ = session.frame();
        session.select("showcase-intro", "bold");
        let _ = session.frame();
        session.overlay(OverlayEvent::Format(FormatAction::Link));
        let _ = session.frame();
        session.update(|view, _window, cx| {
            if let Some(link) = view.overlays.link_field_mut() {
                link.replace(Some(0..0), "https://affine.pro");
                link.select(0..18);
            }
            // Write a non-text ClipboardItem (`text() == None`).
            let item = ClipboardItem {
                entries: vec![ui::ClipboardEntry::ExternalPaths(
                    ui::ExternalPaths::default(),
                )],
            };
            assert_eq!(item.text(), None);
            cx.write_to_clipboard(item);
        });
        let _ = session.frame();
        // Trigger Ctrl/Cmd+V in the link field.
        let _ = session.update(|view, window, cx| {
            let mut m = ui::Modifiers::default();
            #[cfg(target_os = "macos")]
            {
                m.platform = true;
            }
            #[cfg(not(target_os = "macos"))]
            {
                m.control = true;
            }
            let event = KeyDownEvent {
                keystroke: ui::Keystroke {
                    modifiers: m,
                    key: "v".into(),
                    key_char: Some("v".into()),
                },
                is_held: false,
                prefer_character_input: false,
            };
            view.overlay_key_down(&event, window, cx)
        });
        let url = session.view(|view, _| view.overlays().link_url().map(str::to_string));
        assert_eq!(url.as_deref(), Some("https://affine.pro"));
    }

    #[test]
    fn rtl_overlays_mirror_checkbox_toggle_collapse_and_drag_handle_hitboxes() {
        let session = open(1280, 1700, PlaygroundTheme::Light);
        let ltr = session.frame();

        // Find showcase todo, toggle, and heading blocks that are visible on Frame 1.
        let todo_id = "showcase-todo-open";
        let toggle_id = "showcase-toggle-closed";
        let heading_id = "showcase-h2";

        // Hover heading in LTR to mount both its collapse chevron and drag handle.
        let h_ltr_bounds = element(&ltr, &format!("page.block.{heading_id}")).bounds;
        session.overlay(OverlayEvent::PointerMoved {
            x: h_ltr_bounds.x + 10.0,
            y: h_ltr_bounds.y + 10.0,
            pressed: false,
        });
        let ltr_hover = session.frame();

        let ltr_todo_block = element(&ltr_hover, &format!("page.block.{todo_id}")).bounds;
        let ltr_checkbox = element(&ltr_hover, &format!("page.block.{todo_id}.checkbox")).bounds;
        let ltr_toggle_block = element(&ltr_hover, &format!("page.block.{toggle_id}")).bounds;
        let ltr_toggle = element(&ltr_hover, &format!("page.block.{toggle_id}.toggle")).bounds;
        let ltr_collapse = element(&ltr_hover, &format!("page.block.{heading_id}.collapse")).bounds;
        let ltr_handle = element(&ltr_hover, "overlay.drag_handle").bounds;

        assert_eq!(ltr_checkbox.x, ltr_todo_block.x);
        assert_eq!(ltr_toggle.x, ltr_toggle_block.x);
        assert!(ltr_collapse.x < h_ltr_bounds.x);
        assert!(ltr_handle.x < ltr_collapse.x);

        // Switch root window direction to RTL and verify all four hitboxes mirror to the right.
        session.update(|_, window, cx| {
            window.set_root_layout_direction(ui::Direction::Rtl);
            cx.notify();
        });
        let rtl_init = session.frame();
        let h_rtl_bounds = element(&rtl_init, &format!("page.block.{heading_id}")).bounds;
        session.overlay(OverlayEvent::PointerMoved {
            x: h_rtl_bounds.x + 10.0,
            y: h_rtl_bounds.y + 10.0,
            pressed: false,
        });
        let rtl_hover = session.frame();

        let rtl_todo_block = element(&rtl_hover, &format!("page.block.{todo_id}")).bounds;
        let rtl_checkbox = element(&rtl_hover, &format!("page.block.{todo_id}.checkbox")).bounds;
        let rtl_toggle_block = element(&rtl_hover, &format!("page.block.{toggle_id}")).bounds;
        let rtl_toggle = element(&rtl_hover, &format!("page.block.{toggle_id}.toggle")).bounds;
        let rtl_collapse = element(&rtl_hover, &format!("page.block.{heading_id}.collapse")).bounds;
        let rtl_handle = element(&rtl_hover, "overlay.drag_handle").bounds;

        assert_eq!(
            rtl_checkbox.x,
            rtl_todo_block.x + rtl_todo_block.width - CONTROL_HIT_SIZE
        );
        assert_eq!(
            rtl_toggle.x,
            rtl_toggle_block.x + rtl_toggle_block.width - CONTROL_HIT_SIZE
        );
        assert_eq!(rtl_collapse.x, h_rtl_bounds.x + h_rtl_bounds.width);
        assert_eq!(
            rtl_handle.x,
            h_rtl_bounds.x + h_rtl_bounds.width + CONTROL_HIT_SIZE
        );
    }

    #[test]
    fn equation_editor_fades_in_and_out_on_scheduler_clock_and_suppresses_body_caret() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        session.edit(|page| {
            page.add_block(
                "eq-block",
                BlockSpec::Latex {
                    latex: r"E = mc^2".into(),
                },
                Some("showcase-note"),
                Some(1),
                3_000_000,
            )
            .expect("add latex block");
        });
        session.select("showcase-intro", "bold");
        let before = session.frame();
        assert!(before.elements.contains_key("page.local_caret"));

        // Open equation editor without sending any subsequent pointer or key events.
        session.overlay(OverlayEvent::OpenEquationEditor {
            target: EquationTarget::Block {
                block_id: "eq-block".into(),
            },
            initial: r"E = mc^2".into(),
        });
        let first = session.frame();
        let opened_first = element(&first, "overlay.equation_editor");
        assert!(opened_first.opacity > 0.0 && opened_first.opacity <= 0.02);
        // Body caret is suppressed while the equation editor owns the input caret.
        assert!(
            !first.elements.contains_key("page.local_caret"),
            "body caret must be hidden while EquationEditor is open"
        );

        // Advance scheduler clock 150ms with zero input events: fade-in reaches opacity 1.0.
        session.platform.advance_clock(Duration::from_millis(150));
        session.platform.run_until_parked();
        let settled = session.frame();
        assert_eq!(element(&settled, "overlay.equation_editor").opacity, 1.0);
        assert!(!settled.elements.contains_key("page.local_caret"));

        // Close equation editor and advance 150ms with zero input events: unmounts cleanly.
        session.overlay(OverlayEvent::CloseEquationEditor);
        let closing = session.frame();
        assert!(closing.elements.contains_key("page.local_caret"));
        session.platform.advance_clock(Duration::from_millis(150));
        session.platform.run_until_parked();
        let closed = session.frame();
        assert!(
            !closed.elements.contains_key("overlay.equation_editor"),
            "EquationEditor must unmount after 150ms fade-out"
        );
    }

    #[test]
    fn mobile_keyboard_toolbar_long_press_bidi_and_embed_doc_click_work_end_to_end() {
        let session = open(390, 844, PlaygroundTheme::Light);
        session.edit(|page| {
            page.add_block(
                "bidi-p",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: "Hello \u{05E9}\u{05DC}\u{05D5}\u{05DD} \u{0645}\u{0631}\u{062D}\u{0628}\u{0627} world".into(),
                },
                Some("showcase-note"),
                Some(0),
                4_000_000,
            )
            .expect("add bidi paragraph");
            page.add_block(
                "embed-card",
                BlockSpec::EmbedLinkedDoc {
                    page_id: "doc:linked-target".into(),
                    style: "horizontal".into(),
                    caption: String::new(),
                },
                Some("showcase-note"),
                Some(1),
                4_000_001,
            )
            .expect("add embed card");
        });

        session.overlay(OverlayEvent::SetKeyboardToolbarVisible(true));
        let frame = session.frame();
        assert_no_violations(&frame, "mobile keyboard toolbar");
        let bar = element(&frame, "overlay.keyboard_toolbar");
        assert_eq!(bar.bounds.height, KEYBOARD_TOOLBAR_HEIGHT);
        for id in [
            "overlay.keyboard_toolbar.more_panel",
            "overlay.keyboard_toolbar.text_style",
            "overlay.keyboard_toolbar.undo",
            "overlay.keyboard_toolbar.dismiss",
        ] {
            let btn = element(&frame, id);
            assert!(
                btn.bounds.width >= 44.0 && btn.bounds.height >= 44.0,
                "{id} < 44x44"
            );
        }

        // Long-press on the bidi paragraph selects an ICU word and autoShows the `Aa` sub-toolbar.
        let bidi_bounds = element(&frame, "page.block.bidi-p").bounds;
        session.overlay(OverlayEvent::LongPressWord {
            x: bidi_bounds.x + 10.0,
            y: bidi_bounds.y + 10.0,
        });
        let sel = session.selection().expect("word selection");
        assert_eq!(sel.0, "bidi-p");
        assert!(sel.3 > sel.1, "long-press must select a non-empty ICU word");
        let sub_frame = session.frame();
        assert_no_violations(&sub_frame, "mobile keyboard toolbar autoShow Aa");
        let bold_btn = element(&sub_frame, "overlay.keyboard_toolbar.bold");
        assert!(bold_btn.bounds.width >= 44.0 && bold_btn.bounds.height >= 44.0);

        // Clicking Bold on KeyboardToolbar applies bold in one undoable step.
        session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Bold));
        let after_bold = session.text("bidi-p");
        assert!(after_bold.delta.iter().any(|op| matches!(
            op,
            TextDeltaOp::Insert { format: Some(f), .. } if f.get("bold") == Some(&Any::True)
        )));
        session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Undo));
        let after_undo = session.text("bidi-p");
        assert!(after_undo.delta.iter().all(|op| !matches!(
            op,
            TextDeltaOp::Insert { format: Some(f), .. } if f.get("bold") == Some(&Any::True)
        )));

        // Clicking EmbedLinkedDoc triggers OpenEmbedDoc callback state.
        session.overlay(OverlayEvent::OpenEmbedDoc {
            page_id: "doc:linked-target".into(),
        });
        assert_eq!(
            session.view(|v, _| v.last_opened_embed_doc().map(str::to_string)),
            Some("doc:linked-target".to_string())
        );

        // Dismiss hides the keyboard toolbar.
        session.overlay(OverlayEvent::KeyboardToolbar(
            KeyboardToolbarAction::Dismiss,
        ));
        let dismissed = session.frame();
        assert!(!dismissed.elements.contains_key("overlay.keyboard_toolbar"));
    }

    #[test]
    fn mobile_keyboard_toolbar_horizontal_scroll_reaches_all_actions_on_390px() {
        let session = open(390, 844, PlaygroundTheme::Light);
        session.view(|v, cx| {
            v.set_image_picker(Some(std::rc::Rc::new(|| {})));
            cx.notify();
        });
        session.edit(|page| {
            page.add_block(
                "mob-p",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: "Tap toolbar".into(),
                },
                Some("showcase-note"),
                Some(0),
                4_100_000,
            )
            .expect("add mobile paragraph");
        });
        // Collapsed caret starts on top-level bar (0.27.5 defaultKeyboardToolbarConfig).
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
            "mob-p", 0,
        ))));
        session.overlay(OverlayEvent::SetKeyboardToolbarVisible(true));

        let visible_top: Vec<&str> = DEFAULT_KEYBOARD_TOOLBAR_ITEMS
            .iter()
            .filter(|i| i.is_visible())
            .map(ToolbarItemSpec::id)
            .collect();
        let mut seen = std::collections::HashSet::new();
        for _ in 0..8 {
            let frame = session.frame();
            assert_no_violations(&frame, "mobile toolbar top horizontal scroll");
            assert!(
                !frame.elements.contains_key("overlay.keyboard_toolbar.more"),
                "mobile toolbar must scroll horizontally without a More pagination button"
            );
            let dismiss = element(&frame, "overlay.keyboard_toolbar.dismiss");
            assert!(dismiss.bounds.width >= 44.0 && dismiss.bounds.height >= 44.0);
            for &id in &visible_top {
                let full_id = format!("overlay.keyboard_toolbar.{id}");
                if let Some(el) = frame.elements.get(full_id.as_str()) {
                    assert!(
                        el.bounds.width >= 44.0 && el.bounds.height >= 44.0,
                        "{full_id} < 44x44"
                    );
                    seen.insert(id);
                }
            }
            session.overlay(OverlayEvent::KeyboardToolbarScroll(-138.0));
        }
        for &id in &visible_top {
            assert!(
                seen.contains(id),
                "top-level item {id} unreachable via horizontal scroll on 390px viewport"
            );
        }

        // Open `+` (`moreToolPanel`): H1, To-do, Code Block, Linked Page all work in 1 Undo step.
        session.overlay(OverlayEvent::KeyboardToolbar(
            KeyboardToolbarAction::ToggleMorePanel,
        ));
        let panel_frame = session.frame();
        assert_no_violations(&panel_frame, "mobile toolbar more panel");
        assert!(
            panel_frame
                .elements
                .contains_key("overlay.keyboard_toolbar.panel")
        );
        session.click(&panel_frame, "overlay.keyboard_toolbar.panel.basic.h1");
        assert!(session.frame().elements.contains_key("page.block.mob-p"));
        session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Undo));

        session.overlay(OverlayEvent::KeyboardToolbar(
            KeyboardToolbarAction::ToggleMorePanel,
        ));
        let todo_frame = session.frame();
        session.click(&todo_frame, "overlay.keyboard_toolbar.panel.list.todo");
        session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Undo));

        session.overlay(OverlayEvent::KeyboardToolbar(
            KeyboardToolbarAction::ToggleMorePanel,
        ));
        let code_frame = session.frame();
        session.click(
            &code_frame,
            "overlay.keyboard_toolbar.panel.basic.code_block",
        );
        session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Undo));

        // Non-collapsed selection autoShows `Aa` sub-toolbar with Strike, Link, Highlight
        // while suppressing the floating desktop FormatToolbar (`0.27.5` `widgets/toolbar/src/view.ts`).
        session.select("mob-p", "Tap");
        let aa_frame = session.frame();
        assert_no_violations(&aa_frame, "mobile toolbar autoShow Aa");
        assert!(
            !aa_frame.elements.contains_key("overlay.format_toolbar"),
            "floating desktop FormatToolbar must stay suppressed while mobile KeyboardToolbar is visible"
        );
        assert!(
            aa_frame
                .elements
                .contains_key("overlay.keyboard_toolbar.back")
        );
        assert!(
            aa_frame
                .elements
                .contains_key("overlay.keyboard_toolbar.bold")
        );
        assert!(
            aa_frame
                .elements
                .contains_key("overlay.keyboard_toolbar.strike")
        );

        // Dismiss hides the bar cleanly.
        session.click(&aa_frame, "overlay.keyboard_toolbar.dismiss");
        let dismissed = session.frame();
        assert!(!dismissed.elements.contains_key("overlay.keyboard_toolbar"));
    }

    #[test]
    fn table_cell_canvas_click_edits_cell_and_undoes_in_one_step() {
        let session = open(1280, 800, PlaygroundTheme::Light);
        session.edit(|page| {
            page.add_block(
                "tbl-edit",
                BlockSpec::Table {
                    rows: vec![
                        vec!["Key".into(), "Value".into()],
                        vec!["Engine".into(), "OldVal".into()],
                    ],
                },
                Some("showcase-note"),
                Some(0),
                0,
            )
            .expect("add table");
        });
        session.platform.advance_clock(Duration::from_millis(700));
        session.select("showcase-intro", "bold");
        let frame = session.frame();
        assert!(frame.elements.contains_key("page.local_caret"));

        // Click table cell (row-1, col-1) on canvas to enter in-place live editing (no popover).
        session.click(&frame, "page.block.tbl-edit.cell.row-1.col-1");
        session.platform.advance_clock(Duration::from_millis(160));
        session.platform.run_until_parked();
        let opened = session.frame();
        assert!(
            session.view(|v, _| v.active_table_cell().is_some()),
            "clicking a table cell must focus it in place"
        );
        assert!(
            !opened.elements.contains_key("overlay.table_cell_editor"),
            "legacy table cell popover must not exist"
        );
        assert!(
            !opened.elements.contains_key("page.local_caret"),
            "body caret must be hidden while table cell is focused"
        );
        assert!(
            opened.elements.contains_key("page.table_cell_caret"),
            "in-place table cell caret must be shown while table cell is focused"
        );

        // Replace cell text directly in place (splices live Y.Text immediately).
        session.app.update(|cx| {
            session
                .window
                .update(cx, |v, window, cx| {
                    let len = v
                        .active_table_cell()
                        .map(|c| c.input.text.encode_utf16().count())
                        .unwrap_or(0);
                    v.replace_text_in_range(Some(0..len), "NewVal", window, cx);
                })
                .unwrap();
        });
        let committed = session.frame();
        assert_eq!(
            element(&committed, "page.block.tbl-edit.cell.row-1.col-1")
                .text
                .as_deref(),
            Some("NewVal")
        );

        // Single-step undo restores "OldVal".
        session.overlay(OverlayEvent::KeyboardToolbar(KeyboardToolbarAction::Undo));
        let undone = session.frame();
        assert_eq!(
            element(&undone, "page.block.tbl-edit.cell.row-1.col-1")
                .text
                .as_deref(),
            Some("OldVal")
        );
    }
}
