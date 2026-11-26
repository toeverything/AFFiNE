use std::ops::Range;

use blocksuite_playground_doc::schema::{BlockSpec, ListType, ParagraphType};
use ui::{Bounds, EntityInputHandler, Pixels, Point, UTF16Selection};

use super::*;
use crate::block_flow::ScrolledCode;
use crate::overlays::LinkBar;
use crate::rich_text::TextBiIndex;

impl EntityInputHandler for PlaygroundView {
    fn paste(&mut self, item: ui::ClipboardItem, w: &mut Window, cx: &mut Context<Self>) {
        if self.overlays.active_text_field().is_some() {
            if let Some(text) = item.text() {
                let _ = self.link_input(w, cx, |link| link.replace(None, &text));
            }
            return;
        }
        if self.table_cell.is_some() {
            if let Some(text) = item.text() {
                let _ = self.table_cell_edit(w, cx, |cell| cell.input.replace(None, &text));
            }
            return;
        }
        if self.edgeless.authoring.label_editor().is_some() {
            if let Some(text) = item.text() {
                let _ = self.edgeless_label_edit(w, cx, |ed| ed.replace(None, &text));
            }
            return;
        }
        if self.mode == crate::PlaygroundMode::Edgeless
            && self.edgeless.authoring.editing_spatial_block().is_none()
        {
            return;
        }
        if self.suppress_unselected_root_input && self.editor.selection.is_none() {
            return;
        }
        self.begin_input();
        if let Some((slice, rich)) = crate::clipboard::read_slice(&item)
            && let Err(e) = self.paste_slice(slice, rich, w, cx)
        {
            eprintln!("clipboard paste: {e}");
        }
    }
    fn text_for_range(
        &mut self,
        range: Range<usize>,
        adjusted: &mut Option<Range<usize>>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<String> {
        if let Some(link) = self.overlays.active_text_field() {
            let (text, covered) = link.text_for_range(range);
            *adjusted = Some(covered);
            return Some(text);
        }
        if let Some(cell) = self.table_cell.as_ref() {
            let (text, covered) = cell.input.text_for_range(range);
            *adjusted = Some(covered);
            return Some(text);
        }
        if let Some(ed) = self.edgeless.authoring.label_editor() {
            let (text, covered) = ed.text_for_range(range);
            *adjusted = Some(covered);
            return Some(text);
        }
        let text = self.display_text()?;
        let index = TextBiIndex::new(&text);
        let start = index.utf16_to_utf8_clamped(range.start as u64);
        let end = index.utf16_to_utf8_clamped(range.end as u64).max(start);
        *adjusted = Some(index.utf8_to_utf16(start) as usize..index.utf8_to_utf16(end) as usize);
        Some(text[start..end].into())
    }
    fn selected_text_range(
        &mut self,
        _: bool,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<UTF16Selection> {
        if let Some(link) = self.overlays.active_text_field() {
            let (range, reversed) = link.shown_selection();
            return Some(UTF16Selection { range, reversed });
        }
        if let Some(cell) = self.table_cell.as_ref() {
            let (range, reversed) = cell.input.shown_selection();
            return Some(UTF16Selection { range, reversed });
        }
        if let Some(ed) = self.edgeless.authoring.label_editor() {
            let (range, reversed) = ed.shown_selection();
            return Some(UTF16Selection { range, reversed });
        }
        if let Some((_, r)) = self.composed_range()
            && let Some(pre) = &self.editor.preedit
        {
            return Some(UTF16Selection {
                range: r.start as usize + pre.selected.start..r.start as usize + pre.selected.end,
                reversed: false,
            });
        }
        let sel = self.editor.selection.as_ref()?;
        let f = sel.focus.offset() as usize;
        let a = if sel.anchor.block_id == sel.focus.block_id {
            sel.anchor.offset() as usize
        } else {
            f
        };
        Some(UTF16Selection {
            range: a.min(f)..a.max(f),
            reversed: a > f,
        })
    }
    fn text_length_utf16(&mut self, _: &mut Window, _: &mut Context<Self>) -> Option<usize> {
        if let Some(link) = self.overlays.active_text_field() {
            return Some(link.text().encode_utf16().count());
        }
        if let Some(cell) = self.table_cell.as_ref() {
            return Some(cell.input.display_text().encode_utf16().count());
        }
        if let Some(ed) = self.edgeless.authoring.label_editor() {
            return Some(ed.display_text().encode_utf16().count());
        }
        Some(self.display_text()?.encode_utf16().count())
    }
    fn set_selected_text_range(&mut self, r: Range<usize>, w: &mut Window, cx: &mut Context<Self>) {
        if self
            .link_input(w, cx, |link| link.select(r.clone()))
            .is_some()
        {
            return;
        }
        if self
            .table_cell_input(w, cx, |cell| cell.input.select(r.clone()))
            .is_some()
        {
            return;
        }
        if self
            .edgeless_label_input(w, cx, |ed| ed.select(r.clone()))
            .is_some()
        {
            return;
        }
        if let Some(focus) = self.visual_focus() {
            self.change_selection(
                DocumentSelection {
                    anchor: DocPoint::new(&focus.block_id, r.start as u64),
                    focus: DocPoint::new(&focus.block_id, r.end as u64),
                },
                w,
                cx,
            );
        }
    }
    fn marked_text_range(&self, _: &mut Window, _: &mut Context<Self>) -> Option<Range<usize>> {
        if let Some(link) = self.overlays.active_text_field() {
            return link.marked_range();
        }
        if let Some(cell) = self.table_cell.as_ref() {
            return cell.input.marked_range();
        }
        if let Some(ed) = self.edgeless.authoring.label_editor() {
            return ed.marked_range();
        }
        let (_, r) = self.composed_range()?;
        let start = r.start as usize;
        Some(start..start + self.editor.preedit.as_ref()?.text.encode_utf16().count())
    }
    fn unmark_text(&mut self, w: &mut Window, cx: &mut Context<Self>) {
        if self.link_input(w, cx, LinkBar::unmark).is_some() {
            return;
        }
        if self
            .table_cell_edit(w, cx, |cell| cell.input.unmark())
            .is_some()
        {
            return;
        }
        if self
            .edgeless_label_edit(w, cx, crate::edgeless::EdgelessLabelEditor::unmark)
            .is_some()
        {
            return;
        }
        if self.mode == crate::PlaygroundMode::Edgeless
            && self.edgeless.authoring.editing_spatial_block().is_none()
        {
            return;
        }
        if let Some(pre) = self.editor.preedit.as_ref() {
            let text = pre.text.clone();
            self.replace_text_in_range(None, &text, w, cx);
        }
    }
    fn replace_text_in_range(
        &mut self,
        r: Option<Range<usize>>,
        text: &str,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self
            .link_input(w, cx, |link| link.replace(r.clone(), text))
            .is_some()
        {
            return;
        }
        if self
            .table_cell_edit(w, cx, |cell| cell.input.replace(r.clone(), text))
            .is_some()
        {
            return;
        }
        if self
            .edgeless_label_edit(w, cx, |ed| ed.replace(r.clone(), text))
            .is_some()
        {
            return;
        }
        if self.mode == crate::PlaygroundMode::Edgeless
            && self.edgeless.authoring.editing_spatial_block().is_none()
        {
            return;
        }
        if self.suppress_unselected_root_input && self.editor.selection.is_none() {
            return;
        }
        self.begin_input();
        let selection = self.replacement_selection(r);
        if self.editor.preedit.is_some() {
            self.clear_composition(w, cx);
            if text.is_empty() {
                return;
            }
        }
        if let Some(sel) = selection
            && let Err(e) = self.replace_selection(sel, text, w, cx)
        {
            eprintln!("text replacement: {e}");
        }
    }
    fn replace_and_mark_text_in_range(
        &mut self,
        r: Option<Range<usize>>,
        text: &str,
        selected: Option<Range<usize>>,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self
            .link_input(w, cx, |link| link.mark(r.clone(), text, selected.clone()))
            .is_some()
        {
            return;
        }
        if self
            .table_cell_input(w, cx, |cell| {
                cell.input.mark(r.clone(), text, selected.clone())
            })
            .is_some()
        {
            return;
        }
        if self
            .edgeless_label_input(w, cx, |ed| ed.mark(r.clone(), text, selected.clone()))
            .is_some()
        {
            return;
        }
        if self.mode == crate::PlaygroundMode::Edgeless
            && self.edgeless.authoring.editing_spatial_block().is_none()
        {
            return;
        }
        if self.suppress_unselected_root_input && self.editor.selection.is_none() {
            return;
        }
        self.begin_input();
        if text.is_empty() {
            self.clear_composition(w, cx);
            return;
        }
        let Some(sel) = self.replacement_selection(r) else {
            return;
        };
        let Some(page) = self.page() else { return };
        let backward = if let Some(pre) = &self.editor.preedit {
            pre.backward
        } else if sel.empty() {
            false
        } else {
            let Some(layout) = self.flow_layout() else {
                return;
            };
            let Some((_, _, _, _, backward)) = sel.ordered(&layout) else {
                return;
            };
            backward
        };
        let Ok(replacement) = sel.snapshot(page) else {
            return;
        };
        let n = text.encode_utf16().count();
        let selected = selected.unwrap_or(n..n);
        self.dirty_text = None;
        self.editor.preedit = Some(Preedit {
            replacement,
            backward,
            text: text.into(),
            selected: selected.start.min(n)..selected.end.min(n),
        });
        self.editor.reveal = true;
        self.doc_rev += 1;
        w.notify_text_input_changed(&self.editor_focus);
        cx.notify();
    }
    fn bounds_for_range(
        &mut self,
        r: Range<usize>,
        bounds: Bounds<Pixels>,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> Option<Bounds<Pixels>> {
        self.selection_bounds_for_range(r, bounds, w, cx)
            .into_iter()
            .next()
    }
    fn selection_bounds_for_range(
        &mut self,
        r: Range<usize>,
        _: Bounds<Pixels>,
        w: &mut Window,
        _: &mut Context<Self>,
    ) -> Vec<Bounds<Pixels>> {
        // The link field answers with its box: candidates open under the field.
        if let Some(link) = self.overlays.active_text_field() {
            return link
                .bounds()
                .map(|field| field.bounds(point(px(0.0), px(0.0))))
                .into_iter()
                .collect();
        }
        if self.table_cell.is_some() {
            if let Some(layout) = self.ensure_layout(
                page_geometry(f32::from(w.viewport_size().width)).column_width,
                w,
            ) {
                return self.table_cell_selection_bounds(r, &layout, w);
            }
            return vec![];
        }
        if self.mode == crate::PlaygroundMode::Edgeless {
            if let Some(bounds) = self.edgeless_label_screen_bounds() {
                return vec![bounds];
            }
            if let Some(sel) = &self.editor.selection {
                let id = self
                    .composed_range()
                    .map(|(id, _)| id)
                    .unwrap_or_else(|| sel.focus.block_id.clone());
                if let Some(bounds) = self.edgeless_spatial_block_caret_bounds(&id, r.start as u64)
                {
                    return vec![bounds];
                }
            }
        }
        let Some(sel) = &self.editor.selection else {
            return vec![];
        };
        let id = self
            .composed_range()
            .map(|(id, _)| id)
            .unwrap_or_else(|| sel.focus.block_id.clone());
        let Some(layout) = self.ensure_layout(
            page_geometry(f32::from(w.viewport_size().width)).column_width,
            w,
        ) else {
            return vec![];
        };
        let Some(block) = layout.block(&id) else {
            return vec![];
        };
        let mut rects = Self::world_spans(block, r.start as u64..r.end as u64);
        if rects.is_empty()
            && let Some(caret) = block.caret_rect(DocPoint::new(&id, r.start as u64).caret)
        {
            rects.push(caret);
        }
        // The lines of a sideways-scrolled code block sit left of their layout; what the
        // input method is told follows them and stays inside the code area.
        if let Some(code) = ScrolledCode::of_block(block, self.overlays.code_scroll_x(&id)) {
            let caret = rects.len() == 1 && rects[0].w <= 1.0;
            rects = rects
                .into_iter()
                .filter_map(|rect| {
                    if caret {
                        code.caret(rect)
                    } else {
                        code.span(rect)
                    }
                })
                .collect();
        }
        rects.into_iter().map(|r| self.screen_rect(r, w)).collect()
    }
    fn character_index_for_point(
        &mut self,
        p: Point<Pixels>,
        w: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<usize> {
        if let Some(editor) = self.overlays.equation_editor()
            && let Some(idx) = editor.hit_test_point(f32::from(p.x), f32::from(p.y))
        {
            return Some(idx);
        }
        if let Some(link) = self.overlays.active_text_field() {
            let (selection, reversed) = link.shown_selection();
            return link
                .bounds()
                .filter(|field| field.contains(f32::from(p.x), f32::from(p.y)))
                .map(|_| {
                    if reversed {
                        selection.start
                    } else {
                        selection.end
                    }
                });
        }
        if self.table_cell.is_some() {
            return self.table_cell_character_index_for_point(p, w);
        }
        let p = self.input_point(p, w)?;
        (self.editor.selection.as_ref()?.focus.block_id == p.block_id)
            .then_some(p.offset() as usize)
    }
}

pub(super) fn paragraph() -> BlockSpec {
    BlockSpec::Paragraph {
        paragraph_type: ParagraphType::Text,
        text: String::new(),
    }
}
pub(super) fn list(kind: ListType, checked: bool, order: Option<i32>) -> BlockSpec {
    BlockSpec::List {
        list_type: kind,
        text: String::new(),
        checked,
        order,
    }
}
