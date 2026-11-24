use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use y_octo::{AHashMap, Any, Doc, DocOptions, HashMapExt, StateVector, Value};

use crate::error::{StoreError, StoreResult};

/// Soft-delete marker written by `YjsTableAdapter` (`packages/common/infra/src/orm/core/adapters/yjs/table.ts`).
pub const DELETED_FLAG_KEY: &str = "$$DELETED";

/// JavaScript safe integer bounds (`Number.MAX_SAFE_INTEGER` / `Number.MIN_SAFE_INTEGER`).
const JS_MAX_SAFE_INTEGER: i64 = (1i64 << 53) - 1;
const JS_MIN_SAFE_INTEGER: i64 = -JS_MAX_SAFE_INTEGER;

/// All 5 workspace `db$` table names.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub enum WorkspaceDbTableName {
    Folders,
    DocProperties,
    DocCustomPropertyInfo,
    PinnedCollections,
    ExplorerIcon,
}

pub const WORKSPACE_DB_TABLE_NAMES: &[WorkspaceDbTableName] = &[
    WorkspaceDbTableName::Folders,
    WorkspaceDbTableName::DocProperties,
    WorkspaceDbTableName::DocCustomPropertyInfo,
    WorkspaceDbTableName::PinnedCollections,
    WorkspaceDbTableName::ExplorerIcon,
];

impl WorkspaceDbTableName {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Folders => "folders",
            Self::DocProperties => "docProperties",
            Self::DocCustomPropertyInfo => "docCustomPropertyInfo",
            Self::PinnedCollections => "pinnedCollections",
            Self::ExplorerIcon => "explorerIcon",
        }
    }

    pub fn local_doc_id(self) -> String {
        format!("db${}", self.as_str())
    }

    pub const fn primary_key_field(self) -> &'static str {
        match self {
            Self::PinnedCollections => "collectionId",
            Self::Folders
            | Self::DocProperties
            | Self::DocCustomPropertyInfo
            | Self::ExplorerIcon => "id",
        }
    }

    pub const fn known_fields(self) -> &'static [&'static str] {
        match self {
            Self::Folders => &["id", "parentId", "data", "type", "index"],
            Self::DocProperties => &[
                "id",
                "primaryMode",
                "edgelessColorTheme",
                "journal",
                "pageWidth",
                "isTemplate",
                "integrationType",
                "createdBy",
                "updatedBy",
            ],
            Self::DocCustomPropertyInfo => &[
                "id",
                "name",
                "type",
                "show",
                "index",
                "icon",
                "additionalData",
                "isDeleted",
            ],
            Self::PinnedCollections => &["collectionId", "index"],
            Self::ExplorerIcon => &["id", "icon"],
        }
    }
}

/// All 3 `userdata$` table names.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub enum UserdataTableName {
    Favorite,
    Settings,
    DocIntegrationRef,
}

pub const USERDATA_TABLE_NAMES: &[UserdataTableName] = &[
    UserdataTableName::Favorite,
    UserdataTableName::Settings,
    UserdataTableName::DocIntegrationRef,
];

