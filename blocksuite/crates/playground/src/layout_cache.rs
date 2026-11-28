//! Layout cache, document refresh, and mode/scroll transitions for [`PlaygroundView`].

use std::{
    collections::{BTreeMap, BTreeSet},
    rc::Rc,
};

use blocksuite_playground_doc::read::BlockContent;
use ui::{Motion, MotionCurve, ScrollEvent, Window, px};

use crate::{
    HOME_PAGE_ID, PILL_EDGELESS_X, PILL_PAGE_X, PILL_TRANSITION_MS, PlaygroundMode, PlaygroundView,
    SCROLL_LINE,
    block_flow::{FlowInput, FlowLayout, ImageSlot, decode_image},
    directory,
    overlays::InlineTargetEnd,
    room_client::RoomCommand,
    view_room::BlobFetchState,
};

impl PlaygroundView {
    pub(crate) fn capture_reading_anchor(&mut self) {
        if self.reading_anchor.is_none() && self.scroll_y > 0.0 {
            self.reading_anchor = self.flow_layout().and_then(|layout| {
                layout
                    .blocks
                    .iter()
                    .find(|block| block.rect().bottom() > self.scroll_y)
                    .map(|block| (block.block_id.clone(), block.y - self.scroll_y))
            });
        }
    }

    /// Re-read the shown page from the workspace and bring images in line with the blobs.
    pub(crate) fn refresh_document(&mut self) {
        self.dirty_text = None;
        let pages = self.state.workspace.list_pages().ok();
        if let Some(ref pages) = pages {
            let titles: BTreeMap<String, String> = pages
                .iter()
                .map(|page| (page.id.clone(), page.title.clone()))
                .collect();
            if titles != self.page_titles {
                self.page_titles = titles;
                self.env_rev += 1;
            }
            let keep_current = self
                .page_id
                .as_deref()
                .is_some_and(|cur| pages.iter().any(|page| page.id == cur));
            if !keep_current {
                self.page_id = pages
                    .iter()
                    .find(|page| page.id == HOME_PAGE_ID)
                    .or(pages.first())
                    .map(|page| page.id.clone());
            }
        } else if self
            .page_id
            .as_deref()
            .is_some_and(|id| self.state.workspace.page(id).is_none())
        {
            self.page_id = None;
        }
        self.snapshot = self
            .page_id
            .as_deref()
            .and_then(|id| self.state.workspace.page(id))
            .and_then(|page| page.read_page_snapshot().ok())
            .filter(|snapshot| snapshot.root.is_some())
            .map(Rc::new);
        self.doc_rev += 1;
        if let Some(pages) = pages
            && self.custom_doc_directory.is_none()
        {
            use blocksuite_editor::WorkspaceDocDirectory as _;
            let mode = match self.mode {
                PlaygroundMode::Page => directory::EditorDocMode::Page,
                PlaygroundMode::Edgeless => directory::EditorDocMode::Edgeless,
            };
            let docs = pages.iter().map(|page| directory::EditorDocSummary {
                id: directory::EditorDocId::new(&page.id),
                title: page.title.clone(),
                mode,
                updated_at_ms: page
                    .updated_date
                    .filter(|&d| d > 0)
                    .unwrap_or(page.create_date),
            });
            self.default_doc_directory.retain_and_upsert_docs(docs);
            self.cached_page_revisions
                .retain(|id, _| pages.iter().any(|p| p.id == *id));

            for page in &pages {
                let doc_id = directory::EditorDocId::new(&page.id);
                let page_updated_ms = page
                    .updated_date
                    .filter(|&d| d > 0)
                    .unwrap_or(page.create_date);
                let is_active = self.page_id.as_deref() == Some(page.id.as_str());
                let cached_preview = self.default_doc_directory.doc_preview(&doc_id);
                let has_snapshot = self.default_doc_directory.doc_snapshot(&doc_id).is_some();
                let current_rev = (!is_active)
                    .then(|| self.state.workspace.page(&page.id).map(|s| s.revision()))
                    .flatten();
                // Avoid re-decoding non-active workspace pages on every local keystroke while
                // immediately invalidating whenever any local or remote update (including pure
                // Yjs deletes that leave the state vector unchanged) bumps `page.revision()`
                // or changes the workspace title or updated timestamp.
                if !is_active
                    && has_snapshot
                    && cached_preview.as_ref().is_some_and(|p| {
                        p.title == page.title && p.updated_at_ms == page_updated_ms
                    })
                    && current_rev.is_some()
                    && self.cached_page_revisions.get(&page.id).copied() == current_rev
                {
                    continue;
                }
                let next_snap = if is_active {
                    self.snapshot.as_deref().cloned()
                } else {
                    self.state
                        .workspace
                        .page(&page.id)
                        .and_then(|s| s.read_page_snapshot().ok())
                };
                if let Some(snap) = next_snap {
                    if let Some(rev) = current_rev {
                        self.cached_page_revisions.insert(page.id.clone(), rev);
                    }
                    let snippet = snap
                        .root
                        .as_ref()
                        .map(|root| {
                            let mut parts = Vec::new();
                            for node in root.walk() {
                                let text = match &node.content {
                                    BlockContent::Paragraph { text, .. }
                                    | BlockContent::List { text, .. } => text.plain.trim(),
                                    BlockContent::Callout { text, .. } => text.plain.trim(),
                                    _ => "",
                                };
                                if !text.is_empty() {
                                    parts.push(text.to_string());
                                    if parts.len() >= 2 {
                                        break;
                                    }
                                }
                            }
                            parts.join(" ")
                        })
                        .unwrap_or_default();
                    let next_rev = match cached_preview {
                        Some(prev)
                            if !is_active
                                && prev.title == page.title
                                && prev.snippet == snippet
                                && prev.updated_at_ms == page_updated_ms
                                && self.default_doc_directory.doc_snapshot(&doc_id).as_deref()
                                    == Some(&snap) =>
                        {
                            prev.revision
                        }
                        Some(prev) => {
                            if !is_active {
                                self.env_rev += 1;
                            }
                            prev.revision.wrapping_add(1)
                        }
                        None => 1,
                    };
                    self.default_doc_directory.upsert_preview(
                        doc_id.clone(),
                        directory::EditorDocPreview {
                            title: page.title.clone(),
                            snippet,
                            updated_at_ms: page_updated_ms,
                            revision: next_rev,
                        },
                    );
                    self.default_doc_directory
                        .upsert_snapshot(doc_id, std::sync::Arc::new(snap));
                }
            }
        }
        self.edgeless_refresh_label_editor_from_snapshot();
        self.sync_table_cell_from_snapshot();
        self.sync_database_record_sheet_from_snapshot();

        let mut referenced = BTreeSet::new();
        let mut pdf_attachments: Vec<(String, String)> = Vec::new();
        for node in self
            .snapshot
            .iter()
            .flat_map(|snapshot| snapshot.root.iter())
            .flat_map(|root| root.walk())
        {
            match &node.content {
                BlockContent::Image { source_id, .. } if !source_id.is_empty() => {
                    referenced.insert(source_id.clone());
                }
                BlockContent::Attachment {
                    name,
                    mime_type,
                    source_id,
                    embed,
                    ..
                } if !source_id.is_empty() => {
                    referenced.insert(source_id.clone());
                    if *embed
                        && (mime_type.eq_ignore_ascii_case("application/pdf")
                            || name.to_ascii_lowercase().ends_with(".pdf"))
                    {
                        pdf_attachments.push((node.id.clone(), source_id.clone()));
                    }
                }
                _ => {}
            }
        }
        self.refresh_pdf_previews(&pdf_attachments);
        // Fetches of blobs the page no longer references stop. An ordinary document
        // update never restarts a fetch that is already tracked.
        let images = &mut self.images;
        self.blob_fetches.retain(|source_id, _| {
            let keep = referenced.contains(source_id);
            if !keep {
                images.remove(source_id);
            }
            keep
        });
        for source_id in referenced {
            if let Some(bytes) = self.state.blobs.get(&source_id) {
                // Decoded once; a blob that is no image stays unavailable.
                if !self.images.contains_key(&source_id)
                    || self.blob_fetches.remove(&source_id).is_some()
                {
                    let slot = decode_image(bytes).map_or(ImageSlot::Unavailable, ImageSlot::Ready);
                    self.images.insert(source_id, slot);
                    self.env_rev += 1;
                }
            } else if let Some(room) = &self.room
                && !self.blob_fetches.contains_key(&source_id)
            {
                self.blob_fetches.insert(
                    source_id.clone(),
                    BlobFetchState {
                        in_flight: true,
                        ..BlobFetchState::default()
                    },
                );
                room.link.send(RoomCommand::FetchBlob(source_id));
            }
        }
    }

