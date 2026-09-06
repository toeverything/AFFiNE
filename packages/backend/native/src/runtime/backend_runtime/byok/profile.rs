use std::collections::{HashMap, HashSet};

use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::{RuntimeError, RuntimeResult};
use crate::llm::{
  ByokProfileDefinition, ByokProfileOutput, ByokValidationOutput, CreateByokProfileInput, ProbeByokDraftInput,
  ProbeByokProfileInput, ReorderByokProfilesInput, ReplaceByokProfileInput, RotateByokCredentialInput,
  byok::{ByokPolicy, CredentialEnvelopeKey, SensitiveCredential, reconcile_validation, server_aad},
  validate_definition,
};

#[derive(FromRow)]
struct ProfileRow {
  id: String,
  workspace_id: String,
  provider: String,
  name: String,
  description: Option<String>,
  encrypted_api_key: String,
  definition: serde_json::Value,
  sort_order: i32,
  enabled: bool,
  revision: i32,
  credential_generation: i32,
  validation: Option<serde_json::Value>,
}

#[derive(FromRow)]
struct ProfileAdmissionRow {
  provider: String,
  revision: i32,
}

pub(in super::super) async fn list(pool: &PgPool, workspace_id: &str) -> RuntimeResult<Vec<ByokProfileOutput>> {
  let rows = sqlx::query_as::<_, ProfileRow>(
    r#"
    SELECT id, workspace_id, provider, name, description, encrypted_api_key,
           definition, sort_order, enabled, revision, credential_generation, validation
    FROM ai_workspace_byok_configs
    WHERE workspace_id = $1
    ORDER BY sort_order ASC, created_at ASC
    "#,
  )
  .bind(workspace_id)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("list BYOK profiles failed", error))?;
  rows.into_iter().map(profile_output).collect()
}

pub(in super::super) async fn create(
  pool: &PgPool,
  root_secret: &[u8],
  policy: &ByokPolicy,
  input: CreateByokProfileInput,
) -> RuntimeResult<ByokProfileOutput> {
  require_text(&input.workspace_id, "workspaceId")?;
  require_text(&input.name, "name")?;
  require_text(&input.credential, "credential")?;
  require_text(&input.actor_user_id, "actorUserId")?;
  let definition = validate_definition(&input.provider, input.definition)
    .map_err(|error| RuntimeError::invalid_input(error.to_string()))?;
  policy.admit(&input.provider, &definition.endpoint).await?;
  let key = envelope_key(root_secret)?;
  let profile_id = Uuid::new_v4().to_string();
  let aad = server_aad(
    &input.workspace_id,
    &profile_id,
    &input.provider,
    definition.endpoint_identity(),
  );
  let encrypted = key
    .encrypt(&SensitiveCredential::new(input.credential.into_bytes()), &aad)
    .map_err(|_| RuntimeError::invalid_state("credential_unavailable"))?;
  let definition_json =
    serde_json::to_value(&definition).map_err(|error| RuntimeError::json("serialize BYOK definition failed", error))?;

  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("create BYOK profile transaction failed", error))?;
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(&input.workspace_id)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("lock BYOK profile order failed", error))?;
  let sort_order = sqlx::query_scalar::<_, i32>(
    "SELECT COALESCE(MAX(sort_order) + 1, 0)::int FROM ai_workspace_byok_configs WHERE workspace_id = $1",
  )
  .bind(&input.workspace_id)
  .fetch_one(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("resolve BYOK profile order failed", error))?;
  let row = sqlx::query_as::<_, ProfileRow>(
    r#"
    INSERT INTO ai_workspace_byok_configs (
      id, workspace_id, provider, name, description, encrypted_api_key,
      definition, sort_order, enabled, created_by, updated_by, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (workspace_id, provider, name) DO NOTHING
    RETURNING id, workspace_id, provider, name, description, encrypted_api_key,
              definition, sort_order, enabled, revision, credential_generation, validation
    "#,
  )
  .bind(&profile_id)
  .bind(&input.workspace_id)
  .bind(&input.provider)
  .bind(&input.name)
  .bind(&input.description)
  .bind(encrypted)
  .bind(definition_json)
  .bind(sort_order)
  .bind(input.enabled)
  .bind(&input.actor_user_id)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("create BYOK profile failed", error))?
  .ok_or_else(|| RuntimeError::invalid_input("BYOK profile name already exists"))?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("create BYOK profile commit failed", error))?;
  profile_output(row)
}

