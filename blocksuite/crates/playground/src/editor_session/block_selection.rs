use blocksuite_playground_doc::{
    DocResult,
    read::BlockNode,
    schema::{ListType, ParagraphType},
};
use ui::{Context, KeyDownEvent, Window};

use super::*;
use crate::overlays::SlashCommand;

pub(super) fn conversion_shortcut(key: &str, alt: bool, shift: bool) -> Option<SlashCommand> {
    if alt && !shift {
        return match key {
            "0" => Some(SlashCommand::Paragraph(ParagraphType::Text)),
            "1" => Some(SlashCommand::Paragraph(ParagraphType::H1)),
            "2" => Some(SlashCommand::Paragraph(ParagraphType::H2)),
            "3" => Some(SlashCommand::Paragraph(ParagraphType::H3)),
            "4" => Some(SlashCommand::Paragraph(ParagraphType::H4)),
            "5" => Some(SlashCommand::Paragraph(ParagraphType::H5)),
            "6" => Some(SlashCommand::Paragraph(ParagraphType::H6)),
            "8" => Some(SlashCommand::List(ListType::Bulleted)),
            "9" => Some(SlashCommand::List(ListType::Numbered)),
            "c" => Some(SlashCommand::Code),
            "d" => Some(SlashCommand::Divider),
            _ => None,
        };
    }
    if shift && !alt {
        return match key {
            "0" | ")" => Some(SlashCommand::Paragraph(ParagraphType::Text)),
            "1" | "!" => Some(SlashCommand::Paragraph(ParagraphType::H1)),
            "2" | "@" => Some(SlashCommand::Paragraph(ParagraphType::H2)),
            "3" | "#" => Some(SlashCommand::Paragraph(ParagraphType::H3)),
            "4" | "$" => Some(SlashCommand::Paragraph(ParagraphType::H4)),
            "5" | "%" => Some(SlashCommand::Paragraph(ParagraphType::H5)),
            "6" | "^" => Some(SlashCommand::Paragraph(ParagraphType::H6)),
            "8" | "*" => Some(SlashCommand::List(ListType::Bulleted)),
            "9" | "(" => Some(SlashCommand::List(ListType::Numbered)),
            "d" => Some(SlashCommand::Divider),
            _ => None,
        };
    }
    None
}

impl PlaygroundView {
    pub(super) fn block_selection_slice(&self) -> Option<crate::clipboard::Slice> {
        if self.editor.block_selection.is_empty() {
            return None;
        }
        let snapshot = self.page_snapshot()?;
        let page = self.page()?;
        let root = snapshot.root.as_ref()?;
        let ids: BTreeSet<&str> = self
            .editor
            .block_selection
            .iter()
            .map(String::as_str)
            .collect();
        let mut selected = BTreeMap::new();
        for node in page_content_roots(root).flat_map(BlockNode::walk) {
            if !ids.contains(node.id.as_str()) {
                continue;
            }
            let delta = if text_content(node).is_some() {
                page.read_editable_text(&node.id).ok()?.0.delta
            } else {
                Vec::new()
            };
            selected.insert(
                node.id.clone(),
                crate::clipboard::SliceBlock::from_node(
                    node,
                    page.export_slice_props(&node.id).ok()?,
                    &delta,
                ),
            );
        }
        let mut blocks = Vec::new();
        for child in page_content_roots(root) {
            crate::clipboard::SliceBlock::keep_selected(child, &mut selected, &mut blocks);
        }
        (!blocks.is_empty()).then(|| {
            crate::clipboard::Slice::new(
                self.state.workspace.room(),
                self.page_id.as_deref().unwrap_or(""),
                blocks,
            )
        })
    }