    /// Authoritative single-entry invariant: returns `true` iff `block_id` exists in `snap`
    /// AND belongs to an editing surface addressable in the current `PlaygroundMode`:
    /// - `PlaygroundMode::Page`: `root.id` or a descendant of a root-level `is_page_visible_note()`.
    /// - `PlaygroundMode::Edgeless`: a block inside the currently active spatial inline-edited
    ///   `Note` or `EdgelessText` (or read-only touch selection target).
    pub(crate) fn is_block_addressable_in_current_mode(
        &self,
        snap: &blocksuite_playground_doc::read::PageSnapshot,
        block_id: &str,
    ) -> bool {
        let Some(root) = snap.root.as_ref() else {
            return false;
        };
        match self.mode {
            PlaygroundMode::Page => {
                root.id == block_id
                    || root
                        .children
                        .iter()
                        .any(|c| c.is_page_visible_note() && c.walk().any(|n| n.id == block_id))
            }
            PlaygroundMode::Edgeless => self
                .edgeless
                .authoring
                .editing_spatial_block()
                .map(|(id, _)| id)
                .or_else(|| {
                    self.edgeless_readonly_selection_target
                        .as_ref()
                        .map(|(id, _)| id.as_str())
                })
                .and_then(|active_id| snap.block(active_id))
                .is_some_and(|sub| sub.walk().any(|n| n.id == block_id)),
        }
    }