pub(in super::super) async fn replace(
  pool: &PgPool,
  root_secret: &[u8],
  policy: &ByokPolicy,
  input: ReplaceByokProfileInput,
) -> RuntimeResult<ByokProfileOutput> {
  require_text(&input.workspace_id, "workspaceId")?;
  require_text(&input.name, "name")?;
  require_text(&input.actor_user_id, "actorUserId")?;
  if let Some(credential) = input.credential.as_deref() {
    require_text(credential, "credential")?;
  }
  if input.expected_revision < 1 {
    return Err(RuntimeError::invalid_input("expectedRevision is required"));
  }
  let admission = select_profile_for_admission(pool, &input.workspace_id, &input.profile_id).await?;
  if admission.revision != input.expected_revision {
    return Err(RuntimeError::invalid_input("byok_revision_conflict"));
  }
  let definition = validate_definition(&admission.provider, input.definition)
    .map_err(|error| RuntimeError::invalid_input(error.to_string()))?;
  policy.admit(&admission.provider, &definition.endpoint).await?;

  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("replace BYOK profile transaction failed", error))?;
  let old = select_profile_for_update(&mut tx, &input.workspace_id, &input.profile_id).await?;
  if old.revision != input.expected_revision {
    return Err(RuntimeError::invalid_input("byok_revision_conflict"));
  }
  let old_definition = parse_definition(old.definition.clone())?;
  let key = envelope_key(root_secret)?;
  let credential_changed = input.credential.is_some();
  let credential = if let Some(credential) = input.credential {
    SensitiveCredential::new(credential.into_bytes())
  } else {
    key
      .decrypt(
        &old.encrypted_api_key,
        &server_aad(
          &old.workspace_id,
          &old.id,
          &old.provider,
          old_definition.endpoint_identity(),
        ),
      )
      .map_err(|_| RuntimeError::invalid_state("credential_unavailable"))?
  };
  let encrypted = key
    .encrypt(
      &credential,
      &server_aad(
        &old.workspace_id,
        &old.id,
        &old.provider,
        definition.endpoint_identity(),
      ),
    )
    .map_err(|_| RuntimeError::invalid_state("credential_unavailable"))?;
  let definition_json =
    serde_json::to_value(&definition).map_err(|error| RuntimeError::json("serialize BYOK definition failed", error))?;
  let credential_generation = old.credential_generation + i32::from(credential_changed);
  let validation = reconcile_validation(
    parse_validation(old.validation)?,
    &old_definition,
    &definition,
    credential_generation,
    credential_changed,
  )
  .map(serde_json::to_value)
  .transpose()
  .map_err(|error| RuntimeError::json("serialize BYOK validation failed", error))?;
  let row = sqlx::query_as::<_, ProfileRow>(
    r#"
    UPDATE ai_workspace_byok_configs
    SET name = $3, description = $4, definition = $5, encrypted_api_key = $6,
        enabled = $7, credential_generation = $8, validation = $9,
        revision = revision + 1, updated_by = $10, updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = $1 AND id = $2 AND revision = $11
    RETURNING id, workspace_id, provider, name, description, encrypted_api_key,
              definition, sort_order, enabled, revision, credential_generation, validation
    "#,
  )
  .bind(&input.workspace_id)
  .bind(&input.profile_id)
  .bind(&input.name)
  .bind(&input.description)
  .bind(definition_json)
  .bind(encrypted)
  .bind(input.enabled)
  .bind(credential_generation)
  .bind(validation)
  .bind(&input.actor_user_id)
  .bind(input.expected_revision)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("replace BYOK profile failed", error))?
  .ok_or_else(|| RuntimeError::invalid_input("byok_revision_conflict"))?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("replace BYOK profile commit failed", error))?;
  profile_output(row)
}

