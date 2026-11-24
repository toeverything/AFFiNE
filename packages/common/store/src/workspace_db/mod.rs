pub mod root_doc;
pub mod tables;

pub use root_doc::{
    CreatePageOutcome, PageIdSource, PageMetaEntry, RemoteRootApply, WorkspaceRootDoc,
    derive_page_id_for_op,
};
pub use tables::{
    DELETED_FLAG_KEY, DocCustomPropertyInfoRow, DocIntegrationRefRow, DocPropertiesRow,
    ExplorerIconRow, FavoriteRow, FolderRow, PinnedCollectionRow, SettingsRow,
    USERDATA_TABLE_NAMES, UserdataTableName, WORKSPACE_DB_TABLE_NAMES, WorkspaceDbTableName,
    YjsTableDoc,
};

use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;
use serde_json::Value as JsonValue;

use crate::error::StoreResult;

/// Protocol version 1: creating a document writes both `meta.pages` and `spaces[pageId]` atomically.
pub const WORKSPACE_SYNC_PROTOCOL_VERSION: u8 = 1;

/// Pending encoded v1 update produced by a local `WorkspaceDb` mutation, ready for host
/// persistence and sync enqueueing.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingDocUpdate {
    pub doc_id: String,
    pub update: Vec<u8>,
}

/// Authoritative writer for a single workspace's root document and its 8 metadata Yjs tables
/// (5 `db$` workspace tables + 3 `userdata$` user tables).
pub struct WorkspaceDb {
    space_id: String,
    user_id: String,
    client_id: u64,
    root: WorkspaceRootDoc,
    db_tables: BTreeMap<WorkspaceDbTableName, YjsTableDoc>,
    resolved_db_tables: BTreeSet<WorkspaceDbTableName>,
    userdata_tables: BTreeMap<UserdataTableName, YjsTableDoc>,
    pending_updates: Vec<PendingDocUpdate>,
}

impl WorkspaceDb {
    /// Create a fresh in-memory workspace DB coordinator with an uninitialized root document.
    pub fn new(space_id: impl Into<String>, user_id: impl Into<String>, client_id: u64) -> Self {
        let space_id = space_id.into();
        let user_id = user_id.into();
        let root = WorkspaceRootDoc::new(space_id.clone(), client_id);
        Self {
            space_id,
            user_id,
            client_id,
            root,
            db_tables: BTreeMap::new(),
            resolved_db_tables: WORKSPACE_DB_TABLE_NAMES.iter().copied().collect(),
            userdata_tables: BTreeMap::new(),
            pending_updates: Vec::new(),
        }
    }

    /// Load an existing root document snapshot with zero writeback.
    ///
    /// Companion `db$` tables start in the unresolved state until loaded via [`Self::load_db_table`]
    /// or explicitly confirmed absent in storage via [`Self::mark_db_table_absent`].
    pub fn from_root_update_v1(
        space_id: impl Into<String>,
        user_id: impl Into<String>,
        client_id: u64,
        root_update: &[u8],
    ) -> StoreResult<Self> {
        let space_id = space_id.into();
        let user_id = user_id.into();
        let root = WorkspaceRootDoc::from_update_v1(space_id.clone(), client_id, root_update)?;
        Ok(Self {
            space_id,
            user_id,
            client_id,
            root,
            db_tables: BTreeMap::new(),
            resolved_db_tables: BTreeSet::new(),
            userdata_tables: BTreeMap::new(),
            pending_updates: Vec::new(),
        })
    }

    pub fn space_id(&self) -> &str {
        &self.space_id
    }

    pub fn user_id(&self) -> &str {
        &self.user_id
    }

    pub fn root(&self) -> &WorkspaceRootDoc {
        &self.root
    }

    /// Inspect pending local updates queued for persistence and remote sync.
    pub fn pending_updates(&self) -> &[PendingDocUpdate] {
        &self.pending_updates
    }

    /// Drain all pending local updates in FIFO order for host persistence and sync enqueueing.
    pub fn drain_pending_updates(&mut self) -> Vec<PendingDocUpdate> {
        std::mem::take(&mut self.pending_updates)
    }

