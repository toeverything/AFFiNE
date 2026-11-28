//! Block-insertion slash commands (`Table`, `Equation`, `Database`), atomic multi-block
//! drag-handle reorder (`ReorderMany`), and word/paragraph drag-selection extension.

use std::collections::{BTreeMap, HashSet};

use blocksuite_playground_doc::{
    DocError, DocResult,
    read::{BlockContent, BlockNode},
    schema::{BlockSpec, DatabaseColumnSpec, DatabaseSpec, DatabaseViewSpec, ParagraphType},
    session::SelectionSnapshot,
};
use serde_json::json;
use ui::{Context, Window};

use crate::{
    PlaygroundView,
    block_flow::FlowLayout,
    editor_session::{DocPoint, DocumentSelection, DragSelectionMode, word_range},
};

use super::*;

fn default_database_spec() -> DatabaseSpec {
    DatabaseSpec {
        title: "Database".to_string(),
        columns: vec![DatabaseColumnSpec {
            id: "col-tags".into(),
            column_type: "multi-select".into(),
            name: "Tags".into(),
            data: json!({ "options": [] }),
        }],
        views: vec![DatabaseViewSpec {
            id: "view-table".into(),
            name: "Table View".into(),
            mode: "table".into(),
            raw: json!({
                "columns": [
                    {"id": "title", "width": 220},
                    {"id": "col-tags", "width": 160}
                ],
                "filter": {"type": "group", "op": "and", "conditions": []},
                "header": {"titleColumn": "title", "iconColumn": "type"}
            }),
        }],
        cells: BTreeMap::new(),
    }
}

impl PlaygroundView {
    /// The editor typed a `/` into paragraph or list text: open the slash menu on it.
    pub(crate) fn open_typed_slash_menu(
        &mut self,
        block_id: String,
        slash_offset: u64,
        cx: &mut Context<Self>,
    ) {
        if self.editor.slash_trigger.is_some() && self.overlays.slash_menu().is_some() {
            return;
        }
        let Some(position) = self.page().and_then(|page| {
            page.capture_selection_snapshot(&block_id, slash_offset, &block_id, slash_offset)
                .ok()
        }) else {
            return;
        };
        let now_ms = self.now_ms(cx);
        self.editor.slash_trigger = Some((block_id.clone(), position));
        self.overlays
            .open_typed_slash(block_id, slash_offset as usize, now_ms);
        cx.notify();
    }

    /// Where the `/` remembered as `position` is now, the caret behind it, and the filter
    /// typed between the two (allowing inter-word spaces like `/heading 1`).
    pub(super) fn typed_slash(
        &self,
        block_id: &str,
        position: &SelectionSnapshot,
    ) -> Option<(u64, u64, String)> {
        let page = self.page()?;
        let resolved = page.resolve_selection_snapshot(position).ok()??;
        let slash = resolved.anchor.1;
        if resolved.anchor.0 != block_id
            || resolved.focus.0 != block_id
            || resolved.focus.1 != slash
        {
            return None;
        }
        let units: Vec<u16> = page
            .read_editable_text(block_id)
            .ok()?
            .0
            .plain
            .encode_utf16()
            .collect();
        if units.get(slash as usize) != Some(&u16::from(b'/')) {
            return None;
        }
        if page
            .capture_selection_snapshot(block_id, slash, block_id, slash)
            .ok()?
            != *position
        {
            return None;
        }
        let selection = self.editor.selection.as_ref()?;
        let caret = selection.focus.offset();
        if !selection.empty() || selection.focus.block_id != block_id || caret <= slash {
            return None;
        }
        let query = String::from_utf16(units.get(slash as usize + 1..caret as usize)?).ok()?;
        if query.contains('\n')
            || query.contains('\r')
            || query.starts_with(char::is_whitespace)
            || query.contains("  ")
            || (query.ends_with(char::is_whitespace)
                && filter_slash_items_for(&query, !self.database_readonly).is_empty())
        {
            return None;
        }
        Some((slash, caret, query))
    }

    /// Synchronize the typed `/` slash menu filter with the document text and caret.
    pub(crate) fn sync_slash_trigger(&mut self, cx: &Context<Self>) {
        let Some(menu_block) = self
            .overlays
            .slash_menu()
            .filter(|menu| menu.query_in_document)
            .map(|menu| menu.block_id.clone())
        else {
            return;
        };
        let typed = self
            .editor
            .slash_trigger
            .as_ref()
            .filter(|(block_id, _)| *block_id == menu_block)
            .and_then(|(block_id, position)| self.typed_slash(block_id, position));
        match typed {
            Some((slash, _, query)) => self.overlays.set_typed_slash(slash as usize, query),
            None => {
                let now_ms = self.now_ms(cx);
                self.editor.slash_trigger = None;
                self.overlays.close_slash(now_ms);
            }
        }
    }

