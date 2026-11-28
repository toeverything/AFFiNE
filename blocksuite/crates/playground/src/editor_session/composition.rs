use std::ops::Range;

use blocksuite_playground_doc::{
    DocError, DocResult,
    read::{BlockNode, RichText},
    session::split_delta,
};
use ui::{AnyElement, Bounds, Pixels, div, size};
use y_octo::{Any, TextDeltaOp, TextInsert};

use super::*;
use crate::PlaygroundMode;
use crate::block_flow::{FlowBlock, FlowRect, PAGE_SURFACE_ID, PageViewport, ScrolledCode};
use crate::rich_text::TextBiIndex;
use crate::theme::Palette;

/// Half-period of the editing text caret blink in milliseconds (`500ms` on / `500ms` off).
pub const CARET_BLINK_HALF_PERIOD_MS: f64 = 500.0;

fn empty_block_placeholder(
    kind: blocksuite_playground_doc::schema::ParagraphType,
) -> Option<&'static str> {
    use blocksuite_playground_doc::schema::ParagraphType;
    match kind {
        ParagraphType::Text => Some("Type '/' for commands"),
        ParagraphType::H1 => Some("Heading 1"),
        ParagraphType::H2 => Some("Heading 2"),
        ParagraphType::H3 => Some("Heading 3"),
        ParagraphType::H4 => Some("Heading 4"),
        ParagraphType::H5 => Some("Heading 5"),
        ParagraphType::H6 => Some("Heading 6"),
        ParagraphType::Quote => None,
    }
}

impl PlaygroundView {
    /// Closed-form scheduler-clock caret opacity (`1.0` for `0..500ms`, `0.0` for `500..1000ms`),
    /// failing open to solid `1.0` whenever no periodic blink timer is active.
    pub fn caret_blink_alpha(&self, now_ms: f64) -> f32 {
        if self.caret_blink_task.is_none() {
            return 1.0;
        }
        let elapsed = (now_ms - self.caret_active_since_ms).max(0.0);
        if (elapsed % (2.0 * CARET_BLINK_HALF_PERIOD_MS)) < CARET_BLINK_HALF_PERIOD_MS {
            1.0
        } else {
            0.0
        }
    }

    /// Whether a visible collapsed caret is currently mounted in the page body or a table cell
    /// (and not superseded by the link bar or an Edgeless label editor).
    fn has_blinking_collapsed_caret(&self) -> bool {
        if self.mode != PlaygroundMode::Page
            || self.overlays.active_text_field().is_some()
            || self.edgeless.authoring.label_editor().is_some()
        {
            return false;
        }
        if let Some(cell) = self.table_cell.as_ref() {
            return cell.input.selection.is_empty();
        }
        self.editor.selection.as_ref().is_some_and(|s| s.empty())
    }