    pub(super) fn delete_selected_blocks(
        &mut self,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        if self.editor.block_selection.is_empty() {
            return Ok(());
        }
        let Some(snapshot) = self.snapshot.clone() else {
            return Ok(());
        };
        let Some(root) = snapshot.root.as_ref() else {
            return Ok(());
        };
        let selected_set: BTreeSet<String> = self.editor.block_selection.iter().cloned().collect();
        // Only remove top-level selected blocks (skip descendants whose ancestor is also selected).
        let mut top_selected: Vec<(String, String)> = Vec::new();
        for id in &self.editor.block_selection {
            let mut cur = id.as_str();
            let mut ancestor_selected = false;
            while let Some((parent, _)) = parent_of(&snapshot, cur) {
                if selected_set.contains(&parent.id) {
                    ancestor_selected = true;
                    break;
                }
                cur = &parent.id;
            }
            if !ancestor_selected && let Some((parent, _)) = parent_of(&snapshot, id) {
                top_selected.push((parent.id.clone(), id.clone()));
            }
        }
        let first_parent_id = top_selected
            .first()
            .map(|(parent_id, _)| parent_id.clone())
            .or_else(|| {
                root.children
                    .iter()
                    .find(|n| n.is_page_visible_note())
                    .map(|n| n.id.clone())
            });
        let mut deleted_subtree_ids: BTreeSet<String> = BTreeSet::new();
        for (_, id) in &top_selected {
            if let Some(node) = snapshot.block(id) {
                for desc in node.walk() {
                    deleted_subtree_ids.insert(desc.id.clone());
                }
            } else {
                deleted_subtree_ids.insert(id.clone());
            }
        }
        let remaining_editable = self.flow_layout().and_then(|layout| {
            layout
                .blocks
                .iter()
                .find(|b| {
                    b.editable()
                        && !matches!(b.body.kind, block_flow::FlowKind::Title)
                        && !deleted_subtree_ids.contains(&b.block_id)
                })
                .map(|b| b.block_id.clone())
        });
        let fallback_id = self.fresh_block_id();
        let now = self.now_ms(cx) as u64;
        let page = self.page_mut()?;
        page.stop_capturing()?;
        let commit = page.structural_edit(now, |page| {
            for (parent_id, id) in &top_selected {
                let _ = page.delete_block_subtree(parent_id, id, now);
            }
            if remaining_editable.is_none()
                && let Some(parent_id) = &first_parent_id
            {
                page.add_block(&fallback_id, paragraph(), Some(parent_id), Some(0), now)?;
            }
            Ok(())
        })?;
        self.editor.block_selection.clear();
        self.editor.selection = if remaining_editable.is_none() && first_parent_id.is_some() {
            Some(DocumentSelection::caret(DocPoint::new(fallback_id, 0)))
        } else {
            None
        };
        self.editor.last_typing = None;
        self.did_edit(commit, None, w, cx);
        Ok(())
    }

    pub(super) fn handle_block_selection_key(
        &mut self,
        e: &KeyDownEvent,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult<bool> {
        if self.editor.block_selection.is_empty() {
            return Ok(false);
        }
        let m = e.keystroke.modifiers;
        let cmd = m.secondary(cx);
        let key = e.keystroke.key.as_str();
        match key {
            "escape" => {
                self.editor.block_selection.clear();
                cx.notify();
                Ok(true)
            }
            "backspace" | "delete" => {
                self.delete_selected_blocks(w, cx)?;
                Ok(true)
            }
            "enter" => {
                let last_id = self.editor.block_selection.last().cloned();
                if let Some(last_id) = last_id
                    && let Some(snapshot) = self.snapshot.clone()
                    && let Some((parent, slot)) = parent_of(&snapshot, &last_id)
                {
                    let new_id = self.fresh_block_id();
                    let now = self.now_ms(cx) as u64;
                    let page = self.page_mut()?;
                    page.stop_capturing()?;
                    let commit = page.add_block(
                        &new_id,
                        paragraph(),
                        Some(&parent.id),
                        Some(slot as u64 + 1),
                        now,
                    )?;
                    self.editor.block_selection.clear();
                    self.editor.selection =
                        Some(DocumentSelection::caret(DocPoint::new(new_id, 0)));
                    self.editor.last_typing = None;
                    self.did_edit(commit, None, w, cx);
                }
                Ok(true)
            }
            "c" | "x" if cmd => {
                if let Some(slice) = self.block_selection_slice() {
                    crate::clipboard::write_slice(&slice, cx);
                    if key == "x" {
                        self.delete_selected_blocks(w, cx)?;
                    }
                }
                Ok(true)
            }
            "a" if cmd => {
                if let Some(layout) = self.flow_layout() {
                    self.editor.block_selection = layout
                        .blocks
                        .iter()
                        .filter(|b| !matches!(b.body.kind, block_flow::FlowKind::Title))
                        .map(|b| b.block_id.clone())
                        .collect();
                    cx.notify();
                }
                Ok(true)
            }
            "z" if cmd => {
                self.editor.block_selection.clear();
                self.history(m.shift, w, cx)?;
                Ok(true)
            }
            "y" if cmd => {
                self.editor.block_selection.clear();
                self.history(true, w, cx)?;
                Ok(true)
            }
            _ => Ok(false),
        }
    }

    pub(super) fn select_all_blocks(&mut self, w: &mut Window, cx: &mut Context<Self>) {
        if let Some(layout) = self.flow_layout() {
            let ids: Vec<String> = layout
                .blocks
                .iter()
                .filter(|b| !matches!(b.body.kind, block_flow::FlowKind::Title))
                .map(|b| b.block_id.clone())
                .collect();
            if !ids.is_empty() {
                self.editor.selection = None;
                self.editor.block_selection = ids;
                self.editor.pending_marks.clear();
                self.announce_selection(cx);
                w.notify_text_selection_changed(&self.editor_focus);
                cx.notify();
            }
        }
    }

    pub(super) fn open_link_bar_shortcut(&mut self, w: &mut Window, cx: &mut Context<Self>) {
        let width = page_geometry(f32::from(w.viewport_size().width)).column_width;
        let Some(layout) = self.ensure_layout(width, w) else {
            return;
        };
        let Some(selection_format) = self.selection_format(&layout) else {
            return;
        };
        let now_ms = self.now_ms(cx);
        let before = self.link_input_state();
        self.overlays.open_link_field(&selection_format, now_ms);
        self.sync_link_input(before, w, cx);
    }
}
