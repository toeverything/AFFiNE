use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde_json::json;
use server_sync::{
  error::SyncError,
  eventbus::{EventBusEnvelope, EventBusFilter},
  legacy_compat::errors::sync_error_to_ws_envelope,
  permissions::{
    DocAction, DocRole, DocRoleInput, WorkspaceAction, WorkspaceRole, doc_role_allows, resolve_effective_doc_role,
    workspace_role_allows,
  },
  protocol::{
    ReservedDocKind, SpaceType, canonical_doc_id, classify_reserved_doc, is_batch_ws_client_version,
    is_ordinary_workspace_doc, parse_join_space_batch_message, parse_leave_space_batch_message,
  },
  storage::{
    LegacyRootPage, WORKSPACE_LIFECYCLE_MIGRATION_READ_LIMITS, extract_workspace_lifecycle_root_pages,
    merge_and_diff_doc, validate_doc_update,
  },
};
use y_octo::HashMapExt;

const GOLDEN_PARITY_UPDATE_B64: &str = "AQIBACgBBG1ldGEFdGl0bGUBdwZwYXJpdHkEAQdjb250ZW50DGhlbGxvIHBhcml0eQA=";
const GOLDEN_PARITY_STATE_B64: &str = "AQEN";

#[test]
fn golden_v0275_doc_diff_matches_recorded_fixture_byte_for_byte() {
  let raw = BASE64.decode(GOLDEN_PARITY_UPDATE_B64).expect("valid base64");
  validate_doc_update(&raw).expect("golden update must validate");

  let (missing, state) = merge_and_diff_doc(&[raw.as_slice()], None).expect("merge_and_diff_doc");
  assert_eq!(BASE64.encode(&missing), GOLDEN_PARITY_UPDATE_B64);
  assert_eq!(BASE64.encode(&state), GOLDEN_PARITY_STATE_B64);

  // Diffing against the returned state vector yields an empty Yjs v1 update `[0, 0]`.
  let (delta, state_again) = merge_and_diff_doc(&[raw.as_slice()], Some(&state)).expect("diff against current state");
  assert_eq!(delta, vec![0u8, 0u8]);
  assert_eq!(BASE64.encode(&state_again), GOLDEN_PARITY_STATE_B64);

  // Corrupt update is rejected.
  assert!(validate_doc_update(&[0xff]).is_err());
}

#[test]
fn eventbus_filter_drops_self_origin_and_duplicate_ids() {
  let mut filter = EventBusFilter::new("node-self".into(), 4);
  let mk = |id: &str, origin_id: &str| EventBusEnvelope {
    event: "sync.doc.updates.pushed".into(),
    id: id.into(),
    origin_channel: "v2:production".into(),
    origin_id: origin_id.into(),
    payload: json!({}),
    request_id: None,
    v: 1,
  };

  assert!(!filter.accept(&mk("eb_1", "node-self")));
  assert!(filter.accept(&mk("eb_2", "node-peer")));
  assert!(!filter.accept(&mk("eb_2", "node-peer")));
  assert!(filter.accept(&mk("eb_3", "node-peer")));
}

