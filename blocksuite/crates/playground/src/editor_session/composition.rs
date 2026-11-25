use std::ops::Range;

use blocksuite_playground_doc::{
    DocError, DocResult,
    read::{BlockNode, RichText},
    session::split_delta,
};
use ui::{AnyElement, Bounds, Pixels, div, size};
use y_octo::{Any, TextDeltaOp, TextInsert};

use super::*;
use crate::block_flow::{FlowBlock, FlowRect, PAGE_SURFACE_ID, PageViewport, ScrolledCode};
use crate::rich_text::TextBiIndex;
use crate::theme::Palette;

impl PlaygroundView {
    pub(super) fn composition_selection(&self) -> Option<DocumentSelection> {
        let r = self
            .page()?
            .resolve_selection_snapshot(&self.editor.preedit.as_ref()?.replacement)
            .ok()??;
        Some(DocumentSelection {
            anchor: DocPoint::new(r.anchor.0, r.anchor.1),
            focus: DocPoint::new(r.focus.0, r.focus.1),
        })
    }
    pub(super) fn composition_endpoints(&self) -> Option<(DocPoint, DocPoint)> {
        let sel = self.composition_selection()?;
        Some(if self.editor.preedit.as_ref()?.backward {
            (sel.focus, sel.anchor)
        } else {
            (sel.anchor, sel.focus)
        })
    }
    pub(super) fn composed_range(&self) -> Option<(String, Range<u64>)> {
        let (start, end) = self.composition_endpoints()?;
        let to = if start.block_id == end.block_id {
            end.offset()
        } else {
            self.block_text(&start.block_id)?.encode_utf16().count() as u64
        };
        Some((start.block_id.clone(), start.offset()..to))
    }
    pub(super) fn display_text(&self) -> Option<String> {
        if let Some((start, end)) = self.composition_endpoints() {
            let left = self.block_text(&start.block_id)?;
            let right = self.block_text(&end.block_id)?;
            let a = TextBiIndex::new(left).utf16_to_utf8_clamped(start.offset());
            let b = TextBiIndex::new(right).utf16_to_utf8_clamped(end.offset());
            return Some(format!(
                "{}{}{}",
                &left[..a],
                self.editor.preedit.as_ref()?.text,
                &right[b..]
            ));
        }
        self.block_text(&self.editor.selection.as_ref()?.focus.block_id)
            .map(str::to_owned)
    }
    pub(crate) fn preedit_snapshot(&self) -> Option<PageSnapshot> {
        let pre = self.editor.preedit.as_ref()?;
        let (start, end) = self.composition_endpoints()?;
        let mut snapshot = self.page_snapshot()?.clone();
        let plain = self.display_text()?;
        let rich = |p: &DocPoint| {
            self.page()?
                .read_editable_text(&p.block_id)
                .ok()
                .map(|(r, _)| r)
        };
        let (mut delta, _) = split_delta(&rich(&start)?.delta, start.offset()).ok()?;
        let (_, right) = split_delta(&rich(&end)?.delta, end.offset()).ok()?;
        delta.push(TextDeltaOp::Insert {
            insert: TextInsert::Text(pre.text.clone()),
            format: None,
        });
        delta.extend(right);
        if start.block_id != end.block_id {
            let blocks = RangeBlocks::between(&snapshot, &start.block_id, &end.block_id)?;
            let leaf_parent = if blocksuite_playground_doc::schema::is_leaf_flavour(
                &snapshot.block(&start.block_id)?.flavour,
            ) {
                Some(parent_of(&snapshot, &start.block_id)?.0.id.clone())
            } else {
                None
            };
            let root = snapshot.root.as_mut()?;
            let children: Vec<_> = blocks
                .survivors
                .iter()
                .filter_map(|id| root.walk().find(|node| node.id == *id).cloned())
                .collect();
            fn prune(node: &mut BlockNode, hidden: &[String], end: &str) {
                node.children.retain_mut(|child| {
                    if child.id == end || hidden.contains(&child.id) {
                        return false;
                    }
                    prune(child, hidden, end);
                    true
                });
            }
            prune(root, &blocks.intermediate, &end.block_id);
            if root.id == start.block_id {
                if let Some(note) = root.children.iter_mut().find(|n| n.is_page_visible_note()) {
                    note.children.splice(0..0, children);
                }
            } else if let Some(parent_id) = leaf_parent {
                let parent = node_mut(root, &parent_id)?;
                let slot = parent
                    .children
                    .iter()
                    .position(|child| child.id == start.block_id)?
                    + 1;
                parent.children.splice(slot..slot, children);
            } else {
                node_mut(root, &start.block_id)?.children.extend(children);
            }
        }
        match &mut node_mut(snapshot.root.as_mut()?, &start.block_id)?.content {
            BlockContent::Code { text, .. } => *text = plain,
            BlockContent::Page { title: rich }
            | BlockContent::Paragraph { text: rich, .. }
            | BlockContent::List { text: rich, .. } => *rich = RichText { delta, plain },
            _ => return None,
        }
        Some(snapshot)
    }
    pub(crate) fn clear_composition(&mut self, w: &mut Window, cx: &mut Context<Self>) {
        if let Some(sel) = self.composition_selection() {
            self.editor.selection = Some(sel);
        }
        if self.editor.preedit.take().is_some() {
            self.dirty_text = None;
            self.doc_rev += 1;
            self.ensure_layout(
                page_geometry(f32::from(w.viewport_size().width)).column_width,
                w,
            );
            self.announce_selection(cx);
            w.notify_text_input_changed(&self.editor_focus);
            cx.notify();
        }
    }
    pub(crate) fn visual_focus(&self) -> Option<DocPoint> {
        if let Some((id, r)) = self.composed_range() {
            return Some(DocPoint::new(
                id,
                r.start + self.editor.preedit.as_ref()?.selected.end as u64,
            ));
        }
        Some(self.editor.selection.as_ref()?.focus.clone())
    }
    pub(crate) fn reveal_caret(&mut self, height: f32) {
        if std::mem::take(&mut self.editor.reveal)
            && let Some(focus) = self.visual_focus()
            && let Some(rect) = self.geometry(&focus)
        {
            if rect.y < self.scroll_y {
                self.scroll_y = rect.y.round();
            } else if rect.bottom() > self.scroll_y + height {
                self.scroll_y = (rect.bottom() - height).round();
            }
            self.reveal_code_caret(&focus.block_id, rect.x);
        }
    }
    pub(super) fn world_spans(block: &FlowBlock, r: Range<u64>) -> Vec<FlowRect> {
        let Some(t) = &block.body.text else {
            return Vec::new();
        };
        t.layout
            .selection_spans(r.start as usize, r.end as usize)
            .into_iter()
            .map(|(line, a, b)| {
                FlowRect::new(
                    block.x + t.x + a,
                    block.y + t.y + line as f32 * t.layout.line_height(),
                    b - a,
                    t.layout.line_height(),
                )
            })
            .collect()
    }
    /// Selected glyph runs and the paragraph breaks between them, in page coordinates.
    pub fn selection_rects(&self, layout: &FlowLayout) -> Vec<FlowRect> {
        let mut out = Vec::new();
        let Some(sel) = &self.editor.selection else {
            return out;
        };
        if sel.empty() {
            return out;
        }
        let Some((start, end, a, b, _)) = sel.ordered(layout) else {
            return out;
        };

        for block in &layout.blocks[a..=b] {
            let from = if start.block_id == block.block_id {
                start.offset()
            } else {
                0
            };
            let to = if end.block_id == block.block_id {
                end.offset()
            } else {
                block.body.plain.encode_utf16().count() as u64
            };
            let runs = Self::world_spans(block, from..to);
            let first = runs.first().copied().unwrap_or(FlowRect::new(
                block.x,
                block.y,
                1.0,
                block.body.height,
            ));
            if runs.is_empty() && a != b && block.editable() && block.body.plain.is_empty() {
                out.push(first);
            }
            out.extend(runs);
        }
        out
    }
    pub(crate) fn local_selection_elements(
        &self,
        layout: &FlowLayout,
        v: PageViewport,
        palette: &Palette,
    ) -> Vec<AnyElement> {
        let mut el = Vec::new();
        if !self.editor.block_selection.is_empty() {
            let mut first_block = true;
            for block_id in &self.editor.block_selection {
                let Some(block) = layout.block(block_id) else {
                    continue;
                };
                let r = block.rect();
                if r.bottom() < v.scroll_y || r.y > v.scroll_y + v.height {
                    continue;
                }
                let mut d = div()
                    .absolute()
                    .left(px(v.column_x + r.x))
                    .top(px(r.y - v.scroll_y))
                    .w(px(r.w.max(1.0)))
                    .h(px(r.h))
                    .rounded(px(4.0))
                    .bg(palette.brand.opacity(0.14));
                if r.y >= v.scroll_y
                    && r.bottom() <= v.scroll_y + v.height
                    && std::mem::take(&mut first_block)
                {
                    d = d.snapshot("page.block_selection", Some(PAGE_SURFACE_ID));
                }
                el.push(d.into_any_element());
            }
        }
        let scrolled = self.overlays.scrolled_code(layout);
        let mut first_box = true;
        let mut draw = |mut r: FlowRect, color: ui::Hsla, caret: bool| {
            // Inside a sideways-scrolled code block the text sits left of its layout, and
            // what scrolled out of the code area is not painted.
            if let Some(code) = ScrolledCode::containing(&scrolled, &r) {
                let shown = if caret { code.caret(r) } else { code.span(r) };
                let Some(shown) = shown else {
                    return;
                };
                r = shown;
            }
            if r.bottom() < v.scroll_y || r.y > v.scroll_y + v.height {
                return;
            }
            let mut d = div()
                .absolute()
                .left(px(v.column_x + r.x))
                .top(px(r.y - v.scroll_y))
                .w(px(r.w.max(1.0)))
                .h(px(r.h))
                .bg(color);
            if r.y >= v.scroll_y && r.bottom() <= v.scroll_y + v.height {
                if caret {
                    d = d.snapshot("page.local_caret", Some(PAGE_SURFACE_ID));
                } else if std::mem::take(&mut first_box) {
                    d = d.snapshot("page.selection", Some(PAGE_SURFACE_ID));
                }
            }
            el.push(d.into_any_element());
        };
        if let Some((id, r)) = self.composed_range()
            && let Some(pre) = &self.editor.preedit
            && let Some(block) = layout.block(&id)
        {
            for mut rect in Self::world_spans(
                block,
                r.start..r.start + pre.text.encode_utf16().count() as u64,
            ) {
                rect.y += rect.h - 1.0;
                rect.h = 1.0;
                draw(rect, palette.text_secondary, false);
            }
        } else {
            for r in self.selection_rects(layout) {
                draw(r, palette.brand.opacity(0.22), false);
            }
        }
        // While the link field takes the keys, its caret is the only one shown.
        if self.overlays.link_url().is_none()
            && let Some(p) = self.visual_focus()
            && let Some(rect) = layout
                .block(&p.block_id)
                .and_then(|b| b.caret_rect(p.caret))
        {
            draw(rect, palette.text_primary, true);
        }
        el
    }
    pub(super) fn begin_input(&mut self) {
        if self.editor.selection.is_none()
            && self.editor.block_selection.is_empty()
            && let Some(root) = self.page_snapshot().and_then(|s| s.root.as_ref())
        {
            self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(&root.id, 0)));
        }
    }
    pub(super) fn replacement_selection(
        &self,
        range: Option<Range<usize>>,
    ) -> Option<DocumentSelection> {
        let sel = self.editor.selection.as_ref()?;
        if let Some(selection) = self.composition_selection() {
            return Some(selection);
        }
        Some(if let Some(r) = range {
            if sel.anchor.block_id != sel.focus.block_id
                && r.is_empty()
                && r.start as u64 == sel.focus.offset()
            {
                return Some(sel.clone());
            }
            DocumentSelection {
                anchor: DocPoint::new(&sel.focus.block_id, r.start as u64),
                focus: DocPoint::new(&sel.focus.block_id, r.end as u64),
            }
        } else {
            sel.clone()
        })
    }
    pub(super) fn replace_selection(
        &mut self,
        sel: DocumentSelection,
        text: &str,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        self.ensure_layout(
            page_geometry(f32::from(w.viewport_size().width)).column_width,
            w,
        );
        if self.apply_markdown(&sel, text, w, cx)? {
            return Ok(());
        }
        let now = self.now_ms(cx) as u64;
        let layout = self
            .flow_layout()
            .ok_or_else(|| DocError::InvalidState("missing layout".into()))?;
        let (start, end, a, b, _) = sel
            .ordered(&layout)
            .ok_or_else(|| DocError::InvalidState("selection is no longer visible".into()))?;
        let id = start.block_id.clone();
        let cross = a != b;
        let key = if matches!(layout.blocks[a].body.kind, block_flow::FlowKind::Title) {
            "prop:title"
        } else {
            "prop:text"
        };
        if key == "prop:title" {
            let current = layout.blocks[a].body.plain.as_str();
            let start_byte = TextBiIndex::new(current).utf16_to_utf8_clamped(start.offset());
            let tail = if cross {
                let end_text = layout.blocks[b].body.plain.as_str();
                let end_byte = TextBiIndex::new(end_text).utf16_to_utf8_clamped(end.offset());
                &end_text[end_byte..]
            } else {
                let end_byte = TextBiIndex::new(current).utf16_to_utf8_clamped(end.offset());
                &current[end_byte..]
            };
            let next_title = format!("{}{}{}", &current[..start_byte], text, tail);
            if !self.preflight_title_change(&next_title) {
                self.editor.preedit = None;
                return Ok(());
            }
        }
        let mut marks = self.insertion_marks(start)?;
        for (key, value) in &self.editor.pending_marks {
            if let Some(v) = value {
                marks.insert(key.clone(), v.clone());
            } else {
                marks.remove(key);
            }
        }
        let is_rich_block = matches!(
            layout.blocks[a].body.kind,
            block_flow::FlowKind::Paragraph(_) | block_flow::FlowKind::List(_)
        );
        let outside_code = marks.get("code") != Some(&Any::True);
        // A `/` typed at a caret in paragraph or list text, outside inline code, opens
        // the slash menu at that character.
        let slash = (text == "/" && sel.empty() && is_rich_block && outside_code)
            .then(|| (id.clone(), start.offset()));

        // Double-bracket `[[` or `【【` trigger converts to `@` and opens the linked-doc menu.
        let double_bracket_convert: Option<(u64, u64)> =
            if sel.empty() && is_rich_block && outside_code {
                if text == "[[" || text == "【【" {
                    Some((start.offset(), 0))
                } else if text == "[" || text == "【" {
                    let plain = layout.blocks[a].body.plain.as_str();
                    let before_byte = TextBiIndex::new(plain).utf16_to_utf8_clamped(start.offset());
                    let expected = if text == "[" { '[' } else { '【' };
                    plain[..before_byte]
                        .chars()
                        .next_back()
                        .filter(|&ch| ch == expected)
                        .map(|ch| {
                            let u16_len = ch.len_utf16() as u64;
                            (start.offset().saturating_sub(u16_len), u16_len)
                        })
                } else {
                    None
                }
            } else {
                None
            };

        let (insert_text, effective_start, extra_delete, linked_doc) =
            if let Some((at_offset, prev_del)) = double_bracket_convert {
                ("@", at_offset, prev_del, Some((id.clone(), at_offset)))
            } else {
                // An `@` typed anywhere in paragraph or list text, outside inline code,
                // opens the linked-document menu at that character.
                let at_trigger = (text == "@" && sel.empty() && is_rich_block && outside_code)
                    .then(|| (id.clone(), start.offset()));
                (text, start.offset(), 0, at_trigger)
            };

        let group = self
            .editor
            .last_typing
            .is_some_and(|t| now.saturating_sub(t) < 500)
            && sel.empty()
            && !cross
            && extra_delete == 0;
        let blocks = RangeBlocks::between(
            self.page_snapshot()
                .ok_or_else(|| DocError::InvalidState("missing page".into()))?,
            &id,
            &end.block_id,
        )
        .ok_or_else(|| DocError::InvalidState("selection outside page content".into()))?;
        let page = self.page_mut()?;
        let snapshot = sel.snapshot(page)?;
        if !group {
            page.stop_capturing()?;
        }
        let mut delta = Vec::new();
        if effective_start > 0 {
            delta.push(TextDeltaOp::Retain {
                retain: effective_start,
                format: None,
            });
        }
        if extra_delete > 0 {
            delta.push(TextDeltaOp::Delete {
                delete: extra_delete,
            });
        } else if !cross && end.offset() > start.offset() {
            delta.push(TextDeltaOp::Delete {
                delete: end.offset() - start.offset(),
            });
        }
        if !insert_text.is_empty() {
            delta.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(insert_text.into()),
                format: (!marks.is_empty()).then_some(marks),
            });
        }
        let commit = if cross {
            page.structural_edit(now, |page| {
                page.delete_cross_block_range(
                    (&id, start.offset()),
                    (&end.block_id, end.offset()),
                    &blocks.intermediate,
                    &blocks.survivors,
                    now,
                )?;
                if !insert_text.is_empty() {
                    page.apply_text_delta(&id, key, &delta, now)?;
                }
                Ok(())
            })?
        } else {
            page.apply_text_delta(&id, key, &delta, now)?
        };
        if commit.is_some() && !group {
            page.set_undo_selection_snapshot(snapshot)?;
        }
        self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(
            &id,
            effective_start + insert_text.encode_utf16().count() as u64,
        )));
        self.editor.block_selection.clear();
        self.editor.last_typing = (!cross).then_some(now);
        self.editor.preedit = None;
        self.did_edit(commit, (!cross).then_some(&id), w, cx);
        if let Some((block_id, offset)) = slash {
            self.open_typed_slash_menu(block_id, offset, cx);
        }
        if let Some((block_id, offset)) = linked_doc {
            self.open_typed_linked_doc_menu(block_id, offset, cx);
        }
        Ok(())
    }
    pub(super) fn screen_rect(&self, r: FlowRect, w: &Window) -> Bounds<Pixels> {
        Bounds::new(
            point(
                px(page_geometry(f32::from(w.viewport_size().width)).column_x + r.x),
                px(TOPBAR_HEIGHT + r.y - self.scroll_y),
            ),
            size(px(r.w), px(r.h)),
        )
    }
}