    fn record_update(&mut self, doc_id: String, update: Vec<u8>) {
        if !update.is_empty() && update != [0, 0] {
            self.pending_updates
                .push(PendingDocUpdate { doc_id, update });
        }
    }

    /// Apply a remote update to the root document without enqueuing it in `pending_updates`.
    pub fn apply_remote_root_update(&mut self, bytes: &[u8]) -> StoreResult<RemoteRootApply> {
        self.root.apply_remote_update(bytes)
    }

    /// Explicitly initialize `meta.pages = []` for a new local workspace and record the update.
    pub fn initialize_meta(&mut self) -> StoreResult<Option<Vec<u8>>> {
        let update = self.root.initialize_meta()?;
        if let Some(ref bytes) = update {
            self.record_update(self.space_id.clone(), bytes.clone());
        }
        Ok(update)
    }

    /// Atomically create a page in the root doc and record any emitted update.
    pub fn create_page(
        &mut self,
        id_source: PageIdSource<'_>,
        title: &str,
        create_date_ms: i64,
    ) -> StoreResult<CreatePageOutcome> {
        let outcome = self.root.create_page(id_source, title, create_date_ms)?;
        if let Some(ref bytes) = outcome.update {
            self.record_update(self.space_id.clone(), bytes.clone());
        }
        Ok(outcome)
    }

    /// Return `true` when `table` already contains an active or soft-deleted row entry for
    /// `primary_key` (used to distinguish "row was never persisted before crash" from "row exists
    /// and user later cleared or changed a field").
    pub fn has_db_row_entry(
        &self,
        table: WorkspaceDbTableName,
        primary_key: &str,
    ) -> StoreResult<bool> {
        let Some(doc) = self.db_tables.get(&table) else {
            return Ok(false);
        };
        Ok(doc.get_raw_row(primary_key).is_some() || doc.is_soft_deleted(primary_key)?)
    }

    /// Rename a page in the root doc and record any emitted update.
    pub fn rename_page(&mut self, page_id: &str, new_title: &str) -> StoreResult<Option<Vec<u8>>> {
        let update = self.root.rename_page(page_id, new_title)?;
        if let Some(ref bytes) = update {
            self.record_update(self.space_id.clone(), bytes.clone());
        }
        Ok(update)
    }

    /// Soft-delete a page in the root doc and record any emitted update.
    pub fn trash_page(
        &mut self,
        page_id: &str,
        trash_date_ms: i64,
    ) -> StoreResult<Option<Vec<u8>>> {
        let update = self.root.trash_page(page_id, trash_date_ms)?;
        if let Some(ref bytes) = update {
            self.record_update(self.space_id.clone(), bytes.clone());
        }
        Ok(update)
    }

    /// Restore a trashed page in the root doc and record any emitted update.
    pub fn restore_page(&mut self, page_id: &str) -> StoreResult<Option<Vec<u8>>> {
        let update = self.root.restore_page(page_id)?;
        if let Some(ref bytes) = update {
            self.record_update(self.space_id.clone(), bytes.clone());
        }
        Ok(update)
    }

    /// Return `true` when `table` has been loaded from storage, initialized in a fresh workspace,
    /// or explicitly confirmed absent via [`Self::mark_db_table_absent`].
    pub fn is_db_table_resolved(&self, table: WorkspaceDbTableName) -> bool {
        self.resolved_db_tables.contains(&table)
    }

    /// Mark `table` as confirmed absent in local storage (e.g. `get_doc("db$docProperties")`
    /// returned `None`).
    pub fn mark_db_table_absent(&mut self, table: WorkspaceDbTableName) {
        self.resolved_db_tables.insert(table);
    }

    /// Load or CRDT-merge a workspace `db$` table document from encoded v1 bytes.
    ///
    /// If local writes occurred before the snapshot arrived, merges via CRDT `apply_update_v1`
    /// instead of overwriting and losing local mutations.
    pub fn load_db_table(&mut self, table: WorkspaceDbTableName, update: &[u8]) -> StoreResult<()> {
        if let Some(existing) = self.db_tables.get_mut(&table) {
            existing.apply_update_v1(update)?;
        } else {
            let doc = YjsTableDoc::from_update_v1(
                table.local_doc_id(),
                table.primary_key_field(),
                table.known_fields(),
                self.client_id,
                update,
            )?;
            self.db_tables.insert(table, doc);
        }
        self.resolved_db_tables.insert(table);
        Ok(())
    }

