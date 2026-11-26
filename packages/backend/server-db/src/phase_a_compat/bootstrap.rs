// compat(coexist): db-0275-cutover-prerequisite-checks -- enforces v0.27.5 _data_migrations and cutover invariant markers
//! Fresh-DB `v0.27.5` bootstrap markers so freshly initialized databases match
//! a `v0.27.5` cutover database 1:1.

use std::collections::HashSet;

use sqlx::{PgConnection, Postgres, Transaction};
use uuid::Uuid;

use crate::DbError;

/// Exact ordered list of the 10 completed `v0.27.5` `_data_migrations` markers.
pub const V0275_DATA_MIGRATION_NAMES: [&str; 10] = [
  "Guid1698398506533",
  "UnamedAccount1703756315970",
  "RefreshUnnamedUser1721299086340",
  "CorrectSessionUpdateTime1751966744168",
  "BackfillPermissionProjection1765500000000",
  "BackfillEntitlementProjection1765600000000",
  "BackfillTranscriptStorageKeys1786805802350",
  "ConvergeManagedProviderProfiles1786810000000",
  "MigrateLegacyContextBlobArtifacts1786820000000",
  "DisableIncompleteManagedProfiles1790300000000",
];

/// Idempotently seeds the 10 `v0.27.5` completed `_data_migrations` rows inside
/// an existing transaction, matching `v0.27.5` `prisma migrate deploy` +
/// `data-migration run` (v1 sync protocol default; `workspace_doc_lifecycle_activation`
/// is not pre-activated).
pub async fn seed_fresh_0275_bootstrap_markers(tx: &mut Transaction<'_, Postgres>) -> Result<(), DbError> {
  for name in V0275_DATA_MIGRATION_NAMES {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
      r#"INSERT INTO "_data_migrations" (id, name, started_at, finished_at)
         VALUES ($1, $2, clock_timestamp(), clock_timestamp())
         ON CONFLICT (name) DO NOTHING"#,
    )
    .bind(&id)
    .bind(name)
    .execute(&mut **tx)
    .await?;
  }

  Ok(())
}

/// Strictly read-only startup verification for existing `v0.27.5` databases
/// (`SchemaReadiness::ReadyExisting0275`): never mutates any row.
///
/// Enforces:
/// 1. All 10 `V0275_DATA_MIGRATION_NAMES` rows exist in `_data_migrations` with
///    `finished_at IS NOT NULL`.
/// 2. `storage_reconciliation_checkpoints` global `workspace_doc_lifecycle_activation`
///    is either absent (`v0.27.5` default v1 mode) or `status = 'active'` (v2 mode);
///    any other status is rejected without mutating the database.
/// 3. `check_cutover_invariants` reports zero ownerless workspaces and zero
///    active unsigned self-host entitlements.
pub async fn verify_existing_0275_runtime_prerequisites(
  conn: &mut PgConnection,
  selfhosted: bool,
) -> Result<(), DbError> {
  let dm_table_exists: bool = sqlx::query_scalar("SELECT to_regclass('public._data_migrations') IS NOT NULL")
    .fetch_one(&mut *conn)
    .await?;
  if !dm_table_exists {
    return Err(DbError::SteppingStoneRequired {
      missing_migrations: V0275_DATA_MIGRATION_NAMES.iter().map(|s| (*s).to_owned()).collect(),
      message: "existing v0.27.5 database is missing `_data_migrations` table; run the v0.27.5 CLI commands `run`, `validate-cutover`, and `activate-workspace-lifecycle` before starting affine-server".to_owned(),
    });
  }

  let completed_dm: Vec<String> =
    sqlx::query_scalar(r#"SELECT name FROM "_data_migrations" WHERE finished_at IS NOT NULL"#)
      .fetch_all(&mut *conn)
      .await?;
  let completed_set: HashSet<&str> = completed_dm.iter().map(String::as_str).collect();
  let missing_dm: Vec<String> = V0275_DATA_MIGRATION_NAMES
    .iter()
    .filter(|name| !completed_set.contains(**name))
    .map(|name| (*name).to_owned())
    .collect();
  if !missing_dm.is_empty() {
    return Err(DbError::SteppingStoneRequired {
      missing_migrations: missing_dm.clone(),
      message: format!(
        "existing v0.27.5 database is missing {} completed _data_migrations ({}); run v0.27.5 CLI `run`, `validate-cutover`, and `activate-workspace-lifecycle` before starting affine-server",
        missing_dm.len(),
        missing_dm.join(", ")
      ),
    });
  }

  let lifecycle_status: Option<String> = sqlx::query_scalar(
    "SELECT status
       FROM storage_reconciliation_checkpoints
       WHERE kind = 'workspace_doc_lifecycle_activation'
         AND scope = 'global'",
  )
  .fetch_optional(&mut *conn)
  .await?;
  if let Some(status) = lifecycle_status
    && status != "active"
  {
    return Err(DbError::SteppingStoneRequired {
      missing_migrations: Vec::new(),
      message: format!(
        "existing v0.27.5 database has non-active `workspace_doc_lifecycle_activation` checkpoint (status = `{status}`); finish `activate-workspace-lifecycle` before starting affine-server"
      ),
    });
  }

  let invariants = crate::phase_a_compat::check_cutover_invariants(&mut *conn, selfhosted).await?;
  if invariants.ownerless_workspaces != 0 || invariants.active_unsigned_selfhost_entitlements != 0 {
    return Err(DbError::SteppingStoneRequired {
      missing_migrations: Vec::new(),
      message: format!(
        "existing v0.27.5 database failed cutover invariants (ownerless_workspaces={}, active_unsigned_selfhost_entitlements={}); run v0.27.5 CLI `run`, `validate-cutover`, and `activate-workspace-lifecycle` before starting affine-server",
        invariants.ownerless_workspaces, invariants.active_unsigned_selfhost_entitlements
      ),
    });
  }

  Ok(())
}