#[test]
fn protocol_parsing_and_validation_rules_match_v0275() {
  assert!(is_batch_ws_client_version("0.27.5"));
  assert!(is_batch_ws_client_version("0.27.5-beta.1"));
  assert!(is_batch_ws_client_version("0.28.0"));
  assert!(!is_batch_ws_client_version("0.27.4"));
  assert!(!is_batch_ws_client_version("invalid"));

  assert_eq!(canonical_doc_id("doc-1", "ws-1").unwrap(), "doc-1");
  assert_eq!(canonical_doc_id("workspace:ws-1:doc-1", "ws-1").unwrap(), "doc-1");
  assert!(canonical_doc_id("workspace:other:doc-1", "ws-1").is_err());
  assert!(canonical_doc_id("a/b", "ws-1").is_err());

  assert!(is_ordinary_workspace_doc("ws-1", "doc-1"));
  assert!(!is_ordinary_workspace_doc("ws-1", "ws-1"));
  assert!(!is_ordinary_workspace_doc("ws-1", "db$ws-1$docProperties"));
  assert!(!is_ordinary_workspace_doc("ws-1", "userdata$u1$ws-1$settings"));

  assert_eq!(classify_reserved_doc("ws-1", "ws-1", "u1"), ReservedDocKind::Root);
  for tbl in [
    "folders",
    "docProperties",
    "docCustomPropertyInfo",
    "pinnedCollections",
    "explorerIcon",
  ] {
    assert_eq!(
      classify_reserved_doc("ws-1", &format!("db$ws-1${tbl}"), "u1"),
      ReservedDocKind::WorkspaceDb,
      "db table {tbl} must be allowed"
    );
  }
  for bad in ["unknown", "migrationFavorites", "commentAttachment"] {
    assert_eq!(
      classify_reserved_doc("ws-1", &format!("db$ws-1${bad}"), "u1"),
      ReservedDocKind::InvalidOrForeign,
      "db table {bad} must be rejected"
    );
  }
  for tbl in ["favorite", "settings", "docIntegrationRef"] {
    assert_eq!(
      classify_reserved_doc("ws-1", &format!("userdata$u1$ws-1${tbl}"), "u1"),
      ReservedDocKind::UserDataOwner,
      "userdata table {tbl} must be allowed for owner"
    );
  }
  for bad_doc in [
    "userdata$u2$ws-1$settings",
    "userdata$__local__$ws-1$settings",
    "userdata$$ws-1$settings",
    "userdata$u1$ws-1$featureFlags",
    "userdata$u1$ws-1$recentDocs",
  ] {
    assert_eq!(
      classify_reserved_doc("ws-1", bad_doc, "u1"),
      ReservedDocKind::InvalidOrForeign,
      "reserved doc {bad_doc} must be rejected"
    );
  }

  let parsed = parse_join_space_batch_message(&json!({
    "spaces": [{ "spaceType": "workspace", "spaceId": "ws-1", "docId": "doc-1" }],
    "clientVersion": "0.27.5",
    "protocolVersion": 2
  }))
  .unwrap();
  assert_eq!(parsed.protocol_version, 2);
  assert_eq!(parsed.spaces.len(), 1);
  assert_eq!(parsed.spaces[0].space_type, SpaceType::Workspace);

  // Duplicate entries rejected.
  assert!(
    parse_join_space_batch_message(&json!({
      "spaces": [
        { "spaceType": "workspace", "spaceId": "ws-1", "docId": "doc-1" },
        { "spaceType": "workspace", "spaceId": "ws-1", "docId": "doc-1" }
      ],
      "clientVersion": "0.27.5",
      "protocolVersion": 2
    }))
    .is_err()
  );

  let leave = parse_leave_space_batch_message(&json!({
    "spaceType": "workspace",
    "spaceId": "ws-1",
    "docIds": ["doc-1"]
  }))
  .unwrap();
  assert_eq!(leave.doc_ids, vec!["doc-1".to_owned()]);

  let err_env = sync_error_to_ws_envelope(
    &SyncError::NotInSpace {
      space_id: "ws-1".into(),
    },
    Some("req-1".into()),
  );
  assert_eq!(err_env.error.status, 400);
  assert_eq!(err_env.error.code, "NOT_IN_SPACE");
  assert_eq!(err_env.error.request_id.as_deref(), Some("req-1"));
}