    /// Drop any body caret/range or block selection whose target block was removed or is
    /// unaddressable in the current mode so subsequent typing never targets a hidden/deleted block.
    pub(crate) fn prune_dangling_selection(
        &mut self,
        w: Option<&mut Window>,
        cx: &mut ui::Context<Self>,
    ) {
        let selection_alive = self.editor.selection.as_ref().is_none_or(|sel| {
            self.snapshot.as_ref().is_some_and(|snap| {
                self.is_block_addressable_in_current_mode(snap, &sel.anchor.block_id)
                    && self.is_block_addressable_in_current_mode(snap, &sel.focus.block_id)
            })
        });
        let mut pruned = false;
        if !selection_alive {
            self.editor.selection = None;
            self.editor.preedit = None;
            self.editor.last_typing = None;
            self.editor.pending_marks.clear();
            self.editor.slash_trigger = None;
            self.overlays.set_keyboard_toolbar_visible(false);
            pruned = true;
        }
        if !self.editor.block_selection.is_empty() {
            let valid_ids: std::collections::HashSet<String> = self
                .snapshot
                .as_ref()
                .map(|snap| {
                    self.editor
                        .block_selection
                        .iter()
                        .filter(|id| self.is_block_addressable_in_current_mode(snap, id))
                        .cloned()
                        .collect()
                })
                .unwrap_or_default();
            let before_len = self.editor.block_selection.len();
            self.editor
                .block_selection
                .retain(|id| valid_ids.contains(id));
            if self.editor.block_selection.len() != before_len {
                pruned = true;
            }
        }
        if pruned {
            self.announce_selection(cx);
            if let Some(w) = w {
                w.notify_text_input_changed(&self.editor_focus);
                w.notify_text_selection_changed(&self.editor_focus);
            }
            cx.notify();
        }
    }

