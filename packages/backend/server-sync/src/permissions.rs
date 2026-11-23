//! Role and action permission matrix aligned with `affine_core::access_control::permission`
//! for workspace and document authorization without depending on `affine_core`.

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub enum WorkspaceRole {
  External = 0,
  Member = 1,
  Admin = 2,
  Owner = 3,
}

impl WorkspaceRole {
  pub fn parse(s: &str) -> Option<Self> {
    match s.to_ascii_lowercase().as_str() {
      "owner" => Some(Self::Owner),
      "admin" => Some(Self::Admin),
      "member" => Some(Self::Member),
      "external" => Some(Self::External),
      _ => None,
    }
  }

  /// Non-commercial workspaces downgrade `Admin` to `Member` (1:1 with `permission.rs`).
  pub const fn effective(self, commercial: bool) -> Self {
    if !commercial && matches!(self, Self::Admin) {
      Self::Member
    } else {
      self
    }
  }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum WorkspaceAction {
  Read,
  OrganizeRead,
  PropertiesRead,
  Sync,
  CreateDoc,
  Update,
  UsersManage,
  SettingsUpdate,
  Delete,
  BillingManage,
}

pub fn workspace_role_allows(role: Option<WorkspaceRole>, commercial: bool, action: WorkspaceAction) -> bool {
  let effective = role.map(|r| r.effective(commercial));
  match action {
    WorkspaceAction::Read | WorkspaceAction::OrganizeRead | WorkspaceAction::PropertiesRead => effective.is_some(),
    WorkspaceAction::Sync | WorkspaceAction::CreateDoc | WorkspaceAction::Update => {
      effective.is_some_and(|r| r >= WorkspaceRole::Member)
    }
    WorkspaceAction::UsersManage | WorkspaceAction::SettingsUpdate => {
      effective.is_some_and(|r| r >= WorkspaceRole::Admin)
    }
    WorkspaceAction::Delete | WorkspaceAction::BillingManage => effective == Some(WorkspaceRole::Owner),
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

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum DocAction {
  Read,
  Comment,
  Update,
  Trash,
  Restore,
  Delete,
  Publish,
  Unpublish,
  UsersManage,
}

pub const ALL_DOC_ACTIONS: [DocAction; 9] = [
  DocAction::Read,
  DocAction::Comment,
  DocAction::Update,
  DocAction::Trash,
  DocAction::Restore,
  DocAction::Delete,
  DocAction::Publish,
  DocAction::Unpublish,
  DocAction::UsersManage,
];

/// Exact 1:1 `doc_role_allows` matrix:
/// - `Read`: `>= External`
/// - `Comment`: `>= Commenter`
/// - `Update`: `>= Editor`
/// - `Trash | Restore | Delete | Publish | Unpublish | UsersManage`: `>= Manager`
pub const fn doc_role_allows(role: DocRole, action: DocAction) -> bool {
  match action {
    DocAction::Read => role as u8 >= DocRole::External as u8,
    DocAction::Comment => role as u8 >= DocRole::Commenter as u8,
    DocAction::Update => role as u8 >= DocRole::Editor as u8,
    DocAction::Trash
    | DocAction::Restore
    | DocAction::Delete
    | DocAction::Publish
    | DocAction::Unpublish
    | DocAction::UsersManage => role as u8 >= DocRole::Manager as u8,
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

/// Evaluates effective `DocRole` by collecting all eligible candidates and taking
/// the maximum, matching `affine_core::access_control::permission::doc_role` 1:1:
/// 1. `InheritedWorkspaceRole`: `Owner => DocRole::Owner`, effective `Admin => DocRole::Manager`.
/// 2. `DocGrant`: explicit `Some(r)` with `r != None` (capped to `Editor` for non-active members,
///    only eligible when `active_member || doc_sharing_enabled`); otherwise (absent OR explicit `None`)
///    falls back to `member_default_role` when `active_member && member_default_role != None`.
/// 3. `PublicPolicy`: `public_role` when `doc_sharing_enabled && doc_visibility_public && public_role != None`.
pub fn resolve_effective_doc_role(input: DocRoleInput) -> DocRole {
  fn to_domain_doc_role(r: DocRole) -> server_domain::acl::DocRole {
    match r {
      DocRole::None => server_domain::acl::DocRole::None,
      DocRole::External => server_domain::acl::DocRole::External,
      DocRole::Reader => server_domain::acl::DocRole::Reader,
      DocRole::Commenter => server_domain::acl::DocRole::Commenter,
      DocRole::Editor => server_domain::acl::DocRole::Editor,
      DocRole::Manager => server_domain::acl::DocRole::Manager,
      DocRole::Owner => server_domain::acl::DocRole::Owner,
    }
  }
  let ws_role = match input.workspace_role {
    Some(WorkspaceRole::Owner) => Some(server_domain::workspaces::WorkspaceRole::Owner),
    Some(WorkspaceRole::Admin) => Some(server_domain::workspaces::WorkspaceRole::Admin),
    Some(WorkspaceRole::Member) => Some(server_domain::workspaces::WorkspaceRole::Member),
    Some(WorkspaceRole::External) | None => None,
  };
  match server_domain::acl::resolve_effective_doc_role(server_domain::acl::DocRoleInput {
    workspace_role: ws_role,
    commercial: input.commercial,
    explicit_user_role: input.explicit_user_role.map(to_domain_doc_role),
    member_default_role: to_domain_doc_role(input.member_default_role),
    doc_sharing_enabled: input.doc_sharing_enabled,
    doc_visibility_public: input.doc_visibility_public,
    public_role: to_domain_doc_role(input.public_role),
  }) {
    server_domain::acl::DocRole::None => DocRole::None,
    server_domain::acl::DocRole::External => DocRole::External,
    server_domain::acl::DocRole::Reader => DocRole::Reader,
    server_domain::acl::DocRole::Commenter => DocRole::Commenter,
    server_domain::acl::DocRole::Editor => DocRole::Editor,
    server_domain::acl::DocRole::Manager => DocRole::Manager,
    server_domain::acl::DocRole::Owner => DocRole::Owner,
  }
}
