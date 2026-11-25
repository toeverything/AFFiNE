use blocksuite_playground_doc::{
    DocError, DocResult,
    read::{BlockNode, TextAlign as BlockAlign},
    schema::{BlockSpec, ListType, ParagraphType},
    session::SelectionSnapshot,
};
use ui::{Context, Window};
use y_octo::{Any, SessionValue, TextAttributes};

use crate::{
    PlaygroundView,
    block_flow::FlowKind,
    editor_session::{DocPoint, DocumentSelection},
};

use super::*;

impl PlaygroundView {
    /// Snapshot of the editor's selection for the undo entry an edit creates.
    pub(super) fn selection_snapshot(&self) -> Option<SelectionSnapshot> {
        self.editor.selection.as_ref()?.snapshot(self.page()?).ok()
    }

    /// Carry out one overlay edit as a single undo step and publish it.
    pub(super) fn run_overlay_edit(
        &mut self,
        edit: DocEdit,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let now = self.now_ms(cx) as u64;
        match edit {
            DocEdit::Mark(key) => self.format_mark(key, window, cx),
            DocEdit::Align(align) => self.format_selection(Some(align), None, window, cx),
            DocEdit::Link(url) => self.format_selection(None, Some(url), window, cx),
            DocEdit::Slash {
                block_id,
                command,
                typed,
            } => self.run_slash_command(&block_id, command, typed, window, cx),
            edit @ (DocEdit::SetProp { .. } | DocEdit::Reorder { .. }) => {
                let before = self.selection_snapshot();
                let page = self.page_mut()?;
                // A block control is its own undo step, never merged into typing.
                page.stop_capturing()?;
                let commit = match &edit {
                    DocEdit::SetProp {
                        block_id,
                        key,
                        value,
                    } => {
                        page.set_block_prop(block_id, *key, SessionValue::Any(value.clone()), now)?
                    }
                    DocEdit::Reorder {
                        parent_id,
                        child_id,
                        new_index,
                    } => page.reparent_block(child_id, parent_id, parent_id, *new_index, now)?,
                    _ => None,
                };
                if commit.is_some()
                    && let Some(before) = before
                {
                    page.set_undo_selection_snapshot(before)?;
                }
                page.stop_capturing()?;
                self.editor.last_typing = None;
                self.did_edit(commit, None, window, cx);
                // The page stays where it is; the caret may be far from the control.
                self.editor.reveal = false;
                Ok(())
            }
        }
    }

    /// Align the selected paragraph and list blocks, or set or clear the link of the
    /// selected text, in one undo step.
    pub(super) fn format_selection(
        &mut self,
        align: Option<BlockAlign>,
        link: Option<Option<String>>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let Some(selection) = self.editor.selection.clone() else {
            return Ok(());
        };
        let Some(layout) = self.flow_layout() else {
            return Ok(());
        };
        let Some((start, end, a, b, _)) = selection.ordered(&layout) else {
            return Ok(());
        };
        // Alignment goes on every paragraph and list block the selection touches, empty
        // ones included; a link only where there is text to carry it.
        let mut blocks: Vec<&str> = Vec::new();
        let mut ranges: Vec<(&str, u64, u64)> = Vec::new();
        for block in &layout.blocks[a..=b] {
            if !matches!(block.body.kind, FlowKind::Paragraph(_) | FlowKind::List(_)) {
                continue;
            }
            let id = block.block_id.as_str();
            blocks.push(id);
            let from = if id == start.block_id {
                start.offset()
            } else {
                0
            };
            let to = if id == end.block_id {
                end.offset()
            } else {
                block.body.plain.encode_utf16().count() as u64
            };
            if to > from {
                ranges.push((id, from, to - from));
            }
        }
        let now = self.now_ms(cx) as u64;
        let page = self.page_mut()?;
        let before = selection.snapshot(page)?;
        let commit = page.structural_edit(now, |page| {
            if let Some(align) = align {
                for id in &blocks {
                    page.set_block_prop(
                        id,
                        "prop:textAlign",
                        SessionValue::Any(Any::String(align.as_str().to_string())),
                        now,
                    )?;
                }
            }
            if let Some(url) = &link {
                for (id, from, len) in &ranges {
                    let value = url.clone().map_or(Any::Null, Any::String);
                    page.format_text(
                        id,
                        "prop:text",
                        *from,
                        *len,
                        TextAttributes::from([("link".to_string(), value)]),
                        now,
                    )?;
                }
            }
            Ok(())
        })?;
        if commit.is_some() {
            page.set_undo_selection_snapshot(before)?;
        }
        self.editor.last_typing = None;
        self.did_edit(commit, None, window, cx);
        Ok(())
    }

