use std::collections::BTreeMap;

use y_octo::{
    Any, DocOptions, DocSession, SessionConfig, SessionReadValue, SessionUndoConfig, TypePath,
    TypeTarget,
};

use crate::error::{StoreError, StoreResult};

/// Bidirectional document ID converter matching `packages/common/nbstore/src/utils/id-converter.ts`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdConverter {
    space_id: String,
    old_to_new: BTreeMap<String, String>,
    new_to_old: BTreeMap<String, String>,
}

impl IdConverter {
    /// Build a converter with no page aliases.
    pub fn new(space_id: impl Into<String>) -> Self {
        let space_id = space_id.into();
        let mut old_to_new = BTreeMap::new();
        let mut new_to_old = BTreeMap::new();
        old_to_new.insert(space_id.clone(), space_id.clone());
        new_to_old.insert(space_id.clone(), space_id.clone());
        Self {
            space_id,
            old_to_new,
            new_to_old,
        }
    }

    /// Build a converter with an explicit legacy root document GUID when `root_doc_id != space_id`.
    pub fn with_root_doc_id(space_id: impl Into<String>, root_doc_id: impl Into<String>) -> Self {
        let space_id = space_id.into();
        let root_doc_id = root_doc_id.into();
        let mut converter = Self::new(space_id.clone());
        if root_doc_id != space_id {
            converter
                .old_to_new
                .insert(root_doc_id.clone(), space_id.clone());
            converter.new_to_old.insert(space_id, root_doc_id);
        }
        converter
    }

    /// Build a converter from explicit bidirectional maps.
    pub fn from_maps(
        space_id: impl Into<String>,
        old_to_new: BTreeMap<String, String>,
        new_to_old: BTreeMap<String, String>,
    ) -> Self {
        Self {
            space_id: space_id.into(),
            old_to_new,
            new_to_old,
        }
    }

    /// Extract page-to-subdoc GUID aliases from an encoded root YDoc update.
    pub fn from_root_doc_bytes(
        space_id: impl Into<String>,
        root_doc_id: Option<&str>,
        root_doc_bytes: Option<&[u8]>,
    ) -> StoreResult<Self> {
        let space_id = space_id.into();
        let effective_root_id = root_doc_id.unwrap_or(&space_id);
        let mut converter = Self::with_root_doc_id(space_id.clone(), effective_root_id);

        let Some(bytes) = root_doc_bytes else {
            return Ok(converter);
        };
        if bytes.is_empty() || bytes == [0, 0] {
            return Ok(converter);
        }

        let options = DocOptions::from_identity(1, effective_root_id.to_string());
        let mut session = DocSession::<()>::with_config(
            options,
            SessionConfig {
                undo: SessionUndoConfig::Disabled,
            },
        );
        session
            .apply_update_v1(bytes)
            .map_err(|err| StoreError::InvalidBinary(err.to_string()))?;

        let pages_target = TypeTarget::Path(TypePath::root("meta").key("pages"));
        let Ok(page_items) = session.read_array(&pages_target) else {
            return Ok(converter);
        };

        let spaces_target = TypeTarget::Path(TypePath::root("spaces"));
        for item in page_items {
            let SessionReadValue::Map(map_id) = item else {
                continue;
            };
            let Ok(Some(SessionReadValue::Any(Any::String(page_id)))) =
                session.get_map_value(&TypeTarget::Identity(map_id), "id")
            else {
                continue;
            };
            if page_id.is_empty() {
                continue;
            }
            if let Ok(Some(SessionReadValue::Doc { guid, .. })) =
                session.get_map_value(&spaces_target, &page_id)
            {
                converter.register_page_mapping(page_id, guid);
            }
        }

        Ok(converter)
    }

    /// Register a bidirectional alias between normalized `page_id` and legacy `subdoc_guid`.
    pub fn register_page_mapping(
        &mut self,
        page_id: impl Into<String>,
        subdoc_guid: impl Into<String>,
    ) {
        let page_id = page_id.into();
        let subdoc_guid = subdoc_guid.into();
        self.old_to_new.insert(subdoc_guid.clone(), page_id.clone());
        self.new_to_old.insert(page_id, subdoc_guid);
    }

