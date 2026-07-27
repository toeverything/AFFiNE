//! Throwaway probe: merge the on-disk root-doc update binaries and confirm the created doc
//! id is registered in meta.pages. Runs only when AFFINE_PROBE_U0/U1/DOC_ID are set.

use y_octo::{Doc, DocOptions};

#[test]
fn root_meta_pages_contains_doc_id() {
    let (u0, u1, doc_id) = match (
        std::env::var("AFFINE_PROBE_U0"),
        std::env::var("AFFINE_PROBE_U1"),
        std::env::var("AFFINE_PROBE_DOC_ID"),
    ) {
        (Ok(a), Ok(b), Ok(c)) => (a, b, c),
        _ => {
            eprintln!("probe env not set; skipping");
            return;
        }
    };

    let mut doc: Doc = DocOptions::new().build();
    for path in [&u0, &u1] {
        let bin = std::fs::read(path).expect("read update bin");
        doc.apply_update_from_binary_v1(&bin).expect("apply update");
    }

    let meta = doc.get_map("meta").expect("meta map");
    let pages = meta.get("pages").expect("pages value");
    let pages_arr = pages.to_array().expect("pages is an array");

    let mut found_ids = Vec::new();
    for page_val in pages_arr.iter() {
        if let Some(page) = page_val.to_map()
            && let Some(id_val) = page.get("id")
            && let Some(any) = id_val.to_any()
        {
            found_ids.push(format!("{any:?}"));
        }
    }

    assert!(
        found_ids.iter().any(|s| s.contains(&doc_id)),
        "expected doc_id {doc_id} in meta.pages, found: {found_ids:?}"
    );
    eprintln!("OK: meta.pages registers doc ids: {found_ids:?}");
}
