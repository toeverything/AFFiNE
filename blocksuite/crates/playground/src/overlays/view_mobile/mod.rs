//! Mobile `KeyboardToolbar`, touch word selection, PDF paging, table cell & link navigation.

mod actions;
mod database;
mod record_sheet;
pub use record_sheet::DatabaseRecordSheetState;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_batch3;
#[cfg(test)]
mod tests_batch3_extra;
#[cfg(test)]
mod tests_batch3_unified;
#[cfg(test)]
mod tests_database;
#[cfg(test)]
mod tests_database_interactions;
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
mod tests_record_sheet_touch;
#[cfg(test)]
mod tests_retest_fixes;
#[cfg(test)]
mod tests_sync;
#[cfg(test)]
mod tests_touch_gestures;
#[cfg(test)]
mod tests_touch_ux;

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
                self.open_linked_doc(page_id, Some(window), cx);
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
        if self.mode == crate::PlaygroundMode::Page && self.page_readonly {
            return;
        }
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
                window.notify_text_selection_changed(&self.editor_focus);
                cx.notify();
            }
        }
        self.sync_keyboard_toolbar_state();
    }

    /// Whether the native mobile host should present the system software keyboard.
    pub fn wants_software_keyboard(&self) -> bool {
        if self.keyboard_toolbar_dismissed {
            return false;
        }
        match self.mode {
            crate::PlaygroundMode::Page => {
                !self.page_readonly
                    && (self.editor.selection.is_some()
                        || (!self.editor.block_selection.is_empty()
                            && self.keep_keyboard_on_block_selection)
                        || self.table_cell.is_some()
                        || self.overlays.active_text_field().is_some())
            }
            crate::PlaygroundMode::Edgeless => {
                !self.edgeless_readonly
                    && (self.edgeless.authoring.editing_spatial_block().is_some()
                        || self.overlays.active_text_field().is_some())
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
            self.ime_insets.last_keyboard = 0.0;
            self.overlays.set_keyboard_toolbar_visible(false);
        } else {
            self.keyboard_toolbar_dismissed = false;
        }
        cx.notify();
    }

    /// Touch long-press at window coordinates `(x, y)`: selects the ICU word at that point,
    /// or selects the word inside a tapped table cell / selects a non-editable block (`L3`).
    pub fn long_press_word(&mut self, x: f32, y: f32, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(layout) = self.flow_layout() {
            let geom = crate::block_flow::page_geometry(f32::from(window.viewport_size().width));
            let wx = x - geom.column_x;
            let wy = y - crate::TOPBAR_HEIGHT + self.scroll_y;
            if let Some(block) = layout
                .blocks
                .iter()
                .find(|b| !b.editable() && b.rect().contains(wx, wy))
            {
                if block.body.kind == crate::block_flow::FlowKind::Table {
                    let scroll_x = self.overlays.code_scroll_x(&block.block_id);
                    let lx = wx - block.x + scroll_x;
                    let ly = wy - block.y;
                    if let Some(hit) = block
                        .body
                        .table_cells
                        .iter()
                        .find(|c| c.rect.contains(lx, ly))
                    {
                        let (bid, rid, cid) = (
                            block.block_id.clone(),
                            hit.row_id.clone(),
                            hit.column_id.clone(),
                        );
                        self.focus_table_cell(bid, rid, cid, Some((x, y)), window, cx);
                        if let Some(cell) = self.table_cell.as_mut() {
                            let off = cell.input.focus() as u64;
                            let r = word_range(&cell.input.text, off);
                            cell.input.select(r.start as usize..r.end as usize);
                        }
                        self.table_cell_update_anchors();
                        cx.notify();
                        return;
                    }
                }
                self.finish_inline_targets(InlineTargetEnd::CommitPreedit, Some(window), Some(cx));
                self.commit_active_preedit(window, cx);
                self.editor.selection = None;
                self.editor.block_selection = vec![block.block_id.clone()];
                self.keep_keyboard_on_block_selection = false;
                self.block_selection_return_caret = None;
                self.editor.dragging = false;
                self.editor_focus.focus(window, cx);
                self.announce_selection(cx);
                window.notify_text_selection_changed(&self.editor_focus);
                cx.notify();
                return;
            }
        }
        let Some(p) = self.input_point(point(px(x), px(y)), window) else {
            return;
        };
        self.finish_inline_targets(InlineTargetEnd::CommitPreedit, Some(window), Some(cx));
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

    /// Focus the editor and place a collapsed caret at offset 0 of the first editable
    /// paragraph or list block (falling back to the page root title block).
    pub fn focus_first_text_block(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.refresh_document();
        let target_id = self.snapshot.as_ref().and_then(|snap| {
            fn find_first_text(
                nodes: &[blocksuite_playground_doc::read::BlockNode],
            ) -> Option<String> {
                for node in nodes {
                    match &node.content {
                        blocksuite_playground_doc::read::BlockContent::Paragraph { .. }
                        | blocksuite_playground_doc::read::BlockContent::List { .. } => {
                            return Some(node.id.clone());
                        }
                        _ => {}
                    }
                    if let Some(found) = find_first_text(&node.children) {
                        return Some(found);
                    }
                }
                None
            }
            snap.root.as_ref().and_then(|root| {
                root.children
                    .iter()
                    .filter(|c| c.is_page_visible_note())
                    .find_map(|note| find_first_text(&note.children))
                    .or_else(|| Some(root.id.clone()))
            })
        });
        self.editor_focus.focus(window, cx);
        if let Some(block_id) = target_id {
            let caret = DocPoint::new(&block_id, 0);
            self.change_selection(
                DocumentSelection {
                    anchor: caret.clone(),
                    focus: caret,
                },
                window,
                cx,
            );
        }
    }

    pub(crate) fn copy_toolbar_selection_or_block(&mut self, cx: &mut Context<Self>) {
        if let Some(slice) = self.clipboard_slice() {
            crate::clipboard::write_slice(&slice, cx);
            return;
        }
        if let Some(id) = self.editor.selection.as_ref().map(|s| &s.focus.block_id)
            && let Some(text) = self.block_text(id)
        {
            cx.write_to_clipboard(ui::ClipboardItem::new_string(text.to_string()));
        }
    }

    pub(crate) fn insert_toolbar_plain_text(
        &mut self,
        text: &str,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> blocksuite_playground_doc::DocResult {
        if self.mode == crate::PlaygroundMode::Page && self.page_readonly {
            return Ok(());
        }
        let Some(sel) = self.editor.selection.clone() else {
            return Ok(());
        };
        self.page_mut()?.stop_capturing()?;
        self.editor.last_typing = None;
        self.replace_selection(sel, text, w, cx)?;
        self.page_mut()?.stop_capturing()?;
        Ok(())
    }

    /// Update the host form factor and apply Stage-1 capability defaults.
    pub fn set_form_factor(
        &mut self,
        form_factor: crate::FormFactor,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let caps = crate::EditorCapabilities::for_form_factor(form_factor);
        let changed =
            self.form_factor != caps.form_factor || self.pointer_kind != caps.pointer_kind;
        self.form_factor = caps.form_factor;
        self.pointer_kind = caps.pointer_kind;
        self.page_readonly = self.page_readonly || caps.page_readonly;
        self.set_edgeless_readonly(caps.edgeless_readonly, window, cx);
        self.set_database_mobile_readonly(caps.database_readonly, cx);
        if changed {
            cx.notify();
        }
    }

    /// Whether Database-block mutations are gated read-only.
    pub fn database_readonly(&self) -> bool {
        self.database_readonly
    }

    /// Replace the active document with a fresh single-paragraph empty page and focus it.
    pub fn load_empty_page_document(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        use blocksuite_playground_doc::schema::{BlockSpec, ParagraphType};

        let Ok(mut state) = crate::room_client::DocState::new("local", 1) else {
            return;
        };
        let _ = state.workspace.initialize_meta();
        let _ = state
            .workspace
            .create_page(crate::HOME_PAGE_ID, "Untitled", 1_700_000_000_000);
        if let Ok(page) = state.workspace.ensure_page(crate::HOME_PAGE_ID) {
            let _ = page.add_block(
                "local-page",
                BlockSpec::Page {
                    title: "Untitled".to_string(),
                },
                None,
                None,
                1_000,
            );
            let _ = page.add_block(
                "local-note",
                BlockSpec::Note {
                    xywh: Some("[0,0,760,1180]".to_string()),
                },
                Some("local-page"),
                None,
                1_000,
            );
            let _ = page.add_block(
                "local-p1",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: String::new(),
                },
                Some("local-note"),
                None,
                1_000,
            );
        }
        self.set_document(state, cx);
        self.focus_first_text_block(window, cx);
    }

    /// Reload the built-in showcase document and focus its first text block.
    pub fn load_showcase_document(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Ok(state) = crate::seed_showcase_doc() {
            self.set_document(state, cx);
            self.focus_first_text_block(window, cx);
        }
    }

    /// Handle a platform Back button / predictive-back commit by closing the topmost
    /// sheet, modal, or transient overlay first. Returns `true` when consumed.
    pub fn handle_back(&mut self, window: &mut Window, cx: &mut Context<Self>) -> bool {
        if self.close_database_record_sheet(cx) {
            return true;
        }
        let now_ms = self.now_ms(cx);
        if self.overlays.bookmark_prompt().is_some() {
            self.overlays.close_bookmark_prompt_at(now_ms);
            window.notify_text_input_changed(&self.editor_focus);
            cx.notify();
            return true;
        }
        if self.overlays.equation_editor().is_some() {
            self.overlays.close_equation_editor_at(now_ms);
            self.equation_snapshot = None;
            window.notify_text_input_changed(&self.editor_focus);
            cx.notify();
            return true;
        }
        if self.overlays.link_field().is_some() {
            self.overlays.close_link_field();
            window.notify_text_input_changed(&self.editor_focus);
            cx.notify();
            return true;
        }
        if self.overlays.keyboard_toolbar_active_panel().is_some() {
            self.overlays.close_keyboard_toolbar_panel();
            cx.notify();
            return true;
        }
        let mut closed = false;
        if self.overlays.slash_menu().is_some() {
            closed |= self.overlays.close_slash(now_ms);
        }
        if self.overlays.close_linked_doc(now_ms) {
            closed = true;
        }
        if self.overlays.context_menu().is_some() {
            closed |= self.overlays.close_context_menu(now_ms);
        }
        if self.touch_selection_menu_open {
            self.touch_selection_menu_open = false;
            closed = true;
        }
        if closed {
            cx.notify();
            return true;
        }
        self.navigate_back(Some(window), cx)
    }

    /// Navigate to a linked document in the current workspace (or show a toast if absent).
    pub fn open_linked_doc(
        &mut self,
        page_id: &str,
        window: Option<&mut Window>,
        cx: &mut Context<Self>,
    ) -> bool {
        self.last_opened_embed_doc = Some(page_id.to_string());
        if self.page_id.as_deref() == Some(page_id) {
            cx.notify();
            return true;
        }
        if self.state.workspace.page(page_id).is_some() {
            if let Some(prev) = self.page_id.clone() {
                self.nav_history.push(prev);
            }
            self.switch_active_page(page_id, window, cx);
            true
        } else {
            let generation = self
                .overlays
                .show_context_toast("Linked document not found in this workspace.");
            self.context_toast_timer = Some(cx.spawn(async move |this, cx| {
                cx.background_executor()
                    .timer(std::time::Duration::from_millis(CONTEXT_TOAST_MS))
                    .await;
                let _ = this.update(cx, |this, cx| {
                    if this.overlays.context_toast_expired(generation) {
                        cx.notify();
                    }
                });
            }));
            cx.notify();
            false
        }
    }

    /// Return to the previously visited workspace page if one exists on the navigation stack.
    pub fn navigate_back(&mut self, window: Option<&mut Window>, cx: &mut Context<Self>) -> bool {
        while let Some(prev) = self.nav_history.pop() {
            if self.state.workspace.page(&prev).is_some() {
                self.switch_active_page(&prev, window, cx);
                return true;
            }
        }
        false
    }

    pub(crate) fn switch_active_page(
        &mut self,
        page_id: &str,
        mut window: Option<&mut Window>,
        cx: &mut Context<Self>,
    ) {
        self.editor.preedit = None;
        self.finish_inline_targets(
            InlineTargetEnd::DiscardPreedit,
            window.as_deref_mut(),
            Some(cx),
        );
        self.editor = Default::default();
        self.saved_page_selection = None;
        self.overlays.reset();
        self.reading_anchor = None;
        self.flow = crate::block_flow::BlockFlow::new();
        self.flow.database_state.mobile_readonly = self.database_readonly;
        self.flow.database_state.clock_ms = self.local_calendar_now(cx).0;
        self.layout = None;
        self.edgeless = crate::edgeless::EdgelessCanvasState::new();
        self.active_touch_owner = crate::TouchStrokeOwner::None;
        self.touch_long_press_anchor = None;
        self.touch_scroll_axis_lock = None;
        self.scrollbar_drag = None;
        self.edgeless_readonly_selection_target = None;
        self.page_scroll_fling = None;
        self.code_scroll_fling = None;
        self.edgeless_pan_fling = None;
        self.touch_selection_menu_open = false;
        self.database_record_sheet = None;
        self.scroll_y = 0.0;
        self.page_id = Some(page_id.to_string());
        self.refresh_document();
        if let Some(cb) = self.on_active_doc_changed.as_mut() {
            cb(page_id);
        }
        if let Some(w) = window {
            w.notify_text_input_changed(&self.editor_focus);
            w.notify_text_selection_changed(&self.editor_focus);
        }
        cx.notify();
    }
}
