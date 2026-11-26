//! Mobile `KeyboardToolbar`, long-press ICU word selection, embedded PDF paging,
//! table cell editing, and embedded doc navigation handlers for `PlaygroundView`.

use blocksuite_playground_doc::schema::{ListType, ParagraphType};
use ui::{Context, Window, point, px};
use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

use crate::{
    PlaygroundView,
    block_flow::{parse_pdf_renderer, render_pdf_page},
    editor_session::{DocPoint, DocumentSelection, word_range},
};

use super::*;

impl PlaygroundView {
    /// Handles mobile keyboard toolbar, PDF paging, table cell edit, embed doc open,
    /// and touch long-press word selection events. Returns `true` when consumed.
    pub(super) fn handle_mobile_and_rich_event(
        &mut self,
        event: &OverlayEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        match event {
            OverlayEvent::SetKeyboardToolbarVisible(visible) => {
                self.overlays.set_keyboard_toolbar_visible(*visible);
                cx.notify();
                true
            }
            OverlayEvent::KeyboardToolbar(action) => {
                self.run_keyboard_toolbar_action(*action, window, cx);
                true
            }
            OverlayEvent::AttachmentPdfPage { block_id, delta } => {
                self.step_attachment_pdf_page(block_id, *delta, cx);
                true
            }
            OverlayEvent::OpenEmbedDoc { page_id } => {
                self.last_opened_embed_doc = Some(page_id.clone());
                cx.notify();
                true
            }
            OverlayEvent::FocusTableCell {
                block_id,
                row_id,
                column_id,
                screen_pos,
            } => {
                self.focus_table_cell(
                    block_id.clone(),
                    row_id.clone(),
                    column_id.clone(),
                    *screen_pos,
                    window,
                    cx,
                );
                true
            }
            OverlayEvent::LongPressWord { x, y } => {
                self.long_press_word(*x, *y, window, cx);
                true
            }
            _ => false,
        }
    }

