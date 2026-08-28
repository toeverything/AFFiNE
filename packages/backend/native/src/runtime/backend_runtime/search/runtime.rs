use std::sync::atomic::{AtomicU64, Ordering};

use sqlx::{PgPool, Row};
use tokio::{
  sync::{Mutex, RwLock},
  time::{Duration, Instant},
};
use uuid::Uuid;

use super::{
  ActiveGeneration, PermissionAuthorizer, SearchProvider, WORKSPACE_RECONCILE_FAILED, activate,
  cleanup_retired_generation, config_hash, ensure, load_active, reconcile_workspace, sweep_generation_orphans,
};
use crate::{
  runtime::{RuntimeError, RuntimeResult, SearchRuntimeConfig},
  search_index::EmbeddedSearchIndex,
};

#[derive(Default)]
pub(super) struct SearchObservability {
  pub(super) provider_requests: AtomicU64,
  pub(super) provider_latency_micros: AtomicU64,
  pub(super) missing_published: AtomicU64,
  pub(super) projection_mismatch: AtomicU64,
  pub(super) canonical_permission: AtomicU64,
  pub(super) generation_gc_failures: AtomicU64,
}

pub(in crate::runtime::backend_runtime) struct SearchRuntime {
  pub(super) pool: PgPool,
  pub(super) authorizer: PermissionAuthorizer,
  pub(super) embedded: EmbeddedSearchIndex,
  pub(super) remote: Option<SearchProvider>,
  pub(super) config: SearchRuntimeConfig,
  generation: RwLock<Option<ActiveGeneration>>,
  lifecycle_lock: Mutex<()>,
  pub(super) observability: SearchObservability,
}

impl SearchRuntime {
  pub(in crate::runtime::backend_runtime) fn new(pool: PgPool, config: SearchRuntimeConfig) -> RuntimeResult<Self> {
    if !matches!(
      config.provider.as_str(),
      "embedded" | "elasticsearch" | "manticoresearch"
    ) {
      return Err(RuntimeError::config("unsupported search provider"));
    }
    let remote = (config.provider != "embedded")
      .then(|| SearchProvider::new(&config))
      .transpose()?;
    Ok(Self {
      authorizer: PermissionAuthorizer::new(pool.clone()),
      embedded: EmbeddedSearchIndex::new(),
      remote,
      config,
      generation: RwLock::new(None),
      lifecycle_lock: Mutex::new(()),
      observability: SearchObservability::default(),
      pool,
    })
  }

  pub(in crate::runtime::backend_runtime) async fn initialize(&self) -> RuntimeResult<()> {
    let _lock = self.lifecycle_lock.lock().await;
    let schema_ready: bool = sqlx::query_scalar("SELECT to_regclass('search_projection.generations') IS NOT NULL")
      .fetch_one(&self.pool)
      .await
      .map_err(|error| RuntimeError::database("check search projection schema", error))?;
    if !schema_ready {
      return Ok(());
    }
    let rebuild_embedded = if self.config.provider == "embedded" {
      let current = self.generation.read().await.clone();
      match current {
        Some(generation) => !self.embedded.has_generation(generation.id).await,
        None => true,
      }
    } else {
      false
    };
    let generation = ensure(&self.pool, &self.config, None, rebuild_embedded).await?;
    if self.config.provider == "embedded" {
      self.embedded.prepare_generation(generation.id).await;
    }
    *self.generation.write().await = Some(generation);
    Ok(())
  }

  async fn candidate_or_active(&self) -> RuntimeResult<ActiveGeneration> {
    let mut generation = ensure(&self.pool, &self.config, self.remote.as_ref(), false).await?;
    if self.config.provider == "embedded" && !self.embedded.has_generation(generation.id).await {
      generation = ensure(&self.pool, &self.config, self.remote.as_ref(), true).await?;
    }
    if self.config.provider == "embedded" {
      self.embedded.prepare_generation(generation.id).await;
    }
    *self.generation.write().await = Some(generation.clone());
    Ok(generation)
  }

