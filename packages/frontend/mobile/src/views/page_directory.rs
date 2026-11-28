//! Live [`WorkspaceDocDirectory`] adapter injected into the mobile shell's embedded
//! `PlaygroundView` for `@` mention search, navigation, and inline linked-doc creation.

use std::{cell::RefCell, collections::HashMap, rc::Rc};

use affine_client::Origin;
use playground::directory::{
    DirectoryError, DocQueryPage, DocQueryRequest, EditorDocId, EditorDocMode, EditorDocPreview,
    EditorDocSummary, MatchedDocSummary, WorkspaceDocDirectory, match_exact_substring_utf16,
};

use crate::state::{MobileAppState, MobileDocRecord};

/// Host-level event emitted by the embedded `PlaygroundView` or its `WorkspaceDocDirectory`.
#[derive(Clone, Debug)]
pub(super) enum EditorShellEvent {
    OpenDoc(String),
    CreateDoc { id: String, title: String },
}

#[derive(Default)]
pub(super) struct MobileDirShared {
    docs: Vec<EditorDocSummary>,
    previews: HashMap<String, EditorDocPreview>,
    create_intents: HashMap<String, (EditorDocSummary, bool)>,
    next_seq: u64,
    pub(super) pending_events: Vec<EditorShellEvent>,
}

/// Live `WorkspaceDocDirectory` adapter injected into `PlaygroundView` for `@` mention search,
/// navigation, and inline linked-doc creation against the active mobile workspace.
#[derive(Clone)]
pub(super) struct MobileShellDocDirectory {
    shared: Rc<RefCell<MobileDirShared>>,
}

impl MobileShellDocDirectory {
    pub(super) fn new(shared: Rc<RefCell<MobileDirShared>>) -> Self {
        Self { shared }
    }
}

impl WorkspaceDocDirectory for MobileShellDocDirectory {
    fn query_linked_docs(&self, req: &DocQueryRequest) -> Result<DocQueryPage, DirectoryError> {
        if req.cancel.is_cancelled() {
            return Ok(DocQueryPage {
                items: Vec::new(),
                next_cursor: None,
                cancelled: true,
            });
        }
        let shared = self.shared.borrow();
        let mut matches: Vec<MatchedDocSummary> = shared
            .docs
            .iter()
            .filter_map(|doc| {
                let (score, highlights) = match_exact_substring_utf16(&doc.title, &req.query)?;
                Some(MatchedDocSummary {
                    doc: doc.clone(),
                    score,
                    title_highlights: highlights,
                })
            })
            .collect();
        matches.sort_by(|a, b| {
            a.score
                .total_cmp(&b.score)
                .then_with(|| b.doc.updated_at_ms.cmp(&a.doc.updated_at_ms))
        });
        let limit = req.limit.max(1);
        matches.truncate(limit);
        Ok(DocQueryPage {
            items: matches,
            next_cursor: None,
            cancelled: false,
        })
    }

    fn rename_doc_title(
        &mut self,
        id: &EditorDocId,
        title: &str,
    ) -> Result<EditorDocSummary, DirectoryError> {
        let mut shared = self.shared.borrow_mut();
        let Some(doc) = shared.docs.iter_mut().find(|d| d.id == *id) else {
            return Err(DirectoryError::NotFound(id.clone()));
        };
        doc.title = title.to_string();
        Ok(doc.clone())
    }

    fn create_linked_doc(
        &mut self,
        title: &str,
        mode: EditorDocMode,
        intent_id: Option<&str>,
    ) -> Result<EditorDocSummary, DirectoryError> {
        let mut shared = self.shared.borrow_mut();
        if let Some(intent) = intent_id
            && let Some((existing, _)) = shared.create_intents.get(intent)
        {
            return Ok(existing.clone());
        }
        shared.next_seq += 1;
        let id = format!("doc-linked-{}", shared.next_seq);
        let summary = EditorDocSummary {
            id: EditorDocId::new(id.clone()),
            title: title.to_string(),
            mode,
            updated_at_ms: 1_764_002_000 + (shared.next_seq as i64),
        };
        shared.docs.push(summary.clone());
        if let Some(intent) = intent_id {
            shared
                .create_intents
                .insert(intent.to_string(), (summary.clone(), false));
        }
        shared.pending_events.push(EditorShellEvent::CreateDoc {
            id,
            title: title.to_string(),
        });
        Ok(summary)
    }

