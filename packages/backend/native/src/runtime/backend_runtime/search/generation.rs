use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use super::{SCHEMA_FINGERPRINT, SearchProvider, SearchTable, WORKSPACE_RECONCILE_FAILED};
use crate::{
  runtime::{RuntimeError, RuntimeResult, SearchRuntimeConfig},
  search_index::EmbeddedSearchIndex,
};

#[derive(Clone)]
pub(super) struct ActiveGeneration {
  pub(super) id: Uuid,
  pub(super) manifest: Value,
}

impl ActiveGeneration {
  pub(super) fn physical_table(&self, table: SearchTable) -> RuntimeResult<&str> {
    self
      .manifest
      .get(table.as_str())
      .and_then(Value::as_str)
      .ok_or_else(|| RuntimeError::invalid_state("search generation manifest is incomplete"))
  }
}

pub(super) async fn ensure(
  pool: &PgPool,
  config: &SearchRuntimeConfig,
  remote: Option<&SearchProvider>,
  rebuild_embedded: bool,
) -> RuntimeResult<ActiveGeneration> {
  let expected_config_hash = config_hash(config);
  let expected_provider_identity = provider_identity(config);
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin search generation", error))?;
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('search-projection-generation', 0))")
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("lock search generation", error))?;
  sqlx::query(
    r#"UPDATE search_projection.generations
       SET manifest=jsonb_set(manifest,'{providerIdentity}',to_jsonb($1::text),true)
       WHERE provider=$2 AND config_hash=$3 AND state IN ('building','active','draining')
         AND NOT manifest ? 'providerIdentity'"#,
  )
  .bind(&expected_provider_identity)
  .bind(&config.provider)
  .bind(&expected_config_hash)
  .execute(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("backfill search provider identity", error))?;
  let existing = sqlx::query(
    r#"SELECT id,provider,config_hash,schema_version,manifest,state
       FROM search_projection.generations
       WHERE state='building'
       ORDER BY created_at DESC
       LIMIT 1"#,
  )
  .fetch_optional(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("load search generation", error))?;
  let generation = if let Some(row) = existing {
    let provider: String = row
      .try_get("provider")
      .map_err(|error| RuntimeError::database("decode search generation provider", error))?;
    let existing_config_hash: Vec<u8> = row
      .try_get("config_hash")
      .map_err(|error| RuntimeError::database("decode search generation config hash", error))?;
    let schema_version: i32 = row
      .try_get("schema_version")
      .map_err(|error| RuntimeError::database("decode search generation schema version", error))?;
    if provider != config.provider
      || existing_config_hash != expected_config_hash
      || schema_version != SCHEMA_FINGERPRINT
    {
      let id: Uuid = row
        .try_get("id")
        .map_err(|error| RuntimeError::database("decode superseded search generation id", error))?;
      sqlx::query(
        "UPDATE search_projection.generations SET state='failed', last_error='search generation superseded by \
         configuration' WHERE id=$1 AND state='building'",
      )
      .bind(id)
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("fail superseded search generation", error))?;
      create_generation(&mut transaction, config, expected_config_hash.clone()).await?
    } else {
      let state: String = row
        .try_get("state")
        .map_err(|error| RuntimeError::database("decode search generation state", error))?;
      if rebuild_embedded {
        if state == "building" {
          sqlx::query(
            "UPDATE search_projection.generations SET state='failed', last_error='embedded generation lost on \
             restart' WHERE id=$1 AND state='building'",
          )
          .bind(
            row
              .try_get::<Uuid, _>("id")
              .map_err(|error| RuntimeError::database("decode search generation id", error))?,
          )
          .execute(&mut *transaction)
          .await
          .map_err(|error| RuntimeError::database("fail stale embedded generation", error))?;
          create_generation(&mut transaction, config, expected_config_hash.clone()).await?
        } else {
          decode(row)?
        }
      } else {
        decode(row)?
      }
    }
  } else {
    let active = sqlx::query(
      r#"SELECT id,provider,config_hash,schema_version,manifest
         FROM search_projection.generations
         WHERE state='active'
         ORDER BY activated_at DESC NULLS LAST LIMIT 1"#,
    )
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("load active search generation", error))?;
    if let Some(row) = active {
      let provider: String = row
        .try_get("provider")
        .map_err(|error| RuntimeError::database("decode active search provider", error))?;
      let existing_config_hash: Vec<u8> = row
        .try_get("config_hash")
        .map_err(|error| RuntimeError::database("decode active search config hash", error))?;
      let schema_version: i32 = row
        .try_get("schema_version")
        .map_err(|error| RuntimeError::database("decode active search schema version", error))?;
      if !rebuild_embedded
        && provider == config.provider
        && existing_config_hash == expected_config_hash
        && schema_version == SCHEMA_FINGERPRINT
      {
        decode(row)?
      } else {
        create_or_reject_failed(&mut transaction, config, expected_config_hash.clone()).await?
      }
    } else {
      create_or_reject_failed(&mut transaction, config, expected_config_hash.clone()).await?
    }
  };
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit search generation", error))?;

  if let Some(remote) = remote {
    for table in [SearchTable::Doc, SearchTable::Block] {
      if let Err(error) = remote.provision(generation.physical_table(table)?, table).await {
        if !matches!(error, RuntimeError::SearchProviderUnavailable) {
          fail(pool, &generation, &error.to_string()).await?;
        }
        return Err(error);
      }
    }
  }
  Ok(generation)
}