  pub(super) async fn active_generation(&self) -> RuntimeResult<ActiveGeneration> {
    let generation = load_active(&self.pool, &self.config).await?;
    let Some(generation) = generation else {
      if let Some(error) = sqlx::query_scalar::<_, Option<String>>(
        r#"SELECT last_error FROM search_projection.generations
           WHERE state='failed' AND provider=$1 AND config_hash=$2 AND schema_version=$3
           ORDER BY created_at DESC LIMIT 1"#,
      )
      .bind(&self.config.provider)
      .bind(config_hash(&self.config))
      .bind(super::SCHEMA_FINGERPRINT)
      .fetch_optional(&self.pool)
      .await
      .map_err(|error| RuntimeError::database("load failed search generation", error))?
      .flatten()
      {
        return Err(RuntimeError::SearchIndexFailed(error));
      }
      return Err(RuntimeError::SearchIndexNotReady);
    };
    if self.config.provider == "embedded" && !self.embedded.has_generation(generation.id).await {
      return Err(RuntimeError::SearchIndexNotReady);
    }
    *self.generation.write().await = Some(generation.clone());
    Ok(generation)
  }

  pub(in crate::runtime::backend_runtime) async fn reconcile_pending(&self, limit: i32) -> RuntimeResult<usize> {
    const TIME_BUDGET: Duration = Duration::from_secs(20);

    let _lock = self.lifecycle_lock.lock().await;
    let started_at = Instant::now();
    if cleanup_retired_generation(&self.pool, &self.embedded, self.remote.as_ref(), &self.config)
      .await
      .is_err()
    {
      self
        .observability
        .generation_gc_failures
        .fetch_add(1, Ordering::Relaxed);
    }
    let generation = self.candidate_or_active().await?;
    if self.config.provider == "embedded" {
      self.embedded.prepare_generation(generation.id).await;
    }
    let limit = i64::from(limit.clamp(1, 1000));
    let (high_water, scan_complete) = self.seed_generation(generation.id, limit).await?;

    let workspaces = sqlx::query(
      r#"SELECT workspace_id FROM search_projection.workspace_states
         WHERE generation_id=$1 AND (
           available_at <= now()
           OR EXISTS (SELECT 1 FROM search_projection.document_states document
                      WHERE document.generation_id=workspace_states.generation_id
                        AND document.workspace_id=workspace_states.workspace_id
                        AND document.available_at <= now()
                        AND (document.target_source_version <> document.published_source_version
                          OR document.target_source_exists <> document.published_source_exists
                          OR document.target_permission_version <> document.published_permission_version))
         )
         ORDER BY workspace_id LIMIT $2"#,
    )
    .bind(generation.id)
    .bind(limit)
    .fetch_all(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load pending search workspaces", error))?;
    let mut reconciled = 0;
    let mut processed = false;
    for row in workspaces {
      if processed && started_at.elapsed() >= TIME_BUDGET {
        break;
      }
      processed = true;
      let workspace_id: String = row
        .try_get("workspace_id")
        .map_err(|error| RuntimeError::database("decode pending search workspace", error))?;
      match reconcile_workspace(
        &self.pool,
        &self.embedded,
        self.remote.as_ref(),
        &generation,
        &workspace_id,
      )
      .await
      {
        Ok(true) => reconciled += 1,
        Ok(false) => {}
        Err(error) => return Err(error),
      }
    }

    if sweep_generation_orphans(&self.pool, &self.embedded, self.remote.as_ref(), &generation)
      .await
      .is_err()
    {
      self
        .observability
        .generation_gc_failures
        .fetch_add(1, Ordering::Relaxed);
    }

    let seeded: i64 =
      sqlx::query_scalar("SELECT count(*) FROM search_projection.workspace_states WHERE generation_id=$1")
        .bind(generation.id)
        .fetch_one(&self.pool)
        .await
        .map_err(|error| RuntimeError::database("count seeded search workspaces", error))?;
    let total: i64 = sqlx::query_scalar("SELECT count(*) FROM workspaces WHERE sid <= $1")
      .bind(high_water)
      .fetch_one(&self.pool)
      .await
      .map_err(|error| RuntimeError::database("count search workspaces", error))?;
    let pending: bool = sqlx::query_scalar(
      "SELECT EXISTS (SELECT 1 FROM search_projection.workspace_states WHERE generation_id=$1 AND last_error IS \
       DISTINCT FROM $2 AND (NOT covered OR pending_scope <> 'none')) OR EXISTS (SELECT 1 FROM \
       search_projection.document_states document WHERE generation_id=$1 AND NOT EXISTS (SELECT 1 FROM \
       search_projection.workspace_states workspace WHERE workspace.generation_id=document.generation_id AND \
       workspace.workspace_id=document.workspace_id AND workspace.last_error=$2) AND (target_source_version <> \
       published_source_version OR target_source_exists <> published_source_exists OR target_permission_version <> \
       published_permission_version))",
    )
    .bind(generation.id)
    .bind(WORKSPACE_RECONCILE_FAILED)
    .fetch_one(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("check pending search projection", error))?;
    if scan_complete && seeded >= total && !pending {
      let state: String = sqlx::query_scalar("SELECT state FROM search_projection.generations WHERE id=$1")
        .bind(generation.id)
        .fetch_one(&self.pool)
        .await
        .map_err(|error| RuntimeError::database("load search generation state", error))?;
      if state != "active" {
        activate(&self.pool, &generation, &self.config).await?;
        if self.config.provider == "embedded" {
          self.embedded.retain_generation(generation.id).await;
        }
        *self.generation.write().await = Some(generation);
      }
    }
    Ok(reconciled)
  }

  async fn seed_generation(&self, generation_id: Uuid, limit: i64) -> RuntimeResult<(i32, bool)> {
    let mut transaction = self
      .pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin search generation scan", error))?;
    let row = sqlx::query(
      r#"SELECT COALESCE(scan_high_water_sid, (SELECT COALESCE(MAX(sid),0) FROM workspaces)) AS high_water,
                COALESCE(scan_cursor_sid,0) AS cursor
         FROM search_projection.generations WHERE id=$1 FOR UPDATE"#,
    )
    .bind(generation_id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("load search generation scan", error))?;
    let high_water: i32 = row
      .try_get("high_water")
      .map_err(|error| RuntimeError::database("decode search generation high water", error))?;
    let cursor: i32 = row
      .try_get("cursor")
      .map_err(|error| RuntimeError::database("decode search generation cursor", error))?;
    let seeds = sqlx::query("SELECT id,sid FROM workspaces WHERE sid > $1 AND sid <= $2 ORDER BY sid LIMIT $3")
      .bind(cursor)
      .bind(high_water)
      .bind(limit)
      .fetch_all(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("load search workspace scan batch", error))?;
    let exhausted = seeds.len() < limit as usize;
    let mut next_cursor = cursor;
    for row in seeds {
      let workspace_id: String = row
        .try_get("id")
        .map_err(|error| RuntimeError::database("decode search workspace id", error))?;
      next_cursor = row
        .try_get("sid")
        .map_err(|error| RuntimeError::database("decode search workspace sid", error))?;
      sqlx::query(
        "INSERT INTO search_projection.workspace_states(generation_id,workspace_id,target_root_revision) VALUES \
         ($1,$2,nextval('search_projection.source_mutation_version')) ON CONFLICT DO NOTHING",
      )
      .bind(generation_id)
      .bind(workspace_id)
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("seed search workspace state", error))?;
    }
    if exhausted {
      next_cursor = high_water;
    }
    sqlx::query("UPDATE search_projection.generations SET scan_high_water_sid=$2, scan_cursor_sid=$3 WHERE id=$1")
      .bind(generation_id)
      .bind(high_water)
      .bind(next_cursor)
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("persist search generation scan progress", error))?;
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit search generation scan", error))?;
    Ok((high_water, next_cursor >= high_water))
  }

  pub(in crate::runtime::backend_runtime) async fn status(&self) -> RuntimeResult<serde_json::Value> {
    let schema_ready: bool = sqlx::query_scalar("SELECT to_regclass('search_projection.generations') IS NOT NULL")
      .fetch_one(&self.pool)
      .await
      .map_err(|error| RuntimeError::database("check search projection schema", error))?;
    if !schema_ready {
      return Ok(serde_json::json!({
        "ready": false,
        "provider": self.config.provider,
        "state": "missing"
      }));
    }
    let row = sqlx::query(
      r#"SELECT id,provider,state,scan_cursor_sid,scan_high_water_sid,
                (SELECT count(*) FROM search_projection.document_states document
                 WHERE document.generation_id=generations.id
                   AND NOT EXISTS (
                     SELECT 1 FROM search_projection.workspace_states workspace
                     WHERE workspace.generation_id=document.generation_id
                       AND workspace.workspace_id=document.workspace_id
                       AND workspace.last_error=$4
                   )
                   AND (document.target_source_version <> document.published_source_version
                     OR document.target_source_exists <> document.published_source_exists
                     OR document.target_permission_version <> document.published_permission_version)) AS pending_publications,
                (SELECT count(*) FROM search_projection.workspace_states workspace
                 WHERE workspace.generation_id=generations.id
                   AND workspace.progress->>'kind' IN ('stale','deleted')) AS gc_backlog
         FROM search_projection.generations generations
         WHERE state IN ('building','active')
           AND provider=$1 AND config_hash=$2 AND schema_version=$3
         ORDER BY (state='active') DESC, created_at DESC LIMIT 1"#,
    )
    .bind(&self.config.provider)
    .bind(config_hash(&self.config))
    .bind(super::SCHEMA_FINGERPRINT)
    .bind(WORKSPACE_RECONCILE_FAILED)
    .fetch_optional(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load search projection status", error))?;
    let Some(row) = row else {
      return Ok(serde_json::json!({"ready":false,"provider":self.config.provider,"state":"missing"}));
    };
    let state: String = row
      .try_get("state")
      .map_err(|error| RuntimeError::database("decode search projection state", error))?;
    let provider: String = row
      .try_get("provider")
      .map_err(|error| RuntimeError::database("decode search provider", error))?;
    let memory_ready = provider != "embedded"
      || self
        .embedded
        .has_generation(
          row
            .try_get("id")
            .map_err(|error| RuntimeError::database("decode search generation id", error))?,
        )
        .await;
    let provider_requests = self.observability.provider_requests.load(Ordering::Relaxed);
    let provider_latency_micros = self.observability.provider_latency_micros.load(Ordering::Relaxed);
    Ok(serde_json::json!({
      "ready": state == "active" && memory_ready,
      "generationId": row.try_get::<Uuid,_>("id").map_err(|error| RuntimeError::database("decode search generation id", error))?.to_string(),
      "provider": provider,
      "state": state,
      "metrics": {
        "scanCursor": row.try_get::<Option<i32>,_>("scan_cursor_sid").map_err(|error| RuntimeError::database("decode search scan cursor", error))?,
        "scanHighWater": row.try_get::<Option<i32>,_>("scan_high_water_sid").map_err(|error| RuntimeError::database("decode search scan high water", error))?,
        "pendingPublications": row.try_get::<i64,_>("pending_publications").map_err(|error| RuntimeError::database("decode pending search publications", error))?,
        "gcBacklog": row.try_get::<i64,_>("gc_backlog").map_err(|error| RuntimeError::database("decode search GC backlog", error))?,
        "providerRequests": provider_requests,
        "providerLatencyMicrosAvg": provider_latency_micros.checked_div(provider_requests).unwrap_or(0),
        "filterDrops": {
          "missingPublished": self.observability.missing_published.load(Ordering::Relaxed),
          "projectionMismatch": self.observability.projection_mismatch.load(Ordering::Relaxed),
          "canonicalPermission": self.observability.canonical_permission.load(Ordering::Relaxed),
        },
        "generationGcFailures": self.observability.generation_gc_failures.load(Ordering::Relaxed),
      }
    }))
  }
}

