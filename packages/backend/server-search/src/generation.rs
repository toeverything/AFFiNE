use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::config::SearchConfig;
use crate::embedded::EmbeddedSearchIndex;
use crate::error::{SearchError, SearchResult};
use crate::provider::SearchProvider;
use crate::types::SearchTable;
use crate::{DOCUMENT_PROJECTION_FAILED, EMBEDDED_GENERATION_LOST, SCHEMA_FINGERPRINT, WORKSPACE_RECONCILE_FAILED};

pub const LIFECYCLE_LOCK_KEY: &str = "search-projection-lifecycle";

#[derive(Clone, Debug)]
pub struct ActiveGeneration {
  pub id: Uuid,
  pub manifest: Value,
}

impl ActiveGeneration {
  pub fn physical_table(&self, table: SearchTable) -> SearchResult<&str> {
    self
      .manifest
      .get(table.as_str())
      .and_then(Value::as_str)
      .ok_or_else(|| SearchError::GenerationInvalid("generation manifest is incomplete".to_owned()))
  }
}

pub async fn ensure(
  pool: &PgPool,
  config: &SearchConfig,
  remote: Option<&SearchProvider>,
  rebuild_embedded: bool,
) -> SearchResult<ActiveGeneration> {
  let expected_config_hash = config_hash(config);
  let expected_provider_identity = provider_identity(config);
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| SearchError::database("begin search generation", error))?;
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(LIFECYCLE_LOCK_KEY)
    .execute(&mut *transaction)
    .await
    .map_err(|error| SearchError::database("lock search generation lifecycle", error))?;

  sqlx::query(
    r#"UPDATE search_projection.generations
       SET manifest = jsonb_set(manifest, '{providerIdentity}', to_jsonb($1::text), true)
       WHERE provider = $2 AND config_hash = $3 AND state IN ('building', 'active', 'draining')
         AND NOT manifest ? 'providerIdentity'"#,
  )
  .bind(&expected_provider_identity)
  .bind(&config.provider)
  .bind(&expected_config_hash)
  .execute(&mut *transaction)
  .await
  .map_err(|error| SearchError::database("backfill search provider identity", error))?;

  let existing = sqlx::query(
    r#"SELECT id, provider, config_hash, schema_version, manifest, state
       FROM search_projection.generations
       WHERE state = 'building'
       ORDER BY created_at DESC
       LIMIT 1"#,
  )
  .fetch_optional(&mut *transaction)
  .await
  .map_err(|error| SearchError::database("load search generation", error))?;

  let generation = if let Some(row) = existing {
    let provider: String = row
      .try_get("provider")
      .map_err(|error| SearchError::database("decode search generation provider", error))?;
    let existing_config_hash: Vec<u8> = row
      .try_get("config_hash")
      .map_err(|error| SearchError::database("decode search generation config hash", error))?;
    let schema_version: i32 = row
      .try_get("schema_version")
      .map_err(|error| SearchError::database("decode search generation schema version", error))?;
    if provider != config.provider
      || existing_config_hash != expected_config_hash
      || schema_version != SCHEMA_FINGERPRINT
    {
      let id: Uuid = row
        .try_get("id")
        .map_err(|error| SearchError::database("decode superseded search generation id", error))?;
      sqlx::query(
        "UPDATE search_projection.generations SET state = 'failed', last_error = 'search generation superseded by configuration' WHERE id = $1 AND state = 'building'",
      )
      .bind(id)
      .execute(&mut *transaction)
      .await
      .map_err(|error| SearchError::database("fail superseded search generation", error))?;
      create_generation(&mut transaction, config, expected_config_hash.clone()).await?
    } else if rebuild_embedded {
      let id: Uuid = row
        .try_get("id")
        .map_err(|error| SearchError::database("decode search generation id", error))?;
      sqlx::query(
        "UPDATE search_projection.generations SET state = 'failed', last_error = $2 WHERE id = $1 AND state = 'building'",
      )
      .bind(id)
      .bind(EMBEDDED_GENERATION_LOST)
      .execute(&mut *transaction)
      .await
      .map_err(|error| SearchError::database("fail stale embedded generation", error))?;
      create_generation(&mut transaction, config, expected_config_hash.clone()).await?
    } else {
      decode(row)?
    }
  } else {
    let active = sqlx::query(
      r#"SELECT id, provider, config_hash, schema_version, manifest
         FROM search_projection.generations
         WHERE state = 'active'
         ORDER BY activated_at DESC NULLS LAST LIMIT 1"#,
    )
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| SearchError::database("load active search generation", error))?;
    if let Some(row) = active {
      let provider: String = row
        .try_get("provider")
        .map_err(|error| SearchError::database("decode active search provider", error))?;
      let existing_config_hash: Vec<u8> = row
        .try_get("config_hash")
        .map_err(|error| SearchError::database("decode active search config hash", error))?;
      let schema_version: i32 = row
        .try_get("schema_version")
        .map_err(|error| SearchError::database("decode active search schema version", error))?;
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
    .map_err(|error| SearchError::database("commit search generation", error))?;

  for table in [SearchTable::Doc, SearchTable::Block] {
    let physical_table = match generation.physical_table(table) {
      Ok(physical_table) => physical_table,
      Err(error) => {
        fail(pool, &generation, &error.to_string()).await?;
        return Err(error);
      }
    };
    if let Some(remote) = remote
      && let Err(error) = remote.provision(physical_table, table).await
    {
      if !matches!(error, SearchError::ProviderUnavailable) {
        fail(pool, &generation, &error.to_string()).await?;
      }
      return Err(error);
    }
  }
  Ok(generation)
}

