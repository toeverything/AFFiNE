//! `async-graphql 7` root schema skeleton aligned with `v0.27.5` `schema.gql`.
//!
//! Workspace queries fail closed unless both an [`AuthenticatedUser`] and an
//! [`AuthorizedWorkspaceUsage`] snapshot for the requested workspace are
//! injected into the GraphQL execution context by the auth/authz layer.

use std::sync::Arc;

use async_graphql::{Context, EmptyMutation, EmptySubscription, ID, Object, Result, Schema};
use chrono::Utc;
use server_types::DomainError;

use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;
use crate::legacy_compat::quota::{WorkspaceQuotaType, workspace_quota_from_grant};

pub type AppSchema = Schema<QueryRoot, EmptyMutation, EmptySubscription>;

/// Request-scoped authenticated principal injected into GraphQL execution context.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthenticatedUser {
  pub user_id: String,
}

/// Request-scoped authorized workspace usage snapshot injected after membership
/// and quota-usage authorization checks.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthorizedWorkspaceUsage {
  pub workspace_id: String,
  pub used_storage_quota: i64,
  pub member_count: i32,
}

pub struct CurrentUserSkeleton {
  id: String,
}

#[Object(name = "UserType")]
impl CurrentUserSkeleton {
  async fn id(&self) -> ID {
    ID(self.id.clone())
  }
}

pub struct WorkspaceType {
  id: String,
  used_storage_quota: i64,
  member_count: i32,
}

#[Object(name = "WorkspaceType")]
impl WorkspaceType {
  async fn id(&self) -> ID {
    ID(self.id.clone())
  }

  /// Resolves this workspace's quota through [`server_spi::QuotaGate`] inside a
  /// `WorkloadTier::InteractiveRead` transaction.
  async fn quota(&self, ctx: &Context<'_>) -> Result<WorkspaceQuotaType> {
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let mut tx = state
      .db
      .begin_tiered(server_db::WorkloadTier::InteractiveRead)
      .await
      .map_err(|e| domain_error_to_graphql(&DomainError::Unavailable(e.to_string())))?;

    let grant = state
      .extension
      .quota_gate()
      .resolve_workspace_grant(tx.tx_mut(), &self.id, Utc::now())
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;

    let _ = tx.rollback().await;
    Ok(workspace_quota_from_grant(
      &grant,
      self.used_storage_quota,
      self.member_count,
    ))
  }
}

pub struct QueryRoot;

#[Object(name = "Query")]
impl QueryRoot {
  /// Returns the currently authenticated user, or `null` for anonymous requests
  /// (matches `v0.27.5` `Query.currentUser: UserType`).
  async fn current_user(&self, ctx: &Context<'_>) -> Option<CurrentUserSkeleton> {
    ctx
      .data_opt::<AuthenticatedUser>()
      .map(|u| CurrentUserSkeleton { id: u.user_id.clone() })
  }

  /// Workspace root query (matches `v0.27.5` `Query.workspace(id: String!): WorkspaceType!`).
  ///
  /// Fails closed:
  /// - Anonymous callers receive `AUTHENTICATION_REQUIRED` (`401`).
  /// - Authenticated callers without an [`AuthorizedWorkspaceUsage`] for `id`
  ///   receive `ACTION_FORBIDDEN` (`403`).
  async fn workspace(&self, ctx: &Context<'_>, id: String) -> Result<WorkspaceType> {
    if ctx.data_opt::<AuthenticatedUser>().is_none() {
      return Err(domain_error_to_graphql(&DomainError::Unauthorized(
        "Authentication required".into(),
      )));
    }
    let Some(usage) = ctx
      .data_opt::<AuthorizedWorkspaceUsage>()
      .filter(|u| u.workspace_id == id)
    else {
      return Err(domain_error_to_graphql(&DomainError::Forbidden(
        "Workspace access denied".into(),
      )));
    };
    Ok(WorkspaceType {
      id,
      used_storage_quota: usage.used_storage_quota,
      member_count: usage.member_count,
    })
  }
}

pub fn build_schema(state: Arc<AppState>) -> AppSchema {
  Schema::build(QueryRoot, EmptyMutation, EmptySubscription)
    .data(state)
    .finish()
}

#[cfg(test)]
mod tests {
  use async_graphql::{Request, Value};
  use server_db::{DbConfig, ServerDb};
  use server_spi::CommunityExtension;
  use server_types::ServerRole;

  use super::*;
  use crate::RuntimeConfig;

