use std::collections::BTreeMap;

use y_octo::{
    Any, DocOptions, DocSession, SessionConfig, SessionReadValue, SessionUndoConfig, TypePath,
    TypeTarget, merge_updates_v1, validate_update_v1,
};

use crate::error::{StoreError, StoreResult};

fn is_empty_crdt_update(bin: &[u8]) -> bool {
    bin.is_empty() || bin == [0, 0]
}

/// Merge a slice of encoded Yjs v1 CRDT updates into a single v1 update (native + `wasm32`).
pub fn merge_crdt_updates_v1(updates: &[&[u8]]) -> StoreResult<Vec<u8>> {
    let non_empty: Vec<&[u8]> = updates
        .iter()
        .copied()
        .filter(|u| !is_empty_crdt_update(u))
        .collect();
    match non_empty.as_slice() {
        [] => Ok(vec![0, 0]),
        [single] => {
            validate_update_v1(single).map_err(|err| StoreError::InvalidBinary(err.to_string()))?;
            Ok((*single).to_vec())
        }
        many => merge_updates_v1(many.iter().copied())
            .and_then(|merged| merged.encode_v1())
            .map_err(|err| StoreError::InvalidBinary(err.to_string())),
    }
}

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

    /// Extract live `meta.pages -> spaces` subdoc GUIDs from one or more encoded Yjs v1 root
    /// document updates (merged via `y-octo`, rejecting malformed or truncated frames).
    pub fn extract_subdoc_guids_from_root_updates(
        space_id: &str,
        root_updates: &[&[u8]],
    ) -> StoreResult<Vec<String>> {
        if root_updates.is_empty() {
            return Ok(Vec::new());
        }
        let merged = merge_crdt_updates_v1(root_updates)?;
        let converter = Self::from_root_doc_bytes(space_id, None, Some(&merged))?;
        let mut guids = Vec::new();
        for (_, guid) in converter.page_mappings() {
            if !guids.iter().any(|existing| existing == guid) {
                guids.push(guid.to_string());
            }
        }
        Ok(guids)
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

    #[test]
    fn real_yjs_v1_binary_fixtures_decode_overwrites_xml_deleteset_and_concurrent_spaces() {
        // Genuine Yjs v1 binary fixtures migrated from Web host idb-storage tests.
        const RENAMED_TWICE_TWO_PAGES: &[u8] = &[
            1, 11, 101, 0, 33, 1, 4, 109, 101, 116, 97, 4, 110, 97, 109, 101, 1, 168, 101, 0, 1,
            119, 12, 87, 111, 114, 107, 115, 112, 97, 99, 101, 32, 118, 50, 39, 1, 4, 109, 101,
            116, 97, 5, 112, 97, 103, 101, 115, 0, 7, 0, 101, 2, 1, 40, 0, 101, 3, 2, 105, 100, 1,
            119, 6, 112, 97, 103, 101, 45, 49, 40, 0, 101, 3, 5, 116, 105, 116, 108, 101, 1, 119,
            8, 80, 97, 103, 101, 32, 79, 110, 101, 135, 101, 3, 1, 40, 0, 101, 6, 2, 105, 100, 1,
            119, 6, 112, 97, 103, 101, 45, 50, 40, 0, 101, 6, 5, 116, 105, 116, 108, 101, 1, 119,
            8, 80, 97, 103, 101, 32, 84, 119, 111, 41, 1, 6, 115, 112, 97, 99, 101, 115, 6, 112,
            97, 103, 101, 45, 49, 13, 103, 117, 105, 100, 45, 99, 97, 115, 101, 49, 45, 112, 49,
            118, 0, 41, 1, 6, 115, 112, 97, 99, 101, 115, 6, 112, 97, 103, 101, 45, 50, 13, 103,
            117, 105, 100, 45, 99, 97, 115, 101, 49, 45, 112, 50, 118, 0, 1, 101, 1, 0, 1,
        ];
        const TITLE_EDITED_TWICE_THEN_P2: &[u8] = &[
            1, 11, 102, 0, 39, 1, 4, 109, 101, 116, 97, 5, 112, 97, 103, 101, 115, 0, 7, 0, 102, 0,
            1, 40, 0, 102, 1, 2, 105, 100, 1, 119, 2, 112, 49, 33, 0, 102, 1, 5, 116, 105, 116,
            108, 101, 1, 41, 1, 6, 115, 112, 97, 99, 101, 115, 2, 112, 49, 13, 103, 117, 105, 100,
            45, 99, 97, 115, 101, 50, 45, 112, 49, 118, 0, 161, 102, 3, 1, 168, 102, 5, 1, 119, 11,
            70, 105, 110, 97, 108, 32, 84, 105, 116, 108, 101, 135, 102, 1, 1, 40, 0, 102, 7, 2,
            105, 100, 1, 119, 2, 112, 50, 40, 0, 102, 7, 5, 116, 105, 116, 108, 101, 1, 119, 11,
            83, 101, 99, 111, 110, 100, 32, 80, 97, 103, 101, 41, 1, 6, 115, 112, 97, 99, 101, 115,
            2, 112, 50, 13, 103, 117, 105, 100, 45, 99, 97, 115, 101, 50, 45, 112, 50, 118, 0, 1,
            102, 2, 3, 1, 5, 1,
        ];
        const XML_FRAGMENT_BEFORE_PAGE: &[u8] = &[
            1, 7, 103, 0, 39, 1, 4, 109, 101, 116, 97, 5, 110, 111, 116, 101, 115, 4, 7, 0, 103, 0,
            3, 9, 112, 97, 114, 97, 103, 114, 97, 112, 104, 39, 1, 4, 109, 101, 116, 97, 5, 112,
            97, 103, 101, 115, 0, 7, 0, 103, 2, 1, 40, 0, 103, 3, 2, 105, 100, 1, 119, 5, 112, 45,
            120, 109, 108, 40, 0, 103, 3, 5, 116, 105, 116, 108, 101, 1, 119, 17, 65, 102, 116,
            101, 114, 32, 88, 109, 108, 70, 114, 97, 103, 109, 101, 110, 116, 41, 1, 6, 115, 112,
            97, 99, 101, 115, 5, 112, 45, 120, 109, 108, 14, 103, 117, 105, 100, 45, 99, 97, 115,
            101, 51, 45, 120, 109, 108, 118, 0, 0,
        ];
        const OVERWRITTEN_AND_FOREIGN_SNAPSHOT: &[u8] = &[
            1, 7, 104, 0, 39, 1, 4, 109, 101, 116, 97, 5, 112, 97, 103, 101, 115, 0, 7, 0, 104, 0,
            1, 40, 0, 104, 1, 2, 105, 100, 1, 119, 2, 112, 49, 40, 0, 104, 1, 5, 116, 105, 116,
            108, 101, 1, 119, 9, 76, 105, 118, 101, 32, 80, 97, 103, 101, 33, 1, 6, 115, 112, 97,
            99, 101, 115, 2, 112, 49, 1, 169, 104, 4, 9, 108, 105, 118, 101, 45, 103, 117, 105,
            100, 118, 0, 41, 1, 8, 111, 116, 104, 101, 114, 77, 97, 112, 7, 102, 111, 114, 101,
            105, 103, 110, 12, 102, 111, 114, 101, 105, 103, 110, 45, 103, 117, 105, 100, 118, 0,
            1, 104, 1, 4, 1,
        ];
        const OVERWRITTEN_INCREMENTAL_0: &[u8] = &[
            1, 6, 105, 0, 39, 1, 4, 109, 101, 116, 97, 5, 112, 97, 103, 101, 115, 0, 7, 0, 105, 0,
            1, 40, 0, 105, 1, 2, 105, 100, 1, 119, 2, 112, 49, 40, 0, 105, 1, 5, 116, 105, 116,
            108, 101, 1, 119, 9, 76, 105, 118, 101, 32, 80, 97, 103, 101, 41, 1, 6, 115, 112, 97,
            99, 101, 115, 2, 112, 49, 8, 111, 108, 100, 45, 103, 117, 105, 100, 118, 0, 41, 1, 8,
            111, 116, 104, 101, 114, 77, 97, 112, 7, 102, 111, 114, 101, 105, 103, 110, 12, 102,
            111, 114, 101, 105, 103, 110, 45, 103, 117, 105, 100, 118, 0, 0,
        ];
        const OVERWRITTEN_INCREMENTAL_1: &[u8] = &[
            1, 1, 105, 6, 169, 105, 4, 9, 108, 105, 118, 101, 45, 103, 117, 105, 100, 118, 0, 1,
            105, 1, 4, 1,
        ];
        const EMPTY_PAGES_WITH_ORPHAN_SPACE: &[u8] = &[
            1, 4, 106, 0, 39, 1, 4, 109, 101, 116, 97, 5, 112, 97, 103, 101, 115, 0, 1, 0, 106, 0,
            1, 0, 1, 41, 1, 6, 115, 112, 97, 99, 101, 115, 2, 112, 49, 11, 111, 114, 112, 104, 97,
            110, 45, 103, 117, 105, 100, 118, 0, 1, 106, 1, 1, 2,
        ];

        let cases: &[(&str, &[&[u8]], &[&str])] = &[
            (
                "renamedTwiceTwoPages",
                &[RENAMED_TWICE_TWO_PAGES],
                &["guid-case1-p1", "guid-case1-p2"],
            ),
            (
                "titleEditedTwiceThenP2",
                &[TITLE_EDITED_TWICE_THEN_P2],
                &["guid-case2-p1", "guid-case2-p2"],
            ),
            (
                "xmlFragmentBeforePage",
                &[XML_FRAGMENT_BEFORE_PAGE],
                &["guid-case3-xml"],
            ),
            (
                "overwrittenAndForeignSnapshot",
                &[OVERWRITTEN_AND_FOREIGN_SNAPSHOT],
                &["live-guid"],
            ),
            (
                "overwrittenAndForeignIncremental",
                &[OVERWRITTEN_INCREMENTAL_0, OVERWRITTEN_INCREMENTAL_1],
                &["live-guid"],
            ),
            (
                "emptyPagesWithOrphanSpace",
                &[EMPTY_PAGES_WITH_ORPHAN_SPACE],
                &[],
            ),
        ];
        for (name, updates, expected) in cases {
            let actual =
                IdConverter::extract_subdoc_guids_from_root_updates("ws-v1", updates).unwrap();
            assert_eq!(actual, *expected, "fixture={name}");
        }

        // Malformed / truncated frames MUST return InvalidBinary.
        assert!(matches!(
            IdConverter::extract_subdoc_guids_from_root_updates(
                "ws-v1",
                &[&[1, 1, 1, 0, 0x20 | 9, 1]]
            ),
            Err(StoreError::InvalidBinary(_))
        ));
        let truncated =
            &OVERWRITTEN_AND_FOREIGN_SNAPSHOT[..OVERWRITTEN_AND_FOREIGN_SNAPSHOT.len() - 5];
        assert!(matches!(
            IdConverter::extract_subdoc_guids_from_root_updates("ws-v1", &[truncated]),
            Err(StoreError::InvalidBinary(_))
        ));

        // 3-segment and 4-segment userdata$ conversion parity.
        let conv = IdConverter::new("ws");
        assert_eq!(conv.old_id_to_new_id("userdata$u$ws$fav"), "userdata$u$fav");
        assert_eq!(conv.new_id_to_old_id("userdata$u$fav"), "userdata$u$ws$fav");
        assert_eq!(
            conv.old_id_to_new_id("userdata$u$other"),
            "userdata$u$other"
        );
    }
}
