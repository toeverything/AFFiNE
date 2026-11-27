//! Granular deletion (word/line), quote soft-newline/exit, adjacent block selection,
//! and sibling block reordering shortcuts for `PlaygroundView`.

use blocksuite_playground_doc::{DocResult, read::BlockContent, schema::ParagraphType};
use ui::{Context, Modifiers, Window};

use super::*;
use crate::block_flow::{FlowBlock, FlowKind};
use crate::rich_text::TextBiIndex;

pub(crate) use blocksuite_editor::editor_session::{next_word_end_utf16, prev_word_start_utf16};

/// True for non-mergeable blocks that Backspace (at block start) or Delete (at block end)
/// should select into `block_selection` on first press before deleting on second press.
pub(crate) fn is_selectable_non_mergeable_block(kind: FlowKind) -> bool {
    matches!(
        kind,
        FlowKind::Divider
            | FlowKind::Code
            | FlowKind::Image
            | FlowKind::Bookmark
            | FlowKind::Database
    )
}

impl PlaygroundView {
    pub(crate) fn fresh_block_id(&mut self) -> String {
        loop {
            self.editor.next_id += 1;
            let id = format!(
                "native-{:x}-{:x}",
                self.state.awareness.local_client_id(),
                self.editor.next_id
            );
            if self.page_snapshot().is_none_or(|s| s.block(&id).is_none()) {
                return id;
            }
        }
    }

    /// Handle `Alt/Ctrl+Backspace`, `Alt/Ctrl+Delete`, and macOS `Cmd+Backspace` (delete to
    /// visual line start) when the selection is a collapsed caret.
    pub(crate) fn delete_with_modifiers(
        &mut self,
        key: &str,
        m: Modifiers,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult<bool> {
        let Some(sel) = self.editor.selection.clone() else {
            return Ok(false);
        };
        if !sel.empty() {
            return Ok(false);
        }
        let word = (m.alt || m.control) && !m.platform;
        let line_start = m.platform && key == "backspace";
        if !word && !line_start {
            return Ok(false);
        }
        let id = sel.focus.block_id.clone();
        let offset = sel.focus.offset();
        let Some(text) = self.block_text(&id).map(str::to_owned) else {
            return Ok(false);
        };
        let n = text.encode_utf16().count() as u64;
        let target = if line_start {
            if offset == 0 {
                return Ok(false);
            }
            let layout_start = self
                .flow_layout()
                .and_then(|layout| {
                    let block = layout.block(&id)?;
                    let rect = block.caret_rect(sel.focus.caret)?;
                    block
                        .hit_text(-1.0, rect.y + rect.h * 0.5)
                        .map(|c| c.utf16_offset)
                })
                .unwrap_or(0);
            if layout_start < offset {
                layout_start
            } else {
                TextBiIndex::new(&text).prev_grapheme_utf16(offset)
            }
        } else if key == "backspace" {
            if offset == 0 {
                return Ok(false);
            }
            prev_word_start_utf16(&text, offset)
        } else {
            if offset >= n {
                return Ok(false);
            }
            next_word_end_utf16(&text, offset)
        };
        if target == offset {
            return Ok(false);
        }
        let range = DocumentSelection {
            anchor: sel.focus.clone(),
            focus: DocPoint::new(&id, target),
        };
        let before = sel.snapshot(self.page_mut()?)?;
        let rev_before = self.doc_rev;
        self.editor.last_typing = None;
        self.replace_selection(range, "", w, cx)?;
        if self.doc_rev != rev_before {
            self.page_mut()?.set_undo_selection_snapshot(before)?;
        }
        self.editor.last_typing = None;
        Ok(true)
    }

    /// Handle `Enter` inside a `ParagraphType::Quote` block:
    /// - Normally inserts a soft newline `\n` inside the quote block.
    /// - When the caret is on a trailing empty line (`offset == n && text.ends_with('\n')`)
    ///   or the entire quote block is empty, strips the trailing `\n` (if any) and inserts
    ///   a new `ParagraphType::Text` block below to exit the quote.
    pub(crate) fn handle_quote_enter(
        &mut self,
        sel: &DocumentSelection,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult<bool> {
        let Some(snapshot) = self.snapshot.clone() else {
            return Ok(false);
        };
        let id = &sel.focus.block_id;
        let Some(node) = snapshot.block(id) else {
            return Ok(false);
        };
        if !matches!(
            node.content,
            BlockContent::Paragraph {
                kind: ParagraphType::Quote,
                ..
            }
        ) {
            return Ok(false);
        }
        let text = text_content(node).unwrap_or("");
        let n = text.encode_utf16().count() as u64;
        let offset = sel.focus.offset();
        let trailing_empty_line = sel.empty() && offset == n && text.ends_with('\n');
        let empty_quote = sel.empty() && text.is_empty();
        if trailing_empty_line || empty_quote {
            let Some((parent, slot)) = parent_of(&snapshot, id) else {
                return Ok(false);
            };
            let now = self.now_ms(cx) as u64;
            let new_id = self.fresh_block_id();
            let id_owned = id.clone();
            let parent_id = parent.id.clone();
            let insert_at = slot as u64 + 1;
            let page = self.page_mut()?;
            let before = sel.snapshot(page)?;
            page.stop_capturing()?;
            let commit = page.structural_edit(now, |page| {
                if trailing_empty_line {
                    page.remove_text(&id_owned, "prop:text", n - 1, 1, now)?;
                }
                page.add_block(&new_id, paragraph(), Some(&parent_id), Some(insert_at), now)?;
                Ok(())
            })?;
            if commit.is_some() {
                self.page_mut()?.set_undo_selection_snapshot(before)?;
            }
            self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(new_id, 0)));
            self.editor.last_typing = None;
            self.did_edit(commit, None, w, cx);
            return Ok(true);
        }
        self.replace_selection(sel.clone(), "\n", w, cx)?;
        Ok(true)
    }

