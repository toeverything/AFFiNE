//! Canonical workspace and per-document ACL, reserved-document classification,
//! and 20/21-key permission matrices aligned 1:1 with `affine_core 0.0.14`
//! (`access_control/permission.rs`) and `v0.27.5` `permission/{store,authorizer}.rs`.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use server_spi::QuotaGate;
use server_types::DomainError;
use sqlx::{Postgres, Transaction};

use crate::workspaces::{EffectiveWorkspaceRole, WorkspaceRole};

/// Classification of a workspace document identifier into ordinary, root,
/// workspace-shared system doc, user-private reserved doc, or invalid.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReservedDocClass<'a> {
  Ordinary,
  WorkspaceRoot,
  WorkspaceSystem,
  UserPrivate { owner_id: &'a str },
  Invalid,
}

const WORKSPACE_SYSTEM_TABLES: [&str; 5] = [
  "folders",
  "docProperties",
  "docCustomPropertyInfo",
  "pinnedCollections",
  "explorerIcon",
];

const USERDATA_TABLES: [&str; 3] = ["favorite", "settings", "docIntegrationRef"];

/// Classifies `doc_id` within `workspace_id`.
///
/// - `doc_id == workspace_id` is [`ReservedDocClass::WorkspaceRoot`].
/// - `db$<workspace_id>$<known_table>` is [`ReservedDocClass::WorkspaceSystem`]
///   (shared across workspace members, NOT private to one user).
/// - `userdata$<uid>$<workspace_id>$<known_table>` is
///   [`ReservedDocClass::UserPrivate`] owned by `<uid>`.
/// - Any other `db$*` (including `db$<other_uid>$...`) or malformed
///   `userdata$*` identifier is [`ReservedDocClass::Invalid`].
pub fn classify_reserved_doc<'a>(workspace_id: &str, doc_id: &'a str) -> ReservedDocClass<'a> {
  if doc_id == workspace_id {
    return ReservedDocClass::WorkspaceRoot;
  }
  if let Some(rest) = doc_id.strip_prefix("db$") {
    let Some((scope_id, table)) = rest.split_once('$') else {
      return ReservedDocClass::Invalid;
    };
    if scope_id == workspace_id && WORKSPACE_SYSTEM_TABLES.contains(&table) {
      return ReservedDocClass::WorkspaceSystem;
    }
    return ReservedDocClass::Invalid;
  }
  if let Some(rest) = doc_id.strip_prefix("userdata$") {
    let mut parts = rest.split('$');
    let (Some(owner_id), Some(ws), Some(table), None) = (parts.next(), parts.next(), parts.next(), parts.next()) else {
      return ReservedDocClass::Invalid;
    };
    if owner_id.is_empty() || owner_id == "__local__" || ws != workspace_id || !USERDATA_TABLES.contains(&table) {
      return ReservedDocClass::Invalid;
    }
    return ReservedDocClass::UserPrivate { owner_id };
  }
  ReservedDocClass::Ordinary
}

/// Returns `true` when `actor_user_id` is permitted to access `doc_id` at the
/// reserved-document boundary (before role/policy checks).
pub fn authorize_reserved_doc(workspace_id: &str, doc_id: &str, actor_user_id: Option<&str>) -> bool {
  match classify_reserved_doc(workspace_id, doc_id) {
    ReservedDocClass::Ordinary | ReservedDocClass::WorkspaceRoot | ReservedDocClass::WorkspaceSystem => true,
    ReservedDocClass::UserPrivate { owner_id } => actor_user_id == Some(owner_id),
    ReservedDocClass::Invalid => false,
  }
}

/// All 20 `v0.27.5` `WorkspacePermissions` action flags (single source of truth
/// for GraphQL `WorkspacePermissions` and SocketIO `workspace.access.get`).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct WorkspacePermissionsView {
  pub role: EffectiveWorkspaceRole,
  pub administrators_manage: bool,
  pub blobs_manage: bool,
  pub blobs_upload: bool,
  pub copilot: bool,
  pub create_doc: bool,
  pub delete: bool,
  pub organize_read: bool,
  pub payment_manage: bool,
  pub preview: bool,
  pub properties_create: bool,
  pub properties_delete: bool,
  pub properties_read: bool,
  pub properties_update: bool,
  pub read: bool,
  pub settings_read: bool,
  pub settings_update: bool,
  pub sync: bool,
  pub transfer_owner: bool,
  pub users_manage: bool,
  pub users_read: bool,
}

