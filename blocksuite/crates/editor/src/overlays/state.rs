use blocksuite_playground_doc::read::BlockContent;
use ui::Keystroke;
use y_octo::Any;

use crate::block_flow::FlowRect;

use super::*;

/// Text a keystroke types, if it types any. `secondary` is the platform's command
/// modifier.
pub(super) fn typed_text(keystroke: &Keystroke, secondary: bool) -> Option<String> {
    let modifiers = &keystroke.modifiers;
    if secondary || modifiers.function {
        return None;
    }
    if let Some(text) = keystroke
        .key_char
        .as_ref()
        .filter(|text| !text.is_empty() && !text.chars().any(char::is_control))
    {
        return Some(text.clone());
    }
    let mut chars = keystroke.key.chars();
    match (chars.next(), chars.next()) {
        (Some(ch), None) if !modifiers.alt => Some(if modifiers.shift {
            ch.to_uppercase().collect()
        } else {
            ch.to_string()
        }),
        _ => None,
    }
}

impl Overlays {
    pub(super) fn open_slash_mut(&mut self) -> Option<&mut SlashMenu> {
        self.slash.as_mut().filter(|menu| !menu.presence.closing)
    }

    /// Dismiss the slash menu. Returns whether one was open.
    pub fn close_slash(&mut self, now_ms: f64) -> bool {
        match self.open_slash_mut() {
            Some(menu) => {
                menu.presence.close(now_ms);
                true
            }
            None => false,
        }
    }

    /// The primary button went down on the page: the slash menu, linked-doc menu, the link
    /// field, context menu, and a block drag end.
    pub fn pointer_pressed(&mut self, now_ms: f64) {
        self.close_slash(now_ms);
        self.close_linked_doc(now_ms);
        self.close_context_menu(now_ms);
        self.close_link_field();
        self.close_equation_editor_at(now_ms);
        self.close_bookmark_prompt_at(now_ms);
        self.drag = None;
    }

    /// Open or reopen the desktop right-click context menu at window-space `anchor`.
    pub fn open_context_menu(
        &mut self,
        anchor: (f32, f32),
        can_copy: bool,
        can_cut: bool,
        can_paste: bool,
        link_url: Option<String>,
        now_ms: f64,
    ) {
        let presence = match self.context_menu.take() {
            Some(menu) => menu.presence.reopened(now_ms),
            None => Presence::opening(now_ms),
        };
        self.context_menu = Some(ContextMenuState {
            anchor,
            can_copy,
            can_cut,
            can_paste,
            link_url,
            selected: None,
            presence,
            rect: None,
        });
    }

    /// Dismiss the desktop right-click context menu with a fade-out transition.
    pub fn close_context_menu(&mut self, now_ms: f64) -> bool {
        match self
            .context_menu
            .as_mut()
            .filter(|menu| !menu.presence.closing)
        {
            Some(menu) => {
                menu.presence.close(now_ms);
                true
            }
            None => false,
        }
    }

    /// Active (non-closing) desktop right-click context menu.
    pub fn context_menu(&self) -> Option<&ContextMenuState> {
        self.context_menu
            .as_ref()
            .filter(|menu| !menu.presence.closing)
    }

    /// Show a transient clipboard fallback toast and return its generation token.
    pub fn show_context_toast(&mut self, message: impl Into<String>) -> u64 {
        self.context_toast_generation += 1;
        let generation = self.context_toast_generation;
        self.context_toast = Some(ContextToast {
            message: message.into(),
            generation,
        });
        generation
    }

    /// Expire the context toast if its generation matches.
    pub fn context_toast_expired(&mut self, generation: u64) -> bool {
        if self
            .context_toast
            .as_ref()
            .is_some_and(|toast| toast.generation == generation)
        {
            self.context_toast = None;
            return true;
        }
        false
    }

    /// Active context toast message, if any.
    pub fn context_toast_message(&self) -> Option<&str> {
        self.context_toast
            .as_ref()
            .map(|toast| toast.message.as_str())
    }

    pub(super) fn open_slash(
        &mut self,
        block_id: String,
        utf16_offset: usize,
        anchor_world: Option<FlowRect>,
        in_document: bool,
        now_ms: f64,
    ) {
        let presence = match self.slash.take() {
            Some(menu) => menu.presence.reopened(now_ms),
            None => Presence::opening(now_ms),
        };
        self.slash = Some(SlashMenu {
            block_id,
            utf16_offset,
            query: String::new(),
            selected: 0,
            query_in_document: in_document,
            anchor_world,
            scroll: 0.0,
            reveal_selected: true,
            presence,
            rect: None,
        });
    }

