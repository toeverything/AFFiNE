//! Multi-block indent/outdent, batch block conversion, `Mod+Enter`, `PageUp/PageDown`,
//! and selection bracket/backtick wrapping for `PlaygroundView`.

use std::collections::BTreeSet;

use blocksuite_playground_doc::{
    DocResult,
    read::{BlockContent, BlockNode, PageSnapshot},
    schema::ParagraphType,
};
use ui::{Context, Window};
use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

use super::*;
use crate::overlays::SlashCommand;

pub(super) fn heading_level_of(kind: ParagraphType) -> Option<u8> {
    match kind {
        ParagraphType::H1 => Some(1),
        ParagraphType::H2 => Some(2),
        ParagraphType::H3 => Some(3),
        ParagraphType::H4 => Some(4),
        ParagraphType::H5 => Some(5),
        ParagraphType::H6 => Some(6),
        ParagraphType::Text | ParagraphType::Quote => None,
    }
}

/// Slot immediately after `parent.children[slot]`, skipping any siblings hidden under it when
/// `parent.children[slot]` is a collapsed heading.
pub(super) fn slot_after_collapsed_heading(parent: &BlockNode, slot: usize) -> usize {
    let mut index = slot + 1;
    let Some(BlockContent::Paragraph {
        kind,
        collapsed: true,
        ..
    }) = parent.children.get(slot).map(|n| &n.content)
    else {
        return index;
    };
    let Some(level) = heading_level_of(*kind) else {
        return index;
    };
    while let Some(sib) = parent.children.get(index) {
        if let BlockContent::Paragraph { kind: sib_kind, .. } = &sib.content
            && heading_level_of(*sib_kind).is_some_and(|next| next <= level)
        {
            break;
        }
        index += 1;
    }
    index
}

fn bracket_pair_close(open: &str) -> Option<&'static str> {
    match open {
        "(" => Some(")"),
        "[" => Some("]"),
        "{" => Some("}"),
        "\"" => Some("\""),
        "'" => Some("'"),
        "（" => Some("）"),
        "【" => Some("】"),
        "《" => Some("》"),
        "“" => Some("”"),
        "‘" => Some("’"),
        _ => None,
    }
}

/// Filter `ids` (in document order) to top-level non-root blocks whose ancestor is not also listed.
fn top_level_block_ids(snapshot: &PageSnapshot, ids: &[String]) -> Vec<String> {
    let root_id = snapshot.root.as_ref().map(|r| r.id.as_str());
    let set: BTreeSet<&str> = ids.iter().map(String::as_str).collect();
    let mut seen: BTreeSet<&str> = BTreeSet::new();
    let mut out = Vec::new();
    for id in ids {
        if Some(id.as_str()) == root_id || !seen.insert(id.as_str()) {
            continue;
        }
        let mut cur = id.as_str();
        let mut ancestor_selected = false;
        while let Some((parent, _)) = parent_of(snapshot, cur) {
            if set.contains(parent.id.as_str()) {
                ancestor_selected = true;
                break;
            }
            cur = parent.id.as_str();
        }
        if !ancestor_selected {
            out.push(id.clone());
        }
    }
    out
}

impl PlaygroundView {
    /// Collect all content block IDs inside the active `ContentScope` in document pre-order,
    /// including blocks hidden under collapsed headings or toggles.
    pub(super) fn all_scope_block_ids(&self) -> Vec<String> {
        let Some(snapshot) = self.page_snapshot() else {
            return Vec::new();
        };
        let Some(root) = snapshot.root.as_ref() else {
            return Vec::new();
        };
        let scope = self.active_content_scope();
        let is_page = matches!(scope, ContentScope::Page);
        let mut out = Vec::new();
        fn collect(node: &BlockNode, is_page: bool, out: &mut Vec<String>) {
            if is_page && node.is_edgeless_only() {
                return;
            }
            out.push(node.id.clone());
            for child in &node.children {
                collect(child, is_page, out);
            }
        }
        for child in scope.content_roots(root) {
            collect(child, is_page, &mut out);
        }
        out
    }