    fn run_keyboard_toolbar_action(
        &mut self,
        action: KeyboardToolbarAction,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if action.requires_body_selection() && self.editor.selection.is_none() {
            return;
        }
        let block_id = self
            .editor
            .selection
            .as_ref()
            .map(|sel| sel.focus.block_id.clone());
        match action {
            KeyboardToolbarAction::Undo => {
                let _ = self.history(false, window, cx);
            }
            KeyboardToolbarAction::Redo => {
                let _ = self.history(true, window, cx);
            }
            KeyboardToolbarAction::Bold => {
                let _ = self.format_mark("bold", window, cx);
            }
            KeyboardToolbarAction::Italic => {
                let _ = self.format_mark("italic", window, cx);
            }
            KeyboardToolbarAction::Underline => {
                let _ = self.format_mark("underline", window, cx);
            }
            KeyboardToolbarAction::InlineCode => {
                let _ = self.format_mark("code", window, cx);
            }
            KeyboardToolbarAction::InlineMath => {
                if let Some(sel) = self.editor.selection.clone() {
                    let offset = sel.focus.offset();
                    let now = self.now_ms(cx) as u64;
                    let before = self.selection_snapshot();
                    if let Ok(page) = self.page_mut() {
                        let _ = page.stop_capturing();
                        let mut delta = Vec::new();
                        if offset > 0 {
                            delta.push(TextDeltaOp::Retain {
                                retain: offset,
                                format: None,
                            });
                        }
                        delta.push(TextDeltaOp::Insert {
                            insert: TextInsert::Text(" ".into()),
                            format: Some(TextAttributes::from([(
                                "latex".to_string(),
                                Any::String(String::new()),
                            )])),
                        });
                        if let Ok(commit) =
                            page.apply_text_delta(&sel.focus.block_id, "prop:text", &delta, now)
                        {
                            if commit.is_some()
                                && let Some(before) = before
                            {
                                let _ = page.set_undo_selection_snapshot(before);
                            }
                            self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(
                                &sel.focus.block_id,
                                offset + 1,
                            )));
                            self.did_edit(commit, Some(&sel.focus.block_id), window, cx);
                            self.dispatch_overlay(
                                OverlayEvent::OpenEquationEditor {
                                    target: EquationTarget::Inline {
                                        block_id: sel.focus.block_id,
                                        utf16_offset: offset,
                                    },
                                    initial: String::new(),
                                },
                                window,
                                cx,
                            );
                        }
                    }
                }
            }
            KeyboardToolbarAction::H1
            | KeyboardToolbarAction::H2
            | KeyboardToolbarAction::H3
            | KeyboardToolbarAction::Todo
            | KeyboardToolbarAction::Bullet
            | KeyboardToolbarAction::Numbered
            | KeyboardToolbarAction::Quote
            | KeyboardToolbarAction::CodeBlock => {
                let Some(id) = block_id else {
                    return;
                };
                let cmd = match action {
                    KeyboardToolbarAction::H1 => SlashCommand::Paragraph(ParagraphType::H1),
                    KeyboardToolbarAction::H2 => SlashCommand::Paragraph(ParagraphType::H2),
                    KeyboardToolbarAction::H3 => SlashCommand::Paragraph(ParagraphType::H3),
                    KeyboardToolbarAction::Todo => SlashCommand::List(ListType::Todo),
                    KeyboardToolbarAction::Bullet => SlashCommand::List(ListType::Bulleted),
                    KeyboardToolbarAction::Numbered => SlashCommand::List(ListType::Numbered),
                    KeyboardToolbarAction::Quote => SlashCommand::Paragraph(ParagraphType::Quote),
                    _ => SlashCommand::Code,
                };
                let _ = self.run_slash_command(&id, cmd, false, window, cx);
            }
            KeyboardToolbarAction::Indent => {
                let _ = self.edit_key("tab", false, window, cx);
            }
            KeyboardToolbarAction::Outdent => {
                let _ = self.edit_key("tab", true, window, cx);
            }
            KeyboardToolbarAction::Mention => {
                if let Some(sel) = self.editor.selection.clone() {
                    self.dispatch_overlay(
                        OverlayEvent::OpenLinkedDocMenu {
                            block_id: sel.focus.block_id,
                            query: String::new(),
                        },
                        window,
                        cx,
                    );
                }
            }
            KeyboardToolbarAction::Dismiss => {
                self.keyboard_toolbar_dismissed = true;
                self.overlays.set_keyboard_toolbar_visible(false);
                cx.notify();
            }
        }
    }

    fn step_attachment_pdf_page(&mut self, block_id: &str, delta: i32, cx: &mut Context<Self>) {
        let Some(source_id) = self.snapshot.as_ref().and_then(|snap| {
            snap.block(block_id).and_then(|node| match &node.content {
                blocksuite_playground_doc::read::BlockContent::Attachment { source_id, .. } => {
                    Some(source_id.clone())
                }
                _ => None,
            })
        }) else {
            return;
        };
        let Some(bytes) = self.state.blobs.get(&source_id) else {
            return;
        };
        let Some(renderer) = parse_pdf_renderer(bytes) else {
            return;
        };
        let total = renderer.page_count();
        if total == 0 {
            return;
        }
        let current = self.pdf_page_indices.get(block_id).copied().unwrap_or(0) as i64;
        let next = (current + i64::from(delta)).clamp(0, (total - 1) as i64) as usize;
        if let Some(preview) = render_pdf_page(&renderer, next, 1.5) {
            self.pdf_page_indices
                .insert(block_id.to_string(), preview.page_index);
            self.pdf_preview_keys
                .insert(block_id.to_string(), (source_id, preview.page_index));
            self.pdf_previews.insert(block_id.to_string(), preview);
            self.env_rev += 1;
            cx.notify();
        }
    }

    /// Collect all embedded PDF attachment `(block_id, source_id)` pairs in the active snapshot.
    pub(crate) fn active_pdf_attachments(&self) -> Vec<(String, String)> {
        let mut out = Vec::new();
        for node in self
            .snapshot
            .iter()
            .flat_map(|snapshot| snapshot.root.iter())
            .flat_map(|root| root.walk())
        {
            if let blocksuite_playground_doc::read::BlockContent::Attachment {
                name,
                mime_type,
                source_id,
                embed: true,
                ..
            } = &node.content
                && !source_id.is_empty()
                && (mime_type.eq_ignore_ascii_case("application/pdf")
                    || name.to_ascii_lowercase().ends_with(".pdf"))
            {
                out.push((node.id.clone(), source_id.clone()));
            }
        }
        out
    }

    /// Refresh cached PDF attachment previews, immediately invalidating stale textures when
    /// a block is removed or its `sourceId` changes.
    pub(crate) fn refresh_pdf_previews(&mut self, pdf_attachments: &[(String, String)]) {
        let active_pdf_map: std::collections::HashMap<&str, &str> = pdf_attachments
            .iter()
            .map(|(block_id, source_id)| (block_id.as_str(), source_id.as_str()))
            .collect();
        let stale_pdf_blocks: Vec<String> = self
            .pdf_preview_keys
            .iter()
            .filter_map(|(block_id, (cached_source, _))| {
                match active_pdf_map.get(block_id.as_str()) {
                    Some(&current_source) if current_source == cached_source.as_str() => None,
                    _ => Some(block_id.clone()),
                }
            })
            .collect();
        for block_id in stale_pdf_blocks {
            self.pdf_previews.remove(&block_id);
            self.pdf_preview_keys.remove(&block_id);
            self.pdf_page_indices.remove(&block_id);
            self.env_rev += 1;
        }
        self.pdf_previews
            .retain(|block_id, _| active_pdf_map.contains_key(block_id.as_str()));
        self.pdf_page_indices
            .retain(|block_id, _| active_pdf_map.contains_key(block_id.as_str()));
        if crate::block_flow::can_render_pdf_pages() {
            for (block_id, source_id) in pdf_attachments {
                let page_idx = self.pdf_page_indices.get(block_id).copied().unwrap_or(0);
                let cache_key = (source_id.clone(), page_idx);
                let needs_render = !self.pdf_previews.contains_key(block_id)
                    || self.pdf_preview_keys.get(block_id) != Some(&cache_key);
                if needs_render && let Some(bytes) = self.state.blobs.get(source_id) {
                    let fail_key = (source_id.clone(), bytes.len());
                    if self.failed_pdf_blobs.contains(&fail_key) {
                        continue;
                    }
                    match parse_pdf_renderer(bytes) {
                        Some(renderer) => {
                            if let Some(preview) = render_pdf_page(&renderer, page_idx, 1.5) {
                                let actual_idx = preview.page_index;
                                self.pdf_page_indices.insert(block_id.clone(), actual_idx);
                                self.pdf_preview_keys
                                    .insert(block_id.clone(), (source_id.clone(), actual_idx));
                                self.pdf_previews.insert(block_id.clone(), preview);
                                self.env_rev += 1;
                            }
                        }
                        None => {
                            self.failed_pdf_blobs.insert(fail_key);
                        }
                    }
                }
            }
        }
    }

    /// Notify the view when the host software keyboard is explicitly shown or hidden.
    pub fn set_software_keyboard_visible(&mut self, visible: bool, cx: &mut Context<Self>) {
        if !visible {
            self.keyboard_toolbar_dismissed = true;
            self.last_keyboard_inset = 0.0;
            self.overlays.set_keyboard_toolbar_visible(false);
        } else {
            self.keyboard_toolbar_dismissed = false;
        }
        cx.notify();
    }

    /// Touch long-press at window coordinates `(x, y)`: selects the ICU word at that point.
    pub fn long_press_word(&mut self, x: f32, y: f32, window: &mut Window, cx: &mut Context<Self>) {
        let Some(p) = self.input_point(point(px(x), px(y)), window) else {
            return;
        };
        let text = self.block_text(&p.block_id).unwrap_or("");
        let range = word_range(text, p.offset());
        self.editor.dragging = false;
        self.editor_focus.focus(window, cx);
        self.change_selection(
            DocumentSelection {
                anchor: DocPoint::new(&p.block_id, range.start),
                focus: DocPoint::new(&p.block_id, range.end),
            },
            window,
            cx,
        );
    }
}