impl UserdataTableName {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Favorite => "favorite",
            Self::Settings => "settings",
            Self::DocIntegrationRef => "docIntegrationRef",
        }
    }

    pub fn local_doc_id(self, user_id: &str) -> String {
        format!("userdata${user_id}${}", self.as_str())
    }

    pub const fn primary_key_field(self) -> &'static str {
        match self {
            Self::Favorite | Self::Settings => "key",
            Self::DocIntegrationRef => "id",
        }
    }

    pub const fn known_fields(self) -> &'static [&'static str] {
        match self {
            Self::Favorite => &["key", "index"],
            Self::Settings => &["key", "value"],
            Self::DocIntegrationRef => &["id", "type", "integrationId", "refMeta"],
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderRow {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    pub data: String,
    #[serde(rename = "type")]
    pub folder_type: String,
    pub index: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocPropertiesRow {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edgeless_color_theme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub journal: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_width: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_template: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub integration_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_by: Option<String>,
    #[serde(flatten)]
    pub custom_fields: BTreeMap<String, JsonValue>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocCustomPropertyInfoRow {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub property_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_data: Option<JsonValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_deleted: Option<bool>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedCollectionRow {
    pub collection_id: String,
    pub index: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerIconRow {
    pub id: String,
    pub icon: JsonValue,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteRow {
    pub key: String,
    pub index: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsRow {
    pub key: String,
    pub value: JsonValue,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocIntegrationRefRow {
    pub id: String,
    #[serde(rename = "type")]
    pub integration_type: String,
    pub integration_id: String,
    pub ref_meta: JsonValue,
}

/// Primary-key `Y.Map` table backed by a single `y-octo::Doc`, matching `YjsTableAdapter`.
pub struct YjsTableDoc {
    doc_id: String,
    key_field: &'static str,
    known_fields: &'static [&'static str],
    doc: Doc,
    baseline_sv: StateVector,
    local_writeback: bool,
    revision: u64,
}

impl YjsTableDoc {
    pub fn new(
        doc_id: impl Into<String>,
        key_field: &'static str,
        known_fields: &'static [&'static str],
        client_id: u64,
    ) -> Self {
        let doc_id = doc_id.into();
        let doc = DocOptions::from_identity(client_id, doc_id.clone()).build();
        let baseline_sv = doc.get_state_vector();
        Self {
            doc_id,
            key_field,
            known_fields,
            doc,
            baseline_sv,
            local_writeback: false,
            revision: 0,
        }
    }

    /// Load a table document from encoded v1 bytes with zero writeback.
    pub fn from_update_v1(
        doc_id: impl Into<String>,
        key_field: &'static str,
        known_fields: &'static [&'static str],
        client_id: u64,
        update: &[u8],
    ) -> StoreResult<Self> {
        let mut table = Self::new(doc_id, key_field, known_fields, client_id);
        if !update.is_empty() && update != [0, 0] {
            table
                .doc
                .apply_update_from_binary_v1(update)
                .map_err(|err| StoreError::InvalidBinary(err.to_string()))?;
            table.revision = table.revision.wrapping_add(1);
        }
        table.baseline_sv = table.doc.get_state_vector();
        table.local_writeback = false;
        Ok(table)
    }

    /// CRDT-merge an encoded v1 update into this table document without losing local writes.
    pub fn apply_update_v1(&mut self, update: &[u8]) -> StoreResult<()> {
        if !update.is_empty() && update != [0, 0] {
            self.doc
                .apply_update_from_binary_v1(update)
                .map_err(|err| StoreError::InvalidBinary(err.to_string()))?;
            self.revision = self.revision.wrapping_add(1);
        }
        Ok(())
    }

    pub fn doc_id(&self) -> &str {
        &self.doc_id
    }

    /// Monotonically increasing revision bumped on every local write and remote update,
    /// including delete-only updates that leave the Yjs state vector unchanged.
    pub fn revision(&self) -> u64 {
        self.revision
    }

    /// Return `true` when local writes have occurred since load.
    pub fn has_local_writeback(&self) -> StoreResult<bool> {
        Ok(self.local_writeback || self.doc.get_state_vector() != self.baseline_sv)
    }

    pub fn encode_update_v1(&self) -> StoreResult<Vec<u8>> {
        self.doc
            .encode_update_v1()
            .map_err(|err| StoreError::YOcto(err.to_string()))
    }

    /// Upsert a typed row by primary key, removing `$$DELETED` if previously soft-deleted.
    pub fn upsert_row<T: Serialize>(&mut self, row: &T) -> StoreResult<Vec<u8>> {
        let before_sv = self.doc.get_state_vector();
        let JsonValue::Object(obj) = serde_json::to_value(row)? else {
            return Err(StoreError::InvalidProtocol(
                "table row must serialize as a JSON object".into(),
            ));
        };
        let Some(key) = obj.get(self.key_field).and_then(JsonValue::as_str) else {
            return Err(StoreError::InvalidProtocol(format!(
                "missing string primary key field `{}`",
                self.key_field
            )));
        };

        let mut map = self
            .doc
            .get_or_create_map(key)
            .map_err(|err| StoreError::YOcto(err.to_string()))?;
        for (field, val) in &obj {
            map.insert(field.clone(), Value::Any(json_to_any(val)))
                .map_err(|err| StoreError::YOcto(err.to_string()))?;
        }
        map.remove(DELETED_FLAG_KEY);
        self.local_writeback = true;
        self.revision = self.revision.wrapping_add(1);

        self.doc
            .encode_state_as_update_v1(&before_sv)
            .map_err(|err| StoreError::YOcto(err.to_string()))
    }

    /// Partially update specific fields on an existing non-deleted row, matching `0.27.5`
    /// `YjsTableAdapter.update` (`table.ts:81-96, 184-191`).
    ///
    /// Returns `Ok(None)` with zero writeback when `primary_key` does not exist or is
    /// soft-deleted (never resurrects a deleted row or creates a ghost row).
    pub fn patch_row_fields(
        &mut self,
        primary_key: &str,
        patches: &[(&str, Option<JsonValue>)],
    ) -> StoreResult<Option<Vec<u8>>> {
        let Ok(mut map) = self.doc.get_map(primary_key) else {
            return Ok(None);
        };
        if is_map_deleted(&map) {
            return Ok(None);
        }

        let before_sv = self.doc.get_state_vector();
        let mut mutated = false;
        for (field, value) in patches {
            if *field == self.key_field || *field == DELETED_FLAG_KEY {
                continue;
            }
            match value {
                Some(val) => {
                    map.insert((*field).to_string(), Value::Any(json_to_any(val)))
                        .map_err(|err| StoreError::YOcto(err.to_string()))?;
                    mutated = true;
                }
                None => {
                    if map.get(field).is_some() {
                        map.remove(field);
                        mutated = true;
                    }
                }
            }
        }
        if !mutated {
            return Ok(None);
        }
        self.local_writeback = true;
        self.revision = self.revision.wrapping_add(1);

        let diff = self
            .doc
            .encode_state_as_update_v1(&before_sv)
            .map_err(|err| StoreError::YOcto(err.to_string()))?;
        Ok(Some(diff))
    }

    /// Soft-delete a row matching `YjsTableAdapter.deleteTy` (`table.ts:288-295`): remove only
    /// known non-key schema fields and set `$$DELETED = true`, preserving unknown extension keys.
    pub fn soft_delete(&mut self, primary_key: &str) -> StoreResult<Option<Vec<u8>>> {
        let Ok(mut map) = self.doc.get_map(primary_key) else {
            return Ok(None);
        };
        if is_map_deleted(&map) {
            return Ok(None);
        }

        let before_sv = self.doc.get_state_vector();
        for field in self.known_fields {
            if *field != self.key_field {
                map.remove(field);
            }
        }
        map.insert(DELETED_FLAG_KEY.to_string(), Value::Any(Any::True))
            .map_err(|err| StoreError::YOcto(err.to_string()))?;
        self.local_writeback = true;
        self.revision = self.revision.wrapping_add(1);

        let diff = self
            .doc
            .encode_state_as_update_v1(&before_sv)
            .map_err(|err| StoreError::YOcto(err.to_string()))?;
        Ok(Some(diff))
    }

    /// Read a single non-deleted row by primary key via direct root map lookup.
    pub fn get_row<T: for<'de> Deserialize<'de>>(
        &self,
        primary_key: &str,
    ) -> StoreResult<Option<T>> {
        let Ok(map) = self.doc.get_map(primary_key) else {
            return Ok(None);
        };
        if is_map_deleted(&map) {
            return Ok(None);
        }
        let json = map_to_json_object(&map);
        Ok(Some(serde_json::from_value(json)?))
    }

    /// Read raw JSON fields of a non-deleted row (including unknown extension keys).
    pub fn get_raw_row(&self, primary_key: &str) -> Option<JsonValue> {
        let map = self.doc.get_map(primary_key).ok()?;
        if is_map_deleted(&map) {
            return None;
        }
        Some(map_to_json_object(&map))
    }

    /// List all valid non-deleted rows in deterministic key order, skipping corrupt rows instead
    /// of failing the entire table query.
    pub fn list_rows<T: for<'de> Deserialize<'de>>(&self) -> StoreResult<Vec<T>> {
        let mut keys = self.doc.keys();
        keys.sort();
        let mut rows = Vec::new();
        for key in keys {
            if let Ok(Some(row)) = self.get_row::<T>(&key) {
                rows.push(row);
            }
        }
        Ok(rows)
    }

    /// Return `true` if `primary_key` exists in the underlying YDoc with `$$DELETED = true`.
    pub fn is_soft_deleted(&self, primary_key: &str) -> StoreResult<bool> {
        let Ok(map) = self.doc.get_map(primary_key) else {
            return Ok(false);
        };
        Ok(matches!(
            map.get(DELETED_FLAG_KEY),
            Some(Value::Any(Any::True))
        ))
    }
}

fn is_map_deleted(map: &y_octo::Map) -> bool {
    if map.is_empty() {
        return true;
    }
    matches!(map.get(DELETED_FLAG_KEY), Some(Value::Any(Any::True)))
}

fn map_to_json_object(map: &y_octo::Map) -> JsonValue {
    let mut obj = serde_json::Map::new();
    for (k, v) in map.iter() {
        if k == DELETED_FLAG_KEY {
            continue;
        }
        if let Value::Any(any) = v {
            obj.insert(k.to_string(), any_to_json(&any));
        }
    }
    JsonValue::Object(obj)
}

fn any_to_json(any: &Any) -> JsonValue {
    match any {
        Any::Null | Any::Undefined => JsonValue::Null,
        Any::False => JsonValue::Bool(false),
        Any::True => JsonValue::Bool(true),
        Any::Integer(n) => JsonValue::Number((*n).into()),
        Any::BigInt64(n) => JsonValue::Number((*n).into()),
        Any::Float32(f) => serde_json::Number::from_f64(f64::from(f.0))
            .map(JsonValue::Number)
            .unwrap_or(JsonValue::Null),
        Any::Float64(f) => {
            let v = f.0;
            if v.is_finite()
                && v.fract() == 0.0
                && v >= (JS_MIN_SAFE_INTEGER as f64)
                && v <= (JS_MAX_SAFE_INTEGER as f64)
            {
                JsonValue::Number((v as i64).into())
            } else {
                serde_json::Number::from_f64(v)
                    .map(JsonValue::Number)
                    .unwrap_or(JsonValue::Null)
            }
        }
        Any::String(s) => JsonValue::String(s.clone()),
        Any::Array(arr) => JsonValue::Array(arr.iter().map(any_to_json).collect()),
        Any::Object(map) => {
            let mut obj = serde_json::Map::new();
            for (k, v) in map.iter() {
                obj.insert(k.clone(), any_to_json(v));
            }
            JsonValue::Object(obj)
        }
        Any::Binary(bytes) => JsonValue::Array(bytes.iter().map(|b| (*b).into()).collect()),
    }
}

/// Convert JSON values to `y-octo::Any` without ever producing lib0 `BigInt64` (tag `0x7a`),
/// matching JS `YjsTableAdapter` where integers above `i32` serialize as IEEE 754 `Float64`.
fn json_to_any(value: &JsonValue) -> Any {
    match value {
        JsonValue::Null => Any::Null,
        JsonValue::Bool(true) => Any::True,
        JsonValue::Bool(false) => Any::False,
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                if let Ok(i32_val) = i32::try_from(i) {
                    Any::Integer(i32_val)
                } else {
                    Any::Float64((i as f64).into())
                }
            } else if let Some(u) = n.as_u64() {
                if let Ok(i32_val) = i32::try_from(u) {
                    Any::Integer(i32_val)
                } else {
                    Any::Float64((u as f64).into())
                }
            } else if let Some(f) = n.as_f64() {
                Any::Float64(f.into())
            } else {
                Any::Null
            }
        }
        JsonValue::String(s) => Any::String(s.clone()),
        JsonValue::Array(arr) => Any::Array(arr.iter().map(json_to_any).collect()),
        JsonValue::Object(obj) => {
            let mut map = AHashMap::with_capacity(obj.len());
            for (k, v) in obj {
                map.insert(k.clone(), json_to_any(v));
            }
            Any::Object(Box::new(map))
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn all_eight_tables_support_typed_upsert_soft_delete_reinsert_and_zero_writeback() {
        let mut folders = YjsTableDoc::new(
            WorkspaceDbTableName::Folders.local_doc_id(),
            WorkspaceDbTableName::Folders.primary_key_field(),
            WorkspaceDbTableName::Folders.known_fields(),
            1,
        );
        folders
            .upsert_row(&FolderRow {
                id: "f1".into(),
                parent_id: None,
                data: "Root".into(),
                folder_type: "folder".into(),
                index: "a0".into(),
            })
            .unwrap();
        assert_eq!(folders.list_rows::<FolderRow>().unwrap().len(), 1);
        folders.soft_delete("f1").unwrap();
        assert!(folders.is_soft_deleted("f1").unwrap());
        assert!(folders.get_row::<FolderRow>("f1").unwrap().is_none());
        folders
            .upsert_row(&FolderRow {
                id: "f1".into(),
                parent_id: Some("root".into()),
                data: "Restored".into(),
                folder_type: "folder".into(),
                index: "a1".into(),
            })
            .unwrap();
        assert!(!folders.is_soft_deleted("f1").unwrap());
        assert_eq!(
            folders.get_row::<FolderRow>("f1").unwrap().unwrap().data,
            "Restored"
        );

        let mut props = YjsTableDoc::new(
            WorkspaceDbTableName::DocProperties.local_doc_id(),
            WorkspaceDbTableName::DocProperties.primary_key_field(),
            WorkspaceDbTableName::DocProperties.known_fields(),
            1,
        );
        let mut custom = BTreeMap::new();
        custom.insert("custom:priority".to_string(), json!("high"));
        props
            .upsert_row(&DocPropertiesRow {
                id: "doc-1".into(),
                primary_mode: Some("edgeless".into()),
                edgeless_color_theme: None,
                journal: None,
                page_width: Some("fullWidth".into()),
                is_template: Some(false),
                integration_type: None,
                created_by: Some("u1".into()),
                updated_by: None,
                custom_fields: custom,
            })
            .unwrap();
        let loaded_props = YjsTableDoc::from_update_v1(
            WorkspaceDbTableName::DocProperties.local_doc_id(),
            WorkspaceDbTableName::DocProperties.primary_key_field(),
            WorkspaceDbTableName::DocProperties.known_fields(),
            2,
            &props.encode_update_v1().unwrap(),
        )
        .unwrap();
        assert!(!loaded_props.has_local_writeback().unwrap());
        let row = loaded_props
            .get_row::<DocPropertiesRow>("doc-1")
            .unwrap()
            .unwrap();
        assert_eq!(row.primary_mode.as_deref(), Some("edgeless"));
        assert_eq!(
            row.custom_fields.get("custom:priority"),
            Some(&json!("high"))
        );

        let mut custom_info = YjsTableDoc::new(
            WorkspaceDbTableName::DocCustomPropertyInfo.local_doc_id(),
            WorkspaceDbTableName::DocCustomPropertyInfo.primary_key_field(),
            WorkspaceDbTableName::DocCustomPropertyInfo.known_fields(),
            1,
        );
        custom_info
            .upsert_row(&DocCustomPropertyInfoRow {
                id: "cp1".into(),
                name: Some("Status".into()),
                property_type: "text".into(),
                show: Some("always-show".into()),
                index: Some("a0".into()),
                icon: None,
                additional_data: Some(json!({"choices": ["todo", "done"]})),
                is_deleted: Some(false),
            })
            .unwrap();
        assert_eq!(
            custom_info
                .get_row::<DocCustomPropertyInfoRow>("cp1")
                .unwrap()
                .unwrap()
                .name
                .as_deref(),
            Some("Status")
        );

        let mut pinned = YjsTableDoc::new(
            WorkspaceDbTableName::PinnedCollections.local_doc_id(),
            WorkspaceDbTableName::PinnedCollections.primary_key_field(),
            WorkspaceDbTableName::PinnedCollections.known_fields(),
            1,
        );
        pinned
            .upsert_row(&PinnedCollectionRow {
                collection_id: "col-1".into(),
                index: "a0".into(),
            })
            .unwrap();
        assert_eq!(pinned.list_rows::<PinnedCollectionRow>().unwrap().len(), 1);

        let mut icons = YjsTableDoc::new(
            WorkspaceDbTableName::ExplorerIcon.local_doc_id(),
            WorkspaceDbTableName::ExplorerIcon.primary_key_field(),
            WorkspaceDbTableName::ExplorerIcon.known_fields(),
            1,
        );
        icons
            .upsert_row(&ExplorerIconRow {
                id: "doc:doc-1".into(),
                icon: json!({"type": "emoji", "unicode": "1f4dd"}),
            })
            .unwrap();
        assert_eq!(icons.list_rows::<ExplorerIconRow>().unwrap().len(), 1);

        let mut fav = YjsTableDoc::new(
            UserdataTableName::Favorite.local_doc_id("u1"),
            UserdataTableName::Favorite.primary_key_field(),
            UserdataTableName::Favorite.known_fields(),
            1,
        );
        fav.upsert_row(&FavoriteRow {
            key: "doc:doc-1".into(),
            index: "a0".into(),
        })
        .unwrap();
        assert_eq!(fav.list_rows::<FavoriteRow>().unwrap().len(), 1);

        let mut settings = YjsTableDoc::new(
            UserdataTableName::Settings.local_doc_id("u1"),
            UserdataTableName::Settings.primary_key_field(),
            UserdataTableName::Settings.known_fields(),
            1,
        );
        settings
            .upsert_row(&SettingsRow {
                key: "theme".into(),
                value: json!("dark"),
            })
            .unwrap();
        assert_eq!(
            settings
                .get_row::<SettingsRow>("theme")
                .unwrap()
                .unwrap()
                .value,
            json!("dark")
        );

        let mut refs = YjsTableDoc::new(
            UserdataTableName::DocIntegrationRef.local_doc_id("u1"),
            UserdataTableName::DocIntegrationRef.primary_key_field(),
            UserdataTableName::DocIntegrationRef.known_fields(),
            1,
        );
        refs.upsert_row(&DocIntegrationRefRow {
            id: "doc-1".into(),
            integration_type: "readwise".into(),
            integration_id: "rw-1".into(),
            ref_meta: json!({"bookId": 42}),
        })
        .unwrap();
        assert_eq!(refs.list_rows::<DocIntegrationRefRow>().unwrap().len(), 1);
    }

    #[test]
    fn soft_delete_preserves_unknown_extension_keys_across_reinsert() {
        let raw_doc = DocOptions::from_identity(1, "db$folders".into()).build();
        let mut raw_map = raw_doc.get_or_create_map("f-ext").unwrap();
        raw_map
            .insert("id".to_string(), Value::Any(Any::String("f-ext".into())))
            .unwrap();
        raw_map
            .insert("data".to_string(), Value::Any(Any::String("Old".into())))
            .unwrap();
        raw_map
            .insert("type".to_string(), Value::Any(Any::String("folder".into())))
            .unwrap();
        raw_map
            .insert("index".to_string(), Value::Any(Any::String("a0".into())))
            .unwrap();
        raw_map
            .insert("futureExt".to_string(), Value::Any(Any::Integer(42)))
            .unwrap();
        let initial_bytes = raw_doc.encode_update_v1().unwrap();

        let mut table = YjsTableDoc::from_update_v1(
            WorkspaceDbTableName::Folders.local_doc_id(),
            WorkspaceDbTableName::Folders.primary_key_field(),
            WorkspaceDbTableName::Folders.known_fields(),
            2,
            &initial_bytes,
        )
        .unwrap();

        assert!(table.soft_delete("f-ext").unwrap().is_some());
        assert!(table.is_soft_deleted("f-ext").unwrap());
        assert!(table.get_row::<FolderRow>("f-ext").unwrap().is_none());

        table
            .upsert_row(&FolderRow {
                id: "f-ext".into(),
                parent_id: None,
                data: "New".into(),
                folder_type: "folder".into(),
                index: "a1".into(),
            })
            .unwrap();
        let raw = table.get_raw_row("f-ext").unwrap();
        assert_eq!(raw["data"], json!("New"));
        assert_eq!(raw["futureExt"], json!(42));
    }

    #[test]
    fn millisecond_timestamps_encode_as_float64_never_bigint64_and_roundtrip_as_json_int() {
        let ts_ms: i64 = 1_795_550_000_000;
        let mut settings = YjsTableDoc::new(
            UserdataTableName::Settings.local_doc_id("u1"),
            UserdataTableName::Settings.primary_key_field(),
            UserdataTableName::Settings.known_fields(),
            1,
        );
        settings
            .upsert_row(&SettingsRow {
                key: "lastSync".into(),
                value: json!({ "updatedAt": ts_ms }),
            })
            .unwrap();

        let map = settings.doc.get_map("lastSync").unwrap();
        match map.get("value") {
            Some(Value::Any(Any::Object(obj))) => {
                assert!(
                    matches!(obj.get("updatedAt"), Some(Any::Float64(_))),
                    "expected Float64, got {:?}",
                    obj.get("updatedAt")
                );
            }
            other => panic!("unexpected value: {other:?}"),
        }

        // y-octo encodes BigInt64 with tag 0x7a (122) followed by big-endian i64 bytes.
        let encoded = settings.encode_update_v1().unwrap();
        let mut needle = vec![0x7au8];
        needle.extend_from_slice(&ts_ms.to_be_bytes());
        assert!(
            !encoded
                .windows(needle.len())
                .any(|w| w == needle.as_slice()),
            "encoded Yjs update must not emit lib0 BigInt64 tag 0x7a"
        );

        let reloaded = YjsTableDoc::from_update_v1(
            UserdataTableName::Settings.local_doc_id("u1"),
            UserdataTableName::Settings.primary_key_field(),
            UserdataTableName::Settings.known_fields(),
            2,
            &encoded,
        )
        .unwrap();
        let row = reloaded
            .get_row::<SettingsRow>("lastSync")
            .unwrap()
            .unwrap();
        assert_eq!(row.value["updatedAt"].as_i64(), Some(ts_ms));
    }

    #[test]
    fn patch_row_fields_preserves_columns_ignores_deleted_or_missing_and_list_rows_skips_corrupt() {
        let mut folders = YjsTableDoc::new(
            WorkspaceDbTableName::Folders.local_doc_id(),
            WorkspaceDbTableName::Folders.primary_key_field(),
            WorkspaceDbTableName::Folders.known_fields(),
            1,
        );
        folders
            .upsert_row(&FolderRow {
                id: "f1".into(),
                parent_id: Some("p-root".into()),
                data: "Alpha".into(),
                folder_type: "folder".into(),
                index: "a0".into(),
            })
            .unwrap();

        assert!(
            folders
                .patch_row_fields("f1", &[("parentId", None)])
                .unwrap()
                .is_some()
        );
        let updated = folders.get_row::<FolderRow>("f1").unwrap().unwrap();
        assert_eq!(updated.parent_id, None);
        assert_eq!(updated.data, "Alpha");
        assert_eq!(updated.index, "a0");

        // Probe P4: patch_row_fields must not resurrect a soft-deleted row or create a missing row.
        folders.soft_delete("f1").unwrap();
        assert!(
            folders
                .patch_row_fields("f1", &[("data", Some(json!("Renamed")))])
                .unwrap()
                .is_none()
        );
        assert!(
            folders
                .patch_row_fields("never-existed", &[("data", Some(json!("Ghost")))])
                .unwrap()
                .is_none()
        );
        assert!(folders.is_soft_deleted("f1").unwrap());
        assert!(folders.get_raw_row("f1").is_none());
        assert!(folders.get_raw_row("never-existed").is_none());

        // Inject a corrupt row missing required FolderRow fields; list_rows must skip it cleanly.
        let mut bad = folders.doc.get_or_create_map("f-corrupt").unwrap();
        bad.insert("id".to_string(), Value::Any(Any::Integer(999)))
            .unwrap();
        folders
            .upsert_row(&FolderRow {
                id: "f2".into(),
                parent_id: None,
                data: "Valid".into(),
                folder_type: "folder".into(),
                index: "a1".into(),
            })
            .unwrap();
        let rows = folders.list_rows::<FolderRow>().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "f2");
    }
}