    pub(crate) fn target_pill_x(mode: PlaygroundMode) -> f64 {
        match mode {
            PlaygroundMode::Page => PILL_PAGE_X,
            PlaygroundMode::Edgeless => PILL_EDGELESS_X,
        }
    }

    pub(crate) fn indicator_x(&self, now_ms: f64) -> f64 {
        match self.pill_motion {
            Some(motion) => motion.value_at(now_ms),
            None => Self::target_pill_x(self.mode),
        }
    }

    pub fn set_mode(
        &mut self,
        target: PlaygroundMode,
        window: &mut Window,
        cx: &mut ui::Context<Self>,
    ) {
        if self.mode == target {
            return;
        }
        let now_ms = self.now_ms(cx);
        let current_x = self.indicator_x(now_ms);
        // Commit any pending inline edit (table cell or Edgeless label) cleanly before switching modes.
        self.finish_inline_targets(InlineTargetEnd::CommitPreedit, Some(window), Some(cx));
        if self.edgeless.authoring.editing_spatial_block().is_some() {
            self.edgeless_commit_inline_edit(window, cx);
        }
        self.edgeless.authoring.reset_transient();
        self.page_scroll_fling = None;
        self.code_scroll_fling = None;
        self.edgeless_pan_fling = None;
        self.touch_long_press_anchor = None;
        self.touch_selection_menu_open = false;
        self.edgeless_readonly_selection_target = None;
        self.mode = target;
        self.dirty_text = None;
        self.context_paste_task = None;
        self.context_menu_target = None;
        self.overlays.reset();
        self.prune_dangling_selection(Some(window), cx);
        self.pill_motion = Some(Motion::new(
            current_x,
            Self::target_pill_x(target),
            MotionCurve::EaseInOutCubic,
            now_ms,
            PILL_TRANSITION_MS,
        ));
        cx.notify();
    }