impl WorkspacePermissionsView {
  /// Evaluates all 20 workspace permissions 1:1 with `affine_core 0.0.14`
  /// `access_control/permission.rs:95-115`:
  /// - `Read`, `OrganizeRead`, `PropertiesRead`, `Preview`: `External` (active member or public workspace)
  /// - `Sync`, `CreateDoc`, `UsersRead`, `SettingsRead`, `BlobsUpload`, `Copilot`: `>= Member`
  /// - `UsersManage`, `SettingsUpdate`, `PropertiesCreate`, `PropertiesUpdate`, `PropertiesDelete`, `BlobsManage`: `>= Admin`
  /// - `AdministratorsManage`: `>= Admin && commercial`
  /// - `Delete`, `TransferOwner`, `PaymentManage`: `Owner`
  pub fn for_role(
    role: Option<WorkspaceRole>,
    commercial: bool,
    workspace_public: bool,
    sharing_enabled: bool,
    url_preview_enabled: bool,
  ) -> Self {
    let eff = role.map(|r| r.effective(commercial));
    let effective_role = match eff {
      Some(WorkspaceRole::Owner) => EffectiveWorkspaceRole::Owner,
      Some(WorkspaceRole::Admin) => EffectiveWorkspaceRole::Admin,
      Some(WorkspaceRole::Member) => EffectiveWorkspaceRole::Collaborator,
      None => EffectiveWorkspaceRole::External,
    };
    let is_owner = effective_role == EffectiveWorkspaceRole::Owner;
    let is_admin_or_owner = matches!(
      effective_role,
      EffectiveWorkspaceRole::Owner | EffectiveWorkspaceRole::Admin
    );
    let is_member = effective_role != EffectiveWorkspaceRole::External;
    let public_external = workspace_public && sharing_enabled;
    let can_read = is_member || public_external;
    let preview = sharing_enabled && (workspace_public || url_preview_enabled);
    Self {
      role: effective_role,
      administrators_manage: is_admin_or_owner && commercial,
      blobs_manage: is_admin_or_owner,
      blobs_upload: is_member,
      copilot: is_member,
      create_doc: is_member,
      delete: is_owner,
      organize_read: can_read,
      payment_manage: is_owner,
      preview,
      properties_create: is_admin_or_owner,
      properties_delete: is_admin_or_owner,
      properties_read: can_read,
      properties_update: is_admin_or_owner,
      read: can_read,
      settings_read: is_member,
      settings_update: is_admin_or_owner,
      sync: is_member,
      transfer_owner: is_owner,
      users_manage: is_admin_or_owner,
      users_read: is_member,
    }
  }

