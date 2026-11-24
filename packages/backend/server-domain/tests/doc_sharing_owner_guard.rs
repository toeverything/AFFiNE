use std::sync::Arc;

use server_db::{DbConfig, ServerDb};
use server_domain::acl::DocRole;
use server_domain::doc_sharing::DocSharingService;
use server_domain::events::NoopEventPublisher;
use server_spi::CommunityQuotaGate;
use server_types::DomainError;
use test_db_harness::{
  migrations::MigrationSet,
  pg::{DEFAULT_LEASE_TTL, PgCluster},
};
use uuid::Uuid;

#[test]
fn grant_doc_roles_preserves_existing_owner_grant_row_matching_v0275_filter() {
  let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = MigrationSet::load(&migrations_dir).expect("load migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure template");
  let lease = cluster.lease(&template, DEFAULT_LEASE_TTL).expect("lease test db");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_current_thread()
    .enable_all()
    .build()
    .expect("build runtime");

  rt.block_on(async move {
    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "canary".into(),
      role: server_types::ServerRole::Allinone,
      selfhosted: true,
      max_connections: 4,
      statement_timeout_ms: 5_000,
      tier_permits: [8, 4, 2, 2],
    })
    .await
    .expect("connect db");
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .expect("reset schema");
    db.ensure_schema_ready().await.expect("ensure schema");

    let ws_id = Uuid::new_v4().to_string();
    let doc_id = "doc-owner-guard";
    let owner_id = Uuid::new_v4().to_string();
    let member_id = Uuid::new_v4().to_string();

    sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
      .bind(&ws_id)
      .execute(db.pool())
      .await
      .expect("insert workspace");
    for (uid, name, email) in [
      (&owner_id, "Owner", "owner@example.com"),
      (&member_id, "Member", "member@example.com"),
    ] {
      sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, $2, $3)")
        .bind(uid)
        .bind(name)
        .bind(email)
        .execute(db.pool())
        .await
        .expect("insert user");
    }
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy')",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&ws_id)
    .bind(&owner_id)
    .execute(db.pool())
    .await
    .expect("insert owner member");
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'member', 'active', 'legacy')",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&ws_id)
    .bind(&member_id)
    .execute(db.pool())
    .await
    .expect("insert regular member");
    sqlx::query(
      "INSERT INTO doc_grants (workspace_id, doc_id, principal_type, principal_id, role, granted_by) VALUES ($1, $2, 'user', $3, 'owner', $3)",
    )
    .bind(&ws_id)
    .bind(doc_id)
    .bind(&owner_id)
    .execute(db.pool())
    .await
    .expect("seed owner doc_grants row");

    let svc = DocSharingService::new(
      db.clone(),
      Arc::new(CommunityQuotaGate::default()),
      Arc::new(NoopEventPublisher::default()),
      Arc::new(NoopEventPublisher::default()),
    );

    // Attempting to grant Reader to the owner must fail and leave role = 'owner' intact.
    let err = svc
      .grant_doc_roles(&owner_id, &ws_id, doc_id, vec![owner_id.clone()], DocRole::Reader)
      .await
      .expect_err("grant_doc_roles must reject overwriting an owner row");
    assert!(matches!(err, DomainError::Forbidden(_)), "unexpected error: {err:?}");

    // Directly verify the v0.27.5 SQL predicate `WHERE doc_grants.role <> 'owner'`
    // leaves the owner row untouched while updating non-owner rows.
    let owner_upsert_affected = sqlx::query(
      r#"INSERT INTO doc_grants (workspace_id, doc_id, principal_type, principal_id, role, granted_by)
         VALUES ($1, $2, 'user', $3, 'reader', $3)
         ON CONFLICT (workspace_id, doc_id, principal_type, principal_id)
         DO UPDATE SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by, updated_at = now()
         WHERE doc_grants.role <> 'owner'"#,
    )
    .bind(&ws_id)
    .bind(doc_id)
    .bind(&owner_id)
    .execute(db.pool())
    .await
    .expect("run filtered upsert on owner")
    .rows_affected();
    assert_eq!(owner_upsert_affected, 0);

    // Granting a non-owner succeeds without altering the owner row.
    svc
      .grant_doc_roles(&owner_id, &ws_id, doc_id, vec![member_id.clone()], DocRole::Editor)
      .await
      .expect("grant non-owner editor");

    let owner_role: String = sqlx::query_scalar(
      "SELECT role FROM doc_grants WHERE workspace_id = $1 AND doc_id = $2 AND principal_type = 'user' AND principal_id = $3",
    )
    .bind(&ws_id)
    .bind(doc_id)
    .bind(&owner_id)
    .fetch_one(db.pool())
    .await
    .expect("fetch owner role");
    let member_role: String = sqlx::query_scalar(
      "SELECT role FROM doc_grants WHERE workspace_id = $1 AND doc_id = $2 AND principal_type = 'user' AND principal_id = $3",
    )
    .bind(&ws_id)
    .bind(doc_id)
    .bind(&member_id)
    .fetch_one(db.pool())
    .await
    .expect("fetch member role");
    assert_eq!(owner_role, "owner");
    assert_eq!(member_role, "editor");
  });
  drop(lease);
}