pub(super) async fn load_active(
  pool: &PgPool,
  config: &SearchRuntimeConfig,
) -> RuntimeResult<Option<ActiveGeneration>> {
  let row = sqlx::query(
    r#"SELECT id,provider,config_hash,manifest
       FROM search_projection.generations
       WHERE state='active' AND provider=$1 AND config_hash=$2 AND schema_version=$3
       ORDER BY activated_at DESC NULLS LAST LIMIT 1"#,
  )
  .bind(&config.provider)
  .bind(config_hash(config))
  .bind(SCHEMA_FINGERPRINT)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("load active search generation", error))?;
  row.map(decode).transpose()
}

pub(super) async fn cleanup_retired_generation(
  pool: &PgPool,
  embedded: &EmbeddedSearchIndex,
  remote: Option<&SearchProvider>,
  config: &SearchRuntimeConfig,
) -> RuntimeResult<bool> {
  let row = sqlx::query(
    r#"SELECT id,manifest,
              generation.state='failed'
                AND NOT EXISTS (SELECT 1 FROM search_projection.generations active
                                WHERE active.state='active' AND active.provider=generation.provider
                                  AND active.config_hash=generation.config_hash
                                  AND active.schema_version=generation.schema_version)
                AND NOT EXISTS (SELECT 1 FROM search_projection.generations newer
                                WHERE newer.state='failed' AND newer.provider=generation.provider
                                  AND newer.config_hash=generation.config_hash
                                  AND newer.schema_version=generation.schema_version
                                  AND newer.created_at > generation.created_at)
                AS retain_failure_marker
       FROM search_projection.generations generation
       WHERE provider=$1 AND schema_version=$2
         AND (manifest->>'providerIdentity'=$3
           OR (NOT manifest ? 'providerIdentity' AND config_hash=$4))
         AND ((state='failed' AND created_at < now() - interval '1 hour'
               AND manifest <> '{}'::jsonb)
           OR (state='draining' AND drained_at < now() - interval '24 hours'))
       ORDER BY COALESCE(drained_at,created_at),id LIMIT 1"#,
  )
  .bind(&config.provider)
  .bind(SCHEMA_FINGERPRINT)
  .bind(provider_identity(config))
  .bind(config_hash(config))
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("load retired search generation", error))?;
  let Some(row) = row else {
    return Ok(false);
  };
  let retain_failure_marker: bool = row
    .try_get("retain_failure_marker")
    .map_err(|error| RuntimeError::database("decode retired search generation state", error))?;
  let generation = decode(row)?;
  if let Some(provider) = remote {
    for table in [SearchTable::Doc, SearchTable::Block] {
      provider
        .drop_generation_asset(generation.physical_table(table)?)
        .await?;
    }
  } else {
    embedded.remove_generation(generation.id).await;
  }
  if retain_failure_marker {
    sqlx::query("UPDATE search_projection.generations SET manifest='{}' WHERE id=$1 AND state='failed'")
      .bind(generation.id)
      .execute(pool)
      .await
      .map_err(|error| RuntimeError::database("retire failed search generation assets", error))?;
  } else {
    sqlx::query("DELETE FROM search_projection.generations WHERE id=$1 AND state IN ('failed','draining')")
      .bind(generation.id)
      .execute(pool)
      .await
      .map_err(|error| RuntimeError::database("delete retired search generation", error))?;
  }
  Ok(true)
}

