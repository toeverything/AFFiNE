//! Core L3 workspace domain models and services (`Workspace`, `Doc`, `Folder`, `Collection`,
//! `Tag`, `Favorite`, `Journal`, `Trash`) backed by a shared `Arc<Mutex<WorkspaceDirectory>>`.

use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex, MutexGuard},
};

use affine_store::{
    directory::{DocId, WorkspaceDirectory},
    workspace_db::{
        DocPropertiesRow, FavoriteRow, FolderRow, UserdataTableName, WorkspaceDbTableName,
    },
};
use serde::{Deserialize, Serialize};

use crate::{ClientError, ClientResult};

/// High-level workspace identity and sync flavour.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceModel {
    pub id: String,
    pub name: String,
    pub flavour: String,
    pub is_cloud: bool,
}

/// Projected document summary in the L3 client domain.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocModel {
    pub id: String,
    pub title: String,
    pub mode: String,
    pub create_date_ms: i64,
    pub updated_date_ms: Option<i64>,
    pub trashed: bool,
    pub tags: Vec<String>,
    pub journal_date: Option<String>,
    pub is_favorite: bool,
}

/// Tree node in the workspace folder hierarchy (`db$folders`).
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub node_type: String,
    pub data: String,
    pub index: String,
}

/// Smart collection filter rule.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CollectionRule {
    HasTag(String),
    ModeIs(String),
    TitleContains(String),
    IncludeDocIds(Vec<String>),
}

/// User-defined collection grouping documents by explicit IDs and filter rules.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionModel {
    pub id: String,
    pub name: String,
    pub rules: Vec<CollectionRule>,
}

/// Tag descriptor with document count.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagModel {
    pub id: String,
    pub name: String,
    pub color: String,
    pub doc_count: usize,
}

/// Pinned favorite entry (`userdata$<uid>$favorite`).
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteItem {
    pub key: String,
    pub index: String,
}

/// Daily journal entry keyed by `YYYY-MM-DD`.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub date: String,
    pub doc_id: String,
    pub title: String,
}

/// Soft-deleted document in workspace Trash.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub doc_id: String,
    pub title: String,
    pub trashed_at_ms: Option<i64>,
}

/// L3 domain service projecting and mutating workspace entities over a shared [`WorkspaceDirectory`].
pub struct WorkspaceDomainService {
    directory: Arc<Mutex<WorkspaceDirectory>>,
    collections: BTreeMap<String, CollectionModel>,
    tag_palette: BTreeMap<String, (String, String)>,
}

impl WorkspaceDomainService {
    /// Wrap a newly owned [`WorkspaceDirectory`] in a shared single-root-writer handle.
    pub fn new(directory: WorkspaceDirectory) -> Self {
        Self::from_shared(Arc::new(Mutex::new(directory)))
    }

    /// Attach to an existing shared [`WorkspaceDirectory`] (shared with [`crate::StoreBackedDocDirectory`]).
    pub fn from_shared(directory: Arc<Mutex<WorkspaceDirectory>>) -> Self {
        Self {
            directory,
            collections: BTreeMap::new(),
            tag_palette: BTreeMap::new(),
        }
    }

    pub fn shared_directory(&self) -> Arc<Mutex<WorkspaceDirectory>> {
        Arc::clone(&self.directory)
    }

    pub fn lock_directory(&self) -> MutexGuard<'_, WorkspaceDirectory> {
        self.directory.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn register_tag_meta(
        &mut self,
        id: impl Into<String>,
        name: impl Into<String>,
        color: impl Into<String>,
    ) {
        self.tag_palette
            .insert(id.into(), (name.into(), color.into()));
    }

    pub fn upsert_collection(&mut self, collection: CollectionModel) {
        self.collections.insert(collection.id.clone(), collection);
    }

