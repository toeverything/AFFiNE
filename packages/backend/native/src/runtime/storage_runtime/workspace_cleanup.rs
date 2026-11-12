use std::collections::HashMap;

use sqlx::{PgPool, Row};

use super::{
  NAMESPACE_SHARDS, NamespaceKind, NamespaceShard, RuntimeError, RuntimeWorkspaceStorageReconcileResult,
  StorageOperation, StorageRuntime, comment_object_identity, delete_orphan_storage_rows, embedding_tables_exist,
  load_integer_cursor, load_object_cursor, mark_checkpoint_failed, reconcile_orphan_storage_rows, save_integer_cursor,
  save_object_cursor, workspace_id_from_prefix,
};
use crate::runtime::object_storage::types::{ObjectListEntry, StorageScope, is_id_segment};

const DELETE_PAGE_SIZE: i32 = 1_000;
const DELETE_MAX_PAGES_PER_PREFIX: usize = 100;
const RECONCILE_GRACE_HOURS: i32 = 24;
const UNKNOWN_PREFIX_SAMPLE_LIMIT: usize = 16;

#[napi_derive::napi]
impl StorageRuntime {
  #[napi]
  pub async fn delete_workspace_objects(
    &self,
    workspace_id: String,
    user_ids: Option<Vec<String>>,
  ) -> napi::Result<i64> {
    if workspace_id == "comment-attachments" {
      return Err(RuntimeError::invalid_input("reserved workspace id").into());
    }
    let pool = self.pool().await?;
    let mut operation = StorageOperation::acquire(&pool, &workspace_id, None).await?;
    let (workspace_exists, embedding_tables) = sqlx::query_as::<_, (bool, bool)>(
      "SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1), to_regclass('embedding_sources') IS NOT NULL",
    )
    .bind(&workspace_id)
    .fetch_one(operation.connection())
    .await
    .map_err(|error| RuntimeError::database("recheck workspace before targeted storage deletion", error))?;
    if workspace_exists {
      operation.release().await?;
      return Ok(0);
    }
    delete_orphan_storage_rows(operation.connection(), &workspace_id, embedding_tables).await?;
    let result = self
      .delete_workspace_objects_for_users(&workspace_id, user_ids.as_deref().unwrap_or_default())
      .await;
    operation.release().await?;
    result
  }

  #[napi]
  pub async fn reconcile_workspace_storage(&self, limit: i32) -> napi::Result<RuntimeWorkspaceStorageReconcileResult> {
    self.reconcile_workspace_storage_inner(limit).await
  }
}

impl StorageRuntime {
  async fn reconcile_workspace_storage_inner(
    &self,
    limit: i32,
  ) -> napi::Result<RuntimeWorkspaceStorageReconcileResult> {
    if limit <= 0 {
      return Err(RuntimeError::invalid_input("workspace storage reconciliation limit must be positive").into());
    }
    let pool = self.pool().await?;
    let embedding_tables = embedding_tables_exist(&pool).await?;
    let mut result = RuntimeWorkspaceStorageReconcileResult {
      scanned_workspaces: 0,
      deleted_workspaces: 0,
      scanned_objects: 0,
      deleted_objects: 0,
      deleted_orphan_rows: 0,
      unknown_prefixes: 0,
      failed_shards: 0,
      failed_scopes: Vec::new(),
      unknown_prefix_samples: Vec::new(),
    };

    if let Err(error) = self
      .reconcile_ownerless_workspaces(&pool, limit, embedding_tables, &mut result)
      .await
    {
      record_failure(&mut result, "ownerless-workspaces", error);
    }
    if let Err(error) = reconcile_orphan_storage_rows(&pool, limit, embedding_tables, &mut result).await {
      record_failure(&mut result, "orphan-storage-rows", error);
    }
    for shard in NAMESPACE_SHARDS {
      if let Err(error) = self.reconcile_namespace_shard(&pool, shard, limit, &mut result).await {
        mark_checkpoint_failed(&pool, "workspace_storage_namespace", shard.checkpoint_scope)
          .await
          .ok();
        record_failure(&mut result, shard.checkpoint_scope, error);
      }
    }
    Ok(result)
  }

  #[cfg(test)]
  async fn delete_workspace_prefixes(&self, workspace_id: &str) -> napi::Result<i64> {
    self.delete_workspace_objects_for_users(workspace_id, &[]).await
  }

