use std::collections::BTreeSet;

use sqlx::PgPool;

use super::{
  store::PermissionStore,
  types::{AclPredicate, AuthorizedSearchScope, DocAclCapability, DocReadScope, SearchActor},
};
use crate::{
  permission::evaluate_permission,
  runtime::{RuntimeError, RuntimeResult},
};

pub(in crate::runtime::backend_runtime) struct PermissionAuthorizer {
  store: PermissionStore,
}

impl PermissionAuthorizer {
  pub(in crate::runtime::backend_runtime) fn new(pool: PgPool) -> Self {
    Self {
      store: PermissionStore::new(pool),
    }
  }

  pub(in crate::runtime::backend_runtime) async fn authorize_search(
    &self,
    actor: &SearchActor,
    workspace_id: &str,
  ) -> RuntimeResult<AuthorizedSearchScope> {
    match actor {
      SearchActor::User { user_id } => {
        let snapshot = self.store.permission_snapshot(workspace_id, user_id, &[]).await?;
        let owner_or_admin = matches!(snapshot.evaluation.workspace.role.as_deref(), Some("owner" | "admin"))
          && snapshot.evaluation.workspace.member_state.as_deref() == Some("active");
        let decision = evaluate_permission(snapshot.evaluation)
          .map_err(|_| RuntimeError::SearchPermissionUnavailable)?
          .workspace
          .decisions
          .into_iter()
          .find(|decision| decision.action == "Workspace.Read")
          .ok_or(RuntimeError::SearchPermissionUnavailable)?;
        if !decision.allowed {
          return Err(RuntimeError::SearchWorkspaceDenied);
        }
        let docs = match snapshot.capability {
          DocAclCapability::Disabled => DocReadScope::All,
          DocAclCapability::Unknown => return Err(RuntimeError::SearchPermissionUnavailable),
          DocAclCapability::Enabled if owner_or_admin => DocReadScope::All,
          DocAclCapability::Enabled => DocReadScope::ProjectedAcl(AclPredicate {
            actor_user_id: snapshot.actor_user_id,
            active_member: snapshot.active_member,
            sharing_enabled: snapshot.sharing_enabled,
          }),
        };
        Ok(AuthorizedSearchScope {
          workspace_id: workspace_id.to_string(),
          docs,
        })
      }
    }
  }

  pub(in crate::runtime::backend_runtime) async fn filter_readable_docs(
    &self,
    workspace_id: &str,
    user_id: &str,
    doc_ids: Vec<String>,
  ) -> RuntimeResult<BTreeSet<String>> {
    let snapshot = self.store.permission_snapshot(workspace_id, user_id, &doc_ids).await?;
    if snapshot.capability == DocAclCapability::Unknown {
      return Err(RuntimeError::SearchPermissionUnavailable);
    }
    let output = evaluate_permission(snapshot.evaluation).map_err(|_| RuntimeError::SearchPermissionUnavailable)?;
    Ok(
      output
        .docs
        .into_iter()
        .filter(|doc| {
          doc
            .decisions
            .iter()
            .any(|decision| decision.action == "Doc.Read" && decision.allowed)
        })
        .map(|doc| doc.doc_id)
        .collect(),
    )
  }
}
