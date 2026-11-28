//! PlaygroundView glue for the desktop editor right-click context menu.

use std::{ops::Range, time::Duration};

use blocksuite_editor::clipboard::sanitize::sanitize_url;
use blocksuite_playground_doc::read::BlockContent;
use ui::{ClipboardItem, ClipboardReadError, Context, MouseDownEvent, Task, Window, point, px};

use crate::{
    PlaygroundMode, PlaygroundView,
    block_flow::{FlowBlock, FlowKind, FlowLayout, FlowRect, FlowTextLayout, page_geometry},
    edgeless::LabelTarget,
    editor_session::{DocPoint, DocumentSelection},
    rich_text::DecorationKind,
};

use super::{CONTEXT_TOAST_MS, ContextMenuAction, InlineTargetEnd, OverlayEvent};

/// Bound edit target captured when opening the context menu or starting an async clipboard read,
/// shared by both target validation and synchronous/asynchronous action execution.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ContextTargetSnapshot {
    doc_epoch: u64,
    page_id: Option<String>,
    mode: PlaygroundMode,
    pub(crate) kind: ContextTargetKind,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ContextTargetKind {
    TableCell {
        block_id: String,
        row_id: String,
        column_id: String,
        text: String,
        selection: Range<usize>,
    },
    EdgelessLabel {
        target: LabelTarget,
        text: String,
        selection: Range<usize>,
    },
    BlockSelection {
        block_ids: Vec<String>,
    },
    BodySelection {
        edgeless_spatial: Option<(String, bool)>,
        anchor_block_id: String,
        focus_block_id: String,
        relative: Option<blocksuite_playground_doc::session::SelectionSnapshot>,
    },
    NonEditableSurface,
}

struct ResolvedContextMenu {
    target: Option<ContextTargetSnapshot>,
    can_copy: bool,
    can_cut: bool,
    can_paste: bool,
    link_url: Option<String>,
}

/// Validate a CRDT link/bookmark URL against the strict external allowlist
/// (`http://`, `https://`, `mailto:`, `tel:`, `affine:`), rejecting in-page `#anchor`
/// and unsafe schemes (`javascript:`, `data:`, `vbscript:`, `file:`).
fn sanitize_external_link_url(raw: &str) -> Option<String> {
    let clean = sanitize_url(raw)?;
    if clean.starts_with('#') {
        return None;
    }
    Some(clean)
}

impl PlaygroundView {
    /// Most recent URL opened via the desktop context menu's `Open Link` action.
    pub fn last_opened_link_url(&self) -> Option<&str> {
        self.last_opened_link_url.as_deref()
    }

    /// Handle right mouse-down on the Page viewport to open the desktop overlay context menu.
    pub(crate) fn page_right_mouse_down(
        &mut self,
        event: &MouseDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        cx.stop_propagation();
        let x = f32::from(event.position.x);
        let y = f32::from(event.position.y);
        self.open_context_menu_at(x, y, window, cx);
    }

    /// Handle right mouse-down on the Edgeless canvas when inline text editing is active.
    pub(crate) fn edgeless_right_mouse_down(
        &mut self,
        event: &MouseDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.edgeless.authoring.inline_edit.is_none() {
            return;
        }
        cx.stop_propagation();
        let x = f32::from(event.position.x);
        let y = f32::from(event.position.y);
        self.open_context_menu_at(x, y, window, cx);
    }

    pub(crate) fn open_context_menu_at(
        &mut self,
        x: f32,
        y: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.form_factor.is_touch_form_factor() || self.edgeless_readonly {
            return;
        }
        let now_ms = self.now_ms(cx);
        self.overlays.close_slash(now_ms);
        self.overlays.close_linked_doc(now_ms);
        let resolved = self.resolve_context_menu_at(x, y, window, cx);
        self.context_menu_target = resolved.target;
        self.overlays.open_context_menu(
            (x, y),
            resolved.can_copy,
            resolved.can_cut,
            resolved.can_paste,
            resolved.link_url,
            now_ms,
        );
        cx.notify();
    }