    /// List all non-trashed documents enriched with `journal` and `favorite` metadata.
    pub fn list_docs(&self) -> ClientResult<Vec<DocModel>> {
        let fav_keys = self.favorite_keys()?;
        let dir = self.lock_directory();
        let props_table = dir.db().db_table(WorkspaceDbTableName::DocProperties);
        let page = dir.query_docs(
            &affine_store::directory::DocQuery {
                include_trashed: false,
                ..Default::default()
            },
            None,
        )?;

        let mut docs = Vec::with_capacity(page.entries.len());
        for entry in page.entries {
            let journal_date = props_table
                .and_then(|t| t.get_row::<DocPropertiesRow>(entry.id.as_str()).ok())
                .flatten()
                .and_then(|r| r.journal);
            let fav_key = format!("doc:{}", entry.id.as_str());
            docs.push(DocModel {
                id: entry.id.as_str().to_string(),
                title: entry.title,
                mode: entry.mode.as_str().to_string(),
                create_date_ms: entry.create_date_ms,
                updated_date_ms: entry.updated_date_ms,
                trashed: entry.trashed,
                tags: entry.tags,
                journal_date,
                is_favorite: fav_keys.contains(&fav_key),
            });
        }
        Ok(docs)
    }

    /// List soft-deleted documents in Trash.
    pub fn list_trash(&self) -> ClientResult<Vec<TrashItem>> {
        let page = self.lock_directory().query_docs(
            &affine_store::directory::DocQuery {
                include_trashed: true,
                ..Default::default()
            },
            None,
        )?;
        Ok(page
            .entries
            .into_iter()
            .filter(|e| e.trashed)
            .map(|e| TrashItem {
                doc_id: e.id.as_str().to_string(),
                title: e.title,
                trashed_at_ms: e.updated_date_ms,
            })
            .collect())
    }

    /// List daily journal entries ordered by date (`YYYY-MM-DD`).
    pub fn list_journals(&self) -> ClientResult<Vec<JournalEntry>> {
        let mut journals: Vec<JournalEntry> = self
            .list_docs()?
            .into_iter()
            .filter_map(|doc| {
                doc.journal_date.map(|date| JournalEntry {
                    date,
                    doc_id: doc.id,
                    title: doc.title,
                })
            })
            .collect();
        journals.sort_by(|a, b| a.date.cmp(&b.date).then_with(|| a.doc_id.cmp(&b.doc_id)));
        Ok(journals)
    }

    /// Aggregate tags across active documents.
    pub fn list_tags(&self) -> ClientResult<Vec<TagModel>> {
        let mut counts: BTreeMap<String, usize> = BTreeMap::new();
        for doc in self.list_docs()? {
            for tag in doc.tags {
                *counts.entry(tag).or_insert(0) += 1;
            }
        }
        for id in self.tag_palette.keys() {
            counts.entry(id.clone()).or_insert(0);
        }
        Ok(counts
            .into_iter()
            .map(|(id, doc_count)| {
                let (name, color) = self
                    .tag_palette
                    .get(&id)
                    .cloned()
                    .unwrap_or_else(|| (id.clone(), "default".to_string()));
                TagModel {
                    id,
                    name,
                    color,
                    doc_count,
                }
            })
            .collect())
    }

    /// Evaluate a collection's rules against active documents.
    pub fn evaluate_collection(&self, collection_id: &str) -> ClientResult<Vec<DocModel>> {
        let Some(col) = self.collections.get(collection_id) else {
            return Ok(Vec::new());
        };
        let docs = self.list_docs()?;
        Ok(docs
            .into_iter()
            .filter(|doc| matches_collection(doc, &col.rules))
            .collect())
    }

    /// Upsert a folder node in `db$folders`.
    pub fn upsert_folder(&mut self, node: FolderNode) -> ClientResult<()> {
        self.lock_directory().db_mut().upsert_db_row(
            WorkspaceDbTableName::Folders,
            &FolderRow {
                id: node.id,
                parent_id: node.parent_id,
                data: node.data,
                folder_type: node.node_type,
                index: node.index,
            },
        )?;
        Ok(())
    }

    /// List all folder nodes from `db$folders` sorted by `(parent_id, index, id)`.
    pub fn list_folders(&self) -> ClientResult<Vec<FolderNode>> {
        let dir = self.lock_directory();
        let Some(table) = dir.db().db_table(WorkspaceDbTableName::Folders) else {
            return Ok(Vec::new());
        };
        let mut rows: Vec<FolderNode> = table
            .list_rows::<FolderRow>()?
            .into_iter()
            .map(|r| FolderNode {
                id: r.id,
                parent_id: r.parent_id,
                node_type: r.folder_type,
                data: r.data,
                index: r.index,
            })
            .collect();
        rows.sort_by(|a, b| {
            a.parent_id
                .cmp(&b.parent_id)
                .then_with(|| a.index.cmp(&b.index))
                .then_with(|| a.id.cmp(&b.id))
        });
        Ok(rows)
    }

