use std::{
  fs,
  path::{Path, PathBuf},
};

use affine_doc_loader::{build_full_doc, update_doc};
use chrono::Utc;
use napi::bindgen_prelude::Uint8Array;
use uuid::Uuid;
use y_octo::{Any, DocOptions, StateVector, Value};

use super::{
  DiskDocUpdateInput, DiskSessionOptions, DiskSync, SESSIONS, START_SESSION_LOCK,
  frontmatter::{parse_frontmatter, render_frontmatter},
  root_meta::{build_root_meta_update, extract_root_meta_for_doc},
  state_db::StateDb,
  types::FrontmatterMeta,
  utils::{
    collect_markdown_files, generate_missing_doc_id, is_complete_update, merge_complete_root_update,
    normalize_source_merge_current, sanitize_file_stem,
  },
};

#[test]
fn source_merge_normalization_only_removes_default_collapsed_property() {
  let doc_id = "doc-normalize-collapsed";
  let baseline = build_full_doc("Collapsed", "# Collapsed", doc_id).expect("build baseline");
  let source = affine_doc_loader::export_markdown_source(&baseline, doc_id, None).expect("export baseline");
  let block_id = source
    .markdown
    .lines()
    .find_map(|line| {
      line
        .trim()
        .strip_prefix("<!--")?
        .strip_suffix("-->")?
        .split_whitespace()
        .find_map(|token| token.strip_prefix("block_id="))
        .map(str::to_string)
    })
    .expect("paragraph marker");

  for (collapsed, should_remain) in [(Any::False, false), (Any::True, true)] {
    let mut current = DocOptions::new().with_guid(doc_id.to_string()).build();
    current.apply_update_from_binary_v1(&baseline).expect("load baseline");
    let blocks = current.get_map("blocks").expect("load blocks");
    let mut block = blocks
      .get(&block_id)
      .and_then(|value| value.to_map())
      .expect("load paragraph block");
    block
      .insert("prop:collapsed".to_string(), collapsed)
      .expect("set collapsed property");
    let current = current.encode_update_v1().expect("encode current");
    let normalized = normalize_source_merge_current(&baseline, &current, doc_id).expect("normalize current");

    let mut normalized_doc = DocOptions::new().with_guid(doc_id.to_string()).build();
    normalized_doc
      .apply_update_from_binary_v1(&normalized)
      .expect("load normalized doc");
    let normalized_blocks = normalized_doc.get_map("blocks").expect("load normalized blocks");
    let collapsed = normalized_blocks
      .get(&block_id)
      .and_then(|value| value.to_map())
      .and_then(|block| block.get("prop:collapsed"))
      .and_then(|value| value.to_any());
    assert_eq!(collapsed.is_some(), should_remain);
  }
}

#[test]
fn merged_doc_update_preserves_stepwise_yjs_structs() {
  let original = hex::decode(include_str!("fixtures/stepwise-yjs.hex").replace('\n', "")).expect("decode Yjs update");
  let merged = super::utils::merge_frontend_update_binary(None, &original).expect("merge Yjs update");
  assert_eq!(merged, original);
  let merged_again =
    super::utils::merge_frontend_update_binary(Some(&merged), &original).expect("merge repeated update");
  assert_eq!(merged_again, original);

  let mut doc = DocOptions::new().build();
  doc.apply_update_from_binary_v1(&original).expect("load Yjs update");
  let reencoded = doc
    .encode_state_as_update_v1(&StateVector::default())
    .expect("re-encode Yjs update");
  assert_ne!(reencoded, original);
  assert!(super::utils::same_update_state(&reencoded, &original).expect("compare update state"));
}

#[test]
fn detects_updates_with_missing_dependencies_before_replay() {
  let doc = DocOptions::new().with_guid("incomplete".to_string()).build();
  let mut text = doc.get_or_create_text("content").expect("create text");
  text.insert(0, "first").expect("insert first");
  let state = doc.get_state_vector();
  text.insert(5, " second").expect("insert second");
  let delta = doc.encode_state_as_update_v1(&state).expect("encode delta");
  let snapshot = doc.encode_update_v1().expect("encode snapshot");

  assert!(!is_complete_update(&delta).expect("inspect delta"));
  assert!(is_complete_update(&snapshot).expect("inspect snapshot"));
  assert_eq!(
    merge_complete_root_update(&snapshot, &delta).expect("keep existing root"),
    Some(snapshot.clone())
  );
  assert_eq!(
    merge_complete_root_update(&delta, &snapshot).expect("use incoming root"),
    Some(snapshot)
  );
  assert!(
    merge_complete_root_update(&delta, &delta)
      .expect("skip incomplete roots")
      .is_none()
  );
}

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