#[cfg(test)]
mod tests {
  use serde_json::json;
  use sqlx::PgPool;
  use uuid::Uuid;

  use super::SearchRuntime;
  use crate::runtime::{
    SearchRuntimeConfig,
    backend_runtime::{
      permission::{DocReadScope, SearchActor},
      search::{ActiveGeneration, SEARCH_TEST_LOCK, SearchTable},
    },
    migrations::migrate_search_tables,
  };

  #[tokio::test]
  async fn visible_search_uses_the_bounded_candidate_page_budget() {
    let _guard = SEARCH_TEST_LOCK.lock().await;
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPool::connect(&database_url).await.unwrap();
    migrate_search_tables(&pool).await.unwrap();
    let suffix = Uuid::new_v4().simple().to_string();
    let workspace_id = format!("candidate-pages-{suffix}");
    let generation_id = Uuid::new_v4();
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      r#"INSERT INTO search_projection.generations(id,provider,state,config_hash,schema_version)
         VALUES($1,'embedded','failed',decode(repeat('00',32),'hex'),1)"#,
    )
    .bind(generation_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO search_projection.workspace_states(generation_id,workspace_id,pending_scope) VALUES($1,$2,'none')",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO snapshots(workspace_id,guid,blob,updated_at) \
       VALUES($1,'e',decode('00','hex'),now()),($1,'f',decode('00','hex'),now())",
    )
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      r#"INSERT INTO search_projection.document_states(
           generation_id,workspace_id,doc_id,target_source_version,target_source_exists,
           target_permission_version,published_source_version,published_source_exists,published_permission_version
         ) VALUES($1,$2,'e',1,true,1,1,true,1),($1,$2,'f',1,true,1,1,true,1)"#,
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    let runtime = SearchRuntime::new(pool.clone(), SearchRuntimeConfig::default()).unwrap();
    runtime.embedded.prepare_generation(generation_id).await;
    let docs = ["a", "b", "c", "d", "e", "f"]
      .into_iter()
      .map(|doc_id| {
        json!({
          "generation_id":generation_id.to_string(),"workspace_id":workspace_id,"doc_id":doc_id,
          "source_version":1,"permission_version":1,"title":doc_id,"summary":doc_id,
          "created_by_user_id":"user","updated_by_user_id":"user","created_at":1,"updated_at":1
        })
      })
      .collect::<Vec<_>>();
    runtime
      .embedded
      .write_for_generation(generation_id, "doc".to_string(), serde_json::to_string(&docs).unwrap())
      .await
      .unwrap();
    let result = runtime
      .execute_visible_search(
        &ActiveGeneration {
          id: generation_id,
          manifest: json!({}),
        },
        &workspace_id,
        "user",
        &DocReadScope::All,
        SearchTable::Doc,
        json!({
          "query":{"term":{"workspace_id":{"value":workspace_id}}},
          "fields":["doc_id","source_version","permission_version"],
          "sort":["doc_id"],"size":2
        }),
      )
      .await
      .unwrap();
    assert_eq!(result["total"], 2);
    assert_eq!(result["nodes"][0]["fields"]["doc_id"], json!(["e"]));
    assert_eq!(result["nodes"][1]["fields"]["doc_id"], json!(["f"]));

    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM search_projection.generations WHERE id=$1")
      .bind(generation_id)
      .execute(&pool)
      .await
      .unwrap();
  }

  #[tokio::test]
  async fn generation_scan_finishes_when_the_high_water_workspace_was_deleted() {
    let _guard = SEARCH_TEST_LOCK.lock().await;
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPool::connect(&database_url).await.unwrap();
    migrate_search_tables(&pool).await.unwrap();

    let suffix = Uuid::new_v4().simple().to_string();
    let first_workspace = format!("scan-first-{suffix}");
    let last_workspace = format!("scan-last-{suffix}");
    let first_sid: i32 = sqlx::query_scalar("INSERT INTO workspaces(id) VALUES($1) RETURNING sid")
      .bind(&first_workspace)
      .fetch_one(&pool)
      .await
      .unwrap();
    let last_sid: i32 = sqlx::query_scalar("INSERT INTO workspaces(id) VALUES($1) RETURNING sid")
      .bind(&last_workspace)
      .fetch_one(&pool)
      .await
      .unwrap();
    let generation_id = Uuid::new_v4();
    sqlx::query(
      r#"INSERT INTO search_projection.generations(
           id,provider,state,config_hash,schema_version,scan_high_water_sid,scan_cursor_sid
         ) VALUES($1,'embedded','failed',decode(repeat('00',32),'hex'),1,$2,$3)"#,
    )
    .bind(generation_id)
    .bind(last_sid)
    .bind(first_sid)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&last_workspace)
      .execute(&pool)
      .await
      .unwrap();

    let runtime = SearchRuntime::new(pool.clone(), SearchRuntimeConfig::default()).unwrap();
    let (_, complete) = runtime.seed_generation(generation_id, 100).await.unwrap();
    assert!(complete);
    let cursor: i32 = sqlx::query_scalar("SELECT scan_cursor_sid FROM search_projection.generations WHERE id=$1")
      .bind(generation_id)
      .fetch_one(&pool)
      .await
      .unwrap();
    assert_eq!(cursor, last_sid);

    sqlx::query("DELETE FROM search_projection.generations WHERE id=$1")
      .bind(generation_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&first_workspace)
      .execute(&pool)
      .await
      .unwrap();
  }

  #[tokio::test]
  async fn failed_generation_errors_are_scoped_to_the_current_configuration() {
    let _guard = SEARCH_TEST_LOCK.lock().await;
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPool::connect(&database_url).await.unwrap();
    migrate_search_tables(&pool).await.unwrap();
    let generation_id = Uuid::new_v4();
    sqlx::query(
      r#"INSERT INTO search_projection.generations(
           id,provider,state,config_hash,schema_version,last_error
         ) VALUES($1,'manticoresearch','failed',decode(repeat('01',32),'hex'),1,'old provider failed')"#,
    )
    .bind(generation_id)
    .execute(&pool)
    .await
    .unwrap();
    let config = SearchRuntimeConfig {
      endpoint: Uuid::new_v4().to_string(),
      ..SearchRuntimeConfig::default()
    };
    let runtime = SearchRuntime::new(pool.clone(), config).unwrap();
    assert!(matches!(
      runtime.active_generation().await,
      Err(crate::runtime::RuntimeError::SearchIndexNotReady)
    ));
    sqlx::query("DELETE FROM search_projection.generations WHERE id=$1")
      .bind(generation_id)
      .execute(&pool)
      .await
      .unwrap();
  }

  #[tokio::test]
  async fn query_snapshot_rejects_a_draining_generation() {
    let _guard = SEARCH_TEST_LOCK.lock().await;
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPool::connect(&database_url).await.unwrap();
    migrate_search_tables(&pool).await.unwrap();
    let generation_id = Uuid::new_v4();
    let workspace_id = format!("query-fence-{}", Uuid::new_v4().simple());
    sqlx::query(
      r#"INSERT INTO search_projection.generations(id,provider,state,config_hash,schema_version)
         VALUES($1,'embedded','draining',decode(repeat('00',32),'hex'),1)"#,
    )
    .bind(generation_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      r#"INSERT INTO search_projection.workspace_states(
           generation_id,workspace_id,covered,required_permission_version,applied_permission_version
         ) VALUES($1,$2,true,7,7)"#,
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    let runtime = SearchRuntime::new(pool.clone(), SearchRuntimeConfig::default()).unwrap();
    assert!(
      !runtime
        .query_snapshot_is_current(&workspace_id, generation_id, 7)
        .await
        .unwrap()
    );

    sqlx::query("DELETE FROM search_projection.generations WHERE id=$1")
      .bind(generation_id)
      .execute(&pool)
      .await
      .unwrap();
  }

  #[tokio::test]
  async fn canonical_filter_removes_basic_provider_false_positives() {
    let _guard = SEARCH_TEST_LOCK.lock().await;
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPool::connect(&database_url).await.unwrap();
    let suffix = Uuid::new_v4().simple().to_string();
    let user_id = format!("basic-filter-user-{suffix}");
    let workspace_id = format!("basic-filter-workspace-{suffix}");
    sqlx::query(
      "INSERT INTO users(id,name,email,registered,email_verified,disabled) VALUES($1,'Basic Filter \
       User',$2,true,now(),false)",
    )
    .bind(&user_id)
    .bind(format!("{user_id}@example.com"))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("INSERT INTO workspace_access_policies(workspace_id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("INSERT INTO workspace_members(workspace_id,user_id,role,state) VALUES($1,$2,'member','active')")
      .bind(&workspace_id)
      .bind(&user_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO entitlements(id,target_type,target_id,source,plan,status,validated_at) \
       VALUES($1,'workspace',$2,'admin_grant','team','active',now())",
    )
    .bind(format!("basic-filter-entitlement-{suffix}"))
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO doc_access_policies(workspace_id,doc_id,visibility,member_default_role) \
       VALUES($1,'allowed','private','none'),($1,'hidden','private','none'),($1,'pending','private','none')",
    )
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO doc_grants(workspace_id,doc_id,principal_type,principal_id,role) \
       VALUES($1,'allowed','user',$2,'reader')",
    )
    .bind(&workspace_id)
    .bind(&user_id)
    .execute(&pool)
    .await
    .unwrap();
    let generation_id = Uuid::new_v4();
    sqlx::query(
      r#"INSERT INTO search_projection.generations(id,provider,state,config_hash,schema_version)
         VALUES($1,'embedded','failed',decode(repeat('00',32),'hex'),1)"#,
    )
    .bind(generation_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO search_projection.workspace_states(generation_id,workspace_id,pending_scope) VALUES($1,$2,'none')",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO snapshots(workspace_id,guid,blob,updated_at) \
       VALUES($1,'allowed',decode('00','hex'),now()),($1,'hidden',decode('00','hex'),now()), \
       ($1,'history',decode('00','hex'),now()),($1,'old-permission',decode('00','hex'),now()), \
       ($1,'pending',decode('00','hex'),now())",
    )
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      r#"INSERT INTO search_projection.document_states(
           generation_id,workspace_id,doc_id,target_source_version,target_source_exists,
           target_permission_version,published_source_version,published_source_exists,published_permission_version
         ) VALUES($1,$2,'allowed',2,true,3,2,true,3),($1,$2,'hidden',2,true,3,2,true,3)"#,
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      r#"INSERT INTO search_projection.document_states(
           generation_id,workspace_id,doc_id,target_source_version,target_source_exists,
           target_permission_version,published_source_version,published_source_exists,published_permission_version
         ) VALUES($1,$2,'history',2,true,3,2,true,3),
                 ($1,$2,'old-permission',2,true,3,2,true,3),
                 ($1,$2,'pending',3,true,3,2,true,3),
                 ($1,$2,'deleted',4,false,3,4,false,3)"#,
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    let runtime = SearchRuntime::new(pool.clone(), SearchRuntimeConfig::default()).unwrap();
    let mut result = serde_json::json!({
      "total":8,
      "nodes":[
        {"id":"allowed","_source":{"doc_id":"allowed","source_version":2,"permission_version":3}},
        {"id":"allowed-history","_source":{"doc_id":"allowed","source_version":1,"permission_version":3}},
        {"id":"hidden","_source":{"doc_id":"hidden","source_version":2,"permission_version":3}},
        {"id":"history","_source":{"doc_id":"history","source_version":1,"permission_version":3}},
        {"id":"old-permission","_source":{"doc_id":"old-permission","source_version":2,"permission_version":2}},
        {"id":"pending","_source":{"doc_id":"pending","source_version":2,"permission_version":3}},
        {"id":"deleted","_source":{"doc_id":"deleted","source_version":4,"permission_version":3}},
        {"id":"missing","_source":{"doc_id":"missing","source_version":2,"permission_version":3}}
      ]
    });
    let all_scope_result = result.clone();
    let scope = runtime
      .authorizer
      .authorize_search(
        &SearchActor::User {
          user_id: user_id.clone(),
        },
        &workspace_id,
      )
      .await
      .unwrap();
    assert!(matches!(scope.docs, DocReadScope::ProjectedAcl(_)));
    runtime
      .retain_canonically_visible(
        &ActiveGeneration {
          id: generation_id,
          manifest: serde_json::json!({}),
        },
        &workspace_id,
        &user_id,
        &scope.docs,
        &mut result,
      )
      .await
      .unwrap();
    assert_eq!(result["total"], 1);
    assert_eq!(result["nodes"][0]["id"], "allowed");

    let mut result = all_scope_result;
    runtime
      .retain_canonically_visible(
        &ActiveGeneration {
          id: generation_id,
          manifest: serde_json::json!({}),
        },
        &workspace_id,
        &user_id,
        &DocReadScope::All,
        &mut result,
      )
      .await
      .unwrap();
    assert_eq!(result["total"], 3);
    assert_eq!(result["nodes"][0]["id"], "allowed");
    assert_eq!(result["nodes"][1]["id"], "hidden");
    assert_eq!(result["nodes"][2]["id"], "pending");

    let mut aggregate = serde_json::json!({
      "total":2,
      "buckets":[
        {"key":"visible","count":9,"hits":{"total":9,"nodes":[
          {"id":"allowed","_source":{"doc_id":"allowed","source_version":2,"permission_version":3}}
        ]}},
        {"key":"history","count":7,"hits":{"total":7,"nodes":[
          {"id":"allowed-history","_source":{"doc_id":"allowed","source_version":1,"permission_version":3}}
        ]}}
      ]
    });
    runtime
      .retain_canonically_visible(
        &ActiveGeneration {
          id: generation_id,
          manifest: serde_json::json!({}),
        },
        &workspace_id,
        &user_id,
        &DocReadScope::All,
        &mut aggregate,
      )
      .await
      .unwrap();
    assert_eq!(aggregate["total"], 1);
    assert_eq!(aggregate["buckets"][0]["count"], 1);
    assert_eq!(aggregate["buckets"][0]["hits"]["total"], 1);

    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM users WHERE id=$1")
      .bind(&user_id)
      .execute(&pool)
      .await
      .unwrap();
  }
}
