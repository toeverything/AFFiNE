//! Production [`blocksuite_editor::WorkspaceDocDirectory`] backed by a shared
//! `Arc<Mutex<WorkspaceDirectory>>` (Single Root Writer).
//!
//! Enforces all four-reviewer locked invariants:
//! 1. Persists `root_registered = true` immediately upon root doc write success (decoupled from
//!    child page skeleton initialization).
//! 2. Replaying an `intent_id` whose root-registered document was deleted from `meta.pages`
//!    always returns `Err(DirectoryError::NotFound)` and never revives the deleted document (`F1`).
//! 3. Persists unfinished create intents across session restarts (`export_recovery_state` /
//!    `import_recovery_state`) and retires them idempotently once confirmed.
//! 4. Ephemeral (`intent_id: None`) creations use a 128-bit CSPRNG replica seed (`getrandom`)
//!    + existence guard so offline replicas across processes never collide on `"ephemeral-1"`.

use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex, MutexGuard},
};

use affine_store::{
    directory::{CreateDocId, CreateDocRequest, DocId, DocMode, DocQuery, WorkspaceDirectory},
    workspace_db::{PendingDocUpdate, derive_page_id_for_op},
};
use blocksuite_editor::{
    DirectoryError, DocQueryPage, DocQueryRequest, EditorDocId, EditorDocMode, EditorDocSummary,
    MatchedDocSummary, WorkspaceDocDirectory, match_exact_substring_utf16,
};
use serde::{Deserialize, Serialize};

fn generate_replica_seed_hex() -> Result<String, DirectoryError> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes)
        .map_err(|err| DirectoryError::Other(format!("CSPRNG failure: {err}")))?;
    let mut out = String::with_capacity(32);
    for b in bytes {
        use std::fmt::Write as _;
        let _ = write!(&mut out, "{b:02x}");
    }
    Ok(out)
}

/// Persisted state for a single linked-document creation intent.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateIntentEntry {
    pub doc_id: String,
    pub mode: String,
    /// `true` immediately after `WorkspaceDb` writes `meta.pages` + `spaces[pageId]`.
    pub root_registered: bool,
    /// `true` once the caller inserted the source reference chip for this intent.
    pub source_linked: bool,
    /// `true` once the child page skeleton initialization has been confirmed.
    pub skeleton_initialized: bool,
}

/// Workspace-bound serializable create-intent ledger surviving restarts.
#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateIntentLedger {
    pub space_id: String,
    pub intents: BTreeMap<String, CreateIntentEntry>,
}

/// Production [`WorkspaceDocDirectory`] backed by a shared [`WorkspaceDirectory`] and [`CreateIntentLedger`].
pub struct StoreBackedDocDirectory {
    directory: Arc<Mutex<WorkspaceDirectory>>,
    ledger: CreateIntentLedger,
    now_ms: i64,
    replica_seed: Option<String>,
    next_ephemeral_op: u64,
}

impl StoreBackedDocDirectory {
    /// Wrap a newly owned [`WorkspaceDirectory`] in a shared single-root-writer handle.
    pub fn new(directory: WorkspaceDirectory, initial_now_ms: i64) -> Self {
        Self::from_shared(Arc::new(Mutex::new(directory)), initial_now_ms)
    }

    /// Attach to an existing shared [`WorkspaceDirectory`] (e.g. shared with [`crate::WorkspaceDomainService`]).
    pub fn from_shared(directory: Arc<Mutex<WorkspaceDirectory>>, initial_now_ms: i64) -> Self {
        let space_id = directory
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .db()
            .space_id()
            .to_string();
        let replica_seed = generate_replica_seed_hex().ok();
        Self {
            directory,
            ledger: CreateIntentLedger {
                space_id,
                intents: BTreeMap::new(),
            },
            now_ms: initial_now_ms,
            replica_seed,
            next_ephemeral_op: 0,
        }
    }

    pub fn shared_directory(&self) -> Arc<Mutex<WorkspaceDirectory>> {
        Arc::clone(&self.directory)
    }

    pub fn lock_directory(&self) -> MutexGuard<'_, WorkspaceDirectory> {
        self.directory.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn set_now_ms(&mut self, now_ms: i64) {
        self.now_ms = now_ms;
    }

    pub fn ledger(&self) -> &CreateIntentLedger {
        &self.ledger
    }

