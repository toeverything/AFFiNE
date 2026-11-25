//! Web-exclusive IndexedDB V1 read-only fallback storage model.
//!
//! Mirrors `packages/common/nbstore/src/impls/idb/v1/{db,doc,blob}.ts` and
//! `packages/frontend/core/src/modules/workspace-engine/impls/local.ts:197-210`.

use std::collections::BTreeMap;

use y_octo::merge_updates_v1;

use crate::{
    error::{StoreError, StoreResult},
    id_converter::IdConverter,
};

/// Legacy V1 IndexedDB database name for documents (`affine-local`).
pub const IDB_V1_DOC_DB_NAME: &str = "affine-local";

/// Legacy V1 IndexedDB object store name for documents (`workspace`, `keyPath: "id"`).
pub const IDB_V1_DOC_STORE_NAME: &str = "workspace";

/// Legacy V1 IndexedDB object store name for blobs (`blob`).
pub const IDB_V1_BLOB_STORE_NAME: &str = "blob";

/// Fixed timestamp used by `IndexedDBV1DocStorage` (`new Date(1893456000000)`).
pub const IDB_V1_CONST_TIMESTAMP_MS: i64 = 1_893_456_000_000;

/// Host platform kind determining whether IndexedDB V1 fallback is enabled.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IdbHostPlatform {
    Web,
    MobileWeb,
    Ios,
    Android,
    Electron,
}

/// Web-exclusive V1 fallback gate matching `local.ts:197-210`.
///
/// Only Web and MobileWeb enable `IndexedDBV1DocStorage` / `IndexedDBV1BlobStorage`.
pub const fn is_idb_v1_fallback_enabled(platform: IdbHostPlatform) -> bool {
    matches!(platform, IdbHostPlatform::Web | IdbHostPlatform::MobileWeb)
}

/// Format the legacy V1 IndexedDB blob database name (`${spaceId}_blob`).
pub fn idb_v1_blob_db_name(space_id: &str) -> String {
    format!("{space_id}_blob")
}

/// Single raw update entry inside a V1 `workspace` object store record.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdbV1RawUpdate {
    pub timestamp_ms: i64,
    pub update: Vec<u8>,
}

/// Read-only merged document record returned by [`IdbV1DocStorage`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdbV1DocRecord {
    pub doc_id: String,
    pub bin: Vec<u8>,
    pub timestamp_ms: i64,
}

/// Read-only IndexedDB V1 document storage model (`affine-local` / `workspace`).
#[derive(Clone, Debug)]
pub struct IdbV1DocStorage {
    space_id: String,
    workspace_rows: BTreeMap<String, Vec<IdbV1RawUpdate>>,
}

impl IdbV1DocStorage {
    pub fn new(
        space_id: impl Into<String>,
        workspace_rows: BTreeMap<String, Vec<IdbV1RawUpdate>>,
    ) -> Self {
        Self {
            space_id: space_id.into(),
            workspace_rows,
        }
    }

    pub fn is_readonly(&self) -> bool {
        true
    }

    pub fn id_converter(&self) -> StoreResult<IdConverter> {
        let root_buf = self.raw_get_doc(&self.space_id)?;
        IdConverter::from_root_doc_bytes(&self.space_id, None, root_buf.as_deref())
    }

    /// Read a document by normalized local `doc_id`, resolving legacy GUIDs via [`IdConverter`].
    pub fn get_doc(&self, doc_id: &str) -> StoreResult<Option<IdbV1DocRecord>> {
        let converter = self.id_converter()?;
        let old_id = converter.new_id_to_old_id(doc_id);
        let Some(bin) = self.raw_get_doc(&old_id)? else {
            return Ok(None);
        };
        Ok(Some(IdbV1DocRecord {
            doc_id: old_id,
            bin,
            timestamp_ms: IDB_V1_CONST_TIMESTAMP_MS,
        }))
    }

    /// V1 storage is read-only; writes are ignored and return `IDB_V1_CONST_TIMESTAMP_MS`.
    pub fn push_doc_update(&mut self, _doc_id: &str, _bin: &[u8]) -> i64 {
        IDB_V1_CONST_TIMESTAMP_MS
    }

    /// Enumerate all normalized document IDs belonging to this workspace in V1 storage.
    pub fn get_doc_timestamps(&self) -> StoreResult<BTreeMap<String, i64>> {
        let converter = self.id_converter()?;
        let mut old_ids = vec![self.space_id.clone()];

        if let Some(root_bin) = self.raw_get_doc(&self.space_id)? {
            let root_converter =
                IdConverter::from_root_doc_bytes(&self.space_id, None, Some(&root_bin))?;
            for (_, subdoc_guid) in root_converter.page_mappings() {
                if self.workspace_rows.contains_key(subdoc_guid) {
                    old_ids.push(subdoc_guid.to_string());
                }
            }
        }

        let db_prefix = format!("db${}$", self.space_id);
        for key in self.workspace_rows.keys() {
            if key.starts_with(&db_prefix) || is_userdata_key_for_space(key, &self.space_id) {
                old_ids.push(key.clone());
            }
        }

        let mut out = BTreeMap::new();
        for old_id in old_ids {
            if self.workspace_rows.contains_key(&old_id) || old_id == self.space_id {
                out.insert(
                    converter.old_id_to_new_id(&old_id),
                    IDB_V1_CONST_TIMESTAMP_MS,
                );
            }
        }
        Ok(out)
    }