async fn select_profile_for_admission(
  pool: &PgPool,
  workspace_id: &str,
  profile_id: &str,
) -> RuntimeResult<ProfileAdmissionRow> {
  sqlx::query_as::<_, ProfileAdmissionRow>(
    "SELECT provider, revision FROM ai_workspace_byok_configs WHERE workspace_id = $1 AND id = $2",
  )
  .bind(workspace_id)
  .bind(profile_id)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("load BYOK profile admission data failed", error))?
  .ok_or_else(|| RuntimeError::invalid_input("BYOK profile not found"))
}

pub(in super::super) async fn rotate(
  pool: &PgPool,
  root_secret: &[u8],
  input: RotateByokCredentialInput,
) -> RuntimeResult<ByokProfileOutput> {
  require_text(&input.credential, "credential")?;
  require_text(&input.actor_user_id, "actorUserId")?;
  if input.expected_revision < 1 {
    return Err(RuntimeError::invalid_input("expectedRevision is required"));
  }
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("rotate BYOK credential transaction failed", error))?;
  let profile = select_profile_for_update(&mut tx, &input.workspace_id, &input.profile_id).await?;
  if profile.revision != input.expected_revision {
    return Err(RuntimeError::invalid_input("byok_revision_conflict"));
  }
  let definition = parse_definition(profile.definition.clone())?;
  let encrypted = envelope_key(root_secret)?
    .encrypt(
      &SensitiveCredential::new(input.credential.into_bytes()),
      &server_aad(
        &profile.workspace_id,
        &profile.id,
        &profile.provider,
        definition.endpoint_identity(),
      ),
    )
    .map_err(|_| RuntimeError::invalid_state("credential_unavailable"))?;
  let row = sqlx::query_as::<_, ProfileRow>(
    r#"
    UPDATE ai_workspace_byok_configs
    SET encrypted_api_key = $3, credential_generation = credential_generation + 1,
        validation = NULL, revision = revision + 1, updated_by = $4,
        updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = $1 AND id = $2 AND revision = $5
    RETURNING id, workspace_id, provider, name, description, encrypted_api_key,
              definition, sort_order, enabled, revision, credential_generation, validation
    "#,
  )
  .bind(&input.workspace_id)
  .bind(&input.profile_id)
  .bind(encrypted)
  .bind(&input.actor_user_id)
  .bind(input.expected_revision)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("rotate BYOK credential failed", error))?
  .ok_or_else(|| RuntimeError::invalid_input("byok_revision_conflict"))?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("rotate BYOK credential commit failed", error))?;
  profile_output(row)
}

pub(in super::super) async fn delete(pool: &PgPool, workspace_id: &str, profile_id: &str) -> RuntimeResult<bool> {
  let affected = sqlx::query("DELETE FROM ai_workspace_byok_configs WHERE workspace_id = $1 AND id = $2")
    .bind(workspace_id)
    .bind(profile_id)
    .execute(pool)
    .await
    .map_err(|error| RuntimeError::database("delete BYOK profile failed", error))?
    .rows_affected();
  Ok(affected == 1)
}