    /// Reset the caret blink phase so the caret is solid for the next `500ms` and schedule
    /// scheduler-clock redraws on each `500ms` phase boundary while a collapsed caret remains active.
    pub(crate) fn reset_caret_blink(&mut self, cx: &mut Context<Self>) {
        self.caret_active_since_ms = self.now_ms(cx);
        if !self.has_blinking_collapsed_caret() {
            self.caret_blink_task = None;
            return;
        }
        self.caret_blink_task = Some(cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor()
                    .timer(std::time::Duration::from_millis(
                        CARET_BLINK_HALF_PERIOD_MS as u64,
                    ))
                    .await;
                let keep_going = this
                    .update(cx, |this, cx| {
                        let active = this.has_blinking_collapsed_caret();
                        if active {
                            cx.notify();
                        } else {
                            this.caret_blink_task = None;
                        }
                        active
                    })
                    .unwrap_or(false);
                if !keep_going {
                    break;
                }
            }
        }));
    }

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
        if self
            .table_cell
            .as_ref()
            .is_some_and(|c| c.input.composing())
        {
            let mut snapshot = self.page_snapshot()?.clone();
            if self.apply_table_cell_preedit_to_snapshot(&mut snapshot) {
                return Some(snapshot);
            }
        }
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
            let scope = self.active_content_scope();
            let blocks =
                RangeBlocks::between_in_scope(&snapshot, &scope, &start.block_id, &end.block_id)?;
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
    pub(crate) fn reveal_caret(&mut self, height: f32, bottom_margin: f32) {
        if !std::mem::take(&mut self.editor.reveal) {
            return;
        }
        let margin = bottom_margin.max(0.0);
        if let Some(focus) = self.visual_focus()
            && let Some(rect) = self.geometry(&focus)
        {
            if rect.y < self.scroll_y {
                self.scroll_y = rect.y.round();
            } else if rect.bottom() + margin > self.scroll_y + height {
                self.scroll_y = (rect.bottom() + margin - height).round();
            }
            self.reveal_code_caret(&focus.block_id, rect.x);
        } else if let Some(cell) = self.table_cell.as_ref()
            && let Some(layout) = self.flow_layout()
            && let Some(block) = layout.block(&cell.block_id)
            && let Some(hit) = block
                .body
                .table_cells
                .iter()
                .find(|c| c.row_id == cell.row_id && c.column_id == cell.column_id)
        {
            let rect = hit.rect.translated(block.x, block.y);
            if rect.y < self.scroll_y {
                self.scroll_y = rect.y.round();
            } else if rect.bottom() + margin > self.scroll_y + height {
                self.scroll_y = (rect.bottom() + margin - height).round();
            }
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
    /// Selected glyph runs and the paragraph breaks between them for an arbitrary `sel`.
    pub(crate) fn selection_rects_for(
        sel: &DocumentSelection,
        layout: &FlowLayout,
    ) -> Vec<FlowRect> {
        let mut out = Vec::new();
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

    /// Selected glyph runs and the paragraph breaks between them, in page coordinates.
    pub fn selection_rects(&self, layout: &FlowLayout) -> Vec<FlowRect> {
        let Some(sel) = &self.editor.selection else {
            return Vec::new();
        };
        Self::selection_rects_for(sel, layout)
    }

    /// Selection highlight rectangles for `sel` after horizontal code-block scroll clipping.
    pub(crate) fn painted_selection_rects_for(
        &self,
        sel: &DocumentSelection,
        layout: &FlowLayout,
    ) -> Vec<FlowRect> {
        let scrolled = self.overlays.scrolled_code(layout);
        Self::selection_rects_for(sel, layout)
            .into_iter()
            .filter_map(|r| match ScrolledCode::containing(&scrolled, &r) {
                Some(code) => code.span(r),
                None => Some(r),
            })
            .collect()
    }

    /// Selection highlight rectangles in page coordinates after horizontal code-block
    /// scroll translation and clipping — shared by selection painting and hit-testing.
    pub(crate) fn painted_selection_rects(&self, layout: &FlowLayout) -> Vec<FlowRect> {
        let Some(sel) = &self.editor.selection else {
            return Vec::new();
        };
        self.painted_selection_rects_for(sel, layout)
    }

    pub(crate) fn local_selection_elements(
        &self,
        layout: &FlowLayout,
        v: PageViewport,
        palette: &Palette,
        caret_alpha: f32,
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
        let mut draw = |mut r: FlowRect, color: ui::Hsla, caret: bool, apply_code_scroll: bool| {
            // Inside a sideways-scrolled code block the text sits left of its layout, and
            // what scrolled out of the code area is not painted.
            if apply_code_scroll && let Some(code) = ScrolledCode::containing(&scrolled, &r) {
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
            let total_end = r.start + pre.text.encode_utf16().count() as u64;
            for mut rect in Self::world_spans(block, r.start..total_end) {
                rect.y += rect.h - 1.0;
                rect.h = 1.0;
                draw(rect, palette.text_secondary, false, true);
            }
            if !pre.selected.is_empty() {
                let sel_start = r.start + pre.selected.start as u64;
                let sel_end = (r.start + pre.selected.end as u64).min(total_end);
                for rect in Self::world_spans(block, sel_start..sel_end) {
                    draw(rect, palette.brand.opacity(0.18), false, true);
                    let mut thick = rect;
                    thick.y += thick.h - 2.0;
                    thick.h = 2.0;
                    draw(thick, palette.brand, false, true);
                }
            }
        } else if !self.native_suppresses_gpu_caret_and_selection {
            for r in self.painted_selection_rects(layout) {
                draw(r, palette.brand.opacity(0.22), false, false);
            }
        }
        // While an overlay text field (link bar or equation editor) or in-place table cell
        // takes keys, its caret is the only one shown. When native mobile selection handles
        // own a non-collapsed range selection (or UIKit owns the cursor on iOS), suppress GPU caret.
        let suppress_caret = self.native_suppresses_gpu_caret_and_selection
            || (self.native_selection_ui
                && self
                    .editor
                    .selection
                    .as_ref()
                    .is_some_and(|sel| !sel.empty()));
        if !suppress_caret
            && self.overlays.active_text_field().is_none()
            && self.table_cell.is_none()
            && let Some(p) = self.visual_focus()
            && let Some(rect) = layout
                .block(&p.block_id)
                .and_then(|b| b.caret_rect(p.caret))
        {
            draw(rect, palette.text_primary.opacity(caret_alpha), true, true);
        }
        // Focused empty paragraph or Heading 1-6 placeholder (suppressed while composing
        // or unfocused so non-focused renders and style-oracle baselines stay unchanged).
        if self.editor.preedit.is_none()
            && self.overlays.active_text_field().is_none()
            && self.table_cell.is_none()
            && let Some(sel) = &self.editor.selection
            && sel.empty()
            && let Some(block) = layout.block(&sel.focus.block_id)
            && block.body.plain.is_empty()
            && let Some(text) = &block.body.text
            && let block_flow::FlowKind::Paragraph(kind) = block.body.kind
            && let Some(hint) = empty_block_placeholder(kind)
        {
            let rect = FlowRect::new(
                block.x + text.x,
                block.y + text.y,
                (block.body.width - text.x).max(0.0),
                text.layout.line_height(),
            );
            if rect.bottom() >= v.scroll_y && rect.y <= v.scroll_y + v.height {
                let spec = block_flow::paragraph_spec(kind);
                let mut hint_el = div()
                    .absolute()
                    .left(px(v.column_x + rect.x))
                    .top(px(rect.y - v.scroll_y))
                    .w(px(rect.w))
                    .h(px(rect.h))
                    .overflow_hidden()
                    .whitespace_nowrap()
                    .text_size(px(spec.font_size))
                    .line_height(px(rect.h))
                    .font_weight(ui::FontWeight(spec.font_weight))
                    .text_color(palette.placeholder)
                    .child(hint);
                if rect.y >= v.scroll_y && rect.bottom() <= v.scroll_y + v.height {
                    hint_el = hint_el
                        .snapshot("page.block_placeholder", Some(PAGE_SURFACE_ID))
                        .snapshot_text(hint);
                }
                el.push(hint_el.into_any_element());
            }
        }
        el.extend(self.table_cell_selection_elements(layout, v, palette, caret_alpha));
        el
    }
    pub(crate) fn begin_input(&mut self) {
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
    pub(crate) fn replace_selection(
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
        if sel.ordered(&layout).is_none()
            && sel.anchor.block_id == sel.focus.block_id
            && let Some(row_plain) = self
                .page_snapshot()
                .and_then(|s| s.block(&sel.focus.block_id))
                .and_then(text_content)
        {
            let id = sel.focus.block_id.clone();
            let bi = TextBiIndex::new(row_plain);
            let start_off = bi.utf8_to_utf16(
                bi.utf16_to_utf8_clamped(sel.anchor.offset().min(sel.focus.offset())),
            );
            let end_off = bi.utf8_to_utf16(
                bi.utf16_to_utf8_clamped(sel.anchor.offset().max(sel.focus.offset())),
            );
            let group = self
                .editor
                .last_typing
                .is_some_and(|t| now.saturating_sub(t) < 500)
                && sel.empty();
            let page = self.page_mut()?;
            if !group {
                page.stop_capturing()?;
            }
            let mut delta = Vec::new();
            if start_off > 0 {
                delta.push(TextDeltaOp::Retain {
                    retain: start_off,
                    format: None,
                });
            }
            if end_off > start_off {
                delta.push(TextDeltaOp::Delete {
                    delete: end_off - start_off,
                });
            }
            if !text.is_empty() {
                delta.push(TextDeltaOp::Insert {
                    insert: TextInsert::Text(text.into()),
                    format: None,
                });
            }
            let commit = page.apply_text_delta(&id, "prop:text", &delta, now)?;
            self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(
                &id,
                start_off + text.encode_utf16().count() as u64,
            )));
            self.editor.block_selection.clear();
            self.editor.last_typing = Some(now);
            self.editor.preedit = None;
            self.did_edit(commit, Some(&id), w, cx);
            return Ok(());
        }
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
        let scope = self.active_content_scope();
        let blocks = RangeBlocks::between_in_scope(
            self.page_snapshot()
                .ok_or_else(|| DocError::InvalidState("missing page".into()))?,
            &scope,
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
    pub(crate) fn screen_rect(&self, r: FlowRect, w: &Window) -> Bounds<Pixels> {
        Bounds::new(
            point(
                px(page_geometry(f32::from(w.viewport_size().width)).column_x + r.x),
                px(TOPBAR_HEIGHT + r.y - self.scroll_y),
            ),
            size(px(r.w), px(r.h)),
        )
    }
}