  #[test]
  fn workspace_query_enforces_fail_closed_auth_and_returns_quota_when_authorized() {
    let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations = test_db_harness::migrations::MigrationSet {
      migrations: vec![],
      digest: "5e20000000000002".into(),
    };
    let template = cluster.ensure_template(&migrations).expect("ensure empty template");
    let lease = cluster
      .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
      .expect("lease test database");
    let db_url = lease.url().to_owned();

    let rt = tokio::runtime::Builder::new_multi_thread()
      .enable_all()
      .build()
      .expect("build tokio runtime");

    rt.block_on(async move {
      let db = ServerDb::connect(DbConfig {
        database_url: db_url,
        channel: "canary".into(),
        role: ServerRole::Graphql,
        max_connections: 2,
        statement_timeout_ms: 5_000,
        tier_permits: [4, 2, 2, 1],
      })
      .await
      .expect("connect test db");

      let state = AppState::new(
        db.clone(),
        None,
        RuntimeConfig {
          role: ServerRole::Graphql,
          ..RuntimeConfig::default()
        },
        Arc::new(CommunityExtension::new()),
      );
      let schema = build_schema(state);

      // 1. Anonymous currentUser -> null; anonymous workspace -> AUTHENTICATION_REQUIRED (401)
      let cur_resp = schema.execute(Request::new("{ currentUser { id } }")).await;
      assert!(cur_resp.errors.is_empty());
      assert_eq!(
        serde_json::to_value(&cur_resp.data).unwrap(),
        serde_json::json!({ "currentUser": null })
      );

      let anon_ws = schema
        .execute(Request::new("{ workspace(id: \"ws-1\") { id } }"))
        .await;
      assert_eq!(anon_ws.errors.len(), 1);
      let ext = anon_ws.errors[0].extensions.as_ref().expect("extensions");
      assert_eq!(ext.get("status"), Some(&Value::from(401)));
      assert_eq!(ext.get("type"), Some(&Value::from("AUTHENTICATION_REQUIRED")));

      // 2. Authenticated without workspace authorization (or wrong workspace_id) -> ACTION_FORBIDDEN (403)
      let unauthz_ws = schema
        .execute(
          Request::new("{ workspace(id: \"ws-1\") { id } }").data(AuthenticatedUser {
            user_id: "user-1".into(),
          }),
        )
        .await;
      assert_eq!(unauthz_ws.errors.len(), 1);
      let ext = unauthz_ws.errors[0].extensions.as_ref().expect("extensions");
      assert_eq!(ext.get("status"), Some(&Value::from(403)));
      assert_eq!(ext.get("type"), Some(&Value::from("ACTION_FORBIDDEN")));

      let wrong_ws = schema
        .execute(
          Request::new("{ workspace(id: \"ws-other\") { id } }")
            .data(AuthenticatedUser {
              user_id: "user-1".into(),
            })
            .data(AuthorizedWorkspaceUsage {
              workspace_id: "ws-1".into(),
              used_storage_quota: 0,
              member_count: 1,
            }),
        )
        .await;
      assert_eq!(wrong_ws.errors.len(), 1);
      let ext = wrong_ws.errors[0].extensions.as_ref().expect("extensions");
      assert_eq!(ext.get("status"), Some(&Value::from(403)));
      assert_eq!(ext.get("type"), Some(&Value::from("ACTION_FORBIDDEN")));

      // 3. Authenticated + authorized workspace usage -> returns exact WorkspaceQuotaType
      let ok_resp = schema
        .execute(
          Request::new(
            "{ currentUser { id } workspace(id: \"ws-1\") { id quota { name blobLimit storageQuota usedStorageQuota historyPeriod memberLimit memberCount overcapacityMemberCount humanReadable { name blobLimit storageQuota storageQuotaUsed historyPeriod memberLimit memberCount overcapacityMemberCount } } } }",
          )
          .data(AuthenticatedUser {
            user_id: "user-1".into(),
          })
          .data(AuthorizedWorkspaceUsage {
            workspace_id: "ws-1".into(),
            used_storage_quota: 104_857_600,
            member_count: 3,
          }),
        )
        .await;
      assert!(ok_resp.errors.is_empty(), "errors: {:?}", ok_resp.errors);
      let data = serde_json::to_value(&ok_resp.data).unwrap();
      assert_eq!(data["currentUser"]["id"], "user-1");
      assert_eq!(data["workspace"]["id"], "ws-1");
      let q = &data["workspace"]["quota"];
      assert_eq!(q["name"], "Pro");
      assert_eq!(q["blobLimit"], 104_857_600);
      assert_eq!(q["storageQuota"], 107_374_182_400_i64);
      assert_eq!(q["usedStorageQuota"], 104_857_600);
      assert_eq!(q["historyPeriod"], 2_592_000);
      assert_eq!(q["memberLimit"], 10);
      assert_eq!(q["memberCount"], 3);
      assert_eq!(q["overcapacityMemberCount"], 0);
      assert_eq!(q["humanReadable"]["blobLimit"], "100 MB");
      assert_eq!(q["humanReadable"]["storageQuota"], "100 GB");
      assert_eq!(q["humanReadable"]["storageQuotaUsed"], "100 MB");
      assert_eq!(q["humanReadable"]["historyPeriod"], "30 days");

      db.pool().close().await;
    });
  }
}
