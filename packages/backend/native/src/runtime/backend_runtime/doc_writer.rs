use std::sync::Arc;

use affine_core::access_control::{
  DomainCommand, ReservedDocumentAccessDecision, authorize_reserved_document, classify_reserved_document,
};
use chrono::Duration;
use napi::{Result, bindgen_prelude::Buffer};
use sqlx::PgPool;

use super::{
  BackendRuntime, SourceIdentity,
  domain_command::{
    authorize_domain, invalidate_doc_blob_projection, lock_workspace_doc_update, lock_workspace_storage_shared,
    next_workspace_doc_update_timestamp, workspace_root_contains_active_doc,
  },
  invalidation::{InvalidationHintV1, InvalidationRuntime},
  napi_error,
  permission::PermissionAuthorizer,
};

#[napi_derive::napi(object)]
pub struct AppendWorkspaceDocUpdatesInputV1 {
  pub workspace_id: String,
  pub doc_id: String,
  pub updates: Vec<Buffer>,
  pub actor_user_id: String,
  pub write_intent: WorkspaceDocWriteIntentV1,
  pub permission_doc_id: Option<String>,
  pub expected_permission_generation: Option<i64>,
}

#[napi_derive::napi(string_enum = "snake_case")]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WorkspaceDocWriteIntentV1 {
  UpdateDoc,
  CreateDoc,
}

#[napi_derive::napi(object)]
pub struct AppendWorkspaceDocUpdatesTrustedInputV1 {
  pub workspace_id: String,
  pub doc_id: String,
  pub updates: Vec<Buffer>,
  pub editor_id: Option<String>,
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn append_workspace_doc_updates_v1(&self, input: AppendWorkspaceDocUpdatesInputV1) -> Result<i64> {
    let pool = self.pool().await?;
    let invalidation = self.invalidation.lock().await.as_ref().cloned();
    let config = self.config().map_err(super::to_napi_error)?;
    append_authorized_updates(
      &pool,
      invalidation,
      config.deployment,
      self.permission_telemetry.clone(),
      self.embedding_schema_ready().map_err(super::to_napi_error)?,
      input,
    )
    .await
  }

  #[napi]
  pub async fn append_workspace_doc_updates_trusted_v1(
    &self,
    input: AppendWorkspaceDocUpdatesTrustedInputV1,
  ) -> Result<i64> {
    let pool = self.pool().await?;
    let invalidation = self.invalidation.lock().await.as_ref().cloned();
    append_updates(
      &pool,
      invalidation,
      self.embedding_schema_ready().map_err(super::to_napi_error)?,
      input.workspace_id,
      input.doc_id,
      input.updates,
      input.editor_id,
    )
    .await
  }
}