    /// Collect top-level selected blocks in document order when dragging a block that belongs
    /// to a multi-block `block_selection`; otherwise returns just `[block_id]`.
    pub(super) fn resolve_multi_drag_ids(&self, block_id: &str) -> Vec<String> {
        if self.editor.block_selection.len() <= 1
            || !self.editor.block_selection.iter().any(|id| id == block_id)
        {
            return vec![block_id.to_string()];
        }
        let selected: HashSet<&str> = self
            .editor
            .block_selection
            .iter()
            .map(String::as_str)
            .collect();
        let Some(root) = self.snapshot.as_ref().and_then(|s| s.root.as_ref()) else {
            return vec![block_id.to_string()];
        };
        let mut out = Vec::new();
        fn walk(node: &BlockNode, selected: &HashSet<&str>, out: &mut Vec<String>) {
            for child in &node.children {
                if selected.contains(child.id.as_str()) {
                    out.push(child.id.clone());
                } else {
                    walk(child, selected, out);
                }
            }
        }
        walk(root, &selected, &mut out);
        if out.is_empty() {
            vec![block_id.to_string()]
        } else {
            out
        }
    }

    /// Reorder a multi-block selection into `parent_id` before `insert_index` in one atomic
    /// `structural_edit` undo step, preserving the multi-block selection afterward.
    pub(super) fn run_reorder_many(
        &mut self,
        parent_id: &str,
        child_ids: Vec<String>,
        insert_index: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        if child_ids.is_empty() {
            return Ok(());
        }
        let snapshot = self
            .snapshot
            .clone()
            .ok_or_else(|| DocError::InvalidState("missing page".into()))?;
        let root = snapshot
            .root
            .as_ref()
            .ok_or_else(|| DocError::InvalidState("missing root".into()))?;
        let dragged_set: HashSet<&str> = child_ids.iter().map(String::as_str).collect();
        let parent_node = snapshot
            .block(parent_id)
            .ok_or_else(|| DocError::BlockNotFound(parent_id.to_string()))?;
        // Anchor sibling: first non-dragged child at or after `insert_index`.
        let anchor_sibling_id: Option<String> = parent_node
            .children
            .get(insert_index..)
            .and_then(|tail| tail.iter().find(|c| !dragged_set.contains(c.id.as_str())))
            .map(|c| c.id.clone());
        let initial_children: Vec<String> =
            parent_node.children.iter().map(|c| c.id.clone()).collect();
        let mut old_parents: Vec<(String, String)> = Vec::with_capacity(child_ids.len());
        for cid in &child_ids {
            if let Some((old_parent, _)) = find_parent(root, cid) {
                old_parents.push((cid.clone(), old_parent.id.clone()));
            }
        }
        let before = self.selection_snapshot();
        let now = self.now_ms(cx) as u64;
        let page = self.page_mut()?;
        page.stop_capturing()?;
        let commit = page.structural_edit(now, move |page| {
            let mut live_children = initial_children.clone();
            for (cid, old_parent_id) in &old_parents {
                let raw_target = anchor_sibling_id
                    .as_deref()
                    .and_then(|aid| live_children.iter().position(|id| id == aid))
                    .unwrap_or(live_children.len());
                if old_parent_id == parent_id {
                    let Some(cur_idx) = live_children.iter().position(|id| id == cid) else {
                        continue;
                    };
                    let new_idx = if cur_idx < raw_target {
                        raw_target - 1
                    } else {
                        raw_target
                    };
                    if cur_idx != new_idx {
                        page.reparent_block(cid, parent_id, parent_id, new_idx as u64, now)?;
                        let moved = live_children.remove(cur_idx);
                        live_children.insert(new_idx, moved);
                    }
                } else {
                    page.reparent_block(cid, old_parent_id, parent_id, raw_target as u64, now)?;
                    live_children.insert(raw_target, cid.clone());
                }
            }
            Ok(())
        })?;
        if commit.is_some()
            && let Some(before) = before
        {
            page.set_undo_selection_snapshot(before)?;
        }
        page.stop_capturing()?;
        self.editor.last_typing = None;
        self.did_edit(commit, None, window, cx);
        self.editor.block_selection = child_ids;
        self.announce_selection(cx);
        self.editor.reveal = false;
        window.notify_text_selection_changed(&self.editor_focus);
        cx.notify();
        Ok(())
    }