    /// Indent or outdent one or more blocks in a single atomic undo step, preserving relative
    /// order for contiguous sibling runs and expanding any collapsed destination parent.
    pub(super) fn indent_or_outdent_blocks(
        &mut self,
        block_ids: &[String],
        outdent: bool,
        preserve_text_sel: Option<DocumentSelection>,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult<bool> {
        if self.mode == crate::PlaygroundMode::Page && self.page_readonly {
            return Ok(false);
        }
        let Some(snapshot) = self.snapshot.clone() else {
            return Ok(false);
        };
        let top = top_level_block_ids(&snapshot, block_ids);
        if top.is_empty() {
            return Ok(false);
        }
        let now = self.now_ms(cx) as u64;
        let before = preserve_text_sel
            .as_ref()
            .and_then(|s| self.page().and_then(|p| s.snapshot(p).ok()));

        let commit = if outdent {
            let targets: Vec<String> = top
                .into_iter()
                .filter(|id| {
                    parent_of(&snapshot, id).is_some_and(|(parent, _)| {
                        matches!(
                            parent.content,
                            BlockContent::List { .. } | BlockContent::Paragraph { .. }
                        ) && parent_of(&snapshot, &parent.id).is_some()
                    })
                })
                .collect();
            if targets.is_empty() {
                return Ok(false);
            }
            let page = self.page_mut()?;
            page.stop_capturing()?;
            page.structural_edit(now, |page| {
                for id in targets.iter().rev() {
                    page.dedent_block(id, now)?;
                }
                Ok(())
            })?
        } else {
            // Group contiguous selected top-level siblings under the same parent so all items in
            // a run indent into the sibling immediately preceding the run (0.27.5 parity).
            let mut plans: Vec<(String, String, u64, Vec<String>)> = Vec::new();
            let mut i = 0;
            while i < top.len() {
                let Some((parent, first_pos)) = parent_of(&snapshot, &top[i]) else {
                    i += 1;
                    continue;
                };
                let mut end = i + 1;
                let mut prev_pos = first_pos;
                while end < top.len() {
                    if let Some((p2, pos2)) = parent_of(&snapshot, &top[end])
                        && p2.id == parent.id
                        && pos2 == prev_pos + 1
                    {
                        prev_pos = pos2;
                        end += 1;
                    } else {
                        break;
                    }
                }
                if let Some(dest) = first_pos
                    .checked_sub(1)
                    .and_then(|idx| parent.children.get(idx))
                    .filter(|b| crate::overlays::can_accept_nested_child(b))
                {
                    plans.push((
                        parent.id.clone(),
                        dest.id.clone(),
                        dest.children.len() as u64,
                        top[i..end].to_vec(),
                    ));
                }
                i = end;
            }
            if plans.is_empty() {
                return Ok(false);
            }
            let page = self.page_mut()?;
            page.stop_capturing()?;
            page.structural_edit(now, |page| {
                for (old_parent, dest_id, base_idx, group) in &plans {
                    for (offset, id) in group.iter().enumerate() {
                        page.reparent_block(
                            id,
                            old_parent,
                            dest_id,
                            *base_idx + offset as u64,
                            now,
                        )?;
                    }
                }
                Ok(())
            })?
        };
        if commit.is_some()
            && let Some(snap) = before
        {
            self.page_mut()?.set_undo_selection_snapshot(snap)?;
        }
        if let Some(sel) = preserve_text_sel {
            self.editor.selection = Some(sel);
        }
        self.editor.last_typing = None;
        self.did_edit(commit, None, w, cx);
        Ok(true)
    }

    /// Batch-convert all convertible text blocks in `block_selection` in a single atomic undo step.
    pub(super) fn convert_selected_blocks(
        &mut self,
        command: SlashCommand,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult<bool> {
        if self.mode == crate::PlaygroundMode::Page && self.page_readonly {
            return Ok(false);
        }
        if self.editor.block_selection.is_empty() {
            return Ok(false);
        }
        if command == SlashCommand::Divider {
            if let Some(last_id) = self.editor.block_selection.last().cloned() {
                self.editor.block_selection.clear();
                self.editor.block_selection_anchor = None;
                self.editor.block_selection_focus = None;
                self.run_slash_command(&last_id, command, false, w, cx)?;
                return Ok(true);
            }
            return Ok(false);
        }
        if matches!(command, SlashCommand::NewDoc | SlashCommand::LinkedDoc) {
            return Ok(false);
        }
        let Some(snapshot) = self.snapshot.clone() else {
            return Ok(false);
        };
        let target_flavour = command.block_spec().flavour();
        let mut ops: Vec<(String, String, bool)> = Vec::new();
        for id in self.editor.block_selection.clone() {
            let Some(node) = snapshot.block(&id) else {
                continue;
            };
            if !matches!(
                node.flavour.as_str(),
                "affine:paragraph" | "affine:list" | "affine:code"
            ) {
                continue;
            }
            let same = node.flavour == target_flavour;
            let replacement = if same {
                id.clone()
            } else {
                self.fresh_block_id()
            };
            ops.push((id, replacement, same));
        }
        if ops.is_empty() {
            return Ok(false);
        }
        let now = self.now_ms(cx) as u64;
        let page = self.page_mut()?;
        page.stop_capturing()?;
        let commit = page.structural_edit(now, |page| {
            for (old_id, new_id, _) in &ops {
                page.convert_block_flavour(old_id, new_id, command.block_spec(), now)?;
            }
            Ok(())
        })?;
        let remap = |id: &str| -> String {
            ops.iter()
                .find(|(old, _, _)| old == id)
                .map_or_else(|| id.to_owned(), |(_, new, _)| new.clone())
        };
        self.editor.block_selection = self
            .editor
            .block_selection
            .iter()
            .map(|id| remap(id))
            .collect();
        self.editor.block_selection_anchor =
            self.editor.block_selection_anchor.as_deref().map(remap);
        self.editor.block_selection_focus = self.editor.block_selection_focus.as_deref().map(remap);
        self.editor.last_typing = None;
        self.did_edit(commit, None, w, cx);
        Ok(true)
    }

    /// `Cmd/Ctrl+Enter` (`Mod-Enter`): exit code block or insert a new empty paragraph below
    /// without splitting the current block's text (or insert a newline in a Quote block).
    pub(super) fn handle_mod_enter(&mut self, w: &mut Window, cx: &mut Context<Self>) -> DocResult {
        if self.mode == crate::PlaygroundMode::Page && self.page_readonly {
            return Ok(());
        }
        let Some(sel) = self.editor.selection.clone() else {
            return Ok(());
        };
        let Some(snapshot) = self.snapshot.clone() else {
            return Ok(());
        };
        let id = sel.focus.block_id.clone();
        let Some(node) = snapshot.block(&id) else {
            return Ok(());
        };
        if matches!(
            node.content,
            BlockContent::Paragraph {
                kind: ParagraphType::Quote,
                ..
            }
        ) {
            return self.replace_selection(sel, "\n", w, cx);
        }
        let (parent_id, insert_slot) = if matches!(node.content, BlockContent::Page { .. }) {
            let Some(note) = node.children.iter().find(|n| n.is_page_visible_note()) else {
                return Ok(());
            };
            (note.id.clone(), 0usize)
        } else {
            let Some((parent, slot)) = parent_of(&snapshot, &id) else {
                return Ok(());
            };
            (
                parent.id.clone(),
                slot_after_collapsed_heading(parent, slot),
            )
        };
        let new_id = self.fresh_block_id();
        let now = self.now_ms(cx) as u64;
        let page = self.page_mut()?;
        let before = sel.snapshot(page)?;
        page.stop_capturing()?;
        let commit = page.add_block(
            &new_id,
            paragraph(),
            Some(&parent_id),
            Some(insert_slot as u64),
            now,
        )?;
        if commit.is_some() {
            self.page_mut()?.set_undo_selection_snapshot(before)?;
        }
        self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(new_id, 0)));
        self.editor.last_typing = None;
        self.did_edit(commit, None, w, cx);
        Ok(())
    }

