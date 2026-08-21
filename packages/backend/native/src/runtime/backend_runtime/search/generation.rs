use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use super::{SCHEMA_FINGERPRINT, provider::RemoteProvider, types::SearchTable};
use crate::runtime::{RuntimeError, RuntimeResult, SearchRuntimeConfig};

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

pub(super) async fn prepare(
  pool: &PgPool,
  config: &SearchRuntimeConfig,
  remote: Option<&RemoteProvider>,
) -> RuntimeResult<ActiveGeneration> {
  let fingerprint = config_fingerprint(config);
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin search generation", error))?;
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('search-runtime-generation', 0))")
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("lock search generation", error))?;
  let existing = sqlx::query(
    r#"SELECT generation_id,provider,manifest FROM search_runtime_generations
       WHERE state IN ('active','pending') AND provider=$1 AND config_fingerprint=$2 AND schema_fingerprint=$3
       ORDER BY (state='active') DESC LIMIT 1"#,
  )
  .bind(&config.provider)
  .bind(&fingerprint)
  .bind(SCHEMA_FINGERPRINT)
  .fetch_optional(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("load search generation", error))?;
  let generation = if let Some(row) = existing {
    decode(row)?
  } else {
    let pending: bool =
      sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM search_runtime_generations WHERE state='pending')")
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| RuntimeError::database("check pending search generation", error))?;
    if pending {
      return Err(RuntimeError::invalid_state("search_generation_change_in_progress"));
    }
    let generation_id = Uuid::new_v4();
    let suffix = generation_id.simple().to_string();
    let manifest = if config.provider == "embedded" {
      json!({"doc":"doc","block":"block"})
    } else {
      json!({
        "doc":format!("affine_search_doc_{suffix}"),
        "block":format!("affine_search_block_{suffix}"),
      })
    };
    sqlx::query(
      r#"INSERT INTO search_runtime_generations
         (generation_id,provider,state,config_fingerprint,schema_fingerprint,manifest)
         VALUES ($1,$2,'pending',$3,$4,$5)"#,
    )
    .bind(generation_id)
    .bind(&config.provider)
    .bind(&fingerprint)
    .bind(SCHEMA_FINGERPRINT)
    .bind(&manifest)
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("create pending search generation", error))?;
    for table in [SearchTable::Doc, SearchTable::Block] {
      sqlx::query("INSERT INTO search_runtime_provider_cursors(generation_id,table_key) VALUES ($1,$2)")
        .bind(generation_id)
        .bind(table.as_str())
        .execute(&mut *transaction)
        .await
        .map_err(|error| RuntimeError::database("initialize search generation cursor", error))?;
    }
    ActiveGeneration {
      id: generation_id,
      manifest,
    }
  };
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit pending search generation", error))?;

  if let Some(remote) = remote {
    for table in [SearchTable::Doc, SearchTable::Block] {
      if let Err(error) = remote.provision(generation.physical_table(table)?, table).await {
        fail(pool, &generation).await?;
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
  let fingerprint = config_fingerprint(config);
  let row = sqlx::query(
    r#"SELECT generation_id,provider,manifest FROM search_runtime_generations
       WHERE state='active' AND provider=$1 AND config_fingerprint=$2 AND schema_fingerprint=$3
       ORDER BY activated_at DESC NULLS LAST LIMIT 1"#,
  )
  .bind(&config.provider)
  .bind(&fingerprint)
  .bind(SCHEMA_FINGERPRINT)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("load active search generation", error))?;
  row.map(decode).transpose()
}

pub(super) async fn fail(pool: &PgPool, generation: &ActiveGeneration) -> RuntimeResult<()> {
  sqlx::query("UPDATE search_runtime_generations SET state='failed' WHERE generation_id=$1 AND state='pending'")
    .bind(generation.id)
    .execute(pool)
    .await
    .map_err(|error| RuntimeError::database("fail pending search generation", error))?;
  Ok(())
}

pub(super) async fn activate(pool: &PgPool, generation: &ActiveGeneration) -> RuntimeResult<()> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin search generation activation", error))?;
  sqlx::query("UPDATE search_runtime_generations SET state='draining' WHERE state='active' AND generation_id<>$1")
    .bind(generation.id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("drain previous search generation", error))?;
  sqlx::query(
    "UPDATE search_runtime_generations SET state='active', activated_at=coalesce(activated_at,now()) WHERE \
     generation_id=$1 AND state IN ('pending','active')",
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

fn config_fingerprint(config: &SearchRuntimeConfig) -> String {
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
  hash.finalize().iter().map(|byte| format!("{byte:02x}")).collect()
}

fn decode(row: sqlx::postgres::PgRow) -> RuntimeResult<ActiveGeneration> {
  Ok(ActiveGeneration {
    id: row
      .try_get("generation_id")
      .map_err(|error| RuntimeError::database("decode search generation id", error))?,
    manifest: row
      .try_get("manifest")
      .map_err(|error| RuntimeError::database("decode search generation manifest", error))?,
  })
}