    pub fn drain_pending_updates(&mut self) -> Vec<PendingDocUpdate> {
        self.lock_directory().drain_pending_updates()
    }

    /// Export both the create-intent ledger and `WorkspaceDirectory`'s `ExplicitCreateJournal`.
    pub fn export_recovery_state(&self) -> Result<(Vec<u8>, Vec<u8>), DirectoryError> {
        let ledger_bytes =
            serde_json::to_vec(&self.ledger).map_err(|e| DirectoryError::Other(e.to_string()))?;
        let journal_bytes = self
            .lock_directory()
            .export_explicit_create_journal()
            .map_err(|e| DirectoryError::Other(e.to_string()))?;
        Ok((ledger_bytes, journal_bytes))
    }

    /// Restore persisted create-intent ledger and `ExplicitCreateJournal` after a restart.
    pub fn import_recovery_state(
        &mut self,
        ledger_bytes: &[u8],
        journal_bytes: &[u8],
    ) -> Result<(), DirectoryError> {
        let restored: CreateIntentLedger = serde_json::from_slice(ledger_bytes)
            .map_err(|e| DirectoryError::Other(e.to_string()))?;
        let mut dir = self.lock_directory();
        if restored.space_id != dir.db().space_id() {
            return Err(DirectoryError::Other(format!(
                "intent ledger space_id {:?} does not match workspace {:?}",
                restored.space_id,
                dir.db().space_id()
            )));
        }
        dir.import_explicit_create_journal(journal_bytes)
            .map_err(|e| DirectoryError::Other(e.to_string()))?;
        drop(dir);
        self.ledger.intents.extend(restored.intents);
        Ok(())
    }

    /// Record that the child page skeleton has finished initializing, and idempotently retire
    /// the intent from the unfinished-create journal once confirmed.
    pub fn confirm_child_skeleton_and_retire(&mut self, intent_id: &str) -> bool {
        let Some(entry) = self.ledger.intents.get_mut(intent_id) else {
            return false;
        };
        entry.skeleton_initialized = true;
        if let Ok(doc_id) = DocId::new(entry.doc_id.clone()) {
            self.lock_directory().acknowledge_explicit_create(&doc_id);
        }
        true
    }

    /// Return all intents whose child page skeleton has not yet been confirmed (for crash replay).
    pub fn unfinished_intents(&self) -> Vec<(&str, &CreateIntentEntry)> {
        self.ledger
            .intents
            .iter()
            .filter(|(_, entry)| !entry.skeleton_initialized)
            .map(|(k, v)| (k.as_str(), v))
            .collect()
    }

    fn next_unique_ephemeral_create_id(
        &mut self,
        dir: &WorkspaceDirectory,
    ) -> Result<CreateDocId, DirectoryError> {
        let space_id = dir.db().space_id();
        let seed = match &self.replica_seed {
            Some(s) => s.clone(),
            None => {
                let fresh = generate_replica_seed_hex()?;
                self.replica_seed = Some(fresh.clone());
                fresh
            }
        };

        loop {
            self.next_ephemeral_op = self.next_ephemeral_op.saturating_add(1);
            let op_key = format!("ephemeral-{seed}-{}", self.next_ephemeral_op);
            let candidate_id = derive_page_id_for_op(space_id, &op_key);
            let doc_id =
                DocId::new(&candidate_id).map_err(|e| DirectoryError::Other(e.to_string()))?;
            let exists = dir
                .get_doc(&doc_id)
                .map_err(|e| DirectoryError::Other(e.to_string()))?
                .is_some();
            if !exists {
                return CreateDocId::from_op(op_key)
                    .map_err(|e| DirectoryError::Other(e.to_string()));
            }
        }
    }
}

fn to_store_mode(mode: EditorDocMode) -> DocMode {
    match mode {
        EditorDocMode::Page => DocMode::Page,
        EditorDocMode::Edgeless => DocMode::Edgeless,
    }
}

fn to_editor_mode(mode: DocMode) -> EditorDocMode {
    match mode {
        DocMode::Page => EditorDocMode::Page,
        DocMode::Edgeless => EditorDocMode::Edgeless,
    }
}