async fn append_authorized_updates(
  pool: &PgPool,
  invalidation: Option<Arc<InvalidationRuntime>>,
  deployment: crate::runtime::Deployment,
  telemetry: super::permission::PermissionTelemetry,
  embedding_schema_ready: bool,
  input: AppendWorkspaceDocUpdatesInputV1,
) -> Result<i64> {
  if input.updates.is_empty() {
    return Ok(0);
  }
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| napi_error(format!("begin workspace doc update: {error}")))?;
  let permission_doc_id = input.permission_doc_id.as_deref().unwrap_or(&input.doc_id);
  lock_workspace_storage_shared(&mut transaction, &input.workspace_id)
    .await
    .map_err(super::to_napi_error)?;
  let mut locked_doc_ids = [&*input.doc_id, permission_doc_id];
  locked_doc_ids.sort_unstable();
  lock_workspace_doc_update(&mut transaction, &input.workspace_id, locked_doc_ids[0])
    .await
    .map_err(super::to_napi_error)?;
  if locked_doc_ids[1] != locked_doc_ids[0] {
    lock_workspace_doc_update(&mut transaction, &input.workspace_id, locked_doc_ids[1])
      .await
      .map_err(super::to_napi_error)?;
  }
  let authorizer = PermissionAuthorizer::with_telemetry(pool.clone(), deployment, telemetry);
  let classification = classify_reserved_document(&input.workspace_id, &input.doc_id);
  if authorize_reserved_document(&input.actor_user_id, classification) == ReservedDocumentAccessDecision::Denied {
    return Err(napi_error("domain_permission_denied"));
  }
  let reserved = input.doc_id == permission_doc_id && classification.is_valid_reserved();
  let write_intent = if reserved {
    WorkspaceDocWriteIntentV1::UpdateDoc
  } else {
    input.write_intent
  };
  match write_intent {
    WorkspaceDocWriteIntentV1::UpdateDoc => {
      let command = DomainCommand::UpdateDoc {
        doc_id: permission_doc_id.to_string(),
      };
      authorize_domain(
        &authorizer,
        &mut transaction,
        &input.actor_user_id,
        &input.workspace_id,
        Some(permission_doc_id),
        &command,
      )
      .await
      .map_err(super::to_napi_error)?;
      let source_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM snapshots WHERE workspace_id=$1 AND guid=$2) OR EXISTS(SELECT 1 FROM updates \
         WHERE workspace_id=$1 AND guid=$2)",
      )
      .bind(&input.workspace_id)
      .bind(permission_doc_id)
      .fetch_one(&mut *transaction)
      .await
      .map_err(|error| napi_error(format!("load workspace document source: {error}")))?;
      if !source_exists && !reserved {
        return Err(napi_error("doc_not_found"));
      }
    }
    WorkspaceDocWriteIntentV1::CreateDoc => {
      authorize_domain(
        &authorizer,
        &mut transaction,
        &input.actor_user_id,
        &input.workspace_id,
        None,
        &DomainCommand::CreateDoc,
      )
      .await
      .map_err(super::to_napi_error)?;
      if input.doc_id != input.workspace_id
        && !workspace_root_contains_active_doc(&mut transaction, &input.workspace_id, &input.doc_id)
          .await
          .map_err(super::to_napi_error)?
      {
        return Err(napi_error("doc_not_found"));
      }
    }
  }
  lock_permission_generation(
    &mut transaction,
    &input.workspace_id,
    input.expected_permission_generation,
  )
  .await?;
  append_updates_in(
    transaction,
    invalidation,
    embedding_schema_ready,
    input.workspace_id,
    input.doc_id,
    input.updates,
    Some(input.actor_user_id),
  )
  .await
}

pub(super) async fn append_updates(
  pool: &PgPool,
  invalidation: Option<Arc<InvalidationRuntime>>,
  embedding_schema_ready: bool,
  workspace_id: String,
  doc_id: String,
  updates: Vec<Buffer>,
  editor_id: Option<String>,
) -> Result<i64> {
  if updates.is_empty() {
    return Ok(0);
  }
  let transaction = pool
    .begin()
    .await
    .map_err(|error| napi_error(format!("begin workspace doc update: {error}")))?;
  append_updates_in(
    transaction,
    invalidation,
    embedding_schema_ready,
    workspace_id,
    doc_id,
    updates,
    editor_id,
  )
  .await
}

async fn append_updates_in(
  mut transaction: sqlx::Transaction<'_, sqlx::Postgres>,
  invalidation: Option<Arc<InvalidationRuntime>>,
  embedding_schema_ready: bool,
  workspace_id: String,
  doc_id: String,
  updates: Vec<Buffer>,
  editor_id: Option<String>,
) -> Result<i64> {
  lock_workspace_storage_shared(&mut transaction, &workspace_id)
    .await
    .map_err(super::to_napi_error)?;
  lock_workspace_doc_update(&mut transaction, &workspace_id, &doc_id)
    .await
    .map_err(super::to_napi_error)?;
  let now = next_workspace_doc_update_timestamp(&mut transaction, &workspace_id, &doc_id)
    .await
    .map_err(super::to_napi_error)?;
  invalidate_doc_blob_projection(&mut transaction, &workspace_id, &doc_id, embedding_schema_ready)
    .await
    .map_err(super::to_napi_error)?;
  let mut timestamp = 0;
  for (index, update) in updates.into_iter().enumerate() {
    let created_at = now + Duration::milliseconds(index as i64);
    sqlx::query("INSERT INTO updates(workspace_id,guid,blob,created_at,created_by) VALUES($1,$2,$3,$4,$5)")
      .bind(&workspace_id)
      .bind(&doc_id)
      .bind(update.to_vec())
      .bind(created_at)
      .bind(editor_id.as_deref())
      .execute(&mut *transaction)
      .await
      .map_err(|error| napi_error(format!("append workspace doc update: {error}")))?;
    timestamp = created_at.timestamp_millis();
  }
  transaction
    .commit()
    .await
    .map_err(|error| napi_error(format!("commit workspace doc update: {error}")))?;
  if let Some(invalidation) = invalidation {
    invalidation
      .publish(InvalidationHintV1::BlobSource {
        source: SourceIdentity::CurrentDoc { workspace_id, doc_id },
      })
      .await;
  }
  Ok(timestamp)
}

