//! Mobile `KeyboardToolbar`, long-press ICU word selection, embedded PDF paging,
//! table cell editing, and embedded doc navigation handlers for `PlaygroundView`.

mod actions;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_edgeless_geometry;
#[cfg(test)]
mod tests_edgeless_layers;
#[cfg(test)]
mod tests_edgeless_parity;
#[cfg(test)]
mod tests_mindmap_and_embed;
#[cfg(test)]
mod tests_parity;
#[cfg(test)]
mod tests_sync;

use ui::{Context, Window, point, px};

use crate::{
    PlaygroundView,
    block_flow::{PdfParseResult, parse_pdf_document, render_pdf_page},
    editor_session::{DocPoint, DocumentSelection, word_range},
};

use super::*;

impl PlaygroundView {
    /// Sync per-frame undo/redo/indent/dedent and `autoShow` selection capabilities
    /// into `Overlays` for `KeyboardToolbar`.
    pub(crate) fn sync_keyboard_toolbar_state(&mut self) {
        let caps = KeyboardToolbarCapabilities {
            can_undo: self.page().is_some_and(|p| p.can_undo()),
            can_redo: self.page().is_some_and(|p| p.can_redo()),
            can_indent: self.can_indent_current_block(),
            can_dedent: self.can_dedent_current_block(),
            can_pick_images: cfg!(target_family = "wasm") || self.image_picker.is_some(),
            has_body_selection: self.editor.selection.is_some(),
            has_non_collapsed_selection: self.editor.selection.as_ref().is_some_and(|s| !s.empty()),
        };
        self.overlays.set_keyboard_toolbar_capabilities(caps);
    }

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
                if *visible {
                    self.sync_keyboard_toolbar_state();
                }
                cx.notify();
                true
            }
            OverlayEvent::KeyboardToolbar(action) => {
                self.run_keyboard_toolbar_action(*action, window, cx);
                true
            }
            OverlayEvent::InsertImageBytes { bytes, caption } => {
                let _ = self.insert_picked_image_bytes(bytes, caption, window, cx);
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
            KeyboardToolbarAction::ToggleMorePanel => {
                self.overlays
                    .toggle_keyboard_toolbar_panel(KeyboardToolbarPanel::More);
                cx.notify();
            }
            KeyboardToolbarAction::OpenTextSubToolbar => {
                self.overlays.open_keyboard_text_subtoolbar();
                cx.notify();
            }
            KeyboardToolbarAction::BackToMainToolbar => {
                self.overlays.close_keyboard_text_subtoolbar();
                cx.notify();
            }
            KeyboardToolbarAction::ToggleTurnIntoPanel => {
                self.overlays
                    .toggle_keyboard_toolbar_panel(KeyboardToolbarPanel::TurnInto);
                cx.notify();
            }
            KeyboardToolbarAction::ToggleHighlightPanel => {
                self.overlays
                    .toggle_keyboard_toolbar_panel(KeyboardToolbarPanel::Highlight);
                cx.notify();
            }
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
            KeyboardToolbarAction::Strike => {
                let _ = self.format_mark("strike", window, cx);
            }
            KeyboardToolbarAction::InlineCode => {
                let _ = self.format_mark("code", window, cx);
            }
            KeyboardToolbarAction::Link => {
                self.overlays.close_keyboard_toolbar_panel();
                self.open_link_bar_from_toolbar(window, cx);
            }
            KeyboardToolbarAction::InlineMath => {
                self.overlays.close_keyboard_toolbar_panel();
                self.insert_inline_math_from_toolbar(window, cx);
            }
            KeyboardToolbarAction::SetTextColor(color) => {
                let _ = self.format_color_mark("color", color.fg_css_var(), window, cx);
                self.overlays.close_keyboard_toolbar_panel();
                cx.notify();
            }
            KeyboardToolbarAction::SetBgColor(color) => {
                let _ = self.format_color_mark("background", color.bg_css_var(), window, cx);
                self.overlays.close_keyboard_toolbar_panel();
                cx.notify();
            }
            KeyboardToolbarAction::Slash(cmd) => {
                let Some(id) = block_id else {
                    return;
                };
                self.overlays.close_keyboard_toolbar_panel();
                let _ = self.run_slash_command(&id, cmd, false, window, cx);
            }
            KeyboardToolbarAction::EquationBlock => {
                self.overlays.close_keyboard_toolbar_panel();
                let _ = self.insert_equation_block_from_toolbar(window, cx);
            }
            KeyboardToolbarAction::Table => {
                self.overlays.close_keyboard_toolbar_panel();
                let _ = self.insert_table_block_from_toolbar(window, cx);
            }
            KeyboardToolbarAction::Callout => {
                self.overlays.close_keyboard_toolbar_panel();
                let _ = self.insert_callout_block_from_toolbar(window, cx);
            }
            KeyboardToolbarAction::Image => {
                self.overlays.close_keyboard_toolbar_panel();
                self.trigger_image_picker_from_toolbar(cx);
            }
            KeyboardToolbarAction::Bookmark => {
                let Some(id) = block_id else {
                    return;
                };
                self.overlays.close_keyboard_toolbar_panel();
                self.dispatch_overlay(
                    OverlayEvent::OpenBookmarkPrompt { block_id: id },
                    window,
                    cx,
                );
            }
            KeyboardToolbarAction::Date(kind) => {
                let (utc_ms, tz_offset_min) = self.local_calendar_now(cx);
                let formatted =
                    actions::format_keyboard_toolbar_local_date(utc_ms, tz_offset_min, kind);
                self.overlays.close_keyboard_toolbar_panel();
                let _ = self.insert_toolbar_plain_text(&formatted, window, cx);
            }
            KeyboardToolbarAction::Indent => {
                let _ = self.edit_key("tab", false, window, cx);
            }
            KeyboardToolbarAction::Outdent => {
                let _ = self.edit_key("tab", true, window, cx);
            }
            KeyboardToolbarAction::Copy => {
                self.copy_toolbar_selection_or_block(cx);
            }
            KeyboardToolbarAction::Duplicate => {
                let _ = self.duplicate_current_block(window, cx);
            }
            KeyboardToolbarAction::Delete => {
                let _ = self.delete_current_block(window, cx);
            }
            KeyboardToolbarAction::Attachment
            | KeyboardToolbarAction::EmbedIframe
            | KeyboardToolbarAction::EmbedYoutube
            | KeyboardToolbarAction::EmbedGithub
            | KeyboardToolbarAction::EmbedFigma
            | KeyboardToolbarAction::EmbedLoom
            | KeyboardToolbarAction::DatabaseTableView
            | KeyboardToolbarAction::DatabaseKanbanView => {}
            KeyboardToolbarAction::Dismiss => {
                self.keyboard_toolbar_dismissed = true;
                self.overlays.set_keyboard_toolbar_visible(false);
                cx.notify();
            }
        }
        self.sync_keyboard_toolbar_state();
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
        let PdfParseResult::Ready(renderer) = parse_pdf_document(&source_id, bytes) else {
            return;
        };
        let total = renderer.page_count();
        if total == 0 {
            return;
        }
        let current = self.pdf_page_indices.get(block_id).copied().unwrap_or(0) as i64;
        let next = (current + i64::from(delta)).clamp(0, (total - 1) as i64) as usize;
        // Persist target `next` before kicking off `render_pdf_page` so async Web Worker
        // completion in `refresh_pdf_previews` lands on `next` instead of reverting to `0`.
        self.pdf_page_indices.insert(block_id.to_string(), next);
        if let Some(preview) = render_pdf_page(&renderer, next, 1.5) {
            self.pdf_page_indices
                .insert(block_id.to_string(), preview.page_index);
            self.pdf_preview_keys
                .insert(block_id.to_string(), (source_id, preview.page_index));
            self.pdf_previews.insert(block_id.to_string(), preview);
            crate::block_flow::bump_preview_revision();
        }
        cx.notify();
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
            crate::block_flow::bump_preview_revision();
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
                    match parse_pdf_document(source_id, bytes) {
                        PdfParseResult::Ready(renderer) => {
                            if let Some(preview) = render_pdf_page(&renderer, page_idx, 1.5) {
                                let actual_idx = preview.page_index;
                                self.pdf_page_indices.insert(block_id.clone(), actual_idx);
                                self.pdf_preview_keys
                                    .insert(block_id.clone(), (source_id.clone(), actual_idx));
                                self.pdf_previews.insert(block_id.clone(), preview);
                                crate::block_flow::bump_preview_revision();
                            }
                        }
                        PdfParseResult::Pending => {}
                        PdfParseResult::Invalid => {
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