    pub(crate) fn on_scroll(
        &mut self,
        event: &ScrollEvent,
        window: &mut Window,
        cx: &mut ui::Context<Self>,
    ) {
        self.page_scroll_fling = None;
        self.code_scroll_fling = None;
        if event.source == ui::ScrollSource::Touch {
            if event.touch_phase == ui::TouchPhase::Started
                || self.active_touch_owner == crate::TouchStrokeOwner::None
            {
                if self.has_live_modal_touch_overlay(window, cx) {
                    self.active_touch_owner = crate::TouchStrokeOwner::ModalOverlay;
                    if let Some((sheet_left, sheet_top, sheet_w, _, _)) =
                        self.record_sheet_geometry(window)
                        && let Some(s) = self.database_record_sheet.as_mut()
                    {
                        let d = event.delta.pixel_delta(px(SCROLL_LINE));
                        let x0 = f32::from(event.position.x) - f32::from(d.x);
                        let y0 = f32::from(event.position.y) - f32::from(d.y);
                        let in_sheet_x = x0 >= sheet_left && x0 <= sheet_left + sheet_w;
                        if in_sheet_x && y0 >= sheet_top && y0 <= sheet_top + 68.0 {
                            s.grabber_drag_start_y.get_or_insert(y0);
                            s.touch_body_drag = false;
                        }
                    }
                } else {
                    self.active_touch_owner = crate::TouchStrokeOwner::Page;
                }
            }
            if self.active_touch_owner == crate::TouchStrokeOwner::ModalOverlay {
                if let Some((_, _, _, _, max_scroll)) = self.record_sheet_geometry(window) {
                    let drag_in_header = self
                        .database_record_sheet
                        .as_ref()
                        .is_some_and(|s| s.grabber_drag_start_y.is_some());
                    if !drag_in_header {
                        let dy = f32::from(event.delta.pixel_delta(px(SCROLL_LINE)).y);
                        if let Some(s) = self.database_record_sheet.as_mut() {
                            s.scroll_fling = None;
                            let next = (s.scroll_y - dy).clamp(0.0, max_scroll).round();
                            if (next - s.scroll_y).abs() > 0.5 {
                                s.scroll_y = next;
                                cx.notify();
                            }
                        }
                    }
                }
                return;
            }
        }
        if self.database_record_sheet.is_some() {
            if let Some((_, _, _, _, max_scroll)) = self.record_sheet_geometry(window) {
                let drag_in_header = self
                    .database_record_sheet
                    .as_ref()
                    .is_some_and(|s| s.grabber_drag_start_y.is_some());
                if !drag_in_header {
                    let dy = f32::from(event.delta.pixel_delta(px(SCROLL_LINE)).y);
                    if let Some(s) = self.database_record_sheet.as_mut() {
                        s.scroll_fling = None;
                        let next = (s.scroll_y - dy).clamp(0.0, max_scroll).round();
                        if (next - s.scroll_y).abs() > 0.5 {
                            s.scroll_y = next;
                            cx.notify();
                        }
                    }
                }
                return;
            }
            self.database_record_sheet = None;
            cx.notify();
        }
        if self.overlays.bookmark_prompt().is_some()
            || self.overlays.equation_editor().is_some()
            || self.overlays.active_text_field().is_some()
        {
            return;
        }
        if self.touch_selection_menu_open {
            self.touch_selection_menu_open = false;
            cx.notify();
        }
        let raw_delta = event.delta.pixel_delta(px(SCROLL_LINE));
        let (mut dx, mut dy) = (f32::from(raw_delta.x), f32::from(raw_delta.y));
        // On Windows/Linux, Shift+wheel delivers a vertical delta with `modifiers.shift`:
        // convert it to horizontal scroll for wide tables, code blocks, and databases.
        if event.source != ui::ScrollSource::Touch
            && event.modifiers.shift
            && dx.abs() < f32::EPSILON
            && dy.abs() > f32::EPSILON
        {
            dx = dy;
            dy = 0.0;
        }
        // Touch scroll axis lock — once a touch drag establishes a dominant axis,
        // suppress orthogonal jitter until the gesture ends, restarts, or pauses >160ms.
        if event.source == ui::ScrollSource::Touch {
            let now_ms = self.now_ms(cx);
            if self
                .last_touch_scroll_ms
                .is_some_and(|prev| now_ms - prev > 160.0)
            {
                self.touch_scroll_axis_lock = None;
            }
            match event.touch_phase {
                ui::TouchPhase::Started => {
                    self.touch_scroll_axis_lock = None;
                    self.last_touch_scroll_ms = Some(now_ms);
                }
                ui::TouchPhase::Ended | ui::TouchPhase::Cancelled => {
                    self.touch_scroll_axis_lock = None;
                    self.last_touch_scroll_ms = None;
                }
                ui::TouchPhase::Moved => {
                    self.last_touch_scroll_ms = Some(now_ms);
                }
            }
            if self.touch_scroll_axis_lock.is_none() && (dx.abs() >= 4.0 || dy.abs() >= 4.0) {
                self.touch_scroll_axis_lock = Some(if dx.abs() > dy.abs() * 1.2 {
                    crate::TouchScrollAxis::Horizontal
                } else {
                    crate::TouchScrollAxis::Vertical
                });
            }
            match self.touch_scroll_axis_lock {
                Some(crate::TouchScrollAxis::Horizontal) => dy = 0.0,
                Some(crate::TouchScrollAxis::Vertical) => dx = 0.0,
                None => {}
            }
        }
        // Horizontal scroll over a touch database view tab strip scrolls the tab strip.
        if dx.abs() > dy.abs()
            && self.form_factor.is_touch_form_factor()
            && let Some(layout) = self.flow_layout()
        {
            let geom = crate::block_flow::page_geometry(self.window_size.0);
            let wx = f32::from(event.position.x) - geom.column_x;
            let wy = f32::from(event.position.y) - crate::TOPBAR_HEIGHT + self.scroll_y;
            if let Some(block) = layout.blocks.iter().find(|b| {
                b.body.kind == crate::block_flow::FlowKind::Database
                    && b.rect().contains(wx, wy)
                    && (wy - b.y) >= 34.0
                    && (wy - b.y) <= 82.0
            }) {
                let block_id = block.block_id.clone();
                let (cur_px, max_px) = self.flow.database_view_tabs_metrics(&block_id);
                let logical_dx = if window.layout_direction().is_rtl() {
                    -dx
                } else {
                    dx
                };
                if max_px > 0
                    && self.flow.database_state.scroll_view_tabs_from(
                        &block_id,
                        cur_px,
                        logical_dx.round() as i32,
                        max_px,
                    )
                {
                    self.env_rev += 1;
                    cx.notify();
                    return;
                }
            }
        }
        // A sideways scroll over an unwrapped code block or wide table scrolls it, not the page.
        if let Some((snapshot, layout)) = self.snapshot.clone().zip(self.flow_layout()) {
            let scene = self.overlay_scene(&snapshot, &layout, window.layout_direction(), None);
            if self.overlays.scroll_code(
                &scene,
                f32::from(event.position.x),
                f32::from(event.position.y),
                dx,
                dy,
            ) {
                cx.notify();
                return;
            }
        }
        let target = (self.scroll_y - dy).clamp(0.0, self.max_scroll).round();
        if target != self.scroll_y {
            self.scroll_y = target;
            cx.notify();
        }
    }