    /// `PageUp` / `PageDown` (with optional `Shift` selection extension).
    pub(super) fn navigate_page(
        &mut self,
        up: bool,
        shift: bool,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let layout = if self.mode == crate::PlaygroundMode::Page {
            let width = page_geometry(f32::from(w.viewport_size().width)).column_width;
            self.ensure_layout(width, w)
        } else {
            self.flow_layout()
        };
        let Some(layout) = layout else {
            return;
        };
        let viewport_h = (f32::from(w.viewport_size().height) - TOPBAR_HEIGHT).max(60.0);
        let step = (viewport_h * 0.85).max(40.0);
        let max_scroll = (layout.height - viewport_h).max(0.0);
        let delta = if up { -step } else { step };

        let Some(sel) = self.editor.selection.clone() else {
            self.scroll_y = (self.scroll_y + delta).clamp(0.0, max_scroll).round();
            cx.notify();
            return;
        };
        let Some(block) = layout.block(&sel.focus.block_id) else {
            return;
        };
        let Some(rect) = block.caret_rect(sel.focus.caret) else {
            return;
        };
        let is_title = matches!(block.body.kind, block_flow::FlowKind::Title);
        let x = self.editor.goal_x.unwrap_or(rect.x);
        let target_y = (rect.y + delta).max(0.0);
        let candidates: Vec<&crate::block_flow::FlowBlock> = layout
            .blocks
            .iter()
            .filter(|b| {
                b.editable()
                    && if shift {
                        matches!(b.body.kind, block_flow::FlowKind::Title) == is_title
                    } else {
                        !matches!(b.body.kind, block_flow::FlowKind::Title) || is_title
                    }
            })
            .collect();
        let Some(first) = candidates.first() else {
            return;
        };
        let last = candidates.last().unwrap();
        let next_point = if up && target_y <= first.y {
            DocPoint::new(&first.block_id, 0)
        } else if !up && target_y >= last.rect().bottom() {
            let len = self
                .block_text(&last.block_id)
                .map_or(0, |s| s.encode_utf16().count() as u64);
            DocPoint::new(&last.block_id, len)
        } else {
            let target = candidates
                .iter()
                .copied()
                .min_by(|a, b| {
                    let dist = |blk: &crate::block_flow::FlowBlock| {
                        let r = blk.rect();
                        if target_y < r.y {
                            r.y - target_y
                        } else if target_y > r.bottom() {
                            target_y - r.bottom()
                        } else {
                            0.0
                        }
                    };
                    dist(a).total_cmp(&dist(b))
                })
                .unwrap();
            let clamped_y =
                target_y.clamp(target.y + 1.0, (target.rect().bottom() - 1.0).max(target.y));
            match target.hit_text(x, clamped_y) {
                Some(caret) => DocPoint {
                    block_id: target.block_id.clone(),
                    caret,
                },
                None => DocPoint::new(&target.block_id, 0),
            }
        };
        self.scroll_y = (self.scroll_y + delta).clamp(0.0, max_scroll).round();
        let next_sel = if shift {
            DocumentSelection {
                anchor: sel.anchor,
                focus: next_point,
            }
        } else {
            DocumentSelection::caret(next_point)
        };
        self.change_selection(next_sel, w, cx);
        self.editor.goal_x = Some(x);
    }