    /// Pin a favorite item in `userdata$<uid>$favorite`.
    pub fn add_favorite(
        &mut self,
        key: impl Into<String>,
        index: impl Into<String>,
    ) -> ClientResult<()> {
        self.lock_directory().db_mut().upsert_userdata_row(
            UserdataTableName::Favorite,
            &FavoriteRow {
                key: key.into(),
                index: index.into(),
            },
        )?;
        Ok(())
    }

    /// List favorites from `userdata$<uid>$favorite` ordered by fractional index.
    pub fn list_favorites(&self) -> ClientResult<Vec<FavoriteItem>> {
        let dir = self.lock_directory();
        let Some(table) = dir.db().userdata_table(UserdataTableName::Favorite) else {
            return Ok(Vec::new());
        };
        let mut items: Vec<FavoriteItem> = table
            .list_rows::<FavoriteRow>()?
            .into_iter()
            .map(|r| FavoriteItem {
                key: r.key,
                index: r.index,
            })
            .collect();
        items.sort_by(|a, b| a.index.cmp(&b.index).then_with(|| a.key.cmp(&b.key)));
        Ok(items)
    }

    /// Mark an existing non-trashed document as a daily journal entry for `date` (`YYYY-MM-DD`).
    ///
    /// Rejects missing/trashed documents and tombstoned rows, and preserves all existing
    /// `DocPropertiesRow` fields (including `primaryMode = edgeless` and custom fields).
    pub fn set_journal_date(&mut self, doc_id: &DocId, date: &str) -> ClientResult<()> {
        let mut dir = self.lock_directory();
        let entry = dir
            .get_doc(doc_id)?
            .filter(|e| !e.trashed)
            .ok_or_else(|| ClientError::DocNotFound(doc_id.as_str().to_string()))?;

        let existing_row =
            if let Some(table) = dir.db().db_table(WorkspaceDbTableName::DocProperties) {
                if table.is_soft_deleted(doc_id.as_str())? {
                    return Err(ClientError::RowTombstoned(doc_id.as_str().to_string()));
                }
                table.get_row::<DocPropertiesRow>(doc_id.as_str())?
            } else {
                None
            };

        let mut row = existing_row.unwrap_or_else(|| DocPropertiesRow {
            id: doc_id.as_str().to_string(),
            primary_mode: Some(entry.mode.as_str().to_string()),
            edgeless_color_theme: None,
            journal: None,
            page_width: None,
            is_template: None,
            integration_type: None,
            created_by: None,
            updated_by: None,
            custom_fields: BTreeMap::new(),
        });
        row.journal = Some(date.to_string());
        dir.db_mut()
            .upsert_db_row(WorkspaceDbTableName::DocProperties, &row)?;
        Ok(())
    }

    fn favorite_keys(&self) -> ClientResult<Vec<String>> {
        Ok(self.list_favorites()?.into_iter().map(|f| f.key).collect())
    }
}

fn matches_collection(doc: &DocModel, rules: &[CollectionRule]) -> bool {
    if rules.is_empty() {
        return true;
    }
    rules.iter().all(|rule| match rule {
        CollectionRule::HasTag(tag) => doc.tags.iter().any(|t| t == tag),
        CollectionRule::ModeIs(mode) => doc.mode == *mode,
        CollectionRule::TitleContains(needle) => {
            doc.title.to_lowercase().contains(&needle.to_lowercase())
        }
        CollectionRule::IncludeDocIds(ids) => ids.iter().any(|id| id == &doc.id),
    })
}

#[cfg(test)]
mod tests {
    use affine_store::{
        directory::{CreateDocId, CreateDocRequest, DocMode},
        workspace_db::WorkspaceDb,
    };
    use blocksuite_editor::{EditorDocMode, WorkspaceDocDirectory};

    use super::*;
    use crate::doc_directory::StoreBackedDocDirectory;

