use crate::permission::PermissionEvaluationInputV1;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(in crate::runtime::backend_runtime) enum SearchActor {
  User { user_id: String },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum DocAclCapability {
  Enabled,
  Disabled,
  Unknown,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(in crate::runtime::backend_runtime) struct AclPredicate {
  pub(in crate::runtime::backend_runtime) actor_user_id: String,
  pub(in crate::runtime::backend_runtime) active_member: bool,
  pub(in crate::runtime::backend_runtime) sharing_enabled: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(in crate::runtime::backend_runtime) enum DocReadScope {
  All,
  ProjectedAcl(AclPredicate),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(in crate::runtime::backend_runtime) struct AuthorizedSearchScope {
  pub(in crate::runtime::backend_runtime) workspace_id: String,
  pub(in crate::runtime::backend_runtime) docs: DocReadScope,
}

pub(super) struct PermissionSnapshot {
  pub(super) capability: DocAclCapability,
  pub(super) evaluation: PermissionEvaluationInputV1,
  pub(super) actor_user_id: String,
  pub(super) active_member: bool,
  pub(super) sharing_enabled: bool,
}