    /// Open the slash menu at a `/` the editor just typed into a block; the text after it
    /// is the filter.
    pub fn open_typed_slash(&mut self, block_id: String, slash_offset: usize, now_ms: f64) {
        self.open_slash(block_id, slash_offset, None, true, now_ms);
    }

    /// The `/` of the open menu now sits at `slash_offset` of its block, with `query` typed
    /// after it.
    pub fn set_typed_slash(&mut self, slash_offset: usize, query: String) {
        if let Some(menu) = self.open_slash_mut() {
            menu.utf16_offset = slash_offset;
        }
        self.set_slash_query(query, true);
    }

    /// Replace the open menu's filter.
    pub fn set_slash_query(&mut self, query: String, in_document: bool) -> bool {
        match self.open_slash_mut() {
            Some(menu) => {
                if menu.query != query || menu.query_in_document != in_document {
                    menu.query = query;
                    menu.query_in_document = in_document;
                    menu.selected = 0;
                    menu.reveal_selected = true;
                }
                true
            }
            None => false,
        }
    }

    /// Handle one event. `scene` is absent while no page is laid out; events that need the
    /// page are then dropped.
    pub fn handle(
        &mut self,
        event: OverlayEvent,
        scene: Option<&OverlayScene<'_>>,
        now_ms: f64,
    ) -> OverlayEffects {
        let mut effects = OverlayEffects::default();
        match event {
            OverlayEvent::PointerMoved { x, y, pressed } => {
                let Some(scene) = scene else {
                    return effects;
                };
                // The button was released where no release event reached the page.
                if !pressed && self.drag.take().is_some() {
                    effects.redraw = true;
                }
                if let Some(drag) = self.drag.as_mut() {
                    let (_, world_y) = scene.screen_to_world(x, y);
                    let slot = drop_slot(scene, &drag.block_id, world_y);
                    if slot != drag.slot {
                        drag.slot = slot;
                        effects.redraw = true;
                    }
                } else {
                    // A pointer on an open popover does not reach the blocks under it.
                    let shielded = [
                        self.slash_menu().and_then(|menu| menu.rect),
                        self.linked_doc_menu().and_then(|menu| menu.rect),
                        self.open_toolbar().and_then(|toolbar| toolbar.rect),
                        self.equation_editor().and_then(|editor| editor.rect),
                        self.bookmark_prompt().and_then(|prompt| prompt.rect),
                        self.context_menu().and_then(|menu| menu.rect),
                    ]
                    .into_iter()
                    .flatten()
                    .any(|rect| rect.contains(x, y));
                    let hovered = if shielded {
                        self.hovered.clone()
                    } else {
                        hover_block(scene, x, y)
                    };
                    let (world_x, world_y) = scene.screen_to_world(x, y);
                    let handle_hot = !shielded
                        && hovered
                            .as_deref()
                            .and_then(|block_id| scene.layout.block(block_id))
                            .and_then(|block| {
                                drag_handle_rect(
                                    block,
                                    scene.geometry.column_x,
                                    scene.window.0,
                                    scene.direction,
                                    block.has_gutter_chevron,
                                )
                            })
                            .is_some_and(|handle| handle.contains(world_x, world_y));
                    if hovered != self.hovered || handle_hot != self.handle_hot {
                        self.hovered = hovered;
                        self.handle_hot = handle_hot;
                        effects.redraw = true;
                    }
                }
            }
            OverlayEvent::PointerUp => {
                if let Some(drag) = self.drag.take() {
                    if let Some(slot) = drag.slot {
                        if drag.dragged_ids.len() > 1 {
                            effects.edits.push(DocEdit::ReorderMany {
                                parent_id: slot.parent_id,
                                child_ids: drag.dragged_ids,
                                insert_index: slot.insert_index,
                            });
                        } else if let Some(new_index) = slot.reorder_index() {
                            effects.edits.push(DocEdit::Reorder {
                                parent_id: slot.parent_id,
                                child_id: drag.block_id,
                                new_index,
                            });
                        }
                    }
                    effects.redraw = true;
                }
            }
            OverlayEvent::OpenSlashMenu {
                block_id,
                utf16_offset,
                anchor,
            } => {
                let Some(scene) = scene else {
                    return effects;
                };
                if scene.layout.block(&block_id).is_none() {
                    return effects;
                }
                let anchor_world = anchor.map(|anchor| {
                    let (x, y) = scene.screen_to_world(anchor.x, anchor.y);
                    FlowRect::new(x, y, anchor.w, anchor.h)
                });
                let utf16_offset = utf16_offset.min(text_len(scene, &block_id));
                self.open_slash(block_id, utf16_offset, anchor_world, false, now_ms);
                effects.redraw = true;
            }
            OverlayEvent::SetSlashQuery { query, in_document } => {
                effects.redraw = self.set_slash_query(query, in_document);
            }
            OverlayEvent::CloseSlashMenu => {
                effects.redraw = self.close_slash(now_ms);
            }
            OverlayEvent::SlashHover(index) => {
                if let Some(menu) = self.open_slash_mut()
                    && menu.selected != index
                {
                    menu.selected = index;
                    effects.redraw = true;
                }
            }
            OverlayEvent::SlashExecute(index) => {
                self.execute_slash(Some(index), now_ms, &mut effects);
            }
            OverlayEvent::SlashScroll(delta) => {
                if let Some(menu) = self.open_slash_mut() {
                    // Clamped to the list when the menu is laid out.
                    menu.scroll = (menu.scroll - delta).max(0.0);
                    effects.redraw = true;
                }
            }
            // The selection is the editor's; the view sets it there.
            OverlayEvent::SetSelection(_) => {}
            OverlayEvent::Format(action) => self.format(action, &mut effects),
            OverlayEvent::LinkApply => self.apply_link(false, &mut effects),
            OverlayEvent::LinkRemove => self.apply_link(true, &mut effects),
            OverlayEvent::Paste(text) => effects.redraw = self.link_insert(&text),
            OverlayEvent::ToggleChecked(block_id) => {
                if let Some(scene) = scene
                    && let Some(BlockContent::List { checked, .. }) =
                        scene.snapshot.block(&block_id).map(|node| &node.content)
                {
                    if !*checked {
                        self.todo_pulses.insert(
                            block_id.clone(),
                            EaseOut::with_duration(0.0, 1.0, now_ms, TODO_PULSE_MS),
                        );
                    } else {
                        self.todo_pulses.remove(&block_id);
                    }
                    effects.edits.push(DocEdit::SetProp {
                        block_id,
                        key: "prop:checked",
                        value: if *checked { Any::False } else { Any::True },
                    });
                    effects.redraw = true;
                }
            }
            OverlayEvent::ToggleCollapsed(block_id) => {
                let Some(scene) = scene else {
                    return effects;
                };
                let Some(node) = scene.snapshot.block(&block_id) else {
                    return effects;
                };
                // A toggle without children shows no state to turn between.
                let (collapsed, animated) = match &node.content {
                    BlockContent::List { collapsed, .. } => (*collapsed, !node.children.is_empty()),
                    BlockContent::Paragraph { collapsed, .. } => (*collapsed, true),
                    _ => return effects,
                };
                if animated {
                    let rest = |collapsed: bool| if collapsed { 0.0 } else { 1.0 };
                    let from = self
                        .chevrons
                        .get(&block_id)
                        .map_or(rest(collapsed), |motion| motion.value_at(now_ms));
                    self.chevrons.insert(
                        block_id.clone(),
                        EaseOut::new(from, rest(!collapsed), now_ms),
                    );
                }
                effects.edits.push(DocEdit::SetProp {
                    block_id,
                    key: "prop:collapsed",
                    value: if collapsed { Any::False } else { Any::True },
                });
            }
            OverlayEvent::CopyCode(block_id) => {
                if let Some(scene) = scene
                    && let Some(BlockContent::Code { text, .. }) =
                        scene.snapshot.block(&block_id).map(|node| &node.content)
                {
                    self.copied_generation += 1;
                    self.copied = Some((block_id, self.copied_generation));
                    effects.clipboard = Some(text.clone());
                    effects.copied_timer = Some(self.copied_generation);
                    effects.redraw = true;
                }
            }
            OverlayEvent::ToggleCodeWrap(block_id) => {
                super::helpers::push_toggle_code_wrap(block_id, scene, &mut effects);
            }
            OverlayEvent::SetCodeLanguage { block_id, language } => {
                effects.edits.push(DocEdit::SetProp {
                    block_id,
                    key: "prop:language",
                    value: super::helpers::normalize_code_language(&language),
                });
                effects.redraw = true;
            }
            OverlayEvent::ToggleCodePreview(_) | OverlayEvent::ExternalEmbedInteract { .. } => {}
            OverlayEvent::DragStart(block_id) => {
                self.start_drag(block_id, Vec::new(), now_ms);
                effects.redraw = true;
            }
            OverlayEvent::OpenEquationEditor { target, initial } => {
                self.open_equation_editor(target, initial, now_ms);
                effects.redraw = true;
            }
            OverlayEvent::EquationApply => self.apply_equation(now_ms, &mut effects),
            OverlayEvent::EquationClick { x, y, shift } => {
                if let Some(editor) = self.equation_editor_mut()
                    && editor.click_at(x, y, shift)
                {
                    effects.redraw = true;
                }
            }
            OverlayEvent::CloseEquationEditor => {
                if self.close_equation_editor_at(now_ms) {
                    effects.redraw = true;
                }
            }
            OverlayEvent::OpenBookmarkPrompt { block_id } => {
                self.open_bookmark_prompt(block_id.clone(), now_ms);
                effects.redraw = true;
            }
            OverlayEvent::BookmarkApply => self.apply_bookmark(now_ms, &mut effects),
            OverlayEvent::CloseBookmarkPrompt => {
                if self.close_bookmark_prompt_at(now_ms) {
                    effects.redraw = true;
                }
            }
            OverlayEvent::KeyboardToolbarScroll(delta_x) => {
                if let Some(s) = scene
                    && self.scroll_keyboard_toolbar_strip(s, delta_x)
                {
                    effects.redraw = true;
                }
            }
            OverlayEvent::KeyboardToolbarPanelScroll(delta_y) => {
                if let Some(s) = scene
                    && self.scroll_active_keyboard_tool_panel(s, delta_y)
                {
                    effects.redraw = true;
                }
            }
            OverlayEvent::CloseContextMenu => {
                effects.redraw = self.close_context_menu(now_ms);
            }
            OverlayEvent::OpenLinkedDocMenu { .. }
            | OverlayEvent::SetLinkedDocQuery(_)
            | OverlayEvent::LinkedDocHover(_)
            | OverlayEvent::LinkedDocSelect(_)
            | OverlayEvent::CloseLinkedDocMenu
            | OverlayEvent::CreateLinkedDoc { .. }
            | OverlayEvent::SetKeyboardToolbarVisible(_)
            | OverlayEvent::KeyboardToolbar(_)
            | OverlayEvent::InsertImageBytes { .. }
            | OverlayEvent::FocusTableCell { .. }
            | OverlayEvent::TableCellMouseDown { .. }
            | OverlayEvent::AttachmentPdfPage { .. }
            | OverlayEvent::OpenEmbedDoc { .. }
            | OverlayEvent::LongPressWord { .. }
            | OverlayEvent::OpenContextMenu { .. }
            | OverlayEvent::ContextMenuAction(_) => {}
        }
        effects
    }

