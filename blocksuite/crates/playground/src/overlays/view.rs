use std::{ops::Range, time::Duration};

use blocksuite_playground_doc::read::{PageSnapshot, TextAlign as BlockAlign};
use ui::{
    AnyElement, ClipboardItem, Context, KeyDownEvent, MouseButton, MouseDownEvent, MouseMoveEvent,
    MouseUpEvent, Window,
};

use crate::{
    PlaygroundMode, PlaygroundView,
    block_flow::{FlowKind, FlowLayout, PagePaint},
    editor_session::{DocPoint, DocumentSelection},
    theme::Palette,
};

use super::*;

/// Glue between the overlays and the view: input in, edits out through the editor's
/// document session.
impl PlaygroundView {
    /// Popovers, hover and block-control state of the Page view.
    pub fn overlays(&self) -> &Overlays {
        &self.overlays
    }

    pub(crate) fn overlay_scene<'a>(
        &self,
        snapshot: &'a PageSnapshot,
        layout: &'a FlowLayout,
        direction: ui::Direction,
        selection: Option<&'a SelectionFormat>,
        local_collapsed: &'a std::collections::BTreeSet<String>,
    ) -> OverlayScene<'a> {
        self.overlay_scene_with_transform(
            snapshot,
            layout,
            direction,
            selection,
            None,
            local_collapsed,
        )
    }

    pub(crate) fn overlay_scene_with_transform<'a>(
        &self,
        snapshot: &'a PageSnapshot,
        layout: &'a FlowLayout,
        direction: ui::Direction,
        selection: Option<&'a SelectionFormat>,
        screen_transform: Option<OverlayScreenTransform>,
        local_collapsed: &'a std::collections::BTreeSet<String>,
    ) -> OverlayScene<'a> {
        let focused_code_block = self.focused_code_block_id(layout);
        OverlayScene {
            snapshot,
            layout,
            geometry: crate::block_flow::page_geometry(self.window_size.0),
            window: self.window_size,
            bottom_inset: self.ime_insets.last_bottom,
            scroll_y: self.scroll_y,
            direction,
            form_factor: self.form_factor,
            focused_code_block,
            selection,
            screen_transform,
            suppress_floating_format_buttons: self.native_selection_ui,
            local_collapsed,
        }
    }

    /// Feed one event to the overlays and carry out what it asks for: document edits
    /// (each one undo step, sent to the live room), the clipboard, timers. Pointer
    /// listeners route through here, and so do hosts and tests that open the slash menu
    /// or set the selection.
    pub fn dispatch_overlay(
        &mut self,
        event: OverlayEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let input = self.link_input_state();
        self.dispatch_overlay_event(event, window, cx);
        self.sync_link_input(input, window, cx);
    }

    /// What the platform's text input sees of the link field: nothing while it is closed.
    pub(crate) fn link_input_state(
        &self,
    ) -> Option<(String, Range<usize>, bool, Option<Range<usize>>)> {
        let field = self.overlays.active_text_field()?;
        let (selection, reversed) = field.shown_selection();
        Some((field.text(), selection, reversed, field.marked_range()))
    }

    /// Tell the platform's text input (AppKit, the browser's mirror element) that the
    /// link field opened, closed, or changed its text, selection or composition since
    /// `before`: the field and the document take turns being the view's text input.
    pub(crate) fn sync_link_input(
        &mut self,
        before: Option<(String, Range<usize>, bool, Option<Range<usize>>)>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let after = self.link_input_state();
        if before != after {
            if after.is_some() {
                self.context_paste_task = None;
                self.context_menu_target = None;
            }
            if before.is_some() && after.is_none() {
                self.reset_caret_blink(cx);
            }
            window.notify_text_input_changed(&self.editor_focus);
            window.notify_text_selection_changed(&self.editor_focus);
            cx.notify();
        }
    }

    pub(super) fn dispatch_overlay_event(
        &mut self,
        event: OverlayEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match &event {
            OverlayEvent::SetSelection(selection) => {
                self.editor.dragging = false;
                self.finish_inline_targets(InlineTargetEnd::CommitPreedit, Some(window), Some(cx));
                self.overlays.close_link_field();
                self.overlays.close_equation_editor();
                self.overlays.close_bookmark_prompt();
                self.equation_snapshot = None;
                match selection {
                    Some(selection) => {
                        self.keyboard_toolbar_dismissed = false;
                        self.select_document_range(
                            DocumentSelection {
                                anchor: DocPoint::new(
                                    &selection.block_id,
                                    selection.start_utf16 as u64,
                                ),
                                focus: DocPoint::new(
                                    &selection.block_id,
                                    selection.end_utf16 as u64,
                                ),
                            },
                            window,
                            cx,
                        );
                    }
                    None => {
                        // Peers stop showing the caret, and a typed slash menu has no
                        // caret left to filter by.
                        self.editor.selection = None;
                        self.editor.block_selection.clear();
                        self.overlays.set_keyboard_toolbar_visible(false);
                        self.announce_selection(cx);
                        self.sync_slash_trigger(cx);
                        self.sync_linked_doc_trigger(cx);
                        window.notify_text_selection_changed(&self.editor_focus);
                        cx.notify();
                    }
                }
                return;
            }
            OverlayEvent::DragStart(block_id) => {
                self.editor.dragging = false;
                let now_ms = self.now_ms(cx);
                let dragged_ids = self.resolve_multi_drag_ids(block_id);
                self.overlays
                    .start_drag(block_id.clone(), dragged_ids, now_ms);
                cx.notify();
                return;
            }
            OverlayEvent::DragHandlePress { block_id, anchor } => {
                self.editor.dragging = false;
                let now_ms = self.now_ms(cx);
                let dragged_ids = self.resolve_multi_drag_ids(block_id);
                self.overlays.start_drag_with_anchor(
                    block_id.clone(),
                    dragged_ids,
                    Some(*anchor),
                    now_ms,
                );
                cx.notify();
                return;
            }
            OverlayEvent::TableCellMouseDown {
                block_id,
                row_id,
                column_id,
                screen_pos,
                click_count,
                shift,
            } => {
                self.focus_table_cell_pointer(
                    block_id.clone(),
                    row_id.clone(),
                    column_id.clone(),
                    Some(*screen_pos),
                    *click_count,
                    *shift,
                    window,
                    cx,
                );
                return;
            }
            _ if self.handle_embed_and_code_event(&event, window, cx) => return,
            _ if self.handle_context_menu_event(&event, window, cx) => return,
            _ if self.handle_linked_doc_event(&event, window, cx) => return,
            _ if self.handle_mobile_and_rich_event(&event, window, cx) => return,
            _ => {}
        }
        let now_ms = self.now_ms(cx);
        let target = self.active_overlay_target();
        let direction = window.layout_direction();
        let capture_equation = matches!(
            event,
            OverlayEvent::OpenEquationEditor { .. }
                | OverlayEvent::CloseEquationEditor
                | OverlayEvent::EquationApply
        );
        let effects = match &target {
            Some((snapshot, layout, transform)) => {
                let local_collapsed = self.flow.local_collapsed.clone();
                let scene = self.overlay_scene_with_transform(
                    snapshot,
                    layout,
                    direction,
                    None,
                    *transform,
                    &local_collapsed,
                );
                self.overlays.handle(event, Some(&scene), now_ms)
            }
            None => self.overlays.handle(event, None, now_ms),
        };
        if capture_equation {
            self.capture_equation_snapshot();
        }
        self.apply_overlay_effects(effects, window, cx);
    }

    /// Carry out the effects of an event or key. Returns whether a key was consumed.
    pub(super) fn apply_overlay_effects(
        &mut self,
        effects: OverlayEffects,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        for edit in effects.edits {
            if let Err(error) = self.run_overlay_edit(edit, window, cx) {
                eprintln!("overlay edit: {error}");
            }
        }
        if let Some(text) = effects.clipboard {
            cx.write_to_clipboard(ClipboardItem::new_string(text));
        }
        if let Some(generation) = effects.copied_timer {
            self.copied_timer = Some(cx.spawn(async move |this, cx| {
                cx.background_executor()
                    .timer(Duration::from_millis(COPIED_MS))
                    .await;
                let _ = this.update(cx, |this, cx| {
                    if this.overlays.copied_expired(generation) {
                        cx.notify();
                    }
                });
            }));
        }
        let mut handled = effects.handled;
        if effects.paste {
            match cx.read_from_clipboard() {
                Some(item) => {
                    if let Some(text) = item.text() {
                        self.overlays.link_insert(&text);
                    }
                }
                // A browser hands a paste over as an event of its own, and only when the
                // key keeps its default action; that event reaches the link field through
                // the input handler.
                None => handled = false,
            }
        }
        if let Some(action) = effects.context_menu_action {
            let menu_target = self.context_menu_target.take();
            self.execute_context_menu_action(action, menu_target, window, cx);
        }
        if let Some((block_id, action)) = effects.block_menu_action {
            if let Err(error) = self.execute_block_menu_action(&block_id, action, window, cx) {
                eprintln!("block menu action: {error}");
            }
        }
        if let Some(block_id) = effects.toggle_local_collapse {
            if !self.flow.local_collapsed.remove(&block_id) {
                self.flow.local_collapsed.insert(block_id);
            }
            self.env_rev = self.env_rev.wrapping_add(1);
            cx.notify();
        }
        if self.overlays.slash_menu().is_none() {
            self.editor.slash_trigger = None;
        }
        if self.overlays.linked_doc_menu().is_none() {
            self.editor.linked_doc_trigger = None;
        }
        if effects.redraw {
            cx.notify();
        }
        handled
    }

    /// The primary button went down on the page: popovers that a click elsewhere
    /// dismisses go away, and the editor places the caret or starts a selection.
    pub(crate) fn page_mouse_down(
        &mut self,
        event: &MouseDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let now_ms = self.now_ms(cx);
        let input = self.link_input_state();
        if self.overlays.equation_editor().is_some() {
            self.dispatch_overlay_event(OverlayEvent::EquationApply, window, cx);
        }
        self.finish_inline_targets(InlineTargetEnd::CommitPreedit, Some(window), Some(cx));
        self.overlays.pointer_pressed(now_ms);
        if self.overlays.equation_editor().is_none() {
            self.equation_snapshot = None;
        }
        self.sync_link_input(input, window, cx);
        self.keyboard_toolbar_dismissed = false;
        self.editor.slash_trigger = None;
        self.editor.linked_doc_trigger = None;
        self.editor.block_selection.clear();
        if let Some(layout) = self.flow_layout() {
            let geometry = crate::page_geometry(f32::from(window.viewport_size().width));
            let world_x = f32::from(event.position.x) - geometry.column_x;
            let world_y = f32::from(event.position.y) - crate::TOPBAR_HEIGHT + self.scroll_y;
            if let Some((block_id, local_x, local_y)) = layout.blocks.iter().find_map(|block| {
                (block.body.kind == FlowKind::Database && block.rect().contains(world_x, world_y))
                    .then(|| {
                        let r = block.rect();
                        (block.block_id.clone(), world_x - r.x, world_y - r.y)
                    })
            }) {
                let prev_sel = self.editor.selection.clone();
                let consumed =
                    self.click_database_point(&block_id, local_x, local_y, Some(window), cx);
                self.show_database_readonly_toast_once(cx);
                let focused_new_row = consumed
                    && self.editor.selection != prev_sel
                    && self.editor.selection.is_some();
                if !focused_new_row {
                    self.clear_body_selection(window, cx);
                    if !consumed && self.database_readonly {
                        self.editor.block_selection = vec![block_id];
                        self.keep_keyboard_on_block_selection = false;
                        self.block_selection_return_caret = None;
                        self.announce_selection(cx);
                        window.notify_text_selection_changed(&self.editor_focus);
                    } else if !consumed {
                        self.editor_focus.focus(window, cx);
                    }
                }
                self.editor.dragging = false;
                cx.notify();
                return;
            }
            // Clicking a non-editable block (Bookmark, Image, Divider, Database body, Table frame)
            // or its horizontal row band selects that whole block into `block_selection` instead
            // of snapping the caret to a distant editable block.
            if let Some(non_editable_id) = layout.blocks.iter().find_map(|block| {
                (!block.editable()
                    && (block.rect().contains(world_x, world_y)
                        || (world_y >= block.rect().y && world_y <= block.rect().bottom())))
                .then(|| block.block_id.clone())
            }) {
                self.commit_active_preedit(window, cx);
                self.editor.selection = None;
                self.editor.block_selection = vec![non_editable_id];
                self.keep_keyboard_on_block_selection = false;
                self.block_selection_return_caret = None;
                self.editor.pending_marks.clear();
                self.editor.last_typing = None;
                self.editor.goal_x = None;
                self.editor.dragging = false;
                self.editor_focus.focus(window, cx);
                self.announce_selection(cx);
                self.sync_slash_trigger(cx);
                self.reset_caret_blink(cx);
                window.notify_text_selection_changed(&self.editor_focus);
                cx.notify();
                return;
            }
            // Clicking empty space below the last block focuses a trailing empty paragraph or
            // appends one (single undo step) instead of jumping back into an earlier code block.
            if event.click_count == 1
                && !event.modifiers.shift
                && let Some(last) = layout.blocks.last()
                && world_y > last.rect().bottom()
            {
                self.handle_click_below_last_block(last, window, cx);
                return;
            }
        }
        if event.click_count == 1
            && !event.modifiers.shift
            && let Some(page_id) = self.hit_inline_reference_at(
                f32::from(event.position.x),
                f32::from(event.position.y),
                window,
            )
        {
            self.open_linked_doc(&page_id, Some(window), cx);
            return;
        }
        self.editor_mouse_down(event, window, cx);
        cx.notify();
    }

    pub(crate) fn root_mouse_move(
        &mut self,
        event: &MouseMoveEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.mode == PlaygroundMode::Page {
            if event.pressed_button != Some(MouseButton::Left) {
                if self.scrollbar_drag.take().is_some() {
                    cx.notify();
                }
            } else if self.update_scrollbar_drag(f32::from(event.position.y), window, cx) {
                return;
            }
        }
        self.dispatch_overlay(
            OverlayEvent::PointerMoved {
                x: f32::from(event.position.x),
                y: f32::from(event.position.y),
                pressed: event.pressed_button == Some(MouseButton::Left),
            },
            window,
            cx,
        );
        if self.mode == PlaygroundMode::Edgeless {
            self.on_edgeless_pointer_move(event, window, cx);
            return;
        }
        if self.mode == PlaygroundMode::Page && self.overlays.dragged_block().is_none() {
            if self.table_cell.as_ref().is_some_and(|c| c.dragging) {
                self.table_cell_mouse_move(event, window, cx);
                return;
            }
            let selecting = self.editor.dragging;
            self.editor_mouse_move(event, window, cx);
            if selecting && !self.editor.dragging {
                cx.notify();
            }
        }
    }

    pub(crate) fn root_mouse_up(
        &mut self,
        event: &MouseUpEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.scrollbar_drag.take().is_some() {
            cx.notify();
        }
        if let Some(cell) = self.table_cell.as_mut() {
            cell.dragging = false;
        }
        if self.mode == PlaygroundMode::Edgeless {
            self.on_edgeless_left_up(event, window, cx);
        }
        self.editor.drag_moved = false;
        self.editor.drag_mode = crate::editor_session::DragSelectionMode::Character;
        // The selection is finished: the formatting toolbar may open over it.
        if std::mem::take(&mut self.editor.dragging) {
            cx.notify();
        }
        self.dispatch_overlay(OverlayEvent::PointerUp, window, cx);
    }

    /// Offer a key to the open record sheet, link field, linked-doc menu, or slash menu before the document gets it.
    pub(crate) fn overlay_key_down(
        &mut self,
        event: &KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        if self.database_record_sheet.is_some() && event.keystroke.key.as_str() == "escape" {
            self.close_database_record_sheet(cx);
            return true;
        }
        if let Some(menu) = self.overlays.linked_doc_menu() {
            let row_count = menu.results.items.len().min(6) + 1;
            let selected = menu.selected;
            match event.keystroke.key.as_str() {
                "down" => {
                    let next = (selected + 1) % row_count;
                    self.dispatch_overlay(OverlayEvent::LinkedDocHover(next), window, cx);
                    return true;
                }
                "up" => {
                    let next = (selected + row_count - 1) % row_count;
                    self.dispatch_overlay(OverlayEvent::LinkedDocHover(next), window, cx);
                    return true;
                }
                "tab" => {
                    let next = if event.keystroke.modifiers.shift {
                        (selected + row_count - 1) % row_count
                    } else {
                        (selected + 1) % row_count
                    };
                    self.dispatch_overlay(OverlayEvent::LinkedDocHover(next), window, cx);
                    return true;
                }
                "enter" => {
                    self.dispatch_overlay(OverlayEvent::LinkedDocSelect(selected), window, cx);
                    return true;
                }
                "escape" => {
                    self.dispatch_overlay(OverlayEvent::CloseLinkedDocMenu, window, cx);
                    return true;
                }
                _ => {}
            }
        }
        let now_ms = self.now_ms(cx);
        let secondary = event.keystroke.modifiers.secondary(cx);
        let input = self.link_input_state();
        self.overlays.set_database_readonly(self.database_readonly);
        let effects = self.overlays.key_down(&event.keystroke, secondary, now_ms);
        let handled = self.apply_overlay_effects(effects, window, cx);
        self.sync_link_input(input, window, cx);
        handled
    }

    /// Run an input-handler call on the toolbar's link field, if that field is open: it
    /// is then the view's text input, and the document's text, selection and composition
    /// stay as they are.
    pub(crate) fn link_input<R>(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
        call: impl FnOnce(&mut LinkBar) -> R,
    ) -> Option<R> {
        let input = self.link_input_state();
        let result = call(self.overlays.active_text_field_mut()?);
        self.sync_link_input(input, window, cx);
        Some(result)
    }

    /// Scroll a code block sideways so the caret at world x `caret_x` stays in view.
    pub(crate) fn reveal_code_caret(&mut self, block_id: &str, caret_x: f32) {
        let Some(layout) = self.flow_layout() else {
            return;
        };
        if let Some(block) = layout.block(block_id)
            && let Some(code) = block.body.code_scroll
        {
            self.overlays
                .reveal_code_x(block_id, caret_x - block.x - code.area.x, code);
        }
    }

    /// What the formatting toolbar shows for the editor's selection: `None` unless the
    /// selection is non-empty, no composition is running, and it covers paragraph or list
    /// text only. Marks and alignment are read once per selection and document revision.
    pub(crate) fn selection_format(&mut self, layout: &FlowLayout) -> Option<SelectionFormat> {
        let selection = self.editor.selection.clone()?;
        if selection.empty() || self.editor.composing() {
            return None;
        }
        let fresh = self
            .overlays
            .format_cache
            .as_ref()
            .is_some_and(|(rev, cached, _)| *rev == self.doc_rev && *cached == selection);
        if !fresh {
            let state = self.read_selection_format(&selection, layout);
            self.overlays.format_cache = Some((self.doc_rev, selection, state));
        }
        let (marks, align) = self.overlays.format_cache.as_ref()?.2.clone()?;
        Some(SelectionFormat {
            anchor_world: bounding_rect(&self.selection_rects(layout))?,
            marks,
            align,
        })
    }

    pub(super) fn read_selection_format(
        &self,
        selection: &DocumentSelection,
        layout: &FlowLayout,
    ) -> Option<(MarkState, Option<BlockAlign>)> {
        let (start, end, a, b, _) = selection.ordered(layout)?;
        let page = self.page()?;
        let mut marks: Option<MarkState> = None;
        // Every paragraph and list block the selection touches is aligned, empty ones too.
        let mut ids: Vec<&str> = Vec::new();
        for block in &layout.blocks[a..=b] {
            let id = block.block_id.as_str();
            if matches!(block.body.kind, FlowKind::Paragraph(_) | FlowKind::List(_)) {
                ids.push(id);
            }
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
            if !block.editable() || to <= from {
                continue;
            }
            // The title and code carry no inline marks.
            if !matches!(block.body.kind, FlowKind::Paragraph(_) | FlowKind::List(_)) {
                return None;
            }
            let (text, _) = page.read_editable_text(id).ok()?;
            let slice = marks_in_range(&text, from as usize, to as usize);
            marks = Some(match marks {
                None => slice,
                Some(all) => MarkState {
                    bold: all.bold && slice.bold,
                    italic: all.italic && slice.italic,
                    underline: all.underline && slice.underline,
                    strike: all.strike && slice.strike,
                    code: all.code && slice.code,
                    link: all.link.filter(|link| Some(link) == slice.link.as_ref()),
                },
            });
        }
        let marks = marks?;
        let mut shared = None;
        shared_alignment(
            self.page_snapshot()?.root.as_ref()?,
            BlockAlign::Left,
            &ids,
            &mut shared,
        );
        Some((marks, shared.flatten()))
    }

    /// Build what the overlays draw inside the page viewport for this frame, and the
    /// per-block paint state.
    pub(crate) fn overlay_page_layer(
        &mut self,
        layout: &FlowLayout,
        palette: &Palette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> (PagePaint, Vec<AnyElement>) {
        let Some(snapshot) = self.snapshot.clone() else {
            return Default::default();
        };
        let now_ms = self.now_ms(cx);
        // The toolbar waits for a plain drag to finish, opens immediately on double/triple
        // click until the pointer moves, and stays hidden in read-only mode.
        let drag_hides_toolbar = self.editor.dragging
            && (self.editor.drag_mode == crate::editor_session::DragSelectionMode::Character
                || self.editor.drag_moved);
        let selection = (!self.page_readonly && !drag_hides_toolbar)
            .then(|| self.selection_format(layout))
            .flatten();
        self.overlays.set_database_readonly(self.database_readonly);
        let local_collapsed = self.flow.local_collapsed.clone();
        let scene = self.overlay_scene(
            &snapshot,
            layout,
            window.layout_direction(),
            selection.as_ref(),
            &local_collapsed,
        );
        let input = self.link_input_state();
        let layer = self
            .overlays
            .page_layer(&scene, palette, now_ms, window, cx);
        // The toolbar, and its link field with it, goes when the selection does.
        if input != self.link_input_state() {
            window.notify_text_input_changed(&self.editor_focus);
            window.notify_text_selection_changed(&self.editor_focus);
        }
        if self.overlays.slash_menu().is_none() {
            self.editor.slash_trigger = None;
        }
        if self.overlays.linked_doc_menu().is_none() {
            self.editor.linked_doc_trigger = None;
        }
        layer
    }

    /// Screen-space popovers of the Page view (plus desktop context overlays in any mode),
    /// drawn above the whole window.
    pub(crate) fn overlay_popovers(
        &mut self,
        palette: &Palette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Vec<AnyElement> {
        let now_ms = self.now_ms(cx);
        let local_collapsed = self.flow.local_collapsed.clone();
        let mut elements = if let Some((snapshot, layout, transform)) = self.active_overlay_target()
        {
            if self.mode == PlaygroundMode::Edgeless {
                let selection = (!self.edgeless_readonly && !self.editor.dragging)
                    .then(|| self.selection_format(&layout))
                    .flatten();
                let scene = self.overlay_scene_with_transform(
                    &snapshot,
                    &layout,
                    window.layout_direction(),
                    selection.as_ref(),
                    transform,
                    &local_collapsed,
                );
                let input = self.link_input_state();
                self.overlays.reconcile_edgeless(&scene, now_ms, window);
                if input != self.link_input_state() {
                    window.notify_text_input_changed(&self.editor_focus);
                    window.notify_text_selection_changed(&self.editor_focus);
                }
                if self.overlays.slash_menu().is_none() {
                    self.editor.slash_trigger = None;
                }
                self.overlays.popovers(&scene, palette, now_ms, window, cx)
            } else {
                let scene = self.overlay_scene_with_transform(
                    &snapshot,
                    &layout,
                    window.layout_direction(),
                    None,
                    transform,
                    &local_collapsed,
                );
                self.overlays.popovers(&scene, palette, now_ms, window, cx)
            }
        } else {
            Vec::new()
        };
        elements.extend(self.overlays.context_overlays(
            self.window_size,
            palette,
            now_ms,
            window,
            cx,
        ));
        elements
    }
}