    /// Run a slash menu command on a block in one undo step, the way BlockSuite's menu
    /// does.
    ///
    /// A command typed into the block (`typed`) goes first: the `/` and the filter behind
    /// it are removed, and nothing at all happens when [`Self::typed_slash`] no longer
    /// finds them. A paragraph type, a list type or code then converts the block, with
    /// whatever text it has left, in place within a flavour and as a fresh block across
    /// flavours. A divider goes right below the block, followed by an empty paragraph to
    /// type in when the block was the last of its parent.
    pub(crate) fn run_slash_command(
        &mut self,
        block_id: &str,
        command: SlashCommand,
        typed: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let snapshot = self
            .snapshot
            .clone()
            .ok_or_else(|| DocError::InvalidState("missing page".into()))?;
        let (parent, slot) = snapshot
            .root
            .as_ref()
            .and_then(|root| find_parent(root, block_id))
            .ok_or_else(|| DocError::BlockNotFound(block_id.to_string()))?;
        let node = &parent.children[slot];
        let parent_id = parent.id.as_str();

        let trigger = self.editor.slash_trigger.take();
        let strip = if typed {
            let found = trigger
                .filter(|(trigger, _)| trigger == block_id)
                .and_then(|(_, position)| self.typed_slash(block_id, &position));
            // The typed command is gone or was changed under the menu: leave the text alone.
            let Some((slash, caret, _)) = found else {
                return Ok(());
            };
            Some((slash, caret - slash))
        } else {
            None
        };
        // Where the caret ends up in the block's text: where the `/` was, or where it is.
        let offset = strip.map(|(slash, _)| slash).unwrap_or_else(|| {
            self.editor
                .selection
                .as_ref()
                .filter(|selection| selection.focus.block_id == block_id)
                .map_or(0, |selection| selection.focus.offset())
        });

        if command == SlashCommand::NewDoc {
            return self.run_new_doc_slash_command(block_id, offset, strip, window, cx);
        }
        if command == SlashCommand::LinkedDoc {
            return self.run_linked_doc_slash_command(block_id, offset, strip, window, cx);
        }
        let fresh = self.fresh_block_id();
        let trailing = self.fresh_block_id();
        let text_block = |node: &BlockNode| {
            matches!(
                node.flavour.as_str(),
                "affine:paragraph" | "affine:list" | "affine:code"
            )
        };
        let plan = if command == SlashCommand::Divider {
            match parent.children.get(slot + 1) {
                None => SlashPlan::Divider {
                    trailing: true,
                    caret: DocPoint::new(&trailing, 0),
                },
                Some(next) => SlashPlan::Divider {
                    trailing: false,
                    caret: if text_block(next) || next.flavour == "affine:code" {
                        DocPoint::new(&next.id, 0)
                    } else {
                        DocPoint::new(block_id, offset)
                    },
                },
            }
        } else if text_block(node) {
            let same = command.block_spec().flavour() == node.flavour;
            SlashPlan::Convert {
                caret: DocPoint::new(if same { block_id } else { &fresh }, offset),
            }
        } else {
            // A block without text to carry over keeps what it is; the new block goes
            // below it.
            SlashPlan::Insert {
                caret: DocPoint::new(&fresh, 0),
            }
        };
        let numbered = matches!(command, SlashCommand::List(ListType::Numbered));
        let before = self.selection_snapshot();
        let now = self.now_ms(cx) as u64;
        let page = self.page_mut()?;
        let commit = page.structural_edit(now, |page| {
            if let Some((slash, len)) = strip {
                page.remove_text(block_id, "prop:text", slash, len, now)?;
            }
            match &plan {
                SlashPlan::Convert { .. } => {
                    page.convert_block_flavour(block_id, &fresh, command.block_spec(), now)?;
                }
                SlashPlan::Insert { .. } => {
                    page.add_block(
                        &fresh,
                        command.block_spec(),
                        Some(parent_id),
                        Some(slot as u64 + 1),
                        now,
                    )?;
                    if numbered {
                        page.correct_numbered_order_from(parent_id, slot + 1, 1)?;
                    }
                }
                SlashPlan::Divider { trailing: last, .. } => {
                    page.add_block(
                        &fresh,
                        BlockSpec::Divider,
                        Some(parent_id),
                        Some(slot as u64 + 1),
                        now,
                    )?;
                    if *last {
                        page.add_block(
                            &trailing,
                            SlashCommand::Paragraph(ParagraphType::Text).block_spec(),
                            Some(parent_id),
                            Some(slot as u64 + 2),
                            now,
                        )?;
                    }
                }
            }
            Ok(())
        })?;
        if commit.is_some()
            && let Some(before) = before
        {
            page.set_undo_selection_snapshot(before)?;
        }
        let (SlashPlan::Convert { caret }
        | SlashPlan::Insert { caret }
        | SlashPlan::Divider { caret, .. }) = plan;
        self.editor.selection = Some(DocumentSelection::caret(caret));
        self.editor.last_typing = None;
        self.did_edit(commit, None, window, cx);
        Ok(())
    }