    /// A key went down in the editor. The link field, while open, takes every key but the
    /// ones that type text, which reach it through the input handler; the slash menu takes
    /// its navigation keys, and the filter keys as well when the filter is its own rather
    /// than text in the document. `secondary` is the platform's command modifier.
    pub fn key_down(
        &mut self,
        keystroke: &Keystroke,
        secondary: bool,
        now_ms: f64,
    ) -> OverlayEffects {
        let mut effects = OverlayEffects::default();
        let key = keystroke.key.as_str();
        let shift = keystroke.modifiers.shift;

        if let Some((close, action)) = self
            .context_menu
            .as_mut()
            .and_then(|menu| menu.handle_key(key))
        {
            if close {
                self.close_context_menu(now_ms);
            }
            effects.context_menu_action = action;
            effects.handled = true;
            effects.redraw = true;
            return effects;
        }

        #[derive(Clone, Copy, PartialEq, Eq)]
        enum ActiveFieldKind {
            Equation,
            Bookmark,
            Link,
        }
        let active_kind = if self.equation_editor().is_some() {
            Some(ActiveFieldKind::Equation)
        } else if self.bookmark_prompt().is_some() {
            Some(ActiveFieldKind::Bookmark)
        } else if self.link_field().is_some() {
            Some(ActiveFieldKind::Link)
        } else {
            None
        };
        if let Some(field_kind) = active_kind {
            if self.active_text_field().is_some_and(LinkBar::composing) {
                if key == "escape"
                    && let Some(field) = self.active_text_field_mut()
                {
                    field.mark(None, "", None);
                    effects.handled = true;
                    effects.redraw = true;
                }
                return effects;
            }
            effects.handled = true;
            effects.redraw = true;
            match key {
                "enter" => match field_kind {
                    ActiveFieldKind::Equation => {
                        if shift {
                            if let Some(field) = self.active_text_field_mut() {
                                field.replace(None, "\n");
                            }
                        } else {
                            self.apply_equation(now_ms, &mut effects);
                        }
                    }
                    ActiveFieldKind::Bookmark => self.apply_bookmark(now_ms, &mut effects),
                    ActiveFieldKind::Link => self.apply_link(false, &mut effects),
                },
                "up" | "down" if field_kind == ActiveFieldKind::Equation && !secondary => {
                    if let Some(editor) = self.equation_editor_mut() {
                        editor.move_vertical_line(key == "down", shift);
                    }
                }
                "escape" => match field_kind {
                    ActiveFieldKind::Equation => {
                        self.close_equation_editor_at(now_ms);
                    }
                    ActiveFieldKind::Bookmark => {
                        self.close_bookmark_prompt_at(now_ms);
                    }
                    ActiveFieldKind::Link => {
                        self.close_link_field();
                    }
                },
                "v" if secondary => effects.paste = true,
                "c" | "x" if secondary => {
                    if let Some(field) = self.active_text_field_mut()
                        && !field.input.selection.is_empty()
                    {
                        effects.clipboard = Some(field.selected_text().to_string());
                        if key == "x" {
                            field.replace(None, "");
                        }
                    }
                }
                _ => {
                    if let Some(field) = self.active_text_field_mut()
                        && !field.key(key, shift, secondary)
                        && typed_text(keystroke, secondary).is_some()
                    {
                        effects.handled = false;
                        effects.redraw = false;
                    }
                }
            }
            return effects;
        }

        let allow_database = !self.database_readonly;
        let Some(menu) = self.open_slash_mut() else {
            return effects;
        };
        let count = filter_slash_items_for(&menu.query, allow_database).len();
        effects.handled = true;
        effects.redraw = true;
        match key {
            // `Tab` and `Shift+Tab` step through the items like the arrows, and never
            // reach the block.
            "down" | "up" | "tab" if count > 0 => {
                let back = key == "up" || (key == "tab" && shift);
                menu.selected = (menu.selected + if back { count - 1 } else { 1 }) % count;
                menu.reveal_selected = true;
            }
            // When triggered in-document with no matching items (popover hidden), `Enter`,
            // `Up`, and `Down` close the menu and pass through to the editor.
            "enter" | "up" | "down" if count == 0 && menu.query_in_document => {
                self.close_slash(now_ms);
                effects.handled = false;
            }
            "tab" => {}
            "enter" if count > 0 => self.execute_slash(None, now_ms, &mut effects),
            "enter" | "escape" => {
                self.close_slash(now_ms);
            }
            // Text typed after the `/` in the document is the editor's to edit.
            _ if menu.query_in_document => {
                effects.handled = false;
                effects.redraw = false;
            }
            "down" | "up" => {}
            "backspace" => {
                if menu.query.pop().is_none() {
                    self.close_slash(now_ms);
                } else {
                    menu.selected = 0;
                    menu.reveal_selected = true;
                }
            }
            _ => match typed_text(keystroke, secondary) {
                Some(text) => {
                    menu.query.push_str(&text);
                    menu.selected = 0;
                    menu.reveal_selected = true;
                }
                None => {
                    effects.handled = false;
                    effects.redraw = false;
                }
            },
        }
        effects
    }