    /// Load or CRDT-merge a `userdata$` table document from encoded v1 bytes.
    pub fn load_userdata_table(
        &mut self,
        table: UserdataTableName,
        update: &[u8],
    ) -> StoreResult<()> {
        if let Some(existing) = self.userdata_tables.get_mut(&table) {
            existing.apply_update_v1(update)?;
            return Ok(());
        }
        let doc = YjsTableDoc::from_update_v1(
            table.local_doc_id(&self.user_id),
            table.primary_key_field(),
            table.known_fields(),
            self.client_id,
            update,
        )?;
        self.userdata_tables.insert(table, doc);
        Ok(())
    }

    /// Upsert a row in a `db$` table and record the emitted update in `pending_updates`.
    pub fn upsert_db_row<T: Serialize>(
        &mut self,
        table: WorkspaceDbTableName,
        row: &T,
    ) -> StoreResult<Vec<u8>> {
        let doc_id = table.local_doc_id();
        let diff = self.db_table_mut(table).upsert_row(row)?;
        self.record_update(doc_id, diff.clone());
        Ok(diff)
    }

    /// Partially patch fields on an existing non-deleted `db$` row and record any emitted update.
    pub fn patch_db_row_fields(
        &mut self,
        table: WorkspaceDbTableName,
        primary_key: &str,
        patches: &[(&str, Option<JsonValue>)],
    ) -> StoreResult<Option<Vec<u8>>> {
        let doc_id = table.local_doc_id();
        let diff = self
            .db_table_mut(table)
            .patch_row_fields(primary_key, patches)?;
        if let Some(ref bytes) = diff {
            self.record_update(doc_id, bytes.clone());
        }
        Ok(diff)
    }

    /// Soft-delete a row in a `db$` table and record any emitted update.
    pub fn soft_delete_db_row(
        &mut self,
        table: WorkspaceDbTableName,
        primary_key: &str,
    ) -> StoreResult<Option<Vec<u8>>> {
        let doc_id = table.local_doc_id();
        let diff = self.db_table_mut(table).soft_delete(primary_key)?;
        if let Some(ref bytes) = diff {
            self.record_update(doc_id, bytes.clone());
        }
        Ok(diff)
    }

    /// Upsert a row in a `userdata$` table and record the emitted update.
    pub fn upsert_userdata_row<T: Serialize>(
        &mut self,
        table: UserdataTableName,
        row: &T,
    ) -> StoreResult<Vec<u8>> {
        let doc_id = table.local_doc_id(&self.user_id);
        let diff = self.userdata_table_mut(table).upsert_row(row)?;
        self.record_update(doc_id, diff.clone());
        Ok(diff)
    }

    /// Partially patch fields on an existing non-deleted `userdata$` row and record any update.
    pub fn patch_userdata_row_fields(
        &mut self,
        table: UserdataTableName,
        primary_key: &str,
        patches: &[(&str, Option<JsonValue>)],
    ) -> StoreResult<Option<Vec<u8>>> {
        let doc_id = table.local_doc_id(&self.user_id);
        let diff = self
            .userdata_table_mut(table)
            .patch_row_fields(primary_key, patches)?;
        if let Some(ref bytes) = diff {
            self.record_update(doc_id, bytes.clone());
        }
        Ok(diff)
    }

    /// Soft-delete a row in a `userdata$` table and record any emitted update.
    pub fn soft_delete_userdata_row(
        &mut self,
        table: UserdataTableName,
        primary_key: &str,
    ) -> StoreResult<Option<Vec<u8>>> {
        let doc_id = table.local_doc_id(&self.user_id);
        let diff = self.userdata_table_mut(table).soft_delete(primary_key)?;
        if let Some(ref bytes) = diff {
            self.record_update(doc_id, bytes.clone());
        }
        Ok(diff)
    }