pub(in super::super) async fn reorder(
  pool: &PgPool,
  input: ReorderByokProfilesInput,
) -> RuntimeResult<Vec<ByokProfileOutput>> {
  require_text(&input.workspace_id, "workspaceId")?;
  require_text(&input.actor_user_id, "actorUserId")?;
  let unique = input
    .profiles
    .iter()
    .map(|profile| profile.profile_id.as_str())
    .collect::<HashSet<_>>();
  if unique.len() != input.profiles.len() {
    return Err(RuntimeError::invalid_input("duplicate BYOK profile id"));
  }
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("reorder BYOK profiles transaction failed", error))?;
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(&input.workspace_id)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("lock BYOK profile order failed", error))?;
  let current = sqlx::query_as::<_, (String, i32)>(
    "SELECT id, revision FROM ai_workspace_byok_configs WHERE workspace_id = $1 ORDER BY sort_order, created_at",
  )
  .bind(&input.workspace_id)
  .fetch_all(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("read BYOK profile order failed", error))?;
  let current_set = current
    .iter()
    .map(|(profile_id, _)| profile_id.as_str())
    .collect::<HashSet<_>>();
  if current_set != unique {
    return Err(RuntimeError::invalid_input(
      "BYOK profile order must contain every server profile",
    ));
  }
  let revisions = current.into_iter().collect::<HashMap<_, _>>();
  if input
    .profiles
    .iter()
    .any(|profile| revisions.get(&profile.profile_id).copied() != Some(profile.expected_revision))
  {
    return Err(RuntimeError::invalid_input("byok_revision_conflict"));
  }
  for (sort_order, profile) in input.profiles.iter().enumerate() {
    let updated = sqlx::query(
      "UPDATE ai_workspace_byok_configs SET sort_order = $3, revision = revision + 1, updated_by = $4, updated_at = \
       CURRENT_TIMESTAMP WHERE workspace_id = $1 AND id = $2 AND revision = $5",
    )
    .bind(&input.workspace_id)
    .bind(&profile.profile_id)
    .bind(sort_order as i32)
    .bind(&input.actor_user_id)
    .bind(profile.expected_revision)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("update BYOK profile order failed", error))?
    .rows_affected();
    if updated != 1 {
      return Err(RuntimeError::invalid_input("byok_revision_conflict"));
    }
  }
  let rows = sqlx::query_as::<_, ProfileRow>(
    r#"
    SELECT id, workspace_id, provider, name, description, encrypted_api_key,
           definition, sort_order, enabled, revision, credential_generation, validation
    FROM ai_workspace_byok_configs
    WHERE workspace_id = $1
    ORDER BY sort_order, created_at
    "#,
  )
  .bind(&input.workspace_id)
  .fetch_all(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("read reordered BYOK profiles failed", error))?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("reorder BYOK profiles commit failed", error))?;
  rows.into_iter().map(profile_output).collect()
}

pub(in super::super) async fn probe_profile(
  pool: &PgPool,
  root_secret: &[u8],
  policy: &ByokPolicy,
  input: ProbeByokProfileInput,
) -> RuntimeResult<crate::llm::ByokProbeResultOutput> {
  let profile = sqlx::query_as::<_, ProfileRow>(
    r#"
    SELECT id, workspace_id, provider, name, description, encrypted_api_key,
           definition, sort_order, enabled, revision, credential_generation, validation
    FROM ai_workspace_byok_configs
    WHERE workspace_id = $1 AND id = $2
    "#,
  )
  .bind(&input.workspace_id)
  .bind(&input.profile_id)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("read BYOK profile for probe failed", error))?
  .ok_or_else(|| RuntimeError::invalid_input("BYOK profile not found"))?;
  let definition = parse_definition(profile.definition.clone())?;
  policy.admit(&profile.provider, &definition.endpoint).await?;
  let credential = envelope_key(root_secret)?
    .decrypt(
      &profile.encrypted_api_key,
      &server_aad(
        &profile.workspace_id,
        &profile.id,
        &profile.provider,
        definition.endpoint_identity(),
      ),
    )
    .map_err(|_| RuntimeError::invalid_state("credential_unavailable"))?;
  let mut result =
    super::probe::execute_probe(&profile.provider, &definition, credential, policy, input.checks).await?;
  let validation = ByokValidationOutput {
    definition_fingerprint: result.definition_fingerprint.clone(),
    credential_generation: profile.credential_generation,
    connection: result.connection.clone(),
    models: result.models.clone(),
  };
  let validation =
    serde_json::to_value(validation).map_err(|error| RuntimeError::json("serialize BYOK validation failed", error))?;
  let updated = sqlx::query(
    "UPDATE ai_workspace_byok_configs SET validation = $3 WHERE workspace_id = $1 AND id = $2 AND revision = $4 AND \
     credential_generation = $5",
  )
  .bind(&input.workspace_id)
  .bind(&input.profile_id)
  .bind(validation)
  .bind(profile.revision)
  .bind(profile.credential_generation)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("record BYOK profile probe failed", error))?
  .rows_affected();
  result.stale = updated != 1;
  Ok(result)
}

