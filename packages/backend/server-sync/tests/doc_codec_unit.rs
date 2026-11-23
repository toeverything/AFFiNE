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
  storage::{LegacyRootPage, extract_workspace_lifecycle_root_pages, merge_and_diff_doc, validate_doc_update},
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
