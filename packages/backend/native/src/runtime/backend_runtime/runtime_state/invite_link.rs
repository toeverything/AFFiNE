use super::{
  Result, RuntimeError, RuntimeWorkspaceInviteLinkRecord, WORKSPACE_INVITE_LINK_ID_PURPOSE,
  WORKSPACE_INVITE_LINK_WORKSPACE_PURPOSE,
  dto::{RuntimeStateInsertPayload, RuntimeStatePayloadRow, RuntimeStateRows},
};

pub(super) async fn get_by_workspace(
  rows: &RuntimeStateRows,
  workspace_id: String,
) -> Result<Option<RuntimeWorkspaceInviteLinkRecord>> {
  get_by_key(rows, WORKSPACE_INVITE_LINK_WORKSPACE_PURPOSE, &workspace_id).await
}

pub(super) async fn get_by_invite_id(
  rows: &RuntimeStateRows,
  invite_id: String,
) -> Result<Option<RuntimeWorkspaceInviteLinkRecord>> {
  get_by_key(rows, WORKSPACE_INVITE_LINK_ID_PURPOSE, &invite_id).await
}

pub(super) async fn create(
  rows: &RuntimeStateRows,
  workspace_id: String,
  invite_id: String,
  inviter_user_id: String,
  ttl_ms: i64,
) -> Result<RuntimeWorkspaceInviteLinkRecord> {
  if ttl_ms <= 0 {
    return Err(RuntimeError::invalid_input(
      "workspace invite link ttl must be positive",
    ));
  }

  let mut tx = rows.begin("RuntimeState workspace invite link").await?;
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(&workspace_id)
    .execute(&mut *tx)
    .await
    .map_err(|err| RuntimeError::database("RuntimeState workspace invite link active lock failed", err))?;

  if let Some(existing) =
    get_by_key_in_tx(rows, &mut tx, WORKSPACE_INVITE_LINK_WORKSPACE_PURPOSE, &workspace_id).await?
  {
    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("RuntimeState workspace invite link transaction commit failed", err))?;
    return Ok(existing);
  }

  let payload = serde_json::json!({
    "workspaceId": workspace_id,
    "inviteId": invite_id,
    "inviterUserId": inviter_user_id,
  });

  let Some(expires_at_ms) = rows
    .upsert_expired_or_consumed_payload_returning_expires_in_tx(
      &mut tx,
      RuntimeStateInsertPayload {
        purpose: WORKSPACE_INVITE_LINK_WORKSPACE_PURPOSE,
        token: &workspace_id,
        lookup_key: &workspace_id,
        payload: &payload,
        ttl_ms,
        context: "RuntimeState workspace invite link create",
      },
    )
    .await?
  else {
    let existing = get_by_key_in_tx(rows, &mut tx, WORKSPACE_INVITE_LINK_WORKSPACE_PURPOSE, &workspace_id).await?;
    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("RuntimeState workspace invite link transaction commit failed", err))?;
    return existing
      .ok_or_else(|| RuntimeError::invalid_state("RuntimeState workspace invite link active conflict missing row"));
  };
  rows
    .insert_payload_returning_expires_in_tx(
      &mut tx,
      RuntimeStateInsertPayload {
        purpose: WORKSPACE_INVITE_LINK_ID_PURPOSE,
        token: &invite_id,
        lookup_key: &invite_id,
        payload: &payload,
        ttl_ms,
        context: "RuntimeState workspace invite link create",
      },
    )
    .await?;

  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("RuntimeState workspace invite link transaction commit failed", err))?;

  Ok(RuntimeWorkspaceInviteLinkRecord {
    workspace_id,
    invite_id,
    inviter_user_id,
    expires_at_ms,
  })
}

pub(super) async fn revoke(rows: &RuntimeStateRows, workspace_id: String) -> Result<bool> {
  let mut tx = rows.begin("RuntimeState workspace invite link").await?;
  let existing = get_by_key_in_tx(rows, &mut tx, WORKSPACE_INVITE_LINK_WORKSPACE_PURPOSE, &workspace_id).await?;
  let Some(existing) = existing else {
    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("RuntimeState workspace invite link transaction commit failed", err))?;
    return Ok(false);
  };

  rows
    .delete_by_key_in_tx(
      &mut tx,
      WORKSPACE_INVITE_LINK_WORKSPACE_PURPOSE,
      &workspace_id,
      "RuntimeState workspace invite link revoke",
    )
    .await?;
  rows
    .delete_by_key_in_tx(
      &mut tx,
      WORKSPACE_INVITE_LINK_ID_PURPOSE,
      &existing.invite_id,
      "RuntimeState workspace invite link revoke",
    )
    .await?;

  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("RuntimeState workspace invite link transaction commit failed", err))?;

  Ok(true)
}

async fn get_by_key(
  rows: &RuntimeStateRows,
  purpose: &str,
  key: &str,
) -> Result<Option<RuntimeWorkspaceInviteLinkRecord>> {
  rows
    .active_payload_with_expires(purpose, key, "RuntimeState workspace invite link get")
    .await?
    .map(record_from_row)
    .transpose()
}

async fn get_by_key_in_tx(
  rows: &RuntimeStateRows,
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  purpose: &str,
  key: &str,
) -> Result<Option<RuntimeWorkspaceInviteLinkRecord>> {
  rows
    .active_payload_with_expires_for_update_in_tx(tx, purpose, key, "RuntimeState workspace invite link get")
    .await?
    .map(record_from_row)
    .transpose()
}

fn record_from_row(row: RuntimeStatePayloadRow) -> Result<RuntimeWorkspaceInviteLinkRecord> {
  Ok(RuntimeWorkspaceInviteLinkRecord {
    workspace_id: row
      .payload
      .get("workspaceId")
      .and_then(serde_json::Value::as_str)
      .ok_or_else(|| RuntimeError::invalid_state("RuntimeState workspace invite link payload missing workspaceId"))?
      .to_string(),
    invite_id: row
      .payload
      .get("inviteId")
      .and_then(serde_json::Value::as_str)
      .ok_or_else(|| RuntimeError::invalid_state("RuntimeState workspace invite link payload missing inviteId"))?
      .to_string(),
    inviter_user_id: row
      .payload
      .get("inviterUserId")
      .and_then(serde_json::Value::as_str)
      .ok_or_else(|| RuntimeError::invalid_state("RuntimeState workspace invite link payload missing inviterUserId"))?
      .to_string(),
    expires_at_ms: row.expires_at_ms,
  })
}