#[test]
fn permission_matrix_matches_v0275_1_to_1() {
  // 1. DocRole x DocAction table: Trash/Restore/Delete/Publish/Unpublish/UsersManage require Manager.
  let doc_cases = [
    (DocRole::None, DocAction::Read, false),
    (DocRole::External, DocAction::Read, true),
    (DocRole::External, DocAction::Comment, false),
    (DocRole::Reader, DocAction::Read, true),
    (DocRole::Reader, DocAction::Comment, false),
    (DocRole::Commenter, DocAction::Comment, true),
    (DocRole::Commenter, DocAction::Update, false),
    (DocRole::Editor, DocAction::Update, true),
    (DocRole::Editor, DocAction::Trash, false),
    (DocRole::Editor, DocAction::Restore, false),
    (DocRole::Editor, DocAction::Delete, false),
    (DocRole::Editor, DocAction::Publish, false),
    (DocRole::Editor, DocAction::Unpublish, false),
    (DocRole::Editor, DocAction::UsersManage, false),
    (DocRole::Manager, DocAction::Trash, true),
    (DocRole::Manager, DocAction::Restore, true),
    (DocRole::Manager, DocAction::Delete, true),
    (DocRole::Manager, DocAction::Publish, true),
    (DocRole::Manager, DocAction::Unpublish, true),
    (DocRole::Manager, DocAction::UsersManage, true),
    (DocRole::Owner, DocAction::Delete, true),
  ];
  for (role, action, expected) in doc_cases {
    assert_eq!(
      doc_role_allows(role, action),
      expected,
      "doc_role_allows({role:?}, {action:?})"
    );
  }

  // 2. WorkspaceRole x WorkspaceAction table (including non-commercial Admin downgrade).
  let ws_cases = [
    (None, false, WorkspaceAction::Read, false),
    (Some(WorkspaceRole::External), false, WorkspaceAction::Read, true),
    // External cannot Sync
    (Some(WorkspaceRole::External), true, WorkspaceAction::Sync, false),
    // Member can Sync & CreateDoc
    (Some(WorkspaceRole::Member), false, WorkspaceAction::Sync, true),
    (Some(WorkspaceRole::Member), false, WorkspaceAction::CreateDoc, true),
    (Some(WorkspaceRole::Member), false, WorkspaceAction::UsersManage, false),
    // Non-commercial Admin downgrades to Member
    (Some(WorkspaceRole::Admin), false, WorkspaceAction::UsersManage, false),
    (Some(WorkspaceRole::Admin), true, WorkspaceAction::UsersManage, true),
    // Owner
    (Some(WorkspaceRole::Owner), false, WorkspaceAction::Delete, true),
    (Some(WorkspaceRole::Admin), true, WorkspaceAction::Delete, false),
  ];
  for (role, commercial, action, expected) in ws_cases {
    assert_eq!(
      workspace_role_allows(role, commercial, action),
      expected,
      "workspace_role_allows({role:?}, commercial={commercial}, {action:?})"
    );
  }

  // 3. Multi-source resolve_effective_doc_role: explicit None falls back to member_default_role; max across candidates.
  assert_eq!(
    resolve_effective_doc_role(DocRoleInput {
      workspace_role: Some(WorkspaceRole::Member),
      commercial: false,
      explicit_user_role: Some(DocRole::None),
      member_default_role: DocRole::Editor,
      doc_sharing_enabled: true,
      doc_visibility_public: false,
      public_role: DocRole::None,
    }),
    DocRole::Editor
  );

  // Commercial Admin inherits Manager even if explicit grant is Reader.
  assert_eq!(
    resolve_effective_doc_role(DocRoleInput {
      workspace_role: Some(WorkspaceRole::Admin),
      commercial: true,
      explicit_user_role: Some(DocRole::Reader),
      member_default_role: DocRole::Reader,
      doc_sharing_enabled: true,
      doc_visibility_public: false,
      public_role: DocRole::None,
    }),
    DocRole::Manager
  );

  // Non-commercial Admin downgrades to Member -> does NOT inherit Manager.
  assert_eq!(
    resolve_effective_doc_role(DocRoleInput {
      workspace_role: Some(WorkspaceRole::Admin),
      commercial: false,
      explicit_user_role: Some(DocRole::Reader),
      member_default_role: DocRole::Manager,
      doc_sharing_enabled: true,
      doc_visibility_public: false,
      public_role: DocRole::None,
    }),
    DocRole::Reader
  );

  // Non-active member explicit grant capped at Editor and gated by doc_sharing_enabled.
  assert_eq!(
    resolve_effective_doc_role(DocRoleInput {
      workspace_role: None,
      commercial: true,
      explicit_user_role: Some(DocRole::Manager),
      member_default_role: DocRole::Manager,
      doc_sharing_enabled: true,
      doc_visibility_public: false,
      public_role: DocRole::None,
    }),
    DocRole::Editor
  );
  assert_eq!(
    resolve_effective_doc_role(DocRoleInput {
      workspace_role: None,
      commercial: true,
      explicit_user_role: Some(DocRole::Editor),
      member_default_role: DocRole::Manager,
      doc_sharing_enabled: false,
      doc_visibility_public: true,
      public_role: DocRole::Reader,
    }),
    DocRole::None
  );
}

