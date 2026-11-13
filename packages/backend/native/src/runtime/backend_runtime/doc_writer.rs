use std::sync::Arc;

use affine_core::access_control::{DomainCommand, classify_reserved_document};
use chrono::Duration;
use napi::{Result, bindgen_prelude::Buffer};
use sqlx::{PgPool, Postgres, Transaction};
use y_octo::Update;

use super::{
  BackendRuntime, RuntimeError, RuntimeResult, SourceIdentity, blocking,
  domain_command::{
    authorize_doc_creation_in, invalidate_doc_blob_projection, invalidate_workspace_inventory_in,
    lock_workspace_doc_update, lock_workspace_storage_shared, next_workspace_doc_update_timestamp,
  },
  ensure_doc_not_deleted_in, ensure_workspace_sync_protocol_in,
  invalidation::{InvalidationHintV1, InvalidationRuntime},
  is_ordinary_workspace_doc, load_command_quota_in, napi_error,
  permission::PermissionAuthorizer,
};

#[napi_derive::napi(object)]
pub struct AppendWorkspaceDocUpdatesInputV1 {
  pub workspace_id: String,
  pub doc_id: String,
  pub updates: Vec<Buffer>,
  pub actor_user_id: String,
  pub write_intent: WorkspaceDocWriteIntentV1,
  pub expected_permission_generation: Option<i64>,
  pub protocol_version: Option<u32>,
}

#[napi_derive::napi(object)]
#[derive(Debug)]
pub struct WorkspaceDocWriteResultV1 {
  pub timestamp: i64,
  pub created: bool,
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
  pub async fn append_workspace_doc_updates_v1(
    &self,
    input: AppendWorkspaceDocUpdatesInputV1,
  ) -> Result<WorkspaceDocWriteResultV1> {
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
) -> Result<WorkspaceDocWriteResultV1> {
  if input.updates.is_empty() {
    return Ok(WorkspaceDocWriteResultV1 {
      timestamp: 0,
      created: false,
    });
  }
  validate_doc_updates(&input.updates, input.doc_id == input.workspace_id).await?;
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| napi_error(format!("begin workspace doc update: {error}")))?;
  lock_workspace_storage_shared(&mut transaction, &input.workspace_id).await?;
  ensure_workspace_sync_protocol_in(&mut transaction, &input.workspace_id, input.protocol_version).await?;
  lock_workspace_doc_update(&mut transaction, &input.workspace_id, &input.doc_id).await?;
  let classification = classify_reserved_document(&input.workspace_id, &input.doc_id);
  let reserved = input.doc_id == input.workspace_id || classification.is_valid_reserved();
  let source_exists: bool = sqlx::query_scalar(
    "SELECT EXISTS(SELECT 1 FROM snapshots WHERE workspace_id=$1 AND guid=$2) OR EXISTS(SELECT 1 FROM updates WHERE \
     workspace_id=$1 AND guid=$2)",
  )
  .bind(&input.workspace_id)
  .bind(&input.doc_id)
  .fetch_one(&mut *transaction)
  .await
  .map_err(|error| napi_error(format!("load workspace document source: {error}")))?;
  if !source_exists && !reserved && input.write_intent == WorkspaceDocWriteIntentV1::UpdateDoc {
    return Err(napi_error("doc_not_found"));
  }
  let authorizer = PermissionAuthorizer::with_telemetry(pool.clone(), deployment, telemetry);
  let creating = !source_exists && !reserved;
  let assign_owner = if creating {
    authorize_doc_creation_in(
      &authorizer,
      &mut transaction,
      &input.actor_user_id,
      &input.workspace_id,
      &input.doc_id,
      input.expected_permission_generation,
    )
    .await?
  } else {
    let quota = load_command_quota_in(&mut transaction, deployment, &input.workspace_id, false).await?;
    lock_permission_generation(
      &mut transaction,
      &input.workspace_id,
      input.expected_permission_generation,
    )
    .await?;
    let command = if input.doc_id == input.workspace_id {
      DomainCommand::AppendRootUpdate {
        doc_id: input.doc_id.clone(),
      }
    } else {
      DomainCommand::UpdateDoc {
        doc_id: input.doc_id.clone(),
      }
    };
    authorizer
      .authorize_command_in(
        &mut transaction,
        &input.actor_user_id,
        &input.workspace_id,
        Some(&input.doc_id),
        &command,
        quota.as_ref().map(|quota| quota.facts()),
      )
      .await?;
    false
  };
  if assign_owner {
    sqlx::query(
      "INSERT INTO doc_grants(workspace_id,doc_id,principal_type,principal_id,role,granted_by) \
       VALUES($1,$2,'user',$3,'owner',$3)",
    )
    .bind(&input.workspace_id)
    .bind(&input.doc_id)
    .bind(&input.actor_user_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| napi_error(format!("assign initial document owner: {error}")))?;
  }
  let timestamp = append_updates_in(
    &mut transaction,
    embedding_schema_ready,
    &input.workspace_id,
    &input.doc_id,
    input.updates,
    Some(&input.actor_user_id),
  )
  .await?;
  if creating {
    invalidate_workspace_inventory_in(&mut transaction, &input.workspace_id).await?;
  }
  transaction
    .commit()
    .await
    .map_err(|error| napi_error(format!("commit workspace doc update: {error}")))?;
  publish_update(invalidation, input.workspace_id, input.doc_id, creating).await;
  Ok(WorkspaceDocWriteResultV1 {
    timestamp,
    created: creating,
  })
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
  validate_doc_updates(&updates, workspace_id == doc_id).await?;
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| napi_error(format!("begin workspace doc update: {error}")))?;
  lock_workspace_storage_shared(&mut transaction, &workspace_id).await?;
  lock_workspace_doc_update(&mut transaction, &workspace_id, &doc_id).await?;
  ensure_doc_not_deleted_in(&mut transaction, &workspace_id, &doc_id).await?;
  let source_exists: bool = sqlx::query_scalar(
    "SELECT EXISTS(SELECT 1 FROM snapshots WHERE workspace_id=$1 AND guid=$2) OR EXISTS(SELECT 1 FROM updates WHERE \
     workspace_id=$1 AND guid=$2)",
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .fetch_one(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("load trusted document source", error))?;
  let created = !source_exists && is_ordinary_workspace_doc(&workspace_id, &doc_id);
  let timestamp = append_updates_in(
    &mut transaction,
    embedding_schema_ready,
    &workspace_id,
    &doc_id,
    updates,
    editor_id.as_deref(),
  )
  .await?;
  if created {
    invalidate_workspace_inventory_in(&mut transaction, &workspace_id).await?;
  }
  transaction
    .commit()
    .await
    .map_err(|error| napi_error(format!("commit workspace doc update: {error}")))?;
  publish_update(invalidation, workspace_id, doc_id, created).await;
  Ok(timestamp)
}