  async fn delete_workspace_objects_for_users(&self, workspace_id: &str, user_ids: &[String]) -> napi::Result<i64> {
    let mut deleted = 0_i64;
    for (scope, prefix) in [
      (StorageScope::Blob, format!("{workspace_id}/")),
      (StorageScope::Blob, format!("comment-attachments/{workspace_id}/")),
      (StorageScope::Copilot, format!("workspace-files/{workspace_id}/")),
      (StorageScope::Copilot, format!("context-files/{workspace_id}/")),
      (StorageScope::Copilot, format!("artifacts/{workspace_id}/")),
    ] {
      deleted = deleted.saturating_add(self.delete_all_in_prefix(scope, &prefix).await?);
    }
    for user_id in user_ids {
      deleted = deleted.saturating_add(
        self
          .delete_all_in_prefix(StorageScope::Copilot, &format!("{user_id}/{workspace_id}/"))
          .await?,
      );
    }
    Ok(deleted)
  }

  async fn delete_all_in_prefix(&self, scope: StorageScope, prefix: &str) -> napi::Result<i64> {
    let mut deleted = 0_i64;
    for _ in 0..DELETE_MAX_PAGES_PER_PREFIX {
      let page = self
        .object_storage_list_page(scope, Some(prefix.to_string()), None, None, None, DELETE_PAGE_SIZE)
        .await?;
      if page.entries.is_empty() {
        return Ok(deleted);
      }
      deleted = deleted.saturating_add(self.delete_entries(scope, page.entries).await?);
    }
    let remaining = self
      .object_storage_list_page(scope, Some(prefix.to_string()), None, None, None, 1)
      .await?;
    if remaining.entries.is_empty() {
      Ok(deleted)
    } else {
      Err(RuntimeError::invalid_state(format!("Workspace object delete page budget exhausted for {prefix}")).into())
    }
  }

  async fn delete_entries(&self, scope: StorageScope, entries: Vec<ObjectListEntry>) -> napi::Result<i64> {
    if entries.is_empty() {
      return Ok(0);
    }
    let outcomes = self
      .object_storage_delete_many(scope, entries.into_iter().map(|entry| entry.key).collect())
      .await?;
    if let Some(failed) = outcomes.iter().find(|outcome| outcome.error.is_some()) {
      return Err(
        RuntimeError::invalid_state(format!(
          "Workspace object delete failed for {}: {}",
          failed.key,
          failed.error.as_deref().unwrap_or("unknown")
        ))
        .into(),
      );
    }
    Ok(i64::try_from(outcomes.len()).unwrap_or(i64::MAX))
  }

  async fn reconcile_ownerless_workspaces(
    &self,
    pool: &PgPool,
    limit: i32,
    embedding_tables: bool,
    result: &mut RuntimeWorkspaceStorageReconcileResult,
  ) -> napi::Result<()> {
    let last_sid = load_integer_cursor(pool, "workspace_storage_ownerless", "workspaces").await?;
    let rows = sqlx::query(
      r#"
      SELECT w.sid, w.id
      FROM workspaces w
      WHERE w.sid > $1
        AND w.created_at < CURRENT_TIMESTAMP - make_interval(hours => $2)
        AND NOT EXISTS (
          SELECT 1 FROM workspace_members m
          WHERE m.workspace_id = w.id AND m.role = 'owner' AND m.state = 'active'
        )
      ORDER BY w.sid
      LIMIT $3
      "#,
    )
    .bind(last_sid)
    .bind(RECONCILE_GRACE_HOURS)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|error| RuntimeError::database("list ownerless workspaces", error))?;