#[test]
fn extracts_legacy_root_meta_pages_with_trash_flags() {
  let doc = y_octo::Doc::new();
  let mut meta = doc.get_or_create_map("meta").unwrap();
  let mut pages = doc.create_array().unwrap();

  let mut p1 = y_octo::AHashMap::new();
  p1.insert("id".to_owned(), y_octo::Any::String("page-live".to_owned()));
  pages.push(y_octo::Any::Object(Box::new(p1))).unwrap();

  let mut p2 = y_octo::AHashMap::new();
  p2.insert("id".to_owned(), y_octo::Any::String("page-trashed".to_owned()));
  p2.insert("trash".to_owned(), y_octo::Any::True);
  pages.push(y_octo::Any::Object(Box::new(p2))).unwrap();

  meta.insert("pages".to_owned(), pages).unwrap();
  let encoded = doc.encode_update_v1().unwrap();

  let extracted = extract_workspace_lifecycle_root_pages(&encoded).unwrap();
  assert_eq!(
    extracted,
    vec![
      LegacyRootPage {
        doc_id: "page-live".into(),
        trashed: false,
      },
      LegacyRootPage {
        doc_id: "page-trashed".into(),
        trashed: true,
      },
    ]
  );
}

fn push_varuint(buf: &mut Vec<u8>, mut v: u64) {
  while v >= 0x80 {
    buf.push(((v as u8) & 0x7f) | 0x80);
    v >>= 7;
  }
  buf.push(v as u8);
}

fn push_varstring(buf: &mut Vec<u8>, s: &str) {
  push_varuint(buf, s.len() as u64);
  buf.extend_from_slice(s.as_bytes());
}

/// Synthetic Yjs v1 update with a historical deleted zero-length `ContentString("")`
/// at the outer end of a `Y.Text` sequence, strictly covered by a delete range.
fn synthetic_deleted_zero_len_string_update(client: u64) -> Vec<u8> {
  let mut buf = Vec::new();
  push_varuint(&mut buf, 1); // 1 client
  push_varuint(&mut buf, 4); // 4 structs
  push_varuint(&mut buf, client);
  push_varuint(&mut buf, 0); // start clock = 0
  // Struct 0 (clock 0, len 1): ContentType(Y.Text, kind=2) under named root.
  buf.push(0x07);
  buf.push(0x01);
  push_varstring(&mut buf, "legacy_zero_str");
  push_varuint(&mut buf, 2);
  // Struct 1 (clock 1, len 1): ContentString("a") in Y.Text(client, 0).
  buf.push(0x04);
  buf.push(0x00);
  push_varuint(&mut buf, client);
  push_varuint(&mut buf, 0);
  push_varstring(&mut buf, "a");
  // Struct 2 (clock 2, len 0): ContentString("") with origin_left = (client, 1).
  buf.push(0x84);
  push_varuint(&mut buf, client);
  push_varuint(&mut buf, 1);
  push_varstring(&mut buf, "");
  // Struct 3 (clock 2, len 1): ContentString("b") in Y.Text(client, 0).
  buf.push(0x04);
  buf.push(0x00);
  push_varuint(&mut buf, client);
  push_varuint(&mut buf, 0);
  push_varstring(&mut buf, "b");
  // Delete set: [1, 3) strictly covers clock 2.
  push_varuint(&mut buf, 1);
  push_varuint(&mut buf, client);
  push_varuint(&mut buf, 1);
  push_varuint(&mut buf, 1);
  push_varuint(&mut buf, 2);
  buf
}

/// Synthetic Yjs v1 update with a Yjs re-encoded `ContentDeleted(0)`
/// at the outer end of a `Y.Text` sequence.
fn synthetic_zero_len_deleted_update(client: u64) -> Vec<u8> {
  let mut buf = Vec::new();
  push_varuint(&mut buf, 1); // 1 client
  push_varuint(&mut buf, 3); // 3 structs
  push_varuint(&mut buf, client);
  push_varuint(&mut buf, 0); // start clock = 0
  // Struct 0 (clock 0, len 1): ContentType(Y.Text, kind=2) under named root.
  buf.push(0x07);
  buf.push(0x01);
  push_varstring(&mut buf, "legacy_zero_del");
  push_varuint(&mut buf, 2);
  // Struct 1 (clock 1, len 1): ContentString("x") in Y.Text(client, 0).
  buf.push(0x04);
  buf.push(0x00);
  push_varuint(&mut buf, client);
  push_varuint(&mut buf, 0);
  push_varstring(&mut buf, "x");
  // Struct 2 (clock 2, len 0): ContentDeleted(0) with origin_left = (client, 1).
  buf.push(0x81);
  push_varuint(&mut buf, client);
  push_varuint(&mut buf, 1);
  push_varuint(&mut buf, 0);
  // Empty delete set.
  push_varuint(&mut buf, 0);
  buf
}

