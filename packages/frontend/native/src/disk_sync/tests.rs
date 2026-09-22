use std::{
  fs,
  path::{Path, PathBuf},
};

use affine_common::doc_parser::{build_full_doc, update_doc};
use chrono::Utc;
use napi::bindgen_prelude::Uint8Array;
use uuid::Uuid;
use y_octo::{Any, DocOptions, Value};

use super::{
  DiskDocUpdateInput, DiskSessionOptions, DiskSync, frontmatter::parse_frontmatter, root_meta::build_root_meta_update,
  types::FrontmatterMeta, utils::collect_markdown_files,
};

fn temp_dir() -> PathBuf {
  let dir = std::env::temp_dir().join(format!(
    "affine-disk-sync-{}-{}-{}",
    std::process::id(),
    Utc::now().timestamp_nanos_opt().unwrap_or_default(),
    Uuid::new_v4()
  ));
  fs::create_dir_all(&dir).expect("create temp dir");
  dir
}

fn build_doc_with_unsupported_block(doc_id: &str, title: &str, flavour: &str) -> Vec<u8> {
  let doc = DocOptions::new().with_guid(doc_id.to_string()).build();
  let mut blocks = doc.get_or_create_map("blocks").expect("create blocks map");

  let mut page = doc.create_map().expect("create page block");
  page.insert("sys:id".into(), "page").expect("set page id");
  page
    .insert("sys:flavour".into(), "affine:page")
    .expect("set page flavour");
  let mut page_children = doc.create_array().expect("create page children");
  page_children.push("note").expect("append page child");
  page
    .insert("sys:children".into(), Value::Array(page_children))
    .expect("set page children");
  let mut page_title = doc.create_text().expect("create page title");
  page_title.insert(0, title).expect("set page title");
  page
    .insert("prop:title".into(), Value::Text(page_title))
    .expect("set page title prop");
  blocks
    .insert("page".into(), Value::Map(page))
    .expect("insert page block");

  let mut note = doc.create_map().expect("create note block");
  note.insert("sys:id".into(), "note").expect("set note id");
  note
    .insert("sys:flavour".into(), "affine:note")
    .expect("set note flavour");
  let mut note_children = doc.create_array().expect("create note children");
  note_children.push("unsupported").expect("append unsupported child");
  note
    .insert("sys:children".into(), Value::Array(note_children))
    .expect("set note children");
  note
    .insert("prop:displayMode".into(), "page")
    .expect("set note display mode");
  blocks
    .insert("note".into(), Value::Map(note))
    .expect("insert note block");

  let mut unsupported = doc.create_map().expect("create unsupported block");
  unsupported
    .insert("sys:id".into(), "unsupported")
    .expect("set unsupported id");
  unsupported
    .insert("sys:flavour".into(), flavour)
    .expect("set unsupported flavour");
  unsupported
    .insert(
      "sys:children".into(),
      Value::Array(doc.create_array().expect("create unsupported children")),
    )
    .expect("set unsupported children");
  blocks
    .insert("unsupported".into(), Value::Map(unsupported))
    .expect("insert unsupported block");

  doc.encode_update_v1().expect("encode unsupported doc")
}

async fn teardown(sync: &DiskSync, session_id: &str, dir: &Path) {
  sync.stop_session(session_id.to_string()).await.expect("stop session");
  if dir.exists() {
    let _ = fs::remove_dir_all(dir);
  }
}

fn is_numeric_any(value: &Any) -> bool {
  match value {
    Any::Integer(_) | Any::BigInt64(_) => true,
    Any::Float32(v) => v.0.is_finite(),
    Any::Float64(v) => v.0.is_finite(),
    _ => false,
  }
}

#[test]
fn parse_frontmatter_supported_fields() {
  let raw = r#"---
id: doc-1
title: "Demo"
tags:
  - alpha
  - beta
favorite: true
trash: false
---

# Heading

Body.
"#;

  let (meta, body) = parse_frontmatter(raw);
  assert_eq!(meta.id.as_deref(), Some("doc-1"));
  assert_eq!(meta.title.as_deref(), Some("Demo"));
  assert_eq!(meta.tags, Some(vec!["alpha".to_string(), "beta".to_string()]));
  assert_eq!(meta.favorite, Some(true));
  assert_eq!(meta.trash, Some(false));
  assert!(body.contains("# Heading"));
}