pub(super) async fn append_updates_in(
  transaction: &mut Transaction<'_, Postgres>,
  embedding_schema_ready: bool,
  workspace_id: &str,
  doc_id: &str,
  updates: Vec<Buffer>,
  editor_id: Option<&str>,
) -> RuntimeResult<i64> {
  let now = next_workspace_doc_update_timestamp(transaction, workspace_id, doc_id).await?;
  invalidate_doc_blob_projection(transaction, workspace_id, doc_id, embedding_schema_ready).await?;
  let mut timestamp = 0;
  for (index, update) in updates.into_iter().enumerate() {
    let created_at = now + Duration::milliseconds(index as i64);
    sqlx::query("INSERT INTO updates(workspace_id,guid,blob,created_at,created_by) VALUES($1,$2,$3,$4,$5)")
      .bind(workspace_id)
      .bind(doc_id)
      .bind(update.to_vec())
      .bind(created_at)
      .bind(editor_id)
      .execute(&mut **transaction)
      .await
      .map_err(|error| RuntimeError::database("append workspace doc update", error))?;
    timestamp = created_at.timestamp_millis();
  }
  Ok(timestamp)
}

async fn publish_update(
  invalidation: Option<Arc<InvalidationRuntime>>,
  workspace_id: String,
  doc_id: String,
  inventory_changed: bool,
) {
  if let Some(invalidation) = invalidation {
    if inventory_changed {
      invalidation
        .publish(InvalidationHintV1::WorkspaceInventoryChanged {
          workspace_id: workspace_id.clone(),
        })
        .await;
    }
    invalidation
      .publish(InvalidationHintV1::BlobSource {
        source: SourceIdentity::CurrentDoc { workspace_id, doc_id },
      })
      .await;
  }
}

