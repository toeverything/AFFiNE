use std::collections::BTreeMap;

use napi::{Result, bindgen_prelude::Buffer};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::PgConnection;

use super::{
  BackendRuntime, CurrentDoc, CurrentDocUpdate, InvalidationHintV1, RuntimeError, RuntimeResult, WorkspaceDocState,
  domain_command::{invalidate_workspace_inventory_in, lock_workspace_doc_update},
  is_ordinary_workspace_doc, load_current_doc_parts_in, load_workspace_doc_states_in, merge_current_doc,
  permission::PermissionAuthorizer,
};

#[napi_derive::napi(object)]
pub struct WorkspaceLifecycleMigrationSourceV1 {
  pub revision: String,
  pub bin: Option<Buffer>,
  pub completed: bool,
  pub root_status: String,
}

#[napi_derive::napi(object)]
pub struct WorkspaceLegacyDocV1 {
  pub doc_id: String,
  pub trashed: bool,
}

#[napi_derive::napi(object)]
pub struct WorkspaceLifecycleMigrationInputV1 {
  pub workspace_id: String,
  pub source_revision: String,
  pub root_status: String,
  pub docs: Vec<WorkspaceLegacyDocV1>,
}

fn source_revision(snapshot: &Option<CurrentDoc>, updates: &[CurrentDocUpdate]) -> String {
  let mut hash = Sha256::new();
  for (timestamp, bytes) in snapshot
    .iter()
    .map(|record| (record.updated_at, &record.blob))
    .chain(updates.iter().map(|record| (record.created_at, &record.blob)))
  {
    hash.update(timestamp.timestamp_micros().to_le_bytes());
    hash.update((bytes.len() as u64).to_le_bytes());
    hash.update(bytes);
  }
  hex::encode(hash.finalize())
}

async fn completed(connection: &mut PgConnection, workspace_id: &str) -> RuntimeResult<bool> {
  sqlx::query_scalar(
    "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints WHERE kind='workspace_doc_lifecycle' AND scope=$1 \
     AND status='completed')",
  )
  .bind(workspace_id)
  .fetch_one(connection)
  .await
  .map_err(|error| RuntimeError::database("load workspace lifecycle migration", error))
}