    for row in &rows {
      let workspace_id: String = row
        .try_get("id")
        .map_err(|error| RuntimeError::database("read workspace id", error))?;
      result.scanned_workspaces = result.scanned_workspaces.saturating_add(1);
      let mut operation = StorageOperation::acquire(pool, &workspace_id, None).await?;
      let user_ids = sqlx::query_scalar::<_, String>(
        r#"
        SELECT user_id FROM workspace_members WHERE workspace_id = $1
        UNION
        SELECT user_id FROM ai_sessions_metadata WHERE workspace_id = $1
        "#,
      )
      .bind(&workspace_id)
      .fetch_all(operation.connection())
      .await
      .map_err(|error| RuntimeError::database("list workspace storage users", error))?;
      let deleted = sqlx::query_scalar::<_, String>(
        r#"
        DELETE FROM workspaces w
        WHERE w.id = $1
          AND w.created_at < CURRENT_TIMESTAMP - make_interval(hours => $2)
          AND NOT EXISTS (
            SELECT 1 FROM workspace_members m
            WHERE m.workspace_id = w.id AND m.role = 'owner' AND m.state = 'active'
          )
        RETURNING w.id
        "#,
      )
      .bind(&workspace_id)
      .bind(RECONCILE_GRACE_HOURS)
      .fetch_optional(operation.connection())
      .await
      .map_err(|error| RuntimeError::database("delete ownerless workspace", error))?
      .is_some();
      if deleted {
        result.deleted_workspaces = result.deleted_workspaces.saturating_add(1);
        result.deleted_orphan_rows = result
          .deleted_orphan_rows
          .saturating_add(delete_orphan_storage_rows(operation.connection(), &workspace_id, embedding_tables).await?);
        result.deleted_objects = result.deleted_objects.saturating_add(
          self
            .delete_workspace_objects_for_users(&workspace_id, &user_ids)
            .await?,
        );
      }
      operation.release().await?;
    }
    let completed = rows.len() < limit as usize;
    let next_sid = rows
      .last()
      .and_then(|row| row.try_get::<i32, _>("sid").ok())
      .unwrap_or(last_sid);
    save_integer_cursor(
      pool,
      "workspace_storage_ownerless",
      "workspaces",
      if completed { 0 } else { next_sid },
      completed,
    )
    .await?;
    Ok(())
  }

  async fn reconcile_namespace_shard(
    &self,
    pool: &PgPool,
    shard: NamespaceShard,
    limit: i32,
    result: &mut RuntimeWorkspaceStorageReconcileResult,
  ) -> napi::Result<()> {
    let token = load_object_cursor(pool, shard.checkpoint_scope).await?;
    let page = self
      .object_storage_list_page(
        shard.scope,
        shard.prefix.map(str::to_string),
        token,
        None,
        shard.delimiter.map(str::to_string),
        limit,
      )
      .await?;
    result.scanned_objects = result
      .scanned_objects
      .saturating_add(i64::try_from(page.entries.len() + page.common_prefixes.len()).unwrap_or(i64::MAX));

    match shard.kind {
      NamespaceKind::BlobWorkspace | NamespaceKind::BlobComment | NamespaceKind::CopilotWorkspace => {
        for prefix in &page.common_prefixes {
          if matches!(shard.kind, NamespaceKind::BlobWorkspace) && prefix == "comment-attachments/" {
            continue;
          }
          let Some(workspace_id) = workspace_id_from_prefix(shard.kind, prefix) else {
            record_unknown(result, prefix);
            continue;
          };
          result.deleted_objects = result.deleted_objects.saturating_add(
            self
              .delete_orphan_workspace_prefix(pool, shard.scope, &workspace_id, prefix, None)
              .await?,
          );
        }
      }
      NamespaceKind::BlobCommentObjects => {
        for entry in page.entries.iter().cloned() {
          if comment_object_identity(&entry.key).is_none() {
            record_unknown(result, &entry.key);
            continue;
          }
          result.deleted_objects = result
            .deleted_objects
            .saturating_add(self.delete_orphan_comment_object(pool, entry).await?);
        }
      }
      NamespaceKind::CopilotChat => {
        let mut groups: HashMap<(String, String), Vec<ObjectListEntry>> = HashMap::new();
        for entry in page.entries.iter().cloned() {
          let segments = entry.key.split('/').collect::<Vec<_>>();
          match segments.as_slice() {
            [user_id, workspace_id, _]
              if !matches!(*user_id, "workspace-files" | "context-files" | "artifacts")
                && is_id_segment(user_id)
                && is_id_segment(workspace_id) =>
            {
              groups
                .entry(((*user_id).to_string(), (*workspace_id).to_string()))
                .or_default()
                .push(entry);
            }
            ["workspace-files" | "context-files" | "artifacts", ..] => {}
            _ => record_unknown(result, &entry.key),
          }
        }
        for ((user_id, workspace_id), entries) in groups {
          result.deleted_objects = result.deleted_objects.saturating_add(
            self
              .delete_orphan_entries(pool, shard.scope, &workspace_id, Some(&user_id), entries)
              .await?,
          );
        }
      }
      NamespaceKind::Avatar => {
        let mut groups: HashMap<String, Vec<ObjectListEntry>> = HashMap::new();
        for entry in page.entries.iter().cloned() {
          let user_id = entry
            .key
            .rsplit_once("-avatar-")
            .filter(|(user_id, timestamp)| {
              is_id_segment(user_id) && timestamp.bytes().all(|byte| byte.is_ascii_digit())
            })
            .map(|(user_id, _)| user_id.to_string());
          if let Some(user_id) = user_id {
            groups.entry(user_id).or_default().push(entry);
          } else {
            record_unknown(result, &entry.key);
          }
        }
        for (user_id, entries) in groups {
          result.deleted_objects = result
            .deleted_objects
            .saturating_add(self.delete_orphan_avatar_entries(pool, &user_id, entries).await?);
        }
      }
    }
    save_object_cursor(pool, shard.checkpoint_scope, page.next_continuation_token.as_deref()).await?;
    Ok(())
  }

  async fn delete_orphan_workspace_prefix(
    &self,
    pool: &PgPool,
    scope: StorageScope,
    workspace_id: &str,
    prefix: &str,
    user_id: Option<&str>,
  ) -> napi::Result<i64> {
    let mut operation = StorageOperation::acquire(pool, workspace_id, None).await?;
    let workspace_exists = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)")
      .bind(workspace_id)
      .fetch_one(operation.connection())
      .await
      .map_err(|error| RuntimeError::database("recheck workspace storage owner", error))?;
    let user_exists = if let Some(user_id) = user_id {
      sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)")
        .bind(user_id)
        .fetch_one(operation.connection())
        .await
        .map_err(|error| RuntimeError::database("recheck copilot storage user", error))?
    } else {
      true
    };
    if workspace_exists && user_exists {
      operation.release().await?;
      return Ok(0);
    }

    let mut continuation = None;
    let mut aged = Vec::new();
    let mut exhausted = false;
    for _ in 0..DELETE_MAX_PAGES_PER_PREFIX {
      let page = self
        .object_storage_list_page(
          scope,
          Some(prefix.to_string()),
          continuation,
          None,
          None,
          DELETE_PAGE_SIZE,
        )
        .await?;
      aged.extend(
        page
          .entries
          .into_iter()
          .filter(|entry| entry.last_modified_ms < cutoff_ms()),
      );
      continuation = page.next_continuation_token;
      if continuation.is_none() {
        exhausted = true;
        break;
      }
    }

    let mut deleted: i64 = 0;
    for entries in aged.chunks(DELETE_PAGE_SIZE as usize) {
      deleted = deleted.saturating_add(self.delete_entries(scope, entries.to_vec()).await?);
    }
    operation.release().await?;
    if !exhausted {
      return Err(
        RuntimeError::invalid_state(format!("Workspace prefix scan page budget exhausted for {prefix}")).into(),
      );
    }
    Ok(deleted)
  }

  async fn delete_orphan_entries(
    &self,
    pool: &PgPool,
    scope: StorageScope,
    workspace_id: &str,
    user_id: Option<&str>,
    entries: Vec<ObjectListEntry>,
  ) -> napi::Result<i64> {
    let mut operation = StorageOperation::acquire(pool, workspace_id, None).await?;
    let workspace_exists = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)")
      .bind(workspace_id)
      .fetch_one(operation.connection())
      .await
      .map_err(|error| RuntimeError::database("recheck workspace storage owner", error))?;
    let user_exists = if let Some(user_id) = user_id {
      sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)")
        .bind(user_id)
        .fetch_one(operation.connection())
        .await
        .map_err(|error| RuntimeError::database("recheck copilot storage user", error))?
    } else {
      true
    };
    let eligible = !workspace_exists || !user_exists;
    let aged = entries
      .into_iter()
      .filter(|entry| eligible && entry.last_modified_ms < cutoff_ms())
      .collect();
    let deleted = self.delete_entries(scope, aged).await?;
    operation.release().await?;
    Ok(deleted)
  }

  async fn delete_orphan_avatar_entries(
    &self,
    pool: &PgPool,
    user_id: &str,
    entries: Vec<ObjectListEntry>,
  ) -> napi::Result<i64> {
    let mut operation = StorageOperation::acquire(pool, &format!("avatar:{user_id}"), None).await?;
    let exists = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)")
      .bind(user_id)
      .fetch_one(operation.connection())
      .await
      .map_err(|error| RuntimeError::database("recheck avatar owner", error))?;
    let aged = entries
      .into_iter()
      .filter(|entry| !exists && entry.last_modified_ms < cutoff_ms())
      .collect();
    let deleted = self.delete_entries(StorageScope::Avatar, aged).await?;
    operation.release().await?;
    Ok(deleted)
  }

  async fn delete_orphan_comment_object(&self, pool: &PgPool, entry: ObjectListEntry) -> napi::Result<i64> {
    let (workspace_id, doc_id, key, reservation_id) = comment_object_identity(&entry.key)
      .ok_or_else(|| RuntimeError::invalid_input("invalid comment attachment object key"))?;
    let mut operation = StorageOperation::acquire(pool, &workspace_id, Some(&entry.key)).await?;
    let referenced = if let Some(reservation_id) = reservation_id {
      sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM comment_attachments WHERE workspace_id = $1 AND doc_id = $2 AND key = $3 AND \
         reservation_id::text = $4 AND status = 'pending' AND deleted_at IS NULL)",
      )
      .bind(&workspace_id)
      .bind(&doc_id)
      .bind(&key)
      .bind(reservation_id)
      .fetch_one(operation.connection())
      .await
    } else {
      sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM comment_attachments WHERE workspace_id = $1 AND doc_id = $2 AND key = $3 AND \
         status = 'completed' AND deleted_at IS NULL)",
      )
      .bind(&workspace_id)
      .bind(&doc_id)
      .bind(&key)
      .fetch_one(operation.connection())
      .await
    }
    .map_err(|error| RuntimeError::database("recheck comment attachment object", error))?;
    let deleted = if !referenced && entry.last_modified_ms < cutoff_ms() {
      self.delete_entries(StorageScope::Blob, vec![entry]).await?
    } else {
      0
    };
    operation.release().await?;
    Ok(deleted)
  }
}

