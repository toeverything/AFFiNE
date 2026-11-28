use blocksuite_playground_doc::session::SelectionSnapshot;
use ui::{Context, Window};

use crate::PlaygroundView;

use super::*;

impl PlaygroundView {
    /// Handles `@` linked-document overlay events. Returns `true` when consumed.
    pub(super) fn handle_linked_doc_event(
        &mut self,
        event: &OverlayEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        match event {
            OverlayEvent::OpenLinkedDocMenu { block_id, query } => {
                let now_ms = self.now_ms(cx);
                let req = crate::directory::DocQueryRequest::new(query.clone(), 20);
                let offset = self
                    .editor
                    .selection
                    .as_ref()
                    .filter(|sel| sel.focus.block_id == *block_id)
                    .map_or(0, |sel| sel.focus.offset() as usize);
                if let Ok(results) = self.doc_directory().query_linked_docs(&req) {
                    self.overlays.set_linked_doc_menu(Some(LinkedDocMenuState {
                        block_id: block_id.clone(),
                        utf16_offset: offset,
                        query: query.clone(),
                        query_in_document: false,
                        selected: 0,
                        results,
                        presence: Presence::opening(now_ms),
                        rect: None,
                    }));
                    cx.notify();
                }
                true
            }
            OverlayEvent::SetLinkedDocQuery(query) => {
                if let Some((block_id, utf16_offset, query_in_document, presence)) =
                    self.overlays.linked_doc_menu().map(|menu| {
                        (
                            menu.block_id.clone(),
                            menu.utf16_offset,
                            menu.query_in_document,
                            menu.presence,
                        )
                    })
                {
                    let req = crate::directory::DocQueryRequest::new(query.clone(), 20);
                    if let Ok(results) = self.doc_directory().query_linked_docs(&req) {
                        self.overlays.set_linked_doc_menu(Some(LinkedDocMenuState {
                            block_id,
                            utf16_offset,
                            query: query.clone(),
                            query_in_document,
                            selected: 0,
                            results,
                            presence,
                            rect: None,
                        }));
                        cx.notify();
                    }
                }
                true
            }
            OverlayEvent::LinkedDocHover(idx) => {
                if let Some(menu) = self.overlays.linked_doc_menu_mut() {
                    let max_idx = menu.results.items.len().min(6);
                    let next = (*idx).min(max_idx);
                    if menu.selected != next {
                        menu.selected = next;
                        cx.notify();
                    }
                }
                true
            }
            OverlayEvent::LinkedDocSelect(idx) => {
                let Some(menu) = self.overlays.linked_doc_menu().cloned() else {
                    return true;
                };
                let now_ms = self.now_ms(cx);
                let visible_items = menu.results.items.len().min(6);
                let trigger = self.editor.linked_doc_trigger.take();
                let strip = if menu.query_in_document {
                    let found = trigger
                        .as_ref()
                        .filter(|(b, _, _)| *b == menu.block_id)
                        .and_then(|(b, pos, _)| self.typed_linked_doc(b, pos))
                        .map(|(at, caret, _)| (at, caret - at));
                    // Trigger `@` is gone or caret moved out of range: close without leaving a zombie `@`.
                    if found.is_none() {
                        self.overlays.close_linked_doc(now_ms);
                        cx.notify();
                        return true;
                    }
                    found
                } else {
                    None
                };
                let offset = strip.map(|(at, _)| at).unwrap_or_else(|| {
                    self.editor
                        .selection
                        .as_ref()
                        .filter(|sel| sel.focus.block_id == menu.block_id)
                        .map_or(0, |sel| sel.focus.offset())
                });
                let delete_len = strip.map_or(0, |(_, len)| len);
                self.overlays.close_linked_doc(now_ms);

                if *idx < visible_items {
                    let doc_id = menu.results.items[*idx].doc.id.as_str().to_string();
                    let _ = self.insert_inline_reference_chip(
                        &menu.block_id,
                        offset,
                        delete_len,
                        &doc_id,
                        window,
                        cx,
                    );
                } else {
                    let title = if menu.query.trim().is_empty() {
                        "Untitled".to_string()
                    } else {
                        menu.query.trim().to_string()
                    };
                    let intent_id = trigger.map(|(_, _, intent)| intent);
                    if let Ok(summary) = self.doc_directory_mut().create_linked_doc(
                        &title,
                        crate::directory::EditorDocMode::Page,
                        intent_id.as_deref(),
                    ) {
                        let now = self.now_ms(cx) as u64;
                        if self
                            .ensure_workspace_page_and_broadcast(&summary, now)
                            .is_err()
                        {
                            return true;
                        }
                        let should_insert_chip = intent_id.as_deref().is_none_or(|intent| {
                            !self.doc_directory().is_create_intent_linked(intent)
                        });
                        if should_insert_chip
                            && self
                                .insert_inline_reference_chip(
                                    &menu.block_id,
                                    offset,
                                    delete_len,
                                    summary.id.as_str(),
                                    window,
                                    cx,
                                )
                                .is_ok()
                            && let Some(intent) = intent_id.as_deref()
                        {
                            self.doc_directory_mut().mark_create_intent_linked(intent);
                        }
                    }
                }
                true
            }
            OverlayEvent::CloseLinkedDocMenu => {
                let now_ms = self.now_ms(cx);
                self.editor.linked_doc_trigger = None;
                if self.overlays.close_linked_doc(now_ms) {
                    cx.notify();
                }
                true
            }
            OverlayEvent::CreateLinkedDoc {
                block_id,
                title,
                mode,
                intent_id,
            } => {
                if let Ok(summary) =
                    self.doc_directory_mut()
                        .create_linked_doc(title, *mode, intent_id.as_deref())
                {
                    let now = self.now_ms(cx) as u64;
                    if self
                        .ensure_workspace_page_and_broadcast(&summary, now)
                        .is_err()
                    {
                        return true;
                    }
                    let now_ms = self.now_ms(cx);
                    self.editor.linked_doc_trigger = None;
                    self.overlays.close_linked_doc(now_ms);
                    let should_insert_chip = intent_id
                        .as_deref()
                        .is_none_or(|intent| !self.doc_directory().is_create_intent_linked(intent));
                    if should_insert_chip {
                        let offset = self
                            .editor
                            .selection
                            .as_ref()
                            .filter(|sel| sel.focus.block_id == *block_id)
                            .map_or(0, |sel| sel.focus.offset());
                        if self
                            .insert_inline_reference_chip(
                                block_id,
                                offset,
                                0,
                                summary.id.as_str(),
                                window,
                                cx,
                            )
                            .is_ok()
                            && let Some(intent) = intent_id.as_deref()
                        {
                            self.doc_directory_mut().mark_create_intent_linked(intent);
                        }
                    } else {
                        cx.notify();
                    }
                }
                true
            }
            _ => false,
        }
    }