async fn fail(pool: &PgPool, generation: &ActiveGeneration, message: &str) -> RuntimeResult<()> {
  sqlx::query(
    "UPDATE search_projection.generations SET state='failed', last_error=$2 WHERE id=$1 AND state NOT IN \
     ('active','draining')",
  )
  .bind(generation.id)
  .bind(message)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("fail search generation", error))?;
  Ok(())
}

async fn create_or_reject_failed(
  transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  config: &SearchRuntimeConfig,
  config_hash: Vec<u8>,
) -> RuntimeResult<ActiveGeneration> {
  let failure = sqlx::query_scalar::<_, String>(
    r#"SELECT COALESCE(last_error,'search generation build failed')
       FROM search_projection.generations
       WHERE state='failed' AND provider=$1 AND config_hash=$2 AND schema_version=$3
       ORDER BY created_at DESC LIMIT 1"#,
  )
  .bind(&config.provider)
  .bind(&config_hash)
  .bind(SCHEMA_FINGERPRINT)
  .fetch_optional(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load failed search generation", error))?;
  if let Some(failure) = failure {
    return Err(RuntimeError::SearchIndexFailed(failure));
  }
  create_generation(transaction, config, config_hash).await
}

pub(super) async fn activate(
  pool: &PgPool,
  generation: &ActiveGeneration,
  config: &SearchRuntimeConfig,
) -> RuntimeResult<()> {
  let expected_config_hash = config_hash(config);
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin search generation activation", error))?;
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('search-projection-generation', 0))")
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("lock search generation activation", error))?;
  let row = sqlx::query(
    r#"SELECT generation.state,generation.provider,generation.config_hash,generation.schema_version,
              generation.scan_high_water_sid IS NOT NULL
                AND generation.scan_cursor_sid IS NOT NULL
                AND generation.scan_cursor_sid >= generation.scan_high_water_sid AS scan_complete,
              NOT EXISTS (
                SELECT 1
                FROM search_projection.workspace_states state
                WHERE state.generation_id=generation.id
                  AND state.last_error IS DISTINCT FROM $2
                  AND (
                    NOT state.covered
                    OR state.required_permission_version > state.applied_permission_version
                    OR state.pending_scope <> 'none'
                    OR state.last_error IS NOT NULL
                  )
              ) AS workspaces_covered,
              NOT EXISTS (
                SELECT 1
                FROM workspaces workspace
                WHERE workspace.sid <= COALESCE(generation.scan_high_water_sid,0)
                  AND NOT EXISTS (
                    SELECT 1
                    FROM search_projection.workspace_states state
                    WHERE state.generation_id=generation.id AND state.workspace_id=workspace.id
                  )
              ) AS workspaces_seeded,
              NOT EXISTS (
                SELECT 1 FROM search_projection.document_states state
                WHERE state.generation_id=generation.id
                  AND NOT EXISTS (
                    SELECT 1 FROM search_projection.workspace_states workspace
                    WHERE workspace.generation_id=state.generation_id
                      AND workspace.workspace_id=state.workspace_id
                      AND workspace.last_error=$2
                  )
                  AND (state.target_source_version <> state.published_source_version
                    OR state.target_source_exists <> state.published_source_exists
                    OR state.target_permission_version <> state.published_permission_version)
              ) AS publications_complete
       FROM search_projection.generations generation
       WHERE generation.id=$1
       FOR UPDATE"#,
  )
  .bind(generation.id)
  .bind(WORKSPACE_RECONCILE_FAILED)
  .fetch_optional(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("load search generation activation state", error))?;
  let Some(row) = row else {
    return Err(RuntimeError::SearchIndexNotReady);
  };
  let state: String = row
    .try_get("state")
    .map_err(|error| RuntimeError::database("decode search generation activation state", error))?;
  let provider: String = row
    .try_get("provider")
    .map_err(|error| RuntimeError::database("decode search generation activation provider", error))?;
  let row_config_hash: Vec<u8> = row
    .try_get("config_hash")
    .map_err(|error| RuntimeError::database("decode search generation activation config hash", error))?;
  let schema_version: i32 = row
    .try_get("schema_version")
    .map_err(|error| RuntimeError::database("decode search generation activation schema", error))?;
  let scan_complete: bool = row
    .try_get("scan_complete")
    .map_err(|error| RuntimeError::database("decode search generation scan state", error))?;
  let workspaces_covered: bool = row
    .try_get("workspaces_covered")
    .map_err(|error| RuntimeError::database("decode search generation workspace coverage", error))?;
  let workspaces_seeded: bool = row
    .try_get("workspaces_seeded")
    .map_err(|error| RuntimeError::database("decode search generation workspace seed", error))?;
  let publications_complete: bool = row
    .try_get("publications_complete")
    .map_err(|error| RuntimeError::database("decode search generation publication state", error))?;
  if state != "building"
    || provider != config.provider
    || row_config_hash != expected_config_hash
    || schema_version != SCHEMA_FINGERPRINT
    || !scan_complete
    || !workspaces_covered
    || !workspaces_seeded
    || !publications_complete
  {
    return Err(RuntimeError::SearchIndexNotReady);
  }
  sqlx::query(
    "UPDATE search_projection.generations SET state='draining', drained_at=now() WHERE state='active' AND id<>$1",
  )
  .bind(generation.id)
  .execute(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("drain previous search generation", error))?;
  sqlx::query(
    "UPDATE search_projection.generations SET state='active', activated_at=coalesce(activated_at,now()) WHERE id=$1 \
     AND state='building'",
  )
  .bind(generation.id)
  .execute(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("activate search generation", error))?;
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit search generation activation", error))
}