fn cutoff_ms() -> i64 {
  chrono::Utc::now()
    .checked_sub_signed(chrono::Duration::hours(i64::from(RECONCILE_GRACE_HOURS)))
    .map(|time| time.timestamp_millis())
    .unwrap_or(i64::MIN)
}

fn record_unknown(result: &mut RuntimeWorkspaceStorageReconcileResult, prefix: &str) {
  result.unknown_prefixes = result.unknown_prefixes.saturating_add(1);
  if result.unknown_prefix_samples.len() < UNKNOWN_PREFIX_SAMPLE_LIMIT {
    result.unknown_prefix_samples.push(prefix.to_string());
  }
}

fn record_failure(result: &mut RuntimeWorkspaceStorageReconcileResult, scope: &str, error: napi::Error) {
  result.failed_shards = result.failed_shards.saturating_add(1);
  result.failed_scopes.push(format!("{scope}: {error}"));
}

#[cfg(test)]
mod tests {
  use std::{fs::write, sync::Arc};

  use super::*;
  use crate::runtime::{
    migrations::{DATABASE_TEST_LOCK, migrate_all_tables},
    object_storage::types::{ObjectKey, ObjectLocator, ObjectPutMetadata},
  };

  fn runtime(root: &std::path::Path) -> StorageRuntime {
    let root = serde_json::to_string(root).unwrap();
    let config = super::super::StorageRuntimeConfig::from_config_json(&format!(
        r#"{{"storages":{{"blob.storage":{{"provider":"fs","bucket":"workspace-cleanup","config":{{"path":{root}}}}},"avatar.storage":{{"provider":"fs","bucket":"workspace-cleanup-avatar","config":{{"path":{root}}}}}}},"copilot":{{"storage":{{"provider":"fs","bucket":"workspace-cleanup-copilot","config":{{"path":{root}}}}}}}}}"#,
      ))
    .unwrap();
    let config_dir = tempfile::tempdir().unwrap();
    let config_path = config_dir.path().join("config.json");
    write(&config_path, r#"{"deployment":{"type":"cloud"}}"#).unwrap();
    StorageRuntime {
      config: std::sync::RwLock::new(config),
      server_config: Arc::new(crate::runtime::config::ServerConfig::open(&config_path, None).unwrap()),
      pool: tokio::sync::Mutex::new(None),
    }
  }

  async fn put(runtime: &StorageRuntime, key: String) {
    let locator = ObjectLocator::new(StorageScope::Blob, ObjectKey::new(key).unwrap());
    runtime
      .object_storage()
      .unwrap()
      .put(&locator, b"x".to_vec(), ObjectPutMetadata::default())
      .await
      .unwrap();
  }

  const WORKSPACE_ROW_TABLES: &[&str] = &[
    "embedding_chunks",
    "embedding_projections",
    "embedding_sources",
    "embedding_workspace_states",
    "embedding_indexes",
    "doc_blob_refs",
    "doc_blob_ref_projections",
    "document_cleanup_candidates",
    "blob_cleanup_candidates",
    "storage_reconciliation_runs",
  ];

  async fn seed_workspace_rows(pool: &PgPool, workspace_id: &str) {
    for statement in [
      "INSERT INTO \
       embedding_indexes(id,workspace_id,fingerprint,route_source,provider,model_id,endpoint_fingerprint,\
       contract_version,health_status) VALUES(gen_random_uuid(),$1,'test','managed','test','test','test',1,'ready')",
      "INSERT INTO embedding_workspace_states(workspace_id,active_index_id,runtime_state) SELECT $1,id,'active' FROM \
       embedding_indexes WHERE workspace_id=$1",
      "INSERT INTO \
       embedding_sources(id,workspace_id,source_kind,source_key,content_revision,descriptor_revision,recipe_revision,\
       document_projection) VALUES(gen_random_uuid(),$1,'document','doc','1','1','1','{}')",
      "INSERT INTO \
       embedding_projections(source_id,index_id,status,active_generation_token,lease_owner,lease_token,lease_until) \
       SELECT source.id,index_fact.id,'running',gen_random_uuid(),'test',1,now()+interval '5 minutes' FROM \
       embedding_sources source JOIN embedding_indexes index_fact USING(workspace_id) WHERE source.workspace_id=$1",
      "INSERT INTO \
       embedding_chunks(generation_token,workspace_id,index_id,source_id,chunk_index,content,embedding,source_kind,\
       doc_id) SELECT \
       projection.active_generation_token,$1,projection.index_id,source.id,0,'test',array_fill(1::real,\
       ARRAY[1024])::vector,'document','doc' FROM embedding_sources source JOIN embedding_projections projection ON \
       projection.source_id=source.id WHERE source.workspace_id=$1",
      "INSERT INTO doc_blob_refs(workspace_id,doc_id,blob_key,block_id,flavour,snapshot_updated_at,parser_version) \
       VALUES($1,'doc','blob','block','affine:attachment',now(),1)",
      "INSERT INTO doc_blob_ref_projections(workspace_id,doc_id,parser_version,status) VALUES($1,'doc',1,'pending')",
      "INSERT INTO document_cleanup_candidates(workspace_id,doc_id,status,missing_since,last_observed_missing_at) \
       VALUES($1,'doc','marked',now(),now())",
      "INSERT INTO blob_cleanup_candidates(workspace_id,blob_key,reason,status,object_size,run_id) \
       VALUES($1,'blob','test','planned',1,gen_random_uuid())",
      "INSERT INTO storage_reconciliation_runs(workspace_id,kind,mode,status) \
       VALUES($1,'blob_cleanup','test','running')",
      "INSERT INTO storage_reconciliation_checkpoints(kind,scope,status) VALUES('blob_cleanup',$1,'running')",
    ] {
      sqlx::query(statement).bind(workspace_id).execute(pool).await.unwrap();
    }
  }

  async fn assert_workspace_rows(pool: &PgPool, workspace_id: &str, count: i64) {
    for table in WORKSPACE_ROW_TABLES {
      let query = if *table == "embedding_projections" {
        "SELECT count(*) FROM embedding_projections WHERE source_id IN (SELECT id FROM embedding_sources WHERE \
         workspace_id=$1)"
          .to_string()
      } else {
        format!("SELECT count(*) FROM {table} WHERE workspace_id=$1")
      };
      let actual: i64 = sqlx::query_scalar(&query)
        .bind(workspace_id)
        .fetch_one(pool)
        .await
        .unwrap();
      assert_eq!(actual, count, "{table} rows for {workspace_id}");
    }
  }

  #[tokio::test]
  async fn deletes_all_workspace_object_prefixes_across_pages() {
    let temp = tempfile::tempdir().unwrap();
    let runtime = runtime(temp.path());
    let workspace_id = "workspace-cleanup-paged";

    for index in 0..=DELETE_PAGE_SIZE {
      put(&runtime, format!("{workspace_id}/{index:04}")).await;
    }
    for index in 0..2 {
      put(&runtime, format!("comment-attachments/{workspace_id}/doc/{index}")).await;
    }
    put(&runtime, "another-workspace/keep".to_string()).await;

    let mut token = None;
    let mut prefixes = Vec::new();
    loop {
      let page = runtime
        .object_storage_list_page(StorageScope::Blob, None, token, None, Some("/".to_string()), 1)
        .await
        .unwrap();
      assert!(page.entries.is_empty());
      prefixes.extend(page.common_prefixes);
      if page.next_continuation_token.is_none() {
        break;
      }
      assert!(page.next_continuation_token.as_deref().unwrap().starts_with("local:"));
      token = page.next_continuation_token;
    }
    assert_eq!(
      prefixes,
      ["another-workspace/", "comment-attachments/", "workspace-cleanup-paged/"]
    );
    let comment_page = runtime
      .object_storage_list_page(
        StorageScope::Blob,
        Some("comment-attachments/".to_string()),
        None,
        None,
        Some("/".to_string()),
        10,
      )
      .await
      .unwrap();
    assert_eq!(
      comment_page.common_prefixes,
      ["comment-attachments/workspace-cleanup-paged/"]
    );

    assert_eq!(
      runtime.delete_workspace_prefixes(workspace_id).await.unwrap(),
      i64::from(DELETE_PAGE_SIZE) + 3
    );
    let workspace_page = runtime
      .object_storage_list_page(
        StorageScope::Blob,
        Some(format!("{workspace_id}/")),
        None,
        None,
        None,
        10,
      )
      .await
      .unwrap();
    assert!(workspace_page.entries.is_empty());
    let comment_page = runtime
      .object_storage_list_page(
        StorageScope::Blob,
        Some(format!("comment-attachments/{workspace_id}/")),
        None,
        None,
        None,
        10,
      )
      .await
      .unwrap();
    assert!(comment_page.entries.is_empty());
    let other_page = runtime
      .object_storage_list_page(
        StorageScope::Blob,
        Some("another-workspace/".to_string()),
        None,
        None,
        None,
        10,
      )
      .await
      .unwrap();
    assert_eq!(other_page.entries.len(), 1);
  }

  #[tokio::test]
  async fn workspace_cleanup_reconciles_runtime_rows_despite_object_failure() {
    let temp = tempfile::tempdir().unwrap();
    let runtime = runtime(temp.path());
    let workspace_id = "workspace-cleanup-failure";
    let key = format!("{workspace_id}/object");
    put(&runtime, key.clone()).await;
    let metadata = temp
      .path()
      .join("workspace-cleanup")
      .join(format!("{key}.metadata.json"));
    std::fs::remove_file(&metadata).unwrap();
    std::fs::create_dir(&metadata).unwrap();

    let error = runtime
      .delete_entries(
        StorageScope::Blob,
        vec![ObjectListEntry {
          key: key.clone(),
          content_length: 1,
          last_modified_ms: 0,
        }],
      )
      .await
      .unwrap_err();
    assert!(error.to_string().contains("Workspace object delete failed"));
    assert!(error.to_string().contains(&key));
    std::fs::remove_dir(&metadata).unwrap();
    put(&runtime, key.clone()).await;
    std::fs::remove_file(&metadata).unwrap();
    std::fs::create_dir(&metadata).unwrap();

    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let _guard = DATABASE_TEST_LOCK.lock().await;
    let pool = sqlx::postgres::PgPoolOptions::new()
      .max_connections(1)
      .connect(&database_url)
      .await
      .unwrap();
    assert!(migrate_all_tables(&pool).await.unwrap().enabled);
    *runtime.pool.lock().await = Some(pool.clone());
    let live_workspace = format!("workspace-cleanup-live-{}", uuid::Uuid::new_v4());
    sqlx::query("INSERT INTO workspaces(id,created_at) VALUES($1,now())")
      .bind(&live_workspace)
      .execute(&pool)
      .await
      .unwrap();
    for id in [workspace_id, live_workspace.as_str()] {
      seed_workspace_rows(&pool, id).await;
    }
    assert_eq!(
      runtime
        .delete_workspace_objects(live_workspace.clone(), None)
        .await
        .unwrap(),
      0
    );
    assert_workspace_rows(&pool, &live_workspace, 1).await;
    assert!(
      runtime
        .delete_workspace_objects(workspace_id.to_string(), None)
        .await
        .is_err()
    );
    assert_workspace_rows(&pool, workspace_id, 0).await;
    std::fs::remove_dir(&metadata).unwrap();
    put(&runtime, key).await;
    assert_eq!(
      runtime
        .delete_workspace_objects(workspace_id.to_string(), None)
        .await
        .unwrap(),
      1
    );
    assert_eq!(
      runtime
        .delete_workspace_objects(workspace_id.to_string(), None)
        .await
        .unwrap(),
      0
    );
    assert_workspace_rows(&pool, workspace_id, 0).await;

    let global_checkpoint_inserted = sqlx::query(
      "INSERT INTO storage_reconciliation_checkpoints(kind,scope,status) \
       VALUES('blob_metadata_backfill','__all__','running') ON CONFLICT(kind,scope) DO NOTHING",
    )
    .execute(&pool)
    .await
    .unwrap()
    .rows_affected()
      > 0;
    let global_run: uuid::Uuid = sqlx::query_scalar(
      "INSERT INTO storage_reconciliation_runs(kind,mode,status) VALUES('test-global','test','running') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let mut orphan_ids = Vec::new();
    for remaining in [
      "embedding_sources",
      "embedding_workspace_states",
      "embedding_indexes",
      "blob_cleanup_candidates",
      "storage_reconciliation_runs",
      "storage_reconciliation_checkpoints",
    ] {
      let id = format!("workspace-cleanup-orphan-{}", uuid::Uuid::new_v4());
      seed_workspace_rows(&pool, &id).await;
      for table in WORKSPACE_ROW_TABLES.iter().filter(|table| **table != remaining) {
        let query = if *table == "embedding_projections" {
          "DELETE FROM embedding_projections WHERE source_id IN (SELECT id FROM embedding_sources WHERE \
           workspace_id=$1)"
            .to_string()
        } else {
          format!("DELETE FROM {table} WHERE workspace_id=$1")
        };
        sqlx::query(&query).bind(&id).execute(&pool).await.unwrap();
      }
      if remaining != "storage_reconciliation_checkpoints" {
        sqlx::query("DELETE FROM storage_reconciliation_checkpoints WHERE scope=$1")
          .bind(&id)
          .execute(&pool)
          .await
          .unwrap();
      }
      orphan_ids.push(id);
    }
    for _ in 0..2 {
      runtime.reconcile_workspace_storage_inner(1_000).await.unwrap();
      for id in &orphan_ids {
        assert_workspace_rows(&pool, id, 0).await;
        assert_eq!(
          sqlx::query_scalar::<_, i64>("SELECT count(*) FROM storage_reconciliation_checkpoints WHERE scope=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap(),
          0
        );
      }
      assert_workspace_rows(&pool, &live_workspace, 1).await;
      assert!(
        sqlx::query_scalar::<_, bool>(
          "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints WHERE kind='blob_metadata_backfill' AND \
           scope='__all__')"
        )
        .fetch_one(&pool)
        .await
        .unwrap()
      );
      assert!(
        sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM storage_reconciliation_runs WHERE id=$1)")
          .bind(global_run)
          .fetch_one(&pool)
          .await
          .unwrap()
      );
    }
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&live_workspace)
      .execute(&pool)
      .await
      .unwrap();
    runtime.delete_workspace_objects(live_workspace, None).await.unwrap();
    if global_checkpoint_inserted {
      sqlx::query(
        "DELETE FROM storage_reconciliation_checkpoints WHERE kind='blob_metadata_backfill' AND scope='__all__'",
      )
      .execute(&pool)
      .await
      .unwrap();
    }
    sqlx::query("DELETE FROM storage_reconciliation_runs WHERE id=$1")
      .bind(global_run)
      .execute(&pool)
      .await
      .unwrap();
  }
}
