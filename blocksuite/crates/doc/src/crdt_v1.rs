//! Pure `y-octo` Yjs v1 update merging and root-document `meta.pages -> spaces` subdoc GUID
//! extraction shared by `affine-store` and the WebAssembly `playground` bundle.

use y_octo::{
    Any, DocOptions, DocSession, SessionConfig, SessionReadValue, SessionUndoConfig, TypePath,
    TypeTarget, merge_updates_v1, validate_update_v1,
};

use crate::DocResult;

fn is_empty_crdt_update(bin: &[u8]) -> bool {
    bin.is_empty() || bin == [0, 0]
}

/// Merge a slice of encoded Yjs v1 CRDT updates into a single v1 update (native + `wasm32`).
pub fn merge_crdt_updates_v1(updates: &[&[u8]]) -> DocResult<Vec<u8>> {
    let non_empty: Vec<&[u8]> = updates
        .iter()
        .copied()
        .filter(|u| !is_empty_crdt_update(u))
        .collect();
    match non_empty.as_slice() {
        [] => Ok(vec![0, 0]),
        [single] => {
            validate_update_v1(single)?;
            Ok((*single).to_vec())
        }
        many => Ok(merge_updates_v1(many.iter().copied())?.encode_v1()?),
    }
}

/// Extract `(page_id, subdoc_guid)` mappings from an encoded Yjs v1 root workspace document.
pub fn extract_page_subdoc_mappings(
    root_doc_id: &str,
    root_doc_bytes: &[u8],
) -> DocResult<Vec<(String, String)>> {
    if is_empty_crdt_update(root_doc_bytes) {
        return Ok(Vec::new());
    }
    let options = DocOptions::from_identity(1, root_doc_id.to_string());
    let mut session = DocSession::<()>::with_config(
        options,
        SessionConfig {
            undo: SessionUndoConfig::Disabled,
        },
    );
    session.apply_update_v1(root_doc_bytes)?;

    let pages_target = TypeTarget::Path(TypePath::root("meta").key("pages"));
    let Ok(page_items) = session.read_array(&pages_target) else {
        return Ok(Vec::new());
    };

    let spaces_target = TypeTarget::Path(TypePath::root("spaces"));
    let mut mappings = Vec::new();
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
            mappings.push((page_id, guid));
        }
    }
    Ok(mappings)
}

/// Extract sorted, deduplicated live `meta.pages -> spaces` subdoc GUIDs from one or more
/// encoded Yjs v1 root document updates, rejecting malformed or truncated frames.
pub fn extract_subdoc_guids_from_root_updates(root_updates: &[&[u8]]) -> DocResult<Vec<String>> {
    if root_updates.is_empty() {
        return Ok(Vec::new());
    }
    let merged = merge_crdt_updates_v1(root_updates)?;
    let mappings = extract_page_subdoc_mappings("", &merged)?;
    let mut guids: Vec<String> = mappings.into_iter().map(|(_, guid)| guid).collect();
    guids.sort();
    guids.dedup();
    Ok(guids)
}

#[cfg(test)]
mod tests {
    use y_octo::{Doc, DocOptions};

    use super::*;

    #[test]
    fn merge_and_extract_subdoc_guids_handle_real_yjs_v1_and_corrupt_frames() {
        assert_eq!(merge_crdt_updates_v1(&[]).unwrap(), vec![0, 0]);
        assert!(merge_crdt_updates_v1(&[&[0xff, 0xff, 0xff, 0x80]]).is_err());

        let doc_a = Doc::with_options(DocOptions::from_identity(101, String::new()));
        let mut text_a = doc_a.get_or_create_text("content").unwrap();
        text_a.insert(0, "hello ").unwrap();
        let upd_a = doc_a.encode_update_v1().unwrap();

        let doc_b = Doc::with_options(DocOptions::from_identity(202, String::new()));
        let mut text_b = doc_b.get_or_create_text("content").unwrap();
        text_b.insert(0, "world").unwrap();
        let upd_b = doc_b.encode_update_v1().unwrap();

        let merged = merge_crdt_updates_v1(&[&[0, 0], &upd_a, &[], &upd_b]).unwrap();
        let mut check = Doc::with_options(DocOptions::from_identity(303, String::new()));
        check.apply_update_from_binary_v1(&merged).unwrap();
        let text = check.get_or_create_text("content").unwrap().to_string();
        assert!(text.contains("hello ") && text.contains("world"));

        let real_yjs_v1: [&[u8]; 2] = [
            &[
                1, 6, 105, 0, 39, 1, 4, 109, 101, 116, 97, 5, 112, 97, 103, 101, 115, 0, 7, 0, 105,
                0, 1, 40, 0, 105, 1, 2, 105, 100, 1, 119, 2, 112, 49, 40, 0, 105, 1, 5, 116, 105,
                116, 108, 101, 1, 119, 9, 76, 105, 118, 101, 32, 80, 97, 103, 101, 41, 1, 6, 115,
                112, 97, 99, 101, 115, 2, 112, 49, 8, 111, 108, 100, 45, 103, 117, 105, 100, 118,
                0, 41, 1, 8, 111, 116, 104, 101, 114, 77, 97, 112, 7, 102, 111, 114, 101, 105, 103,
                110, 12, 102, 111, 114, 101, 105, 103, 110, 45, 103, 117, 105, 100, 118, 0, 0,
            ],
            &[
                1, 1, 105, 6, 169, 105, 4, 9, 108, 105, 118, 101, 45, 103, 117, 105, 100, 118, 0,
                1, 105, 1, 4, 1,
            ],
        ];
        assert_eq!(
            extract_subdoc_guids_from_root_updates(&real_yjs_v1).unwrap(),
            vec!["live-guid".to_string()]
        );
        let merged_root = merge_crdt_updates_v1(&real_yjs_v1).unwrap();
        assert_eq!(
            extract_subdoc_guids_from_root_updates(&[&merged_root]).unwrap(),
            vec!["live-guid".to_string()]
        );
    }
}