  /// Serializes the exact SocketIO `workspace.access.get` payload (`role`, 20-key `permissions`, `team`).
  pub fn to_realtime_access_json(&self, is_team: bool) -> serde_json::Value {
    let role_name = match self.role {
      EffectiveWorkspaceRole::Owner => "Owner",
      EffectiveWorkspaceRole::Admin => "Admin",
      EffectiveWorkspaceRole::Collaborator => "Collaborator",
      EffectiveWorkspaceRole::External => "External",
    };
    serde_json::json!({
      "role": role_name,
      "permissions": {
        "Workspace_Administrators_Manage": self.administrators_manage,
        "Workspace_Blobs_Manage": self.blobs_manage,
        "Workspace_Blobs_Upload": self.blobs_upload,
        "Workspace_Copilot": self.copilot,
        "Workspace_CreateDoc": self.create_doc,
        "Workspace_Delete": self.delete,
        "Workspace_Organize_Read": self.organize_read,
        "Workspace_Payment_Manage": self.payment_manage,
        "Workspace_Preview": self.preview,
        "Workspace_Properties_Create": self.properties_create,
        "Workspace_Properties_Delete": self.properties_delete,
        "Workspace_Properties_Read": self.properties_read,
        "Workspace_Properties_Update": self.properties_update,
        "Workspace_Read": self.read,
        "Workspace_Settings_Read": self.settings_read,
        "Workspace_Settings_Update": self.settings_update,
        "Workspace_Sync": self.sync,
        "Workspace_TransferOwner": self.transfer_owner,
        "Workspace_Users_Manage": self.users_manage,
        "Workspace_Users_Read": self.users_read,
      },
      "team": is_team,
    })
  }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub enum DocRole {
  None = 0,
  External = 1,
  Reader = 2,
  Commenter = 3,
  Editor = 4,
  Manager = 5,
  Owner = 6,
}

impl DocRole {
  pub const fn as_str(self) -> &'static str {
    match self {
      Self::None => "none",
      Self::External => "external",
      Self::Reader => "reader",
      Self::Commenter => "commenter",
      Self::Editor => "editor",
      Self::Manager => "manager",
      Self::Owner => "owner",
    }
  }