pub(in crate::runtime) async fn validate_doc_updates(updates: &[Buffer], root: bool) -> RuntimeResult<()> {
  const MAX_UPDATE_BYTES: usize = 32 * 1024 * 1024;
  if updates.iter().any(|update| update.len() > MAX_UPDATE_BYTES)
    || (root && updates.iter().map(|update| update.len()).sum::<usize>() > MAX_UPDATE_BYTES)
  {
    return Err(RuntimeError::invalid_input("doc_update_too_large"));
  }
  let permit = super::try_validation_slot().map_err(|_| RuntimeError::invalid_state("doc_validation_unavailable"))?;
  let updates = updates.iter().map(|update| update.to_vec()).collect::<Vec<_>>();
  tokio::time::timeout(
    std::time::Duration::from_secs(1),
    blocking::spawn(permit, move || {
      updates.into_iter().try_for_each(|update| {
        Update::decode_v1(update)
          .map(|_| ())
          .map_err(|_| RuntimeError::invalid_input("doc_update_invalid"))
      })
    }),
  )
  .await
  .map_err(|_| RuntimeError::invalid_state("doc_validation_unavailable"))?
  .map_err(|_| RuntimeError::invalid_state("doc_validation_unavailable"))?
}

pub(in crate::runtime) async fn lock_permission_generation(
  transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  workspace_id: &str,
  expected: Option<i64>,
) -> RuntimeResult<()> {
  sqlx::query(
    "INSERT INTO workspace_sync_permission_generations(workspace_id,generation) VALUES($1,0) ON CONFLICT DO NOTHING",
  )
  .bind(workspace_id)
  .execute(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("initialize sync permission generation", error))?;
  let current = sqlx::query_scalar::<_, i64>(
    "SELECT generation FROM workspace_sync_permission_generations WHERE workspace_id=$1 FOR SHARE",
  )
  .bind(workspace_id)
  .fetch_one(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("lock sync permission generation", error))?;
  if expected.is_some_and(|expected| current != expected) {
    return Err(RuntimeError::invalid_state("sync_permission_generation_changed"));
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

    assert!(
      runtime
        .append_workspace_doc_updates_trusted_v1(AppendWorkspaceDocUpdatesTrustedInputV1 {
          workspace_id: workspace_id.clone(),
          doc_id: doc_id.clone(),
          updates: vec![Buffer::from(vec![0, 0]), Buffer::from(vec![0xff])],
          editor_id: None,
        })
        .await
        .is_err()
    );
    assert_eq!(
      sqlx::query_scalar::<_, i64>("SELECT count(*) FROM updates WHERE workspace_id=$1 AND guid=$2")
        .bind(&workspace_id)
        .bind(&doc_id)
        .fetch_one(&pool)
        .await?,
      0
    );
    let first = runtime
      .append_workspace_doc_updates_trusted_v1(AppendWorkspaceDocUpdatesTrustedInputV1 {
        workspace_id: workspace_id.clone(),
        doc_id: doc_id.clone(),
        updates: vec![Buffer::from(vec![0, 0]), Buffer::from(vec![0, 0])],
        editor_id: None,
      })
      .await
      .map_err(|error| anyhow::anyhow!(error.to_string()))?;
    let second = runtime
      .append_workspace_doc_updates_trusted_v1(AppendWorkspaceDocUpdatesTrustedInputV1 {
        workspace_id: workspace_id.clone(),
        doc_id: doc_id.clone(),
        updates: vec![Buffer::from(vec![0, 0])],
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
    assert_eq!(target.0.lock().await.len(), 3);
    if redis_url.is_some() {
      assert_eq!(invalidation.health().published, 3);
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
          updates: vec![Buffer::from(vec![0, 0])],
          actor_user_id: racing_user_id,
          write_intent: WorkspaceDocWriteIntentV1::UpdateDoc,

          protocol_version: None,
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
        updates: vec![Buffer::from(vec![0, 0])],
        actor_user_id: user_id.clone(),
        write_intent: WorkspaceDocWriteIntentV1::UpdateDoc,

        protocol_version: None,
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
          updates: vec![Buffer::from(vec![0, 0])],
          actor_user_id: racing_user_id,
          write_intent: WorkspaceDocWriteIntentV1::UpdateDoc,

          protocol_version: None,
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

          protocol_version: None,
          expected_permission_generation: None,
        })
        .await;
      assert_eq!(result.is_ok(), allowed, "{reserved_doc_id}: {result:?}");
    }

    let creating_doc_id = format!("doc-writer-creating-{suffix}");
    let input = |doc_id: &str, intent| AppendWorkspaceDocUpdatesInputV1 {
      workspace_id: workspace_id.clone(),
      doc_id: doc_id.into(),
      updates: vec![Buffer::from(vec![0, 0])],
      actor_user_id: user_id.clone(),
      write_intent: intent,

      protocol_version: Some(2),
      expected_permission_generation: None,
    };
    let (first, retry) = tokio::join!(
      runtime.append_workspace_doc_updates_v1(input(&creating_doc_id, WorkspaceDocWriteIntentV1::CreateDoc)),
      runtime.append_workspace_doc_updates_v1(input(&creating_doc_id, WorkspaceDocWriteIntentV1::CreateDoc))
    );
    let first = first?;
    let retry = retry?;
    assert_ne!(first.created, retry.created);
    assert_eq!(
      sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2 AND principal_id=$3 AND role='owner'"
      )
      .bind(&workspace_id)
      .bind(&creating_doc_id)
      .bind(&user_id)
      .fetch_one(&pool)
      .await?,
      1
    );
    let mut shared = pool.begin().await?;
    load_command_quota_in(&mut shared, crate::runtime::Deployment::Cloud, &workspace_id, false).await?;
    lock_permission_generation(&mut shared, &workspace_id, None).await?;
    let concurrent = tokio::time::timeout(
      std::time::Duration::from_secs(2),
      runtime.append_workspace_doc_updates_v1(input(&creating_doc_id, WorkspaceDocWriteIntentV1::UpdateDoc)),
    )
    .await;
    shared.rollback().await?;
    assert!(
      concurrent?.is_ok(),
      "unrelated shared quota readers must permit document updates"
    );
    let failed_id = format!("failed-{suffix}");
    sqlx::query(
      "CREATE OR REPLACE FUNCTION rfc21_test_fail_append() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.guid \
       LIKE 'failed-%' THEN RAISE EXCEPTION 'injected append failure'; END IF; RETURN NEW; END $$",
    )
    .execute(&pool)
    .await?;
    sqlx::query(
      "CREATE TRIGGER rfc21_test_fail_append BEFORE INSERT ON updates FOR EACH ROW EXECUTE FUNCTION \
       rfc21_test_fail_append()",
    )
    .execute(&pool)
    .await?;
    let failed = runtime
      .append_workspace_doc_updates_v1(input(&failed_id, WorkspaceDocWriteIntentV1::CreateDoc))
      .await;
    sqlx::query("DROP TRIGGER rfc21_test_fail_append ON updates")
      .execute(&pool)
      .await?;
    sqlx::query("DROP FUNCTION rfc21_test_fail_append()")
      .execute(&pool)
      .await?;
    assert!(failed.is_err());
    assert_eq!(
      sqlx::query_scalar::<_, i64>("SELECT count(*) FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2")
        .bind(&workspace_id)
        .bind(&failed_id)
        .fetch_one(&pool)
        .await?,
      0
    );

    let bound_id = format!("bound-{suffix}");
    sqlx::query(
      "INSERT INTO doc_grants(workspace_id,doc_id,principal_type,principal_id,role) \
       VALUES($1,$2,'user','previous-owner','owner')",
    )
    .bind(&workspace_id)
    .bind(&bound_id)
    .execute(&pool)
    .await?;
    assert!(
      runtime
        .append_workspace_doc_updates_v1(input(&bound_id, WorkspaceDocWriteIntentV1::CreateDoc))
        .await?
        .created
    );
    assert_eq!(
      sqlx::query_scalar::<_, String>(
        "SELECT principal_id FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2 AND role='owner'"
      )
      .bind(&workspace_id)
      .bind(&bound_id)
      .fetch_one(&pool)
      .await?,
      "previous-owner"
    );

    for lifecycle in ["trash", "restore", "trash", "delete"] {
      let output = runtime.execute_domain_command_v1(serde_json::json!({"command":"apply_doc_lifecycle","actorUserId":user_id,"workspaceId":workspace_id,"docId":creating_doc_id,"lifecycle":lifecycle})).await?;
      assert!(output.get("rootUpdate").is_none());
      assert!(output["timestamp"].is_i64());
      if lifecycle == "trash" {
        assert!(
          !runtime
            .append_workspace_doc_updates_v1(input(&creating_doc_id, WorkspaceDocWriteIntentV1::UpdateDoc))
            .await?
            .created
        );
      }
    }
    for intent in [
      WorkspaceDocWriteIntentV1::CreateDoc,
      WorkspaceDocWriteIntentV1::UpdateDoc,
    ] {
      assert!(
        runtime
          .append_workspace_doc_updates_v1(input(&creating_doc_id, intent))
          .await
          .is_err()
      );
    }
    assert!(
      runtime
        .append_workspace_doc_updates_trusted_v1(AppendWorkspaceDocUpdatesTrustedInputV1 {
          workspace_id: workspace_id.clone(),
          doc_id: creating_doc_id.clone(),
          updates: vec![Buffer::from(vec![0, 0])],
          editor_id: Some(user_id.clone())
        })
        .await
        .is_err()
    );
    assert!(
      runtime
        .upsert_doc_snapshot(
          workspace_id.clone(),
          creating_doc_id.clone(),
          Buffer::from(vec![0, 0, 0]),
          chrono::Utc::now().timestamp_millis(),
          None
        )
        .await
        .is_err()
    );
    assert!(runtime.execute_domain_command_v1(serde_json::json!({"command":"apply_doc_lifecycle","actorUserId":user_id,"workspaceId":workspace_id,"docId":creating_doc_id,"lifecycle":"restore"})).await.is_err());
    assert_eq!(
      sqlx::query_scalar::<_, String>(
        "SELECT lifecycle_state::text FROM workspace_pages WHERE workspace_id=$1 AND page_id=$2"
      )
      .bind(&workspace_id)
      .bind(&creating_doc_id)
      .fetch_one(&pool)
      .await?,
      "deleted"
    );

    use super::super::workspace_state::{WorkspaceLegacyDocV1, WorkspaceLifecycleMigrationInputV1};
    sqlx::query(
      "DELETE FROM storage_reconciliation_checkpoints WHERE kind='workspace_doc_lifecycle_activation' AND \
       scope='global'",
    )
    .execute(&pool)
    .await?;
    assert!(
      runtime
        .list_workspace_lifecycle_migration_candidates_v1()
        .await?
        .is_empty()
    );
    assert!(
      runtime
        .prepare_workspace_lifecycle_migration_v1(workspace_id.clone())
        .await
        .err()
        .unwrap()
        .to_string()
        .contains("workspace_lifecycle_not_active")
    );
    let inactive_id = format!("inactive-{suffix}");
    assert!(
      runtime
        .migrate_workspace_lifecycle_v1(WorkspaceLifecycleMigrationInputV1 {
          workspace_id: workspace_id.clone(),
          source_revision: String::new(),
          root_status: "absent".into(),
          docs: vec![WorkspaceLegacyDocV1 {
            doc_id: inactive_id.clone(),
            trashed: true
          }],
        })
        .await
        .unwrap_err()
        .to_string()
        .contains("workspace_lifecycle_not_active")
    );
    let changed: i64 = sqlx::query_scalar(
      "SELECT (SELECT count(*) FROM storage_reconciliation_checkpoints WHERE kind IN \
       ('workspace_doc_lifecycle_activation','workspace_doc_lifecycle') AND (scope='global' OR scope=$1))+(SELECT \
       count(*) FROM updates WHERE workspace_id=$1 AND guid=$2)+(SELECT count(*) FROM workspace_pages WHERE \
       workspace_id=$1 AND page_id=$2)",
    )
    .bind(&workspace_id)
    .bind(&inactive_id)
    .fetch_one(&pool)
    .await?;
    assert_eq!(changed, 0);
    assert!(runtime.activate_workspace_lifecycle_v1().await?);
    assert!(!runtime.activate_workspace_lifecycle_v1().await?);

    let root_source = y_octo::Doc::with_client(7);
    root_source.get_or_create_text("text")?.insert(0, "ab")?;
    let partial = root_source.encode_state_as_update_v1(&y_octo::StateVector::from([(7, 1)]))?;
    let stale = runtime
      .prepare_workspace_lifecycle_migration_v1(workspace_id.clone())
      .await?;
    let mut root_input = input(&workspace_id, WorkspaceDocWriteIntentV1::UpdateDoc);
    root_input.updates = vec![Buffer::from(partial.clone())];
    runtime.append_workspace_doc_updates_v1(root_input).await?;
    let root = runtime
      .get_current_workspace_doc_v1(workspace_id.clone(), workspace_id.clone())
      .await?
      .unwrap();
    assert_eq!(root.bin.as_ref(), partial.as_slice());
    assert!(
      !runtime
        .migrate_workspace_lifecycle_v1(WorkspaceLifecycleMigrationInputV1 {
          workspace_id: workspace_id.clone(),
          source_revision: stale.revision,
          root_status: stale.root_status,
          docs: vec![]
        })
        .await?
    );
    let source = runtime
      .prepare_workspace_lifecycle_migration_v1(workspace_id.clone())
      .await?;
    let legacy_id = format!("legacy-{suffix}");
    sqlx::query(
      "INSERT INTO workspace_pages(workspace_id,page_id,lifecycle_state,lifecycle_changed_at) VALUES($1,$2,NULL,now())",
    )
    .bind(&workspace_id)
    .bind(&bound_id)
    .execute(&pool)
    .await?;
    let migration_input = || WorkspaceLifecycleMigrationInputV1 {
      workspace_id: workspace_id.clone(),
      source_revision: source.revision.clone(),
      root_status: source.root_status.clone(),
      docs: vec![
        WorkspaceLegacyDocV1 {
          doc_id: legacy_id.clone(),
          trashed: true,
        },
        WorkspaceLegacyDocV1 {
          doc_id: bound_id.clone(),
          trashed: true,
        },
        WorkspaceLegacyDocV1 {
          doc_id: creating_doc_id.clone(),
          trashed: false,
        },
      ],
    };
    let (foreground, background) = tokio::join!(
      runtime.migrate_workspace_lifecycle_v1(migration_input()),
      runtime.migrate_workspace_lifecycle_v1(migration_input())
    );
    assert!(foreground?);
    assert!(background?);
    let seeded: i64 = sqlx::query_scalar("SELECT count(*) FROM updates WHERE workspace_id=$1 AND guid=$2")
      .bind(&workspace_id)
      .bind(&legacy_id)
      .fetch_one(&pool)
      .await?;
    assert_eq!(seeded, 1);
    assert!(
      runtime
        .prepare_workspace_lifecycle_migration_v1(workspace_id.clone())
        .await?
        .completed
    );
    let second_workspace = format!("second-{suffix}");
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&second_workspace)
      .execute(&pool)
      .await?;
    assert!(
      runtime
        .list_workspace_lifecycle_migration_candidates_v1()
        .await?
        .contains(&second_workspace)
    );
    let second = runtime
      .prepare_workspace_lifecycle_migration_v1(second_workspace.clone())
      .await?;
    assert!(
      runtime
        .migrate_workspace_lifecycle_v1(WorkspaceLifecycleMigrationInputV1 {
          workspace_id: second_workspace.clone(),
          source_revision: second.revision,
          root_status: second.root_status,
          docs: vec![]
        })
        .await?
    );
    assert!(
      runtime
        .prepare_workspace_lifecycle_migration_v1(second_workspace.clone())
        .await?
        .completed
    );
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&second_workspace)
      .execute(&pool)
      .await?;
    let state = runtime
      .get_workspace_state_v1(workspace_id.clone(), user_id.clone())
      .await?;
    assert!(state["clocks"].get(&workspace_id).is_some());
    let docs = state["docs"].as_array().unwrap();
    assert!(
      docs
        .iter()
        .any(|doc| doc["docId"] == legacy_id && doc["lifecycle"] == "trashed")
    );
    assert!(
      docs
        .iter()
        .any(|doc| doc["docId"] == bound_id && doc["lifecycle"].is_null())
    );
    assert!(!docs.iter().any(|doc| doc["docId"] == creating_doc_id));
    let mut old = input(&bound_id, WorkspaceDocWriteIntentV1::UpdateDoc);
    old.protocol_version = None;
    assert!(
      runtime
        .append_workspace_doc_updates_v1(old)
        .await
        .unwrap_err()
        .to_string()
        .contains("sync_protocol_upgrade_required")
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