    fn raw_get_doc(&self, old_id: &str) -> StoreResult<Option<Vec<u8>>> {
        let Some(updates) = self.workspace_rows.get(old_id) else {
            return Ok(None);
        };
        if updates.is_empty() {
            return Ok(None);
        }
        if updates.len() == 1 {
            return Ok(Some(updates[0].update.clone()));
        }
        let merged = merge_updates_v1(updates.iter().map(|u| u.update.as_slice()))
            .and_then(|u| u.encode_v1())
            .map_err(|err| StoreError::InvalidBinary(err.to_string()))?;
        Ok(Some(merged))
    }
}

/// Exact `$`-segmented match for 3-segment (`userdata$<uid>$<spaceId>`) and 4-segment
/// (`userdata$<uid>$<spaceId>$<docId>`) keys, preventing prefix collisions like `ws-1` vs `ws-10`.
fn is_userdata_key_for_space(key: &str, space_id: &str) -> bool {
    let mut parts = key.split('$');
    let Some(prefix) = parts.next() else {
        return false;
    };
    let Some(uid) = parts.next() else {
        return false;
    };
    let Some(key_space_id) = parts.next() else {
        return false;
    };
    if prefix != "userdata" || uid.is_empty() || key_space_id != space_id {
        return false;
    }
    match (parts.next(), parts.next()) {
        (None, None) => true,
        (Some(doc_id), None) => !doc_id.is_empty(),
        _ => false,
    }
}

/// Blob record returned by [`IdbV1BlobStorage::get`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdbV1BlobRecord {
    pub key: String,
    pub mime: String,
    pub data: Vec<u8>,
}

/// Listed blob metadata returned by [`IdbV1BlobStorage::list`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdbV1ListedBlob {
    pub key: String,
    pub mime: String,
    pub size: usize,
}

/// Read-only IndexedDB V1 blob storage model (`${spaceId}_blob` / `blob`).
#[derive(Clone, Debug)]
pub struct IdbV1BlobStorage {
    space_id: String,
    blobs: BTreeMap<String, Vec<u8>>,
}

impl IdbV1BlobStorage {
    pub fn new(space_id: impl Into<String>, blobs: BTreeMap<String, Vec<u8>>) -> Self {
        Self {
            space_id: space_id.into(),
            blobs,
        }
    }

    pub fn db_name(&self) -> String {
        idb_v1_blob_db_name(&self.space_id)
    }

    pub fn is_readonly(&self) -> bool {
        true
    }

    pub fn get(&self, key: &str) -> Option<IdbV1BlobRecord> {
        self.blobs.get(key).map(|data| IdbV1BlobRecord {
            key: key.to_string(),
            mime: String::new(),
            data: data.clone(),
        })
    }

    pub fn list(&self) -> Vec<IdbV1ListedBlob> {
        self.blobs
            .iter()
            .map(|(key, data)| IdbV1ListedBlob {
                key: key.clone(),
                mime: String::new(),
                size: data.len(),
            })
            .collect()
    }