pub(super) fn config_hash(config: &SearchRuntimeConfig) -> Vec<u8> {
  let mut hash = Sha256::new();
  for value in [
    &config.provider,
    &config.endpoint,
    &config.api_key,
    &config.username,
    &config.password,
  ] {
    hash.update(value.as_bytes());
    hash.update([0]);
  }
  hash.finalize().to_vec()
}

pub(super) fn provider_identity(config: &SearchRuntimeConfig) -> String {
  let mut hash = Sha256::new();
  hash.update(config.provider.as_bytes());
  hash.update([0]);
  if config.provider != "embedded" {
    hash.update(config.endpoint.trim_end_matches('/').as_bytes());
  }
  hash.finalize().iter().map(|byte| format!("{byte:02x}")).collect()
}

fn decode(row: sqlx::postgres::PgRow) -> RuntimeResult<ActiveGeneration> {
  Ok(ActiveGeneration {
    id: row
      .try_get("id")
      .map_err(|error| RuntimeError::database("decode search generation id", error))?,
    manifest: row
      .try_get("manifest")
      .map_err(|error| RuntimeError::database("decode search generation manifest", error))?,
  })
}

async fn create_generation(
  transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  config: &SearchRuntimeConfig,
  config_hash: Vec<u8>,
) -> RuntimeResult<ActiveGeneration> {
  let generation_id = Uuid::new_v4();
  let suffix = generation_id.simple().to_string();
  let provider_identity = provider_identity(config);
  let manifest = if config.provider == "embedded" {
    json!({"doc":"doc","block":"block","providerIdentity":provider_identity})
  } else {
    json!({
      "doc":format!("affine_search_doc_{suffix}"),
      "block":format!("affine_search_block_{suffix}"),
      "providerIdentity":provider_identity
    })
  };
  sqlx::query(
    r#"INSERT INTO search_projection.generations
       (id,provider,state,config_hash,schema_version,manifest)
       VALUES ($1,$2,'building',$3,$4,$5)"#,
  )
  .bind(generation_id)
  .bind(&config.provider)
  .bind(&config_hash)
  .bind(SCHEMA_FINGERPRINT)
  .bind(&manifest)
  .execute(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("create search generation", error))?;
  Ok(ActiveGeneration {
    id: generation_id,
    manifest,
  })
}