pub async fn load_active(pool: &PgPool, config: &SearchConfig) -> SearchResult<Option<ActiveGeneration>> {
  let mut connection = pool
    .acquire()
    .await
    .map_err(|error| SearchError::database("acquire connection for active search generation", error))?;
  load_active_in(&mut connection, config).await
}

pub async fn load_active_in(
  connection: &mut sqlx::PgConnection,
  config: &SearchConfig,
) -> SearchResult<Option<ActiveGeneration>> {
  let row = sqlx::query(
    r#"SELECT id, provider, config_hash, manifest
       FROM search_projection.generations
       WHERE state = 'active' AND provider = $1 AND config_hash = $2 AND schema_version = $3
       ORDER BY activated_at DESC NULLS LAST LIMIT 1"#,
  )
  .bind(&config.provider)
  .bind(config_hash(config))
  .bind(SCHEMA_FINGERPRINT)
  .fetch_optional(connection)
  .await
  .map_err(|error| SearchError::database("load active search generation", error))?;
  row.map(decode).transpose()
}

pub async fn cleanup_retired_generation(
  pool: &PgPool,
  embedded: &EmbeddedSearchIndex,
  remote: Option<&SearchProvider>,
  config: &SearchConfig,
) -> SearchResult<bool> {
  let row = sqlx::query(
    r#"SELECT id, manifest,
              generation.state = 'failed'
                AND generation.last_error IS DISTINCT FROM $5
                AND NOT EXISTS (SELECT 1 FROM search_projection.generations active
                                WHERE active.state = 'active' AND active.provider = generation.provider
                                  AND active.config_hash = generation.config_hash
                                  AND active.schema_version = generation.schema_version)
                AND NOT EXISTS (SELECT 1 FROM search_projection.generations newer
                                WHERE newer.state = 'failed' AND newer.provider = generation.provider
                                  AND newer.config_hash = generation.config_hash
                                  AND newer.schema_version = generation.schema_version
                                  AND newer.created_at > generation.created_at)
                AS retain_failure_marker
       FROM search_projection.generations generation
       WHERE provider = $1 AND schema_version = $2
         AND (manifest->>'providerIdentity' = $3
           OR (NOT manifest ? 'providerIdentity' AND config_hash = $4))
         AND ((state = 'failed' AND created_at < now() - interval '1 hour'
               AND manifest <> '{}'::jsonb)
           OR (state = 'draining' AND drained_at < now() - interval '24 hours'))
       ORDER BY COALESCE(drained_at, created_at), id LIMIT 1"#,
  )
  .bind(&config.provider)
  .bind(SCHEMA_FINGERPRINT)
  .bind(provider_identity(config))
  .bind(config_hash(config))
  .bind(EMBEDDED_GENERATION_LOST)
  .fetch_optional(pool)
  .await
  .map_err(|error| SearchError::database("load retired search generation", error))?;
  let Some(row) = row else {
    return Ok(false);
  };
  let retain_failure_marker: bool = row
    .try_get("retain_failure_marker")
    .map_err(|error| SearchError::database("decode retired search generation state", error))?;
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
    sqlx::query("UPDATE search_projection.generations SET manifest = '{}' WHERE id = $1 AND state = 'failed'")
      .bind(generation.id)
      .execute(pool)
      .await
      .map_err(|error| SearchError::database("retire failed search generation assets", error))?;
  } else {
    sqlx::query("DELETE FROM search_projection.generations WHERE id = $1 AND state IN ('failed', 'draining')")
      .bind(generation.id)
      .execute(pool)
      .await
      .map_err(|error| SearchError::database("delete retired search generation", error))?;
  }
  Ok(true)
}