    /// Return the workspace ID this converter belongs to.
    pub fn space_id(&self) -> &str {
        &self.space_id
    }

    /// Return all registered `(page_id, subdoc_guid)` mappings (excluding the root workspace ID),
    /// including modern pages where `page_id == subdoc_guid`.
    pub fn page_mappings(&self) -> Vec<(&str, &str)> {
        self.new_to_old
            .iter()
            .filter(|(page_id, _)| page_id.as_str() != self.space_id)
            .map(|(page_id, subdoc_guid)| (page_id.as_str(), subdoc_guid.as_str()))
            .collect()
    }

    /// Convert a local normalized document ID to the legacy/wire document ID.
    pub fn new_id_to_old_id(&self, new_id: &str) -> String {
        if let Some(rest) = new_id.strip_prefix("db$") {
            return format!("db${}${rest}", self.space_id);
        }
        if let Some(converted) = convert_userdata_new_to_old(new_id, &self.space_id) {
            return converted;
        }
        self.new_to_old
            .get(new_id)
            .cloned()
            .unwrap_or_else(|| new_id.to_string())
    }

    /// Convert a legacy/wire document ID to the local normalized document ID.
    pub fn old_id_to_new_id(&self, old_id: &str) -> String {
        let db_prefix = format!("db${}$", self.space_id);
        if let Some(rest) = old_id.strip_prefix(&db_prefix) {
            return format!("db${rest}");
        }
        if let Some(converted) = convert_userdata_old_to_new(old_id, &self.space_id) {
            return converted;
        }
        self.old_to_new
            .get(old_id)
            .cloned()
            .unwrap_or_else(|| old_id.to_string())
    }
}

fn is_word_or_hyphen(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-'
}

/// Mirrors `newId.replace(/^(userdata\$[\w-]+)\$([^\$]+)/, (_, p1, p2) => `${p1}$${spaceId}$${p2}`)`.
fn convert_userdata_new_to_old(new_id: &str, space_id: &str) -> Option<String> {
    let rest = new_id.strip_prefix("userdata$")?;
    let dollar_pos = rest.find('$')?;
    let user_id = &rest[..dollar_pos];
    if user_id.is_empty() || !user_id.bytes().all(is_word_or_hyphen) {
        return None;
    }
    let after_user = &rest[dollar_pos + 1..];
    if after_user.is_empty() || after_user.starts_with('$') {
        return None;
    }
    Some(format!("userdata${user_id}${space_id}${after_user}"))
}

/// Mirrors `oldId.match(/^userdata\$[\w-]+\$<spaceId>\$/)` then `oldId.replace(`$${spaceId}$`, '$')`.
fn convert_userdata_old_to_new(old_id: &str, space_id: &str) -> Option<String> {
    let rest = old_id.strip_prefix("userdata$")?;
    let dollar_pos = rest.find('$')?;
    let user_id = &rest[..dollar_pos];
    if user_id.is_empty() || !user_id.bytes().all(is_word_or_hyphen) {
        return None;
    }
    let after_user = &rest[dollar_pos + 1..];
    let space_prefix = format!("{space_id}$");
    let remainder = after_user.strip_prefix(&space_prefix)?;
    Some(format!("userdata${user_id}${remainder}"))
}

#[cfg(test)]
mod tests {
    use y_octo::{SessionTxOrigin, SessionValue, YTypeKind};

    use super::*;