    /// Creates a new empty document and inserts a standard BlockSuite `LinkedPage` inline
    /// reference chip at `offset`, deleting only the typed `/query` (`strip`) and keeping
    /// surrounding text intact, in a single undoable step.
    pub(super) fn run_new_doc_slash_command(
        &mut self,
        block_id: &str,
        offset: u64,
        strip: Option<(u64, u64)>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let summary = self
            .doc_directory_mut()
            .create_linked_doc("Untitled", crate::directory::EditorDocMode::Page, None)
            .map_err(|err| DocError::InvalidState(err.to_string()))?;
        let now = self.now_ms(cx) as u64;
        self.ensure_workspace_page_and_broadcast(&summary, now)
            .map_err(|err| DocError::InvalidState(err.to_string()))?;
        let delete_len = strip.map_or(0, |(_, len)| len);
        self.insert_inline_reference_chip(
            block_id,
            offset,
            delete_len,
            summary.id.as_str(),
            window,
            cx,
        )
    }

    /// Replaces any typed `/query` with `@` at `offset` in a single undoable step and opens
    /// the `@` linked-document picker at the caret.
    pub(super) fn run_linked_doc_slash_command(
        &mut self,
        block_id: &str,
        offset: u64,
        strip: Option<(u64, u64)>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let now = self.now_ms(cx) as u64;
        let before = self.selection_snapshot();
        let delete_len = strip.map_or(0, |(_, len)| len);
        let mut delta = Vec::new();
        if offset > 0 {
            delta.push(y_octo::TextDeltaOp::Retain {
                retain: offset,
                format: None,
            });
        }
        if delete_len > 0 {
            delta.push(y_octo::TextDeltaOp::Delete { delete: delete_len });
        }
        delta.push(y_octo::TextDeltaOp::Insert {
            insert: y_octo::TextInsert::Text("@".into()),
            format: None,
        });
        let page = self.page_mut()?;
        page.stop_capturing()?;
        let commit = page.apply_text_delta(block_id, "prop:text", &delta, now)?;
        if commit.is_some()
            && let Some(before) = before
        {
            page.set_undo_selection_snapshot(before)?;
        }
        self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(
            block_id,
            offset + 1,
        )));
        self.editor.last_typing = None;
        self.did_edit(commit, Some(block_id), window, cx);
        self.open_typed_linked_doc_menu(block_id.to_string(), offset, cx);
        Ok(())
    }

    /// Inserts a standard BlockSuite `LinkedPage` inline reference chip (single space with
    /// `reference: { type: "LinkedPage", pageId }`) into `block_id` at UTF-16 `offset`,
    /// optionally deleting `delete_len` UTF-16 code units first, as one undo step.
    pub(crate) fn insert_inline_reference_chip(
        &mut self,
        block_id: &str,
        offset: u64,
        delete_len: u64,
        doc_id: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let now = self.now_ms(cx) as u64;
        let before = self.selection_snapshot();
        let attrs = TextAttributes::from([(
            "reference".to_string(),
            Any::Object(Box::new(
                [
                    ("type".to_string(), Any::String("LinkedPage".to_string())),
                    ("pageId".to_string(), Any::String(doc_id.to_string())),
                ]
                .into_iter()
                .collect(),
            )),
        )]);
        let mut delta = Vec::new();
        if offset > 0 {
            delta.push(y_octo::TextDeltaOp::Retain {
                retain: offset,
                format: None,
            });
        }
        if delete_len > 0 {
            delta.push(y_octo::TextDeltaOp::Delete { delete: delete_len });
        }
        delta.push(y_octo::TextDeltaOp::Insert {
            insert: y_octo::TextInsert::Text(" ".into()),
            format: Some(attrs),
        });
        let page = self.page_mut()?;
        page.stop_capturing()?;
        let commit = page.apply_text_delta(block_id, "prop:text", &delta, now)?;
        if commit.is_some()
            && let Some(before) = before
        {
            page.set_undo_selection_snapshot(before)?;
        }
        self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(
            block_id,
            offset + 1,
        )));
        self.editor.last_typing = None;
        self.did_edit(commit, Some(block_id), window, cx);
        Ok(())
    }
}

/// What a slash command does to the document, and where it leaves the caret.
#[derive(Clone)]
enum SlashPlan {
    /// Convert the block itself.
    Convert { caret: DocPoint },
    /// Add the new block below a block that cannot be converted.
    Insert { caret: DocPoint },
    /// Add a divider below the block, and an empty paragraph after it when `trailing`.
    Divider { trailing: bool, caret: DocPoint },
}