    /// V1 blob storage is read-only; `set` is a no-op.
    pub fn set(&mut self, _key: &str, _data: Vec<u8>) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v1_fallback_is_web_only_and_readonly() {
        assert!(is_idb_v1_fallback_enabled(IdbHostPlatform::Web));
        assert!(is_idb_v1_fallback_enabled(IdbHostPlatform::MobileWeb));
        assert!(!is_idb_v1_fallback_enabled(IdbHostPlatform::Ios));
        assert!(!is_idb_v1_fallback_enabled(IdbHostPlatform::Android));
        assert!(!is_idb_v1_fallback_enabled(IdbHostPlatform::Electron));

        let mut rows = BTreeMap::new();
        rows.insert(
            "db$ws-1$folders".to_string(),
            vec![IdbV1RawUpdate {
                timestamp_ms: 100,
                update: vec![0, 0],
            }],
        );
        rows.insert(
            "userdata$u1$ws-1".to_string(),
            vec![IdbV1RawUpdate {
                timestamp_ms: 100,
                update: vec![0, 0],
            }],
        );
        rows.insert(
            "userdata$u1$ws-1$favorite".to_string(),
            vec![IdbV1RawUpdate {
                timestamp_ms: 100,
                update: vec![0, 0],
            }],
        );
        rows.insert(
            "userdata$u1$ws-10$favorite".to_string(),
            vec![IdbV1RawUpdate {
                timestamp_ms: 100,
                update: vec![0, 0],
            }],
        );
        let mut docs = IdbV1DocStorage::new("ws-1", rows);
        assert!(docs.is_readonly());
        assert_eq!(
            docs.push_doc_update("ws-1", &[0, 0]),
            IDB_V1_CONST_TIMESTAMP_MS
        );
        let ts = docs.get_doc_timestamps().unwrap();
        assert_eq!(ts.get("db$folders"), Some(&IDB_V1_CONST_TIMESTAMP_MS));
        assert_eq!(ts.get("userdata$u1$ws-1"), Some(&IDB_V1_CONST_TIMESTAMP_MS));
        assert_eq!(
            ts.get("userdata$u1$favorite"),
            Some(&IDB_V1_CONST_TIMESTAMP_MS)
        );
        assert!(!ts.contains_key("userdata$u1$ws-10$favorite"));
        assert!(!ts.contains_key("userdata$u1$0$favorite"));
        let doc = docs.get_doc("db$folders").unwrap().unwrap();
        assert_eq!(doc.timestamp_ms, IDB_V1_CONST_TIMESTAMP_MS);

        // Verify modern pages (subdoc.guid == page_id) AND legacy pages (subdoc.guid != page_id)
        // are both discovered by `get_doc_timestamps()` and readable via `get_doc()`.
        let mut root_session = y_octo::DocSession::<()>::with_config(
            y_octo::DocOptions::from_identity(1, "ws-v1".to_string()),
            y_octo::SessionConfig {
                undo: y_octo::SessionUndoConfig::Disabled,
            },
        );
        let meta = y_octo::TypeTarget::from(
            root_session
                .ensure_root("meta", y_octo::YTypeKind::Map)
                .unwrap(),
        );
        let spaces = y_octo::TypeTarget::from(
            root_session
                .ensure_root("spaces", y_octo::YTypeKind::Map)
                .unwrap(),
        );
        root_session
            .begin_tx(y_octo::SessionTxOrigin::Untracked)
            .unwrap();
        root_session
            .map_set(
                &meta,
                "pages".to_string(),
                y_octo::SessionValue::Array(Vec::new()),
            )
            .unwrap();
        let pages_target = y_octo::TypeTarget::Path(y_octo::TypePath::root("meta").key("pages"));
        root_session
            .array_push(
                &pages_target,
                vec![
                    y_octo::SessionValue::Map(vec![(
                        "id".to_string(),
                        y_octo::SessionValue::Any(y_octo::Any::String("page-1".into())),
                    )]),
                    y_octo::SessionValue::Map(vec![(
                        "id".to_string(),
                        y_octo::SessionValue::Any(y_octo::Any::String("page-2".into())),
                    )]),
                ],
            )
            .unwrap();
        root_session
            .map_set(
                &spaces,
                "page-1".to_string(),
                y_octo::SessionValue::Doc {
                    guid: "legacy-guid-1".into(),
                    gc: true,
                },
            )
            .unwrap();
        root_session
            .map_set(
                &spaces,
                "page-2".to_string(),
                y_octo::SessionValue::Doc {
                    guid: "page-2".into(),
                    gc: true,
                },
            )
            .unwrap();
        let root_bin = root_session.commit_tx().unwrap().unwrap().update;

        let mut page_rows = BTreeMap::new();
        page_rows.insert(
            "ws-v1".into(),
            vec![IdbV1RawUpdate {
                timestamp_ms: 10,
                update: root_bin,
            }],
        );
        page_rows.insert(
            "legacy-guid-1".into(),
            vec![IdbV1RawUpdate {
                timestamp_ms: 11,
                update: vec![0, 0],
            }],
        );
        page_rows.insert(
            "page-2".into(),
            vec![IdbV1RawUpdate {
                timestamp_ms: 12,
                update: vec![0, 0],
            }],
        );
        let v1_pages = IdbV1DocStorage::new("ws-v1", page_rows);
        let page_ts = v1_pages.get_doc_timestamps().unwrap();
        assert_eq!(page_ts.get("page-1"), Some(&IDB_V1_CONST_TIMESTAMP_MS));
        assert_eq!(page_ts.get("page-2"), Some(&IDB_V1_CONST_TIMESTAMP_MS));
        assert!(v1_pages.get_doc("page-1").unwrap().is_some());
        assert!(v1_pages.get_doc("page-2").unwrap().is_some());

        let mut blobs = IdbV1BlobStorage::new("ws-1", BTreeMap::from([("k1".into(), vec![1, 2])]));
        assert_eq!(blobs.db_name(), "ws-1_blob");
        blobs.set("k2", vec![3]);
        assert!(blobs.get("k2").is_none());
        assert_eq!(blobs.list().len(), 1);
    }
}