#[cfg(test)]
mod tests {
  use serde_json::json;
  use sqlx::PgPool;
  use uuid::Uuid;

  use super::{cleanup_retired_generation, config_hash, ensure, provider_identity};
  use crate::{
    runtime::{
      RuntimeError, SearchRuntimeConfig, backend_runtime::search::SEARCH_TEST_LOCK, migrations::migrate_search_tables,
    },
    search_index::EmbeddedSearchIndex,
  };

  #[tokio::test]
  async fn configuration_change_supersedes_an_incomplete_candidate() {
    let _guard = SEARCH_TEST_LOCK.lock().await;
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPool::connect(&database_url).await.unwrap();
    migrate_search_tables(&pool).await.unwrap();
    sqlx::query("DELETE FROM search_projection.generations WHERE state='building'")
      .execute(&pool)
      .await
      .unwrap();

    let stale_id = Uuid::new_v4();
    sqlx::query(
      r#"INSERT INTO search_projection.generations(id,provider,state,config_hash,schema_version)
         VALUES($1,'embedded','building',decode(repeat('00',32),'hex'),1)"#,
    )
    .bind(stale_id)
    .execute(&pool)
    .await
    .unwrap();

    let generation = ensure(&pool, &SearchRuntimeConfig::default(), None, false)
      .await
      .unwrap();
    assert_ne!(generation.id, stale_id);
    let stale: (String, Option<String>) =
      sqlx::query_as("SELECT state,last_error FROM search_projection.generations WHERE id=$1")
        .bind(stale_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(stale.0, "failed");
    assert_eq!(
      stale.1.as_deref(),
      Some("search generation superseded by configuration")
    );

    sqlx::query("DELETE FROM search_projection.generations WHERE id=$1")
      .bind(generation.id)
      .execute(&pool)
      .await
      .unwrap();
    let previous_config = SearchRuntimeConfig {
      api_key: "previous credential".to_string(),
      ..Default::default()
    };
    let current_config = SearchRuntimeConfig {
      api_key: "current credential".to_string(),
      ..previous_config.clone()
    };
    assert_ne!(config_hash(&previous_config), config_hash(&current_config));
    assert_eq!(provider_identity(&previous_config), provider_identity(&current_config));
    let retired_id = Uuid::new_v4();
    let failed_id = Uuid::new_v4();
    let manifest = json!({
      "doc":"doc",
      "block":"block",
      "providerIdentity":provider_identity(&previous_config)
    });
    sqlx::query(
      r#"INSERT INTO search_projection.generations
         (id,provider,state,config_hash,schema_version,manifest,created_at)
         VALUES($1,'embedded','failed',$3,1,$4,now() - interval '10 days'),
               ($2,'embedded','failed',$3,1,$4,now() - interval '2 days')"#,
    )
    .bind(retired_id)
    .bind(failed_id)
    .bind(config_hash(&previous_config))
    .bind(manifest)
    .execute(&pool)
    .await
    .unwrap();
    let embedded = EmbeddedSearchIndex::new();
    embedded.prepare_generation(retired_id).await;

    assert!(
      cleanup_retired_generation(&pool, &embedded, None, &current_config)
        .await
        .unwrap()
    );
    assert!(!embedded.has_generation(retired_id).await);
    assert!(
      !sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM search_projection.generations WHERE id=$1)")
        .bind(retired_id)
        .fetch_one(&pool)
        .await
        .unwrap()
    );
    assert!(
      cleanup_retired_generation(&pool, &embedded, None, &current_config)
        .await
        .unwrap()
    );
    assert_eq!(
      sqlx::query_scalar::<_, serde_json::Value>("SELECT manifest FROM search_projection.generations WHERE id=$1")
        .bind(failed_id)
        .fetch_one(&pool)
        .await
        .unwrap(),
      serde_json::json!({})
    );
    assert!(matches!(
      ensure(&pool, &previous_config, None, false).await,
      Err(RuntimeError::SearchIndexFailed(_))
    ));

    sqlx::query("DELETE FROM search_projection.generations WHERE id IN ($1,$2)")
      .bind(stale_id)
      .bind(failed_id)
      .execute(&pool)
      .await
      .unwrap();
  }
}