#[test]
fn parse_frontmatter_preserves_explicit_empty_title() {
  let raw = r#"---
id: doc-empty-title
title: ""
---

Body
"#;

  let (meta, _) = parse_frontmatter(raw);
  assert_eq!(meta.id.as_deref(), Some("doc-empty-title"));
  assert_eq!(meta.title.as_deref(), Some(""));
}

#[tokio::test]
async fn start_session_imports_markdown_and_creates_state_db() {
  let dir = temp_dir();
  let md_path = dir.join("doc-a.md");
  fs::write(
    &md_path,
    "---\nid: doc-a\ntitle: A\ntags: [one,two]\n---\n\n# A\n\ncontent",
  )
  .expect("write markdown");

  let sync = DiskSync::new();
  let session_id = "session-import";

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-a".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
      },
    )
    .await
    .expect("start session");

  let events = sync.pull_events(session_id.to_string()).await.expect("pull events");

  assert!(events.iter().any(|event| event.r#type == "ready"));
  assert!(events.iter().any(|event| {
    event.r#type == "doc-update" && event.update.as_ref().is_some_and(|update| update.doc_id == "doc-a")
  }));
  assert!(events.iter().any(|event| {
    event.r#type == "doc-update" && event.update.as_ref().is_some_and(|update| update.doc_id == "ws-a")
  }));

  assert!(dir.join(".affine-sync/state.db").exists());

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn apply_local_update_exports_markdown_even_with_unsupported_block() {
  let dir = temp_dir();

  let sync = DiskSync::new();
  let session_id = "session-export-unsupported";

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-export-unsupported".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
      },
    )
    .await
    .expect("start session");

  let _ = sync.pull_events(session_id.to_string()).await.expect("pull");

  let doc_bin = build_doc_with_unsupported_block("doc-unsupported", "Unsupported", "affine:latex");

  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: "doc-unsupported".to_string(),
        bin: Uint8Array::new(doc_bin),
        editor: Some("test".to_string()),
      },
      Some("origin:local".to_string()),
    )
    .await
    .expect("apply local update");

  let mut exported_files = Vec::new();
  collect_markdown_files(&dir, &mut exported_files).expect("collect markdown files");
  assert_eq!(exported_files.len(), 1);

  let content = fs::read_to_string(&exported_files[0]).expect("read exported markdown");
  assert!(content.contains("id: doc-unsupported"));
  assert!(content.contains("unsupported_block_flavour:affine:latex"));

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn apply_local_update_exports_markdown_with_stable_id() {
  let dir = temp_dir();

  let sync = DiskSync::new();
  let session_id = "session-export";

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-export".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
      },
    )
    .await
    .expect("start session");

  let _ = sync.pull_events(session_id.to_string()).await.expect("pull");

  let doc_bin = build_full_doc("Exported", "# Exported\n\nHello", "doc-export").expect("build doc bin");

  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: "doc-export".to_string(),
        bin: Uint8Array::new(doc_bin),
        editor: Some("test".to_string()),
      },
      Some("origin:local".to_string()),
    )
    .await
    .expect("apply local update");

  let mut exported_files = Vec::new();
  collect_markdown_files(&dir, &mut exported_files).expect("collect markdown files");
  assert_eq!(exported_files.len(), 1);

  let content = fs::read_to_string(&exported_files[0]).expect("read exported markdown");
  assert!(content.contains("id: doc-export"));
  assert!(content.contains("# Exported"));

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn empty_title_export_does_not_trigger_self_import() {
  let dir = temp_dir();

  let sync = DiskSync::new();
  let session_id = "session-empty-title";

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-empty-title".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
      },
    )
    .await
    .expect("start session");

  let _ = sync.pull_events(session_id.to_string()).await.expect("pull first");

  let doc_id = "doc-empty-title";
  let doc_bin = build_full_doc("", "", doc_id).expect("build empty-title doc");

  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_id.to_string(),
        bin: Uint8Array::new(doc_bin),
        editor: Some("test".to_string()),
      },
      Some("origin:local".to_string()),
    )
    .await
    .expect("apply local update");

  let events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull after export");

  assert!(!events.iter().any(|event| {
    event.r#type == "doc-update"
      && event.origin.as_deref() == Some("disk:file-import")
      && event.update.as_ref().is_some_and(|update| update.doc_id == doc_id)
  }));

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn invalid_local_update_does_not_block_other_docs_exports() {
  let dir = temp_dir();

  let sync = DiskSync::new();
  let session_id = "session-invalid-update";

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-invalid-update".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
      },
    )
    .await
    .expect("start session");

  let _ = sync.pull_events(session_id.to_string()).await.expect("pull first");

  let doc_a_id = "doc-invalid-a";
  let doc_a_bin = build_full_doc("A", "# A\n\none", doc_a_id).expect("build doc A");
  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_a_id.to_string(),
        bin: Uint8Array::new(doc_a_bin),
        editor: Some("test".to_string()),
      },
      Some("origin:local".to_string()),
    )
    .await
    .expect("apply doc A update");

  let invalid = sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_a_id.to_string(),
        bin: Uint8Array::new(vec![1, 2, 3]),
        editor: Some("test".to_string()),
      },
      Some("origin:local".to_string()),
    )
    .await;
  assert!(invalid.is_ok());

  let doc_b_id = "doc-valid-b";
  let doc_b_bin = build_full_doc("B", "# B\n\ntwo", doc_b_id).expect("build doc B");
  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_b_id.to_string(),
        bin: Uint8Array::new(doc_b_bin),
        editor: Some("test".to_string()),
      },
      Some("origin:local".to_string()),
    )
    .await
    .expect("apply doc B update");

  let mut exported_files = Vec::new();
  collect_markdown_files(&dir, &mut exported_files).expect("collect markdown files");
  assert!(!exported_files.is_empty());

  let mut found_doc_b = false;
  for file in exported_files {
    let content = fs::read_to_string(file).expect("read markdown");
    if content.contains(&format!("id: {doc_b_id}")) && content.contains("two") {
      found_doc_b = true;
      break;
    }
  }
  assert!(found_doc_b);

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn apply_local_root_update_skips_metadata_only_placeholder_without_doc_body() {
  let dir = temp_dir();

  let sync = DiskSync::new();
  let session_id = "session-root-meta-export";
  let workspace_id = "ws-root-meta-export";
  let doc_id = "doc-root-meta";

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
      },
    )
    .await
    .expect("start session");

  let _ = sync.pull_events(session_id.to_string()).await.expect("pull");

  let root_update = build_root_meta_update(
    &[],
    workspace_id,
    doc_id,
    &FrontmatterMeta {
      id: None,
      title: Some("Root Meta Title".to_string()),
      tags: Some(vec!["alpha".to_string()]),
      favorite: Some(true),
      trash: Some(false),
    },
  )
  .expect("build root meta update");

  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: workspace_id.to_string(),
        bin: Uint8Array::new(root_update),
        editor: None,
      },
      Some("origin:root-meta".to_string()),
    )
    .await
    .expect("apply root update");

  let mut exported_files = Vec::new();
  collect_markdown_files(&dir, &mut exported_files).expect("collect markdown files");
  assert_eq!(exported_files.len(), 0);

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn file_change_after_export_is_imported_into_workspace() {
  let dir = temp_dir();

  let sync = DiskSync::new();
  let session_id = "session-export-import";

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-export-import".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
      },
    )
    .await
    .expect("start session");

  let _ = sync.pull_events(session_id.to_string()).await.expect("pull first");

  let doc_id = "doc-export-import";
  let doc_bin = build_full_doc("Export", "# Export\n\none", doc_id).expect("build doc bin");

  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_id.to_string(),
        bin: Uint8Array::new(doc_bin),
        editor: Some("test".to_string()),
      },
      Some("origin:local".to_string()),
    )
    .await
    .expect("apply local update");

  let mut exported_files = Vec::new();
  collect_markdown_files(&dir, &mut exported_files).expect("collect markdown files");
  assert_eq!(exported_files.len(), 1);

  let file_path = exported_files[0].clone();
  fs::write(
    &file_path,
    format!(
      "---\nid: {doc_id}\ntitle: Export\ntags: [edited]\nfavorite: false\ntrash: false\n---\n\n# Export\n\nchanged"
    ),
  )
  .expect("edit exported markdown");

  let events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull after local file edit");

  assert!(events.iter().any(|event| {
    event.r#type == "doc-update"
      && event.update.as_ref().is_some_and(|update| update.doc_id == doc_id)
      && event.origin.as_deref() == Some("disk:file-import")
  }));

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn code_block_update_keeps_markdown_exporting() {
  let dir = temp_dir();

  let sync = DiskSync::new();
  let session_id = "session-code-block-export";

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-code-block-export".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
      },
    )
    .await
    .expect("start session");

  let _ = sync.pull_events(session_id.to_string()).await.expect("pull first");

  let doc_id = "doc-code-block";
  let initial_doc = build_full_doc("Code", "# Code\n\nbefore", doc_id).expect("build initial doc");

  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_id.to_string(),
        bin: Uint8Array::new(initial_doc.clone()),
        editor: Some("test".to_string()),
      },
      Some("origin:local".to_string()),
    )
    .await
    .expect("apply initial doc");

  let mut exported_files = Vec::new();
  collect_markdown_files(&dir, &mut exported_files).expect("collect markdown files");
  assert_eq!(exported_files.len(), 1);
  let file_path = exported_files[0].clone();

  let markdown_with_code = "# Code\n\n```js\nconsole.log(1)\n```\n";
  let delta_code = update_doc(&initial_doc, markdown_with_code, doc_id).expect("build code block delta");

  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_id.to_string(),
        bin: Uint8Array::new(delta_code.clone()),
        editor: Some("test".to_string()),
      },
      Some("origin:local".to_string()),
    )
    .await
    .expect("apply code block delta");

  let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
  doc
    .apply_update_from_binary_v1(&initial_doc)
    .expect("apply initial update");
  doc.apply_update_from_binary_v1(&delta_code).expect("apply code update");
  let merged_after_code = doc.encode_update_v1().expect("encode merged after code");

  let markdown_after_code_edit = "# Code\n\n```js\nconsole.log(2)\n```\n\nnext\n";
  let delta_after_code_edit =
    update_doc(&merged_after_code, markdown_after_code_edit, doc_id).expect("build delta after code edit");

  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_id.to_string(),
        bin: Uint8Array::new(delta_after_code_edit),
        editor: Some("test".to_string()),
      },
      Some("origin:local".to_string()),
    )
    .await
    .expect("apply follow-up delta");

  let exported = fs::read_to_string(&file_path).expect("read exported markdown");
  assert!(exported.contains("```js"));
  assert!(exported.contains("console.log(2)"));
  assert!(exported.contains("next"));

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn file_change_after_start_is_imported_via_pull_events() {
  let dir = temp_dir();
  let md_path = dir.join("doc-poll.md");
  fs::write(&md_path, "---\nid: doc-poll\ntitle: Poll\n---\n\n# Poll\n\none").expect("write initial markdown");

  let sync = DiskSync::new();
  let session_id = "session-poll";

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-poll".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
      },
    )
    .await
    .expect("start session");

  let _ = sync.pull_events(session_id.to_string()).await.expect("pull first");

  fs::write(&md_path, "---\nid: doc-poll\ntitle: Poll\n---\n\n# Poll\n\ntwo").expect("write changed markdown");

  let events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull after change");

  assert!(events.iter().any(|event| {
    event.r#type == "doc-update" && event.update.as_ref().is_some_and(|update| update.doc_id == "doc-poll")
  }));

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn import_without_title_allows_followup_local_export() {
  let dir = temp_dir();
  let md_path = dir.join("doc-no-title.md");
  fs::write(&md_path, "# Imported\n\none").expect("write markdown");

  let sync = DiskSync::new();
  let session_id = "session-import-no-title";
  let workspace_id = "ws-import-no-title";

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
      },
    )
    .await
    .expect("start session");

  let events = sync.pull_events(session_id.to_string()).await.expect("pull first");

  let imported = fs::read_to_string(&md_path).expect("read imported markdown");
  let (meta, _) = parse_frontmatter(&imported);
  let doc_id = meta.id.expect("doc id should be generated");

  let imported_doc_bin = events
    .iter()
    .find_map(|event| {
      event
        .update
        .as_ref()
        .filter(|update| update.doc_id == doc_id)
        .map(|update| update.bin.as_ref().to_vec())
    })
    .expect("imported page update");

  let delta = update_doc(&imported_doc_bin, "# Imported\n\ntwo", &doc_id).expect("build local edit delta");

  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_id.clone(),
        bin: Uint8Array::new(delta),
        editor: Some("test".to_string()),
      },
      Some("origin:local".to_string()),
    )
    .await
    .expect("apply local update");

  let updated = fs::read_to_string(&md_path).expect("read markdown after local edit");
  assert!(updated.contains("two"));

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn import_sets_root_meta_create_and_updated_date() {
  let dir = temp_dir();
  let md_path = dir.join("doc-dates.md");
  fs::write(&md_path, "# Dates\n\ncontent").expect("write markdown");

  let sync = DiskSync::new();
  let session_id = "session-import-dates";
  let workspace_id = "ws-import-dates";

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
      },
    )
    .await
    .expect("start session");

  let events = sync.pull_events(session_id.to_string()).await.expect("pull events");
  let imported = fs::read_to_string(&md_path).expect("read imported markdown");
  let (meta, _) = parse_frontmatter(&imported);
  let doc_id = meta.id.expect("doc id should exist");

  let root_update = events
    .iter()
    .find_map(|event| {
      event
        .update
        .as_ref()
        .filter(|update| update.doc_id == workspace_id)
        .map(|update| update.bin.as_ref().to_vec())
    })
    .expect("root-meta update");

  let mut root = DocOptions::new().with_guid(workspace_id.to_string()).build();
  root
    .apply_update_from_binary_v1(&root_update)
    .expect("apply root-meta update");

  let meta_map = root.get_map("meta").expect("meta map");
  let pages = meta_map
    .get("pages")
    .and_then(|value| value.to_array())
    .expect("pages array");
  let page_map = pages
    .iter()
    .find_map(|value| {
      let page = value.to_map()?;
      let id = page
        .get("id")
        .and_then(|value| value.to_any())
        .and_then(|any| match any {
          Any::String(value) => Some(value),
          _ => None,
        })?;
      if id == doc_id { Some(page) } else { None }
    })
    .expect("imported page meta");

  let create_date = page_map
    .get("createDate")
    .and_then(|value| value.to_any())
    .expect("createDate should exist");
  assert!(is_numeric_any(&create_date));

  let updated_date = page_map
    .get("updatedDate")
    .and_then(|value| value.to_any())
    .expect("updatedDate should exist");
  assert!(is_numeric_any(&updated_date));

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn no_delete_policy_does_not_emit_doc_delete() {
  let dir = temp_dir();
  let md_path = dir.join("doc-delete.md");
  fs::write(&md_path, "---\nid: doc-delete\ntitle: Delete\n---\n\n# Delete\n\none").expect("write markdown");

  let sync = DiskSync::new();
  let session_id = "session-no-delete";

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-delete".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
      },
    )
    .await
    .expect("start session");

  let _ = sync.pull_events(session_id.to_string()).await.expect("pull first");

  fs::remove_file(&md_path).expect("remove markdown file");

  let events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull after delete");

  assert!(!events.iter().any(|event| event.r#type == "doc-delete"));

  teardown(&sync, session_id, &dir).await;
}