#[tokio::test]
async fn root_doc_discovery_is_incremental_and_has_no_source_clock() {
  let dir = temp_dir();
  let sync = DiskSync::new();
  let session_id = "root-discovery";
  let workspace_id = "ws-root-discovery";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: None,
      },
    )
    .await
    .unwrap();
  let _ = sync.pull_events(session_id.to_string()).await.unwrap();

  let first = build_root_meta_update(&[], workspace_id, "doc-a", &FrontmatterMeta::default()).unwrap();
  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: workspace_id.to_string(),
        bin: Uint8Array::new(first.clone()),
        editor: None,
      },
    )
    .await
    .unwrap();
  let events = sync.pull_events(session_id.to_string()).await.unwrap();
  let discoveries = events
    .iter()
    .filter(|event| event.r#type == "root-doc-discovered")
    .collect::<Vec<_>>();
  assert_eq!(discoveries.len(), 1);
  assert_eq!(discoveries[0].doc_id.as_deref(), Some("doc-a"));
  assert_eq!(discoveries[0].timestamp, None);

  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: workspace_id.to_string(),
        bin: Uint8Array::new(first),
        editor: None,
      },
    )
    .await
    .unwrap();
  let events = sync.pull_events(session_id.to_string()).await.unwrap();
  assert!(events.iter().all(|event| event.r#type != "root-doc-discovered"));

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn single_source_session_only_discovers_the_source_doc_from_root() {
  let dir = temp_dir();
  let source_path = dir.join("A.md");
  fs::write(&source_path, "---\nid: doc-a\ntitle: A\n---\n\n# A\n\none").expect("write source");
  let sync = DiskSync::new();
  let session_id = "single-source-root-discovery";
  let workspace_id = "ws-single-source-root-discovery";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(source_path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start session");
  let _ = sync.pull_events(session_id.to_string()).await.expect("scan source");

  let source_root = build_root_meta_update(&[], workspace_id, "doc-a", &FrontmatterMeta::default()).unwrap();
  let root_with_sibling =
    build_root_meta_update(&source_root, workspace_id, "doc-b", &FrontmatterMeta::default()).unwrap();
  for update in [source_root, root_with_sibling] {
    sync
      .apply_local_update(
        session_id.to_string(),
        DiskDocUpdateInput {
          doc_id: workspace_id.to_string(),
          bin: Uint8Array::new(update),
          editor: None,
        },
      )
      .await
      .expect("apply root update");
  }

  let discoveries = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull discoveries")
    .into_iter()
    .filter(|event| event.r#type == "root-doc-discovered")
    .filter_map(|event| event.doc_id)
    .collect::<Vec<_>>();
  assert_eq!(discoveries, ["doc-a"]);

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn single_source_session_only_replays_pending_updates_for_its_source() {
  let dir = temp_dir();
  let source_a = dir.join("A.md");
  let source_b = dir.join("B.md");
  fs::write(&source_a, "---\nid: doc-a\ntitle: A\n---\n\n# A\n\none").expect("write source A");
  fs::write(&source_b, "---\nid: doc-b\ntitle: B\n---\n\n# B\n\ntwo").expect("write source B");

  let sync = DiskSync::new();
  let session_id = "single-source-pending-replay";
  let workspace_id = "ws-single-source-pending-replay";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: None,
      },
    )
    .await
    .expect("start folder session");
  let _ = sync
    .pull_events(session_id.to_string())
    .await
    .expect("discover sources");
  for doc_id in ["doc-a", "doc-b"] {
    sync
      .prepare_source_doc(session_id.to_string(), doc_id.to_string(), None, None)
      .await
      .expect("prepare source");
  }
  sync
    .stop_session(session_id.to_string())
    .await
    .expect("stop folder session with pending updates");

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(source_a.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("restart single-source session");
  let replayed_doc_ids = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull replayed updates")
    .into_iter()
    .filter_map(|event| event.update.map(|update| update.doc_id))
    .collect::<Vec<_>>();

  assert!(replayed_doc_ids.contains(&workspace_id.to_string()));
  assert!(replayed_doc_ids.contains(&"doc-a".to_string()));
  assert!(!replayed_doc_ids.contains(&"doc-b".to_string()));

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn root_discovery_waits_for_partial_dependencies_and_includes_trash() {
  let dir = temp_dir();
  let sync = DiskSync::new();
  let session_id = "root-partial";
  let workspace_id = "ws-root-partial";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: None,
      },
    )
    .await
    .unwrap();
  let _ = sync.pull_events(session_id.to_string()).await.unwrap();

  let base = build_root_meta_update(&[], workspace_id, "doc-base", &FrontmatterMeta::default()).unwrap();
  let delta = build_root_meta_update(
    &base,
    workspace_id,
    "doc-trash",
    &FrontmatterMeta {
      trash: Some(true),
      ..Default::default()
    },
  )
  .unwrap();
  for update in [&delta, &base] {
    sync
      .apply_local_update(
        session_id.to_string(),
        DiskDocUpdateInput {
          doc_id: workspace_id.to_string(),
          bin: Uint8Array::new(update.clone()),
          editor: None,
        },
      )
      .await
      .unwrap();
  }
  let events = sync.pull_events(session_id.to_string()).await.unwrap();
  let mut ids = events
    .iter()
    .filter(|event| event.r#type == "root-doc-discovered")
    .filter_map(|event| event.doc_id.clone())
    .collect::<Vec<_>>();
  ids.sort();
  assert_eq!(ids, ["doc-base", "doc-trash"]);
  teardown(&sync, session_id, &dir).await;
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

  for value in [
    "Say \"hi\"",
    "path\\name",
    "path\\\"name",
    "first\nsecond",
    "first\n---\nsecond",
    "'quoted'",
  ] {
    let expected = FrontmatterMeta {
      id: Some("doc-1".to_string()),
      title: Some(value.to_string()),
      tags: Some(vec![value.to_string()]),
      favorite: Some(true),
      trash: Some(false),
      extra: Vec::new(),
    };
    let (actual, parsed_body) = parse_frontmatter(&render_frontmatter(&expected, "Body"));
    assert_eq!(actual.title, expected.title, "title: {value:?}");
    assert_eq!(actual.tags, expected.tags, "tags: {value:?}");
    assert_eq!(parsed_body, "Body\n", "body: {value:?}");
  }
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

#[test]
fn parse_frontmatter_accepts_indentless_tag_sequences() {
  let raw = "---\nid: doc-tags\ntags:\n- alpha\n- beta\n---\n\nBody";
  let (meta, body) = parse_frontmatter(raw);

  assert_eq!(meta.tags, Some(vec!["alpha".to_string(), "beta".to_string()]));
  assert_eq!(body, "\nBody");
}

#[test]
fn parse_frontmatter_accepts_empty_and_eof_delimiters() {
  let (empty, body) = parse_frontmatter("---\n---\nBody");
  assert_eq!(empty.id, None);
  assert_eq!(body, "Body");

  let (meta, body) = parse_frontmatter("---\nid: eof-doc\ntitle: EOF\n---");
  assert_eq!(meta.id.as_deref(), Some("eof-doc"));
  assert_eq!(meta.title.as_deref(), Some("EOF"));
  assert!(body.is_empty());
}

#[test]
fn generated_doc_ids_are_unique_and_file_stems_keep_unicode() {
  let path = Path::new("/tmp/README.md");
  assert_ne!(generate_missing_doc_id(path), generate_missing_doc_id(path));
  assert_eq!(sanitize_file_stem("会议记录 Überblick"), "会议记录-überblick");
}

#[test]
fn frontmatter_round_trips_escaped_scalars() {
  let meta = FrontmatterMeta {
    id: Some(r#"doc\windows"#.to_string()),
    title: Some("First line\nSecond \\\"line\\\"\u{0001}\u{007f}".to_string()),
    tags: Some(vec![r#"folder\tag"#.to_string(), "multi\nline".to_string()]),
    favorite: None,
    trash: None,
    extra: Vec::new(),
  };

  let rendered = render_frontmatter(&meta, "Body");
  let (parsed, body) = parse_frontmatter(&rendered);

  assert_eq!(parsed.id, meta.id);
  assert_eq!(parsed.title, meta.title);
  assert_eq!(parsed.tags, meta.tags);
  assert_eq!(body, "Body\n");
}

#[test]
fn frontmatter_preserves_unknown_fields() {
  let raw = r#"---
id: doc-extra
title: Extra
aliases:
  - First alias
custom:
  title: Nested
  tags:
    - keep-me
---

Body
"#;

  let (meta, body) = parse_frontmatter(raw);
  let rendered = render_frontmatter(&meta, &body);

  assert_eq!(meta.title.as_deref(), Some("Extra"));
  assert_eq!(meta.tags, None);
  assert!(rendered.contains("aliases:\n  - First alias"));
  assert!(rendered.contains("custom:\n  title: Nested\n  tags:\n    - keep-me"));
}

#[tokio::test]
async fn concurrent_starts_initialize_one_session() {
  let first_dir = temp_dir();
  let second_dir = temp_dir();
  let sync = DiskSync::new();
  let session_id = format!("session-concurrent-{}", Uuid::new_v4());

  let first = sync.start_session(
    session_id.clone(),
    DiskSessionOptions {
      workspace_id: "ws-concurrent-first".to_string(),
      sync_folder: first_dir.to_string_lossy().to_string(),
      source_file: None,
    },
  );
  let second = sync.start_session(
    session_id.clone(),
    DiskSessionOptions {
      workspace_id: "ws-concurrent-second".to_string(),
      sync_folder: second_dir.to_string_lossy().to_string(),
      source_file: None,
    },
  );

  let (first_result, second_result) = tokio::join!(first, second);
  first_result.expect("start first session");
  second_result.expect("start second session");

  let initialized_dirs = [&first_dir, &second_dir]
    .into_iter()
    .filter(|dir| dir.join(".affine-sync/state.db").exists())
    .count();

  sync.stop_session(session_id).await.expect("stop session");
  let _ = fs::remove_dir_all(first_dir);
  let _ = fs::remove_dir_all(second_dir);

  assert_eq!(initialized_dirs, 1);
}

#[tokio::test]
async fn stop_session_waits_for_session_lifecycle_lock() {
  let dir = temp_dir();
  let session_id = format!("session-stop-race-{}", Uuid::new_v4());
  DiskSync::new()
    .start_session(
      session_id.clone(),
      DiskSessionOptions {
        workspace_id: "ws-stop-race".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: None,
      },
    )
    .await
    .expect("start session");

  let lifecycle_guard = START_SESSION_LOCK.lock().await;
  let stop_session_id = session_id.clone();
  let mut stop = tokio::spawn(async move { DiskSync::new().stop_session(stop_session_id).await });

  assert!(
    tokio::time::timeout(std::time::Duration::from_millis(20), &mut stop)
      .await
      .is_err(),
    "stop should wait for an in-flight session lifecycle operation"
  );

  drop(lifecycle_guard);
  stop.await.expect("join stop task").expect("stop session");
  assert!(!SESSIONS.read().await.contains_key(&session_id));
  fs::remove_dir_all(dir).expect("remove directory");
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
        source_file: None,
      },
    )
    .await
    .expect("start session");

  let unrelated = build_full_doc("Other", "# Other\n\ndifferent", "doc-a").expect("build unrelated local doc");
  assert!(
    sync
      .prepare_source_doc(
        session_id.to_string(),
        "doc-a".to_string(),
        Some(Uint8Array::new(unrelated)),
        None,
      )
      .await
      .is_err()
  );
  sync
    .prepare_source_doc(session_id.to_string(), "doc-a".to_string(), None, None)
    .await
    .expect("prepare new source");
  let events = sync.pull_events(session_id.to_string()).await.expect("pull events");

  let source_at = events
    .iter()
    .position(|event| event.r#type == "source-discovered" && event.doc_id.as_deref() == Some("doc-a"))
    .expect("file discovery");
  let root_at = events
    .iter()
    .position(|event| event.r#type == "root-doc-discovered" && event.doc_id.as_deref() == Some("doc-a"))
    .expect("root discovery");
  assert!(source_at < root_at);

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
async fn local_update_candidate_preserves_unknown_frontmatter() {
  let dir = temp_dir();
  let md_path = dir.join("doc-extra.md");
  let doc_id = "doc-extra";
  fs::write(
    &md_path,
    "---\nid: doc-extra\ntitle: Extra\naliases:\n  - First alias\ncustom: keep-me\n---\n\n# Extra\n\none",
  )
  .expect("write markdown with custom frontmatter");

  let sync = DiskSync::new();
  let session_id = "session-extra-frontmatter";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-extra-frontmatter".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: None,
      },
    )
    .await
    .expect("start session");

  let imported = sync
    .prepare_source_doc(session_id.to_string(), doc_id.to_string(), None, None)
    .await
    .expect("prepare source")
    .expect("imported snapshot");
  let delta = update_doc(imported.as_ref(), "# Extra\n\ntwo", doc_id).expect("build local edit delta");
  let result = sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_id.to_string(),
        bin: Uint8Array::new(delta),
        editor: Some("test".to_string()),
      },
    )
    .await
    .expect("apply local update");

  let candidate = result.review_required.expect("review candidate");
  let updated = fs::read_to_string(candidate).expect("read review candidate");
  assert!(updated.contains("aliases:\n  - First alias"));
  assert!(updated.contains("custom: keep-me"));
  assert!(updated.contains("two"));

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
        source_file: None,
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
    )
    .await
    .expect("apply local update");

  let mut exported_files = Vec::new();
  collect_markdown_files(&dir, &mut exported_files).expect("collect markdown files");
  assert_eq!(exported_files.len(), 1);

  let content = fs::read_to_string(&exported_files[0]).expect("read exported markdown");
  assert!(content.contains("id: doc-unsupported"));
  assert!(content.contains("flavour=affine:latex opaque=true"));

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
        source_file: None,
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
async fn quoted_and_empty_title_exports_do_not_pause() {
  let dir = temp_dir();

  let sync = DiskSync::new();
  let session_id = "session-empty-title";

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-empty-title".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: None,
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

  let quoted_id = "doc-quoted-title";
  let quoted_doc = build_full_doc("Say \"hi\"\\path", "# Note\n\none", quoted_id).expect("build quoted-title doc");
  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: quoted_id.to_string(),
        bin: Uint8Array::new(quoted_doc.clone()),
        editor: Some("test".to_string()),
      },
    )
    .await
    .expect("export quoted title");
  let _ = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull quoted export");
  let delta = update_doc(&quoted_doc, "# Note\n\ntwo", quoted_id).expect("build followup edit");
  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: quoted_id.to_string(),
        bin: Uint8Array::new(delta),
        editor: Some("test".to_string()),
      },
    )
    .await
    .expect("export after quoted title");
  let events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull followup export");
  assert!(!events.iter().any(|event| {
    event.r#type == "error"
      && event
        .message
        .as_deref()
        .is_some_and(|message| message.contains("export paused"))
  }));

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn unexportable_doc_returns_doc_scoped_error() {
  let dir = temp_dir();
  let sync = DiskSync::new();
  let session_id = "session-unexportable";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-unexportable".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: None,
      },
    )
    .await
    .expect("start session");

  let doc = DocOptions::new().with_guid("doc-unexportable".to_string()).build();
  doc.get_or_create_map("blocks").expect("create blocks map");
  let result = sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: "doc-unexportable".to_string(),
        bin: Uint8Array::new(doc.encode_update_v1().expect("encode incomplete doc")),
        editor: None,
      },
    )
    .await
    .expect("return export error as clock");
  assert!(result.export_error.is_some());
  assert!(result.review_required.is_none());

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
        source_file: None,
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
    )
    .await;
  assert!(invalid.is_err());

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
async fn single_source_session_does_not_export_unrelated_local_docs() {
  let dir = temp_dir();
  let source_path = dir.join("A.md");
  fs::write(&source_path, "---\nid: doc-a\ntitle: A\n---\n\n# A\n\none").expect("write source");
  let sync = DiskSync::new();
  let session_id = "single-source-export";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-single-source-export".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(source_path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start session");
  let _ = sync.pull_events(session_id.to_string()).await.expect("scan source");

  let unrelated = build_full_doc("Unrelated", "# Unrelated\n\nnot the source", "doc-b").expect("build unrelated doc");
  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: "doc-b".to_string(),
        bin: Uint8Array::new(unrelated),
        editor: Some("test".to_string()),
      },
    )
    .await
    .expect("ignore unrelated update");

  let mut markdown_files = Vec::new();
  collect_markdown_files(&dir, &mut markdown_files).expect("collect markdown files");
  assert_eq!(markdown_files, [source_path]);

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
        source_file: None,
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
      ..Default::default()
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
        source_file: None,
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
        bin: Uint8Array::new(doc_bin.clone()),
        editor: Some("test".to_string()),
      },
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

  let discovered = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull after local file edit");
  assert!(
    discovered
      .iter()
      .any(|event| event.r#type == "source-discovered" && event.doc_id.as_deref() == Some(doc_id))
  );
  assert!(
    !discovered
      .iter()
      .any(|event| event.update.as_ref().is_some_and(|update| update.doc_id == doc_id))
  );
  sync
    .prepare_source_doc(
      session_id.to_string(),
      doc_id.to_string(),
      Some(Uint8Array::new(doc_bin.clone())),
      None,
    )
    .await
    .expect("prepare changed source with local snapshot");
  let events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull source update");

  assert!(events.iter().any(|event| {
    event.r#type == "doc-update"
      && event.update.as_ref().is_some_and(|update| update.doc_id == doc_id)
      && event.origin.as_deref() == Some("disk:file-import")
  }));

  let imported = events
    .iter()
    .find_map(|event| {
      event
        .update
        .as_ref()
        .filter(|update| update.doc_id == doc_id)
        .map(|update| update.bin.as_ref().to_vec())
    })
    .expect("source update");

  let mut standalone = DocOptions::new().with_guid(doc_id.to_string()).build();
  standalone
    .apply_update_from_binary_v1(&imported)
    .expect("source update must be a standalone snapshot");
  assert!(!standalone.has_pending_updates());

  sync
    .stop_session(session_id.to_string())
    .await
    .expect("stop before ack");
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-export-import".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: None,
      },
    )
    .await
    .expect("restart session");
  let replayed = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull replayed events");
  assert!(replayed.iter().any(|event| {
    event
      .update
      .as_ref()
      .is_some_and(|update| update.doc_id == doc_id && update.bin.as_ref() == imported)
  }));

  let mut local = DocOptions::new().with_guid(doc_id.to_string()).build();
  local.apply_update_from_binary_v1(&doc_bin).expect("apply initial doc");
  local
    .apply_update_from_binary_v1(&imported)
    .expect("apply source update");
  let local_snapshot = local.encode_update_v1().expect("encode local snapshot");
  sync
    .acknowledge_source_update(
      session_id.to_string(),
      doc_id.to_string(),
      Uint8Array::new(local_snapshot),
    )
    .await
    .expect("acknowledge source update");

  sync.stop_session(session_id.to_string()).await.expect("stop after ack");
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-export-import".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: None,
      },
    )
    .await
    .expect("restart acknowledged session");
  let after_ack = sync.pull_events(session_id.to_string()).await.expect("pull after ack");
  assert!(
    !after_ack
      .iter()
      .any(|event| { event.update.as_ref().is_some_and(|update| update.doc_id == doc_id) })
  );

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn source_import_root_update_is_standalone_after_reusing_disk_state() {
  let dir = temp_dir();
  let workspace_id = "ws-standalone-root";
  let first_path = dir.join("first.md");
  let second_path = dir.join("second.md");
  fs::write(&first_path, "---\nid: doc-first\ntitle: First\n---\n\n# First\n\none").expect("write first source");
  fs::write(
    &second_path,
    "---\nid: doc-second\ntitle: Second\n---\n\n# Second\n\ntwo",
  )
  .expect("write second source");

  let sync = DiskSync::new();
  let session_id = "session-standalone-root";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(first_path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start first source session");
  let _ = sync
    .pull_events(session_id.to_string())
    .await
    .expect("discover first source");
  sync
    .prepare_source_doc(session_id.to_string(), "doc-first".to_string(), None, None)
    .await
    .expect("prepare first source");
  sync
    .stop_session(session_id.to_string())
    .await
    .expect("stop first source session");

  let local_root = build_root_meta_update(&[], workspace_id, "doc-local", &FrontmatterMeta::default())
    .expect("build independent local root");
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(second_path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start second source session");
  let _ = sync
    .pull_events(session_id.to_string())
    .await
    .expect("discard replayed updates");
  sync
    .prepare_source_doc(
      session_id.to_string(),
      "doc-second".to_string(),
      None,
      Some(Uint8Array::new(local_root.clone())),
    )
    .await
    .expect("prepare second source");
  let root_update = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull second source updates")
    .into_iter()
    .find_map(|event| {
      event
        .update
        .filter(|update| update.doc_id == workspace_id)
        .map(|update| update.bin.as_ref().to_vec())
    })
    .expect("root update");

  let mut root = DocOptions::new().with_guid(workspace_id.to_string()).build();
  root
    .apply_update_from_binary_v1(&root_update)
    .expect("root update must be a standalone snapshot");
  assert!(!root.has_pending_updates());

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn unchanged_source_repairs_missing_root_record() {
  let dir = temp_dir();
  let workspace_id = "ws-repair-missing-root";
  let doc_id = "doc-repair-missing-root";
  let source_path = dir.join("repair.md");
  fs::write(
    &source_path,
    format!("---\nid: {doc_id}\ntitle: Repair\n---\n\n# Repair\n\ncontent"),
  )
  .expect("write source");

  let sync = DiskSync::new();
  let session_id = "session-repair-missing-root";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(source_path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start initial session");
  let _ = sync.pull_events(session_id.to_string()).await.expect("discover source");
  sync
    .prepare_source_doc(session_id.to_string(), doc_id.to_string(), None, None)
    .await
    .expect("import source");
  let initial_events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull initial updates");
  for update in initial_events.into_iter().filter_map(|event| event.update) {
    sync
      .acknowledge_source_update(
        session_id.to_string(),
        update.doc_id,
        Uint8Array::new(update.bin.as_ref().to_vec()),
      )
      .await
      .expect("acknowledge initial update");
  }
  sync
    .stop_session(session_id.to_string())
    .await
    .expect("stop initial session");

  let unrelated_root = build_root_meta_update(&[], workspace_id, "doc-unrelated", &FrontmatterMeta::default())
    .expect("build root without source doc");
  let state_db = StateDb::open(&dir, workspace_id).await.expect("open state db");
  state_db
    .store_root_snapshot(&unrelated_root)
    .await
    .expect("replace root snapshot");
  state_db.close().await;

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(source_path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("restart session");
  let restart_events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull restart events");
  let repaired_root = restart_events
    .into_iter()
    .find_map(|event| {
      event
        .update
        .filter(|update| update.doc_id == workspace_id)
        .map(|update| update.bin.as_ref().to_vec())
    })
    .expect("unchanged source must repair the root record during restart");
  let historical_local =
    build_full_doc("Repair", "# Repair\n\ncontent", doc_id).expect("build historical local snapshot");
  sync
    .prepare_source_doc(
      session_id.to_string(),
      doc_id.to_string(),
      Some(Uint8Array::new(historical_local)),
      None,
    )
    .await
    .expect("prepare unchanged source without re-merging its body");

  assert!(is_complete_update(&repaired_root).expect("inspect repaired root"));
  assert!(
    extract_root_meta_for_doc(&repaired_root, doc_id)
      .expect("project repaired root")
      .is_some()
  );

  sync
    .prepare_source_doc(
      session_id.to_string(),
      doc_id.to_string(),
      None,
      Some(Uint8Array::new(unrelated_root.clone())),
    )
    .await
    .expect("prepare ready source against stale local root");
  let local_root_update = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull local-compatible root update")
    .into_iter()
    .find_map(|event| {
      event
        .update
        .filter(|update| update.doc_id == workspace_id)
        .map(|update| update.bin.as_ref().to_vec())
    })
    .expect("ready source must repair the stale local root");
  let repaired_local = super::utils::merge_update_binary(Some(&unrelated_root), &local_root_update)
    .expect("merge local-compatible root update");
  assert!(
    extract_root_meta_for_doc(&repaired_local, doc_id)
      .expect("project locally repaired root")
      .is_some()
  );

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn restarting_an_unchanged_source_repairs_its_missing_root_record() {
  let dir = temp_dir();
  let workspace_id = "ws-restart-repair-root";
  let doc_id = "doc-restart-repair-root";
  let source_path = dir.join("repair.md");
  fs::write(
    &source_path,
    format!("---\nid: {doc_id}\ntitle: Repair\n---\n\n# Repair\n\ncontent"),
  )
  .expect("write source");

  let sync = DiskSync::new();
  let session_id = "session-restart-repair-root";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(source_path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start initial session");
  let _ = sync.pull_events(session_id.to_string()).await.expect("discover source");
  sync
    .prepare_source_doc(session_id.to_string(), doc_id.to_string(), None, None)
    .await
    .expect("import source");
  let initial_events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull initial updates");
  for update in initial_events.into_iter().filter_map(|event| event.update) {
    sync
      .acknowledge_source_update(
        session_id.to_string(),
        update.doc_id,
        Uint8Array::new(update.bin.as_ref().to_vec()),
      )
      .await
      .expect("acknowledge initial update");
  }
  sync
    .stop_session(session_id.to_string())
    .await
    .expect("stop initial session");

  let unrelated_root = build_root_meta_update(&[], workspace_id, "doc-unrelated", &FrontmatterMeta::default())
    .expect("build root without source doc");
  let state_db = StateDb::open(&dir, workspace_id).await.expect("open state db");
  state_db
    .store_root_snapshot(&unrelated_root)
    .await
    .expect("replace root snapshot");
  state_db.close().await;

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(source_path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("restart unchanged source session");
  assert_eq!(
    sync
      .resolve_source_doc_id(session_id.to_string(), source_path.to_string_lossy().to_string())
      .await
      .expect("resolve repaired source"),
    Some(doc_id.to_string())
  );
  let repaired_root = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull repaired updates")
    .into_iter()
    .find_map(|event| {
      event
        .update
        .filter(|update| update.doc_id == workspace_id)
        .map(|update| update.bin.as_ref().to_vec())
    })
    .expect("restart must emit the repaired root");
  assert!(
    extract_root_meta_for_doc(&repaired_root, doc_id)
      .expect("project repaired root")
      .is_some()
  );

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
        source_file: None,
      },
    )
    .await
    .expect("start session");

  let _ = sync.pull_events(session_id.to_string()).await.expect("pull first");

  let doc_id = "doc-code-block";
  let initial_doc = build_full_doc("Code", "```js\nconsole.log(1)\n```", doc_id).expect("build initial doc");

  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_id.to_string(),
        bin: Uint8Array::new(initial_doc.clone()),
        editor: Some("test".to_string()),
      },
    )
    .await
    .expect("apply initial doc");

  let mut exported_files = Vec::new();
  collect_markdown_files(&dir, &mut exported_files).expect("collect markdown files");
  assert_eq!(exported_files.len(), 1);
  let file_path = exported_files[0].clone();

  let source = affine_doc_loader::export_markdown_source(&initial_doc, doc_id, None).expect("export source");
  let changed = source.markdown.replace("console.log(1)", "console.log(2)");
  let delta = update_doc(&initial_doc, &changed, doc_id).expect("build code edit delta");

  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_id.to_string(),
        bin: Uint8Array::new(delta),
        editor: Some("test".to_string()),
      },
    )
    .await
    .expect("apply code edit delta");

  let original = fs::read_to_string(&file_path).expect("read original markdown");
  assert!(original.contains("console.log(1)"));
  let candidate = fs::read_dir(dir.join(".affine-sync/candidates"))
    .expect("candidate directory")
    .flatten()
    .find_map(|entry| {
      let content = fs::read_to_string(entry.path()).ok()?;
      content.contains("console.log(2)").then_some(content)
    })
    .expect("code candidate");
  assert!(candidate.contains("```js"));

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
        source_file: None,
      },
    )
    .await
    .expect("start session");

  let initial = sync
    .prepare_source_doc(session_id.to_string(), "doc-poll".to_string(), None, None)
    .await
    .expect("prepare new source")
    .expect("initial source snapshot");
  let _ = sync.pull_events(session_id.to_string()).await.expect("pull first");

  fs::write(&md_path, "---\nid: doc-poll\ntitle: Poll\n---\n\n# Poll\n\ntwo").expect("write changed markdown");

  let discovered = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull after change");
  assert!(
    discovered
      .iter()
      .any(|event| event.r#type == "source-discovered" && event.doc_id.as_deref() == Some("doc-poll"))
  );
  assert!(
    !discovered
      .iter()
      .any(|event| event.update.as_ref().is_some_and(|update| update.doc_id == "doc-poll"))
  );
  sync
    .prepare_source_doc(session_id.to_string(), "doc-poll".to_string(), Some(initial), None)
    .await
    .expect("prepare changed source");
  let events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull source update");

  assert!(events.iter().any(|event| {
    event.r#type == "doc-update" && event.update.as_ref().is_some_and(|update| update.doc_id == "doc-poll")
  }));

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn markdown_table_source_can_be_prepared_for_initial_open() {
  let dir = temp_dir();
  let md_path = dir.join("table.md");
  fs::write(
    &md_path,
    "---\nid: doc-table\ntitle: Table\n---\n\n# Table\n\n| A | B |\n| --- | --- |\n| one | two |\n",
  )
  .expect("write table markdown");

  let sync = DiskSync::new();
  let session_id = "session-table-open";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-table-open".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(md_path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start session");

  let snapshot = sync
    .prepare_source_doc(session_id.to_string(), "doc-table".to_string(), None, None)
    .await
    .expect("prepare table source")
    .expect("table source snapshot");
  assert!(!snapshot.is_empty());
  let clock = sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: "doc-table".to_string(),
        bin: Uint8Array::new(snapshot.as_ref().to_vec()),
        editor: None,
      },
    )
    .await
    .expect("replay imported table snapshot");
  assert!(clock.review_required.is_none());
  assert!(!dir.join(".affine-sync/candidates").exists());
  assert_eq!(
    sync
      .resolve_source_doc_id(session_id.to_string(), md_path.to_string_lossy().to_string())
      .await
      .expect("resolve prepared table source"),
    Some("doc-table".to_string())
  );

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn markdown_table_source_accepts_followup_file_changes() {
  let dir = temp_dir();
  let md_path = dir.join("table.md");
  let initial_source =
    "---\nid: doc-table-update\ntitle: Table\n---\n\n# Table\n\nbefore\n\n| A | B |\n| --- | --- |\n| one | two |\n";
  fs::write(&md_path, initial_source).expect("write initial table markdown");

  let sync = DiskSync::new();
  let session_id = "session-table-update";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-table-update".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(md_path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start session");
  let initial = sync
    .prepare_source_doc(session_id.to_string(), "doc-table-update".to_string(), None, None)
    .await
    .expect("prepare initial table source")
    .expect("initial table snapshot");
  let _ = sync
    .pull_events(session_id.to_string())
    .await
    .expect("drain initial events");

  let changed_source = initial_source.replace("before", "after");
  fs::write(&md_path, &changed_source).expect("update table markdown");
  let discovered = sync
    .pull_events(session_id.to_string())
    .await
    .expect("discover table update");
  assert!(
    discovered
      .iter()
      .any(|event| event.r#type == "source-discovered" && event.doc_id.as_deref() == Some("doc-table-update"))
  );

  let updated = sync
    .prepare_source_doc(
      session_id.to_string(),
      "doc-table-update".to_string(),
      Some(initial),
      None,
    )
    .await
    .expect("prepare changed table source")
    .expect("changed table source snapshot");
  let events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull table update");
  assert!(events.iter().any(|event| {
    event.r#type == "doc-update"
      && event
        .update
        .as_ref()
        .is_some_and(|update| update.doc_id == "doc-table-update")
  }));

  fs::write(&md_path, format!("{changed_source}\nappended paragraph\n")).expect("append markdown paragraph");
  let _ = sync
    .pull_events(session_id.to_string())
    .await
    .expect("discover appended paragraph");
  let appended_snapshot = sync
    .prepare_source_doc(
      session_id.to_string(),
      "doc-table-update".to_string(),
      Some(updated),
      None,
    )
    .await
    .expect("prepare appended paragraph")
    .expect("appended paragraph snapshot");
  let appended = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull appended paragraph update");
  assert!(appended.iter().any(|event| {
    event.r#type == "doc-update"
      && event
        .update
        .as_ref()
        .is_some_and(|update| update.doc_id == "doc-table-update")
  }));

  let appended_source = affine_doc_loader::export_markdown_source(appended_snapshot.as_ref(), "doc-table-update", None)
    .expect("export appended source");
  let appended_block_id = appended_source
    .markdown
    .lines()
    .rev()
    .find_map(|line| {
      line
        .trim()
        .strip_prefix("<!--")?
        .strip_suffix("-->")?
        .split_whitespace()
        .find_map(|token| token.strip_prefix("block_id="))
        .map(str::to_string)
    })
    .expect("appended block marker");
  let mut local_doc = DocOptions::new().with_guid("doc-table-update".to_string()).build();
  local_doc
    .apply_update_from_binary_v1(appended_snapshot.as_ref())
    .expect("load appended snapshot");
  let blocks = local_doc.get_map("blocks").expect("load appended blocks");
  let mut appended_block = blocks
    .get(&appended_block_id)
    .and_then(|value| value.to_map())
    .expect("load appended block");
  appended_block
    .insert("prop:collapsed".to_string(), Any::False)
    .expect("add editor default property");
  let local_snapshot = local_doc.encode_update_v1().expect("encode editor-normalized snapshot");

  sync
    .stop_session(session_id.to_string())
    .await
    .expect("stop before removing appended paragraph");
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-table-update".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(md_path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("restart before removing appended paragraph");
  let _ = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull restarted session");

  fs::write(&md_path, &changed_source).expect("remove appended markdown paragraph");
  let _ = sync
    .pull_events(session_id.to_string())
    .await
    .expect("discover removed paragraph");
  let restored = sync
    .prepare_source_doc(
      session_id.to_string(),
      "doc-table-update".to_string(),
      Some(Uint8Array::new(local_snapshot)),
      None,
    )
    .await
    .expect("prepare source after removing appended paragraph")
    .expect("restored table snapshot");
  assert!(!restored.is_empty());
  let restored_events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull removed paragraph update");
  assert!(restored_events.iter().any(|event| {
    event.r#type == "doc-update"
      && event
        .update
        .as_ref()
        .is_some_and(|update| update.doc_id == "doc-table-update")
  }));

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn markdown_table_source_rejects_opaque_table_edits() {
  let dir = temp_dir();
  let md_path = dir.join("table.md");
  let initial_source =
    "---\nid: doc-table-opaque\ntitle: Table\n---\n\n# Table\n\n| A | B |\n| --- | --- |\n| one | two |\n";
  fs::write(&md_path, initial_source).expect("write initial table markdown");

  let sync = DiskSync::new();
  let session_id = "session-table-opaque";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-table-opaque".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(md_path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start session");
  let initial = sync
    .prepare_source_doc(session_id.to_string(), "doc-table-opaque".to_string(), None, None)
    .await
    .expect("prepare initial table source")
    .expect("initial table snapshot");

  fs::write(&md_path, initial_source.replace("one | two", "three | four")).expect("update opaque table");
  let _ = sync
    .pull_events(session_id.to_string())
    .await
    .expect("discover table update");
  let result = sync
    .prepare_source_doc(
      session_id.to_string(),
      "doc-table-opaque".to_string(),
      Some(initial),
      None,
    )
    .await;
  let error = match result {
    Ok(_) => panic!("opaque table edit should be rejected"),
    Err(error) => error,
  };
  assert!(error.reason.contains("external edits to opaque markdown block"));

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
        source_file: None,
      },
    )
    .await
    .expect("start session");

  let discovered = sync.pull_events(session_id.to_string()).await.expect("pull discovery");
  let doc_id = discovered
    .iter()
    .find_map(|event| {
      (event.r#type == "source-discovered")
        .then(|| event.doc_id.clone())
        .flatten()
    })
    .expect("discovered doc id");
  sync
    .prepare_source_doc(session_id.to_string(), doc_id.clone(), None, None)
    .await
    .expect("prepare new source");
  let events = sync.pull_events(session_id.to_string()).await.expect("pull first");

  let imported = fs::read_to_string(&md_path).expect("read imported markdown");
  let (meta, _) = parse_frontmatter(&imported);
  assert!(meta.id.is_none());

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
    )
    .await
    .expect("apply local update");

  let unchanged = fs::read_to_string(&md_path).expect("read original markdown after local edit");
  assert_eq!(unchanged, imported);
  let candidate = fs::read_dir(dir.join(".affine-sync/candidates"))
    .expect("candidate directory")
    .flatten()
    .find_map(|entry| {
      let content = fs::read_to_string(entry.path()).ok()?;
      content.contains("two").then_some(content)
    })
    .expect("updated source candidate");
  assert!(candidate.contains(&format!("id: {doc_id}")));
  fs::write(&md_path, candidate).expect("accept source candidate");
  sync
    .pull_events(session_id.to_string())
    .await
    .expect("scan accepted source");
  assert!(
    fs::read_to_string(&md_path)
      .expect("read accepted source")
      .contains("two")
  );

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn imported_source_replay_ignores_editor_default_collapsed_property() {
  let dir = temp_dir();
  let md_path = dir.join("finder-open.md");
  fs::write(&md_path, "# Finder Open\n\none").expect("write markdown");

  let sync = DiskSync::new();
  let session_id = "session-source-replay-defaults";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-source-replay-defaults".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(md_path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start session");

  let discovered = sync.pull_events(session_id.to_string()).await.expect("pull discovery");
  let doc_id = discovered
    .iter()
    .find_map(|event| {
      (event.r#type == "source-discovered")
        .then(|| event.doc_id.clone())
        .flatten()
    })
    .expect("discovered doc id");
  let initial = sync
    .prepare_source_doc(session_id.to_string(), doc_id.clone(), None, None)
    .await
    .expect("prepare source")
    .expect("imported snapshot");
  let _ = sync
    .pull_events(session_id.to_string())
    .await
    .expect("drain initial import");

  fs::write(&md_path, "# Finder Open\n\none\n\ntwo").expect("append markdown block");
  let _ = sync
    .pull_events(session_id.to_string())
    .await
    .expect("discover appended block");
  let imported = sync
    .prepare_source_doc(session_id.to_string(), doc_id.clone(), Some(initial), None)
    .await
    .expect("prepare appended source")
    .expect("appended snapshot");

  let source = affine_doc_loader::export_markdown_source(imported.as_ref(), &doc_id, None).expect("export source");
  let block_id = source
    .markdown
    .lines()
    .rev()
    .find_map(|line| {
      line
        .trim()
        .strip_prefix("<!--")?
        .strip_suffix("-->")?
        .split_whitespace()
        .find_map(|token| token.strip_prefix("block_id="))
        .map(str::to_string)
    })
    .expect("paragraph marker");
  let mut replayed = DocOptions::new().with_guid(doc_id.clone()).build();
  replayed
    .apply_update_from_binary_v1(imported.as_ref())
    .expect("load imported snapshot");
  let state_before_default = replayed.get_state_vector();
  let blocks = replayed.get_map("blocks").expect("load blocks");
  let mut block = blocks
    .get(&block_id)
    .and_then(|value| value.to_map())
    .expect("load imported block");
  assert!(block.get("prop:collapsed").is_none());
  block
    .insert("prop:collapsed".to_string(), Any::False)
    .expect("add editor default property");
  let replay_delta = replayed
    .encode_state_as_update_v1(&state_before_default)
    .expect("encode replay delta");

  let clock = sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id,
        bin: Uint8Array::new(replay_delta),
        editor: None,
      },
    )
    .await
    .expect("replay imported source");
  assert!(clock.review_required.is_none());

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn resolves_source_doc_id_by_file_path_before_and_after_import() {
  let dir = temp_dir();
  let md_path = dir.join("finder-open.md");
  let other_md_path = dir.join("other.md");
  fs::write(
    &md_path,
    "---\nid: doc-finder-open\ntitle: Finder Open\n---\n\n# Finder Open\n",
  )
  .expect("write markdown");
  fs::write(&other_md_path, "---\nid: doc-other\ntitle: Other\n---\n\n# Other\n").expect("write other markdown");

  let sync = DiskSync::new();
  let session_id = "session-finder-open";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-finder-open".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: None,
      },
    )
    .await
    .expect("start session");

  assert_eq!(
    sync
      .resolve_source_doc_id(session_id.to_string(), md_path.to_string_lossy().to_string())
      .await
      .expect("resolve pending source"),
    None
  );
  assert_eq!(
    sync
      .resolve_source_doc_id(session_id.to_string(), other_md_path.to_string_lossy().to_string(),)
      .await
      .expect("resolve other pending source"),
    None
  );

  let finder_snapshot = sync
    .prepare_source_doc(session_id.to_string(), "doc-finder-open".to_string(), None, None)
    .await
    .expect("prepare source")
    .expect("finder source snapshot");
  let other_snapshot = sync
    .prepare_source_doc(session_id.to_string(), "doc-other".to_string(), None, None)
    .await
    .expect("prepare other source")
    .expect("other source snapshot");

  let finder_source =
    affine_doc_loader::export_markdown_source(&finder_snapshot, "doc-finder-open", None).expect("export finder source");
  let other_source =
    affine_doc_loader::export_markdown_source(&other_snapshot, "doc-other", None).expect("export other source");
  assert!(finder_source.markdown.contains("# Finder Open"));
  assert!(!finder_source.markdown.contains("# Other"));
  assert!(other_source.markdown.contains("# Other"));
  assert!(!other_source.markdown.contains("# Finder Open"));

  assert_eq!(
    sync
      .resolve_source_doc_id(session_id.to_string(), md_path.to_string_lossy().to_string())
      .await
      .expect("resolve imported source"),
    Some("doc-finder-open".to_string())
  );
  assert_eq!(
    sync
      .resolve_source_doc_id(session_id.to_string(), other_md_path.to_string_lossy().to_string(),)
      .await
      .expect("resolve other source after import"),
    Some("doc-other".to_string())
  );

  sync
    .stop_session(session_id.to_string())
    .await
    .expect("stop prepared session");
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-finder-open".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: None,
      },
    )
    .await
    .expect("restart prepared session");
  assert_eq!(
    sync
      .resolve_source_doc_id(session_id.to_string(), md_path.to_string_lossy().to_string())
      .await
      .expect("resolve ready source after restart"),
    Some("doc-finder-open".to_string())
  );

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn single_source_session_ignores_sibling_markdown_files() {
  let dir = temp_dir();
  let target = dir.join("A.md");
  let sibling = dir.join("B.md");
  fs::write(&target, "---\nid: doc-a\ntitle: A\n---\n\n# A\n\ntarget").expect("write target");
  fs::write(&sibling, "---\nid: doc-b\ntitle: B\n---\n\n# B\n\nsibling").expect("write sibling");

  let sync = DiskSync::new();
  let session_id = "session-single-source";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-single-source".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(target.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start session");

  let events = sync.pull_events(session_id.to_string()).await.expect("pull events");
  assert!(
    events
      .iter()
      .any(|event| { event.r#type == "source-discovered" && event.doc_id.as_deref() == Some("doc-a") })
  );
  assert!(
    !events
      .iter()
      .any(|event| { event.r#type == "source-discovered" && event.doc_id.as_deref() == Some("doc-b") })
  );

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
        source_file: None,
      },
    )
    .await
    .expect("start session");

  let discovered = sync.pull_events(session_id.to_string()).await.expect("pull discovery");
  let doc_id = discovered
    .iter()
    .find_map(|event| {
      (event.r#type == "source-discovered")
        .then(|| event.doc_id.clone())
        .flatten()
    })
    .expect("discovered doc id");
  sync
    .prepare_source_doc(session_id.to_string(), doc_id.clone(), None, None)
    .await
    .expect("prepare new source");
  let events = sync.pull_events(session_id.to_string()).await.expect("pull events");
  let imported = fs::read_to_string(&md_path).expect("read imported markdown");
  let (meta, _) = parse_frontmatter(&imported);
  assert!(meta.id.is_none());
  assert!(
    fs::read_dir(dir.join(".affine-sync/candidates"))
      .expect("candidate directory")
      .flatten()
      .any(|entry| fs::read_to_string(entry.path()).is_ok_and(|content| content.contains(&format!("id: {doc_id}"))))
  );

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

  sync
    .stop_session(session_id.to_string())
    .await
    .expect("stop before acknowledgement");
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: None,
      },
    )
    .await
    .expect("restart session");
  let replayed = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull replayed updates");
  assert!(
    replayed
      .iter()
      .any(|event| { event.update.as_ref().is_some_and(|update| update.doc_id == doc_id) })
  );
  assert!(replayed.iter().any(|event| {
    event
      .update
      .as_ref()
      .is_some_and(|update| update.doc_id == workspace_id && update.bin.as_ref() == root_update)
  }));

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
        source_file: None,
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

#[tokio::test]
async fn concurrent_file_and_doc_edits_require_source_reconciliation() {
  let dir = temp_dir();
  let sync = DiskSync::new();
  let session_id = "session-concurrent-source";
  let doc_id = "doc-concurrent-source";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-concurrent-source".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: None,
      },
    )
    .await
    .expect("start session");
  let _ = sync.pull_events(session_id.to_string()).await.expect("pull first");

  let initial = build_full_doc("Example", "alpha beta", doc_id).expect("build initial doc");
  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_id.to_string(),
        bin: Uint8Array::new(initial.clone()),
        editor: None,
      },
    )
    .await
    .expect("apply initial doc");

  let mut files = Vec::new();
  collect_markdown_files(&dir, &mut files).expect("collect markdown files");
  let path = files.pop().expect("exported file");
  let source_file = fs::read_to_string(&path).expect("read exported file");
  fs::write(&path, source_file.replace("alpha", "ALPHA")).expect("edit file");

  let source = affine_doc_loader::export_markdown_source(&initial, doc_id, None).expect("export source");
  let delta = update_doc(&initial, &source.markdown.replace("beta", "BETA"), doc_id).expect("build current-side edit");
  sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_id.to_string(),
        bin: Uint8Array::new(delta.clone()),
        editor: None,
      },
    )
    .await
    .expect("apply current-side edit");

  let mut current = DocOptions::new().with_guid(doc_id.to_string()).build();
  current
    .apply_update_from_binary_v1(&initial)
    .expect("apply initial doc");
  current
    .apply_update_from_binary_v1(&delta)
    .expect("apply current-side delta");
  sync
    .stop_session(session_id.to_string())
    .await
    .expect("stop before import");
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-concurrent-source".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: None,
      },
    )
    .await
    .expect("restart before import");
  let prepare_result = sync
    .prepare_source_doc(
      session_id.to_string(),
      doc_id.to_string(),
      Some(Uint8Array::new(
        current.encode_update_v1().expect("encode local current"),
      )),
      None,
    )
    .await;
  let prepare_error = match prepare_result {
    Ok(_) => panic!("concurrent edits require reconciliation"),
    Err(error) => error,
  };
  assert!(prepare_error.to_string().contains("concurrent edits; review"));

  let events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("scan concurrent edit");
  assert!(
    !events
      .iter()
      .any(|event| { event.update.as_ref().is_some_and(|update| update.doc_id == doc_id) })
  );
  assert_eq!(
    fs::read_to_string(&path).expect("read original source"),
    source_file.replace("alpha", "ALPHA")
  );

  let candidates = dir.join(".affine-sync").join("candidates");
  let candidate = fs::read_dir(&candidates)
    .expect("candidate directory")
    .next()
    .expect("candidate")
    .expect("candidate entry")
    .path();
  let content = fs::read_to_string(&candidate).expect("read candidate");
  assert!(content.contains("ALPHA BETA"));

  fs::write(&path, content).expect("accept candidate");
  sync
    .prepare_source_doc(
      session_id.to_string(),
      doc_id.to_string(),
      Some(Uint8Array::new(
        current.encode_update_v1().expect("encode local current"),
      )),
      None,
    )
    .await
    .expect("prepare accepted source");
  let accepted = sync
    .pull_events(session_id.to_string())
    .await
    .expect("scan accepted candidate");
  let source_delta = accepted
    .iter()
    .find_map(|event| {
      event
        .update
        .as_ref()
        .filter(|update| update.doc_id == doc_id)
        .map(|update| update.bin.as_ref().to_vec())
    })
    .expect("merged source delta");
  let mut merged = DocOptions::new().with_guid(doc_id.to_string()).build();
  merged.apply_update_from_binary_v1(&initial).expect("apply initial doc");
  merged
    .apply_update_from_binary_v1(&delta)
    .expect("apply current-side delta");
  merged
    .apply_update_from_binary_v1(&source_delta)
    .expect("apply source delta");
  let exported =
    affine_doc_loader::export_markdown_source(&merged.encode_update_v1().expect("encode merged doc"), doc_id, None)
      .expect("export merged doc");
  assert!(exported.markdown.contains("ALPHA BETA"));

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn imports_large_markdown_as_a_bounded_readonly_preview() {
  let dir = temp_dir();
  let path = dir.join("large.md");
  let mut markdown = String::with_capacity(5_250_000);
  for section in 0..21_000 {
    markdown.push_str(&format!("# Section {section} {}\n", "content ".repeat(29)));
  }
  assert!(markdown.len() > 5_000_000);
  fs::write(&path, &markdown).expect("write large markdown source");

  let sync = DiskSync::new();
  let session_id = "session-large-markdown";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-large-markdown".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start large source session");

  let events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull large source discovery");
  let doc_id = events
    .iter()
    .find_map(|event| {
      (event.r#type == "source-discovered")
        .then(|| event.doc_id.clone())
        .flatten()
    })
    .expect("discover large source");
  assert!(
    sync
      .should_replace_source_doc(session_id.to_string(), doc_id.clone())
      .await
      .expect("classify large source")
  );
  let snapshot = sync
    .prepare_source_doc(session_id.to_string(), doc_id.clone(), None, None)
    .await
    .expect("import large markdown source")
    .expect("large source snapshot");

  assert!(is_complete_update(&snapshot).expect("inspect large source snapshot"));
  assert!(
    snapshot.len() < 1_000_000,
    "preview snapshot was {} bytes",
    snapshot.len()
  );
  let preview = affine_doc_loader::export_markdown_source(&snapshot, &doc_id, None)
    .expect("export large source preview")
    .markdown;
  assert!(preview.contains("Large Markdown preview"));
  assert!(preview.contains("Section 0"));
  assert!(!preview.contains("Section 20999"));
  assert_eq!(fs::read_to_string(&path).expect("read source after import"), markdown);
  let candidate_count = fs::read_dir(dir.join(".affine-sync/candidates"))
    .map(|entries| entries.flatten().count())
    .unwrap_or_default();

  let replay_clock = sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_id.clone(),
        bin: Uint8Array::new(snapshot.as_ref().to_vec()),
        editor: Some("test".to_string()),
      },
    )
    .await
    .expect("accept preview state acknowledgement");
  assert!(replay_clock.export_error.is_none());

  let edited = build_full_doc("Edited preview", "# Edited preview", &doc_id).expect("build edited preview state");
  let clock = sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_id.clone(),
        bin: Uint8Array::new(edited),
        editor: Some("test".to_string()),
      },
    )
    .await
    .expect("reject preview export without failing the session");
  assert!(
    clock
      .export_error
      .as_deref()
      .is_some_and(|message| message.contains("read-only preview"))
  );
  assert_eq!(fs::read_to_string(&path).expect("read source after edit"), markdown);
  assert_eq!(
    fs::read_dir(dir.join(".affine-sync/candidates"))
      .map(|entries| entries.flatten().count())
      .unwrap_or_default(),
    candidate_count
  );
  assert_eq!(
    sync
      .resolve_source_doc_id(session_id.to_string(), path.to_string_lossy().to_string())
      .await
      .expect("resolve large source"),
    Some(doc_id)
  );

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn imports_a_large_single_block_as_a_readonly_preview() {
  let dir = temp_dir();
  let path = dir.join("large-single-block.md");
  let markdown = format!("# Large paragraph\n\n{}", "content ".repeat(140_000));
  assert!(markdown.len() > 1_000_000);
  assert!(markdown.lines().count() < 10);
  fs::write(&path, &markdown).expect("write large single-block source");

  let sync = DiskSync::new();
  let session_id = "session-large-single-block";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-large-single-block".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start large single-block session");

  let events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull large single-block discovery");
  let doc_id = events
    .iter()
    .find_map(|event| {
      (event.r#type == "source-discovered")
        .then(|| event.doc_id.clone())
        .flatten()
    })
    .expect("discover large single-block source");
  let snapshot = sync
    .prepare_source_doc(session_id.to_string(), doc_id.clone(), None, None)
    .await
    .expect("import large single-block source")
    .expect("large single-block snapshot");

  let preview = affine_doc_loader::export_markdown_source(&snapshot, &doc_id, None)
    .expect("export large single-block preview")
    .markdown;
  assert!(preview.contains("Large Markdown preview"));
  assert!(preview.contains("Large paragraph"));
  assert!(snapshot.len() < 1_000_000);
  assert_eq!(fs::read_to_string(&path).expect("read source after import"), markdown);

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn rebuilds_a_ready_legacy_large_checkpoint_as_a_preview() {
  let dir = temp_dir();
  let path = dir.join("legacy-large.md");
  let doc_id = "doc-legacy-large-preview";
  let workspace_id = "ws-legacy-large-preview";
  let session_id = "session-legacy-large-preview";
  fs::write(
    &path,
    format!("---\nid: {doc_id}\ntitle: Legacy Large\n---\n\n# Small\n\ncontent"),
  )
  .expect("write initial source");

  let sync = DiskSync::new();
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start initial source session");
  let _ = sync.pull_events(session_id.to_string()).await.expect("discover source");
  sync
    .prepare_source_doc(session_id.to_string(), doc_id.to_string(), None, None)
    .await
    .expect("prepare initial source")
    .expect("initial source snapshot");
  sync
    .stop_session(session_id.to_string())
    .await
    .expect("stop initial session");

  let large_body = "legacy content\n".repeat(80_000);
  let large_source = format!("---\nid: {doc_id}\ntitle: Legacy Large\n---\n\n{large_body}");
  fs::write(&path, &large_source).expect("write legacy large source");
  let (_, large_markdown) = parse_frontmatter(&large_source);

  let state_db = StateDb::open(&dir, workspace_id).await.expect("open disk state");
  let mut checkpoint = state_db
    .load_source_checkpoints()
    .await
    .expect("load source checkpoint")
    .remove(doc_id)
    .expect("legacy checkpoint");
  checkpoint.markdown = large_markdown.clone();
  checkpoint.source_markdown = large_markdown;
  checkpoint.readonly_preview = false;
  state_db
    .upsert_source_checkpoint(doc_id, &checkpoint)
    .await
    .expect("store legacy large checkpoint");

  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: workspace_id.to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("restart legacy source session");
  assert_eq!(
    sync
      .resolve_source_doc_id(session_id.to_string(), path.to_string_lossy().to_string())
      .await
      .expect("resolve ready legacy source"),
    Some(doc_id.to_string())
  );
  assert!(
    sync
      .should_replace_source_doc(session_id.to_string(), doc_id.to_string())
      .await
      .expect("classify ready legacy source")
  );

  let replacement = sync
    .prepare_source_doc(session_id.to_string(), doc_id.to_string(), None, None)
    .await
    .expect("prepare ready legacy source")
    .expect("ready legacy source replacement");
  let preview = affine_doc_loader::export_markdown_source(&replacement, doc_id, None)
    .expect("export legacy preview")
    .markdown;
  assert!(preview.contains("Large Markdown preview"));
  assert!(preview.contains("legacy content"));
  assert_eq!(
    fs::read_to_string(&path).expect("read source after replacement"),
    large_source
  );

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn imports_block_dense_markdown_as_a_preview() {
  let dir = temp_dir();
  let path = dir.join("dense.md");
  let markdown = (0..21_000).map(|index| format!("# {index}\n")).collect::<String>();
  assert!(markdown.len() < 1_000_000);
  fs::write(&path, &markdown).expect("write dense markdown source");

  let sync = DiskSync::new();
  let session_id = "session-dense-markdown";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-dense-markdown".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start dense source session");

  let events = sync
    .pull_events(session_id.to_string())
    .await
    .expect("pull dense source discovery");
  let doc_id = events
    .iter()
    .find_map(|event| {
      (event.r#type == "source-discovered")
        .then(|| event.doc_id.clone())
        .flatten()
    })
    .expect("discover dense source");
  assert!(
    sync
      .should_replace_source_doc(session_id.to_string(), doc_id.clone())
      .await
      .expect("classify dense source")
  );
  let snapshot = sync
    .prepare_source_doc(session_id.to_string(), doc_id.clone(), None, None)
    .await
    .expect("import dense markdown source")
    .expect("dense source snapshot");

  let preview = affine_doc_loader::export_markdown_source(&snapshot, &doc_id, None)
    .expect("export dense source preview")
    .markdown;
  assert!(preview.contains("Large Markdown preview"));
  assert!(preview.contains("# 0"));
  assert!(!preview.contains("# 20999"));
  assert_eq!(fs::read_to_string(&path).expect("read dense source"), markdown);

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn replaces_an_existing_rich_doc_when_the_source_becomes_too_large() {
  let dir = temp_dir();
  let path = dir.join("growing.md");
  let doc_id = "doc-growing-preview";
  fs::write(
    &path,
    format!("---\nid: {doc_id}\ntitle: Growing\n---\n\n# Small\n\ncontent"),
  )
  .expect("write initial source");

  let sync = DiskSync::new();
  let session_id = "session-growing-preview";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-growing-preview".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start source session");
  let _ = sync.pull_events(session_id.to_string()).await.expect("discover source");
  sync
    .prepare_source_doc(session_id.to_string(), doc_id.to_string(), None, None)
    .await
    .expect("prepare initial source");
  let _ = sync
    .pull_events(session_id.to_string())
    .await
    .expect("clear initial updates");

  let large_body = "large content\n".repeat(80_000);
  fs::write(&path, format!("---\nid: {doc_id}\ntitle: Growing\n---\n\n{large_body}")).expect("grow source");
  let changed = sync
    .pull_events(session_id.to_string())
    .await
    .expect("discover grown source");
  assert!(changed.iter().any(|event| event.r#type == "source-discovered"));
  let replacement = sync
    .prepare_source_doc(session_id.to_string(), doc_id.to_string(), None, None)
    .await
    .expect("prepare grown source")
    .expect("preview replacement update")
    .as_ref()
    .to_vec();
  let preview = affine_doc_loader::export_markdown_source(&replacement, doc_id, None)
    .expect("export replacement preview")
    .markdown;
  assert!(preview.contains("Large Markdown preview"));
  let mut doc = DocOptions::new().with_guid(doc_id.to_string()).build();
  doc
    .apply_update_from_binary_v1(&replacement)
    .expect("decode replacement preview");
  assert!(doc.get_map("blocks").expect("preview blocks").len() < 10);

  teardown(&sync, session_id, &dir).await;
}

#[tokio::test]
async fn promotes_a_preview_back_to_a_rich_doc_when_the_source_shrinks() {
  let dir = temp_dir();
  let path = dir.join("shrinking.md");
  let doc_id = "doc-shrinking-preview";
  let large_body = "large content\n".repeat(80_000);
  fs::write(
    &path,
    format!("---\nid: {doc_id}\ntitle: Shrinking\n---\n\n{large_body}"),
  )
  .expect("write large source");

  let sync = DiskSync::new();
  let session_id = "session-shrinking-preview";
  sync
    .start_session(
      session_id.to_string(),
      DiskSessionOptions {
        workspace_id: "ws-shrinking-preview".to_string(),
        sync_folder: dir.to_string_lossy().to_string(),
        source_file: Some(path.to_string_lossy().to_string()),
      },
    )
    .await
    .expect("start source session");
  let _ = sync.pull_events(session_id.to_string()).await.expect("discover source");
  sync
    .prepare_source_doc(session_id.to_string(), doc_id.to_string(), None, None)
    .await
    .expect("prepare preview source");
  let _ = sync
    .pull_events(session_id.to_string())
    .await
    .expect("clear preview updates");

  fs::write(
    &path,
    format!("---\nid: {doc_id}\ntitle: Shrinking\n---\n\n# Supported again\n\neditable"),
  )
  .expect("shrink source");
  let changed = sync
    .pull_events(session_id.to_string())
    .await
    .expect("discover supported source");
  assert!(changed.iter().any(|event| event.r#type == "source-discovered"));
  let replacement = sync
    .prepare_source_doc(session_id.to_string(), doc_id.to_string(), None, None)
    .await
    .expect("prepare supported source")
    .expect("rich replacement update")
    .as_ref()
    .to_vec();
  let markdown = affine_doc_loader::export_markdown_source(&replacement, doc_id, None)
    .expect("export promoted source")
    .markdown;
  assert!(markdown.contains("Supported again"));
  assert!(!markdown.contains("Large Markdown preview"));

  let clock = sync
    .apply_local_update(
      session_id.to_string(),
      DiskDocUpdateInput {
        doc_id: doc_id.to_string(),
        bin: Uint8Array::new(replacement),
        editor: Some("test".to_string()),
      },
    )
    .await
    .expect("accept rich source update");
  assert!(clock.export_error.is_none());

  teardown(&sync, session_id, &dir).await;
}