    /// Access a loaded `db$` table without creating or mutating it.
    pub fn db_table(&self, table: WorkspaceDbTableName) -> Option<&YjsTableDoc> {
        self.db_tables.get(&table)
    }

    /// Access or lazily initialize a `db$` table for crate-internal writes.
    pub(crate) fn db_table_mut(&mut self, table: WorkspaceDbTableName) -> &mut YjsTableDoc {
        let client_id = self.client_id;
        self.db_tables.entry(table).or_insert_with(|| {
            YjsTableDoc::new(
                table.local_doc_id(),
                table.primary_key_field(),
                table.known_fields(),
                client_id,
            )
        })
    }

    /// Access a loaded `userdata$` table without creating or mutating it.
    pub fn userdata_table(&self, table: UserdataTableName) -> Option<&YjsTableDoc> {
        self.userdata_tables.get(&table)
    }

    /// Access or lazily initialize a `userdata$` table for crate-internal writes.
    pub(crate) fn userdata_table_mut(&mut self, table: UserdataTableName) -> &mut YjsTableDoc {
        let client_id = self.client_id;
        let doc_id = table.local_doc_id(&self.user_id);
        self.userdata_tables.entry(table).or_insert_with(|| {
            YjsTableDoc::new(
                doc_id,
                table.primary_key_field(),
                table.known_fields(),
                client_id,
            )
        })
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn load_db_table_merges_remote_snapshot_without_losing_prior_local_writes() {
        let mut db = WorkspaceDb::new("ws-1", "u1", 1);

        db.upsert_db_row(
            WorkspaceDbTableName::Folders,
            &FolderRow {
                id: "local-folder".into(),
                parent_id: None,
                data: "Local".into(),
                folder_type: "folder".into(),
                index: "a0".into(),
            },
        )
        .unwrap();
        assert_eq!(db.pending_updates().len(), 1);
        assert_eq!(db.pending_updates()[0].doc_id, "db$folders");

        let mut remote = YjsTableDoc::new(
            WorkspaceDbTableName::Folders.local_doc_id(),
            WorkspaceDbTableName::Folders.primary_key_field(),
            WorkspaceDbTableName::Folders.known_fields(),
            2,
        );
        remote
            .upsert_row(&FolderRow {
                id: "remote-folder".into(),
                parent_id: None,
                data: "Remote".into(),
                folder_type: "folder".into(),
                index: "a1".into(),
            })
            .unwrap();
        let remote_bytes = remote.encode_update_v1().unwrap();

        db.load_db_table(WorkspaceDbTableName::Folders, &remote_bytes)
            .unwrap();
        let rows = db
            .db_table(WorkspaceDbTableName::Folders)
            .unwrap()
            .list_rows::<FolderRow>()
            .unwrap();
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().any(|r| r.id == "local-folder"));
        assert!(rows.iter().any(|r| r.id == "remote-folder"));
    }

    #[test]
    fn p4_patch_keeps_soft_deleted_row_deleted_and_does_not_create_missing_row() {
        let mut db = WorkspaceDb::new("ws", "u1", 1);
        db.upsert_db_row(
            WorkspaceDbTableName::Folders,
            &FolderRow {
                id: "f1".into(),
                parent_id: None,
                data: "Alpha".into(),
                folder_type: "folder".into(),
                index: "a0".into(),
            },
        )
        .unwrap();
        db.soft_delete_db_row(WorkspaceDbTableName::Folders, "f1")
            .unwrap();
        let _ = db.drain_pending_updates();

        assert!(
            db.patch_db_row_fields(
                WorkspaceDbTableName::Folders,
                "f1",
                &[("data", Some(json!("Renamed")))],
            )
            .unwrap()
            .is_none()
        );
        assert!(
            db.patch_db_row_fields(
                WorkspaceDbTableName::Folders,
                "never-existed",
                &[("data", Some(json!("Ghost")))],
            )
            .unwrap()
            .is_none()
        );
        assert!(db.pending_updates().is_empty());
        let table = db.db_table(WorkspaceDbTableName::Folders).unwrap();
        assert!(table.get_raw_row("never-existed").is_none());
        assert!(table.is_soft_deleted("f1").unwrap());
    }
}