impl WorkspaceDocDirectory for StoreBackedDocDirectory {
    fn query_linked_docs(&self, req: &DocQueryRequest) -> Result<DocQueryPage, DirectoryError> {
        if req.cancel.is_cancelled() {
            return Ok(DocQueryPage {
                items: Vec::new(),
                next_cursor: None,
                cancelled: true,
            });
        }
        let offset: usize = match &req.cursor {
            None => 0,
            Some(raw) => raw
                .parse::<usize>()
                .map_err(|_| DirectoryError::InvalidCursor(raw.clone()))?,
        };

        let store_page = self
            .lock_directory()
            .query_docs(
                &DocQuery {
                    include_trashed: false,
                    ..DocQuery::default()
                },
                None,
            )
            .map_err(|e| DirectoryError::Other(e.to_string()))?;

        let mut matches = Vec::new();
        for entry in store_page.entries {
            if req.cancel.is_cancelled() {
                return Ok(DocQueryPage {
                    items: Vec::new(),
                    next_cursor: None,
                    cancelled: true,
                });
            }
            if let Some((score, title_highlights)) =
                match_exact_substring_utf16(&entry.title, &req.query)
            {
                matches.push(MatchedDocSummary {
                    doc: EditorDocSummary {
                        id: EditorDocId::new(entry.id.as_str()),
                        title: entry.title,
                        mode: to_editor_mode(entry.mode),
                        updated_at_ms: entry.updated_date_ms.unwrap_or(entry.create_date_ms),
                    },
                    score,
                    title_highlights,
                });
            }
        }

        matches.sort_by(|a, b| {
            a.score
                .total_cmp(&b.score)
                .then_with(|| b.doc.updated_at_ms.cmp(&a.doc.updated_at_ms))
                .then_with(|| a.doc.id.cmp(&b.doc.id))
        });

        let limit = req.limit.max(1);
        let start = offset.min(matches.len());
        let end = (start + limit).min(matches.len());
        let next_cursor = (end < matches.len()).then(|| end.to_string());

        Ok(DocQueryPage {
            items: matches[start..end].to_vec(),
            next_cursor,
            cancelled: false,
        })
    }

    fn rename_doc_title(
        &mut self,
        id: &EditorDocId,
        title: &str,
    ) -> Result<EditorDocSummary, DirectoryError> {
        let doc_id = DocId::new(id.as_str()).map_err(|e| DirectoryError::Other(e.to_string()))?;
        let mut dir = self.lock_directory();
        let existing = dir
            .get_doc(&doc_id)
            .map_err(|e| DirectoryError::Other(e.to_string()))?
            .ok_or_else(|| DirectoryError::NotFound(id.clone()))?;
        dir.rename_doc(&doc_id, title)
            .map_err(|e| DirectoryError::Other(e.to_string()))?;
        Ok(EditorDocSummary {
            id: id.clone(),
            title: title.to_string(),
            mode: to_editor_mode(existing.mode),
            updated_at_ms: existing.updated_date_ms.unwrap_or(existing.create_date_ms),
        })
    }