  pub fn parse(s: &str) -> Self {
    match s.to_ascii_lowercase().as_str() {
      "owner" => Self::Owner,
      "manager" => Self::Manager,
      "editor" => Self::Editor,
      "commenter" => Self::Commenter,
      "reader" => Self::Reader,
      "external" => Self::External,
      _ => Self::None,
    }
  }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DocRoleInput {
  pub workspace_role: Option<WorkspaceRole>,
  pub commercial: bool,
  pub explicit_user_role: Option<DocRole>,
  pub member_default_role: DocRole,
  pub doc_sharing_enabled: bool,
  pub doc_visibility_public: bool,
  pub public_role: DocRole,
}

/// Evaluates effective `DocRole` 1:1 with `affine_core 0.0.14`
/// `access_control/permission.rs:117-150`.
pub fn resolve_effective_doc_role(input: DocRoleInput) -> DocRole {
  let effective_ws = input.workspace_role.map(|r| r.effective(input.commercial));
  let active_member = effective_ws.is_some();

  let mut best = DocRole::None;
  let inherited = match effective_ws {
    Some(WorkspaceRole::Owner) => DocRole::Owner,
    Some(WorkspaceRole::Admin) => DocRole::Manager,
    _ => DocRole::None,
  };
  if inherited > best {
    best = inherited;
  }

  match input.explicit_user_role {
    Some(r) if r != DocRole::None => {
      let effective_grant = if active_member { r } else { r.min(DocRole::Editor) };
      if (active_member || input.doc_sharing_enabled) && effective_grant > best {
        best = effective_grant;
      }
    }
    _ => {
      if active_member && input.member_default_role != DocRole::None && input.member_default_role > best {
        best = input.member_default_role;
      }
    }
  }

  if input.doc_sharing_enabled
    && input.doc_visibility_public
    && input.public_role != DocRole::None
    && input.public_role > best
  {
    best = input.public_role;
  }

  best
}

/// All 21 `v0.27.5` `DocPermissions` action flags (1:1 with `affine_core 0.0.14`
/// `access_control/permission.rs:152-229`).
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct DocPermissionsView {
  pub doc_analytics_read: bool,
  pub doc_analytics_viewers_read: bool,
  pub doc_comments_create: bool,
  pub doc_comments_moderate: bool,
  pub doc_comments_read: bool,
  pub doc_copy: bool,
  pub doc_delete: bool,
  pub doc_duplicate: bool,
  pub doc_history_read: bool,
  pub doc_preview: bool,
  pub doc_properties_read: bool,
  pub doc_properties_update: bool,
  pub doc_publish: bool,
  pub doc_read: bool,
  pub doc_restore: bool,
  pub doc_transfer_owner: bool,
  pub doc_trash: bool,
  pub doc_unpublish: bool,
  pub doc_update: bool,
  pub doc_users_manage: bool,
  pub doc_users_read: bool,
}

impl DocPermissionsView {
  #[allow(clippy::too_many_arguments)]
  pub fn evaluate(
    assigned_ws_role: Option<WorkspaceRole>,
    effective_doc_role: DocRole,
    commercial: bool,
    sharing_enabled: bool,
    doc_public: bool,
    public_role: Option<DocRole>,
    doc_url_preview_enabled: bool,
    ws_url_preview_enabled: bool,
  ) -> Self {
    let active_member = assigned_ws_role.is_some();
    let doc_read = effective_doc_role >= DocRole::External;
    let privileged_ws = active_member && matches!(assigned_ws_role, Some(WorkspaceRole::Admin | WorkspaceRole::Owner));
    let doc_preview = sharing_enabled
      && ((doc_public && public_role == Some(DocRole::External)) || doc_url_preview_enabled || ws_url_preview_enabled);
    Self {
      doc_analytics_read: active_member && commercial && effective_doc_role >= DocRole::Editor,
      doc_analytics_viewers_read: privileged_ws && commercial && doc_read,
      doc_comments_create: effective_doc_role >= DocRole::Commenter,
      doc_comments_moderate: effective_doc_role >= DocRole::Editor,
      doc_comments_read: doc_read,
      doc_copy: doc_read,
      doc_delete: effective_doc_role >= DocRole::Manager,
      doc_duplicate: effective_doc_role >= DocRole::Reader,
      doc_history_read: active_member && effective_doc_role >= DocRole::Reader,
      doc_preview,
      doc_properties_read: doc_read,
      doc_properties_update: effective_doc_role >= DocRole::Editor,
      doc_publish: sharing_enabled && effective_doc_role >= DocRole::Manager,
      doc_read,
      doc_restore: effective_doc_role >= DocRole::Manager,
      doc_transfer_owner: effective_doc_role >= DocRole::Owner,
      doc_trash: effective_doc_role >= DocRole::Manager,
      doc_unpublish: effective_doc_role >= DocRole::Manager,
      doc_update: effective_doc_role >= DocRole::Editor,
      doc_users_manage: effective_doc_role >= DocRole::Manager,
      doc_users_read: effective_doc_role >= DocRole::Reader,
    }
  }
}

#[derive(Clone, Debug)]
pub struct DocAccessEntry {
  pub requested_doc_id: String,
  pub storage_doc_id: String,
  pub deleted: bool,
  pub public: bool,
  pub publish_mode: &'static str,
  pub effective_role: DocRole,
  pub permissions: DocPermissionsView,
}

#[derive(Clone, Debug)]
pub struct WorkspaceDocsAccessSnapshot {
  pub workspace_public: bool,
  pub sharing_enabled: bool,
  pub url_preview_enabled: bool,
  pub commercial: bool,
  pub is_team: bool,
  pub assigned_role: Option<WorkspaceRole>,
  pub workspace_permissions: WorkspacePermissionsView,
  pub docs: HashMap<String, DocAccessEntry>,
}

/// Loads workspace & batch per-document ACL facts in a single transaction,
/// evaluating reserved-doc boundaries, `workspace_pages` alias/deleted/publish
/// metadata, `doc_access_policies`, `doc_grants`, and `QuotaGate`.
pub async fn load_workspace_docs_access_in(
  tx: &mut Transaction<'_, Postgres>,
  quota_gate: &dyn QuotaGate,
  workspace_id: &str,
  actor_user_id: Option<&str>,
  doc_ids: &[String],
  now: DateTime<Utc>,
) -> Result<WorkspaceDocsAccessSnapshot, DomainError> {
  let ws_row: Option<(bool, bool, bool, String)> = sqlx::query_as(
    r#"SELECT COALESCE(p.visibility = 'public', false) AS ws_public,
              COALESCE(p.sharing_enabled, true) AS sharing_enabled,
              COALESCE(p.url_preview_enabled, false) AS url_preview_enabled,
              COALESCE(p.member_default_doc_role, 'manager') AS member_default_doc_role
       FROM workspaces w
       LEFT JOIN workspace_access_policies p ON p.workspace_id = w.id
       WHERE w.id = $1"#,
  )
  .bind(workspace_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("load workspace acl policy: {e}")))?;