    #[test]
    fn domain_service_projects_docs_folders_collections_favorites_journals_and_trash() {
        let mut db = WorkspaceDb::new("ws-dom", "u1", 1);
        db.initialize_meta().unwrap();
        let mut svc = WorkspaceDomainService::new(WorkspaceDirectory::new(db));

        let d1 = svc
            .lock_directory()
            .create_doc(CreateDocRequest {
                id: CreateDocId::from_op("op-1").unwrap(),
                title: "Daily Standup".into(),
                mode: DocMode::Edgeless,
                now_ms: 100,
            })
            .unwrap()
            .doc_id;
        let d2 = svc
            .lock_directory()
            .create_doc(CreateDocRequest {
                id: CreateDocId::from_op("op-2").unwrap(),
                title: "Trash Candidate".into(),
                mode: DocMode::Page,
                now_ms: 200,
            })
            .unwrap()
            .doc_id;

        // Seed existing Edgeless DocProperties fields before calling set_journal_date.
        svc.lock_directory()
            .db_mut()
            .upsert_db_row(
                WorkspaceDbTableName::DocProperties,
                &DocPropertiesRow {
                    id: d1.as_str().to_string(),
                    primary_mode: Some("edgeless".into()),
                    edgeless_color_theme: Some("dark".into()),
                    journal: None,
                    page_width: Some("fullWidth".into()),
                    is_template: Some(true),
                    integration_type: None,
                    created_by: Some("u1".into()),
                    updated_by: Some("u1".into()),
                    custom_fields: BTreeMap::from([(
                        "custom:priority".into(),
                        serde_json::json!("high"),
                    )]),
                },
            )
            .unwrap();
        svc.set_journal_date(&d1, "2026-11-25").unwrap();
        let preserved = svc
            .lock_directory()
            .db()
            .db_table(WorkspaceDbTableName::DocProperties)
            .unwrap()
            .get_row::<DocPropertiesRow>(d1.as_str())
            .unwrap()
            .unwrap();
        assert_eq!(preserved.primary_mode.as_deref(), Some("edgeless"));
        assert_eq!(preserved.journal.as_deref(), Some("2026-11-25"));
        assert_eq!(preserved.page_width.as_deref(), Some("fullWidth"));
        assert_eq!(
            preserved.custom_fields.get("custom:priority"),
            Some(&serde_json::json!("high"))
        );

        // Tombstoned DocProperties row MUST NOT be revived by set_journal_date.
        svc.lock_directory()
            .db_mut()
            .soft_delete_db_row(WorkspaceDbTableName::DocProperties, d1.as_str())
            .unwrap();
        assert_eq!(
            svc.set_journal_date(&d1, "2026-11-26"),
            Err(ClientError::RowTombstoned(d1.as_str().to_string()))
        );

        svc.add_favorite(format!("doc:{}", d1.as_str()), "a0")
            .unwrap();
        svc.upsert_folder(FolderNode {
            id: "f-1".into(),
            parent_id: None,
            node_type: "folder".into(),
            data: "Projects".into(),
            index: "a0".into(),
        })
        .unwrap();
        svc.upsert_collection(CollectionModel {
            id: "col-1".into(),
            name: "Standups".into(),
            rules: vec![CollectionRule::TitleContains("standup".into())],
        });
        svc.lock_directory().trash_doc(&d2, 300).unwrap();

        assert_eq!(svc.list_trash().unwrap().len(), 1);
        assert_eq!(svc.list_folders().unwrap().len(), 1);
        assert_eq!(svc.evaluate_collection("col-1").unwrap().len(), 1);
    }

    #[test]
    fn shared_single_root_writer_exposes_linked_doc_immediately_in_domain_service() {
        let mut db = WorkspaceDb::new("ws-shared", "u1", 1);
        db.initialize_meta().unwrap();
        let shared = Arc::new(Mutex::new(WorkspaceDirectory::new(db)));

        let mut editor_dir = StoreBackedDocDirectory::from_shared(Arc::clone(&shared), 500);
        let domain_svc = WorkspaceDomainService::from_shared(Arc::clone(&shared));

        let created = editor_dir
            .create_linked_doc("Shared Note", EditorDocMode::Page, Some("intent-shared"))
            .unwrap();
        let docs = domain_svc.list_docs().unwrap();
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].id, created.id.as_str());
        assert_eq!(docs[0].title, "Shared Note");
    }
}