    fn create_linked_doc(
        &mut self,
        title: &str,
        mode: EditorDocMode,
        intent_id: Option<&str>,
    ) -> Result<EditorDocSummary, DirectoryError> {
        let store_mode = to_store_mode(mode);

        // Invariant 2 (F1): if this intent was already root-registered and is now absent from
        // `meta.pages`, it was deleted — return `Err(NotFound)` and NEVER revive it.
        if let Some(intent) = intent_id
            && let Some(rec) = self.ledger.intents.get(intent).cloned()
        {
            let dir = self.lock_directory();
            let doc_id =
                DocId::new(&rec.doc_id).map_err(|e| DirectoryError::Other(e.to_string()))?;
            if let Some(existing) = dir
                .get_doc(&doc_id)
                .map_err(|e| DirectoryError::Other(e.to_string()))?
            {
                return Ok(EditorDocSummary {
                    id: EditorDocId::new(existing.id.as_str()),
                    title: existing.title,
                    mode: to_editor_mode(existing.mode),
                    updated_at_ms: existing.updated_date_ms.unwrap_or(existing.create_date_ms),
                });
            }
            if rec.root_registered {
                return Err(DirectoryError::NotFound(EditorDocId::new(rec.doc_id)));
            }
        }

        let created = {
            let create_id = match intent_id {
                Some(intent) => CreateDocId::from_op(intent)
                    .map_err(|e| DirectoryError::Other(e.to_string()))?,
                None => {
                    let shared = Arc::clone(&self.directory);
                    let guard = shared.lock().unwrap_or_else(|e| e.into_inner());
                    self.next_unique_ephemeral_create_id(&guard)?
                }
            };
            let mut dir = self.lock_directory();
            let outcome = dir
                .create_doc(CreateDocRequest {
                    id: create_id,
                    title: title.to_string(),
                    mode: store_mode,
                    now_ms: self.now_ms,
                })
                .map_err(|e| DirectoryError::Other(e.to_string()))?;
            let summary = dir
                .get_doc(&outcome.doc_id)
                .map_err(|e| DirectoryError::Other(e.to_string()))?
                .ok_or_else(|| {
                    DirectoryError::NotFound(EditorDocId::new(outcome.doc_id.as_str()))
                })?;
            (outcome, summary)
        };

        // Invariant 1: root write succeeded -> immediately persist `root_registered = true`.
        if let Some(intent) = intent_id {
            self.ledger
                .intents
                .entry(intent.to_string())
                .and_modify(|entry| {
                    entry.doc_id = created.0.doc_id.as_str().to_string();
                    entry.root_registered = true;
                })
                .or_insert_with(|| CreateIntentEntry {
                    doc_id: created.0.doc_id.as_str().to_string(),
                    mode: store_mode.as_str().to_string(),
                    root_registered: true,
                    source_linked: false,
                    skeleton_initialized: false,
                });
        }

        Ok(EditorDocSummary {
            id: EditorDocId::new(created.1.id.as_str()),
            title: created.1.title,
            mode: to_editor_mode(created.1.mode),
            updated_at_ms: created
                .1
                .updated_date_ms
                .unwrap_or(created.1.create_date_ms),
        })
    }

    fn has_create_intent(&self, intent_id: &str) -> bool {
        self.ledger.intents.contains_key(intent_id)
    }

    fn is_create_intent_linked(&self, intent_id: &str) -> bool {
        self.ledger
            .intents
            .get(intent_id)
            .is_some_and(|rec| rec.source_linked)
    }

    fn mark_create_intent_linked(&mut self, intent_id: &str) {
        if let Some(rec) = self.ledger.intents.get_mut(intent_id) {
            rec.source_linked = true;
        }
    }