    /// The editor typed an `@` into paragraph or list text: open the linked-doc menu on it.
    pub(crate) fn open_typed_linked_doc_menu(
        &mut self,
        block_id: String,
        at_offset: u64,
        cx: &mut Context<Self>,
    ) {
        let Some(position) = self.page().and_then(|page| {
            page.capture_selection_snapshot(&block_id, at_offset, &block_id, at_offset)
                .ok()
        }) else {
            return;
        };
        let now_ms = self.now_ms(cx);
        let intent_id = loop {
            let candidate = format!("at-{}", self.fresh_block_id());
            if !self.doc_directory().has_create_intent(&candidate) {
                break candidate;
            }
        };
        self.editor.linked_doc_trigger = Some((block_id.clone(), position, intent_id));
        let req = crate::directory::DocQueryRequest::new("", 20);
        let results = self
            .doc_directory()
            .query_linked_docs(&req)
            .unwrap_or_default();
        self.overlays.set_linked_doc_menu(Some(LinkedDocMenuState {
            block_id,
            utf16_offset: at_offset as usize,
            query: String::new(),
            query_in_document: true,
            selected: 0,
            results,
            presence: Presence::opening(now_ms),
            rect: None,
        }));
        cx.notify();
    }

    pub(super) fn typed_linked_doc(
        &self,
        block_id: &str,
        position: &SelectionSnapshot,
    ) -> Option<(u64, u64, String)> {
        let page = self.page()?;
        let resolved = page.resolve_selection_snapshot(position).ok()??;
        let at = resolved.anchor.1;
        if resolved.anchor.0 != block_id || resolved.focus.0 != block_id || resolved.focus.1 != at {
            return None;
        }
        let units: Vec<u16> = page
            .read_editable_text(block_id)
            .ok()?
            .0
            .plain
            .encode_utf16()
            .collect();
        if units.get(at as usize) != Some(&u16::from(b'@')) {
            return None;
        }
        if page
            .capture_selection_snapshot(block_id, at, block_id, at)
            .ok()?
            != *position
        {
            return None;
        }
        let selection = self.editor.selection.as_ref()?;
        let caret = selection.focus.offset();
        if !selection.empty() || selection.focus.block_id != block_id || caret <= at {
            return None;
        }
        let query = String::from_utf16(units.get(at as usize + 1..caret as usize)?).ok()?;
        if query.contains('\n') || query.starts_with(char::is_whitespace) {
            return None;
        }
        Some((at, caret, query))
    }