    /// Select an adjacent non-mergeable block (`Divider`, `Code`, `Image`, `Bookmark`, `Database`)
    /// into `block_selection` on the first Backspace/Delete press (desktop only so mobile does not
    /// dismiss the software keyboard). When `remove_empty_block` is provided (empty paragraph on
    /// backward Backspace), removes the empty block first.
    pub(crate) fn try_select_adjacent_block(
        &mut self,
        adjacent: &FlowBlock,
        remove_empty_block: Option<&str>,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        if f32::from(w.viewport_size().width) < crate::overlays::SCROLLBAR_DESKTOP_MIN_WIDTH
            || self.last_keyboard_inset > 0.0
            || !is_selectable_non_mergeable_block(adjacent.body.kind)
        {
            return false;
        }
        if let Some(empty_id) = remove_empty_block {
            let now = self.now_ms(cx) as u64;
            if let Ok(page) = self.page_mut()
                && let Ok(commit) = page.remove_lifting_children(empty_id, now)
            {
                self.did_edit(commit, None, w, cx);
            }
        }
        self.editor.selection = None;
        self.editor.block_selection = vec![adjacent.block_id.clone()];
        self.editor.pending_marks.clear();
        self.announce_selection(cx);
        w.notify_text_selection_changed(&self.editor_focus);
        cx.notify();
        true
    }