    fn mark_doc_root_registered(&mut self, id: &EditorDocId) {
        for rec in self.ledger.intents.values_mut() {
            if rec.doc_id == id.as_str() {
                rec.root_registered = true;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use affine_store::workspace_db::WorkspaceDb;

    use super::*;

    fn new_store_backed_directory() -> StoreBackedDocDirectory {
        let mut db = WorkspaceDb::new("ws-s2", "u1", 1);
        db.initialize_meta().unwrap();
        let _ = db.drain_pending_updates();
        StoreBackedDocDirectory::new(WorkspaceDirectory::new(db), 1_000)
    }

    #[test]
    fn closes_all_four_reviewer_directory_invariants_across_restart_and_delete() {
        let mut dir = new_store_backed_directory();

        let created = dir
            .create_linked_doc("Architecture", EditorDocMode::Edgeless, Some("intent-1"))
            .unwrap();
        assert_eq!(created.mode, EditorDocMode::Edgeless);
        assert!(dir.ledger().intents["intent-1"].root_registered);
        assert!(!dir.ledger().intents["intent-1"].skeleton_initialized);
        assert_eq!(dir.unfinished_intents().len(), 1);

        let (root_snap, props_snap) = {
            let guard = dir.lock_directory();
            (
                guard.db().root().encode_update_v1().unwrap(),
                guard
                    .db()
                    .db_table(affine_store::workspace_db::WorkspaceDbTableName::DocProperties)
                    .unwrap()
                    .encode_update_v1()
                    .unwrap(),
            )
        };
        let (ledger_bytes, journal_bytes) = dir.export_recovery_state().unwrap();

        let mut recovered_db =
            WorkspaceDb::from_root_update_v1("ws-s2", "u1", 2, &root_snap).unwrap();
        recovered_db
            .load_db_table(
                affine_store::workspace_db::WorkspaceDbTableName::DocProperties,
                &props_snap,
            )
            .unwrap();
        let mut recovered =
            StoreBackedDocDirectory::new(WorkspaceDirectory::new(recovered_db), 2_000);
        recovered
            .import_recovery_state(&ledger_bytes, &journal_bytes)
            .unwrap();
        assert_eq!(recovered.unfinished_intents().len(), 1);
        let replayed = recovered
            .create_linked_doc("Architecture", EditorDocMode::Edgeless, Some("intent-1"))
            .unwrap();
        assert_eq!(replayed.id, created.id);
        assert!(recovered.confirm_child_skeleton_and_retire("intent-1"));
        assert!(recovered.unfinished_intents().is_empty());

        let full = recovered
            .lock_directory()
            .db()
            .root()
            .encode_update_v1()
            .unwrap();
        let mut peer = y_octo::DocOptions::from_identity(9, "ws-s2".to_string()).build();
        peer.apply_update_from_binary_v1(&full).unwrap();
        let sv = peer.get_state_vector();
        let meta = peer.get_or_create_map("meta").unwrap();
        let Some(y_octo::Value::Array(mut pages)) = meta.get("pages") else {
            panic!("meta.pages missing");
        };
        pages.remove(0, 1).unwrap();
        let diff = peer.encode_state_as_update_v1(&sv).unwrap();
        recovered
            .lock_directory()
            .db_mut()
            .apply_remote_root_update(&diff)
            .unwrap();

        let err = recovered
            .create_linked_doc("Architecture", EditorDocMode::Edgeless, Some("intent-1"))
            .expect_err("deleted doc must not revive on intent replay");
        assert_eq!(err, DirectoryError::NotFound(created.id));
    }

    #[test]
    fn ephemeral_none_intents_across_independent_instances_produce_distinct_ids() {
        let mut db = WorkspaceDb::new("ws-eph", "u1", 1);
        db.initialize_meta().unwrap();
        let shared = Arc::new(Mutex::new(WorkspaceDirectory::new(db)));

        let mut inst_a = StoreBackedDocDirectory::from_shared(Arc::clone(&shared), 100);
        let mut inst_b = StoreBackedDocDirectory::from_shared(Arc::clone(&shared), 200);

        let a = inst_a
            .create_linked_doc("First", EditorDocMode::Page, None)
            .unwrap();
        let b = inst_b
            .create_linked_doc("Second", EditorDocMode::Page, None)
            .unwrap();
        assert_ne!(a.id, b.id);

        // Explicit intent stays idempotent on the same instance.
        let exp1 = inst_a
            .create_linked_doc("Explicit", EditorDocMode::Page, Some("intent-x"))
            .unwrap();
        let exp2 = inst_a
            .create_linked_doc("Explicit", EditorDocMode::Page, Some("intent-x"))
            .unwrap();
        assert_eq!(exp1.id, exp2.id);
    }

    #[test]
    fn offline_replicas_from_same_snapshot_generate_distinct_ids_and_merge_cleanly() {
        let mut base = WorkspaceDb::new("ws-offline", "u1", 1);
        base.initialize_meta().unwrap();
        let root_snap = base.root().encode_update_v1().unwrap();

        let db_a = WorkspaceDb::from_root_update_v1("ws-offline", "u1", 10, &root_snap).unwrap();
        let db_b = WorkspaceDb::from_root_update_v1("ws-offline", "u2", 20, &root_snap).unwrap();
        let mut replica_a = StoreBackedDocDirectory::new(WorkspaceDirectory::new(db_a), 100);
        let mut replica_b = StoreBackedDocDirectory::new(WorkspaceDirectory::new(db_b), 100);

        let page_a = replica_a
            .create_linked_doc("Offline A", EditorDocMode::Page, None)
            .unwrap();
        let page_b = replica_b
            .create_linked_doc("Offline B", EditorDocMode::Page, None)
            .unwrap();
        assert_ne!(page_a.id, page_b.id);

        for upd in replica_a
            .drain_pending_updates()
            .into_iter()
            .chain(replica_b.drain_pending_updates())
        {
            if upd.doc_id == "ws-offline" {
                base.apply_remote_root_update(&upd.update).unwrap();
            }
        }
        let merged = WorkspaceDirectory::new(base);
        assert!(
            merged
                .get_doc(&DocId::new(page_a.id.as_str()).unwrap())
                .unwrap()
                .is_some()
        );
        assert!(
            merged
                .get_doc(&DocId::new(page_b.id.as_str()).unwrap())
                .unwrap()
                .is_some()
        );
    }
}