    fn execute_slash(&mut self, index: Option<usize>, now_ms: f64, effects: &mut OverlayEffects) {
        let Some(menu) = self.slash_menu() else {
            return;
        };
        let items = filter_slash_items_for(&menu.query, !self.database_readonly);
        let Some(item) = items.get(index.unwrap_or(menu.selected)) else {
            return;
        };
        effects.edits.push(DocEdit::Slash {
            block_id: menu.block_id.clone(),
            command: item.command,
            typed: menu.query_in_document,
        });
        self.close_slash(now_ms);
        effects.redraw = true;
    }

    /// Scroll the unwrapped code block under a screen-space point sideways. Returns whether
    /// the scroll belonged to a code block or docked keyboard toolbar (and must not scroll the page).
    pub fn scroll_code(
        &mut self,
        scene: &OverlayScene<'_>,
        x: f32,
        y: f32,
        delta_x: f32,
        delta_y: f32,
    ) -> bool {
        if self.scroll_keyboard_toolbar_at(scene, x, y, delta_x, delta_y)
            || self.scroll_keyboard_tool_panel(scene, x, y, delta_y)
        {
            return true;
        }
        if delta_x == 0.0 || delta_x.abs() < delta_y.abs() {
            return false;
        }
        let (world_x, world_y) = scene.screen_to_world(x, y);
        for block in &scene.layout.blocks {
            let Some(code) = block.body.code_scroll else {
                continue;
            };
            if !block.rect().contains(world_x, world_y) {
                continue;
            }
            let current = self.code_scroll_x_for(&block.block_id, code);
            let next = (current - delta_x).clamp(0.0, code.max_x).round();
            self.code_scroll.insert(block.block_id.clone(), next);
            return true;
        }
        false
    }