    fn has_create_intent(&self, intent_id: &str) -> bool {
        self.shared.borrow().create_intents.contains_key(intent_id)
    }

    fn is_create_intent_linked(&self, intent_id: &str) -> bool {
        self.shared
            .borrow()
            .create_intents
            .get(intent_id)
            .is_some_and(|(_, linked)| *linked)
    }

    fn mark_create_intent_linked(&mut self, intent_id: &str) {
        if let Some((_, linked)) = self.shared.borrow_mut().create_intents.get_mut(intent_id) {
            *linked = true;
        }
    }

    fn mark_doc_root_registered(&mut self, _id: &EditorDocId) {}

    fn doc_preview(&self, id: &EditorDocId) -> Option<EditorDocPreview> {
        self.shared.borrow().previews.get(id.as_str()).cloned()
    }
}

/// Refresh the shared directory snapshot from the active workspace's non-trashed docs.
pub(super) fn sync_directory_snapshot(
    state: &MobileAppState,
    shared: &Rc<RefCell<MobileDirShared>>,
) {
    let locale = state.locale();
    let mut guard = shared.borrow_mut();
    guard.docs.clear();
    guard.previews.clear();
    for doc in &state.active_workspace().docs {
        if doc.trashed {
            continue;
        }
        let title = doc.display_title(locale);
        guard.docs.push(EditorDocSummary {
            id: EditorDocId::new(doc.id.clone()),
            title: title.clone(),
            mode: EditorDocMode::Page,
            updated_at_ms: doc.updated_at_ms,
        });
        guard.previews.insert(
            doc.id.clone(),
            EditorDocPreview {
                title,
                snippet: doc.body_preview.clone(),
                updated_at_ms: doc.updated_at_ms,
                revision: doc.clock,
            },
        );
    }
}

/// Drain pending open/create events emitted by the embedded `PlaygroundView` into `MobileAppState`.
pub(super) fn drain_editor_events(
    state: &mut MobileAppState,
    shared: &Rc<RefCell<MobileDirShared>>,
    now_ms: f64,
) {
    let events: Vec<EditorShellEvent> = {
        let mut guard = shared.borrow_mut();
        std::mem::take(&mut guard.pending_events)
    };
    for ev in events {
        match ev {
            EditorShellEvent::CreateDoc { id, title } => {
                let ws = state.active_workspace_mut();
                if !ws.docs.iter().any(|d| d.id == id) {
                    ws.docs.push(MobileDocRecord {
                        id: id.clone(),
                        title,
                        body_preview: String::new(),
                        tags: Vec::new(),
                        updated_at_ms: (now_ms as i64).max(1_764_002_000),
                        is_favorite: false,
                        trashed: false,
                        journal_date: None,
                        clock: 1,
                        outgoing_edges: Vec::new(),
                        blocks: Vec::new(),
                    });
                    ws.summary.doc_count = ws.docs.iter().filter(|d| !d.trashed).count();
                }
            }
            EditorShellEvent::OpenDoc(target_id) => {
                if state.doc_by_id(&target_id).is_some() {
                    let parent_seq = state
                        .active_workspace()
                        .history
                        .current()
                        .map(|e| e.seq)
                        .unwrap_or(0);
                    state.open_doc(
                        &target_id,
                        Origin::DocLink {
                            parent_seq,
                            block_id: None,
                        },
                    );
                }
            }
        }
    }
}
