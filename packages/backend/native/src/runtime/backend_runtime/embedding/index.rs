use sqlx::{PgPool, Row};
use uuid::Uuid;

use super::{EmbeddingTarget, RuntimeError, RuntimeResult, WorkspaceEmbeddingState};

pub(super) async fn sync_workspace(
  pool: &PgPool,
  workspace_id: &str,
  enabled: bool,
  target: Option<EmbeddingTarget>,
) -> RuntimeResult<WorkspaceEmbeddingState> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("sync embedding workspace transaction failed", error))?;
  sqlx::query(
    r#"
    INSERT INTO embedding_workspace_states (workspace_id, runtime_state)
    VALUES ($1, 'unavailable')
    ON CONFLICT (workspace_id) DO NOTHING
    "#,
  )
  .bind(workspace_id)
  .execute(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("create embedding workspace state failed", error))?;
  let current = sqlx::query(
    "SELECT active_index_id, index_epoch, runtime_state FROM embedding_workspace_states WHERE workspace_id = $1 FOR \
     UPDATE",
  )
  .bind(workspace_id)
  .fetch_one(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("lock embedding workspace state failed", error))?;
  let old_index: Option<Uuid> = current
    .try_get("active_index_id")
    .map_err(|error| RuntimeError::database("decode embedding active index failed", error))?;

  let (active_index, runtime_state, reason_code) = if !enabled {
    (None, "disabled", Some("workspace_embedding_disabled"))
  } else if let Some(target) = target {
    let id = sqlx::query_scalar::<_, Uuid>(
      r#"
      INSERT INTO embedding_indexes (
        id, workspace_id, fingerprint, route_source, provider, model_id,
        endpoint_fingerprint, contract_version, health_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'pending')
      ON CONFLICT (workspace_id, fingerprint) DO UPDATE
      SET inactive_at = NULL, activated_at = now(), updated_at = now()
      RETURNING id
      "#,
    )
    .bind(Uuid::new_v4())
    .bind(workspace_id)
    .bind(target.fingerprint)
    .bind(target.route_source)
    .bind(target.provider)
    .bind(target.model_id)
    .bind(target.endpoint_fingerprint)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("upsert embedding index failed", error))?;
    (Some(id), "active", None)
  } else {
    (None, "unavailable", Some("embedding_route_unavailable"))
  };

  if old_index != active_index {
    if let Some(old_index) = old_index {
      sqlx::query("UPDATE embedding_indexes SET inactive_at = now(), updated_at = now() WHERE id = $1")
        .bind(old_index)
        .execute(&mut *transaction)
        .await
        .map_err(|error| RuntimeError::database("deactivate embedding index failed", error))?;
    }
    if let Some(active_index) = active_index {
      sqlx::query(
        "UPDATE embedding_indexes SET inactive_at = NULL, activated_at = now(), updated_at = now() WHERE id = $1",
      )
      .bind(active_index)
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("activate embedding index failed", error))?;
      sqlx::query(
        r#"
        INSERT INTO embedding_projections (source_id, index_id, status, priority)
        SELECT id, $2, 'pending', CASE source_kind WHEN 'artifact' THEN 200 ELSE 100 END
        FROM embedding_sources
        WHERE workspace_id = $1 AND deleted_at IS NULL
        ON CONFLICT (source_id, index_id) DO NOTHING
        "#,
      )
      .bind(workspace_id)
      .bind(active_index)
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("reconcile embedding projections failed", error))?;
    }
  }

  let state = sqlx::query_as::<_, WorkspaceEmbeddingState>(
    r#"
    UPDATE embedding_workspace_states
    SET active_index_id = $2,
        index_epoch = index_epoch + CASE WHEN active_index_id IS DISTINCT FROM $2 THEN 1 ELSE 0 END,
        runtime_state = $3,
        reason_code = $4,
        changed_at = now()
    WHERE workspace_id = $1
    RETURNING workspace_id, active_index_id, index_epoch, runtime_state, reason_code
    "#,
  )
  .bind(workspace_id)
  .bind(active_index)
  .bind(runtime_state)
  .bind(reason_code)
  .fetch_one(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("update embedding workspace state failed", error))?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("sync embedding workspace commit failed", error))?;
  Ok(state)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn target(fingerprint: &str) -> EmbeddingTarget {
    EmbeddingTarget {
      fingerprint: fingerprint.to_string(),
      route_source: "byok".to_string(),
      provider: "openai".to_string(),
      model_id: "embedding-model".to_string(),
      endpoint_fingerprint: "endpoint".to_string(),
    }
  }

  #[tokio::test]
  async fn exact_index_switch_is_idempotent_and_switches_back() {
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let _guard = crate::runtime::migrations::EMBEDDING_TEST_LOCK.lock().await;
    let pool = PgPool::connect(&database_url).await.unwrap();
    assert!(
      crate::runtime::migrations::migrate_embedding_tables(&pool)
        .await
        .enabled
    );
    let workspace_id = format!("rust-test-index-{}", Uuid::new_v4());
    let first = sync_workspace(&pool, &workspace_id, true, Some(target("a")))
      .await
      .unwrap();
    let repeated = sync_workspace(&pool, &workspace_id, true, Some(target("a")))
      .await
      .unwrap();
    assert_eq!(first.active_index_id, repeated.active_index_id);
    assert_eq!(first.index_epoch, repeated.index_epoch);
    let failed_probe = super::super::store::claim_index_probe_for_workspace(&pool, "probe-a", &workspace_id)
      .await
      .unwrap()
      .unwrap();
    super::super::store::fail_index_probe(&pool, &failed_probe, "provider_unavailable")
      .await
      .unwrap();
    let failed_status: String = sqlx::query_scalar("SELECT health_status FROM embedding_indexes WHERE id=$1")
      .bind(first.active_index_id.unwrap())
      .fetch_one(&pool)
      .await
      .unwrap();
    assert_eq!(failed_status, "retry_wait");
    sqlx::query("UPDATE embedding_indexes SET next_probe_at=now()-interval '1 second' WHERE id=$1")
      .bind(first.active_index_id.unwrap())
      .execute(&pool)
      .await
      .unwrap();
    let recovered_probe = super::super::store::claim_index_probe_for_workspace(&pool, "probe-b", &workspace_id)
      .await
      .unwrap()
      .unwrap();
    super::super::store::complete_index_probe(&pool, &recovered_probe)
      .await
      .unwrap();
    let recovered_status: String = sqlx::query_scalar("SELECT health_status FROM embedding_indexes WHERE id=$1")
      .bind(first.active_index_id.unwrap())
      .fetch_one(&pool)
      .await
      .unwrap();
    assert_eq!(recovered_status, "ready");
    let switched = sync_workspace(&pool, &workspace_id, true, Some(target("b")))
      .await
      .unwrap();
    assert_ne!(first.active_index_id, switched.active_index_id);
    assert_eq!(switched.index_epoch, first.index_epoch + 1);
    let switched_back = sync_workspace(&pool, &workspace_id, true, Some(target("a")))
      .await
      .unwrap();
    assert_eq!(first.active_index_id, switched_back.active_index_id);
    assert_eq!(switched_back.index_epoch, switched.index_epoch + 1);
    let disabled = sync_workspace(&pool, &workspace_id, false, None).await.unwrap();
    assert_eq!(disabled.runtime_state, "disabled");
    assert!(disabled.active_index_id.is_none());
    sqlx::query("DELETE FROM embedding_workspace_states WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM embedding_indexes WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
  }
}