    /// Wrap a non-empty single-block text selection when typing `` ` `` (inline code mark)
    /// or an opening bracket/quote (`(`, `[`, `{`, `"`, `'`, `（`, `【`, ...), keeping the
    /// inner text selected in one atomic undo step (BlockSuite `bracket.ts:46-124` parity).
    pub(super) fn try_wrap_selection(
        &mut self,
        sel: &DocumentSelection,
        text: &str,
        layout: &FlowLayout,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult<bool> {
        if sel.empty() || sel.anchor.block_id != sel.focus.block_id {
            return Ok(false);
        }
        let Some((start, end, a, _, backward)) = sel.ordered(layout) else {
            return Ok(false);
        };
        let block = &layout.blocks[a];
        if matches!(block.body.kind, block_flow::FlowKind::Title) {
            return Ok(false);
        }
        let id = start.block_id.clone();
        let from = start.offset();
        let to = end.offset();
        let len = to.saturating_sub(from);
        if len == 0 {
            return Ok(false);
        }
        let now = self.now_ms(cx) as u64;

        if text == "`" && !matches!(block.body.kind, block_flow::FlowKind::Code) {
            let page = self.page_mut()?;
            let before = sel.snapshot(page)?;
            page.stop_capturing()?;
            let commit = page.format_text(
                &id,
                "prop:text",
                from,
                len,
                TextAttributes::from([("code".to_owned(), Any::True)]),
                now,
            )?;
            if commit.is_some() {
                page.set_undo_selection_snapshot(before)?;
            }
            self.editor.selection = Some(sel.clone());
            self.editor.last_typing = None;
            self.editor.preedit = None;
            self.did_edit(commit, Some(&id), w, cx);
            return Ok(true);
        }

        let Some(close) = bracket_pair_close(text) else {
            return Ok(false);
        };
        let mut delta = Vec::with_capacity(4);
        if from > 0 {
            delta.push(TextDeltaOp::Retain {
                retain: from,
                format: None,
            });
        }
        delta.push(TextDeltaOp::Insert {
            insert: TextInsert::Text(text.into()),
            format: None,
        });
        delta.push(TextDeltaOp::Retain {
            retain: len,
            format: None,
        });
        delta.push(TextDeltaOp::Insert {
            insert: TextInsert::Text(close.into()),
            format: None,
        });
        let page = self.page_mut()?;
        let before = sel.snapshot(page)?;
        page.stop_capturing()?;
        let commit = page.apply_text_delta(&id, "prop:text", &delta, now)?;
        if commit.is_some() {
            page.set_undo_selection_snapshot(before)?;
        }
        let open_len = text.encode_utf16().count() as u64;
        let new_start = DocPoint::new(&id, from + open_len);
        let new_end = DocPoint::new(&id, to + open_len);
        self.editor.selection = Some(if backward {
            DocumentSelection {
                anchor: new_end,
                focus: new_start,
            }
        } else {
            DocumentSelection {
                anchor: new_start,
                focus: new_end,
            }
        });
        self.editor.last_typing = None;
        self.editor.preedit = None;
        self.did_edit(commit, Some(&id), w, cx);
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use blocksuite_playground_doc::schema::{BlockSpec, ListType, ParagraphType};
    use ui::{AppContext, EntityInputHandler, KeyDownEvent, Keystroke, Modifiers};
    use y_octo::SessionValue;

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

    fn with_seeded_view(
        seed: impl FnOnce(&mut blocksuite_playground_doc::session::PageDocSession, &str),
        check: impl FnOnce(&mut PlaygroundView, &mut Window, &mut Context<PlaygroundView>),
    ) {
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
        app.update(|cx| {
            win.update(cx, |view, _, cx| {
                let page = view.page_mut().unwrap();
                let snap = page.read_page_snapshot().unwrap();
                let root = snap.root.as_ref().unwrap();
                let note_id = root
                    .children
                    .iter()
                    .find(|c| c.is_page_visible_note())
                    .unwrap()
                    .id
                    .clone();
                let existing: Vec<String> = root
                    .children
                    .iter()
                    .find(|c| c.id == note_id)
                    .unwrap()
                    .children
                    .iter()
                    .map(|c| c.id.clone())
                    .collect();
                let mut t = 1000u64;
                for cid in existing {
                    t += 1;
                    let _ = page.delete_block_subtree(&note_id, &cid, t);
                }
                seed(page, &note_id);
                page.stop_capturing().unwrap();
                view.refresh_document();
                cx.notify();
            })
            .unwrap();
        });
        hw.request_frame();
        app.update(|cx| {
            win.update(cx, check).unwrap();
        });
        hw.request_frame();
    }

    #[test]
    fn unselected_typing_after_block_delete_escape_or_undo_never_hijacks_title() {
        with_seeded_view(
            |page, note_id| {
                page.add_block(
                    "p1",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "One".into(),
                    },
                    Some(note_id),
                    None,
                    2001,
                )
                .unwrap();
                page.add_block(
                    "p2",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "Two".into(),
                    },
                    Some(note_id),
                    None,
                    2002,
                )
                .unwrap();
            },
            |view, w, cx| {
                let root_id = view
                    .page_snapshot()
                    .unwrap()
                    .root
                    .as_ref()
                    .unwrap()
                    .id
                    .clone();
                let orig_title = view.block_text(&root_id).unwrap().to_owned();

                // 1. Esc -> Esc cancels block selection; typing must not alter title.
                view.change_selection(DocumentSelection::caret(DocPoint::new("p1", 0)), w, cx);
                view.editor_key_down(&key_event("escape", Modifiers::default()), w, cx);
                assert_eq!(view.block_selection(), &["p1".to_string()]);
                view.editor_key_down(&key_event("escape", Modifiers::default()), w, cx);
                assert!(view.block_selection().is_empty());
                assert!(view.document_selection().is_none());
                view.replace_text_in_range(None, "HijackEsc", w, cx);
                assert_eq!(view.block_text(&root_id).unwrap(), orig_title);

                // 2. Block delete -> typing must not alter title.
                view.change_selection(DocumentSelection::caret(DocPoint::new("p1", 0)), w, cx);
                view.editor_key_down(&key_event("escape", Modifiers::default()), w, cx);
                view.editor_key_down(&key_event("backspace", Modifiers::default()), w, cx);
                assert!(view.document_selection().is_none());
                view.replace_text_in_range(None, "HijackDel", w, cx);
                assert_eq!(view.block_text(&root_id).unwrap(), orig_title);

                // 3. Undo block delete -> typing must not alter title.
                let ctrl = Modifiers {
                    control: true,
                    ..Default::default()
                };
                view.editor_key_down(&key_event("z", ctrl), w, cx);
                view.replace_text_in_range(None, "HijackUndo", w, cx);
                assert_eq!(view.block_text(&root_id).unwrap(), orig_title);
            },
        );
    }