    pub(crate) fn ensure_layout(&mut self, width: f32, window: &Window) -> Option<Rc<FlowLayout>> {
        use std::hash::{Hash, Hasher};

        let snapshot = self.snapshot.clone()?;
        let is_rtl = window.layout_direction().is_rtl();
        let (now_ms, utc_offset_minutes) = self.local_calendar_clock();
        let local_day =
            (now_ms.saturating_add(i64::from(utc_offset_minutes) * 60_000)).div_euclid(86_400_000);
        let preview_rev = crate::block_flow::preview_revision();
        let equation_draft = self
            .overlays
            .equation_editor()
            .map(|editor| match &editor.target {
                crate::overlays::EquationTarget::Block { block_id } => {
                    crate::block_flow::EquationDraft::Block {
                        block_id: block_id.clone(),
                        latex: editor.committed_draft().to_string(),
                    }
                }
                crate::overlays::EquationTarget::Inline {
                    block_id,
                    utf16_offset,
                } => crate::block_flow::EquationDraft::Inline {
                    block_id: block_id.clone(),
                    utf16_offset: *utf16_offset,
                    latex: editor.committed_draft().to_string(),
                },
            });
        let draft_hash = {
            let mut h = std::collections::hash_map::DefaultHasher::new();
            equation_draft.hash(&mut h);
            h.finish()
        };
        let focused_table_block = (!self.table_is_readonly())
            .then(|| self.table_cell.as_ref().map(|c| c.block_id.clone()))
            .flatten();
        if self.flow.focused_table_block != focused_table_block {
            self.flow.focused_table_block = focused_table_block;
            self.env_rev = self.env_rev.wrapping_add(1);
        }
        let effective_env_rev = self
            .env_rev
            .wrapping_add(self.flow.database_state.revision());
        let key = (
            self.doc_rev,
            width.to_bits(),
            self.theme,
            effective_env_rev,
            preview_rev,
            draft_hash,
            is_rtl,
            self.form_factor,
            utc_offset_minutes,
            local_day,
        );
        if let Some((cached, layout)) = &self.layout
            && *cached == key
        {
            return Some(layout.clone());
        }
        let snapshot = self.preedit_snapshot().map(Rc::new).unwrap_or(snapshot);
        let mut dirty = self.dirty_text.take().filter(|_| {
            self.layout.as_ref().is_some_and(|(old, _)| {
                old.1 == key.1
                    && old.2 == key.2
                    && old.3 == key.3
                    && old.4 == key.4
                    && old.6 == key.6
                    && old.7 == key.7
                    && old.8 == key.8
                    && old.9 == key.9
            })
        });
        // If only the live equation draft changed, mark just the target block dirty so sibling
        // blocks stay cached (preserving single-keystroke relayout == 1).
        if let Some((old, _)) = &self.layout
            && old.5 != key.5
        {
            if let Some(ref mut set) = dirty {
                if let Some(draft) = &equation_draft {
                    let bid = match draft {
                        crate::block_flow::EquationDraft::Block { block_id, .. }
                        | crate::block_flow::EquationDraft::Inline { block_id, .. } => {
                            block_id.clone()
                        }
                    };
                    set.insert(bid);
                } else {
                    // Equation editor closed; full pass reconciles the previously overridden block.
                    dirty = None;
                }
            }
        }
        self.flow.database_state.mobile_readonly = self.database_readonly;
        self.flow.database_state.clock_ms = now_ms;
        let offset_at = self.utc_offset_resolver();
        let doc_dir = self
            .custom_doc_directory
            .as_deref()
            .unwrap_or(&self.default_doc_directory);
        let layout = Rc::new(self.flow.layout_changed(
            &FlowInput {
                snapshot: &snapshot,
                width,
                theme: self.theme,
                page_titles: &self.page_titles,
                images: &self.images,
                pdf_previews: Some(&self.pdf_previews),
                doc_directory: Some(doc_dir),
                equation_draft: equation_draft.as_ref(),
                env_rev: effective_env_rev,
                direction: window.layout_direction(),
                form_factor: self.form_factor,
                utc_offset_minutes,
                utc_offset_at: Some(&offset_at),
            },
            window,
            dirty.as_ref(),
        ));
        self.dirty_text = Some(BTreeSet::new());
        self.layout = Some((key, layout.clone()));
        Some(layout)
    }
}

