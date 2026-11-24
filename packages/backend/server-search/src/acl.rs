use std::collections::BTreeSet;
use std::sync::Arc;

use chrono::Utc;
use server_domain::acl::{DocRole, load_workspace_docs_access_in};
use server_domain::workspaces::WorkspaceRole;
use server_spi::QuotaGate;
use sqlx::PgPool;

use crate::error::{SearchError, SearchResult};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AclPredicate {
  pub actor_user_id: String,
  pub active_member: bool,
  pub sharing_enabled: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DocReadScope {
  All,
  ProjectedAcl(AclPredicate),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthorizedSearchScope {
  pub workspace_id: String,
  pub docs: DocReadScope,
}

#[derive(Clone)]
pub struct SearchAuthorizer {
  pool: PgPool,
  quota_gate: Arc<dyn QuotaGate>,
}

impl SearchAuthorizer {
  pub fn new(pool: PgPool, quota_gate: Arc<dyn QuotaGate>) -> Self {
    Self { pool, quota_gate }
  }

  pub async fn authorize_search(&self, actor_user_id: &str, workspace_id: &str) -> SearchResult<AuthorizedSearchScope> {
    let mut tx = self
      .pool
      .begin()
      .await
      .map_err(|error| SearchError::database("begin search authorization", error))?;
    let scope = self.authorize_search_in(&mut tx, actor_user_id, workspace_id).await?;
    let _ = tx.rollback().await;
    Ok(scope)
  }

  pub async fn authorize_search_in(
    &self,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    actor_user_id: &str,
    workspace_id: &str,
  ) -> SearchResult<AuthorizedSearchScope> {
    let snapshot = load_workspace_docs_access_in(
      tx,
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      &[],
      Utc::now(),
    )
    .await
    .map_err(|_| SearchError::WorkspaceDenied)?;

    if !snapshot.workspace_permissions.read {
      return Err(SearchError::WorkspaceDenied);
    }

    let effective_role = snapshot.assigned_role.map(|r| r.effective(snapshot.commercial));
    let privileged = matches!(effective_role, Some(WorkspaceRole::Owner | WorkspaceRole::Admin));
    let docs = if privileged {
      DocReadScope::All
    } else {
      DocReadScope::ProjectedAcl(AclPredicate {
        actor_user_id: actor_user_id.to_owned(),
        active_member: snapshot.assigned_role.is_some(),
        sharing_enabled: snapshot.sharing_enabled,
      })
    };
    Ok(AuthorizedSearchScope {
      workspace_id: workspace_id.to_owned(),
      docs,
    })
  }

  pub async fn filter_readable_docs(
    &self,
    workspace_id: &str,
    actor_user_id: &str,
    doc_ids: Vec<String>,
  ) -> SearchResult<BTreeSet<String>> {
    if doc_ids.is_empty() {
      return Ok(BTreeSet::new());
    }
    let mut tx = self
      .pool
      .begin()
      .await
      .map_err(|error| SearchError::database("begin search doc ACL filter", error))?;
    let snapshot = load_workspace_docs_access_in(
      &mut tx,
      self.quota_gate.as_ref(),
      workspace_id,
      Some(actor_user_id),
      &doc_ids,
      Utc::now(),
    )
    .await
    .map_err(|_| SearchError::PermissionUnavailable)?;
    let _ = tx.rollback().await;

    Ok(
      snapshot
        .docs
        .into_iter()
        .filter(|(_, entry)| entry.permissions.doc_read)
        .map(|(doc_id, _)| doc_id)
        .collect(),
    )
  }
}

pub fn readable_doc_role(role: &str, source: &str) -> SearchResult<bool> {
  match role.to_ascii_lowercase().as_str() {
    "owner" | "manager" | "editor" | "commenter" | "reader" => Ok(true),
    "external" | "none" => Ok(false),
    _ => {
      let parsed = DocRole::parse(role);
      if parsed == DocRole::None {
        Err(SearchError::SourceInvalid(format!("invalid {source} document role")))
      } else {
        Ok(parsed >= DocRole::Reader)
      }
    }
  }
}
