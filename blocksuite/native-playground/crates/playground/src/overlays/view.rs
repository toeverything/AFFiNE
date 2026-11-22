use std::{ops::Range, time::Duration};

use blocksuite_playground_doc::{
    read::{PageSnapshot, TextAlign as BlockAlign},
    session::SelectionSnapshot,
};
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
        selection: Option<&'a SelectionFormat>,
    ) -> OverlayScene<'a> {
        OverlayScene {
            snapshot,
            layout,
            geometry: crate::block_flow::page_geometry(self.window_size.0),
            window: self.window_size,
            scroll_y: self.scroll_y,
            selection,
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
    pub(super) fn link_input_state(
        &self,
    ) -> Option<(String, Range<usize>, bool, Option<Range<usize>>)> {
        let link = self.overlays.link_field()?;
        let (selection, reversed) = link.shown_selection();
        Some((link.text(), selection, reversed, link.marked_range()))
    }

    /// Tell the platform's text input (AppKit, the browser's mirror element) that the
    /// link field opened, closed, or changed its text, selection or composition since
    /// `before`: the field and the document take turns being the view's text input.
    pub(super) fn sync_link_input(
        &mut self,
        before: Option<(String, Range<usize>, bool, Option<Range<usize>>)>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if before != self.link_input_state() {
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
                self.overlays.close_link_field();
                match selection {
                    Some(selection) => self.select_document_range(
                        DocumentSelection {
                            anchor: DocPoint::new(
                                &selection.block_id,
                                selection.start_utf16 as u64,
                            ),
                            focus: DocPoint::new(&selection.block_id, selection.end_utf16 as u64),
                        },
                        window,
                        cx,
                    ),
                    None => {
                        // Peers stop showing the caret, and a typed slash menu has no
                        // caret left to filter by.
                        self.editor.selection = None;
                        self.announce_selection(cx);
                        self.sync_slash_trigger(cx);
                        window.notify_text_selection_changed(&self.editor_focus);
                        cx.notify();
                    }
                }
                return;
            }
            OverlayEvent::DragStart(_) => self.editor.dragging = false,
            _ => {}
        }
        let now_ms = self.now_ms(cx);
        let page = match self.mode {
            PlaygroundMode::Page => self.snapshot.clone().zip(self.flow_layout()),
            PlaygroundMode::Edgeless => None,
        };
        let effects = match &page {
            Some((snapshot, layout)) => {
                let scene = self.overlay_scene(snapshot, layout, None);
                self.overlays.handle(event, Some(&scene), now_ms)
            }
            None => self.overlays.handle(event, None, now_ms),
        };
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
        if self.overlays.slash_menu().is_none() {
            self.editor.slash_trigger = None;
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
        self.overlays.pointer_pressed(now_ms);
        self.sync_link_input(input, window, cx);
        self.editor.slash_trigger = None;
        self.editor_mouse_down(event, window, cx);
        // A double or triple click selects at once; only a plain press starts a drag the
        // formatting toolbar waits for.
        if event.click_count >= 2 {
            self.editor.dragging = false;
        }
        cx.notify();
    }

    pub(crate) fn root_mouse_move(
        &mut self,
        event: &MouseMoveEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
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
        if self.mode == PlaygroundMode::Edgeless {
            self.on_edgeless_left_up(event, window, cx);
        }
        // The selection is finished: the formatting toolbar may open over it.
        if std::mem::take(&mut self.editor.dragging) {
            cx.notify();
        }
        self.dispatch_overlay(OverlayEvent::PointerUp, window, cx);
    }

    /// Offer a key to the open link field or slash menu before the document gets it.
    pub(crate) fn overlay_key_down(
        &mut self,
        event: &KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        let now_ms = self.now_ms(cx);
        let secondary = event.keystroke.modifiers.secondary(cx);
        let input = self.link_input_state();
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
        let result = call(self.overlays.link_field_mut()?);
        self.sync_link_input(input, window, cx);
        Some(result)
    }

    /// The editor typed a `/` into paragraph or list text: open the slash menu on it.
    ///
    /// The `/` is remembered as a relative position naming that very character, so text
    /// a peer inserts before it moves the menu along instead of misplacing it.
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
    /// typed between the two.
    ///
    /// `None` when the menu has nothing left to act on: the character at the position is
    /// not that `/` any more (deleted, or deleted and typed again by a peer, which is
    /// another character), the caret is not a caret in the same block behind it, or the
    /// text between them holds whitespace.
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
        // A position resolves to where a deleted character was; only the same character
        // gives the same position back.
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
        (!query.chars().any(char::is_whitespace)).then_some((slash, caret, query))
    }

    /// After a local or remote edit or a selection change: the text between the typed `/`
    /// and the caret is the slash menu's filter, and the menu follows the `/`. The menu
    /// closes once [`Self::typed_slash`] finds nothing to act on.
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
    pub(super) fn selection_format(&mut self, layout: &FlowLayout) -> Option<SelectionFormat> {
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
        // The toolbar waits for the selection to be finished.
        let selection = self
            .selection_format(layout)
            .filter(|_| !self.editor.dragging);
        let scene = self.overlay_scene(&snapshot, layout, selection.as_ref());
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
        layer
    }

    /// Screen-space popovers of the Page view, drawn above the whole window.
    pub(crate) fn overlay_popovers(
        &mut self,
        palette: &Palette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Vec<AnyElement> {
        if self.mode != PlaygroundMode::Page {
            return Vec::new();
        }
        let Some((snapshot, layout)) = self.snapshot.clone().zip(self.flow_layout()) else {
            return Vec::new();
        };
        let now_ms = self.now_ms(cx);
        let scene = self.overlay_scene(&snapshot, &layout, None);
        self.overlays.popovers(&scene, palette, now_ms, window, cx)
    }
}