    /// Keeps an open typed `@` linked-document menu synchronized with the document text.
    pub(crate) fn sync_linked_doc_trigger(&mut self, cx: &Context<Self>) {
        let Some((menu_block, presence)) = self
            .overlays
            .linked_doc_menu()
            .filter(|menu| menu.query_in_document)
            .map(|menu| (menu.block_id.clone(), menu.presence))
        else {
            return;
        };
        let typed = self
            .editor
            .linked_doc_trigger
            .as_ref()
            .filter(|(block_id, _, _)| *block_id == menu_block)
            .and_then(|(block_id, position, _)| self.typed_linked_doc(block_id, position));
        match typed {
            Some((at, _, query)) => {
                let req = crate::directory::DocQueryRequest::new(query.clone(), 20);
                if let Ok(results) = self.doc_directory().query_linked_docs(&req) {
                    self.overlays.set_linked_doc_menu(Some(LinkedDocMenuState {
                        block_id: menu_block,
                        utf16_offset: at as usize,
                        query,
                        query_in_document: true,
                        selected: 0,
                        results,
                        presence,
                        rect: None,
                    }));
                }
            }
            None => {
                let now_ms = self.now_ms(cx);
                self.editor.linked_doc_trigger = None;
                self.overlays.close_linked_doc(now_ms);
            }
        }
    }