#[test]
fn lifecycle_root_pages_decode_empty_multi_increment_and_zero_len_deleted_frames() {
  // Empty docs.
  for empty in [&[][..], &[0u8][..], &[0u8, 0u8][..]] {
    assert!(extract_workspace_lifecycle_root_pages(empty).unwrap().is_empty());
  }

  // Base root doc snapshot.
  let doc = y_octo::Doc::with_client(101);
  let mut meta = doc.get_or_create_map("meta").unwrap();
  let mut pages = doc.create_array().unwrap();
  let mut p1 = y_octo::AHashMap::new();
  p1.insert("id".to_owned(), y_octo::Any::String("page-1".to_owned()));
  pages.push(y_octo::Any::Object(Box::new(p1))).unwrap();
  meta.insert("pages".to_owned(), pages).unwrap();
  let base_snap = doc.encode_update_v1().unwrap();
  let sv_after_base = doc.get_state_vector();

  // Incremental edit adding a second trashed page.
  let Some(y_octo::Value::Array(mut pages_arr)) = doc.get_map("meta").unwrap().get("pages") else {
    panic!("expected meta.pages array");
  };
  let mut p2 = y_octo::AHashMap::new();
  p2.insert("id".to_owned(), y_octo::Any::String("page-2".to_owned()));
  p2.insert("trash".to_owned(), y_octo::Any::True);
  pages_arr.push(y_octo::Any::Object(Box::new(p2))).unwrap();
  let incremental_edit = doc.encode_state_as_update_v1(&sv_after_base).unwrap();

  let zero_str = synthetic_deleted_zero_len_string_update(900_001);
  let zero_del = synthetic_zero_len_deleted_update(900_002);

  // Write-boundary validation strictly rejects new zero-length frames.
  assert!(matches!(
    validate_doc_update(&zero_str),
    Err(SyncError::DocUpdateInvalid(_))
  ));
  assert!(matches!(
    validate_doc_update(&zero_del),
    Err(SyncError::DocUpdateInvalid(_))
  ));

  // Historical zero-length frames already persisted in storage still merge and decode cleanly.
  let (merged, _sv) = merge_and_diff_doc(
    &[
      zero_str.as_slice(),
      zero_del.as_slice(),
      base_snap.as_slice(),
      incremental_edit.as_slice(),
    ],
    None,
  )
  .expect("merge_and_diff_doc must succeed with historical zero-len frames and incremental edit");
  validate_doc_update(&merged).expect("canonicalized merged update must validate");

  let extracted = extract_workspace_lifecycle_root_pages(&merged).unwrap();
  assert_eq!(
    extracted,
    vec![
      LegacyRootPage {
        doc_id: "page-1".into(),
        trashed: false,
      },
      LegacyRootPage {
        doc_id: "page-2".into(),
        trashed: true,
      },
    ]
  );

  // Cross-client update where c1 has complete meta.pages and c2 has a client clock gap:
  // ReadDoc returns IncompleteSnapshot, and Doc fallback recovers c1's entries.
  let doc_c1 = y_octo::DocOptions::new().with_client_id(1).build();
  let mut delta_meta = doc_c1.get_or_create_map("meta").unwrap();
  let mut delta_pages = doc_c1.create_array().unwrap();
  let mut delta_page = doc_c1.create_map().unwrap();
  delta_page
    .insert("id".to_owned(), y_octo::Any::String("delta-doc-1".into()))
    .unwrap();
  delta_page.insert("trash".to_owned(), y_octo::Any::True).unwrap();
  delta_pages.push(delta_page).unwrap();
  delta_meta.insert("pages".to_owned(), delta_pages).unwrap();

  let mut doc_c2 = y_octo::DocOptions::new().with_client_id(2).build();
  let mut c2_other = doc_c2.get_or_create_map("other").unwrap();
  c2_other
    .insert("a".to_owned(), y_octo::Any::String("first".into()))
    .unwrap();
  let sv_c2 = doc_c2.get_state_vector();
  c2_other
    .insert("b".to_owned(), y_octo::Any::String("second".into()))
    .unwrap();
  doc_c2
    .apply_update_from_binary_v1(doc_c1.encode_update_v1().unwrap())
    .unwrap();

  let delta_bin = doc_c2.encode_state_as_update_v1(&sv_c2).unwrap();
  assert!(matches!(
    y_octo::ReadDoc::from_full_update_v1_with_limits(delta_bin.clone(), y_octo::ReadLimits::default()),
    Err(y_octo::ReadError::IncompleteSnapshot(_))
  ));
  let delta_extracted = extract_workspace_lifecycle_root_pages(&delta_bin).unwrap();
  assert_eq!(
    delta_extracted,
    vec![LegacyRootPage {
      doc_id: "delta-doc-1".into(),
      trashed: true,
    }]
  );

  // Dedicated workspace lifecycle migration budget matches the 16M struct contract.
  assert_eq!(WORKSPACE_LIFECYCLE_MIGRATION_READ_LIMITS.max_structs, 16_000_000);
}

