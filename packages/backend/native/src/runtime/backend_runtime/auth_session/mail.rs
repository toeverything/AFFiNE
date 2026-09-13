use affine_core::rate_limit::{MailInput, MailMetadata, SourceFacts, plan_mail};
use chrono::{DateTime, Utc};
use hmac::{Hmac, KeyInit, Mac};
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Transaction};

use super::{RuntimeError, RuntimeResult};

pub(super) struct AuthMail<'a> {
  pub(super) name: &'a str,
  pub(super) to: &'a str,
  pub(super) recipient_user_id: Option<&'a str>,
  pub(super) props: serde_json::Value,
  pub(super) dedupe_key: String,
  pub(super) expires_at: DateTime<Utc>,
  pub(super) source: Option<&'a AuthRequestSource>,
}

#[derive(Clone, Debug, serde::Deserialize)]
pub(super) struct AuthRequestSource {
  pub(super) trusted: bool,
  pub(super) ip: Option<String>,
  pub(super) asn: Option<u32>,
}

pub(super) async fn reserve(
  tx: &mut Transaction<'_, Postgres>,
  config: &super::super::BackendRuntimeConfig,
  mail: AuthMail<'_>,
  now: DateTime<Utc>,
) -> RuntimeResult<()> {
  let recipient_email = mail.to.trim();
  let normalized_email = recipient_email.to_ascii_lowercase();
  let (_, domain) = normalized_email
    .split_once('@')
    .ok_or_else(|| RuntimeError::invalid_input("invalid email"))?;
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('auth:mail:' || $1,0))")
    .bind(&mail.dedupe_key)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("lock auth mail dedupe key", error))?;
  let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM mail_deliveries WHERE dedupe_key=$1)")
    .bind(&mail.dedupe_key)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("check auth mail dedupe key", error))?;
  if exists {
    return Ok(());
  }
  let plan = plan_mail(&MailInput {
    mail_name: mail.name.to_string(),
    recipient_email: normalized_email.clone(),
    metadata: MailMetadata {
      actor_user_id: mail.recipient_user_id.map(str::to_string),
      workspace_id: None,
      abuse_subject_key: None,
    },
    source: mail.source.map(|source| SourceFacts {
      trusted: source.trusted,
      ip: source.ip.clone(),
      asn: source.asn,
    }),
  })
  .map_err(|error| RuntimeError::invalid_input(error.to_string()))?;
  if !super::super::rolling_quota::commit_scopes_in_transaction(tx, &plan.scopes, now).await? {
    return Err(RuntimeError::invalid_state("mail_quota_denied"));
  }
  let hash_key = Sha256::digest(config.private_key.as_bytes());
  let mut recipient_hash =
    Hmac::<Sha256>::new_from_slice(&hash_key).map_err(|_| RuntimeError::invalid_state("invalid auth mail hash key"))?;
  recipient_hash.update(normalized_email.as_bytes());
  let payload = serde_json::json!({
    "name": mail.name,
    "to": recipient_email,
    "props": mail.props,
  });
  let quota_decision = serde_json::json!({
    "allowed": true,
    "mailClass": plan.class.as_str(),
    "requested": 1,
  });
  sqlx::query(
    r#"INSERT INTO mail_deliveries(mail_name,mail_class,priority,status,dedupe_key,recipient_email,
         recipient_hash,recipient_domain,recipient_user_id,quota_decision,payload,send_after,expires_at,max_attempts)
       VALUES($1,$10,'critical','queued',$2,$3,$4,$5,$6,$11,$7,$8,$9,3)
       ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING"#,
  )
  .bind(mail.name)
  .bind(mail.dedupe_key)
  .bind(recipient_email)
  .bind(hex::encode(recipient_hash.finalize().into_bytes()))
  .bind(domain)
  .bind(mail.recipient_user_id)
  .bind(payload)
  .bind(now)
  .bind(mail.expires_at)
  .bind(plan.class.as_str())
  .bind(quota_decision)
  .execute(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("reserve auth mail", error))?;
  Ok(())
}