    /// Ensures `summary.id` exists in `self.state.workspace` (both root metadata and 4-block
    /// `0.27.5` child page structure: Page, Surface, Note with `[0, 0, 800, 92]`, and empty
    /// Paragraph, with skeleton history cleared from the child page's user undo stack) and
    /// broadcasts any newly produced root and child page CRDT updates to `self.room` if connected.
    ///
    /// Precondition: in full-sync workspace hosts like `playground`, `snap.root.is_none()` means
    /// a newly created page has not been initialized yet; on-demand subdoc hosts (`S2-Client`)
    /// must gate skeleton writes on an explicit create journal and subdoc load-complete state to
    /// avoid conflicting with unloaded remote blocks.
    pub(crate) fn ensure_workspace_page_and_broadcast(
        &mut self,
        summary: &crate::directory::EditorDocSummary,
        now_ms: u64,
    ) -> Result<(), crate::directory::DirectoryError> {
        let doc_id = summary.id.as_str();
        let root_exists = if self.state.workspace.page(doc_id).is_some()
            || self.page_titles.contains_key(doc_id)
        {
            self.state
                .workspace
                .list_pages()
                .map(|pages| pages.iter().any(|p| p.id == doc_id))
                .unwrap_or(false)
        } else {
            false
        };
        let root_commit = if root_exists {
            None
        } else {
            match self
                .state
                .workspace
                .create_page(doc_id, &summary.title, now_ms as i64)
            {
                Ok(commit) => commit,
                Err(err) => {
                    return Err(crate::directory::DirectoryError::Other(err.to_string()));
                }
            }
        };

        let has_root_block = self
            .state
            .workspace
            .page(doc_id)
            .and_then(|page| page.read_page_snapshot().ok())
            .is_some_and(|snap| snap.root.is_some());
        let (page_res, page_commit, clear_res) = if has_root_block {
            (Ok(()), None, Ok(()))
        } else {
            match self.state.workspace.ensure_page(doc_id) {
                Ok(page) => {
                    let page_block = format!("page-{doc_id}");
                    let surface_block = format!("surface-{doc_id}");
                    let note_block = format!("note-{doc_id}");
                    let para_block = format!("para-{doc_id}");
                    match page.structural_edit(now_ms, |page| {
                        page.add_block(
                            &page_block,
                            blocksuite_playground_doc::schema::BlockSpec::Page {
                                title: summary.title.clone(),
                            },
                            None,
                            None,
                            now_ms,
                        )?;
                        page.add_block(
                            &surface_block,
                            blocksuite_playground_doc::schema::BlockSpec::Surface,
                            Some(&page_block),
                            None,
                            now_ms,
                        )?;
                        page.add_block(
                            &note_block,
                            blocksuite_playground_doc::schema::BlockSpec::Note {
                                xywh: Some("[0, 0, 800, 92]".to_string()),
                            },
                            Some(&page_block),
                            None,
                            now_ms,
                        )?;
                        page.add_block(
                            &para_block,
                            blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                                paragraph_type:
                                    blocksuite_playground_doc::schema::ParagraphType::Text,
                                text: String::new(),
                            },
                            Some(&note_block),
                            None,
                            now_ms,
                        )?;
                        Ok(())
                    }) {
                        Ok(commit) => {
                            let history = page.undo_stack_id();
                            let clear = page
                                .inner_mut()
                                .clear_stack_history(history, true, true)
                                .map_err(blocksuite_playground_doc::DocError::from);
                            (Ok(()), commit, clear)
                        }
                        Err(err) => (Err(err), None, Ok(())),
                    }
                }
                Err(err) => (Err(err), None, Ok(())),
            }
        };

        if let Some(room) = &self.room {
            if let Some(commit) = root_commit {
                room.link
                    .send_binary(blocksuite_playground_doc::wire::RoomBinaryFrame::Doc {
                        doc_id: self.state.workspace.room().into(),
                        message: blocksuite_playground_doc::wire::DocMessage::Update(commit.update),
                    });
            }
            if let Some(commit) = page_commit {
                room.link
                    .send_binary(blocksuite_playground_doc::wire::RoomBinaryFrame::Doc {
                        doc_id: doc_id.to_string(),
                        message: blocksuite_playground_doc::wire::DocMessage::Update(commit.update),
                    });
            }
        }

        if let Err(err) = page_res {
            return Err(crate::directory::DirectoryError::Other(err.to_string()));
        }
        if let Err(err) = clear_res {
            return Err(crate::directory::DirectoryError::Other(err.to_string()));
        }

        self.doc_directory_mut()
            .mark_doc_root_registered(&summary.id);
        self.page_titles
            .insert(doc_id.to_string(), summary.title.clone());
        self.env_rev += 1;
        Ok(())
    }
}
