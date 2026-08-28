use super::{
  MAGIC_LINK_OTP_PURPOSE, MAX_MAGIC_LINK_OTP_ATTEMPTS, Result, RuntimeError, RuntimeMagicLinkOtpConsumeResult,
  dto::RuntimeStateRows,
};

impl RuntimeMagicLinkOtpConsumeResult {
  fn ok(token: String) -> Self {
    Self {
      ok: true,
      token: Some(token),
      reason: None,
    }
  }

  fn fail(reason: &'static str) -> Self {
    Self {
      ok: false,
      token: None,
      reason: Some(reason.to_string()),
    }
  }
}

pub(super) async fn upsert(
  rows: &RuntimeStateRows,
  email: String,
  otp_hash: String,
  token: String,
  client_nonce: Option<String>,
  ttl_ms: i64,
) -> Result<()> {
  if ttl_ms <= 0 {
    return Err(RuntimeError::invalid_input("magic link otp ttl must be positive"));
  }

  let payload = serde_json::json!({
    "otpHash": otp_hash,
    "token": token,
    "clientNonce": client_nonce,
  });

  rows
    .upsert_payload_reset_attempts(
      MAGIC_LINK_OTP_PURPOSE,
      &email,
      &email,
      payload,
      ttl_ms,
      "RuntimeState magic link otp upsert",
    )
    .await
}

pub(super) async fn consume(
  rows: &RuntimeStateRows,
  email: String,
  otp_hash: String,
  client_nonce: Option<String>,
) -> Result<RuntimeMagicLinkOtpConsumeResult> {
  let mut tx = rows.begin("RuntimeState magic link otp").await?;

  let row = rows
    .unconsumed_row_for_update_in_tx(
      &mut tx,
      MAGIC_LINK_OTP_PURPOSE,
      &email,
      "RuntimeState magic link otp lookup",
    )
    .await?;

  let Some(row) = row else {
    tx.rollback()
      .await
      .map_err(|err| RuntimeError::database("RuntimeState magic link otp transaction rollback failed", err))?;
    return Ok(RuntimeMagicLinkOtpConsumeResult::fail("not_found"));
  };

  let payload = row.payload;
  let attempts = row.attempts;
  let expires_at = row.expires_at;

  if expires_at <= chrono::Utc::now() {
    rows
      .delete_by_key_in_tx(
        &mut tx,
        MAGIC_LINK_OTP_PURPOSE,
        &email,
        "RuntimeState magic link otp delete",
      )
      .await?;
    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("RuntimeState magic link otp transaction commit failed", err))?;
    return Ok(RuntimeMagicLinkOtpConsumeResult::fail("expired"));
  }

  let stored_client_nonce = payload.get("clientNonce").and_then(serde_json::Value::as_str);
  if stored_client_nonce.is_some() && stored_client_nonce != client_nonce.as_deref() {
    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("RuntimeState magic link otp transaction commit failed", err))?;
    return Ok(RuntimeMagicLinkOtpConsumeResult::fail("nonce_mismatch"));
  }

  if attempts >= MAX_MAGIC_LINK_OTP_ATTEMPTS {
    rows
      .delete_by_key_in_tx(
        &mut tx,
        MAGIC_LINK_OTP_PURPOSE,
        &email,
        "RuntimeState magic link otp delete",
      )
      .await?;
    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("RuntimeState magic link otp transaction commit failed", err))?;
    return Ok(RuntimeMagicLinkOtpConsumeResult::fail("locked"));
  }

  let stored_otp_hash = payload.get("otpHash").and_then(serde_json::Value::as_str);
  if stored_otp_hash != Some(otp_hash.as_str()) {
    let attempts = attempts + 1;
    if attempts >= MAX_MAGIC_LINK_OTP_ATTEMPTS {
      rows
        .delete_by_key_in_tx(
          &mut tx,
          MAGIC_LINK_OTP_PURPOSE,
          &email,
          "RuntimeState magic link otp delete",
        )
        .await?;
      tx.commit()
        .await
        .map_err(|err| RuntimeError::database("RuntimeState magic link otp transaction commit failed", err))?;
      return Ok(RuntimeMagicLinkOtpConsumeResult::fail("locked"));
    }

    rows
      .update_attempts_in_tx(
        &mut tx,
        MAGIC_LINK_OTP_PURPOSE,
        &email,
        attempts,
        "RuntimeState magic link otp attempts update",
      )
      .await?;

    tx.commit()
      .await
      .map_err(|err| RuntimeError::database("RuntimeState magic link otp transaction commit failed", err))?;
    return Ok(RuntimeMagicLinkOtpConsumeResult::fail("invalid_otp"));
  }

  let token = payload
    .get("token")
    .and_then(serde_json::Value::as_str)
    .ok_or_else(|| RuntimeError::invalid_state("RuntimeState magic link otp payload missing token"))?
    .to_string();
  rows
    .delete_by_key_in_tx(
      &mut tx,
      MAGIC_LINK_OTP_PURPOSE,
      &email,
      "RuntimeState magic link otp delete",
    )
    .await?;
  tx.commit()
    .await
    .map_err(|err| RuntimeError::database("RuntimeState magic link otp transaction commit failed", err))?;

  Ok(RuntimeMagicLinkOtpConsumeResult::ok(token))
}