pub(in super::super) async fn probe_draft(
  pool: &PgPool,
  root_secret: &[u8],
  policy: &ByokPolicy,
  input: ProbeByokDraftInput,
) -> RuntimeResult<crate::llm::ByokProbeResultOutput> {
  let definition = validate_definition(&input.provider, input.definition)
    .map_err(|error| RuntimeError::invalid_input(error.to_string()))?;
  policy.admit(&input.provider, &definition.endpoint).await?;
  let credential = match (input.credential, input.profile_id, input.expected_revision) {
    (Some(credential), None, None) => {
      require_text(&credential, "credential")?;
      SensitiveCredential::new(credential.into_bytes())
    }
    (None, Some(profile_id), Some(expected_revision)) => {
      let profile = sqlx::query_as::<_, ProfileRow>(
        r#"
        SELECT id, workspace_id, provider, name, description, encrypted_api_key,
               definition, sort_order, enabled, revision, credential_generation, validation
        FROM ai_workspace_byok_configs
        WHERE workspace_id = $1 AND id = $2
        "#,
      )
      .bind(&input.workspace_id)
      .bind(&profile_id)
      .fetch_optional(pool)
      .await
      .map_err(|error| RuntimeError::database("read BYOK profile for draft probe failed", error))?
      .ok_or_else(|| RuntimeError::invalid_input("BYOK profile not found"))?;
      if profile.provider != input.provider || profile.revision != expected_revision {
        return Err(RuntimeError::invalid_input("byok_revision_conflict"));
      }
      let stored_definition = parse_definition(profile.definition)?;
      envelope_key(root_secret)?
        .decrypt(
          &profile.encrypted_api_key,
          &server_aad(
            &profile.workspace_id,
            &profile.id,
            &profile.provider,
            stored_definition.endpoint_identity(),
          ),
        )
        .map_err(|_| RuntimeError::invalid_state("credential_unavailable"))?
    }
    _ => {
      return Err(RuntimeError::invalid_input(
        "draft probe requires either credential or stored profile revision",
      ));
    }
  };
  super::probe::execute_probe(&input.provider, &definition, credential, policy, input.checks).await
}

async fn select_profile_for_update(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  workspace_id: &str,
  profile_id: &str,
) -> RuntimeResult<ProfileRow> {
  sqlx::query_as::<_, ProfileRow>(
    r#"
    SELECT id, workspace_id, provider, name, description, encrypted_api_key,
           definition, sort_order, enabled, revision, credential_generation, validation
    FROM ai_workspace_byok_configs
    WHERE workspace_id = $1 AND id = $2
    FOR UPDATE
    "#,
  )
  .bind(workspace_id)
  .bind(profile_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("read BYOK profile failed", error))?
  .ok_or_else(|| RuntimeError::invalid_input("BYOK profile not found"))
}

pub(super) fn envelope_key(root_secret: &[u8]) -> RuntimeResult<CredentialEnvelopeKey> {
  CredentialEnvelopeKey::derive(root_secret)
    .map_err(|_| RuntimeError::invalid_state("stable crypto.privateKey is required for persistent BYOK"))
}

fn parse_definition(value: serde_json::Value) -> RuntimeResult<ByokProfileDefinition> {
  serde_json::from_value(value).map_err(|error| RuntimeError::json("invalid stored BYOK definition", error))
}

fn profile_output(row: ProfileRow) -> RuntimeResult<ByokProfileOutput> {
  let definition = parse_definition(row.definition)?;
  let validation = parse_validation(row.validation)?;
  Ok(ByokProfileOutput {
    profile_id: row.id,
    workspace_id: row.workspace_id,
    provider: row.provider,
    name: row.name,
    description: row.description,
    definition: definition.into(),
    enabled: row.enabled,
    sort_order: row.sort_order,
    revision: row.revision,
    validation,
  })
}

fn parse_validation(value: Option<serde_json::Value>) -> RuntimeResult<Option<ByokValidationOutput>> {
  value
    .map(|value| {
      serde_json::from_value(value).map_err(|error| RuntimeError::json("invalid stored BYOK validation", error))
    })
    .transpose()
}

pub(super) fn require_text(value: &str, field: &'static str) -> RuntimeResult<()> {
  if value.trim().is_empty() {
    Err(RuntimeError::invalid_input(format!("{field} is required")))
  } else {
    Ok(())
  }
}