    /// Drop state that no longer matches the page, and finished transitions.
    pub(super) fn reconcile(&mut self, scene: &OverlayScene<'_>, now_ms: f64) {
        let layout = scene.layout;
        self.chevrons.retain(|block_id, motion| {
            !motion.is_finished(now_ms) && layout.block(block_id).is_some()
        });
        self.todo_pulses.retain(|block_id, motion| {
            !motion.is_finished(now_ms) && layout.block(block_id).is_some()
        });
        self.code_scroll.retain(|block_id, scroll| {
            match layout
                .block(block_id)
                .and_then(|block| block.body.code_scroll)
            {
                Some(code) => {
                    *scroll = scroll.clamp(0.0, code.max_x);
                    (*scroll - code.initial_x).abs() > f32::EPSILON
                }
                None => false,
            }
        });
        if self
            .hovered
            .as_ref()
            .is_some_and(|block_id| layout.block(block_id).is_none())
        {
            self.hovered = None;
        }
        if self
            .drag
            .as_ref()
            .is_some_and(|drag| layout.block(&drag.block_id).is_none())
        {
            self.drag = None;
        }
        if self
            .copied
            .as_ref()
            .is_some_and(|(block_id, _)| layout.block(block_id).is_none())
        {
            self.copied = None;
        }
        if self.slash.as_ref().is_some_and(|menu| {
            menu.presence.gone(now_ms) || layout.block(&menu.block_id).is_none()
        }) {
            self.slash = None;
        }
        if self.linked_doc.as_ref().is_some_and(|menu| {
            menu.presence.gone(now_ms) || layout.block(&menu.block_id).is_none()
        }) {
            self.linked_doc = None;
        }
        self.sync_toolbar(scene.selection, now_ms);
        if self
            .toolbar
            .as_ref()
            .is_some_and(|toolbar| toolbar.presence.gone(now_ms))
        {
            self.toolbar = None;
        }
        if self.equation.as_ref().is_some_and(|editor| {
            editor.presence.gone(now_ms) || layout.block(editor.target.block_id()).is_none()
        }) {
            self.equation = None;
        }
        if self.bookmark.as_ref().is_some_and(|prompt| {
            prompt.presence.gone(now_ms) || layout.block(&prompt.block_id).is_none()
        }) {
            self.bookmark = None;
        }
        if self
            .context_menu
            .as_ref()
            .is_some_and(|menu| menu.presence.gone(now_ms))
        {
            self.context_menu = None;
        }
    }

    pub(super) fn in_flight(&self, now_ms: f64) -> bool {
        !self.chevrons.is_empty()
            || !self.todo_pulses.is_empty()
            || self
                .slash
                .as_ref()
                .is_some_and(|menu| menu.presence.in_flight(now_ms) || menu.presence.closing)
            || self
                .linked_doc
                .as_ref()
                .is_some_and(|menu| menu.presence.in_flight(now_ms) || menu.presence.closing)
            || self.toolbar.as_ref().is_some_and(|toolbar| {
                toolbar.presence.in_flight(now_ms) || toolbar.presence.closing
            })
            || self
                .equation
                .as_ref()
                .is_some_and(|editor| editor.presence.in_flight(now_ms) || editor.presence.closing)
            || self
                .bookmark
                .as_ref()
                .is_some_and(|prompt| prompt.presence.in_flight(now_ms) || prompt.presence.closing)
            || self
                .context_menu
                .as_ref()
                .is_some_and(|menu| menu.presence.in_flight(now_ms) || menu.presence.closing)
    }
}