pub(super) async fn lock_permission_generation(
  transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  workspace_id: &str,
  expected: Option<i64>,
) -> Result<()> {
  sqlx::query(
    "INSERT INTO workspace_sync_permission_generations(workspace_id,generation) VALUES($1,0) ON CONFLICT DO NOTHING",
  )
  .bind(workspace_id)
  .execute(&mut **transaction)
  .await
  .map_err(|error| napi_error(format!("initialize sync permission generation: {error}")))?;
  let current = sqlx::query_scalar::<_, i64>(
    "SELECT generation FROM workspace_sync_permission_generations WHERE workspace_id=$1 FOR SHARE",
  )
  .bind(workspace_id)
  .fetch_one(&mut **transaction)
  .await
  .map_err(|error| napi_error(format!("lock sync permission generation: {error}")))?;
  if expected.is_some_and(|expected| current != expected) {
    return Err(napi_error("sync_permission_generation_changed"));
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use std::{future::Future, pin::Pin};

  use tokio::sync::Mutex;
  use uuid::Uuid;

  use super::*;
  use crate::runtime::backend_runtime::{
    RedisRuntimeConfig,
    invalidation::InvalidationTarget,
    tests::{pg_test_lock, runtime_from_database_url},
  };

  #[derive(Default)]
  struct RecordingTarget(Mutex<Vec<InvalidationHintV1>>);

  impl InvalidationTarget for RecordingTarget {
    fn invalidate<'a>(&'a self, hint: &'a InvalidationHintV1) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
      Box::pin(async move { self.0.lock().await.push(hint.clone()) })
    }
  }

  #[tokio::test]
  async fn append_commits_ordered_timestamps_and_invalidates_after_commit() -> anyhow::Result<()> {
    let _guard = pg_test_lock().lock().await;
    let Some(runtime) = runtime_from_database_url().await? else {
      return Ok(());
    };
    let suffix = Uuid::new_v4().simple().to_string();
    let workspace_id = format!("doc-writer-workspace-{suffix}");
    let doc_id = format!("doc-writer-doc-{suffix}");
    let pool = runtime
      .pool()
      .await
      .map_err(|error| anyhow::anyhow!(error.to_string()))?;
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    let user_id = format!("doc-writer-user-{suffix}");
    sqlx::query(
      "INSERT INTO users(id,name,email,registered,email_verified,disabled) VALUES($1,'Doc Writer',$2,true,now(),false)",
    )
    .bind(&user_id)
    .bind(format!("doc-writer-{suffix}@example.com"))
    .execute(&pool)
    .await?;
    sqlx::query("INSERT INTO workspace_access_policies(workspace_id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    sqlx::query("INSERT INTO workspace_members(workspace_id,user_id,role,state) VALUES($1,$2,'owner','active')")
      .bind(&workspace_id)
      .bind(&user_id)
      .execute(&pool)
      .await?;

    let target = Arc::new(RecordingTarget::default());
    let redis_url = std::env::var("INVALIDATION_REDIS_URL").ok();
    let invalidation =
      InvalidationRuntime::start(&RedisRuntimeConfig { url: redis_url.clone() }, false, target.clone()).await;
    *runtime.invalidation.lock().await = Some(invalidation.clone());

    let mut no_embedding = pool.begin().await?;
    sqlx::query("ALTER TABLE IF EXISTS embedding_sources RENAME TO embedding_sources_test_hidden")
      .execute(&mut *no_embedding)
      .await?;
    invalidate_doc_blob_projection(&mut no_embedding, &workspace_id, &doc_id, false).await?;
    no_embedding.rollback().await?;

    let first = runtime
      .append_workspace_doc_updates_trusted_v1(AppendWorkspaceDocUpdatesTrustedInputV1 {
        workspace_id: workspace_id.clone(),
        doc_id: doc_id.clone(),
        updates: vec![Buffer::from(vec![1]), Buffer::from(vec![2])],
        editor_id: None,
      })
      .await
      .map_err(|error| anyhow::anyhow!(error.to_string()))?;
    let second = runtime
      .append_workspace_doc_updates_trusted_v1(AppendWorkspaceDocUpdatesTrustedInputV1 {
        workspace_id: workspace_id.clone(),
        doc_id: doc_id.clone(),
        updates: vec![Buffer::from(vec![3])],
        editor_id: None,
      })
      .await
      .map_err(|error| anyhow::anyhow!(error.to_string()))?;

    let rows: Vec<i64> = sqlx::query_scalar(
      "SELECT floor(extract(epoch FROM created_at)*1000)::bigint FROM updates WHERE workspace_id=$1 AND guid=$2 ORDER \
       BY created_at",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .fetch_all(&pool)
    .await?;
    assert_eq!(rows.len(), 3);
    assert!(rows.windows(2).all(|rows| rows[0] < rows[1]));
    assert!(second > first);
    assert_eq!(target.0.lock().await.len(), 2);
    if redis_url.is_some() {
      assert_eq!(invalidation.health().published, 2);
    }

    let generation = runtime
      .get_sync_permission_generation_v1(workspace_id.clone())
      .await
      .map_err(|error| anyhow::anyhow!(error.to_string()))?;
    let mut revoke = pool.begin().await?;
    sqlx::query("UPDATE workspace_members SET state='suspended' WHERE workspace_id=$1 AND user_id=$2")
      .bind(&workspace_id)
      .bind(&user_id)
      .execute(&mut *revoke)
      .await?;
    let racing_pool = pool.clone();
    let racing_workspace_id = workspace_id.clone();
    let racing_doc_id = doc_id.clone();
    let racing_user_id = user_id.clone();
    let write = tokio::spawn(async move {
      append_authorized_updates(
        &racing_pool,
        None,
        crate::runtime::Deployment::Cloud,
        Default::default(),
        true,
        AppendWorkspaceDocUpdatesInputV1 {
          workspace_id: racing_workspace_id,
          doc_id: racing_doc_id,
          updates: vec![Buffer::from(vec![4])],
          actor_user_id: racing_user_id,
          write_intent: WorkspaceDocWriteIntentV1::UpdateDoc,
          permission_doc_id: None,
          expected_permission_generation: Some(generation),
        },
      )
      .await
    });
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    assert!(
      !write.is_finished(),
      "a write racing a pending revocation must wait for its permission facts"
    );
    revoke.commit().await?;
    assert!(write.await?.is_err());
    let unfenced = runtime
      .append_workspace_doc_updates_v1(AppendWorkspaceDocUpdatesInputV1 {
        workspace_id: workspace_id.clone(),
        doc_id: doc_id.clone(),
        updates: vec![Buffer::from(vec![5])],
        actor_user_id: user_id.clone(),
        write_intent: WorkspaceDocWriteIntentV1::UpdateDoc,
        permission_doc_id: None,
        expected_permission_generation: None,
      })
      .await;
    assert!(
      unfenced.is_err(),
      "omitting the generation must not bypass authorization"
    );
    assert_eq!(
      sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM updates WHERE workspace_id=$1 AND guid=$2")
        .bind(&workspace_id)
        .bind(&doc_id)
        .fetch_one(&pool)
        .await?,
      3
    );

    sqlx::query("UPDATE workspace_members SET state='active' WHERE workspace_id=$1 AND user_id=$2")
      .bind(&workspace_id)
      .bind(&user_id)
      .execute(&pool)
      .await?;
    let other_principal_id = format!("doc-writer-other-{suffix}");
    sqlx::query(
      "INSERT INTO doc_grants(workspace_id,doc_id,principal_type,principal_id,role) VALUES($1,$2,'user',$3,'reader')",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(&other_principal_id)
    .execute(&pool)
    .await?;
    let generation = runtime
      .get_sync_permission_generation_v1(workspace_id.clone())
      .await
      .map_err(|error| anyhow::anyhow!(error.to_string()))?;
    let acl_pool = PgPool::connect(&std::env::var("DATABASE_URL")?).await?;
    let mut fenced = pool.begin().await?;
    lock_workspace_doc_update(&mut fenced, &workspace_id, &doc_id).await?;
    let authorizer = PermissionAuthorizer::new(pool.clone(), crate::runtime::Deployment::Cloud);
    let decision = authorizer
      .authorize_doc_action_in(
        &mut fenced,
        &workspace_id,
        Some(&user_id),
        &doc_id,
        affine_core::access_control::DocAction::Update,
      )
      .await?;
    assert!(decision.allowed, "the permission snapshot must precede the ACL race");
    sqlx::query("UPDATE doc_grants SET role='commenter' WHERE workspace_id=$1 AND doc_id=$2 AND principal_id=$3")
      .bind(&workspace_id)
      .bind(&doc_id)
      .bind(&other_principal_id)
      .execute(&acl_pool)
      .await?;
    let fence_error = lock_permission_generation(&mut fenced, &workspace_id, Some(generation))
      .await
      .expect_err("an ACL generation bump after authorization must fence the write");
    assert!(fence_error.to_string().contains("sync_permission_generation_changed"));
    fenced.rollback().await?;
    assert_eq!(
      sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM updates WHERE workspace_id=$1 AND guid=$2")
        .bind(&workspace_id)
        .bind(&doc_id)
        .fetch_one(&pool)
        .await?,
      3
    );

    let generation = runtime
      .get_sync_permission_generation_v1(workspace_id.clone())
      .await
      .map_err(|error| anyhow::anyhow!(error.to_string()))?;
    let mut delete = pool.begin().await?;
    lock_workspace_doc_update(&mut delete, &workspace_id, &doc_id).await?;
    sqlx::query("DELETE FROM updates WHERE workspace_id=$1 AND guid=$2")
      .bind(&workspace_id)
      .bind(&doc_id)
      .execute(&mut *delete)
      .await?;
    let racing_pool = pool.clone();
    let racing_workspace_id = workspace_id.clone();
    let racing_doc_id = doc_id.clone();
    let racing_user_id = user_id.clone();
    let write = tokio::spawn(async move {
      append_authorized_updates(
        &racing_pool,
        None,
        crate::runtime::Deployment::Cloud,
        Default::default(),
        true,
        AppendWorkspaceDocUpdatesInputV1 {
          workspace_id: racing_workspace_id,
          doc_id: racing_doc_id,
          updates: vec![Buffer::from(vec![6])],
          actor_user_id: racing_user_id,
          write_intent: WorkspaceDocWriteIntentV1::UpdateDoc,
          permission_doc_id: None,
          expected_permission_generation: Some(generation),
        },
      )
      .await
    });
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    assert!(
      !write.is_finished(),
      "a write must wait for an in-flight document delete"
    );
    delete.commit().await?;
    assert!(write.await?.is_err(), "a write must not recreate a deleted document");

    for (reserved_doc_id, allowed) in [
      (format!("db${workspace_id}$docProperties"), true),
      (format!("userdata${user_id}${workspace_id}$settings"), true),
      (format!("userdata$another-user${workspace_id}$settings"), false),
      (format!("db${workspace_id}$unknown"), false),
    ] {
      let result = runtime
        .append_workspace_doc_updates_v1(AppendWorkspaceDocUpdatesInputV1 {
          workspace_id: workspace_id.clone(),
          doc_id: reserved_doc_id.clone(),
          updates: vec![Buffer::from(vec![0, 0])],
          actor_user_id: user_id.clone(),
          write_intent: WorkspaceDocWriteIntentV1::CreateDoc,
          permission_doc_id: None,
          expected_permission_generation: None,
        })
        .await;
      assert_eq!(result.is_ok(), allowed, "{reserved_doc_id}: {result:?}");
    }

    let creating_doc_id = format!("doc-writer-creating-{suffix}");
    let root = affine_doc_loader::add_doc_to_root_doc(vec![0, 0], &creating_doc_id, None)?;
    sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,size,updated_at) VALUES($1,$1,$2,$3,now())")
      .bind(&workspace_id)
      .bind(&root)
      .bind(root.len() as i64)
      .execute(&pool)
      .await?;
    runtime
      .execute_domain_command_v1(serde_json::json!({
        "command": "apply_doc_lifecycle",
        "actorUserId": user_id.clone(),
        "workspaceId": workspace_id.clone(),
        "docId": creating_doc_id.clone(),
        "lifecycle": "delete"
      }))
      .await
      .map_err(|error| anyhow::anyhow!(error.to_string()))?;
    let create_after_delete = runtime
      .append_workspace_doc_updates_v1(AppendWorkspaceDocUpdatesInputV1 {
        workspace_id: workspace_id.clone(),
        doc_id: creating_doc_id,
        updates: vec![Buffer::from(vec![7])],
        actor_user_id: user_id.clone(),
        write_intent: WorkspaceDocWriteIntentV1::CreateDoc,
        permission_doc_id: None,
        expected_permission_generation: None,
      })
      .await;
    assert!(
      create_after_delete.is_err(),
      "document creation must recheck root membership after a committed delete"
    );

    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await?;
    runtime
      .stop()
      .await
      .map_err(|error| anyhow::anyhow!(error.to_string()))?;
    Ok(())
  }
}