    /// Execute `SlashCommand::Table`, `SlashCommand::Equation`, or `SlashCommand::Database`
    /// in a single atomic `structural_edit` undo step.
    #[allow(clippy::too_many_arguments)]
    pub(super) fn run_block_insert_slash_command(
        &mut self,
        block_id: &str,
        parent_id: &str,
        slot: usize,
        node: &BlockNode,
        command: SlashCommand,
        strip: Option<(u64, u64)>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        if command == SlashCommand::Database && self.database_readonly {
            self.show_database_readonly_toast_once(cx);
            return Ok(());
        }
        let remaining_empty = node.children.is_empty()
            && match &node.content {
                BlockContent::Paragraph { text, .. } => {
                    let total = text.plain.encode_utf16().count() as u64;
                    let stripped = strip.map_or(0, |(_, len)| len);
                    total <= stripped
                }
                _ => false,
            };
        let fresh = self.fresh_block_id();
        let db_row_id = (command == SlashCommand::Database).then(|| self.fresh_block_id());
        let spec = match command {
            SlashCommand::Database => BlockSpec::Database(default_database_spec()),
            _ => command.block_spec(),
        };
        let before = self.selection_snapshot();
        let now = self.now_ms(cx) as u64;
        let page = self.page_mut()?;
        let commit = page.structural_edit(now, |page| {
            if let Some((slash, len)) = strip {
                page.remove_text(block_id, "prop:text", slash, len, now)?;
            }
            page.add_block(&fresh, spec, Some(parent_id), Some(slot as u64 + 1), now)?;
            if let Some(ref row_id) = db_row_id {
                page.add_block(
                    row_id,
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: String::new(),
                    },
                    Some(&fresh),
                    Some(0),
                    now,
                )?;
            }
            if remaining_empty {
                page.delete_block_subtree(parent_id, block_id, now)?;
            }
            Ok(())
        })?;
        if commit.is_some()
            && let Some(before) = before
        {
            page.set_undo_selection_snapshot(before)?;
        }
        if remaining_empty {
            self.editor.selection = None;
        }
        self.editor.last_typing = None;
        self.did_edit(commit, None, window, cx);
        match command {
            SlashCommand::Table => {
                let first_cell = self
                    .snapshot
                    .as_ref()
                    .and_then(|s| s.block(&fresh))
                    .and_then(|n| match &n.content {
                        BlockContent::Table(t) => Some((
                            t.rows.first()?.row_id.clone(),
                            t.columns.first()?.column_id.clone(),
                        )),
                        _ => None,
                    });
                if let Some((row_id, col_id)) = first_cell {
                    self.focus_table_cell(fresh, row_id, col_id, None, window, cx);
                }
            }
            SlashCommand::Equation => {
                self.dispatch_overlay(
                    OverlayEvent::OpenEquationEditor {
                        target: EquationTarget::Block { block_id: fresh },
                        initial: String::new(),
                    },
                    window,
                    cx,
                );
            }
            SlashCommand::Database => {}
            _ => {}
        }
        Ok(())
    }

    /// Extend a body mouse-drag selection according to `self.editor.drag_mode`
    /// (`Character`, `Word`, or `Paragraph`).
    pub(crate) fn extend_drag_selection(
        &self,
        sel: &DocumentSelection,
        focus: DocPoint,
        layout: Option<&FlowLayout>,
    ) -> DocumentSelection {
        match &self.editor.drag_mode {
            DragSelectionMode::Character => DocumentSelection {
                anchor: sel.anchor.clone(),
                focus,
            },
            DragSelectionMode::Word {
                block_id: anchor_block,
                start: a_start,
                end: a_end,
            } => {
                let focus_text = self.block_text(&focus.block_id).unwrap_or("");
                let f_range = word_range(focus_text, focus.offset());
                let forward = match layout {
                    Some(l) => {
                        let ai = l
                            .blocks
                            .iter()
                            .position(|b| b.block_id == *anchor_block)
                            .unwrap_or(0);
                        let fi = l
                            .blocks
                            .iter()
                            .position(|b| b.block_id == focus.block_id)
                            .unwrap_or(ai);
                        (fi, f_range.start) >= (ai, *a_start)
                    }
                    None => f_range.start >= *a_start,
                };
                if forward {
                    DocumentSelection {
                        anchor: DocPoint::new(anchor_block, *a_start),
                        focus: DocPoint::new(&focus.block_id, f_range.end),
                    }
                } else {
                    DocumentSelection {
                        anchor: DocPoint::new(anchor_block, *a_end),
                        focus: DocPoint::new(&focus.block_id, f_range.start),
                    }
                }
            }
            DragSelectionMode::Paragraph {
                block_id: anchor_block,
            } => {
                let anchor_len = self
                    .block_text(anchor_block)
                    .map_or(0, |s| s.encode_utf16().count() as u64);
                let focus_len = self
                    .block_text(&focus.block_id)
                    .map_or(0, |s| s.encode_utf16().count() as u64);
                let forward = match layout {
                    Some(l) => {
                        let ai = l
                            .blocks
                            .iter()
                            .position(|b| b.block_id == *anchor_block)
                            .unwrap_or(0);
                        let fi = l
                            .blocks
                            .iter()
                            .position(|b| b.block_id == focus.block_id)
                            .unwrap_or(ai);
                        fi >= ai
                    }
                    None => true,
                };
                if forward {
                    DocumentSelection {
                        anchor: DocPoint::new(anchor_block, 0),
                        focus: DocPoint::new(&focus.block_id, focus_len),
                    }
                } else {
                    DocumentSelection {
                        anchor: DocPoint::new(anchor_block, anchor_len),
                        focus: DocPoint::new(&focus.block_id, 0),
                    }
                }
            }
        }
    }
}
