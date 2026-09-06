use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use super::{ActiveGeneration, LEASE_SECONDS, SearchTable, WORKSPACE_RECONCILE_FAILED};
use crate::runtime::{RuntimeError, RuntimeResult};

const ANTI_ENTROPY_INTERVAL_SECONDS: i64 = 3600;

pub(super) struct WorkspaceClaim {
  pub(super) fence: i64,
  pub(super) progress: WorkspaceProgress,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct WorkspaceProgress {
  version: u8,
  pub(super) captured_root_revision: i64,
  pub(super) captured_permission_version: i64,
  #[serde(flatten)]
  pub(super) phase: WorkspacePhase,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(super) enum WorkspacePhase {
  Publications {
    after_publication_doc_id: Option<String>,
    resume_after_doc_id: Option<String>,
    scan_workspace: bool,
  },
  Documents {
    after_doc_id: Option<String>,
  },
  Source {
    after_doc_id: Option<String>,
  },
  Stale {
    table: SearchTable,
    cursor: Option<String>,
  },
  Deleted {
    table: SearchTable,
    quiet: bool,
  },
}

impl WorkspaceProgress {
  pub(super) fn new(captured_root_revision: i64, captured_permission_version: i64, phase: WorkspacePhase) -> Self {
    Self {
      version: 1,
      captured_root_revision,
      captured_permission_version,
      phase,
    }
  }

  fn from_value(progress: Value) -> RuntimeResult<Self> {
    let progress: Self =
      serde_json::from_value(progress).map_err(|_| RuntimeError::invalid_state("invalid search workspace progress"))?;
    if progress.version != 1 {
      return Err(RuntimeError::invalid_state(
        "unsupported search workspace progress version",
      ));
    }
    Ok(progress)
  }

  pub(super) fn with_phase(&self, phase: WorkspacePhase) -> Self {
    Self::new(self.captured_root_revision, self.captured_permission_version, phase)
  }

  pub(super) fn value(&self) -> Value {
    serde_json::to_value(self).expect("workspace progress is serializable")
  }
}

pub(super) async fn claim_workspace(
  pool: &PgPool,
  generation_id: Uuid,
  workspace_id: &str,
) -> RuntimeResult<Option<WorkspaceClaim>> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin search workspace claim", error))?;
  let row = sqlx::query(
    r#"SELECT covered,pending_scope,required_permission_version,progress,
              target_root_revision AS current_root_revision,
              EXISTS(
                SELECT 1 FROM search_projection.document_states document
                WHERE document.generation_id=state.generation_id
                  AND document.workspace_id=state.workspace_id
                  AND document.available_at <= now()
                  AND (document.target_source_version <> document.published_source_version
                    OR document.target_source_exists <> document.published_source_exists
                    OR document.target_permission_version <> document.published_permission_version)
              ) AS has_due_publications
       FROM search_projection.workspace_states state
       WHERE generation_id=$1 AND workspace_id=$2
         AND (available_at <= now() OR EXISTS(
           SELECT 1 FROM search_projection.document_states document
           WHERE document.generation_id=state.generation_id
             AND document.workspace_id=state.workspace_id
             AND document.available_at <= now()
             AND (document.target_source_version <> document.published_source_version
               OR document.target_source_exists <> document.published_source_exists
               OR document.target_permission_version <> document.published_permission_version)
         ))
         AND (lease_expires_at IS NULL OR lease_expires_at <= now())
       FOR UPDATE SKIP LOCKED"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("claim search workspace", error))?;
  let Some(row) = row else {
    tx.rollback()
      .await
      .map_err(|error| RuntimeError::database("rollback empty search workspace claim", error))?;
    return Ok(None);
  };
  let fence: i64 = sqlx::query_scalar("SELECT nextval('search_projection.claim_fence')")
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("allocate search workspace fence", error))?;
  let permission_version: i64 = row
    .try_get("required_permission_version")
    .map_err(|error| RuntimeError::database("decode search workspace permission version", error))?;
  let root_revision: i64 = row
    .try_get("current_root_revision")
    .map_err(|error| RuntimeError::database("decode search workspace root revision", error))?;
  let covered: bool = row
    .try_get("covered")
    .map_err(|error| RuntimeError::database("decode search workspace coverage", error))?;
  let pending_scope: String = row
    .try_get("pending_scope")
    .map_err(|error| RuntimeError::database("decode search workspace pending scope", error))?;
  let has_due_publications: bool = row
    .try_get("has_due_publications")
    .map_err(|error| RuntimeError::database("decode due search document publications", error))?;
  let progress: Option<Value> = row
    .try_get("progress")
    .map_err(|error| RuntimeError::database("decode search workspace progress", error))?;
  let progress = match progress {
    Some(progress) => WorkspaceProgress::from_value(progress)?,
    None if covered && pending_scope == "none" => WorkspaceProgress::new(
      root_revision,
      permission_version,
      if has_due_publications {
        WorkspacePhase::Publications {
          after_publication_doc_id: None,
          resume_after_doc_id: None,
          scan_workspace: false,
        }
      } else {
        WorkspacePhase::Source { after_doc_id: None }
      },
    ),
    None => WorkspaceProgress::new(
      root_revision,
      permission_version,
      WorkspacePhase::Documents { after_doc_id: None },
    ),
  };
  sqlx::query(
    r#"UPDATE search_projection.workspace_states
       SET claim_fence=$3, lease_owner=$4, lease_expires_at=now()+make_interval(secs=>$5),
           progress=$6, attempt_count=attempt_count+1, updated_at=now()
       WHERE generation_id=$1 AND workspace_id=$2"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .bind(fence)
  .bind(format!("native-search-{}", std::process::id()))
  .bind(LEASE_SECONDS)
  .bind(progress.value())
  .execute(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("write search workspace claim", error))?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit search workspace claim", error))?;
  Ok(Some(WorkspaceClaim { fence, progress }))
}

pub(super) async fn checkpoint_workspace(
  pool: &PgPool,
  generation_id: Uuid,
  workspace_id: &str,
  fence: i64,
  progress: Value,
) -> RuntimeResult<()> {
  sqlx::query(
    r#"UPDATE search_projection.workspace_states
       SET progress=$4, available_at=now(), lease_owner=NULL, lease_expires_at=NULL, updated_at=now()
       WHERE generation_id=$1 AND workspace_id=$2 AND claim_fence=$3"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .bind(fence)
  .bind(progress)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("checkpoint search workspace reconcile", error))?;
  Ok(())
}

pub(super) async fn checkpoint_workspace_after(
  pool: &PgPool,
  generation_id: Uuid,
  workspace_id: &str,
  fence: i64,
  progress: Value,
  delay_seconds: i64,
) -> RuntimeResult<()> {
  sqlx::query(
    r#"UPDATE search_projection.workspace_states
       SET progress=$4, available_at=now()+make_interval(secs=>$5),
           lease_owner=NULL, lease_expires_at=NULL, updated_at=now()
       WHERE generation_id=$1 AND workspace_id=$2 AND claim_fence=$3"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .bind(fence)
  .bind(progress)
  .bind(delay_seconds)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("checkpoint deleted search workspace quiet period", error))?;
  Ok(())
}

pub(super) async fn delete_workspace_state(
  pool: &PgPool,
  generation_id: Uuid,
  workspace_id: &str,
  fence: i64,
) -> RuntimeResult<()> {
  sqlx::query(
    r#"DELETE FROM search_projection.workspace_states state
       WHERE state.generation_id=$1 AND state.workspace_id=$2 AND state.claim_fence=$3
         AND NOT EXISTS (SELECT 1 FROM workspaces WHERE id=$2)"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .bind(fence)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("delete completed search workspace state", error))?;
  Ok(())
}

pub(super) async fn renew_workspace_lease(
  pool: &PgPool,
  generation_id: Uuid,
  workspace_id: &str,
  fence: i64,
) -> RuntimeResult<bool> {
  let renewed = sqlx::query(
    r#"UPDATE search_projection.workspace_states
       SET lease_expires_at=now()+make_interval(secs=>$4), updated_at=now()
       WHERE generation_id=$1 AND workspace_id=$2 AND claim_fence=$3
         AND lease_expires_at > now()"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .bind(fence)
  .bind(LEASE_SECONDS)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("renew search workspace lease", error))?;
  Ok(renewed.rows_affected() == 1)
}

pub(super) async fn complete_workspace(
  pool: &PgPool,
  generation: &ActiveGeneration,
  workspace_id: &str,
  root_revision: i64,
  permission_version: i64,
  fence: i64,
) -> RuntimeResult<()> {
  sqlx::query(
    r#"UPDATE search_projection.workspace_states state
       SET target_root_revision=GREATEST(state.target_root_revision,$3),
           applied_root_revision=CASE
             WHEN state.target_root_revision <= $3 AND state.required_permission_version <= $4
             THEN GREATEST(state.applied_root_revision,$3) ELSE state.applied_root_revision END,
           covered=CASE
             WHEN state.target_root_revision <= $3 AND state.required_permission_version <= $4
             THEN true ELSE state.covered END,
           applied_permission_version=CASE
             WHEN state.required_permission_version <= $4
              AND NOT EXISTS (
                SELECT 1 FROM search_projection.document_states document
                WHERE document.generation_id=state.generation_id
                  AND document.workspace_id=state.workspace_id
                  AND document.target_permission_version <> document.published_permission_version
              )
             THEN GREATEST(state.applied_permission_version,state.required_permission_version)
             ELSE state.applied_permission_version END,
           pending_scope=CASE
             WHEN state.required_permission_version > $4 THEN 'permission'
             WHEN state.target_root_revision > $3 THEN 'workspace'
             WHEN EXISTS (
               SELECT 1 FROM search_projection.document_states document
               WHERE document.generation_id=state.generation_id AND document.workspace_id=state.workspace_id
                 AND (document.target_source_version <> document.published_source_version
                   OR document.target_source_exists <> document.published_source_exists
                   OR document.target_permission_version <> document.published_permission_version)
             ) THEN 'workspace'
             ELSE 'none' END,
           progress=NULL,
           available_at=CASE
             WHEN state.required_permission_version <= $4
              AND state.target_root_revision <= $3
              AND NOT EXISTS (
                SELECT 1 FROM search_projection.document_states document
                WHERE document.generation_id=state.generation_id AND document.workspace_id=state.workspace_id
                  AND (document.target_source_version <> document.published_source_version
                    OR document.target_source_exists <> document.published_source_exists
                    OR document.target_permission_version <> document.published_permission_version)
              )
             THEN now()+make_interval(secs=>$5) ELSE now() END,
           lease_owner=NULL, lease_expires_at=NULL, last_error=NULL, updated_at=now()
       WHERE state.generation_id=$1 AND state.workspace_id=$2 AND state.claim_fence=$6"#,
  )
  .bind(generation.id)
  .bind(workspace_id)
  .bind(root_revision)
  .bind(permission_version)
  .bind(ANTI_ENTROPY_INTERVAL_SECONDS)
  .bind(fence)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("complete search workspace reconcile", error))?;
  Ok(())
}

pub(super) async fn mark_workspace_failed(
  pool: &PgPool,
  generation_id: Uuid,
  workspace_id: &str,
  fence: i64,
) -> RuntimeResult<()> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin failed search workspace update", error))?;
  let updated = sqlx::query(
    r#"UPDATE search_projection.workspace_states
       SET covered=false, pending_scope='workspace', last_error=$4,
           progress=NULL, available_at='infinity'::timestamptz,
           lease_owner=NULL, lease_expires_at=NULL, updated_at=now()
       WHERE generation_id=$1 AND workspace_id=$2 AND claim_fence=$3"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .bind(fence)
  .bind(WORKSPACE_RECONCILE_FAILED)
  .execute(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("mark search workspace failed", error))?;
  if updated.rows_affected() == 0 {
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit empty search workspace update", error))?;
    return Ok(());
  }
  sqlx::query(
    r#"UPDATE search_projection.document_states
       SET available_at='infinity'::timestamptz, lease_owner=NULL, lease_expires_at=NULL, updated_at=now()
       WHERE generation_id=$1 AND workspace_id=$2"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .execute(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("pause failed search document publications", error))?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit failed search workspace update", error))?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::*;
  use crate::runtime::{
    SearchRuntimeConfig,
    backend_runtime::search::{SEARCH_TEST_LOCK, SearchRuntime, config_hash},
    migrations::migrate_search_tables,
  };

  #[test]
  fn progress_round_trips_versioned_context_for_each_phase() {
    let phases = [
      WorkspacePhase::Publications {
        after_publication_doc_id: Some("doc-2".to_string()),
        resume_after_doc_id: Some("doc-7".to_string()),
        scan_workspace: true,
      },
      WorkspacePhase::Source {
        after_doc_id: Some("doc-7".to_string()),
      },
      WorkspacePhase::Stale {
        table: SearchTable::Block,
        cursor: Some("cursor".to_string()),
      },
      WorkspacePhase::Deleted {
        table: SearchTable::Doc,
        quiet: true,
      },
    ];
    for phase in phases {
      let progress = WorkspaceProgress::new(11, 13, phase);
      assert_eq!(WorkspaceProgress::from_value(progress.value()).unwrap(), progress);
    }
    assert!(WorkspaceProgress::from_value(json!({"kind":"unknown"})).is_err());
    assert!(
      WorkspaceProgress::from_value(json!({
        "version":2,
        "captured_root_revision":1,
        "captured_permission_version":1,
        "kind":"documents",
        "after_doc_id":null
      }))
      .is_err()
    );
  }

  #[tokio::test]
  async fn claim_preserves_captured_versions_and_failure_is_terminal() {
    let _guard = SEARCH_TEST_LOCK.lock().await;
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPool::connect(&database_url).await.unwrap();
    migrate_search_tables(&pool).await.unwrap();
    let generation_id = Uuid::new_v4();
    let workspace_id = format!("claim-workspace-{}", Uuid::new_v4().simple());
    let config = SearchRuntimeConfig::default();
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$1,decode('00','hex'),'2026-01-01 UTC')",
    )
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    let initial_root: i64 = sqlx::query_scalar(
      "SELECT floor(extract(epoch FROM updated_at) * 1000)::bigint FROM snapshots WHERE workspace_id=$1 AND guid=$1",
    )
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
      r#"INSERT INTO search_projection.generations(
           id,provider,state,config_hash,schema_version,scan_high_water_sid,scan_cursor_sid
         ) VALUES($1,'embedded','building',$2,1,0,0)"#,
    )
    .bind(generation_id)
    .bind(config_hash(&config))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      r#"INSERT INTO search_projection.workspace_states(
           generation_id,workspace_id,target_root_revision,required_permission_version,pending_scope
         ) VALUES($1,$2,$3,3,'workspace')"#,
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .bind(initial_root)
    .execute(&pool)
    .await
    .unwrap();

    let first = claim_workspace(&pool, generation_id, &workspace_id)
      .await
      .unwrap()
      .unwrap();
    assert!(
      renew_workspace_lease(&pool, generation_id, &workspace_id, first.fence)
        .await
        .unwrap()
    );
    sqlx::query(
      "UPDATE search_projection.workspace_states SET lease_expires_at=now()-interval '1 second' WHERE \
       generation_id=$1 AND workspace_id=$2",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    assert!(
      !renew_workspace_lease(&pool, generation_id, &workspace_id, first.fence)
        .await
        .unwrap()
    );
    let checkpoint = first
      .progress
      .with_phase(WorkspacePhase::Documents {
        after_doc_id: Some("doc-7".to_string()),
      })
      .value();
    checkpoint_workspace(&pool, generation_id, &workspace_id, first.fence, checkpoint)
      .await
      .unwrap();
    sqlx::query(
      "UPDATE search_projection.workspace_states SET target_root_revision=target_root_revision+1, \
       required_permission_version=4 WHERE generation_id=$1 AND workspace_id=$2",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();

    let second = claim_workspace(&pool, generation_id, &workspace_id)
      .await
      .unwrap()
      .unwrap();
    assert_eq!(second.progress.captured_root_revision, initial_root);
    assert_eq!(second.progress.captured_permission_version, 3);
    sqlx::query(
      r#"INSERT INTO search_projection.document_states(
           generation_id,workspace_id,doc_id,target_source_version,target_source_exists
         ) VALUES($1,$2,'pending-doc',1,true)"#,
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    mark_workspace_failed(&pool, generation_id, &workspace_id, second.fence)
      .await
      .unwrap();
    let failed: (bool, Option<String>, Option<Value>, bool, String) = sqlx::query_as(
      r#"SELECT state.covered,state.last_error,state.progress,state.available_at='infinity'::timestamptz,
                generation.state
         FROM search_projection.workspace_states state
         JOIN search_projection.generations generation ON generation.id=state.generation_id
         WHERE state.generation_id=$1 AND state.workspace_id=$2"#,
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
      failed,
      (
        false,
        Some(WORKSPACE_RECONCILE_FAILED.to_string()),
        None,
        true,
        "building".to_string()
      )
    );

    let runtime = SearchRuntime::new(pool.clone(), config).unwrap();
    runtime.embedded.prepare_generation(generation_id).await;
    assert_eq!(runtime.reconcile_pending(1).await.unwrap(), 0);
    assert_eq!(
      sqlx::query_scalar::<_, String>("SELECT state FROM search_projection.generations WHERE id=$1")
        .bind(generation_id)
        .fetch_one(&pool)
        .await
        .unwrap(),
      "active"
    );
    assert_eq!(runtime.status().await.unwrap()["metrics"]["pendingPublications"], 0);

    sqlx::query("DELETE FROM search_projection.generations WHERE id=$1")
      .bind(generation_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
  }
}