    #[test]
    fn collapsed_heading_enter_and_tab_into_collapsed_list_stay_visible_and_select_all_covers_hidden()
     {
        with_seeded_view(
            |page, note_id| {
                page.add_block(
                    "h1_a",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::H1,
                        text: "Section 1".into(),
                    },
                    Some(note_id),
                    None,
                    2001,
                )
                .unwrap();
                page.add_block(
                    "hidden_body",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "Hidden body".into(),
                    },
                    Some(note_id),
                    None,
                    2002,
                )
                .unwrap();
                page.add_block(
                    "h1_b",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::H1,
                        text: "Section 2".into(),
                    },
                    Some(note_id),
                    None,
                    2003,
                )
                .unwrap();
                page.set_block_prop("h1_a", "prop:collapsed", SessionValue::Any(Any::True), 2004)
                    .unwrap();

                page.add_block(
                    "list_head",
                    BlockSpec::List {
                        list_type: ListType::Toggle,
                        text: "Toggle".into(),
                        checked: false,
                        order: None,
                    },
                    Some(note_id),
                    None,
                    2005,
                )
                .unwrap();
                page.add_block(
                    "list_child",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "Child".into(),
                    },
                    Some("list_head"),
                    None,
                    2006,
                )
                .unwrap();
                page.set_block_prop(
                    "list_head",
                    "prop:collapsed",
                    SessionValue::Any(Any::True),
                    2007,
                )
                .unwrap();
                page.add_block(
                    "below_list",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "Below".into(),
                    },
                    Some(note_id),
                    None,
                    2008,
                )
                .unwrap();
            },
            |view, w, cx| {
                // Collapsed heading Enter inserts after hidden_body and stays visible.
                view.change_selection(DocumentSelection::caret(DocPoint::new("h1_a", 9)), w, cx);
                view.editor_key_down(&key_event("enter", Modifiers::default()), w, cx);
                let new_id = view.document_selection().unwrap().focus.block_id.clone();
                view.replace_text_in_range(None, "Visible", w, cx);
                assert_eq!(view.block_text(&new_id).unwrap(), "Visible");
                let snap = view.page_snapshot().unwrap();
                let (note, _) = parent_of(snap, &new_id).unwrap();
                let pos_hidden = note
                    .children
                    .iter()
                    .position(|c| c.id == "hidden_body")
                    .unwrap();
                let pos_new = note.children.iter().position(|c| c.id == new_id).unwrap();
                let pos_h1_b = note.children.iter().position(|c| c.id == "h1_b").unwrap();
                assert!(pos_hidden < pos_new && pos_new < pos_h1_b);

                // Tab indenting below_list into collapsed list_head expands list_head.
                view.change_selection(
                    DocumentSelection::caret(DocPoint::new("below_list", 0)),
                    w,
                    cx,
                );
                view.editor_key_down(&key_event("tab", Modifiers::default()), w, cx);
                let snap = view.page_snapshot().unwrap();
                assert!(matches!(
                    snap.block("list_head").unwrap().content,
                    BlockContent::List {
                        collapsed: false,
                        ..
                    }
                ));
                assert_eq!(parent_of(snap, "below_list").unwrap().0.id, "list_head");

                // Select-all blocks covers hidden_body; deleting all leaves no zombie hidden text.
                view.select_all_blocks(w, cx);
                assert!(
                    view.block_selection().iter().any(|id| id == "hidden_body"),
                    "select_all_blocks must include collapsed hidden siblings"
                );
                view.editor_key_down(&key_event("backspace", Modifiers::default()), w, cx);
                let snap = view.page_snapshot().unwrap();
                assert!(snap.block("hidden_body").is_none());
            },
        );
    }

    #[test]
    fn multiblock_tab_block_selection_keys_mod_enter_renumber_page_nav_and_bracket_wrap() {
        with_seeded_view(
            |page, note_id| {
                page.add_block(
                    "n1",
                    BlockSpec::List {
                        list_type: ListType::Numbered,
                        text: "First".into(),
                        checked: false,
                        order: Some(1),
                    },
                    Some(note_id),
                    None,
                    2001,
                )
                .unwrap();
                page.add_block(
                    "n2",
                    BlockSpec::List {
                        list_type: ListType::Numbered,
                        text: "".into(),
                        checked: false,
                        order: Some(2),
                    },
                    Some(note_id),
                    None,
                    2002,
                )
                .unwrap();
                page.add_block(
                    "n3",
                    BlockSpec::List {
                        list_type: ListType::Numbered,
                        text: "Third".into(),
                        checked: false,
                        order: Some(3),
                    },
                    Some(note_id),
                    None,
                    2003,
                )
                .unwrap();
                page.add_block(
                    "code1",
                    BlockSpec::Code {
                        text: "let x = 1;".into(),
                        language: Some("rust".into()),
                        caption: String::new(),
                    },
                    Some(note_id),
                    None,
                    2004,
                )
                .unwrap();
                page.add_block(
                    "wrap_p",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "wrap target word".into(),
                    },
                    Some(note_id),
                    None,
                    2005,
                )
                .unwrap();
                page.add_block(
                    "p_parent",
                    BlockSpec::List {
                        list_type: ListType::Bulleted,
                        text: "Parent".into(),
                        checked: false,
                        order: None,
                    },
                    Some(note_id),
                    None,
                    2006,
                )
                .unwrap();
                page.add_block(
                    "p_a",
                    BlockSpec::List {
                        list_type: ListType::Bulleted,
                        text: "Item A".into(),
                        checked: false,
                        order: None,
                    },
                    Some(note_id),
                    None,
                    2007,
                )
                .unwrap();
                page.add_block(
                    "p_b",
                    BlockSpec::List {
                        list_type: ListType::Bulleted,
                        text: "Item B".into(),
                        checked: false,
                        order: None,
                    },
                    Some(note_id),
                    None,
                    2008,
                )
                .unwrap();
            },
            |view, w, cx| {
                let shift = Modifiers {
                    shift: true,
                    ..Default::default()
                };
                let cmd = Modifiers {
                    platform: cfg!(target_os = "macos"),
                    control: !cfg!(target_os = "macos"),
                    ..Default::default()
                };
                let cmd_alt = Modifiers {
                    platform: cfg!(target_os = "macos"),
                    control: !cfg!(target_os = "macos"),
                    alt: true,
                    ..Default::default()
                };

                // P1-5: Empty numbered list item Enter resets n3 order to 1.
                view.change_selection(DocumentSelection::caret(DocPoint::new("n2", 0)), w, cx);
                view.editor_key_down(&key_event("enter", Modifiers::default()), w, cx);
                assert!(matches!(
                    view.page_snapshot().unwrap().block("n3").unwrap().content,
                    BlockContent::List { order: Some(1), .. }
                ));

                // P1-6: Mod+Enter exits code block into a new paragraph below.
                view.change_selection(DocumentSelection::caret(DocPoint::new("code1", 5)), w, cx);
                view.editor_key_down(&key_event("enter", cmd), w, cx);
                assert_eq!(view.block_text("code1").unwrap(), "let x = 1;");
                let after_code = view.document_selection().unwrap().focus.block_id.clone();
                assert_ne!(after_code, "code1");

                // P2-1: Backtick marks code; bracket wraps and keeps inner selection.
                view.change_selection(
                    DocumentSelection {
                        anchor: DocPoint::new("wrap_p", 5),
                        focus: DocPoint::new("wrap_p", 11),
                    },
                    w,
                    cx,
                );
                view.replace_text_in_range(None, "`", w, cx);
                assert_eq!(view.block_text("wrap_p").unwrap(), "wrap target word");
                let (rich, _) = view.page().unwrap().read_editable_text("wrap_p").unwrap();
                assert!(rich.delta.iter().any(|op| matches!(
                    op,
                    TextDeltaOp::Insert { format: Some(f), .. } if f.get("code") == Some(&Any::True)
                )));
                view.replace_text_in_range(None, "(", w, cx);
                assert_eq!(view.block_text("wrap_p").unwrap(), "wrap (target) word");
                let sel = view.document_selection().unwrap();
                assert_eq!((sel.anchor.offset(), sel.focus.offset()), (6, 12));

                // P1-1: Cross-block text selection Tab indents both p_a & p_b under p_parent,
                // keeping selection; Shift+Tab restores them.
                view.change_selection(
                    DocumentSelection {
                        anchor: DocPoint::new("p_a", 2),
                        focus: DocPoint::new("p_b", 4),
                    },
                    w,
                    cx,
                );
                view.editor_key_down(&key_event("tab", Modifiers::default()), w, cx);
                let snap = view.page_snapshot().unwrap();
                assert_eq!(parent_of(snap, "p_a").unwrap().0.id, "p_parent");
                assert_eq!(parent_of(snap, "p_b").unwrap().0.id, "p_parent");
                assert_eq!(view.document_selection().unwrap().anchor.block_id, "p_a");
                assert_eq!(view.document_selection().unwrap().focus.block_id, "p_b");
                view.editor_key_down(&key_event("tab", shift), w, cx);
                let snap = view.page_snapshot().unwrap();
                assert_ne!(parent_of(snap, "p_a").unwrap().0.id, "p_parent");
                assert_ne!(parent_of(snap, "p_b").unwrap().0.id, "p_parent");

                // P1-1: Block selection Shift+Down, Tab, Mod+Alt+1, Enter on single text block.
                view.change_selection(DocumentSelection::caret(DocPoint::new("p_a", 0)), w, cx);
                view.editor_key_down(&key_event("escape", Modifiers::default()), w, cx);
                // Single text block Enter focuses end of p_a instead of adding empty block.
                view.editor_key_down(&key_event("enter", Modifiers::default()), w, cx);
                assert_eq!(view.document_selection().unwrap().focus.block_id, "p_a");
                assert_eq!(view.document_selection().unwrap().focus.offset(), 6);

                // Esc + Shift+Down selects p_a and p_b; Mod+Alt+1 converts both to H1.
                view.editor_key_down(&key_event("escape", Modifiers::default()), w, cx);
                view.editor_key_down(&key_event("down", shift), w, cx);
                assert_eq!(
                    view.block_selection(),
                    &["p_a".to_string(), "p_b".to_string()]
                );
                view.editor_key_down(&key_event("1", cmd_alt), w, cx);
                let snap = view.page_snapshot().unwrap();
                for id in view.block_selection() {
                    assert!(matches!(
                        snap.block(id).unwrap().content,
                        BlockContent::Paragraph {
                            kind: ParagraphType::H1,
                            ..
                        }
                    ));
                }

                // P1-4: PageUp from last block moves caret up toward top of document.
                view.editor_key_down(&key_event("enter", Modifiers::default()), w, cx);
                let bottom_id = view.document_selection().unwrap().focus.block_id.clone();
                view.editor_key_down(&key_event("pageup", Modifiers::default()), w, cx);
                assert_ne!(view.document_selection().unwrap().focus.block_id, bottom_id);
            },
        );
    }
}