impl crate::PlaygroundOptions {
    /// Parse command-line flags: `--theme light|dark`, `--mode page|edgeless`,
    /// `--edgeless-readonly`, `--room <room>` and `--relay <ws_url>` (a relay without a room is an error).
    pub fn from_args(args: impl IntoIterator<Item = String>) -> anyhow::Result<Self> {
        let mut options = Self::default();
        let mut room = None;
        let mut relay = None;
        let mut args = args.into_iter();
        while let Some(flag) = args.next() {
            let mut value = || {
                args.next()
                    .ok_or_else(|| anyhow::anyhow!("{flag} requires a value"))
            };
            match flag.as_str() {
                "--theme" => {
                    let value = value()?;
                    options.theme = crate::PlaygroundTheme::parse(&value)
                        .ok_or_else(|| anyhow::anyhow!("unknown theme {value:?} (light|dark)"))?;
                }
                "--mode" => {
                    let value = value()?;
                    options.mode = PlaygroundMode::parse(&value)
                        .ok_or_else(|| anyhow::anyhow!("unknown mode {value:?} (page|edgeless)"))?;
                }
                "--edgeless-readonly" => options.edgeless_readonly = true,
                "--page-readonly" => options.page_readonly = true,
                "--database-readonly" => options.database_readonly = true,
                "--form-factor" => {
                    let value = value()?;
                    options.form_factor = match value.as_str() {
                        "desktop" => crate::FormFactor::Desktop,
                        "tablet" => crate::FormFactor::Tablet,
                        "phone" => crate::FormFactor::Phone,
                        _ => anyhow::bail!("unknown form factor {value:?} (desktop|tablet|phone)"),
                    };
                }
                "--room" => room = Some(value()?),
                "--relay" => relay = Some(value()?),
                other => anyhow::bail!("unknown flag: {other}"),
            }
        }
        match (room, relay) {
            (Some(room), relay) => {
                let config = crate::room_client::RoomConfig::new(&room, relay.as_deref());
                #[cfg(not(target_family = "wasm"))]
                config.validate_native()?;
                options.room = Some(config);
            }
            (None, Some(_)) => anyhow::bail!("--relay requires --room <room>"),
            (None, None) => {}
        }
        Ok(options)
    }
}