pub async fn fail(pool: &PgPool, generation: &ActiveGeneration, message: &str) -> SearchResult<()> {
  sqlx::query(
    "UPDATE search_projection.generations SET state = 'failed', last_error = $2 WHERE id = $1 AND state IN ('building', 'active')",
  )
  .bind(generation.id)
  .bind(message)
  .execute(pool)
  .await
  .map_err(|error| SearchError::database("fail search generation", error))?;
  Ok(())
}

async fn create_or_reject_failed(
  transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  config: &SearchConfig,
  config_hash: Vec<u8>,
) -> SearchResult<ActiveGeneration> {
  let failure = sqlx::query_scalar::<_, String>(
    r#"SELECT COALESCE(last_error, 'search generation build failed')
       FROM search_projection.generations
       WHERE state = 'failed' AND provider = $1 AND config_hash = $2 AND schema_version = $3
         AND last_error IS DISTINCT FROM $4
       ORDER BY created_at DESC LIMIT 1"#,
  )
  .bind(&config.provider)
  .bind(&config_hash)
  .bind(SCHEMA_FINGERPRINT)
  .bind(EMBEDDED_GENERATION_LOST)
  .fetch_optional(&mut **transaction)
  .await
  .map_err(|error| SearchError::database("load failed search generation", error))?;
  if let Some(failure) = failure {
    return Err(SearchError::IndexFailed(failure));
  }
  create_generation(transaction, config, config_hash).await
}

pub async fn activate(pool: &PgPool, generation: &ActiveGeneration, config: &SearchConfig) -> SearchResult<()> {
  let expected_config_hash = config_hash(config);
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| SearchError::database("begin search generation activation", error))?;
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(LIFECYCLE_LOCK_KEY)
    .execute(&mut *transaction)
    .await
    .map_err(|error| SearchError::database("lock search generation activation", error))?;

  let row = sqlx::query(
    r#"SELECT generation.state, generation.provider, generation.config_hash, generation.schema_version,
              generation.scan_high_water_sid IS NOT NULL
                AND generation.scan_cursor_sid IS NOT NULL
                AND generation.scan_cursor_sid >= generation.scan_high_water_sid AS scan_complete,
              NOT EXISTS (
                SELECT 1
                FROM search_projection.workspace_states state
                WHERE state.generation_id = generation.id
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
                WHERE workspace.sid <= COALESCE(generation.scan_high_water_sid, 0)
                  AND NOT EXISTS (
                    SELECT 1
                    FROM search_projection.workspace_states state
                    WHERE state.generation_id = generation.id AND state.workspace_id = workspace.id
                  )
              ) AS workspaces_seeded,
              NOT EXISTS (
                SELECT 1 FROM search_projection.document_states state
                WHERE state.generation_id = generation.id
                  AND state.last_error IS DISTINCT FROM $3
                  AND NOT EXISTS (
                    SELECT 1 FROM search_projection.workspace_states workspace
                    WHERE workspace.generation_id = state.generation_id
                      AND workspace.workspace_id = state.workspace_id
                      AND workspace.last_error = $2
                  )
                  AND (state.target_source_version <> state.published_source_version
                    OR state.target_source_exists <> state.published_source_exists
                    OR state.target_permission_version <> state.published_permission_version)
              ) AS publications_complete
       FROM search_projection.generations generation
       WHERE generation.id = $1
       FOR UPDATE"#,
  )
  .bind(generation.id)
  .bind(WORKSPACE_RECONCILE_FAILED)
  .bind(DOCUMENT_PROJECTION_FAILED)
  .fetch_optional(&mut *transaction)
  .await
  .map_err(|error| SearchError::database("load search generation activation state", error))?;

  let Some(row) = row else {
    return Err(SearchError::IndexNotReady);
  };
  let state: String = row
    .try_get("state")
    .map_err(|error| SearchError::database("decode search generation activation state", error))?;
  let provider: String = row
    .try_get("provider")
    .map_err(|error| SearchError::database("decode search generation activation provider", error))?;
  let row_config_hash: Vec<u8> = row
    .try_get("config_hash")
    .map_err(|error| SearchError::database("decode search generation activation config hash", error))?;
  let schema_version: i32 = row
    .try_get("schema_version")
    .map_err(|error| SearchError::database("decode search generation activation schema", error))?;
  let scan_complete: bool = row
    .try_get("scan_complete")
    .map_err(|error| SearchError::database("decode search generation scan state", error))?;
  let workspaces_covered: bool = row
    .try_get("workspaces_covered")
    .map_err(|error| SearchError::database("decode search generation workspace coverage", error))?;
  let workspaces_seeded: bool = row
    .try_get("workspaces_seeded")
    .map_err(|error| SearchError::database("decode search generation workspace seed", error))?;
  let publications_complete: bool = row
    .try_get("publications_complete")
    .map_err(|error| SearchError::database("decode search generation publication state", error))?;

  if state != "building"
    || provider != config.provider
    || row_config_hash != expected_config_hash
    || schema_version != SCHEMA_FINGERPRINT
    || !scan_complete
    || !workspaces_covered
    || !workspaces_seeded
    || !publications_complete
  {
    return Err(SearchError::IndexNotReady);
  }

  sqlx::query(
    "UPDATE search_projection.generations SET state = 'draining', drained_at = now() WHERE state = 'active' AND id <> $1",
  )
  .bind(generation.id)
  .execute(&mut *transaction)
  .await
  .map_err(|error| SearchError::database("drain previous search generation", error))?;
  sqlx::query(
    "UPDATE search_projection.generations SET state = 'active', activated_at = coalesce(activated_at, now()) WHERE id = $1 AND state = 'building'",
  )
  .bind(generation.id)
  .execute(&mut *transaction)
  .await
  .map_err(|error| SearchError::database("activate search generation", error))?;
  transaction
    .commit()
    .await
    .map_err(|error| SearchError::database("commit search generation activation", error))
}

