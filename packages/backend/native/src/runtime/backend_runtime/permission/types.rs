use affine_core::access_control::{AccessGrant, AclFacts, AuthorizationRequest};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(in crate::runtime::backend_runtime) enum SearchActor {
  User { user_id: String },
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
  pub(super) request: AuthorizationRequest,
  pub(super) facts: AclFacts,
  pub(super) grant: AccessGrant,
  pub(super) active_member: bool,
  pub(super) sharing_enabled: bool,
}