    /// Single-point resolution for right-click `(x, y)`: transitions editor focus cleanly
    /// (clearing stale inline/overlay editors and in-flight body composition) and derives
    /// the exact target snapshot, enabled actions, and link URL from `(x, y)` alone.
    fn resolve_context_menu_at(
        &mut self,
        x: f32,
        y: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> ResolvedContextMenu {
        let non_editable = |this: &Self, link_url: Option<String>| ResolvedContextMenu {
            target: Some(ContextTargetSnapshot {
                doc_epoch: this.doc_epoch,
                page_id: this.page_id.clone(),
                mode: this.mode,
                kind: ContextTargetKind::NonEditableSurface,
            }),
            can_copy: false,
            can_cut: false,
            can_paste: false,
            link_url,
        };

        match self.mode {
            PlaygroundMode::Page => {
                let (origin, sz) = self.canvas_rect(window);
                let geom = page_geometry(f32::from(sz.width));
                let wx = x - f32::from(origin.x) - geom.column_x;
                let wy = y - f32::from(origin.y) + self.scroll_y;
                let link_url = self.hit_link_url_at(x, y, window);
                if let Some(layout) = self.flow_layout()
                    && let Some((block_id, row_id, col_id, keep_cell_sel)) =
                        self.hit_table_cell_for_context_menu(&layout, wx, wy)
                {
                    self.dismiss_overlay_text_fields(window, cx);
                    self.clear_body_selection(window, cx);
                    if !keep_cell_sel {
                        self.focus_table_cell(block_id, row_id, col_id, Some((x, y)), window, cx);
                    }
                    let has_sel = self
                        .table_cell
                        .as_ref()
                        .is_some_and(|c| !c.input.selection.is_empty());
                    return ResolvedContextMenu {
                        target: self.capture_context_target(),
                        can_copy: has_sel,
                        can_cut: has_sel,
                        can_paste: true,
                        link_url,
                    };
                }

                self.dismiss_overlay_text_fields(window, cx);
                self.finish_inline_targets(InlineTargetEnd::CommitPreedit, Some(window), Some(cx));
                let Some(layout) = self.flow_layout() else {
                    self.clear_body_selection(window, cx);
                    return non_editable(self, link_url);
                };
                let Some(block) = layout.blocks.iter().find(|b| b.rect().contains(wx, wy)) else {
                    let row_hits_only_non_editable = layout
                        .blocks
                        .iter()
                        .any(|b| !b.editable() && wy >= b.y && wy <= b.y + b.body.height)
                        && !layout
                            .blocks
                            .iter()
                            .any(|b| b.editable() && wy >= b.y && wy <= b.y + b.body.height);
                    let Some(pt) = (!row_hits_only_non_editable)
                        .then(|| self.input_point(point(px(x), px(y)), window))
                        .flatten()
                    else {
                        self.clear_body_selection(window, cx);
                        return non_editable(self, link_url);
                    };
                    self.change_selection(DocumentSelection::caret(pt), window, cx);
                    return ResolvedContextMenu {
                        target: self.capture_context_target(),
                        can_copy: false,
                        can_cut: false,
                        can_paste: true,
                        link_url,
                    };
                };
                if !self.editor.block_selection.is_empty()
                    && self.editor.block_selection.contains(&block.block_id)
                {
                    let had_preedit = self.editor.preedit.take().is_some();
                    if had_preedit {
                        self.dirty_text = None;
                        self.doc_rev += 1;
                    }
                    if had_preedit || self.editor.selection.take().is_some() {
                        self.announce_selection(cx);
                        window.notify_text_input_changed(&self.editor_focus);
                    }
                    let can_paste = layout.blocks.iter().any(|b| {
                        self.editor.block_selection.contains(&b.block_id)
                            && !matches!(b.body.kind, FlowKind::Title)
                    });
                    return ResolvedContextMenu {
                        target: self.capture_context_target(),
                        can_copy: true,
                        can_cut: true,
                        can_paste,
                        link_url,
                    };
                }
                if !block.editable() {
                    self.clear_body_selection(window, cx);
                    return non_editable(self, link_url);
                }
                let max_u16 = block.body.plain.encode_utf16().count() as u64;
                let scroll = self.overlays.code_scroll_x(&block.block_id);
                let offset = block
                    .hit_text(wx + scroll, wy)
                    .map_or(max_u16, |c| c.utf16_offset.min(max_u16));
                if self.editor.composing() || !self.point_in_painted_selection(&layout, wx, wy) {
                    let block_id = block.block_id.clone();
                    self.change_selection(
                        DocumentSelection::caret(DocPoint::new(&block_id, offset)),
                        window,
                        cx,
                    );
                }
                let has_sel = self.editor.selection.as_ref().is_some_and(|s| !s.empty());
                ResolvedContextMenu {
                    target: self.capture_context_target(),
                    can_copy: has_sel,
                    can_cut: has_sel,
                    can_paste: true,
                    link_url,
                }
            }
            PlaygroundMode::Edgeless => {
                self.dismiss_overlay_text_fields(window, cx);
                if self.edgeless_point_in_label_editor(x, y, window) {
                    self.clear_body_selection(window, cx);
                    let (off, keep_sel) =
                        self.hit_label_editor_at(x, y, window).unwrap_or((0, false));
                    if !keep_sel {
                        if self
                            .edgeless
                            .authoring
                            .label_editor()
                            .is_some_and(|e| e.composing())
                        {
                            let _ = self.edgeless_label_edit(
                                window,
                                cx,
                                crate::edgeless::EdgelessLabelEditor::unmark,
                            );
                        }
                        if let Some(ed_mut) = self.edgeless.authoring.label_editor_mut() {
                            ed_mut.select(off..off);
                        }
                        self.edgeless_update_label_anchors();
                        window.notify_text_input_changed(&self.editor_focus);
                    }
                    let has_sel = self
                        .edgeless
                        .authoring
                        .label_editor()
                        .is_some_and(|e| !e.input.selection.is_empty());
                    return ResolvedContextMenu {
                        target: self.capture_context_target(),
                        can_copy: has_sel,
                        can_cut: has_sel,
                        can_paste: true,
                        link_url: None,
                    };
                }
                if self.edgeless.authoring.label_editor().is_some() {
                    self.finish_inline_targets(
                        InlineTargetEnd::CommitPreedit,
                        Some(window),
                        Some(cx),
                    );
                    return non_editable(self, None);
                }

                let link_url = self.hit_link_url_at(x, y, window);
                let Some((editing_id, is_note)) = self
                    .edgeless
                    .authoring
                    .editing_spatial_block()
                    .map(|(id, n)| (id.to_string(), n))
                else {
                    self.clear_body_selection(window, cx);
                    return non_editable(self, link_url);
                };
                let Some((flow_x, flow_y)) =
                    self.edgeless_screen_to_spatial_flow(x, y, &editing_id, is_note)
                else {
                    self.finish_inline_targets(
                        InlineTargetEnd::CommitPreedit,
                        Some(window),
                        Some(cx),
                    );
                    self.clear_body_selection(window, cx);
                    return non_editable(self, None);
                };
                let Some(layout) = self.edgeless.cached_block_layout(&editing_id, is_note) else {
                    self.clear_body_selection(window, cx);
                    return non_editable(self, link_url);
                };
                if let Some((_, hit_block)) = layout
                    .blocks
                    .iter()
                    .enumerate()
                    .find(|(_, b)| b.rect().contains(flow_x, flow_y))
                    && !hit_block.editable()
                {
                    self.clear_body_selection(window, cx);
                    return non_editable(self, link_url);
                }
                let Some(pt) = Self::hit_test_flow_layout(&layout, flow_x, flow_y) else {
                    self.clear_body_selection(window, cx);
                    return non_editable(self, link_url);
                };
                if !self.editor.composing()
                    && self.point_in_painted_selection(&layout, flow_x, flow_y)
                {
                    // Keep non-empty selection when right-clicking inside its painted highlight.
                } else {
                    self.change_selection(DocumentSelection::caret(pt), window, cx);
                }
                let has_sel = self.editor.selection.as_ref().is_some_and(|s| !s.empty());
                ResolvedContextMenu {
                    target: self.capture_context_target(),
                    can_copy: has_sel,
                    can_cut: has_sel,
                    can_paste: true,
                    link_url,
                }
            }
        }
    }

    fn dismiss_overlay_text_fields(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let before = self.link_input_state();
        if self.overlays.equation_editor().is_some() {
            self.dispatch_overlay_event(OverlayEvent::EquationApply, window, cx);
        }
        self.overlays.close_link_field();
        self.overlays.close_bookmark_prompt();
        if self.overlays.equation_editor().is_none() {
            self.equation_snapshot = None;
        }
        self.sync_link_input(before, window, cx);
    }

    fn hit_table_cell_for_context_menu(
        &self,
        layout: &FlowLayout,
        wx: f32,
        wy: f32,
    ) -> Option<(String, String, String, bool)> {
        let block = layout
            .blocks
            .iter()
            .find(|b| !b.body.table_cells.is_empty() && b.rect().contains(wx, wy))?;
        let local_x = wx - block.x + self.overlays.code_scroll_x(&block.block_id);
        let local_y = wy - block.y;
        let hit = block
            .body
            .table_cells
            .iter()
            .find(|c| c.rect.contains(local_x, local_y))?;
        let keep_sel = self.table_cell.as_ref().is_some_and(|c| {
            c.block_id == block.block_id
                && c.row_id == hit.row_id
                && c.column_id == hit.column_id
                && !c.input.composing()
                && !c.input.selection.is_empty()
                && {
                    let lh = hit.text.line_height();
                    hit.text
                        .selection_spans(c.input.selection.start, c.input.selection.end)
                        .into_iter()
                        .any(|(line, a, b)| {
                            FlowRect::new(
                                hit.text_origin.0 + a,
                                hit.text_origin.1 + line as f32 * lh,
                                (b - a).max(1.0),
                                lh,
                            )
                            .contains(local_x, local_y)
                        })
                }
        });
        Some((
            block.block_id.clone(),
            hit.row_id.clone(),
            hit.column_id.clone(),
            keep_sel,
        ))
    }

    fn point_in_painted_selection(&self, layout: &FlowLayout, wx: f32, wy: f32) -> bool {
        self.painted_selection_rects(layout)
            .iter()
            .any(|r| r.contains(wx, wy))
    }

    /// Detect whether window coordinates `(x, y)` hit an inline link mark or a Bookmark block,
    /// returning only allowlisted external URLs.
    pub(crate) fn hit_link_url_at(&self, x: f32, y: f32, window: &Window) -> Option<String> {
        let snapshot = self.page_snapshot()?;
        if self.mode == PlaygroundMode::Page {
            let layout = self.flow_layout()?;
            let (origin, sz) = self.canvas_rect(window);
            let geom = page_geometry(f32::from(sz.width));
            let wx = x - f32::from(origin.x) - geom.column_x;
            let wy = y - f32::from(origin.y) + self.scroll_y;
            return self.hit_link_in_layout(&layout, wx, wy, &snapshot);
        }
        // In Edgeless inline Note/EdgelessText editing, resolve strictly at right-click coords.
        let (editing_id, is_note) = self.edgeless.authoring.editing_spatial_block()?;
        let (flow_x, flow_y) = self.edgeless_screen_to_spatial_flow(x, y, editing_id, is_note)?;
        let layout = self.edgeless.cached_block_layout(editing_id, is_note)?;
        self.hit_link_in_layout(&layout, flow_x, flow_y, &snapshot)
    }

    pub(crate) fn hit_link_in_layout(
        &self,
        layout: &FlowLayout,
        wx: f32,
        wy: f32,
        snapshot: &blocksuite_playground_doc::read::PageSnapshot,
    ) -> Option<String> {
        for block in &layout.blocks {
            if !block.rect().contains(wx, wy) {
                continue;
            }
            if matches!(block.body.kind, FlowKind::Bookmark)
                && let Some(node) = snapshot.block(&block.block_id)
                && let BlockContent::Bookmark { url, .. } = &node.content
            {
                return sanitize_external_link_url(url);
            }
            if let Some(url) = self.inline_link_at_point(block, wx, wy) {
                return sanitize_external_link_url(&url);
            }
        }
        None
    }

    fn inline_link_at_point(&self, block: &FlowBlock, wx: f32, wy: f32) -> Option<String> {
        let text = block.body.text.as_ref()?;
        let FlowTextLayout::Rich(rich) = &text.layout else {
            return None;
        };
        let pt = point(px(wx - block.x - text.x), px(wy - block.y - text.y));
        rich.inline_decorations()
            .iter()
            .find_map(|deco| match &deco.kind {
                DecorationKind::Link(url) if !url.is_empty() && deco.bounds.contains(&pt) => {
                    Some(url.clone())
                }
                _ => None,
            })
    }

    pub(crate) fn capture_context_target(&self) -> Option<ContextTargetSnapshot> {
        if self.overlays.active_text_field().is_some() {
            return None;
        }
        let kind = if let Some(cell) = self.table_cell.as_ref() {
            ContextTargetKind::TableCell {
                block_id: cell.block_id.clone(),
                row_id: cell.row_id.clone(),
                column_id: cell.column_id.clone(),
                text: cell.input.text.clone(),
                selection: cell.input.selection.clone(),
            }
        } else if let Some(ed) = self.edgeless.authoring.label_editor() {
            ContextTargetKind::EdgelessLabel {
                target: ed.target.clone(),
                text: ed.input.text.clone(),
                selection: ed.input.selection.clone(),
            }
        } else if !self.editor.block_selection.is_empty() {
            ContextTargetKind::BlockSelection {
                block_ids: self.editor.block_selection.iter().cloned().collect(),
            }
        } else if let Some(selection) = self.editor.selection.as_ref() {
            let edgeless_spatial = match self.mode {
                PlaygroundMode::Page => None,
                PlaygroundMode::Edgeless => Some(
                    self.edgeless
                        .authoring
                        .editing_spatial_block()
                        .map(|(id, n)| (id.to_string(), n))
                        .or_else(|| self.edgeless_readonly_selection_target.clone())?,
                ),
            };
            ContextTargetKind::BodySelection {
                edgeless_spatial,
                anchor_block_id: selection.anchor.block_id.clone(),
                focus_block_id: selection.focus.block_id.clone(),
                relative: self.editor.relative_selection.clone(),
            }
        } else {
            return None;
        };
        Some(ContextTargetSnapshot {
            doc_epoch: self.doc_epoch,
            page_id: self.page_id.clone(),
            mode: self.mode,
            kind,
        })
    }

    pub(super) fn handle_context_menu_event(
        &mut self,
        event: &OverlayEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        match event {
            OverlayEvent::OpenContextMenu { x, y } => {
                self.open_context_menu_at(*x, *y, window, cx);
                true
            }
            OverlayEvent::CloseContextMenu => {
                self.context_menu_target = None;
                let now_ms = self.now_ms(cx);
                if self.overlays.close_context_menu(now_ms) {
                    cx.notify();
                }
                true
            }
            OverlayEvent::ContextMenuAction(action) => {
                let menu_target = self.context_menu_target.take();
                let now_ms = self.now_ms(cx);
                self.overlays.close_context_menu(now_ms);
                self.execute_context_menu_action(action.clone(), menu_target, window, cx);
                cx.notify();
                true
            }
            _ => false,
        }
    }

    pub(crate) fn clipboard_item_has_pasteable_content(item: &ClipboardItem) -> bool {
        item.text().is_some_and(|t| !t.is_empty()) || crate::clipboard::read_slice(item).is_some()
    }

    fn show_paste_fallback_toast(&mut self, cx: &mut Context<Self>) {
        let generation = self.overlays.show_context_toast("Use Ctrl/Cmd+V to paste");
        self.context_toast_timer = Some(cx.spawn(async move |this, cx| {
            cx.background_executor()
                .timer(Duration::from_millis(CONTEXT_TOAST_MS))
                .await;
            let _ = this.update(cx, |this, cx| {
                if this.overlays.context_toast_expired(generation) {
                    cx.notify();
                }
            });
        }));
        cx.notify();
    }

    pub(crate) fn execute_context_menu_action(
        &mut self,
        action: ContextMenuAction,
        menu_target: Option<ContextTargetSnapshot>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match action {
            ContextMenuAction::Copy => self.run_selection_copy(menu_target, window, cx),
            ContextMenuAction::Cut => self.run_selection_cut(menu_target, window, cx),
            ContextMenuAction::Paste => self.run_selection_paste(menu_target, window, cx),
            ContextMenuAction::OpenLink(url) => {
                if let Some(clean) = sanitize_external_link_url(&url) {
                    self.last_opened_link_url = Some(clean.clone());
                    cx.open_url(&clean);
                }
            }
            ContextMenuAction::CopyLink(url) => {
                if let Some(clean) = sanitize_external_link_url(&url) {
                    cx.write_to_clipboard(ClipboardItem::new_string(clean));
                }
            }
        }
    }

    pub(crate) fn can_execute_paste_on_target(&self, target: &ContextTargetSnapshot) -> bool {
        !(self.mode == PlaygroundMode::Edgeless && self.edgeless_readonly)
            && !(self.mode == PlaygroundMode::Page && self.page_readonly)
            && !matches!(target.kind, ContextTargetKind::NonEditableSurface)
            && self.overlays.active_text_field().is_none()
            && self.capture_context_target().as_ref() == Some(target)
    }

    pub(crate) fn spawn_context_paste_task(
        &mut self,
        read_task: Task<Result<Option<ClipboardItem>, ClipboardReadError>>,
        expected: ContextTargetSnapshot,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let view = cx.entity().downgrade();
        self.context_paste_task = Some(window.spawn(cx, async move |wcx| {
            let res = read_task.await;
            let _ = wcx.update(|window, cx| {
                let _ = view.update(cx, |this, cx| {
                    this.context_paste_task = None;
                    if !this.can_execute_paste_on_target(&expected) {
                        return;
                    }
                    if let Ok(Some(item)) = res
                        && Self::clipboard_item_has_pasteable_content(&item)
                    {
                        this.execute_paste_on_target(&expected, item, window, cx);
                    } else {
                        this.show_paste_fallback_toast(cx);
                    }
                });
            });
        }));
    }

    pub(crate) fn execute_paste_on_target(
        &mut self,
        target: &ContextTargetSnapshot,
        item: ClipboardItem,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if !self.can_execute_paste_on_target(target) {
            return;
        }
        match &target.kind {
            ContextTargetKind::NonEditableSurface => {}
            ContextTargetKind::TableCell { .. } => {
                if let Some(text) = item.text() {
                    let _ =
                        self.table_cell_edit(window, cx, |cell| cell.input.replace(None, &text));
                }
            }
            ContextTargetKind::EdgelessLabel { .. } => {
                if let Some(text) = item.text() {
                    let _ = self.edgeless_label_edit(window, cx, |ed| ed.replace(None, &text));
                }
            }
            ContextTargetKind::BlockSelection { .. } => {
                let _ = self.paste_into_block_selection(&item, window, cx);
            }
            ContextTargetKind::BodySelection { .. } => {
                if self.mode == PlaygroundMode::Edgeless
                    && self.edgeless.authoring.editing_spatial_block().is_none()
                {
                    return;
                }
                self.paste_body_clipboard_item(&item, window, cx);
            }
        }
    }

    pub(crate) fn execute_copy_or_cut_on_target(
        &mut self,
        target: &ContextTargetSnapshot,
        cut: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if (cut
            && ((self.mode == PlaygroundMode::Edgeless && self.edgeless_readonly)
                || (self.mode == PlaygroundMode::Page && self.page_readonly)))
            || self.overlays.active_text_field().is_some()
            || self.capture_context_target().as_ref() != Some(target)
        {
            return;
        }
        match &target.kind {
            ContextTargetKind::NonEditableSurface => {}
            ContextTargetKind::TableCell { .. } => {
                if let Some(cell) = self.table_cell.as_ref()
                    && !cell.input.selection.is_empty()
                {
                    let s = cell.input.selected_text().to_string();
                    cx.write_to_clipboard(ClipboardItem::new_string(s));
                    if cut {
                        let _ =
                            self.table_cell_edit(window, cx, |cell| cell.input.replace(None, ""));
                    }
                }
            }
            ContextTargetKind::EdgelessLabel { .. } => {
                if let Some(ed) = self.edgeless.authoring.label_editor()
                    && !ed.input.selection.is_empty()
                {
                    let s = ed.selected_text().to_string();
                    cx.write_to_clipboard(ClipboardItem::new_string(s));
                    if cut {
                        let _ = self.edgeless_label_edit(window, cx, |ed| ed.replace(None, ""));
                    }
                }
            }
            ContextTargetKind::BlockSelection { .. } => {
                if let Some(slice) = self.block_selection_slice() {
                    crate::clipboard::write_slice(&slice, cx);
                    if cut {
                        let _ = self.delete_selected_blocks(window, cx);
                    }
                }
            }
            ContextTargetKind::BodySelection { .. } => {
                if let Some(slice) = self.clipboard_slice() {
                    crate::clipboard::write_slice(&slice, cx);
                    if cut {
                        let _ = self.edit_key("backspace", false, window, cx);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use ui::{
        AppContext, Bounds, HeadlessPlatform, Modifiers, MouseButton, MouseDownEvent,
        MouseMoveEvent, MouseUpEvent, WindowBounds, WindowHandle, WindowOptions,
        audit_frame_snapshot, point, px, size,
    };

    use crate::{
        PlaygroundMode, PlaygroundOptions, PlaygroundView,
        overlays::{ContextMenuAction, OverlayEvent},
    };

    fn open_view(
        w: u32,
        h: u32,
        options: PlaygroundOptions,
    ) -> (
        std::rc::Rc<HeadlessPlatform>,
        ui::ApplicationHandle,
        WindowHandle<PlaygroundView>,
        ui::HeadlessWindow,
    ) {
        let platform = HeadlessPlatform::new(w, h, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let win = app.update(|cx| {
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(w as f32), px(h as f32)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| cx.new(|cx| PlaygroundView::with_options(options, cx)),
            )
            .unwrap()
        });
        let hw = platform.windows().into_iter().next().unwrap();
        hw.request_frame();
        (platform, app, win, hw)
    }

    #[test]
    fn edgeless_zoom_buttons_smooth_transition_and_wheel_cancel() {
        let (platform, app, win, hw) = open_view(
            1280,
            800,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                ..Default::default()
            },
        );
        let initial_zoom =
            app.update(|cx| win.update(cx, |v, _, _| v.edgeless_camera().zoom).unwrap());
        let snap = app.update(|cx| {
            win.update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        let in_btn = snap.elements["chrome.edgeless_zoom.in"].bounds;
        hw.simulate_click(point(
            px(in_btn.x + in_btn.width * 0.5),
            px(in_btn.y + in_btn.height * 0.5),
        ));
        platform.run_until_parked();
        hw.request_frame();

        // Mid-transition at 85ms: strictly between start and additive +0.25 target.
        platform.advance_clock(Duration::from_millis(85));
        hw.request_frame();
        let mid_zoom = app.update(|cx| win.update(cx, |v, _, _| v.edgeless_camera().zoom).unwrap());
        let expected_target = initial_zoom + 0.25;
        assert!(
            mid_zoom > initial_zoom && mid_zoom < expected_target,
            "mid_zoom={mid_zoom} should be between {initial_zoom} and {expected_target}"
        );

        // Rapid second click mid-flight retargets to +0.50 without jumping backward.
        hw.simulate_click(point(
            px(in_btn.x + in_btn.width * 0.5),
            px(in_btn.y + in_btn.height * 0.5),
        ));
        platform.run_until_parked();
        platform.advance_clock(Duration::from_millis(180));
        hw.request_frame();
        let final_zoom =
            app.update(|cx| win.update(cx, |v, _, _| v.edgeless_camera().zoom).unwrap());
        assert!(
            (final_zoom - (initial_zoom + 0.50)).abs() < 1e-2,
            "retargeted final_zoom={final_zoom}, expected {}",
            initial_zoom + 0.50
        );

        // Reset button transitions smoothly to 100%, and direct zoom/pan cancels transition.
        let reset_btn = snap.elements["chrome.edgeless_zoom.reset"].bounds;
        hw.simulate_click(point(
            px(reset_btn.x + reset_btn.width * 0.5),
            px(reset_btn.y + reset_btn.height * 0.5),
        ));
        platform.run_until_parked();
        platform.advance_clock(Duration::from_millis(50));
        hw.request_frame();
        app.update(|cx| {
            win.update(cx, |v, _, cx| v.set_edgeless_zoom(1.5, cx))
                .unwrap();
        });
        platform.advance_clock(Duration::from_millis(200));
        hw.request_frame();
        let after_cancel =
            app.update(|cx| win.update(cx, |v, _, _| v.edgeless_camera().zoom).unwrap());
        assert!((after_cancel - 1.5).abs() < 1e-3);
    }

    #[test]
    fn edgeless_shape_picker_slides_out_over_230ms_and_is_clickable_frame_one() {
        let (platform, app, win, hw) = open_view(
            1280,
            800,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                ..Default::default()
            },
        );
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.edgeless_select_tool(
                    crate::edgeless::EdgelessTool::Shape(crate::edgeless::ShapePreset::Rect),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        hw.request_frame();
        let snap_start = app.update(|cx| {
            win.update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        let start_picker = snap_start
            .elements
            .get("chrome.edgeless_toolbar.shape_picker")
            .expect("shape picker mounted on frame 1");
        assert!(start_picker.opacity >= 0.01 && start_picker.opacity < 0.2);

        platform.advance_clock(Duration::from_millis(100));
        hw.request_frame();
        let snap_mid = app.update(|cx| {
            win.update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        let mid_picker = &snap_mid.elements["chrome.edgeless_toolbar.shape_picker"];
        assert!(mid_picker.bounds.y < start_picker.bounds.y);
        assert!(mid_picker.opacity > start_picker.opacity && mid_picker.opacity < 1.0);

        platform.advance_clock(Duration::from_millis(150));
        hw.request_frame();
        let snap_end = app.update(|cx| {
            win.update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        let end_picker = &snap_end.elements["chrome.edgeless_toolbar.shape_picker"];
        assert!((end_picker.opacity - 1.0).abs() < 1e-4);
        assert!(end_picker.bounds.y <= mid_picker.bounds.y);
        assert!(audit_frame_snapshot(&snap_end).is_empty());
    }

    #[test]
    fn todo_checkbox_pulse_and_caret_blink_scheduler_clock() {
        let (platform, app, win, hw) = open_view(1280, 800, PlaygroundOptions::default());

        // 1. Toggle unchecked todo -> checked triggers radial pulse, expires after 240ms.
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.dispatch_overlay(
                    OverlayEvent::ToggleChecked("showcase-todo-open".to_string()),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        hw.request_frame();
        assert!(app.update(|cx| {
            win.update(cx, |v, _, _| {
                v.overlays().todo_pulse_active("showcase-todo-open")
            })
            .unwrap()
        }));
        platform.advance_clock(Duration::from_millis(250));
        hw.request_frame();
        assert!(app.update(|cx| {
            win.update(cx, |v, _, _| {
                v.overlays().todo_pulse_active("showcase-todo-open")
            })
            .unwrap()
        }));
        platform.advance_clock(Duration::from_millis(400));
        hw.request_frame();
        assert!(!app.update(|cx| {
            win.update(cx, |v, _, _| {
                v.overlays().todo_pulse_active("showcase-todo-open")
            })
            .unwrap()
        }));

        // 2. Caret blink: 500ms on / 500ms off closed-form, reset on selection change.
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.select_document_range(
                    crate::editor_session::DocumentSelection::caret(
                        crate::editor_session::DocPoint::new("showcase-intro", 0),
                    ),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        hw.request_frame();
        let alpha_0 = app.update(|cx| {
            win.update(cx, |v, _, cx| v.caret_blink_alpha(v.now_ms(cx)))
                .unwrap()
        });
        assert_eq!(alpha_0, 1.0);

        platform.advance_clock(Duration::from_millis(550));
        hw.request_frame();
        let alpha_off = app.update(|cx| {
            win.update(cx, |v, _, cx| v.caret_blink_alpha(v.now_ms(cx)))
                .unwrap()
        });
        assert_eq!(alpha_off, 0.0);

        platform.advance_clock(Duration::from_millis(500));
        hw.request_frame();
        let alpha_on = app.update(|cx| {
            win.update(cx, |v, _, cx| v.caret_blink_alpha(v.now_ms(cx)))
                .unwrap()
        });
        assert_eq!(alpha_on, 1.0);

        // Moving caret resets blink phase to solid for 500ms.
        platform.advance_clock(Duration::from_millis(450));
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.select_document_range(
                    crate::editor_session::DocumentSelection::caret(
                        crate::editor_session::DocPoint::new("showcase-intro", 2),
                    ),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.advance_clock(Duration::from_millis(200));
        let alpha_reset = app.update(|cx| {
            win.update(cx, |v, _, cx| v.caret_blink_alpha(v.now_ms(cx)))
                .unwrap()
        });
        assert_eq!(alpha_reset, 1.0);
        assert!(app.update(|cx| {
            win.update(cx, |v, _, _| v.caret_blink_task.is_some())
                .unwrap()
        }));

        // Non-empty range selection stops the caret blink task (no visible collapsed caret).
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.select_document_range(
                    crate::editor_session::DocumentSelection {
                        anchor: crate::editor_session::DocPoint::new("showcase-intro", 0),
                        focus: crate::editor_session::DocPoint::new("showcase-intro", 4),
                    },
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        assert!(app.update(|cx| {
            win.update(cx, |v, _, _| v.caret_blink_task.is_none())
                .unwrap()
        }));
    }

    #[test]
    fn desktop_scrollbar_visibility_drag_and_context_menu_actions() {
        // Phone FormFactor hides desktop scrollbar and suppresses desktop context menu.
        let (_mp, m_app, m_win, mhw) = open_view(
            320,
            800,
            PlaygroundOptions {
                form_factor: crate::FormFactor::Phone,
                ..Default::default()
            },
        );
        m_app.update(|cx| {
            m_win
                .update(cx, |v, w, cx| {
                    v.dispatch_overlay(OverlayEvent::OpenContextMenu { x: 120.0, y: 200.0 }, w, cx);
                })
                .unwrap();
        });
        mhw.request_frame();
        let m_snap = m_app.update(|cx| {
            m_win
                .update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        assert!(!m_snap.elements.contains_key("overlay.page_scrollbar"));
        assert!(!m_snap.elements.contains_key("overlay.context_menu"));

        // Mobile read-only mode (`edgeless_readonly: true`) suppresses desktop context menu even on wide viewports.
        let (_rp, r_app, r_win, rhw) = open_view(
            1280,
            800,
            PlaygroundOptions {
                edgeless_readonly: true,
                ..Default::default()
            },
        );
        r_app.update(|cx| {
            r_win
                .update(cx, |v, w, cx| {
                    v.dispatch_overlay(OverlayEvent::OpenContextMenu { x: 400.0, y: 260.0 }, w, cx);
                })
                .unwrap();
        });
        rhw.request_frame();
        let r_snap = r_app.update(|cx| {
            r_win
                .update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        assert!(!r_snap.elements.contains_key("overlay.context_menu"));

        // Desktop width (1280px) mounts thin 8px scrollbar on right edge, supports thumb drag.
        let (platform, app, win, hw) = open_view(1280, 800, PlaygroundOptions::default());
        let snap = app.update(|cx| {
            win.update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        let sb = snap
            .elements
            .get("overlay.page_scrollbar")
            .expect("desktop scrollbar present");
        assert_eq!(sb.bounds.width, 24.0);
        assert!(sb.bounds.x > 1200.0);
        let violations = audit_frame_snapshot(&snap);
        assert!(violations.is_empty(), "scrollbar audit: {violations:#?}");

        let thumb = snap.elements["overlay.page_scrollbar.thumb"].bounds;
        assert_eq!(thumb.width, 8.0);
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.on_scrollbar_mouse_down(
                    &MouseDownEvent {
                        button: MouseButton::Left,
                        position: point(
                            px(thumb.x + thumb.width * 0.5),
                            px(thumb.y + thumb.height * 0.5),
                        ),
                        modifiers: Modifiers::default(),
                        click_count: 1,
                        first_mouse: false,
                    },
                    w,
                    cx,
                );
                v.root_mouse_move(
                    &MouseMoveEvent {
                        position: point(
                            px(thumb.x + thumb.width * 0.5),
                            px(thumb.y + thumb.height * 0.5 + 120.0),
                        ),
                        pressed_button: Some(MouseButton::Left),
                        modifiers: Modifiers::default(),
                    },
                    w,
                    cx,
                );
                v.root_mouse_up(
                    &MouseUpEvent {
                        button: MouseButton::Left,
                        position: point(
                            px(thumb.x + thumb.width * 0.5),
                            px(thumb.y + thumb.height * 0.5 + 120.0),
                        ),
                        modifiers: Modifiers::default(),
                        click_count: 1,
                    },
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        let scrolled = app.update(|cx| win.update(cx, |v, _, _| v.scroll_offset()).unwrap());
        assert!(
            scrolled > 0.0,
            "dragging scrollbar thumb should scroll page"
        );

        // Context menu opens on right-click, shows Copy/Cut/Paste, clamps inside viewport,
        // and Paste with empty clipboard shows fallback toast.
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                if let Some(b) = v
                    .flow_layout()
                    .unwrap()
                    .blocks
                    .iter()
                    .rev()
                    .find(|b| b.editable())
                {
                    v.scroll_y = (b.y + 8.0 - (780.0 - crate::TOPBAR_HEIGHT)).max(0.0);
                }
                v.dispatch_overlay(
                    OverlayEvent::OpenContextMenu {
                        x: 1260.0,
                        y: 780.0,
                    },
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.advance_clock(Duration::from_millis(160));
        hw.request_frame();
        let ctx_snap = app.update(|cx| {
            win.update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        let menu = ctx_snap
            .elements
            .get("overlay.context_menu")
            .expect("context menu mounted");
        assert!(menu.bounds.right() <= 1280.0 && menu.bounds.bottom() <= 800.0);
        assert!(ctx_snap.elements.contains_key("overlay.context_menu.copy"));
        assert!(ctx_snap.elements.contains_key("overlay.context_menu.cut"));
        assert!(ctx_snap.elements.contains_key("overlay.context_menu.paste"));
        assert!(audit_frame_snapshot(&ctx_snap).is_empty());

        // Paste with empty clipboard triggers non-blocking fallback toast.
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.dispatch_overlay(
                    OverlayEvent::ContextMenuAction(ContextMenuAction::Paste),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.run_until_parked();
        hw.request_frame();
        let toast_snap = app.update(|cx| {
            win.update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        assert!(
            toast_snap
                .elements
                .contains_key("overlay.context_menu.toast")
        );
        assert!(audit_frame_snapshot(&toast_snap).is_empty());

        // OpenLink action records URL cleanly.
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.dispatch_overlay(
                    OverlayEvent::ContextMenuAction(ContextMenuAction::OpenLink(
                        "https://affine.pro".to_string(),
                    )),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        assert_eq!(
            app.update(|cx| win
                .update(cx, |v, _, _| v.last_opened_link_url().map(str::to_string))
                .unwrap())
                .as_deref(),
            Some("https://affine.pro")
        );

        // Regression: caret resting on an inline link must NOT leak Open Link / Copy Link
        // when right-clicking a different plain paragraph in Page mode.
        let (p_link, l_app, l_win, l_hw) = open_view(1280, 800, PlaygroundOptions::default());
        let l_snap = l_app.update(|cx| {
            l_win
                .update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        let quote_bounds = l_snap.elements["page.block.showcase-quote"].bounds;
        l_app.update(|cx| {
            l_win
                .update(cx, |v, w, cx| {
                    let intro_text = v.block_text("showcase-intro").unwrap_or("").to_string();
                    let link_start = intro_text.find("links").expect("links in showcase-intro");
                    let link_u16 = intro_text[..link_start].encode_utf16().count() as u64;
                    v.select_document_range(
                        crate::editor_session::DocumentSelection::caret(
                            crate::editor_session::DocPoint::new("showcase-intro", link_u16 + 1),
                        ),
                        w,
                        cx,
                    );
                    v.dispatch_overlay(
                        OverlayEvent::OpenContextMenu {
                            x: quote_bounds.x + 20.0,
                            y: quote_bounds.y + quote_bounds.height * 0.5,
                        },
                        w,
                        cx,
                    );
                })
                .unwrap();
        });
        p_link.advance_clock(Duration::from_millis(160));
        l_hw.request_frame();
        let plain_ctx_snap = l_app.update(|cx| {
            l_win
                .update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        assert!(plain_ctx_snap.elements.contains_key("overlay.context_menu"));
        assert!(
            !plain_ctx_snap
                .elements
                .contains_key("overlay.context_menu.open_link"),
            "right-clicking a plain paragraph must not inherit a link from a distant caret"
        );
    }

    #[test]
    fn context_menu_sanitizes_unsafe_crdt_links_and_blocks_open_link() {
        let (platform, app, win, hw) = open_view(1280, 800, PlaygroundOptions::default());
        app.update(|cx| {
            win.update(cx, |v, _, cx| {
                let mut attrs = std::collections::BTreeMap::new();
                attrs.insert(
                    "link".to_string(),
                    y_octo::Any::String("javascript:alert(1)".to_string()),
                );
                let _ = v.page_mut().unwrap().format_text(
                    "showcase-quote",
                    "prop:text",
                    0,
                    5,
                    attrs,
                    100,
                );
                let _ = v.page_mut().unwrap().set_block_prop(
                    "showcase-bookmark",
                    "prop:url",
                    y_octo::SessionValue::Any(y_octo::Any::String(
                        "file:///etc/passwd".to_string(),
                    )),
                    101,
                );
                v.refresh_document();
                cx.notify();
            })
            .unwrap();
        });
        hw.request_frame();
        let snap = app.update(|cx| {
            win.update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        let quote = snap.elements["page.block.showcase-quote"].bounds;
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.dispatch_overlay(
                    OverlayEvent::OpenContextMenu {
                        x: quote.x + 12.0,
                        y: quote.y + quote.height * 0.5,
                    },
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.advance_clock(Duration::from_millis(160));
        hw.request_frame();
        let ctx = app.update(|cx| {
            win.update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        assert!(ctx.elements.contains_key("overlay.context_menu"));
        assert!(!ctx.elements.contains_key("overlay.context_menu.open_link"));

        // Direct Bookmark hit with `file:///etc/passwd` also rejected.
        let bookmark_url = app.update(|cx| {
            win.update(cx, |v, w, _| {
                let layout = v.flow_layout().unwrap();
                let bm = layout
                    .blocks
                    .iter()
                    .find(|b| b.block_id == "showcase-bookmark")
                    .unwrap();
                let geom = crate::block_flow::page_geometry(f32::from(w.viewport_size().width));
                v.hit_link_url_at(
                    geom.column_x + bm.x + 10.0,
                    crate::TOPBAR_HEIGHT - v.scroll_y + bm.y + 10.0,
                    w,
                )
            })
            .unwrap()
        });
        assert_eq!(bookmark_url, None);

        // Direct OpenLink dispatch with unsafe scheme must NOT record `last_opened_link_url`.
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.dispatch_overlay(
                    OverlayEvent::ContextMenuAction(ContextMenuAction::OpenLink(
                        "javascript:alert(1)".to_string(),
                    )),
                    w,
                    cx,
                );
                v.dispatch_overlay(
                    OverlayEvent::ContextMenuAction(ContextMenuAction::OpenLink(
                        "file:///etc/passwd".to_string(),
                    )),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        assert_eq!(
            app.update(|cx| win
                .update(cx, |v, _, _| v.last_opened_link_url().map(str::to_string))
                .unwrap()),
            None
        );
    }

    #[test]
    fn context_menu_right_click_positions_caret_and_paste_targets_clicked_block_or_selection() {
        let (platform, app, win, hw) = open_view(1280, 800, PlaygroundOptions::default());
        let snap = app.update(|cx| {
            win.update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        let quote_bounds = snap.elements["page.block.showcase-quote"].bounds;
        let orig_title = app.update(|cx| {
            win.update(cx, |v, _, _| {
                v.block_text("showcase-page").unwrap_or("").to_string()
            })
            .unwrap()
        });
        let orig_intro = app.update(|cx| {
            win.update(cx, |v, _, _| {
                v.block_text("showcase-intro").unwrap_or("").to_string()
            })
            .unwrap()
        });

        // 1. With no selection (and separately with caret in `showcase-intro`), right-clicking
        // `showcase-quote` and clicking Paste inserts into `showcase-quote`, never `showcase-page`.
        app.update(|cx| {
            cx.write_to_clipboard(ui::ClipboardItem::new_string("INSERTED".to_string()));
            win.update(cx, |v, w, cx| {
                v.dispatch_overlay(
                    OverlayEvent::OpenContextMenu {
                        x: quote_bounds.x + 14.0,
                        y: quote_bounds.y + quote_bounds.height * 0.5,
                    },
                    w,
                    cx,
                );
                v.dispatch_overlay(
                    OverlayEvent::ContextMenuAction(ContextMenuAction::Paste),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.run_until_parked();
        hw.request_frame();
        let (title_after, intro_after, quote_after) = app.update(|cx| {
            win.update(cx, |v, _, _| {
                (
                    v.block_text("showcase-page").unwrap_or("").to_string(),
                    v.block_text("showcase-intro").unwrap_or("").to_string(),
                    v.block_text("showcase-quote").unwrap_or("").to_string(),
                )
            })
            .unwrap()
        });
        assert_eq!(title_after, orig_title, "page title must not be polluted");
        assert_eq!(intro_after, orig_intro, "unrelated intro must not change");
        assert!(
            quote_after.contains("INSERTED"),
            "pasted text should land in clicked quote block, got: {quote_after:?}"
        );

        // 2. With caret resting in `showcase-intro`, right-clicking `showcase-quote` still pastes
        // into `showcase-quote`.
        app.update(|cx| {
            cx.write_to_clipboard(ui::ClipboardItem::new_string("SECOND".to_string()));
            win.update(cx, |v, w, cx| {
                v.select_document_range(
                    crate::editor_session::DocumentSelection::caret(
                        crate::editor_session::DocPoint::new("showcase-intro", 0),
                    ),
                    w,
                    cx,
                );
                v.dispatch_overlay(
                    OverlayEvent::OpenContextMenu {
                        x: quote_bounds.x + 14.0,
                        y: quote_bounds.y + quote_bounds.height * 0.5,
                    },
                    w,
                    cx,
                );
                v.dispatch_overlay(
                    OverlayEvent::ContextMenuAction(ContextMenuAction::Paste),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.run_until_parked();
        hw.request_frame();
        let (intro_after_2, quote_after_2) = app.update(|cx| {
            win.update(cx, |v, _, _| {
                (
                    v.block_text("showcase-intro").unwrap_or("").to_string(),
                    v.block_text("showcase-quote").unwrap_or("").to_string(),
                )
            })
            .unwrap()
        });
        assert_eq!(intro_after_2, orig_intro);
        assert!(quote_after_2.contains("SECOND"));

        // 3. With a non-empty range selected in `showcase-intro`, right-clicking inside the
        // selection preserves it and Paste replaces the selected text.
        let intro_bounds = snap.elements["page.block.showcase-intro"].bounds;
        app.update(|cx| {
            cx.write_to_clipboard(ui::ClipboardItem::new_string("REPLACED".to_string()));
            win.update(cx, |v, w, cx| {
                v.select_document_range(
                    crate::editor_session::DocumentSelection {
                        anchor: crate::editor_session::DocPoint::new("showcase-intro", 0),
                        focus: crate::editor_session::DocPoint::new("showcase-intro", 4),
                    },
                    w,
                    cx,
                );
                v.dispatch_overlay(
                    OverlayEvent::OpenContextMenu {
                        x: intro_bounds.x + 10.0,
                        y: intro_bounds.y + 10.0,
                    },
                    w,
                    cx,
                );
                v.dispatch_overlay(
                    OverlayEvent::ContextMenuAction(ContextMenuAction::Paste),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.run_until_parked();
        hw.request_frame();
        let intro_replaced = app.update(|cx| {
            win.update(cx, |v, _, _| {
                v.block_text("showcase-intro").unwrap_or("").to_string()
            })
            .unwrap()
        });
        assert!(
            intro_replaced.starts_with("REPLACED"),
            "right-click inside range selection must replace it, got: {intro_replaced:?}"
        );
    }

    #[test]
    fn edgeless_inline_note_context_menu_hits_link_at_pointer_not_stale_caret() {
        let (platform, app, win, hw) = open_view(
            1280,
            800,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                ..Default::default()
            },
        );
        // Enter inline editing on the showcase note and place caret on the `links` inline link.
        let (plain_screen, link_screen) = app.update(|cx| {
            win.update(cx, |v, w, cx| {
                let note_id = v
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .find(|i| i.kind == crate::edgeless::SpatialItemKind::Note)
                    .expect("painted note")
                    .id
                    .clone();
                v.edgeless.authoring.inline_edit =
                    Some(crate::edgeless::EdgelessInlineEdit::SpatialBlock {
                        block_id: note_id.clone(),
                        is_note: true,
                        created_new: false,
                    });
                let intro_text = v.block_text("showcase-intro").unwrap_or("").to_string();
                let link_start = intro_text.find("links").expect("links in showcase-intro");
                let link_u16 = intro_text[..link_start].encode_utf16().count() as u64;
                v.select_document_range(
                    crate::editor_session::DocumentSelection::caret(
                        crate::editor_session::DocPoint::new("showcase-intro", link_u16 + 1),
                    ),
                    w,
                    cx,
                );
                let info = v
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .find(|i| i.id == note_id)
                    .unwrap()
                    .clone();
                let layout = v.edgeless.cached_block_layout(&note_id, true).unwrap();
                let quote = layout
                    .blocks
                    .iter()
                    .find(|b| b.block_id == "showcase-quote")
                    .unwrap();
                let intro = layout
                    .blocks
                    .iter()
                    .find(|b| b.block_id == "showcase-intro")
                    .unwrap();
                let link_rect = intro
                    .caret_rect(crate::rich_text::CaretPosition {
                        utf16_offset: link_u16 + 1,
                        affinity: crate::rich_text::WrapAffinity::Downstream,
                    })
                    .unwrap();
                let to_screen = |fx: f32, fy: f32| {
                    let wx = info.rect.x + (fx + crate::edgeless::NOTE_CARD_PADDING) * info.scale;
                    let wy = info.rect.y + (fy + crate::edgeless::NOTE_CARD_PADDING) * info.scale;
                    let vp_origin = point(px(0.0), px(crate::TOPBAR_HEIGHT));
                    let sp = v
                        .edgeless
                        .camera
                        .world_to_screen(point(px(wx), px(wy)), vp_origin);
                    (f32::from(sp.x), f32::from(sp.y))
                };
                let plain_pt = to_screen(quote.x + 12.0, quote.y + quote.body.height * 0.5);
                let link_pt = to_screen(link_rect.x + 2.0, link_rect.y + link_rect.h * 0.5);
                (plain_pt, link_pt)
            })
            .unwrap()
        });

        // Right-clicking plain quote block while caret rests on `links` must NOT show open_link.
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.dispatch_overlay(
                    OverlayEvent::OpenContextMenu {
                        x: plain_screen.0,
                        y: plain_screen.1,
                    },
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.advance_clock(Duration::from_millis(160));
        hw.request_frame();
        let plain_snap = app.update(|cx| {
            win.update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        assert!(plain_snap.elements.contains_key("overlay.context_menu"));
        assert!(
            !plain_snap
                .elements
                .contains_key("overlay.context_menu.open_link")
        );

        // Right-clicking directly on the `links` text DOES show open_link.
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.dispatch_overlay(
                    OverlayEvent::OpenContextMenu {
                        x: link_screen.0,
                        y: link_screen.1,
                    },
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.advance_clock(Duration::from_millis(160));
        hw.request_frame();
        let link_snap = app.update(|cx| {
            win.update(cx, |_, w, _| w.frame_snapshot().clone())
                .unwrap()
        });
        assert!(
            link_snap
                .elements
                .contains_key("overlay.context_menu.open_link")
        );
    }

    #[test]
    fn edgeless_shape_picker_closes_on_escape_and_after_drawing_shape() {
        let (platform, app, win, hw) = open_view(
            1280,
            800,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                ..Default::default()
            },
        );
        // 1. Open Shape picker, then press Escape -> fades out and unmounts after 230ms.
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.edgeless_select_tool(
                    crate::edgeless::EdgelessTool::Shape(crate::edgeless::ShapePreset::Rect),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.advance_clock(Duration::from_millis(240));
        hw.request_frame();
        assert!(app.update(|cx| {
            win.update(cx, |_, w, _| {
                w.frame_snapshot()
                    .elements
                    .contains_key("chrome.edgeless_toolbar.shape_picker")
            })
            .unwrap()
        }));

        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.edgeless_key_down(
                    &ui::KeyDownEvent {
                        keystroke: ui::Keystroke::parse("escape").unwrap(),
                        is_held: false,
                        prefer_character_input: false,
                    },
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.advance_clock(Duration::from_millis(240));
        hw.request_frame();
        assert!(!app.update(|cx| {
            win.update(cx, |_, w, _| {
                w.frame_snapshot()
                    .elements
                    .contains_key("chrome.edgeless_toolbar.shape_picker")
            })
            .unwrap()
        }));

        // 2. Open Shape picker, draw a rectangle on the canvas -> tool resets to Select and
        // shape picker fades out and unmounts after 230ms.
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.edgeless_select_tool(
                    crate::edgeless::EdgelessTool::Shape(crate::edgeless::ShapePreset::Rect),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.advance_clock(Duration::from_millis(240));
        hw.request_frame();
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.on_edgeless_left_down(
                    &MouseDownEvent {
                        button: MouseButton::Left,
                        position: point(px(300.0), px(300.0)),
                        modifiers: Modifiers::default(),
                        click_count: 1,
                        first_mouse: false,
                    },
                    w,
                    cx,
                );
                v.on_edgeless_pointer_move(
                    &MouseMoveEvent {
                        position: point(px(440.0), px(400.0)),
                        pressed_button: Some(MouseButton::Left),
                        modifiers: Modifiers::default(),
                    },
                    w,
                    cx,
                );
                v.on_edgeless_left_up(
                    &MouseUpEvent {
                        button: MouseButton::Left,
                        position: point(px(440.0), px(400.0)),
                        modifiers: Modifiers::default(),
                        click_count: 1,
                    },
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.advance_clock(Duration::from_millis(240));
        hw.request_frame();
        assert!(!app.update(|cx| {
            win.update(cx, |_, w, _| {
                w.frame_snapshot()
                    .elements
                    .contains_key("chrome.edgeless_toolbar.shape_picker")
            })
            .unwrap()
        }));
    }

    #[test]
    fn context_menu_closes_stale_table_cell_validates_async_paste_and_bounds_links() {
        let (platform, app, win, hw) = open_view(1280, 800, PlaygroundOptions::default());

        app.update(|cx| {
            win.update(cx, |v, _, cx| {
                let mut seeded = crate::showcase::seed_showcase_doc().unwrap();
                seeded
                    .workspace
                    .ensure_page(crate::HOME_PAGE_ID)
                    .unwrap()
                    .add_block(
                        "ctx-table",
                        blocksuite_playground_doc::schema::BlockSpec::Table {
                            rows: vec![vec!["Seed".into(), "ColB".into()]],
                        },
                        Some("showcase-note"),
                        None,
                        999,
                    )
                    .unwrap();
                v.set_document(seeded, cx);
            })
            .unwrap();
        });
        hw.request_frame();

        // 1. Focus an `affine:table` cell, then right-click `showcase-quote` and Paste:
        // stale table cell editor must close so Paste lands in `showcase-quote`, not the cell.
        let (table_id, row_id, col_id, quote_bounds) = app.update(|cx| {
            win.update(cx, |v, w, cx| {
                let snap = v.page_snapshot().unwrap();
                let (tid, rid, cid) = snap
                    .root
                    .as_ref()
                    .unwrap()
                    .children
                    .iter()
                    .flat_map(|n| std::iter::once(n).chain(n.children.iter()))
                    .find_map(|n| match &n.content {
                        blocksuite_playground_doc::read::BlockContent::Table(t) => {
                            let r = t.rows.first()?.row_id.clone();
                            let c = t.columns.first()?.column_id.clone();
                            Some((n.id.clone(), r, c))
                        }
                        _ => None,
                    })
                    .expect("showcase table block");
                v.focus_table_cell(tid.clone(), rid.clone(), cid.clone(), None, w, cx);
                assert!(v.active_table_cell().is_some());
                let qb = w.frame_snapshot().elements["page.block.showcase-quote"].bounds;
                (tid, rid, cid, qb)
            })
            .unwrap()
        });

        let cell_before = app.update(|cx| {
            win.update(cx, |v, _, _| {
                let snap = v.page_snapshot().unwrap();
                match &snap.block(&table_id).unwrap().content {
                    blocksuite_playground_doc::read::BlockContent::Table(t) => t.cells
                        [&(row_id.clone(), col_id.clone())]
                        .text
                        .plain
                        .clone(),
                    _ => unreachable!(),
                }
            })
            .unwrap()
        });

        app.update(|cx| {
            cx.write_to_clipboard(ui::ClipboardItem::new_string("QUOTE_TARGET".to_string()));
            win.update(cx, |v, w, cx| {
                v.dispatch_overlay(
                    OverlayEvent::OpenContextMenu {
                        x: quote_bounds.x + 16.0,
                        y: quote_bounds.y + quote_bounds.height * 0.5,
                    },
                    w,
                    cx,
                );
                assert!(
                    v.active_table_cell().is_none(),
                    "right-clicking outside table must close active table cell"
                );
                v.dispatch_overlay(
                    OverlayEvent::ContextMenuAction(ContextMenuAction::Paste),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.run_until_parked();
        hw.request_frame();
        let (cell_after, quote_after) = app.update(|cx| {
            win.update(cx, |v, _, _| {
                let snap = v.page_snapshot().unwrap();
                let cell_txt = match &snap.block(&table_id).unwrap().content {
                    blocksuite_playground_doc::read::BlockContent::Table(t) => t.cells
                        [&(row_id.clone(), col_id.clone())]
                        .text
                        .plain
                        .clone(),
                    _ => unreachable!(),
                };
                (
                    cell_txt,
                    v.block_text("showcase-quote").unwrap_or("").to_string(),
                )
            })
            .unwrap()
        });
        assert_eq!(cell_after, cell_before, "table cell must stay untouched");
        assert!(quote_after.contains("QUOTE_TARGET"));

        // 2. Async clipboard target binding:
        // (a) Moving selection before async completion drops the write;
        // (b) `set_document` / `set_mode` cancel `context_paste_task`;
        // (c) Unchanged selection writes into the bound target.
        let intro_before = app.update(|cx| {
            win.update(cx, |v, _, _| {
                v.block_text("showcase-intro").unwrap_or("").to_string()
            })
            .unwrap()
        });
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.select_document_range(
                    crate::editor_session::DocumentSelection::caret(
                        crate::editor_session::DocPoint::new("showcase-quote", 0),
                    ),
                    w,
                    cx,
                );
                let expected = v.capture_context_target().unwrap();
                let delayed = cx.background_executor().spawn({
                    let timer = cx.background_executor().timer(Duration::from_millis(30));
                    async move {
                        timer.await;
                        Ok(Some(ui::ClipboardItem::new_string(
                            "STALE_MOVE".to_string(),
                        )))
                    }
                });
                v.spawn_context_paste_task(delayed, expected, w, cx);
                // Move selection to `showcase-intro` before async clipboard resolves.
                v.select_document_range(
                    crate::editor_session::DocumentSelection::caret(
                        crate::editor_session::DocPoint::new("showcase-intro", 0),
                    ),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.advance_clock(Duration::from_millis(50));
        platform.run_until_parked();
        let (intro_after_move, quote_after_move) = app.update(|cx| {
            win.update(cx, |v, _, _| {
                (
                    v.block_text("showcase-intro").unwrap_or("").to_string(),
                    v.block_text("showcase-quote").unwrap_or("").to_string(),
                )
            })
            .unwrap()
        });
        assert_eq!(
            intro_after_move, intro_before,
            "moved selection must not receive async paste"
        );
        assert_eq!(
            quote_after_move, quote_after,
            "original target must not receive stale write"
        );

        // Unchanged target receives async paste cleanly, and set_mode / set_document clear task.
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.select_document_range(
                    crate::editor_session::DocumentSelection::caret(
                        crate::editor_session::DocPoint::new("showcase-quote", 0),
                    ),
                    w,
                    cx,
                );
                let expected = v.capture_context_target().unwrap();
                let delayed = cx.background_executor().spawn({
                    let timer = cx.background_executor().timer(Duration::from_millis(20));
                    async move {
                        timer.await;
                        Ok(Some(ui::ClipboardItem::new_string("ASYNC_OK".to_string())))
                    }
                });
                v.spawn_context_paste_task(delayed, expected, w, cx);
            })
            .unwrap();
        });
        platform.advance_clock(Duration::from_millis(30));
        platform.run_until_parked();
        let quote_async_ok = app.update(|cx| {
            win.update(cx, |v, _, _| {
                v.block_text("showcase-quote").unwrap_or("").to_string()
            })
            .unwrap()
        });
        assert!(quote_async_ok.starts_with("ASYNC_OK"));

        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                let expected = v.capture_context_target().unwrap();
                let delayed = cx.background_executor().spawn({
                    let timer = cx.background_executor().timer(Duration::from_millis(40));
                    async move {
                        timer.await;
                        Ok(Some(ui::ClipboardItem::new_string("CROSS_DOC".to_string())))
                    }
                });
                v.spawn_context_paste_task(delayed, expected, w, cx);
                assert!(v.context_paste_task.is_some());
                v.set_mode(PlaygroundMode::Edgeless, w, cx);
                assert!(
                    v.context_paste_task.is_none(),
                    "set_mode must cancel context_paste_task"
                );
                v.set_mode(PlaygroundMode::Page, w, cx);

                let expected2 = v.capture_context_target().unwrap();
                let delayed2 = cx.background_executor().spawn({
                    let timer = cx.background_executor().timer(Duration::from_millis(40));
                    async move {
                        timer.await;
                        Ok(Some(ui::ClipboardItem::new_string("CROSS_DOC".to_string())))
                    }
                });
                v.spawn_context_paste_task(delayed2, expected2, w, cx);
                assert!(v.context_paste_task.is_some());
                let fresh_doc = crate::showcase::seed_showcase_doc().unwrap();
                v.set_document(fresh_doc, cx);
                assert!(
                    v.context_paste_task.is_none(),
                    "set_document must cancel context_paste_task"
                );
            })
            .unwrap();
        });
        platform.advance_clock(Duration::from_millis(60));
        platform.run_until_parked();
        assert!(app.update(|cx| {
            win.update(cx, |v, _, _| {
                !v.block_text("showcase-intro")
                    .unwrap_or("")
                    .contains("CROSS_DOC")
            })
            .unwrap()
        }));

        // 3. Exact DecorationKind::Link bounds hit-testing in Edgeless Note:
        // clicking 0.5px left of `links` (in the right half of the preceding space) or 0.5px right
        // of `links` must NOT match `https://affine.pro`, while clicking inside `links` matches.
        let (_ep, e_app, e_win, e_hw) = open_view(
            1280,
            800,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                ..Default::default()
            },
        );
        e_hw.request_frame();
        let (before_space_hit, inside_hit, after_edge_hit) = e_app.update(|cx| {
            e_win
                .update(cx, |v, w, _| {
                    let note_id = v
                        .edgeless
                        .authoring
                        .painted_items
                        .iter()
                        .find(|i| i.kind == crate::edgeless::SpatialItemKind::Note)
                        .unwrap()
                        .id
                        .clone();
                    v.edgeless.authoring.inline_edit =
                        Some(crate::edgeless::EdgelessInlineEdit::SpatialBlock {
                            block_id: note_id.clone(),
                            is_note: true,
                            created_new: false,
                        });
                    let info = v
                        .edgeless
                        .authoring
                        .painted_items
                        .iter()
                        .find(|i| i.id == note_id)
                        .unwrap()
                        .clone();
                    let layout = v.edgeless.cached_block_layout(&note_id, true).unwrap();
                    let intro = layout
                        .blocks
                        .iter()
                        .find(|b| b.block_id == "showcase-intro")
                        .unwrap();
                    let text = intro.body.text.as_ref().unwrap();
                    let crate::block_flow::FlowTextLayout::Rich(rich) = &text.layout else {
                        panic!("expected rich layout");
                    };
                    let link_deco = rich
                        .inline_decorations()
                        .iter()
                        .find(|d| matches!(d.kind, crate::rich_text::DecorationKind::Link(_)))
                        .expect("link decoration");
                    let link_left = intro.x + text.x + f32::from(link_deco.bounds.origin.x);
                    let link_right = intro.x + text.x + f32::from(link_deco.bounds.right());
                    let link_mid_y = intro.y
                        + text.y
                        + f32::from(link_deco.bounds.origin.y)
                        + f32::from(link_deco.bounds.size.height) * 0.5;
                    let to_screen = |fx: f32, fy: f32| {
                        let wx =
                            info.rect.x + (fx + crate::edgeless::NOTE_CARD_PADDING) * info.scale;
                        let wy =
                            info.rect.y + (fy + crate::edgeless::NOTE_CARD_PADDING) * info.scale;
                        let vp_origin = point(px(0.0), px(crate::TOPBAR_HEIGHT));
                        let sp = v
                            .edgeless
                            .camera
                            .world_to_screen(point(px(wx), px(wy)), vp_origin);
                        (f32::from(sp.x), f32::from(sp.y))
                    };
                    let (sx_before, sy_before) = to_screen(link_left - 0.8, link_mid_y);
                    let (sx_inside, sy_inside) =
                        to_screen((link_left + link_right) * 0.5, link_mid_y);
                    let (sx_after, sy_after) = to_screen(link_right + 0.8, link_mid_y);
                    (
                        v.hit_link_url_at(sx_before, sy_before, w),
                        v.hit_link_url_at(sx_inside, sy_inside, w),
                        v.hit_link_url_at(sx_after, sy_after, w),
                    )
                })
                .unwrap()
        });
        assert_eq!(
            before_space_hit, None,
            "right half of space before link must not match link"
        );
        assert_eq!(inside_hit.as_deref(), Some("https://affine.pro"));
        assert_eq!(
            after_edge_hit, None,
            "point past link trailing edge must not match link"
        );
    }

    #[test]
    fn context_menu_overlay_dismiss_resumes_caret_blink_and_clears_ime_preedit() {
        use ui::EntityInputHandler as _;

        let (platform, app, win, hw) = open_view(1280, 800, PlaygroundOptions::default());

        // 1. Closing BookmarkPrompt / EquationEditor after >500ms resumes caret_blink_task
        // and resets phase to solid 1.0 (never leaving the body caret invisible at alpha 0).
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.select_document_range(
                    crate::editor_session::DocumentSelection::caret(
                        crate::editor_session::DocPoint::new("showcase-intro", 0),
                    ),
                    w,
                    cx,
                );
                v.dispatch_overlay(
                    OverlayEvent::KeyboardToolbar(crate::overlays::KeyboardToolbarAction::Bookmark),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.advance_clock(Duration::from_millis(700));
        platform.run_until_parked();
        assert!(app.update(|cx| {
            win.update(cx, |v, _, _| v.caret_blink_task.is_none())
                .unwrap()
        }));

        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.dispatch_overlay(OverlayEvent::CloseBookmarkPrompt, w, cx);
            })
            .unwrap();
        });
        let (has_task, alpha_after_close) = app.update(|cx| {
            win.update(cx, |v, _, cx| {
                (
                    v.caret_blink_task.is_some(),
                    v.caret_blink_alpha(v.now_ms(cx)),
                )
            })
            .unwrap()
        });
        assert!(
            has_task,
            "closing BookmarkPrompt must restart caret_blink_task"
        );
        assert_eq!(alpha_after_close, 1.0, "caret must be solid 1.0 on resume");

        platform.advance_clock(Duration::from_millis(550));
        platform.run_until_parked();
        assert_eq!(
            app.update(|cx| win
                .update(cx, |v, _, cx| v.caret_blink_alpha(v.now_ms(cx)))
                .unwrap()),
            0.0
        );

        // Same invariant for OpenEquationEditor -> CloseEquationEditor.
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.dispatch_overlay(
                    OverlayEvent::OpenEquationEditor {
                        target: crate::overlays::EquationTarget::Inline {
                            block_id: "showcase-intro".to_string(),
                            utf16_offset: 0,
                        },
                        initial: "x^2".to_string(),
                    },
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.advance_clock(Duration::from_millis(700));
        platform.run_until_parked();
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.dispatch_overlay(OverlayEvent::CloseEquationEditor, w, cx);
            })
            .unwrap();
        });
        assert!(app.update(|cx| {
            win.update(cx, |v, _, cx| {
                v.caret_blink_task.is_some() && v.caret_blink_alpha(v.now_ms(cx)) == 1.0
            })
            .unwrap()
        }));

        // 2. Right-clicking another block while IME preedit is active clears preedit via
        // `change_selection` so composition never dangles in the old block.
        hw.request_frame();
        let bullet_bounds = app.update(|cx| {
            win.update(cx, |_, w, _| {
                w.frame_snapshot().elements["page.block.showcase-bullet"].bounds
            })
            .unwrap()
        });
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.select_document_range(
                    crate::editor_session::DocumentSelection::caret(
                        crate::editor_session::DocPoint::new("showcase-quote", 0),
                    ),
                    w,
                    cx,
                );
                v.replace_and_mark_text_in_range(None, "ni", Some(0..2), w, cx);
                assert!(v.editor.composing());
                v.dispatch_overlay(
                    OverlayEvent::OpenContextMenu {
                        x: bullet_bounds.x + 24.0,
                        y: bullet_bounds.y + bullet_bounds.height * 0.5,
                    },
                    w,
                    cx,
                );
                assert!(
                    !v.editor.composing(),
                    "right-clicking another block must clear active IME preedit"
                );
                assert_eq!(
                    v.editor
                        .selection
                        .as_ref()
                        .map(|s| s.focus.block_id.as_str()),
                    Some("showcase-bullet")
                );
            })
            .unwrap();
        });

        // Optional deterministic evidence exporter (`BS_RENDER_EVIDENCE_DIR=/path/to/out`).
        if let Some(out_dir) = std::env::var_os("BS_RENDER_EVIDENCE_DIR") {
            let out_dir = std::path::PathBuf::from(out_dir);
            std::fs::create_dir_all(&out_dir).unwrap();
            for (theme, suffix) in [
                (crate::PlaygroundTheme::Light, "light"),
                (crate::PlaygroundTheme::Dark, "dark"),
            ] {
                let (tp, tapp, twin, thw) = open_view(
                    1280,
                    800,
                    PlaygroundOptions {
                        theme,
                        ..Default::default()
                    },
                );
                thw.request_frame();
                let sb_img = tapp.update(|cx| {
                    twin.update(cx, |_, w, _| w.render_to_image().unwrap())
                        .unwrap()
                });
                sb_img
                    .save(out_dir.join(format!("after-scrollbar-{suffix}.png")))
                    .unwrap();

                tapp.update(|cx| {
                    twin.update(cx, |v, w, cx| {
                        let intro = v.block_text("showcase-intro").unwrap_or("").to_string();
                        let pos = intro.find("links").unwrap();
                        let u16_off = intro[..pos].encode_utf16().count() as u64;
                        let layout = v.flow_layout().unwrap();
                        let blk = layout
                            .blocks
                            .iter()
                            .find(|b| b.block_id == "showcase-intro")
                            .unwrap();
                        let r = blk
                            .caret_rect(crate::rich_text::CaretPosition {
                                utf16_offset: u16_off + 2,
                                affinity: crate::rich_text::WrapAffinity::Downstream,
                            })
                            .unwrap();
                        let geom =
                            crate::block_flow::page_geometry(f32::from(w.viewport_size().width));
                        v.select_document_range(
                            crate::editor_session::DocumentSelection {
                                anchor: crate::editor_session::DocPoint::new(
                                    "showcase-intro",
                                    u16_off,
                                ),
                                focus: crate::editor_session::DocPoint::new(
                                    "showcase-intro",
                                    u16_off + 5,
                                ),
                            },
                            w,
                            cx,
                        );
                        v.dispatch_overlay(
                            OverlayEvent::OpenContextMenu {
                                x: geom.column_x + r.x,
                                y: crate::TOPBAR_HEIGHT - v.scroll_y + r.y + r.h * 0.5,
                            },
                            w,
                            cx,
                        );
                    })
                    .unwrap();
                });
                tp.advance_clock(Duration::from_millis(160));
                thw.request_frame();
                let ctx_img = tapp.update(|cx| {
                    twin.update(cx, |_, w, _| w.render_to_image().unwrap())
                        .unwrap()
                });
                ctx_img
                    .save(out_dir.join(format!("after-context-menu-{suffix}.png")))
                    .unwrap();
            }
        }
    }

    #[test]
    fn context_menu_resolves_bookmark_table_preedit_and_multiline_shape_label_by_coords() {
        use ui::EntityInputHandler as _;

        let (platform, app, win, hw) = open_view(1280, 800, PlaygroundOptions::default());
        app.update(|cx| {
            win.update(cx, |v, _, cx| {
                let mut seeded = crate::showcase::seed_showcase_doc().unwrap();
                seeded
                    .workspace
                    .ensure_page(crate::HOME_PAGE_ID)
                    .unwrap()
                    .add_block(
                        "ctx-table-2",
                        blocksuite_playground_doc::schema::BlockSpec::Table {
                            rows: vec![vec!["CellA".into(), "CellB".into()]],
                        },
                        Some("showcase-note"),
                        Some(2),
                        999,
                    )
                    .unwrap();
                v.set_document(seeded, cx);
            })
            .unwrap();
        });
        hw.request_frame();

        // 1. Select `This` in `showcase-intro`, then right-click `showcase-bookmark` and dispatch Cut:
        // `showcase-intro` must remain intact and clipboard must NOT receive `This`.
        let intro_orig = app.update(|cx| {
            win.update(cx, |v, _, _| {
                v.block_text("showcase-intro").unwrap_or("").to_string()
            })
            .unwrap()
        });
        app.update(|cx| {
            cx.write_to_clipboard(ui::ClipboardItem::new_string("SENTINEL".to_string()));
            win.update(cx, |v, w, cx| {
                v.select_document_range(
                    crate::editor_session::DocumentSelection {
                        anchor: crate::editor_session::DocPoint::new("showcase-intro", 0),
                        focus: crate::editor_session::DocPoint::new("showcase-intro", 4),
                    },
                    w,
                    cx,
                );
                let layout = v.flow_layout().unwrap();
                let bm = layout
                    .blocks
                    .iter()
                    .find(|b| b.block_id == "showcase-bookmark")
                    .unwrap();
                let geom = crate::block_flow::page_geometry(f32::from(w.viewport_size().width));
                let bm_sx = geom.column_x + bm.x + 24.0;
                let bm_sy = crate::TOPBAR_HEIGHT - v.scroll_y + bm.y + 16.0;
                v.page_right_mouse_down(
                    &MouseDownEvent {
                        button: MouseButton::Right,
                        position: point(px(bm_sx), px(bm_sy)),
                        modifiers: Modifiers::default(),
                        click_count: 1,
                        first_mouse: false,
                    },
                    w,
                    cx,
                );
                v.dispatch_overlay(
                    OverlayEvent::ContextMenuAction(ContextMenuAction::Cut),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.run_until_parked();
        hw.request_frame();
        let (intro_after_bm, clip_after_bm) = app.update(|cx| {
            let clip = cx.read_from_clipboard().and_then(|c| c.text());
            let txt = win
                .update(cx, |v, _, _| {
                    v.block_text("showcase-intro").unwrap_or("").to_string()
                })
                .unwrap();
            (txt, clip)
        });
        assert_eq!(
            intro_after_bm, intro_orig,
            "right-click Bookmark + Cut must never delete distant body selection"
        );
        assert_eq!(clip_after_bm.as_deref(), Some("SENTINEL"));

        // 2. Composing `PREEDITXYZ` in `showcase-intro`, then right-clicking `ctx-table-2` cell:
        // body composition must clear immediately and not remain visible on screen.
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.select_document_range(
                    crate::editor_session::DocumentSelection::caret(
                        crate::editor_session::DocPoint::new("showcase-intro", 0),
                    ),
                    w,
                    cx,
                );
                v.replace_and_mark_text_in_range(None, "PREEDITXYZ", None, w, cx);
                assert!(v.editor.composing());
                let layout = v.flow_layout().unwrap();
                let tbl = layout
                    .blocks
                    .iter()
                    .find(|b| b.block_id == "ctx-table-2")
                    .unwrap();
                let cell = tbl.body.table_cells.first().unwrap();
                let geom = crate::block_flow::page_geometry(f32::from(w.viewport_size().width));
                let cx_s = geom.column_x + tbl.x + cell.rect.x + 12.0;
                let cy_s = crate::TOPBAR_HEIGHT - v.scroll_y + tbl.y + cell.rect.y + 10.0;
                v.page_right_mouse_down(
                    &MouseDownEvent {
                        button: MouseButton::Right,
                        position: point(px(cx_s), px(cy_s)),
                        modifiers: Modifiers::default(),
                        click_count: 1,
                        first_mouse: false,
                    },
                    w,
                    cx,
                );
                assert!(v.active_table_cell().is_some());
                assert!(
                    !v.editor.composing(),
                    "switching to table cell via right-click must commit body preedit"
                );
                assert!(
                    v.block_text("showcase-intro")
                        .is_some_and(|t| t.starts_with("PREEDITXYZ")),
                    "body preedit must commit in place when focusing table cell"
                );
            })
            .unwrap();
        });
        hw.request_frame();
        let intro_rendered = app.update(|cx| {
            win.update(cx, |_, w, _| {
                w.frame_snapshot()
                    .elements
                    .get("page.block.showcase-intro")
                    .and_then(|e| e.text.clone())
                    .unwrap_or_default()
            })
            .unwrap()
        });
        assert!(
            intro_rendered.starts_with("PREEDITXYZ"),
            "committed preedit must render as normal body text after focusing table cell: {intro_rendered:?}"
        );

        // 3. Two-line Edgeless shape label (`first line\nsecond line`): with `second` (`11..17`)
        // selected, right-clicking at line 1 start places caret at offset `0` (matching left-click)
        // so Paste inserts on line 1 instead of replacing `second`.
        let (ep, e_app, e_win, e_hw) = open_view(
            1280,
            800,
            PlaygroundOptions {
                mode: PlaygroundMode::Edgeless,
                ..Default::default()
            },
        );
        e_hw.request_frame();
        e_app.update(|cx| {
            cx.write_to_clipboard(ui::ClipboardItem::new_string("MARK ".to_string()));
            e_win
                .update(cx, |v, w, cx| {
                    let shape_id = v
                        .edgeless
                        .authoring
                        .painted_items
                        .iter()
                        .find(|i| i.kind == crate::edgeless::SpatialItemKind::Shape)
                        .unwrap()
                        .id
                        .clone();
                    assert!(v.edgeless_begin_inline_edit(&shape_id, w, cx));
                    if let Some(ed) = v.edgeless.authoring.label_editor_mut() {
                        ed.input.text = "first line\nsecond line".to_string();
                        ed.select(11..17);
                    }
                    let b = v.edgeless_label_layout_screen_bounds(w).unwrap();
                    let sx = f32::from(b.origin.x) + 4.0;
                    let sy = f32::from(b.origin.y) + 4.0;
                    let (left_off, in_sel) = v.hit_label_editor_at(sx, sy, w).unwrap();
                    assert_eq!((left_off, in_sel), (0, false));
                    v.edgeless_right_mouse_down(
                        &MouseDownEvent {
                            button: MouseButton::Right,
                            position: point(px(sx), px(sy)),
                            modifiers: Modifiers::default(),
                            click_count: 1,
                            first_mouse: false,
                        },
                        w,
                        cx,
                    );
                    assert_eq!(
                        v.edgeless.authoring.label_editor().unwrap().input.selection,
                        0..0,
                        "right-clicking line 1 outside line-2 selection must move caret to line 1"
                    );
                    v.dispatch_overlay(
                        OverlayEvent::ContextMenuAction(ContextMenuAction::Paste),
                        w,
                        cx,
                    );
                })
                .unwrap();
        });
        ep.run_until_parked();
        e_hw.request_frame();
        let label_after = e_app.update(|cx| {
            e_win
                .update(cx, |v, _, _| {
                    v.edgeless
                        .authoring
                        .label_editor()
                        .unwrap()
                        .input
                        .text
                        .clone()
                })
                .unwrap()
        });
        assert_eq!(label_after, "MARK first line\nsecond line");

        // 4. Remote collaborator inserting `PEER ` before local selection while context menu is
        // open shifts local UTF-16 offsets via `relative_selection` without invalidating Copy/Paste.
        app.update(|cx| {
            cx.write_to_clipboard(ui::ClipboardItem::new_string("OLD".to_string()));
            win.update(cx, |v, w, cx| {
                v.select_document_range(
                    crate::editor_session::DocumentSelection {
                        anchor: crate::editor_session::DocPoint::new("showcase-quote", 6),
                        focus: crate::editor_session::DocPoint::new("showcase-quote", 11),
                    },
                    w,
                    cx,
                );
                let layout = v.flow_layout().unwrap();
                let blk = layout
                    .blocks
                    .iter()
                    .find(|b| b.block_id == "showcase-quote")
                    .unwrap();
                let r = blk
                    .caret_rect(crate::rich_text::CaretPosition {
                        utf16_offset: 8,
                        affinity: crate::rich_text::WrapAffinity::Downstream,
                    })
                    .unwrap();
                let geom = crate::block_flow::page_geometry(f32::from(w.viewport_size().width));
                v.dispatch_overlay(
                    OverlayEvent::OpenContextMenu {
                        x: geom.column_x + r.x,
                        y: crate::TOPBAR_HEIGHT - v.scroll_y + r.y + r.h * 0.5,
                    },
                    w,
                    cx,
                );
                // Simulate remote peer prepending `PEER ` at offset 0 of `showcase-quote`.
                let mut peer_doc =
                    blocksuite_playground_doc::session::PageDocSession::new("peer-q", 404).unwrap();
                peer_doc
                    .apply_remote_update_v1(&v.page().unwrap().encode_update_v1().unwrap())
                    .unwrap();
                let peer_delta = peer_doc
                    .insert_text("showcase-quote", "prop:text", 0, "PEER ", 500)
                    .unwrap()
                    .unwrap()
                    .update;
                v.edit_document(cx, |doc| {
                    doc.workspace
                        .page_mut(crate::HOME_PAGE_ID)
                        .unwrap()
                        .apply_remote_update_v1(&peer_delta)
                        .unwrap();
                });
                v.dispatch_overlay(
                    OverlayEvent::ContextMenuAction(ContextMenuAction::Copy),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        assert_eq!(
            app.update(|cx| cx.read_from_clipboard().and_then(|c| c.text()))
                .as_deref(),
            Some("block"),
            "remote peer edit before selection must not break open context menu Copy"
        );
    }

    #[test]
    fn context_menu_targets_block_selection_margin_atomic_sync_undo_and_overlay_cancel() {
        let (platform, app, win, hw) = open_view(1280, 800, PlaygroundOptions::default());
        hw.request_frame();

        let (orig_title, orig_h1, orig_intro, orig_quote) = app.update(|cx| {
            win.update(cx, |v, _, _| {
                (
                    v.block_text("showcase-page").unwrap_or("").to_string(),
                    v.block_text("showcase-h1").unwrap_or("").to_string(),
                    v.block_text("showcase-intro").unwrap_or("").to_string(),
                    v.block_text("showcase-quote").unwrap_or("").to_string(),
                )
            })
            .unwrap()
        });

        // 1. Whole-block `BlockSelection(["showcase-quote"])` + right-click `showcase-quote` + Paste:
        // replaces `showcase-quote` content in place and never mutates `showcase-h1` or other blocks.
        app.update(|cx| {
            cx.write_to_clipboard(ui::ClipboardItem::new_string("BLOCK_PASTE".to_string()));
            win.update(cx, |v, w, cx| {
                v.editor.selection = None;
                v.editor.block_selection = vec!["showcase-quote".to_string()];
                let qb = w.frame_snapshot().elements["page.block.showcase-quote"].bounds;
                v.page_right_mouse_down(
                    &MouseDownEvent {
                        button: MouseButton::Right,
                        position: point(px(qb.x + 24.0), px(qb.y + qb.height * 0.5)),
                        modifiers: Modifiers::default(),
                        click_count: 1,
                        first_mouse: false,
                    },
                    w,
                    cx,
                );
                v.dispatch_overlay(
                    OverlayEvent::ContextMenuAction(ContextMenuAction::Paste),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.run_until_parked();
        hw.request_frame();
        let (t1, h1_1, i1, q1) = app.update(|cx| {
            win.update(cx, |v, _, _| {
                (
                    v.block_text("showcase-page").unwrap_or("").to_string(),
                    v.block_text("showcase-h1").unwrap_or("").to_string(),
                    v.block_text("showcase-intro").unwrap_or("").to_string(),
                    v.block_text("showcase-quote").unwrap_or("").to_string(),
                )
            })
            .unwrap()
        });
        assert_eq!(t1, orig_title);
        assert_eq!(
            h1_1, orig_h1,
            "BlockSelection paste must never write into showcase-h1"
        );
        assert_eq!(i1, orig_intro);
        assert_eq!(q1, "BLOCK_PASTE");

        // 2. Right-clicking blank page margin `(16, quote_y)` beside `showcase-quote` + Paste:
        // positions caret at `showcase-quote` start (matching left-click) and never writes `showcase-h1`.
        app.update(|cx| {
            cx.write_to_clipboard(ui::ClipboardItem::new_string("MARGIN_".to_string()));
            win.update(cx, |v, w, cx| {
                v.clear_body_selection(w, cx);
                let qb = w.frame_snapshot().elements["page.block.showcase-quote"].bounds;
                v.page_right_mouse_down(
                    &MouseDownEvent {
                        button: MouseButton::Right,
                        position: point(px(16.0), px(qb.y + qb.height * 0.5)),
                        modifiers: Modifiers::default(),
                        click_count: 1,
                        first_mouse: false,
                    },
                    w,
                    cx,
                );
                v.dispatch_overlay(
                    OverlayEvent::ContextMenuAction(ContextMenuAction::Paste),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.run_until_parked();
        hw.request_frame();
        let (h1_2, q2) = app.update(|cx| {
            win.update(cx, |v, _, _| {
                (
                    v.block_text("showcase-h1").unwrap_or("").to_string(),
                    v.block_text("showcase-quote").unwrap_or("").to_string(),
                )
            })
            .unwrap()
        });
        assert_eq!(
            h1_2, orig_h1,
            "margin right-click Paste must never write into showcase-h1"
        );
        assert_eq!(q2, "MARGIN_BLOCK_PASTE");

        // 3. Selecting trailing `"PASTE"` (`13..18`), then right-clicking empty line-end space
        // far to the right (`x = 1006`) and dispatching Cut must collapse selection and preserve text.
        app.update(|cx| {
            cx.write_to_clipboard(ui::ClipboardItem::new_string("KEEP_CLIP".to_string()));
            win.update(cx, |v, w, cx| {
                let len = v
                    .block_text("showcase-quote")
                    .unwrap()
                    .encode_utf16()
                    .count() as u64;
                v.select_document_range(
                    crate::editor_session::DocumentSelection {
                        anchor: crate::editor_session::DocPoint::new("showcase-quote", len - 5),
                        focus: crate::editor_session::DocPoint::new("showcase-quote", len),
                    },
                    w,
                    cx,
                );
                let qb = w.frame_snapshot().elements["page.block.showcase-quote"].bounds;
                v.page_right_mouse_down(
                    &MouseDownEvent {
                        button: MouseButton::Right,
                        position: point(px(1006.0), px(qb.y + qb.height * 0.5)),
                        modifiers: Modifiers::default(),
                        click_count: 1,
                        first_mouse: false,
                    },
                    w,
                    cx,
                );
                v.dispatch_overlay(
                    OverlayEvent::ContextMenuAction(ContextMenuAction::Cut),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.run_until_parked();
        hw.request_frame();
        let (clip_3, q3) = app.update(|cx| {
            let clip = cx.read_from_clipboard().and_then(|c| c.text());
            let txt = win
                .update(cx, |v, _, _| {
                    v.block_text("showcase-quote").unwrap_or("").to_string()
                })
                .unwrap();
            (clip, txt)
        });
        assert_eq!(clip_3.as_deref(), Some("KEEP_CLIP"));
        assert_eq!(
            q3, "MARGIN_BLOCK_PASTE",
            "right-clicking empty whitespace past line end must not preserve selection for Cut"
        );

        // 4. Async Paste in flight when `Ctrl+K` link bar or Bookmark prompt opens before 30ms:
        // neither the newly opened overlay input nor the body blocks receive the delayed marker.
        for open_bookmark in [false, true] {
            app.update(|cx| {
                win.update(cx, |v, w, cx| {
                    v.dismiss_overlay_text_fields(w, cx);
                    v.select_document_range(
                        crate::editor_session::DocumentSelection {
                            anchor: crate::editor_session::DocPoint::new("showcase-quote", 0),
                            focus: crate::editor_session::DocPoint::new("showcase-quote", 6),
                        },
                        w,
                        cx,
                    );
                    let expected = v.capture_context_target().unwrap();
                    let delayed = cx.background_executor().spawn({
                        let timer = cx.background_executor().timer(Duration::from_millis(30));
                        async move {
                            timer.await;
                            Ok(Some(ui::ClipboardItem::new_string(
                                "LEAK_MARKER".to_string(),
                            )))
                        }
                    });
                    v.spawn_context_paste_task(delayed, expected, w, cx);
                    if open_bookmark {
                        v.dispatch_overlay(
                            OverlayEvent::OpenBookmarkPrompt {
                                block_id: "showcase-quote".to_string(),
                            },
                            w,
                            cx,
                        );
                    } else {
                        v.open_link_bar_shortcut(w, cx);
                    }
                    assert!(v.overlays.active_text_field().is_some());
                })
                .unwrap();
            });
            platform.advance_clock(Duration::from_millis(50));
            platform.run_until_parked();
            let (field_txt, q_after, h1_after, intro_after) = app.update(|cx| {
                win.update(cx, |v, _, _| {
                    (
                        v.overlays
                            .active_text_field()
                            .map(|f| f.text().to_string())
                            .unwrap_or_default(),
                        v.block_text("showcase-quote").unwrap_or("").to_string(),
                        v.block_text("showcase-h1").unwrap_or("").to_string(),
                        v.block_text("showcase-intro").unwrap_or("").to_string(),
                    )
                })
                .unwrap()
            });
            assert_eq!(
                field_txt, "",
                "delayed context-menu paste must never leak into newly opened overlay input (bookmark={open_bookmark})"
            );
            assert_eq!(q_after, "MARGIN_BLOCK_PASTE");
            assert_eq!(h1_after, orig_h1);
            assert_eq!(intro_after, orig_intro);
        }

        // 5. Mixed `BlockSelection(["showcase-quote", "showcase-bookmark"])` + Paste:
        // emits a single atomic `DocMessage::Update` (converging a remote peer on both the
        // replaced text and the deleted trailing bookmark) and restores both in ONE Undo step.
        let outbox: std::rc::Rc<std::cell::RefCell<Vec<(String, Vec<u8>)>>> =
            std::rc::Rc::new(std::cell::RefCell::new(Vec::new()));
        let sink = outbox.clone();
        let mut peer_doc =
            blocksuite_playground_doc::session::PageDocSession::new("peer-mix", 707).unwrap();
        app.update(|cx| {
            cx.write_to_clipboard(ui::ClipboardItem::new_string("MIXED_ATOMIC".to_string()));
            win.update(cx, |v, w, cx| {
                v.dismiss_overlay_text_fields(w, cx);
                peer_doc
                    .apply_remote_update_v1(&v.page().unwrap().encode_update_v1().unwrap())
                    .unwrap();
                assert!(
                    peer_doc
                        .read_page_snapshot()
                        .unwrap()
                        .block("showcase-bookmark")
                        .is_some()
                );
                let (_tx, rx) = async_channel::unbounded();
                let link = crate::room_client::RoomLink::from_parts(rx, move |cmd| {
                    if let crate::room_client::RoomCommand::Send(
                        crate::room_client::RoomFrame::Binary(bytes),
                    ) = cmd
                        && let Ok(blocksuite_playground_doc::wire::RoomBinaryFrame::Doc {
                            doc_id,
                            message: blocksuite_playground_doc::wire::DocMessage::Update(update),
                        }) = blocksuite_playground_doc::wire::decode_binary_frame(&bytes)
                    {
                        sink.borrow_mut().push((doc_id, update));
                    }
                });
                let room_name = v.document().workspace.room().to_string();
                v.room = Some(crate::view_room::RoomRuntime {
                    config: crate::room_client::RoomConfig::new(
                        &room_name,
                        Some("ws://127.0.0.1:1"),
                    ),
                    link,
                    protocol: crate::room_client::RoomProtocol::new(&room_name),
                    error: None,
                });
                v.editor.selection = None;
                v.editor.block_selection = vec![
                    "showcase-quote".to_string(),
                    "showcase-bookmark".to_string(),
                ];
                let qb = w.frame_snapshot().elements["page.block.showcase-quote"].bounds;
                v.page_right_mouse_down(
                    &MouseDownEvent {
                        button: MouseButton::Right,
                        position: point(px(qb.x + 24.0), px(qb.y + qb.height * 0.5)),
                        modifiers: Modifiers::default(),
                        click_count: 1,
                        first_mouse: false,
                    },
                    w,
                    cx,
                );
                v.dispatch_overlay(
                    OverlayEvent::ContextMenuAction(ContextMenuAction::Paste),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        platform.run_until_parked();
        hw.request_frame();
        {
            let sent = outbox.borrow();
            assert_eq!(
                sent.len(),
                1,
                "mixed BlockSelection paste must broadcast one atomic DocMessage::Update"
            );
            peer_doc.apply_remote_update_v1(&sent[0].1).unwrap();
        }
        let peer_snap = peer_doc.read_page_snapshot().unwrap();
        assert!(
            peer_snap.block("showcase-bookmark").is_none(),
            "remote peer must delete trailing non-editable block from broadcasted commit"
        );
        assert_eq!(
            peer_doc
                .read_editable_text("showcase-quote")
                .unwrap()
                .0
                .plain,
            "MIXED_ATOMIC"
        );

        // Single Undo + Redo round-trip restores/re-applies both `showcase-quote` and
        // `showcase-bookmark` on both local and remote peer.
        outbox.borrow_mut().clear();
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.history(false, w, cx).unwrap();
            })
            .unwrap();
        });
        {
            let sent = outbox.borrow();
            assert_eq!(sent.len(), 1);
            peer_doc.apply_remote_update_v1(&sent[0].1).unwrap();
        }
        let (q_undo, bm_restored) = app.update(|cx| {
            win.update(cx, |v, _, _| {
                (
                    v.block_text("showcase-quote").unwrap_or("").to_string(),
                    v.page_snapshot()
                        .and_then(|s| s.block("showcase-bookmark"))
                        .is_some(),
                )
            })
            .unwrap()
        });
        assert_eq!(q_undo, "MARGIN_BLOCK_PASTE");
        assert!(
            bm_restored
                && peer_doc
                    .read_page_snapshot()
                    .unwrap()
                    .block("showcase-bookmark")
                    .is_some(),
            "single Undo must atomically restore deleted trailing block on both local and peer"
        );
        outbox.borrow_mut().clear();
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.history(true, w, cx).unwrap();
            })
            .unwrap();
        });
        {
            let sent = outbox.borrow();
            assert_eq!(sent.len(), 1);
            peer_doc.apply_remote_update_v1(&sent[0].1).unwrap();
        }
        assert!(
            peer_doc
                .read_page_snapshot()
                .unwrap()
                .block("showcase-bookmark")
                .is_none()
        );
        assert_eq!(
            peer_doc
                .read_editable_text("showcase-quote")
                .unwrap()
                .0
                .plain,
            "MIXED_ATOMIC"
        );
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.history(false, w, cx).unwrap();
            })
            .unwrap();
        });

        // 6. Concurrent collaborator insertion between selected blocks `[A, B, C]`:
        // unselected `X = "COLLABORATOR"` inserted between `A` and `B` must survive Paste!
        app.update(|cx| {
            win.update(cx, |v, _, cx| {
                v.edit_document(cx, |doc| {
                    let page = doc.workspace.page_mut(crate::HOME_PAGE_ID).unwrap();
                    page.add_block(
                        "gap-a",
                        blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                            paragraph_type: blocksuite_playground_doc::schema::ParagraphType::Text,
                            text: "AAA".into(),
                        },
                        Some("showcase-note"),
                        Some(0),
                        1100,
                    )
                    .unwrap();
                    page.add_block(
                        "gap-b",
                        blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                            paragraph_type: blocksuite_playground_doc::schema::ParagraphType::Text,
                            text: "BBB".into(),
                        },
                        Some("showcase-note"),
                        Some(1),
                        1101,
                    )
                    .unwrap();
                    page.add_block(
                        "gap-c",
                        blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                            paragraph_type: blocksuite_playground_doc::schema::ParagraphType::Text,
                            text: "CCC".into(),
                        },
                        Some("showcase-note"),
                        Some(2),
                        1102,
                    )
                    .unwrap();
                });
                v.editor.selection = None;
                v.editor.block_selection = vec!["gap-a".into(), "gap-b".into(), "gap-c".into()];
                let mut collab =
                    blocksuite_playground_doc::session::PageDocSession::new("collab-gap", 808)
                        .unwrap();
                collab
                    .apply_remote_update_v1(&v.page().unwrap().encode_update_v1().unwrap())
                    .unwrap();
                let collab_delta = collab
                    .add_block(
                        "gap-x",
                        blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                            paragraph_type: blocksuite_playground_doc::schema::ParagraphType::Text,
                            text: "COLLABORATOR".into(),
                        },
                        Some("showcase-note"),
                        Some(1),
                        1103,
                    )
                    .unwrap()
                    .unwrap()
                    .update;
                v.edit_document(cx, |doc| {
                    doc.workspace
                        .page_mut(crate::HOME_PAGE_ID)
                        .unwrap()
                        .apply_remote_update_v1(&collab_delta)
                        .unwrap();
                });
            })
            .unwrap();
        });
        hw.request_frame();
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                use ui::EntityInputHandler as _;
                v.paste(
                    ui::ClipboardItem::new_string("GAP_PASTED".to_string()),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        hw.request_frame();
        let (gap_a, gap_x, gap_b_gone, gap_c_gone) = app.update(|cx| {
            win.update(cx, |v, _, _| {
                let s = v.page_snapshot().unwrap();
                (
                    v.block_text("gap-a").unwrap_or("").to_string(),
                    v.block_text("gap-x").unwrap_or("").to_string(),
                    s.block("gap-b").is_none(),
                    s.block("gap-c").is_none(),
                )
            })
            .unwrap()
        });
        assert_eq!(gap_a, "GAP_PASTED");
        assert_eq!(
            gap_x, "COLLABORATOR",
            "unselected collaborator block between selected blocks must survive BlockSelection paste"
        );
        assert!(gap_b_gone && gap_c_gone);

        // 7. Leading non-editable block `[Divider, "MID", "LAST"]` + Paste:
        // replaces all 3 selected blocks in one atomic commit, and 1 Undo + 1 Redo round-trips.
        outbox.borrow_mut().clear();
        let mut peer_div =
            blocksuite_playground_doc::session::PageDocSession::new("peer-div", 909).unwrap();
        app.update(|cx| {
            win.update(cx, |v, w, cx| {
                v.edit_document(cx, |doc| {
                    let page = doc.workspace.page_mut(crate::HOME_PAGE_ID).unwrap();
                    page.add_block(
                        "div-first",
                        blocksuite_playground_doc::schema::BlockSpec::Divider,
                        Some("showcase-note"),
                        Some(0),
                        1200,
                    )
                    .unwrap();
                    page.add_block(
                        "div-mid",
                        blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                            paragraph_type: blocksuite_playground_doc::schema::ParagraphType::Text,
                            text: "MID".into(),
                        },
                        Some("showcase-note"),
                        Some(1),
                        1201,
                    )
                    .unwrap();
                    page.add_block(
                        "div-last",
                        blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                            paragraph_type: blocksuite_playground_doc::schema::ParagraphType::Text,
                            text: "LAST".into(),
                        },
                        Some("showcase-note"),
                        Some(2),
                        1202,
                    )
                    .unwrap();
                });
                peer_div
                    .apply_remote_update_v1(&v.page().unwrap().encode_update_v1().unwrap())
                    .unwrap();
                outbox.borrow_mut().clear();
                v.editor.selection = None;
                v.editor.block_selection =
                    vec!["div-first".into(), "div-mid".into(), "div-last".into()];
                use ui::EntityInputHandler as _;
                v.paste(
                    ui::ClipboardItem::new_string("AFTER_DIV_REPLACE".to_string()),
                    w,
                    cx,
                );
            })
            .unwrap();
        });
        hw.request_frame();
        {
            let sent = outbox.borrow();
            assert_eq!(sent.len(), 1);
            peer_div.apply_remote_update_v1(&sent[0].1).unwrap();
        }
        let ps = peer_div.read_page_snapshot().unwrap();
        assert!(
            ps.block("div-first").is_none()
                && ps.block("div-mid").is_none()
                && ps.block("div-last").is_none()
        );
        outbox.borrow_mut().clear();
        app.update(|cx| {
            win.update(cx, |v, w, cx| v.history(false, w, cx).unwrap())
                .unwrap();
        });
        {
            let sent = outbox.borrow();
            assert_eq!(sent.len(), 1);
            peer_div.apply_remote_update_v1(&sent[0].1).unwrap();
        }
        let ps_undo = peer_div.read_page_snapshot().unwrap();
        assert!(
            ps_undo.block("div-first").is_some()
                && ps_undo.block("div-mid").is_some()
                && ps_undo.block("div-last").is_some(),
            "single Undo must restore leading Divider + trailing paragraphs on both local and peer"
        );
        outbox.borrow_mut().clear();
        app.update(|cx| {
            win.update(cx, |v, w, cx| v.history(true, w, cx).unwrap())
                .unwrap();
        });
        {
            let sent = outbox.borrow();
            assert_eq!(sent.len(), 1);
            peer_div.apply_remote_update_v1(&sent[0].1).unwrap();
        }
        let ps_redo = peer_div.read_page_snapshot().unwrap();
        assert!(
            ps_redo.block("div-first").is_none()
                && ps_redo.block("div-mid").is_none()
                && ps_redo.block("div-last").is_none(),
            "single Redo must re-apply replacement on both local and peer"
        );

        // 7b. Fresh showcase window:
        // - Right-clicking Page left margin (`x = 16`) beside non-editable `showcase-bookmark`
        //   resolves as `NonEditableSurface` (`can_paste == false`) rather than jumping into `showcase-code`.
        // - Full-document showcase BlockSelection (ending in `showcase-database` and containing
        //   nested `showcase-list-1-child`) -> Paste -> 1-step Undo restores all blocks!
        let (s_p, s_app, s_win, s_hw) = open_view(1280, 2600, PlaygroundOptions::default());
        s_hw.request_frame();
        let bookmark_bounds = s_app.update(|cx| {
            s_win
                .update(cx, |_, w, _| {
                    w.frame_snapshot().elements["page.block.showcase-bookmark"].bounds
                })
                .unwrap()
        });
        let code_before_margin = s_app.update(|cx| {
            cx.write_to_clipboard(ui::ClipboardItem::new_string(
                "MARGIN_BOOKMARK_LEAK".to_string(),
            ));
            s_win
                .update(cx, |v, w, cx| {
                    let before_code = v.block_text("showcase-code").unwrap_or("").to_string();
                    v.page_right_mouse_down(
                        &MouseDownEvent {
                            button: MouseButton::Right,
                            position: point(
                                px(16.0),
                                px(bookmark_bounds.y + bookmark_bounds.height * 0.5),
                            ),
                            modifiers: Modifiers::default(),
                            click_count: 1,
                            first_mouse: false,
                        },
                        w,
                        cx,
                    );
                    assert!(
                        !v.overlays.context_menu().unwrap().can_paste,
                        "margin beside non-editable Bookmark must disable Paste"
                    );
                    v.dispatch_overlay(
                        OverlayEvent::ContextMenuAction(ContextMenuAction::Paste),
                        w,
                        cx,
                    );
                    before_code
                })
                .unwrap()
        });
        s_p.run_until_parked();
        let code_after_margin = s_app.update(|cx| {
            s_win
                .update(cx, |v, _, _| {
                    v.block_text("showcase-code").unwrap_or("").to_string()
                })
                .unwrap()
        });
        assert_eq!(code_before_margin, code_after_margin);

        let orig_block_count = s_app.update(|cx| {
            s_win
                .update(cx, |v, w, cx| {
                    let layout = v.flow_layout().unwrap();
                    let all_ids: Vec<String> = layout
                        .blocks
                        .iter()
                        .filter(|b| {
                            !matches!(b.body.kind, blocksuite_editor::block_flow::FlowKind::Title)
                        })
                        .map(|b| b.block_id.clone())
                        .collect();
                    let count = v
                        .page_snapshot()
                        .unwrap()
                        .block("showcase-note")
                        .unwrap()
                        .walk()
                        .count();
                    v.editor.selection = None;
                    v.editor.block_selection = all_ids;
                    use ui::EntityInputHandler as _;
                    v.paste(ui::ClipboardItem::new_string("ALLPASTE".to_string()), w, cx);
                    count
                })
                .unwrap()
        });
        s_hw.request_frame();
        let (after_paste_count, list_child_deleted) = s_app.update(|cx| {
            s_win
                .update(cx, |v, _, _| {
                    let snap = v.page_snapshot().unwrap();
                    (
                        snap.block("showcase-note").unwrap().walk().count(),
                        snap.block("showcase-list-1-child").is_none(),
                    )
                })
                .unwrap()
        });
        assert!(list_child_deleted);
        assert_eq!(
            after_paste_count, 2,
            "all selected page blocks (including nested children and trailing database) replaced into showcase-note + showcase-h1"
        );
        let after_single_undo_count = s_app.update(|cx| {
            s_win
                .update(cx, |v, w, cx| {
                    v.history(false, w, cx).unwrap();
                    v.page_snapshot()
                        .unwrap()
                        .block("showcase-note")
                        .unwrap()
                        .walk()
                        .count()
                })
                .unwrap()
        });
        assert_eq!(
            after_single_undo_count, orig_block_count,
            "single Undo must restore full showcase block count without intermediate half-state"
        );
        let _ = orig_quote;
    }

    #[test]
    fn scrolled_code_context_menu_cut_follows_painted_selection_bounds() {
        // Sideways-scrolled code block: right-clicking pre-scroll highlight position must NOT
        // cut `TARGET`, whereas right-clicking the scrolled painted highlight cuts `TARGET`.
        let (c_p, c_app, c_win, c_hw) = open_view(1280, 1700, PlaygroundOptions::default());
        let prefix = format!("let pad = \"{}\"; ", "x".repeat(65));
        let full_line = format!("{prefix}TARGET_TOKEN {};\n", "y".repeat(80));
        let target_start = prefix.encode_utf16().count() as u64;
        let target_end = target_start + "TARGET_TOKEN".encode_utf16().count() as u64;
        c_app.update(|cx| {
            c_win
                .update(cx, |v, _, cx| {
                    v.edit_document(cx, |doc| {
                        let page = doc.workspace.page_mut(crate::HOME_PAGE_ID).unwrap();
                        page.insert_text("showcase-code", "prop:text", 0, &full_line, 2000)
                            .unwrap();
                        page.set_block_prop(
                            "showcase-code",
                            "prop:wrap",
                            y_octo::SessionValue::Any(y_octo::Any::False),
                            2001,
                        )
                        .unwrap();
                    });
                })
                .unwrap();
        });
        c_hw.request_frame();
        c_app.update(|cx| {
            c_win
                .update(cx, |v, w, cx| {
                    v.select_document_range(
                        crate::editor_session::DocumentSelection {
                            anchor: crate::editor_session::DocPoint::new(
                                "showcase-code",
                                target_start,
                            ),
                            focus: crate::editor_session::DocPoint::new(
                                "showcase-code",
                                target_end,
                            ),
                        },
                        w,
                        cx,
                    );
                })
                .unwrap();
        });
        c_hw.request_frame();
        let (code_bounds, pre_sel_bounds) = c_app.update(|cx| {
            c_win
                .update(cx, |_, w, _| {
                    let s = w.frame_snapshot();
                    (
                        s.elements["page.block.showcase-code"].bounds,
                        s.elements["page.selection"].bounds,
                    )
                })
                .unwrap()
        });
        c_hw.dispatch_input(ui::PlatformInput::Scroll(ui::ScrollEvent {
            position: point(
                px(code_bounds.x + code_bounds.width * 0.5),
                px(code_bounds.y + code_bounds.height * 0.5),
            ),
            delta: ui::ScrollDelta::Pixels(point(px(-140.0), px(0.0))),
            modifiers: Modifiers::default(),
            touch_phase: ui::TouchPhase::Moved,
            source: ui::ScrollSource::Pointer,
        }));
        c_p.run_until_parked();
        c_hw.request_frame();
        let post_sel_bounds = c_app.update(|cx| {
            c_win
                .update(cx, |_, w, _| {
                    w.frame_snapshot().elements["page.selection"].bounds
                })
                .unwrap()
        });
        assert!(
            (pre_sel_bounds.x - post_sel_bounds.x - 140.0).abs() < 1.0,
            "selection highlight should shift left by 140px: pre={pre_sel_bounds:?} post={post_sel_bounds:?}"
        );
        // Right-clicking old pre-scroll highlight center collapses selection and does NOT cut.
        c_app.update(|cx| {
            cx.write_to_clipboard(ui::ClipboardItem::new_string("SENTINEL_CODE".to_string()));
            c_win
                .update(cx, |v, w, cx| {
                    v.page_right_mouse_down(
                        &MouseDownEvent {
                            button: MouseButton::Right,
                            position: point(
                                px(pre_sel_bounds.x + pre_sel_bounds.width * 0.5),
                                px(pre_sel_bounds.y + pre_sel_bounds.height * 0.5),
                            ),
                            modifiers: Modifiers::default(),
                            click_count: 1,
                            first_mouse: false,
                        },
                        w,
                        cx,
                    );
                    v.dispatch_overlay(
                        OverlayEvent::ContextMenuAction(ContextMenuAction::Cut),
                        w,
                        cx,
                    );
                })
                .unwrap();
        });
        c_p.run_until_parked();
        let (clip_stale, code_txt_stale) = c_app.update(|cx| {
            (
                cx.read_from_clipboard().and_then(|c| c.text()),
                c_win
                    .update(cx, |v, _, _| {
                        v.block_text("showcase-code").unwrap_or("").to_string()
                    })
                    .unwrap(),
            )
        });
        assert_eq!(clip_stale.as_deref(), Some("SENTINEL_CODE"));
        assert!(code_txt_stale.contains("TARGET_TOKEN"));

        // Re-select `TARGET_TOKEN` while scrolled 140px, then right-click the SCROLLED highlight center + Cut!
        c_app.update(|cx| {
            c_win
                .update(cx, |v, w, cx| {
                    v.select_document_range(
                        crate::editor_session::DocumentSelection {
                            anchor: crate::editor_session::DocPoint::new(
                                "showcase-code",
                                target_start,
                            ),
                            focus: crate::editor_session::DocPoint::new(
                                "showcase-code",
                                target_end,
                            ),
                        },
                        w,
                        cx,
                    );
                    v.page_right_mouse_down(
                        &MouseDownEvent {
                            button: MouseButton::Right,
                            position: point(
                                px(post_sel_bounds.x + post_sel_bounds.width * 0.5),
                                px(post_sel_bounds.y + post_sel_bounds.height * 0.5),
                            ),
                            modifiers: Modifiers::default(),
                            click_count: 1,
                            first_mouse: false,
                        },
                        w,
                        cx,
                    );
                    v.dispatch_overlay(
                        OverlayEvent::ContextMenuAction(ContextMenuAction::Cut),
                        w,
                        cx,
                    );
                })
                .unwrap();
        });
        c_p.run_until_parked();
        let (clip_scrolled, code_txt_scrolled) = c_app.update(|cx| {
            (
                cx.read_from_clipboard().and_then(|c| c.text()),
                c_win
                    .update(cx, |v, _, _| {
                        v.block_text("showcase-code").unwrap_or("").to_string()
                    })
                    .unwrap(),
            )
        });
        assert_eq!(clip_scrolled.as_deref(), Some("TARGET_TOKEN"));
        assert!(!code_txt_scrolled.contains("TARGET_TOKEN"));
    }

    #[test]
    fn block_selection_paste_handles_collapsed_children_and_database_rows() {
        // 1. Parent heading + child paragraph selected `[fold-a, fold-b]` in both expanded and
        // collaborator-collapsed states: Paste replaces `fold-a` and deletes `fold-b` in one
        // atomic commit, and 1 Undo / 1 Redo round-trips on both local and peer.
        for collapsed_by_peer in [false, true] {
            let (_f_p, f_app, f_win, f_hw) = open_view(1280, 1400, PlaygroundOptions::default());
            let f_outbox: std::rc::Rc<std::cell::RefCell<Vec<Vec<u8>>>> =
                std::rc::Rc::new(std::cell::RefCell::new(Vec::new()));
            let f_sink = f_outbox.clone();
            let mut f_peer =
                blocksuite_playground_doc::session::PageDocSession::new("peer-fold", 911).unwrap();
            f_app.update(|cx| {
                f_win
                    .update(cx, |v, _, cx| {
                        v.edit_document(cx, |doc| {
                            let page = doc.workspace.page_mut(crate::HOME_PAGE_ID).unwrap();
                            page.add_block(
                                "fold-a",
                                blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                                    paragraph_type:
                                        blocksuite_playground_doc::schema::ParagraphType::H1,
                                    text: "A".into(),
                                },
                                Some("showcase-note"),
                                Some(0),
                                3000,
                            )
                            .unwrap();
                            page.add_block(
                                "fold-b",
                                blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                                    paragraph_type:
                                        blocksuite_playground_doc::schema::ParagraphType::Text,
                                    text: "B".into(),
                                },
                                Some("fold-a"),
                                Some(0),
                                3001,
                            )
                            .unwrap();
                        });
                        f_peer
                            .apply_remote_update_v1(&v.page().unwrap().encode_update_v1().unwrap())
                            .unwrap();
                        let (_tx, rx) = async_channel::unbounded();
                        let room_name = v.document().workspace.room().to_string();
                        v.room = Some(crate::view_room::RoomRuntime {
                            config: crate::room_client::RoomConfig::new(
                                &room_name,
                                Some("ws://127.0.0.1:1"),
                            ),
                            link: crate::room_client::RoomLink::from_parts(rx, move |cmd| {
                                if let crate::room_client::RoomCommand::Send(
                                    crate::room_client::RoomFrame::Binary(bytes),
                                ) = cmd
                                    && let Ok(
                                        blocksuite_playground_doc::wire::RoomBinaryFrame::Doc {
                                            message:
                                                blocksuite_playground_doc::wire::DocMessage::Update(u),
                                            ..
                                        },
                                    ) = blocksuite_playground_doc::wire::decode_binary_frame(&bytes)
                                {
                                    f_sink.borrow_mut().push(u);
                                }
                            }),
                            protocol: crate::room_client::RoomProtocol::new(&room_name),
                            error: None,
                        });
                        v.editor.selection = None;
                        v.editor.block_selection = vec!["fold-a".into(), "fold-b".into()];
                        if collapsed_by_peer {
                            let fold_delta = f_peer
                                .set_block_prop(
                                    "fold-a",
                                    "prop:collapsed",
                                    y_octo::SessionValue::Any(y_octo::Any::True),
                                    3002,
                                )
                                .unwrap()
                                .unwrap()
                                .update;
                            v.edit_document(cx, |doc| {
                                doc.workspace
                                    .page_mut(crate::HOME_PAGE_ID)
                                    .unwrap()
                                    .apply_remote_update_v1(&fold_delta)
                                    .unwrap();
                            });
                        }
                    })
                    .unwrap();
            });
            f_hw.request_frame();
            f_outbox.borrow_mut().clear();
            f_app.update(|cx| {
                f_win
                    .update(cx, |v, w, cx| {
                        if collapsed_by_peer {
                            assert!(v.flow_layout().unwrap().block("fold-b").is_none());
                        }
                        use ui::EntityInputHandler as _;
                        v.paste(ui::ClipboardItem::new_string("NEW".to_string()), w, cx);
                    })
                    .unwrap();
            });
            {
                let sent = f_outbox.borrow();
                assert_eq!(sent.len(), 1);
                f_peer.apply_remote_update_v1(&sent[0]).unwrap();
            }
            let ps = f_peer.read_page_snapshot().unwrap();
            assert_eq!(f_peer.read_editable_text("fold-a").unwrap().0.plain, "NEW");
            assert!(
                ps.block("fold-b").is_none(),
                "selected child fold-b must be deleted even when collapsed_by_peer={collapsed_by_peer}"
            );
            f_outbox.borrow_mut().clear();
            f_app.update(|cx| {
                f_win
                    .update(cx, |v, w, cx| v.history(false, w, cx).unwrap())
                    .unwrap();
            });
            {
                let sent = f_outbox.borrow();
                assert_eq!(sent.len(), 1);
                f_peer.apply_remote_update_v1(&sent[0]).unwrap();
            }
            assert!(
                f_peer
                    .read_page_snapshot()
                    .unwrap()
                    .block("fold-b")
                    .is_some()
            );
            f_outbox.borrow_mut().clear();
            f_app.update(|cx| {
                f_win
                    .update(cx, |v, w, cx| v.history(true, w, cx).unwrap())
                    .unwrap();
            });
            {
                let sent = f_outbox.borrow();
                assert_eq!(sent.len(), 1);
                f_peer.apply_remote_update_v1(&sent[0]).unwrap();
            }
            assert!(
                f_peer
                    .read_page_snapshot()
                    .unwrap()
                    .block("fold-b")
                    .is_none()
            );
        }

        // 10. Replacing a Database block (containing child row `db-row`) at first, middle, or last
        // slot of a BlockSelection removes `db-row` alongside the Database without leaking it into
        // `showcase-note`, while preserving unselected sibling `db-keep`.
        for db_slot in [0u64, 1, 2] {
            let (_d_p, d_app, d_win, d_hw) = open_view(1280, 1400, PlaygroundOptions::default());
            let d_outbox: std::rc::Rc<std::cell::RefCell<Vec<Vec<u8>>>> =
                std::rc::Rc::new(std::cell::RefCell::new(Vec::new()));
            let d_sink = d_outbox.clone();
            let mut d_peer =
                blocksuite_playground_doc::session::PageDocSession::new("peer-db", 912).unwrap();
            d_app.update(|cx| {
                d_win
                    .update(cx, |v, _, cx| {
                        v.edit_document(cx, |doc| {
                            let page = doc.workspace.page_mut(crate::HOME_PAGE_ID).unwrap();
                            let existing_ids: Vec<String> = page
                                .read_page_snapshot()
                                .unwrap()
                                .block("showcase-note")
                                .unwrap()
                                .children
                                .iter()
                                .map(|n| n.id.clone())
                                .filter(|id| id != "showcase-database")
                                .collect();
                            for id in existing_ids {
                                page.delete_block_subtree("showcase-note", &id, 3100)
                                    .unwrap();
                            }
                            page.add_block(
                                "db-row",
                                blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                                    paragraph_type:
                                        blocksuite_playground_doc::schema::ParagraphType::Text,
                                    text: "DATABASE ROW".into(),
                                },
                                Some("showcase-database"),
                                Some(0),
                                3101,
                            )
                            .unwrap();
                            page.add_block(
                                "db-a",
                                blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                                    paragraph_type:
                                        blocksuite_playground_doc::schema::ParagraphType::Text,
                                    text: "A".into(),
                                },
                                Some("showcase-note"),
                                None,
                                3102,
                            )
                            .unwrap();
                            page.add_block(
                                "db-b",
                                blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                                    paragraph_type:
                                        blocksuite_playground_doc::schema::ParagraphType::Text,
                                    text: "B".into(),
                                },
                                Some("showcase-note"),
                                None,
                                3103,
                            )
                            .unwrap();
                            page.add_block(
                                "db-keep",
                                blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                                    paragraph_type:
                                        blocksuite_playground_doc::schema::ParagraphType::Text,
                                    text: "KEEP".into(),
                                },
                                Some("showcase-note"),
                                None,
                                3104,
                            )
                            .unwrap();
                            page.reorder_child("showcase-note", "showcase-database", db_slot, 3105)
                                .unwrap();
                        });
                        d_peer
                            .apply_remote_update_v1(&v.page().unwrap().encode_update_v1().unwrap())
                            .unwrap();
                        let (_tx, rx) = async_channel::unbounded();
                        let room_name = v.document().workspace.room().to_string();
                        v.room = Some(crate::view_room::RoomRuntime {
                            config: crate::room_client::RoomConfig::new(
                                &room_name,
                                Some("ws://127.0.0.1:1"),
                            ),
                            link: crate::room_client::RoomLink::from_parts(rx, move |cmd| {
                                if let crate::room_client::RoomCommand::Send(
                                    crate::room_client::RoomFrame::Binary(bytes),
                                ) = cmd
                                    && let Ok(
                                        blocksuite_playground_doc::wire::RoomBinaryFrame::Doc {
                                            message:
                                                blocksuite_playground_doc::wire::DocMessage::Update(u),
                                            ..
                                        },
                                    ) = blocksuite_playground_doc::wire::decode_binary_frame(&bytes)
                                {
                                    d_sink.borrow_mut().push(u);
                                }
                            }),
                            protocol: crate::room_client::RoomProtocol::new(&room_name),
                            error: None,
                        });
                        v.editor.selection = None;
                        v.editor.block_selection = vec![
                            "showcase-database".into(),
                            "db-a".into(),
                            "db-b".into(),
                        ];
                    })
                    .unwrap();
            });
            d_hw.request_frame();
            d_outbox.borrow_mut().clear();
            d_app.update(|cx| {
                d_win
                    .update(cx, |v, w, cx| {
                        use ui::EntityInputHandler as _;
                        v.paste(ui::ClipboardItem::new_string("NEW".to_string()), w, cx);
                    })
                    .unwrap();
            });
            {
                let sent = d_outbox.borrow();
                assert_eq!(sent.len(), 1);
                d_peer.apply_remote_update_v1(&sent[0]).unwrap();
            }
            let ps = d_peer.read_page_snapshot().unwrap();
            assert!(
                ps.block("showcase-database").is_none()
                    && ps.block("db-row").is_none()
                    && ps.block("db-b").is_none(),
                "Database and its row must be deleted at db_slot={db_slot}"
            );
            let note_children: Vec<String> = ps
                .block("showcase-note")
                .unwrap()
                .children
                .iter()
                .map(|n| n.id.clone())
                .collect();
            assert_eq!(
                note_children.len(),
                2,
                "only pasted NEW and unselected db-keep should remain at db_slot={db_slot}: {note_children:?}"
            );
            assert_eq!(
                d_peer
                    .read_editable_text(&note_children[0])
                    .unwrap()
                    .0
                    .plain,
                "NEW"
            );
            assert_eq!(note_children[1], "db-keep");
            d_outbox.borrow_mut().clear();
            d_app.update(|cx| {
                d_win
                    .update(cx, |v, w, cx| v.history(false, w, cx).unwrap())
                    .unwrap();
            });
            {
                let sent = d_outbox.borrow();
                assert_eq!(sent.len(), 1);
                d_peer.apply_remote_update_v1(&sent[0]).unwrap();
            }
            let ps_undo = d_peer.read_page_snapshot().unwrap();
            assert!(
                ps_undo.block("showcase-database").is_some()
                    && ps_undo.block("db-row").is_some()
                    && ps_undo.block("db-keep").is_some(),
                "1 Undo must restore Database + db-row at db_slot={db_slot}"
            );
        }
    }
}