  let Some((workspace_public, sharing_enabled, ws_url_preview_enabled, ws_member_default_str)) = ws_row else {
    return Err(DomainError::NotFound(format!("workspace {workspace_id} not found")));
  };
  let ws_member_default = DocRole::parse(&ws_member_default_str);

  let assigned_role = if let Some(uid) = actor_user_id {
    let role_str: Option<String> = sqlx::query_scalar(
      "SELECT role::text FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND state = 'active' LIMIT 1",
    )
    .bind(workspace_id)
    .bind(uid)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("load workspace member acl role: {e}")))?;
    role_str.as_deref().map(WorkspaceRole::parse).transpose()?
  } else {
    None
  };

  let grant = quota_gate.resolve_workspace_grant(tx, workspace_id, now).await?;
  let commercial = grant.rights.commercial;
  let is_team = grant.billing_subject == server_types::BillingSubject::Workspace;
  let workspace_permissions = WorkspacePermissionsView::for_role(
    assigned_role,
    commercial,
    workspace_public,
    sharing_enabled,
    ws_url_preview_enabled,
  );

  let mut docs = HashMap::with_capacity(doc_ids.len());
  if doc_ids.is_empty() {
    return Ok(WorkspaceDocsAccessSnapshot {
      workspace_public,
      sharing_enabled,
      url_preview_enabled: ws_url_preview_enabled,
      commercial,
      is_team,
      assigned_role,
      workspace_permissions,
      docs,
    });
  }

  // Batch-load workspace_pages metadata.
  type PageRow = (String, bool, bool, i16);
  let page_rows: Vec<PageRow> = sqlx::query_as(
    r#"SELECT page_id,
              COALESCE(lifecycle_state::text = 'deleted', false) AS is_deleted,
              (published_at IS NOT NULL) AS page_published,
              mode
       FROM workspace_pages
       WHERE workspace_id = $1
         AND page_id = ANY($2)"#,
  )
  .bind(workspace_id)
  .bind(doc_ids)
  .fetch_all(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("load workspace_pages acl rows: {e}")))?;

  let mut page_by_req: HashMap<String, (String, bool, bool, i16)> = HashMap::with_capacity(page_rows.len());
  let lookup_ids: Vec<String> = doc_ids.to_vec();
  for (page_id, deleted, page_published, mode) in page_rows {
    page_by_req.insert(page_id.clone(), (page_id, deleted, page_published, mode));
  }

  // Batch-load doc_access_policies.
  type DocPolicyRow = (String, Option<String>, String, bool, Option<String>, Option<bool>);
  let policy_rows: Vec<DocPolicyRow> = sqlx::query_as(
    r#"SELECT doc_id,
              member_default_role,
              visibility,
              (published_at IS NOT NULL) AS policy_published,
              public_role,
              url_preview_enabled
       FROM doc_access_policies
       WHERE workspace_id = $1 AND doc_id = ANY($2)"#,
  )
  .bind(workspace_id)
  .bind(&lookup_ids)
  .fetch_all(&mut **tx)
  .await
  .map_err(|e| DomainError::Internal(format!("load doc_access_policies acl rows: {e}")))?;

  #[derive(Clone, Copy)]
  struct DocPolicyFacts {
    member_default: Option<DocRole>,
    vis_public: bool,
    policy_published: bool,
    public_role: DocRole,
    url_preview: Option<bool>,
  }

  let mut policy_map: HashMap<String, DocPolicyFacts> = HashMap::with_capacity(policy_rows.len());
  for (doc_id, member_default, visibility, policy_published, public_role, url_preview) in policy_rows {
    policy_map.insert(
      doc_id,
      DocPolicyFacts {
        member_default: member_default.as_deref().map(DocRole::parse),
        vis_public: visibility == "public",
        policy_published,
        public_role: public_role.as_deref().map(DocRole::parse).unwrap_or(DocRole::None),
        url_preview,
      },
    );
  }

  // Batch-load explicit user doc_grants.
  let grant_map: HashMap<String, DocRole> = if let Some(uid) = actor_user_id {
    sqlx::query_as::<_, (String, String)>(
      "SELECT doc_id, role::text
       FROM doc_grants
       WHERE workspace_id = $1 AND principal_type = 'user' AND principal_id = $2 AND doc_id = ANY($3)",
    )
    .bind(workspace_id)
    .bind(uid)
    .bind(&lookup_ids)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("load doc_grants acl rows: {e}")))?
    .into_iter()
    .map(|(doc_id, role)| (doc_id, DocRole::parse(&role)))
    .collect()
  } else {
    HashMap::new()
  };

  for req_doc_id in doc_ids {
    let (storage_doc_id, deleted, page_published, mode) = page_by_req
      .get(req_doc_id)
      .cloned()
      .unwrap_or_else(|| (req_doc_id.clone(), false, false, 0));

    let publish_mode = if mode == 1 { "edgeless" } else { "page" };

    if deleted || !authorize_reserved_doc(workspace_id, &storage_doc_id, actor_user_id) {
      docs.insert(
        req_doc_id.clone(),
        DocAccessEntry {
          requested_doc_id: req_doc_id.clone(),
          storage_doc_id,
          deleted,
          public: false,
          publish_mode,
          effective_role: DocRole::None,
          permissions: DocPermissionsView::default(),
        },
      );
      continue;
    }

    let policy_facts = policy_map
      .get(&storage_doc_id)
      .or_else(|| policy_map.get(req_doc_id))
      .copied()
      .unwrap_or(DocPolicyFacts {
        member_default: None,
        vis_public: false,
        policy_published: false,
        public_role: DocRole::None,
        url_preview: None,
      });
    let (doc_member_default, vis_public, policy_published, raw_public_role, doc_url_preview) = (
      policy_facts.member_default,
      policy_facts.vis_public,
      policy_facts.policy_published,
      policy_facts.public_role,
      policy_facts.url_preview,
    );

    let is_public_doc = vis_public && policy_published && page_published;
    let effective_public_role = if is_public_doc { raw_public_role } else { DocRole::None };
    let member_default_role = doc_member_default.unwrap_or(ws_member_default);
    let explicit_user_role = grant_map
      .get(&storage_doc_id)
      .or_else(|| grant_map.get(req_doc_id))
      .copied();

    let effective_role = if storage_doc_id == workspace_id {
      if workspace_permissions.read {
        match assigned_role.map(|r| r.effective(commercial)) {
          Some(WorkspaceRole::Owner) => DocRole::Owner,
          Some(WorkspaceRole::Admin) => DocRole::Manager,
          Some(WorkspaceRole::Member) => DocRole::Editor,
          None => DocRole::External,
        }
      } else {
        DocRole::None
      }
    } else {
      resolve_effective_doc_role(DocRoleInput {
        workspace_role: assigned_role,
        commercial,
        explicit_user_role,
        member_default_role,
        doc_sharing_enabled: sharing_enabled,
        doc_visibility_public: is_public_doc,
        public_role: effective_public_role,
      })
    };

    let permissions = DocPermissionsView::evaluate(
      assigned_role,
      effective_role,
      commercial,
      sharing_enabled,
      is_public_doc,
      (effective_public_role != DocRole::None).then_some(effective_public_role),
      doc_url_preview.unwrap_or(false),
      ws_url_preview_enabled,
    );

    docs.insert(
      req_doc_id.clone(),
      DocAccessEntry {
        requested_doc_id: req_doc_id.clone(),
        storage_doc_id,
        deleted: false,
        public: is_public_doc,
        publish_mode,
        effective_role,
        permissions,
      },
    );
  }

  Ok(WorkspaceDocsAccessSnapshot {
    workspace_public,
    sharing_enabled,
    url_preview_enabled: ws_url_preview_enabled,
    commercial,
    is_team,
    assigned_role,
    workspace_permissions,
    docs,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn reserved_doc_classification_and_authorization() {
    let ws = "ws-123";
    assert_eq!(classify_reserved_doc(ws, ws), ReservedDocClass::WorkspaceRoot);
    assert_eq!(
      classify_reserved_doc(ws, "db$ws-123$folders"),
      ReservedDocClass::WorkspaceSystem
    );
    assert_eq!(
      classify_reserved_doc(ws, "db$ws-123$docProperties"),
      ReservedDocClass::WorkspaceSystem
    );
    assert_eq!(
      classify_reserved_doc(ws, "db$ws-123$unknown"),
      ReservedDocClass::Invalid
    );
    assert_eq!(
      classify_reserved_doc(ws, "db$user-9$folders"),
      ReservedDocClass::Invalid
    );
    assert_eq!(
      classify_reserved_doc(ws, "userdata$user-9$ws-123$settings"),
      ReservedDocClass::UserPrivate { owner_id: "user-9" }
    );
    assert_eq!(
      classify_reserved_doc(ws, "userdata$__local__$ws-123$settings"),
      ReservedDocClass::Invalid
    );
    assert_eq!(classify_reserved_doc(ws, "ordinary-page-1"), ReservedDocClass::Ordinary);

    // Workspace shared system doc is allowed for any member/actor.
    assert!(authorize_reserved_doc(ws, "db$ws-123$folders", Some("member-1")));
    assert!(authorize_reserved_doc(ws, "db$ws-123$folders", None));

    // Foreign-scoped db$ is always invalid (even if scope matches actor_user_id).
    assert!(!authorize_reserved_doc(ws, "db$user-9$folders", Some("user-9")));
    assert!(!authorize_reserved_doc(ws, "db$user-9$folders", Some("other-user")));
    assert!(!authorize_reserved_doc(ws, "db$user-9$folders", None));

    // User-private reserved docs are allowed ONLY for the owner, never for other members or anonymous.
    assert!(authorize_reserved_doc(
      ws,
      "userdata$user-9$ws-123$settings",
      Some("user-9")
    ));
    assert!(!authorize_reserved_doc(
      ws,
      "userdata$user-9$ws-123$settings",
      Some("other-user")
    ));
    assert!(!authorize_reserved_doc(ws, "userdata$user-9$ws-123$settings", None));
  }

  #[test]
  fn workspace_permissions_matrix_matches_affine_core_1_to_1() {
    // Explicit literal expectation table:
    // (role, commercial, public, sharing, url_preview)
    //   -> (read, preview, sync, props_create, admin_manage, delete)
    #[allow(clippy::type_complexity)]
    let cases: &[(
      (Option<WorkspaceRole>, bool, bool, bool, bool),
      (bool, bool, bool, bool, bool, bool),
    )] = &[
      // External on private workspace
      (
        (None, false, false, true, false),
        (false, false, false, false, false, false),
      ),
      // External on private workspace with url_preview + sharing enabled -> preview true, read false
      (
        (None, false, false, true, true),
        (false, true, false, false, false, false),
      ),
      // External on public workspace with sharing enabled -> read & preview true
      (
        (None, false, true, true, false),
        (true, true, false, false, false, false),
      ),
      // External on public workspace with sharing DISABLED -> read & preview MUST be false!
      (
        (None, false, true, false, true),
        (false, false, false, false, false, false),
      ),
      // Member on private workspace with sharing disabled -> read & sync true, preview false
      (
        (Some(WorkspaceRole::Member), false, false, false, true),
        (true, false, true, false, false, false),
      ),
      // Member on private workspace with sharing + url_preview -> read, preview, sync true
      (
        (Some(WorkspaceRole::Member), false, false, true, true),
        (true, true, true, false, false, false),
      ),
      // Admin on non-commercial workspace -> downgraded to Member (props_create & admin_manage false)
      (
        (Some(WorkspaceRole::Admin), false, false, true, false),
        (true, false, true, false, false, false),
      ),
      // Admin on commercial workspace -> props_create & admin_manage true, delete false
      (
        (Some(WorkspaceRole::Admin), true, false, true, false),
        (true, false, true, true, true, false),
      ),
      // Owner on non-commercial workspace -> props_create & delete true, admin_manage false
      (
        (Some(WorkspaceRole::Owner), false, false, true, false),
        (true, false, true, true, false, true),
      ),
      // Owner on commercial workspace -> all true (except preview when private + url_preview=false)
      (
        (Some(WorkspaceRole::Owner), true, false, true, false),
        (true, false, true, true, true, true),
      ),
      // Owner on public commercial workspace with sharing=true -> preview true too
      (
        (Some(WorkspaceRole::Owner), true, true, true, false),
        (true, true, true, true, true, true),
      ),
    ];

    for &(
      (role, commercial, ws_public, sharing, url_preview),
      (read, preview, sync, props_create, admin_manage, delete),
    ) in cases
    {
      let p = WorkspacePermissionsView::for_role(role, commercial, ws_public, sharing, url_preview);
      assert_eq!(
        p.read, read,
        "case=({role:?},{commercial},{ws_public},{sharing},{url_preview}) read"
      );
      assert_eq!(p.organize_read, read);
      assert_eq!(p.properties_read, read);
      assert_eq!(
        p.preview, preview,
        "case=({role:?},{commercial},{ws_public},{sharing},{url_preview}) preview"
      );
      assert_eq!(p.sync, sync);
      assert_eq!(p.create_doc, sync);
      assert_eq!(p.users_read, sync);
      assert_eq!(p.settings_read, sync);
      assert_eq!(p.blobs_upload, sync);
      assert_eq!(p.copilot, sync);
      assert_eq!(p.properties_create, props_create);
      assert_eq!(p.properties_update, props_create);
      assert_eq!(p.properties_delete, props_create);
      assert_eq!(p.users_manage, props_create);
      assert_eq!(p.settings_update, props_create);
      assert_eq!(p.blobs_manage, props_create);
      assert_eq!(p.administrators_manage, admin_manage);
      assert_eq!(p.delete, delete);
      assert_eq!(p.transfer_owner, delete);
      assert_eq!(p.payment_manage, delete);

      let json = p.to_realtime_access_json(commercial);
      assert_eq!(json["permissions"].as_object().unwrap().len(), 20);
    }
  }

  #[test]
  fn doc_permissions_respects_public_anonymous_member_default_none_and_history_read() {
    // Anonymous reading a published public doc in a private workspace gets Doc.Read + Doc.Preview, NOT HistoryRead.
    let role = resolve_effective_doc_role(DocRoleInput {
      workspace_role: None,
      commercial: false,
      explicit_user_role: None,
      member_default_role: DocRole::None,
      doc_sharing_enabled: true,
      doc_visibility_public: true,
      public_role: DocRole::External,
    });
    assert_eq!(role, DocRole::External);
    let perms = DocPermissionsView::evaluate(None, role, false, true, true, Some(DocRole::External), false, false);
    assert!(perms.doc_read);
    assert!(perms.doc_preview);
    assert!(!perms.doc_history_read);
    assert!(!perms.doc_update);

    // Public doc with sharing disabled -> preview is false.
    let no_share = DocPermissionsView::evaluate(
      None,
      DocRole::None,
      false,
      false,
      true,
      Some(DocRole::External),
      true,
      true,
    );
    assert!(!no_share.doc_preview);

    // Active member with member_default_role = None and no explicit grant is denied Doc.Read.
    let denied_role = resolve_effective_doc_role(DocRoleInput {
      workspace_role: Some(WorkspaceRole::Member),
      commercial: false,
      explicit_user_role: None,
      member_default_role: DocRole::None,
      doc_sharing_enabled: true,
      doc_visibility_public: false,
      public_role: DocRole::None,
    });
    assert_eq!(denied_role, DocRole::None);
    let denied_perms = DocPermissionsView::evaluate(
      Some(WorkspaceRole::Member),
      denied_role,
      false,
      true,
      false,
      None,
      false,
      false,
    );
    assert!(!denied_perms.doc_read);
    assert!(!denied_perms.doc_preview);
    assert!(!denied_perms.doc_history_read);
  }
}
