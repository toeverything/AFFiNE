use affine_core::access_control::{AccessGrant, Plan};
use hmac::{Hmac, KeyInit, Mac};
use serde_json::json;
use sha2::Sha256;
use sqlx::{Postgres, Row, Transaction};

use super::{MailSnapshot, PaymentSnapshot};
use crate::runtime::{Deployment, RuntimeError, RuntimeResult};

pub(super) async fn reserve_snapshot_mails(
  tx: &mut Transaction<'_, Postgres>,
  snapshot: &PaymentSnapshot,
  hash_key: &[u8; 32],
  now: chrono::DateTime<chrono::Utc>,
) -> RuntimeResult<()> {
  reserve_mails(tx, &snapshot.mails, hash_key, now).await
}

pub(super) async fn reserve_workspace_upgrade_mails(
  tx: &mut Transaction<'_, Postgres>,
  before: &[(String, AccessGrant)],
  deployment: Deployment,
  hash_key: &[u8; 32],
  now: chrono::DateTime<chrono::Utc>,
) -> RuntimeResult<()> {
  let mut mails = Vec::new();
  for (workspace_id, previous) in before {
    let next = super::super::entitlement::resolve_workspace_entitlement(tx, deployment, workspace_id, now).await?;
    if previous.plan == Plan::Team || next.plan != Plan::Team {
      continue;
    }
    let recipients = sqlx::query(
      r#"SELECT users.id,users.email,members.role
         FROM workspace_members members JOIN users ON users.id=members.user_id
         WHERE members.workspace_id=$1 AND members.state='active' AND members.role IN ('owner','admin')
         ORDER BY users.id"#,
    )
    .bind(workspace_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("load team upgrade mail recipients", error))?;
    for recipient in recipients {
      let user_id: String = recipient.get("id");
      let email: String = recipient.get("email");
      mails.push(MailSnapshot {
        mail_name: "TeamWorkspaceUpgraded".to_string(),
        mail_class: "workspace_lifecycle".to_string(),
        dedupe_key: format!("team-workspace-upgraded:{workspace_id}:{user_id}"),
        recipient_email: email.clone(),
        recipient_user_id: Some(user_id),
        workspace_id: Some(workspace_id.clone()),
        payload: json!({
          "name": "TeamWorkspaceUpgraded",
          "to": email,
          "props": {
            "workspace": { "$$workspaceId": workspace_id },
            "isOwner": recipient.get::<String, _>("role") == "owner",
            "url": { "$$workspaceUrl": workspace_id },
          }
        }),
      });
    }
  }
  reserve_mails(tx, &mails, hash_key, now).await
}

async fn reserve_mails(
  tx: &mut Transaction<'_, Postgres>,
  mails: &[MailSnapshot],
  hash_key: &[u8; 32],
  now: chrono::DateTime<chrono::Utc>,
) -> RuntimeResult<()> {
  for mail in mails {
    let normalized = mail.recipient_email.trim().to_ascii_lowercase();
    if normalized != mail.recipient_email.to_ascii_lowercase() {
      return Err(RuntimeError::invalid_input("invalid payment mail recipient"));
    }
    let (_, domain) = normalized
      .split_once('@')
      .filter(|(local, domain)| !local.is_empty() && !domain.is_empty())
      .ok_or_else(|| RuntimeError::invalid_input("invalid payment mail recipient"))?;
    let mut hash = Hmac::<Sha256>::new_from_slice(hash_key)
      .map_err(|_| RuntimeError::invalid_state("invalid payment mail hash key"))?;
    hash.update(normalized.as_bytes());
    sqlx::query(
      r#"INSERT INTO mail_deliveries(
           mail_name,mail_class,status,dedupe_key,recipient_email,recipient_hash,recipient_domain,
           recipient_user_id,workspace_id,payload,send_after)
         VALUES($1,$2,'queued',$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING"#,
    )
    .bind(&mail.mail_name)
    .bind(&mail.mail_class)
    .bind(&mail.dedupe_key)
    .bind(&mail.recipient_email)
    .bind(hex::encode(hash.finalize().into_bytes()))
    .bind(domain)
    .bind(&mail.recipient_user_id)
    .bind(&mail.workspace_id)
    .bind(&mail.payload)
    .bind(now)
    .execute(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("reserve payment mail", error))?;
  }
  Ok(())
}