#[test]
fn validate_doc_update_blocks_cross_frame_zero_len_poisoning_while_reads_recover_legacy() {
  let client = 700_001u64;

  // Frame A: normal root Y.Text("text") update writing "a" (clock 0) then "b" (clock 1, origin_left = (client, 0)).
  let mut frame_a = Vec::new();
  push_varuint(&mut frame_a, 1); // 1 client
  push_varuint(&mut frame_a, 2); // 2 structs
  push_varuint(&mut frame_a, client);
  push_varuint(&mut frame_a, 0); // start clock 0
  frame_a.push(0x04); // Content::String, no origin/right_origin, has parent
  frame_a.push(0x01); // parent is named root
  push_varstring(&mut frame_a, "text");
  push_varstring(&mut frame_a, "a");
  frame_a.push(0x84); // HAS_ORIGIN | Content::String
  push_varuint(&mut frame_a, client);
  push_varuint(&mut frame_a, 0);
  push_varstring(&mut frame_a, "b");
  push_varuint(&mut frame_a, 0); // empty delete set

  // Frame B: attacker's incremental zero-length ContentDeleted(0) frame reusing client
  // with start_clock = 1 and origin_left = (client, 0). Passes y_octo::validate_update_v1
  // alone, but poisons merge_updates_v1([frame_a, frame_b]).
  let mut frame_b = Vec::new();
  push_varuint(&mut frame_b, 1); // 1 client
  push_varuint(&mut frame_b, 1); // 1 struct
  push_varuint(&mut frame_b, client);
  push_varuint(&mut frame_b, 1); // start clock 1
  frame_b.push(0x81); // HAS_ORIGIN | Content::Deleted
  push_varuint(&mut frame_b, client);
  push_varuint(&mut frame_b, 0);
  push_varuint(&mut frame_b, 0); // deleted len = 0
  push_varuint(&mut frame_b, 0); // empty delete set

  // Direct merge_updates_v1 across Frame A + Frame B fails with zero-length struct.
  let merge_err = y_octo::merge_updates_v1([frame_a.as_slice(), frame_b.as_slice()]).unwrap_err();
  assert!(
    merge_err.to_string().contains("zero-length struct"),
    "expected zero-length struct merge failure, got: {merge_err}"
  );

  // Push write boundary accepts normal Frame A and strictly rejects zero-length Frame B.
  validate_doc_update(&frame_a).expect("normal frame must pass validate_doc_update");
  assert!(matches!(
    validate_doc_update(&frame_b),
    Err(SyncError::DocUpdateInvalid(ref msg)) if msg.contains("zero-length struct")
  ));

  // Existing historical zero-length data remains readable via merge_and_diff_doc, Doc, and ReadDoc.
  let legacy_zero = synthetic_zero_len_deleted_update(client + 1);
  assert!(matches!(
    validate_doc_update(&legacy_zero),
    Err(SyncError::DocUpdateInvalid(_))
  ));
  let (merged, _sv) = merge_and_diff_doc(&[legacy_zero.as_slice(), frame_a.as_slice()], None)
    .expect("historical zero-length data must remain readable alongside normal updates");
  let doc = y_octo::Doc::try_from_binary_v1(&merged).expect("decode recovered legacy + normal frame");
  assert_eq!(doc.get_or_create_text("text").unwrap().to_string(), "ab");
  let read_doc =
    y_octo::ReadDoc::from_full_update_v1(merged).expect("ReadDoc must decode recovered legacy + normal frame");
  assert_eq!(read_doc.text("text").unwrap().to_string(), "ab");
}