    /// Move the currently focused body block (or selected sibling blocks) up or down by one
    /// sibling slot in a single undo step (`Mod+Alt+Up/Down` or `Ctrl+Shift+Up/Down`).
    pub(crate) fn move_block_by_shortcut(
        &mut self,
        up: bool,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult<bool> {
        let Some(snapshot) = self.snapshot.clone() else {
            return Ok(false);
        };
        let now = self.now_ms(cx) as u64;
        if !self.editor.block_selection.is_empty() {
            let first_id = self.editor.block_selection[0].clone();
            let Some((parent, _)) = parent_of(&snapshot, &first_id) else {
                return Ok(false);
            };
            let parent_id = parent.id.clone();
            let indices: Vec<(usize, String)> = parent
                .children
                .iter()
                .enumerate()
                .filter(|(_, c)| self.editor.block_selection.iter().any(|id| id == &c.id))
                .map(|(pos, c)| (pos, c.id.clone()))
                .collect();
            if indices.is_empty() {
                return Ok(false);
            }
            let child_count = parent.children.len();
            if up && indices[0].0 == 0 {
                return Ok(true);
            }
            if !up && indices.last().unwrap().0 + 1 >= child_count {
                return Ok(true);
            }
            let page = self.page_mut()?;
            page.stop_capturing()?;
            let commit = page.structural_edit(now, |page| {
                if up {
                    for (pos, id) in &indices {
                        page.reparent_block(id, &parent_id, &parent_id, (*pos - 1) as u64, now)?;
                    }
                } else {
                    for (pos, id) in indices.iter().rev() {
                        page.reparent_block(id, &parent_id, &parent_id, (*pos + 1) as u64, now)?;
                    }
                }
                Ok(())
            })?;
            self.editor.last_typing = None;
            self.did_edit(commit, None, w, cx);
            return Ok(true);
        }
        let Some(sel) = self.editor.selection.clone() else {
            return Ok(false);
        };
        let id = sel.focus.block_id.clone();
        if snapshot.root.as_ref().is_some_and(|r| r.id == id) {
            return Ok(false);
        }
        let Some((parent, pos)) = parent_of(&snapshot, &id) else {
            return Ok(false);
        };
        let target_pos = if up {
            if pos == 0 {
                return Ok(true);
            }
            pos - 1
        } else {
            if pos + 1 >= parent.children.len() {
                return Ok(true);
            }
            pos + 1
        };
        let parent_id = parent.id.clone();
        let page = self.page_mut()?;
        let before = sel.snapshot(page)?;
        page.stop_capturing()?;
        let commit = page.reparent_block(&id, &parent_id, &parent_id, target_pos as u64, now)?;
        if commit.is_some() {
            self.page_mut()?.set_undo_selection_snapshot(before)?;
        }
        self.editor.selection = Some(sel);
        self.editor.last_typing = None;
        self.did_edit(commit, None, w, cx);
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use blocksuite_playground_doc::schema::{BlockSpec, ListType, ParagraphType};
    use ui::{AppContext, EntityInputHandler, KeyDownEvent, Keystroke};

    fn key_event(key: &str, modifiers: Modifiers) -> KeyDownEvent {
        KeyDownEvent {
            keystroke: Keystroke {
                modifiers,
                key: key.to_string(),
                key_char: None,
            },
            is_held: false,
            prefer_character_input: false,
        }
    }

    #[test]
    fn word_boundary_helpers_handle_cjk_mixed_whitespace_and_punctuation() {
        for (text, off, expected_prev) in [
            ("hello world", 11, 6),
            ("hello   ", 8, 0),
            ("a\nb", 3, 2),
            ("a\nb", 2, 1),
            ("今天天气很好我们去公园散步", 13, 11),
            ("今天天气很好我们去公园散步", 11, 9),
            ("今天天气很好我们去公园散步", 9, 8),
            ("今天天气很好我们去公园散步", 8, 6),
            ("今天天气很好我们去公园散步", 6, 4),
            ("今天天气很好我们去公园散步", 4, 2),
            ("今天天气很好我们去公园散步", 2, 0),
        ] {
            assert_eq!(
                prev_word_start_utf16(text, off),
                expected_prev,
                "{text}@{off}"
            );
        }
        // Verify CJK, Japanese, mixed, and ASCII sentences step monotonically word-by-word
        // without collapsing an entire sentence into a single word.
        for (sentence, min_steps) in [
            ("今天天气很好我们去公园散步", 5usize),
            ("我想把这个文档分享给团队里的同事", 5),
            ("東京都に住んでいます", 4),
            ("hello 世界你好 world", 4),
            ("foo.bar baz_qux  end", 3),
        ] {
            let total = sentence.encode_utf16().count() as u64;
            let mut cur = total;
            let mut back_steps = 0usize;
            while cur > 0 {
                let next = prev_word_start_utf16(sentence, cur);
                assert!(next < cur, "backward stuck on {sentence}@{cur}");
                cur = next;
                back_steps += 1;
            }
            assert!(
                back_steps >= min_steps,
                "expected >= {min_steps} backward steps for {sentence}, got {back_steps}"
            );

            let mut cur = 0;
            let mut fwd_steps = 0usize;
            while cur < total {
                let next = next_word_end_utf16(sentence, cur);
                assert!(next > cur, "forward stuck on {sentence}@{cur}");
                cur = next;
                fwd_steps += 1;
            }
            assert!(
                fwd_steps >= min_steps,
                "expected >= {min_steps} forward steps for {sentence}, got {fwd_steps}"
            );
        }
    }

    #[test]
    fn page_edit_boundaries_navigation_deletion_paste_move_and_placeholder() {
        let platform = ui::HeadlessPlatform::new(1280, 800, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let win = app
            .update(|cx| {
                cx.open_window(ui::WindowOptions::default(), |_, cx| {
                    cx.new(PlaygroundView::new)
                })
            })
            .unwrap();
        let hw = platform.windows().into_iter().next().unwrap();

        // Seed a focused deterministic test doc.
        app.update(|cx| {
            win.update(cx, |view, _, cx| {
                let page = view.page_mut().unwrap();
                let snap = page.read_page_snapshot().unwrap();
                let root = snap.root.as_ref().unwrap();
                let note = root
                    .children
                    .iter()
                    .find(|c| c.is_page_visible_note())
                    .unwrap();
                let note_id = note.id.clone();
                let mut t = 1000u64;
                for c in &note.children {
                    t += 1;
                    let _ = page.delete_block_subtree(&note_id, &c.id, t);
                }
                page.add_block(
                    "p1",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "hello world foo".into(),
                    },
                    Some(&note_id),
                    None,
                    t + 1,
                )
                .unwrap();
                page.add_block("div1", BlockSpec::Divider, Some(&note_id), None, t + 2)
                    .unwrap();
                page.add_block(
                    "q1",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Quote,
                        text: "quote line".into(),
                    },
                    Some(&note_id),
                    None,
                    t + 3,
                )
                .unwrap();
                page.add_block(
                    "l1",
                    BlockSpec::List {
                        list_type: ListType::Bulleted,
                        text: "parent".into(),
                        checked: false,
                        order: None,
                    },
                    Some(&note_id),
                    None,
                    t + 4,
                )
                .unwrap();
                page.add_block(
                    "l2",
                    BlockSpec::List {
                        list_type: ListType::Bulleted,
                        text: "child".into(),
                        checked: false,
                        order: None,
                    },
                    Some("l1"),
                    None,
                    t + 5,
                )
                .unwrap();
                page.add_block(
                    "empty_p",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "".into(),
                    },
                    Some(&note_id),
                    None,
                    t + 6,
                )
                .unwrap();
                view.refresh_document();
                cx.notify();
            })
            .unwrap();
        });
        hw.request_frame();

        app.update(|cx| {
            win.update(cx, |view, w, cx| {
                assert!(
                    view.flow_layout()
                        .and_then(|l| l.block("p1").map(|_| ()))
                        .is_some(),
                    "p1 must be laid out"
                );
                // F1: Shift+Up and Shift+Left from start of first body block must NOT cross into Title.
                view.change_selection(DocumentSelection::caret(DocPoint::new("p1", 0)), w, cx);
                let shift = Modifiers {
                    shift: true,
                    ..Default::default()
                };
                view.editor_key_down(&key_event("up", shift), w, cx);
                assert_eq!(view.document_selection().unwrap().focus.block_id, "p1");
                view.editor_key_down(&key_event("left", shift), w, cx);
                assert_eq!(view.document_selection().unwrap().focus.block_id, "p1");

                // F2: Ctrl+Right word movement & Ctrl+Shift+Right selection; Ctrl+End jumps to last body block end.
                let ctrl = Modifiers {
                    control: true,
                    ..Default::default()
                };
                view.editor_key_down(&key_event("right", ctrl), w, cx);
                assert_eq!(view.document_selection().unwrap().focus.offset(), 5);
                view.editor_key_down(&key_event("end", ctrl), w, cx);
                assert_eq!(view.document_selection().unwrap().focus.block_id, "empty_p");

                // F3: Ctrl+Backspace deletes whole word "foo".
                view.change_selection(DocumentSelection::caret(DocPoint::new("p1", 15)), w, cx);
                view.editor_key_down(&key_event("backspace", ctrl), w, cx);
                assert_eq!(view.block_text("p1").unwrap(), "hello world ");

                // F9: Pasting URL over selected "world" sets link mark without replacing text.
                view.change_selection(
                    DocumentSelection {
                        anchor: DocPoint::new("p1", 6),
                        focus: DocPoint::new("p1", 11),
                    },
                    w,
                    cx,
                );
                view.paste(
                    ui::ClipboardItem::new_string("https://affine.pro".into()),
                    w,
                    cx,
                );
                assert_eq!(view.block_text("p1").unwrap(), "hello world ");
                let (rich, _) = view.page().unwrap().read_editable_text("p1").unwrap();
                assert!(rich.delta.iter().any(|op| matches!(
                    op,
                    y_octo::TextDeltaOp::Insert { format: Some(f), .. }
                        if f.get("link") == Some(&y_octo::Any::String("https://affine.pro".into()))
                )));

                // F5: Quote Enter inserts soft newline; second Enter at trailing newline exits quote.
                view.change_selection(DocumentSelection::caret(DocPoint::new("q1", 10)), w, cx);
                view.editor_key_down(&key_event("enter", Modifiers::default()), w, cx);
                assert_eq!(view.block_text("q1").unwrap(), "quote line\n");
                view.editor_key_down(&key_event("enter", Modifiers::default()), w, cx);
                assert_eq!(view.block_text("q1").unwrap(), "quote line");
                let exited_id = view.document_selection().unwrap().focus.block_id.clone();
                assert_ne!(exited_id, "q1");

                // F6: Backspace at start of Text block after div1 selects div1 into block_selection first.
                // (q1 is a Quote so first Backspace unwraps Quote -> Text, second selects div1.)
                view.change_selection(DocumentSelection::caret(DocPoint::new("q1", 0)), w, cx);
                view.editor_key_down(&key_event("backspace", Modifiers::default()), w, cx);
                view.editor_key_down(&key_event("backspace", Modifiers::default()), w, cx);
                assert_eq!(view.block_selection(), &["div1".to_string()]);
                // Delete at end of p1 (before div1) also selects div1 first.
                view.change_selection(DocumentSelection::caret(DocPoint::new("p1", 12)), w, cx);
                view.editor_key_down(&key_event("delete", Modifiers::default()), w, cx);
                assert_eq!(view.block_selection(), &["div1".to_string()]);

                // F7: Nested list item l2 at block start Backspace converts in-place to Paragraph under l1.
                view.change_selection(DocumentSelection::caret(DocPoint::new("l2", 0)), w, cx);
                view.editor_key_down(&key_event("backspace", Modifiers::default()), w, cx);
                let converted_id = view.document_selection().unwrap().focus.block_id.clone();
                let snap = view.page_snapshot().unwrap();
                let (parent, _) = parent_of(snap, &converted_id).unwrap();
                assert_eq!(
                    parent.id, "l1",
                    "nested list item must stay indented under l1"
                );
                assert!(matches!(
                    snap.block(&converted_id).unwrap().content,
                    BlockContent::Paragraph {
                        kind: ParagraphType::Text,
                        ..
                    }
                ));

                // Ctrl+Backspace on CJK sentence deletes only the final segmented word.
                view.change_selection(DocumentSelection::caret(DocPoint::new("empty_p", 0)), w, cx);
                view.replace_text_in_range(None, "今天天气很好我们去公园散步", w, cx);
                view.editor_key_down(&key_event("backspace", ctrl), w, cx);
                assert_eq!(
                    view.block_text("empty_p").unwrap(),
                    "今天天气很好我们去公园"
                );
                view.change_selection(
                    DocumentSelection {
                        anchor: DocPoint::new("empty_p", 0),
                        focus: DocPoint::new("empty_p", 11),
                    },
                    w,
                    cx,
                );
                view.replace_text_in_range(None, "", w, cx);

                // Down on last line of last block ("empty_p" after typing text) moves to end.
                view.change_selection(DocumentSelection::caret(DocPoint::new("empty_p", 0)), w, cx);
                view.replace_text_in_range(None, "tail", w, cx);
                view.change_selection(DocumentSelection::caret(DocPoint::new("empty_p", 0)), w, cx);
                view.editor_key_down(&key_event("down", Modifiers::default()), w, cx);
                assert_eq!(view.document_selection().unwrap().focus.offset(), 4);

                // Move block shortcut: Ctrl+Shift+Up moves empty_p up one slot.
                let ctrl_shift = Modifiers {
                    control: true,
                    shift: true,
                    ..Default::default()
                };
                let before_pos = parent_of(view.page_snapshot().unwrap(), "empty_p")
                    .unwrap()
                    .1;
                view.editor_key_down(&key_event("up", ctrl_shift), w, cx);
                let after_pos = parent_of(view.page_snapshot().unwrap(), "empty_p")
                    .unwrap()
                    .1;
                assert_eq!(after_pos + 1, before_pos);

                // Focused empty paragraph placeholder: create fresh empty paragraph and focus it.
                view.change_selection(DocumentSelection::caret(DocPoint::new("empty_p", 4)), w, cx);
                view.editor_key_down(&key_event("enter", Modifiers::default()), w, cx);
            })
            .unwrap();
        });
        hw.request_frame();
        if let Ok(dir) = std::env::var("BS_RENDER_EVIDENCE_DIR") {
            let _ = std::fs::create_dir_all(&dir);
            let _ = app.update(|cx| {
                let _ = win.update(cx, |_, window, _| {
                    if let Ok(img) = window.render_to_image() {
                        let _ = img.save(format!("{dir}/after_empty_placeholder.png"));
                    }
                });
            });
        }
    }
}