pub fn config_hash(config: &SearchConfig) -> Vec<u8> {
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

pub fn provider_identity(config: &SearchConfig) -> String {
  let mut hash = Sha256::new();
  hash.update(config.provider.as_bytes());
  hash.update([0]);
  if config.provider != "embedded" {
    hash.update(config.endpoint.trim_end_matches('/').as_bytes());
  }
  hash.finalize().iter().map(|byte| format!("{byte:02x}")).collect()
}

fn decode(row: sqlx::postgres::PgRow) -> SearchResult<ActiveGeneration> {
  Ok(ActiveGeneration {
    id: row
      .try_get("id")
      .map_err(|error| SearchError::database("decode search generation id", error))?,
    manifest: row
      .try_get("manifest")
      .map_err(|error| SearchError::database("decode search generation manifest", error))?,
  })
}

async fn create_generation(
  transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  config: &SearchConfig,
  config_hash: Vec<u8>,
) -> SearchResult<ActiveGeneration> {
  let generation_id = Uuid::new_v4();
  let suffix = generation_id.simple().to_string();
  let provider_identity = provider_identity(config);
  let base_manifest = if config.provider == "embedded" {
    json!({"doc": "doc", "block": "block", "providerIdentity": provider_identity})
  } else {
    json!({
      "doc": format!("affine_search_doc_{suffix}"),
      "block": format!("affine_search_block_{suffix}"),
      "providerIdentity": provider_identity
    })
  };
  let manifest: Value = sqlx::query_scalar(
    r#"INSERT INTO search_projection.generations
       (id, provider, state, config_hash, schema_version, manifest)
       VALUES ($1, $2, 'building', $3, $4, $5)
       RETURNING manifest"#,
  )
  .bind(generation_id)
  .bind(&config.provider)
  .bind(&config_hash)
  .bind(SCHEMA_FINGERPRINT)
  .bind(&base_manifest)
  .fetch_one(&mut **transaction)
  .await
  .map_err(|error| SearchError::database("create search generation", error))?;
  Ok(ActiveGeneration {
    id: generation_id,
    manifest,
  })
}
