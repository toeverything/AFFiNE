use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use super::{RuntimeError, RuntimeResult, envelope_key, require_text, token_hash};
use crate::llm::{
  ByokLocalLeaseOutput, ByokProfileDefinition, CreateByokLocalLeaseInput,
  byok::{ByokPolicy, SensitiveCredential, local_aad},
  validate_definition,
};

const LOCAL_LEASE_PURPOSE: &str = "copilot_byok_local_lease";
const LOCAL_LEASE_ACTIVE_PURPOSE: &str = "copilot_byok_local_lease:active";
const LOCAL_LEASE_TTL_MS: i64 = 10 * 60 * 1000;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LocalLeasePayload {
  pub(crate) workspace_id: String,
  pub(crate) user_id: String,
  pub(crate) providers: Vec<LocalLeaseProvider>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LocalLeaseProvider {
  pub(crate) provider: String,
  pub(crate) name: String,
  pub(crate) description: Option<String>,
  pub(crate) encrypted_credential: String,
  pub(crate) definition: ByokProfileDefinition,
  pub(crate) enabled: bool,
}

pub(in super::super) async fn create(
  pool: &PgPool,
  root_secret: &[u8],
  policy: &ByokPolicy,
  input: CreateByokLocalLeaseInput,
) -> RuntimeResult<ByokLocalLeaseOutput> {
  require_text(&input.workspace_id, "workspaceId")?;
  require_text(&input.user_id, "userId")?;
  if input.providers.is_empty() {
    return Err(RuntimeError::invalid_input("providers is required"));
  }
  let lease_id = Uuid::new_v4().to_string();
  let key = envelope_key(root_secret)?;
  let mut fingerprint =
    Hmac::<Sha256>::new_from_slice(root_secret).map_err(|_| RuntimeError::invalid_state("credential_unavailable"))?;
  fingerprint.update(input.workspace_id.as_bytes());
  fingerprint.update(&[0]);
  fingerprint.update(input.user_id.as_bytes());

  let mut providers = Vec::with_capacity(input.providers.len());
  for (index, provider) in input.providers.into_iter().enumerate() {
    require_text(&provider.name, "name")?;
    require_text(&provider.credential, "credential")?;
    let definition = validate_definition(&provider.provider, provider.definition)
      .map_err(|error| RuntimeError::invalid_input(error.to_string()))?;
    policy.admit(&provider.provider, &definition.endpoint).await?;
    fingerprint.update(&[0]);
    fingerprint.update(provider.provider.as_bytes());
    fingerprint.update(&[0]);
    fingerprint.update(provider.credential.as_bytes());
    fingerprint.update(&[0]);
    fingerprint.update(
      &serde_json::to_vec(&definition)
        .map_err(|error| RuntimeError::json("serialize BYOK local definition failed", error))?,
    );
    let encrypted_credential = key
      .encrypt(
        &SensitiveCredential::new(provider.credential.into_bytes()),
        &local_aad(
          &input.workspace_id,
          &input.user_id,
          &lease_id,
          index,
          &provider.provider,
          definition.endpoint_identity(),
        ),
      )
      .map_err(|_| RuntimeError::invalid_state("credential_unavailable"))?;
    providers.push(LocalLeaseProvider {
      provider: provider.provider,
      name: provider.name,
      description: provider.description,
      encrypted_credential,
      definition,
      enabled: provider.enabled,
    });
  }

  let active_key = hex::encode(fingerprint.finalize().into_bytes());
  let payload = serde_json::to_value(LocalLeasePayload {
    workspace_id: input.workspace_id,
    user_id: input.user_id,
    providers,
  })
  .map_err(|error| RuntimeError::json("serialize BYOK local lease failed", error))?;
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("create BYOK local lease transaction failed", error))?;
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(&active_key)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("lock BYOK local lease failed", error))?;
  if let Some(row) = sqlx::query(
    r#"
    SELECT payload->>'leaseId' AS lease_id
    FROM runtime_states
    WHERE purpose = $1 AND token_hash = $2
      AND consumed_at IS NULL AND expires_at > clock_timestamp()
    FOR UPDATE
    "#,
  )
  .bind(LOCAL_LEASE_ACTIVE_PURPOSE)
  .bind(token_hash(&active_key))
  .fetch_optional(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("read active BYOK local lease failed", error))?
  {
    let existing_lease_id: String = row.get("lease_id");
    if let Some(expires_at_ms) = sqlx::query_scalar::<_, i64>(
      r#"
      SELECT (EXTRACT(EPOCH FROM expires_at) * 1000)::BIGINT
      FROM runtime_states
      WHERE purpose = $1 AND token_hash = $2
        AND consumed_at IS NULL AND expires_at > clock_timestamp()
      FOR UPDATE
      "#,
    )
    .bind(LOCAL_LEASE_PURPOSE)
    .bind(token_hash(&existing_lease_id))
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("read active BYOK local lease payload failed", error))?
    {
      tx.commit()
        .await
        .map_err(|error| RuntimeError::database("reuse BYOK local lease commit failed", error))?;
      return Ok(ByokLocalLeaseOutput {
        lease_id: existing_lease_id,
        expires_at_ms,
      });
    }
  }
  sqlx::query("DELETE FROM runtime_states WHERE purpose = $1 AND token_hash = $2")
    .bind(LOCAL_LEASE_ACTIVE_PURPOSE)
    .bind(token_hash(&active_key))
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("delete stale BYOK local lease active record failed", error))?;
  let expires_at_ms = sqlx::query_scalar::<_, i64>(
    r#"
    INSERT INTO runtime_states (purpose, token_hash, lookup_key, payload, expires_at)
    VALUES ($1, $2, $3, $4, clock_timestamp() + ($5 * INTERVAL '1 millisecond'))
    RETURNING (EXTRACT(EPOCH FROM expires_at) * 1000)::BIGINT
    "#,
  )
  .bind(LOCAL_LEASE_PURPOSE)
  .bind(token_hash(&lease_id))
  .bind(&active_key)
  .bind(payload)
  .bind(LOCAL_LEASE_TTL_MS as f64)
  .fetch_one(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("create BYOK local lease failed", error))?;
  sqlx::query(
    r#"
    INSERT INTO runtime_states (purpose, token_hash, lookup_key, payload, expires_at)
    VALUES ($1, $2, $3, jsonb_build_object('leaseId', $4::text), clock_timestamp() + ($5 * INTERVAL '1 millisecond'))
    "#,
  )
  .bind(LOCAL_LEASE_ACTIVE_PURPOSE)
  .bind(token_hash(&active_key))
  .bind(&active_key)
  .bind(&lease_id)
  .bind(LOCAL_LEASE_TTL_MS as f64)
  .execute(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("create BYOK local lease active record failed", error))?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("create BYOK local lease commit failed", error))?;
  Ok(ByokLocalLeaseOutput {
    lease_id,
    expires_at_ms,
  })
}
