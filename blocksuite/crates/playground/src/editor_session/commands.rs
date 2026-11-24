use blocksuite_playground_doc::{
    DocError, DocResult,
    schema::{BlockSpec, ParagraphType},
    session::split_delta,
};
use ui::{EntityInputHandler, KeyDownEvent};
use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

use super::*;
use crate::overlays::LinkBar;
use crate::rich_text::TextBiIndex;

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
    pub(super) fn history(
        &mut self,
        redo: bool,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let sel = self.editor.selection.clone();
        let page = self.page_mut()?;
        let opposite = sel.and_then(|s| s.snapshot(page).ok());
        page.stop_capturing()?;
        let commit = if redo { page.redo()? } else { page.undo()? };
        let Some(commit) = commit else { return Ok(()) };
        if let Some(other) = opposite {
            let stack = if redo {
                y_octo::UndoStack::Undo
            } else {
                y_octo::UndoStack::Redo
            };
            page.inner()
                .set_stack_selection_meta(page.undo_stack_id(), stack, other)?;
        }
        let restored = commit
            .selection_meta
            .as_ref()
            .map(|s| page.resolve_selection_snapshot(s))
            .transpose()?
            .flatten();
        if let Some(s) = restored {
            self.editor.selection = Some(DocumentSelection {
                anchor: DocPoint::new(s.anchor.0, s.anchor.1),
                focus: DocPoint::new(s.focus.0, s.focus.1),
            });
        }
        self.editor.last_typing = None;
        self.editor.preedit = None;
        self.did_edit(Some(commit), None, w, cx);
        Ok(())
    }
    pub(super) fn insertion_marks(&self, point: &DocPoint) -> DocResult<TextAttributes> {
        let offset = point.offset();
        if offset == 0 {
            return Ok(TextAttributes::new());
        }
        let (rich, _) = self
            .page()
            .ok_or_else(|| DocError::InvalidState("missing page".into()))?
            .read_editable_text(&point.block_id)?;
        let mut cursor = 0;
        for op in rich.delta {
            if let TextDeltaOp::Insert { insert, format } = op {
                cursor += match &insert {
                    TextInsert::Text(s) => s.encode_utf16().count(),
                    TextInsert::Embed(v) => v.len(),
                } as u64;
                if offset <= cursor {
                    if matches!(insert, TextInsert::Embed(_))
                        || format
                            .as_ref()
                            .is_some_and(|attrs| attrs.contains_key("reference"))
                    {
                        break;
                    }
                    let mut marks = format.unwrap_or_default();
                    if offset == cursor {
                        marks.remove("code");
                        marks.remove("link");
                    }
                    return Ok(marks);
                }
            }
        }
        Ok(TextAttributes::new())
    }

    pub(crate) fn format_mark(
        &mut self,
        key: &str,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let Some(sel) = self.editor.selection.clone() else {
            return Ok(());
        };
        if sel.empty() {
            let inherited = self.insertion_marks(&sel.focus)?;
            let on = self.editor.pending_marks.get(key).map_or_else(
                || inherited.get(key) == Some(&Any::True),
                |v| *v == Some(Any::True),
            );
            self.editor
                .pending_marks
                .insert(key.into(), (!on).then_some(Any::True));
            return Ok(());
        }
        let Some(layout) = self.flow_layout() else {
            return Ok(());
        };
        let Some((start, end, a, b, _)) = sel.ordered(&layout) else {
            return Ok(());
        };
        let now = self.now_ms(cx) as u64;
        let page = self.page_mut()?;
        let mut ranges = Vec::new();
        let mut marked = true;
        for block in layout.blocks[a..=b].iter().filter(|b| b.editable()) {
            let id = &block.block_id;
            let from = if id == &start.block_id {
                start.offset()
            } else {
                0
            };
            let to = if id == &end.block_id {
                end.offset()
            } else {
                block.body.plain.encode_utf16().count() as u64
            };
            if to <= from {
                continue;
            }
            let (rich, _) = page.read_editable_text(id)?;
            let (_, tail) = split_delta(&rich.delta, from)?;
            let (part, _) = split_delta(&tail, to - from)?;
            marked &= part.iter().all(|op|matches!(op,TextDeltaOp::Insert{format:Some(f),..} if f.get(key)==Some(&Any::True)));
            let prop = if matches!(block.body.kind, block_flow::FlowKind::Title) {
                "prop:title"
            } else {
                "prop:text"
            };
            ranges.push((id, prop, from, to - from));
        }
        let snap = sel.snapshot(page)?;
        page.stop_capturing()?;
        let commit = page.structural_edit(now, |page| {
            for (id, prop, from, n) in ranges {
                page.format_text(
                    id,
                    prop,
                    from,
                    n,
                    TextAttributes::from([(
                        key.to_owned(),
                        if marked { Any::Null } else { Any::True },
                    )]),
                    now,
                )?;
            }
            Ok(())
        })?;
        if commit.is_some() {
            page.set_undo_selection_snapshot(snap)?;
        }
        self.editor.last_typing = None;
        self.did_edit(commit, (a == b).then_some(&start.block_id), w, cx);
        Ok(())
    }
    pub(super) fn edit_key(
        &mut self,
        key: &str,
        shift: bool,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let Some(sel) = self.editor.selection.clone() else {
            return Ok(());
        };
        let id = sel.focus.block_id.clone();
        let offset = sel.focus.offset();
        let Some(snapshot) = self.snapshot.clone() else {
            return Ok(());
        };
        let Some(node) = snapshot.block(&id) else {
            return Ok(());
        };
        let text = text_content(node).unwrap_or("");
        let n = text.encode_utf16().count() as u64;
        let code = matches!(node.content, BlockContent::Code { .. });
        let backwards = key == "backspace";
        let now = self.now_ms(cx) as u64;
        if key == "enter" && !sel.empty() && !shift && !code {
            return self.paste_slice(crate::clipboard::Slice::from_plain("\n"), false, w, cx);
        }
        if key == "tab" && code {
            return self.replace_selection(sel, "  ", w, cx);
        }
        if key == "enter" && !shift && self.apply_markdown(&sel, "\n", w, cx)? {
            return Ok(());
        }
        if key == "enter" && (shift || code) {
            return self.replace_selection(sel, "\n", w, cx);
        }
        if matches!(key, "backspace" | "delete")
            && (!sel.empty() || (backwards && offset > 0) || (!backwards && offset < n))
        {
            let range = if !sel.empty() {
                sel.clone()
            } else {
                let idx = TextBiIndex::new(text);
                let next = if backwards {
                    idx.prev_grapheme_utf16(offset)
                } else {
                    idx.next_grapheme_utf16(offset)
                };
                DocumentSelection {
                    anchor: sel.focus.clone(),
                    focus: DocPoint::new(&id, next),
                }
            };
            let before = sel.snapshot(self.page_mut()?)?;
            self.editor.last_typing = None;
            self.replace_selection(range, "", w, cx)?;
            self.page_mut()?.set_undo_selection_snapshot(before)?;
            self.editor.last_typing = None;
            return Ok(());
        }
        let before = sel.snapshot(self.page_mut()?)?;
        let mut focus = sel.focus.clone();
        let demote = matches!(
            node.content,
            BlockContent::List { .. }
                | BlockContent::Paragraph {
                    kind: ParagraphType::Quote,
                    ..
                }
        ) && ((text.is_empty() && key == "enter") || (backwards && offset == 0))
            || (backwards
                && offset == 0
                && matches!(node.content,BlockContent::Paragraph {kind,..} if kind!=ParagraphType::Text));
        let last_nested = backwards
            && offset == 0
            && !code
            && parent_of(&snapshot, &id).is_some_and(|(parent, pos)| {
                matches!(
                    parent.content,
                    BlockContent::List { .. } | BlockContent::Paragraph { .. }
                ) && pos + 1 == parent.children.len()
            });
        let commit = if last_nested {
            self.page_mut()?.dedent_block(&id, now)?
        } else if demote {
            let fresh = self.fresh_block_id();
            if node.flavour != "affine:paragraph" {
                focus = DocPoint::new(&fresh, offset);
            }
            self.page_mut()?
                .convert_block_flavour(&id, &fresh, paragraph(), now)?
        } else if key == "tab" {
            let Some((parent, pos)) = parent_of(&snapshot, &id) else {
                return Ok(());
            };
            let dest = if shift {
                if !matches!(
                    parent.content,
                    BlockContent::List { .. } | BlockContent::Paragraph { .. }
                ) {
                    return Ok(());
                }
                parent_of(&snapshot, &parent.id).map(|(p, i)| (&p.id, i + 1))
            } else {
                pos.checked_sub(1)
                    .and_then(|i| parent.children.get(i))
                    .filter(|b| {
                        matches!(
                            b.content,
                            BlockContent::List { .. } | BlockContent::Paragraph { .. }
                        )
                    })
                    .map(|b| (&b.id, b.children.len()))
            };
            let Some((dest, index)) = dest else {
                return Ok(());
            };
            if shift {
                self.page_mut()?.dedent_block(&id, now)?
            } else {
                self.page_mut()?
                    .reparent_block(&id, &parent.id, dest, index as u64, now)?
            }
        } else if key == "enter" {
            let spec = match &node.content {
                BlockContent::Paragraph { kind, .. } if offset < n => BlockSpec::Paragraph {
                    paragraph_type: *kind,
                    text: String::new(),
                },
                BlockContent::List { kind, order, .. } => list(
                    *kind,
                    false,
                    order
                        .and_then(|i| i.checked_add(1))
                        .and_then(|i| i32::try_from(i).ok()),
                ),
                _ => paragraph(),
            };
            let new_id = self.fresh_block_id();
            focus = DocPoint::new(&new_id, 0);
            self.page_mut()?
                .split_text_block(&id, &new_id, offset, spec, now)?
        } else {
            let Some(layout) = self.flow_layout() else {
                return Ok(());
            };
            let Some(i) = layout.blocks.iter().position(|b| b.block_id == id) else {
                return Ok(());
            };
            let adjacent = if backwards {
                layout.blocks[..i].last()
            } else {
                layout.blocks.get(i + 1)
            };
            let Some(adjacent) = adjacent else {
                return Ok(());
            };
            let nesting = parent_of(&snapshot, &id).filter(|(p, _)| {
                matches!(
                    p.content,
                    BlockContent::Paragraph { .. } | BlockContent::List { .. }
                )
            });
            let mergeable = !code
                && adjacent.editable()
                && !matches!(adjacent.body.kind, block_flow::FlowKind::Code);
            if backwards && !code && !mergeable && nesting.is_some() {
                self.page_mut()?.dedent_block(&id, now)?
            } else if !mergeable {
                if !backwards
                    || !text.is_empty()
                    || code
                    || !parent_of(&snapshot, &id).is_some_and(|(p, _)| p.children.len() > 1)
                {
                    return Ok(());
                }
                let Some(next) = layout.blocks[..i]
                    .iter()
                    .rev()
                    .chain(&layout.blocks[i + 1..])
                    .find(|b| b.editable())
                else {
                    return Ok(());
                };
                focus = DocPoint::new(
                    &next.block_id,
                    if next.y < layout.blocks[i].y {
                        next.body.plain.encode_utf16().count() as u64
                    } else {
                        0
                    },
                );
                self.page_mut()?.remove_lifting_children(&id, now)?
            } else {
                let (target, source) = if backwards {
                    (&adjacent.block_id, &id)
                } else {
                    (&id, &adjacent.block_id)
                };
                let Some((parent, _)) = parent_of(&snapshot, source) else {
                    return Ok(());
                };
                let (join, commit) = self
                    .page_mut()?
                    .merge_with_previous_text_block(target, source, &parent.id, now)?;
                focus = DocPoint::new(target, join);
                commit
            }
        };
        if commit.is_some() {
            self.page_mut()?.set_undo_selection_snapshot(before)?;
        }
        self.editor.selection = Some(DocumentSelection::caret(focus));
        self.editor.last_typing = None;
        self.did_edit(commit, None, w, cx);
        Ok(())
    }

    pub(crate) fn hit_test_flow_layout(layout: &FlowLayout, x: f32, y: f32) -> Option<DocPoint> {
        let block = layout
            .blocks
            .iter()
            .filter(|b| b.editable())
            .min_by(|a, b| {
                let ar = a.rect();
                let br = b.rect();
                let da = if y < ar.y {
                    ar.y - y
                } else if y > ar.bottom() {
                    y - ar.bottom()
                } else {
                    0.0
                };
                let db = if y < br.y {
                    br.y - y
                } else if y > br.bottom() {
                    y - br.bottom()
                } else {
                    0.0
                };
                da.total_cmp(&db)
            })?;
        Some(DocPoint {
            block_id: block.block_id.clone(),
            caret: block.hit_text(x, y)?,
        })
    }

    pub(crate) fn editor_key_down(
        &mut self,
        e: &KeyDownEvent,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.mode == crate::PlaygroundMode::Edgeless {
            if self.edgeless_key_down(e, w, cx) {
                w.prevent_default();
                cx.stop_propagation();
                return;
            }
            if self.edgeless.authoring.editing_spatial_block().is_none() {
                return;
            }
        }
        if self.editor.preedit.is_some() || e.prefer_character_input {
            return;
        }
        // An open link field or slash menu takes its keys before the document does.
        if self.overlay_key_down(e, w, cx) {
            w.prevent_default();
            cx.stop_propagation();
            return;
        }
        // A composition in the link field keeps its keys from the document as well.
        if self.overlays.link_field().is_some_and(LinkBar::composing) {
            return;
        }
        let m = e.keystroke.modifiers;
        let cmd = m.secondary(cx);
        let key = e.keystroke.key.as_str();
        let result = match key {
            "left" | "right" | "up" | "down" | "home" | "end" => {
                self.navigate(
                    key,
                    m.shift,
                    m.alt,
                    m.platform && matches!(key, "left" | "right"),
                    w,
                    cx,
                );
                Ok(())
            }
            "enter" | "backspace" | "delete" | "tab" => self.edit_key(key, m.shift, w, cx),
            "a" if cmd => {
                if let Some(sel) = self.editor.selection.clone()
                    && let Some(layout) = self.flow_layout()
                    && let Some(block) = layout.block(&sel.focus.block_id)
                {
                    let mut anchor = DocPoint::new(&block.block_id, 0);
                    let mut focus = DocPoint::new(
                        &block.block_id,
                        block.body.plain.encode_utf16().count() as u64,
                    );
                    if (sel.anchor == anchor && sel.focus == focus
                        || sel.focus == anchor && sel.anchor == focus)
                        && let Some(first) = layout.blocks.iter().find(|b| b.editable())
                        && let Some(last) = layout.blocks.iter().rfind(|b| b.editable())
                    {
                        anchor = DocPoint::new(&first.block_id, 0);
                        focus = DocPoint::new(
                            &last.block_id,
                            last.body.plain.encode_utf16().count() as u64,
                        );
                    }
                    self.change_selection(DocumentSelection { anchor, focus }, w, cx);
                }
                Ok(())
            }
            "c" | "x" if cmd => {
                if let Some(slice) = self.clipboard_slice() {
                    crate::clipboard::write_slice(&slice, cx);
                    if key == "x" {
                        self.edit_key("backspace", false, w, cx)
                    } else {
                        Ok(())
                    }
                } else {
                    Ok(())
                }
            }
            "v" if cmd => {
                if let Some(item) = cx.read_from_clipboard() {
                    self.paste(item, w, cx);
                } else {
                    return;
                }
                Ok(())
            }
            "z" if cmd => self.history(m.shift, w, cx),
            "y" if cmd => self.history(true, w, cx),
            "b" | "i" | "u" | "e" | "s" if cmd && (key != "s" || m.shift) => self.format_mark(
                match key {
                    "b" => "bold",
                    "i" => "italic",
                    "u" => "underline",
                    "e" => "code",
                    _ => "strike",
                },
                w,
                cx,
            ),
            _ => return,
        };
        if let Err(e) = result {
            eprintln!("document command {key}: {e}");
        }
        w.prevent_default();
        cx.stop_propagation();
    }
}