async fn ensure_migration_active(connection: &mut PgConnection) -> RuntimeResult<()> {
  let active: bool = sqlx::query_scalar(
    "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints WHERE kind='workspace_doc_lifecycle_activation' \
     AND scope='global' AND status='active')",
  )
  .fetch_one(connection)
  .await
  .map_err(|error| RuntimeError::database("load workspace lifecycle activation", error))?;
  if !active {
    return Err(RuntimeError::invalid_state("workspace_lifecycle_not_active"));
  }
  Ok(())
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn activate_workspace_lifecycle_v1(&self) -> Result<bool> {
    sqlx::query(
      "INSERT INTO storage_reconciliation_checkpoints(kind,scope,status,metadata,completed_at) \
       VALUES('workspace_doc_lifecycle_activation','global','active','{\"protocolVersion\":2}',clock_timestamp()) ON \
       CONFLICT(kind,scope) DO NOTHING",
    )
    .execute(&self.pool().await?)
    .await
    .map(|result| result.rows_affected() != 0)
    .map_err(|error| RuntimeError::database("activate workspace lifecycle migration", error).into())
  }

  #[napi]
  pub async fn list_workspace_lifecycle_migration_candidates_v1(&self) -> Result<Vec<String>> {
    sqlx::query_scalar(
      "SELECT id FROM workspaces workspace WHERE EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints WHERE \
       kind='workspace_doc_lifecycle_activation' AND scope='global' AND status='active') AND NOT EXISTS(SELECT 1 FROM \
       storage_reconciliation_checkpoints checkpoint WHERE checkpoint.kind='workspace_doc_lifecycle' AND \
       checkpoint.scope=workspace.id AND checkpoint.status='completed') ORDER BY workspace.sid LIMIT 100",
    )
    .fetch_all(&self.pool().await?)
    .await
    .map_err(|error| RuntimeError::database("list workspace lifecycle migrations", error).into())
  }

  #[napi]
  pub async fn prepare_workspace_lifecycle_migration_v1(
    &self,
    workspace_id: String,
  ) -> Result<WorkspaceLifecycleMigrationSourceV1> {
    let pool = self.pool().await?;
    let mut transaction = pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin workspace lifecycle source", error))?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("set lifecycle source snapshot", error))?;
    ensure_migration_active(&mut transaction).await?;
    let done = completed(&mut transaction, &workspace_id).await?;
    if done {
      transaction
        .commit()
        .await
        .map_err(|error| RuntimeError::database("commit completed lifecycle source", error))?;
      return Ok(WorkspaceLifecycleMigrationSourceV1 {
        revision: String::new(),
        bin: None,
        completed: true,
        root_status: "completed".into(),
      });
    }

    let (snapshot, updates) = load_current_doc_parts_in(&mut transaction, &workspace_id, &workspace_id).await?;
    let revision = source_revision(&snapshot, &updates);
    let (bin, root_status) = match merge_current_doc(snapshot, updates) {
      Ok(Some(doc)) => (Some(doc.blob.into()), "decoded"),
      Ok(None) => (None, "absent"),
      Err(_) => (None, "invalid_binary"),
    };
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit lifecycle source snapshot", error))?;
    Ok(WorkspaceLifecycleMigrationSourceV1 {
      revision,
      bin,
      completed: done,
      root_status: root_status.into(),
    })
  }

  #[napi]
  pub async fn migrate_workspace_lifecycle_v1(&self, input: WorkspaceLifecycleMigrationInputV1) -> Result<bool> {
    let pool = self.pool().await?;
    let mut transaction = pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin workspace lifecycle migration", error))?;
    loop {
      let locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0))")
        .bind(format!("storage-workspace:{}", input.workspace_id))
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| RuntimeError::database("lock workspace lifecycle migration", error))?;
      if locked {
        break;
      }
      tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
    ensure_migration_active(&mut transaction).await?;
    lock_workspace_doc_update(&mut transaction, &input.workspace_id, &input.workspace_id).await?;
    let workspace = sqlx::query_scalar::<_, String>("SELECT id FROM workspaces WHERE id=$1 FOR KEY SHARE")
      .bind(&input.workspace_id)
      .fetch_optional(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("lock workspace lifecycle identity", error))?;
    if workspace.is_none() {
      return Ok(true);
    }

    if completed(&mut transaction, &input.workspace_id).await? {
      return Ok(true);
    }
    let (snapshot, updates) =
      load_current_doc_parts_in(&mut transaction, &input.workspace_id, &input.workspace_id).await?;
    if source_revision(&snapshot, &updates) != input.source_revision {
      return Ok(false);
    }
    let mut unique = BTreeMap::<String, Option<bool>>::new();
    for doc in input.docs {
      if is_ordinary_workspace_doc(&input.workspace_id, &doc.doc_id) {
        unique
          .entry(doc.doc_id)
          .and_modify(|state| *state = None)
          .or_insert(Some(doc.trashed));
      }
    }
    let (doc_ids, trashed): (Vec<_>, Vec<_>) = unique
      .into_iter()
      .filter_map(|(id, state)| state.map(|trash| (id, trash)))
      .unzip();
    sqlx::query(
      "INSERT INTO updates(workspace_id,guid,blob,created_at) SELECT \
       $1,input.doc_id,$3,date_trunc('milliseconds',clock_timestamp()) FROM unnest($2::text[]) input(doc_id) LEFT \
       JOIN workspace_pages page ON page.workspace_id=$1 AND page.page_id=input.doc_id WHERE page.lifecycle_state IS \
       DISTINCT FROM 'deleted' AND NOT EXISTS(SELECT 1 FROM snapshots WHERE workspace_id=$1 AND guid=input.doc_id) \
       AND NOT EXISTS(SELECT 1 FROM updates WHERE workspace_id=$1 AND guid=input.doc_id)",
    )
    .bind(&input.workspace_id)
    .bind(&doc_ids)
    .bind(&[0u8, 0][..])
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("retain legacy document identities", error))?;
    sqlx::query(
      "INSERT INTO workspace_pages(workspace_id,page_id,lifecycle_state,lifecycle_changed_at) SELECT \
       $1,input.doc_id,'trashed',date_trunc('milliseconds',clock_timestamp()) FROM unnest($2::text[],$3::bool[]) \
       input(doc_id,trashed) WHERE input.trashed ON CONFLICT(workspace_id,page_id) DO UPDATE SET \
       lifecycle_state='trashed',lifecycle_changed_at=EXCLUDED.lifecycle_changed_at WHERE \
       workspace_pages.lifecycle_changed_at IS NULL AND workspace_pages.lifecycle_state IS DISTINCT FROM 'deleted'",
    )
    .bind(&input.workspace_id)
    .bind(&doc_ids)
    .bind(&trashed)
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("migrate legacy document trash", error))?;
    sqlx::query(
      "INSERT INTO storage_reconciliation_checkpoints(kind,scope,status,metadata,completed_at) \
       VALUES('workspace_doc_lifecycle',$1,'completed',$2,clock_timestamp()) ON CONFLICT(kind,scope) DO UPDATE SET \
       status='completed',metadata=EXCLUDED.metadata,completed_at=EXCLUDED.completed_at",
    )
    .bind(&input.workspace_id)
    .bind(json!({"protocolVersion":2,"sourceRevision":input.source_revision,"rootStatus":input.root_status}))
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("complete workspace lifecycle migration", error))?;
    if self.embedding_schema_ready()? {
      let active_ids = load_workspace_doc_states_in(&mut transaction, &input.workspace_id)
        .await?
        .into_iter()
        .filter(|doc| doc.lifecycle.is_none() && is_ordinary_workspace_doc(&input.workspace_id, &doc.doc_id))
        .map(|doc| doc.doc_id)
        .collect::<Vec<_>>();
      sqlx::query(
        "UPDATE embedding_sources SET deleted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=$1 \
         AND source_kind='document' AND NOT(source_key=ANY($2))",
      )
      .bind(&input.workspace_id)
      .bind(&active_ids)
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("retire inactive legacy document embeddings", error))?;
    }
    invalidate_workspace_inventory_in(&mut transaction, &input.workspace_id).await?;
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit workspace lifecycle migration", error))?;
    self
      .publish_invalidation(InvalidationHintV1::WorkspaceInventoryChanged {
        workspace_id: input.workspace_id,
      })
      .await;
    Ok(true)
  }

  #[napi]
  pub async fn get_workspace_state_v1(&self, workspace_id: String, actor_user_id: String) -> Result<Value> {
    let pool = self.pool().await?;
    let mut transaction = pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin workspace state", error))?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("set workspace state snapshot", error))?;
    let states = load_workspace_doc_states_in(&mut transaction, &workspace_id).await?;
    let candidates = states.iter().map(|doc| doc.doc_id.clone()).collect::<Vec<_>>();
    let authorizer =
      PermissionAuthorizer::with_telemetry(pool, self.config()?.deployment, self.permission_telemetry.clone());
    let readable = authorizer
      .authorize_workspace_sync_docs_in(&mut transaction, &workspace_id, &actor_user_id, &candidates)
      .await?;
    let mut docs = Vec::new();
    let mut clocks = serde_json::Map::new();
    for WorkspaceDocState {
      doc_id,
      timestamp,
      lifecycle,
      lifecycle_changed_at,
    } in states
    {
      if !readable.get(&doc_id).is_some_and(|decision| decision.allowed) {
        continue;
      }
      if is_ordinary_workspace_doc(&workspace_id, &doc_id) {
        docs.push(json!({"docId":doc_id,"timestamp":timestamp.timestamp_millis(),"lifecycle":lifecycle,"lifecycleChangedAt":lifecycle_changed_at.map(|timestamp|timestamp.timestamp_millis())}));
      } else {
        clocks.insert(doc_id, json!(timestamp.timestamp_millis()));
      }
    }
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit workspace state", error))?;
    Ok(json!({"docs":docs,"clocks":clocks}))
  }
}