    #[test]
    fn table_driven_id_conversion_roundtrips_all_branches() {
        let mut converter = IdConverter::with_root_doc_id("ws-1", "legacy-root-guid");
        converter.register_page_mapping("page-a", "subdoc-guid-a");

        let cases = [
            // Root doc with guid != spaceId
            ("ws-1", "legacy-root-guid"),
            // Legacy page subdoc GUID mapping
            ("page-a", "subdoc-guid-a"),
            // Normal page with identical GUID
            ("page-b", "page-b"),
            // All 5 workspace db$ tables
            ("db$folders", "db$ws-1$folders"),
            ("db$docProperties", "db$ws-1$docProperties"),
            ("db$docCustomPropertyInfo", "db$ws-1$docCustomPropertyInfo"),
            ("db$pinnedCollections", "db$ws-1$pinnedCollections"),
            ("db$explorerIcon", "db$ws-1$explorerIcon"),
            // All 3 userdata$ tables with user id and __local__
            (
                "userdata$user-42$favorite",
                "userdata$user-42$ws-1$favorite",
            ),
            (
                "userdata$user-42$settings",
                "userdata$user-42$ws-1$settings",
            ),
            (
                "userdata$user-42$docIntegrationRef",
                "userdata$user-42$ws-1$docIntegrationRef",
            ),
            (
                "userdata$__local__$favorite",
                "userdata$__local__$ws-1$favorite",
            ),
        ];

        for (local_id, wire_id) in cases {
            assert_eq!(
                converter.new_id_to_old_id(local_id),
                wire_id,
                "new->old for {local_id}"
            );
            assert_eq!(
                converter.old_id_to_new_id(wire_id),
                local_id,
                "old->new for {wire_id}"
            );
        }

        // Foreign space db$ and userdata$ IDs must pass through unchanged.
        assert_eq!(
            converter.old_id_to_new_id("db$other-ws$folders"),
            "db$other-ws$folders"
        );
        assert_eq!(
            converter.old_id_to_new_id("userdata$u1$other-ws$favorite"),
            "userdata$u1$other-ws$favorite"
        );
    }

    #[test]
    fn from_root_doc_bytes_extracts_subdoc_guid_aliases() {
        let options = DocOptions::from_identity(1, "legacy-root".to_string());
        let mut session = DocSession::<()>::with_config(
            options,
            SessionConfig {
                undo: SessionUndoConfig::Disabled,
            },
        );
        let meta = TypeTarget::from(session.ensure_root("meta", YTypeKind::Map).unwrap());
        let spaces = TypeTarget::from(session.ensure_root("spaces", YTypeKind::Map).unwrap());
        session.begin_tx(SessionTxOrigin::Untracked).unwrap();
        session
            .map_set(&meta, "pages".to_string(), SessionValue::Array(Vec::new()))
            .unwrap();
        let pages_target = TypeTarget::Path(TypePath::root("meta").key("pages"));
        session
            .array_push(
                &pages_target,
                vec![
                    SessionValue::Map(vec![(
                        "id".to_string(),
                        SessionValue::Any(Any::String("page-1".to_string())),
                    )]),
                    SessionValue::Map(vec![(
                        "id".to_string(),
                        SessionValue::Any(Any::String("page-2".to_string())),
                    )]),
                ],
            )
            .unwrap();
        session
            .map_set(
                &spaces,
                "page-1".to_string(),
                SessionValue::Doc {
                    guid: "old-guid-1".to_string(),
                    gc: true,
                },
            )
            .unwrap();
        session
            .map_set(
                &spaces,
                "page-2".to_string(),
                SessionValue::Doc {
                    guid: "page-2".to_string(),
                    gc: true,
                },
            )
            .unwrap();
        let commit = session.commit_tx().unwrap().unwrap();

        let converter =
            IdConverter::from_root_doc_bytes("space-1", Some("legacy-root"), Some(&commit.update))
                .unwrap();
        assert_eq!(converter.new_id_to_old_id("space-1"), "legacy-root");
        assert_eq!(converter.old_id_to_new_id("legacy-root"), "space-1");
        assert_eq!(converter.new_id_to_old_id("page-1"), "old-guid-1");
        assert_eq!(converter.old_id_to_new_id("old-guid-1"), "page-1");
        assert_eq!(converter.new_id_to_old_id("page-2"), "page-2");
        assert_eq!(converter.old_id_to_new_id("page-2"), "page-2");
    }
}
