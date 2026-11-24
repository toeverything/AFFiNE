//! Durable `public.mail_deliveries` worker aligned with `v0.27.5`
//! `packages/backend/server/src/core/mail/job.ts` and
//! `packages/backend/server/src/models/mail-delivery.ts`.
//!
//! Coexistence safety:
//! - Only claims direct-render templates without dynamic `$$workspaceId` /
//!   `$$userId` / `$$workspaceUrl` placeholders, leaving legacy dynamic-prop
//!   templates untouched for `v0.27.5` workers during rolling coexistence.
//! - If a claimed row still fails `MailTemplate` deserialization, releases the
//!   lease back to `queued` without incrementing `attempt_count` or anonymizing
//!   its `payload` / `recipient_email`.

use chrono::{DateTime, Duration, Utc};
use serde_json::Value;
use sqlx::{PgPool, Row};

use crate::{MailSendResult, MailTemplate, SmtpMailer};

#[derive(Debug, thiserror::Error)]
pub enum MailWorkerError {
  #[error("database error: {0}")]
  Db(#[from] sqlx::Error),
}

struct ClaimedDelivery {
  id: String,
  recipient_email: Option<String>,
  recipient_user_id: Option<String>,
  payload: Option<Value>,
  expires_at: Option<DateTime<Utc>>,
  max_attempts: i32,
}

fn is_email_local_byte(b: u8) -> bool {
  b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'%' | b'+' | b'-')
}

fn is_email_domain_byte(b: u8) -> bool {
  b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-')
}

/// Redacts URLs (`[url]`), email addresses (`[email]`), and 6+ digit codes
/// (`[code]`), then truncates to at most 1000 Unicode scalar values (never
/// slicing mid-UTF-8 codepoint), matching `models/mail-delivery.ts:109-118`.
pub fn redact_error(raw: Option<&str>) -> Option<String> {
  let text = raw?.trim();
  if text.is_empty() {
    return None;
  }

  // Pass 1: replace `http://...` and `https://...` with `[url]`.
  let mut pass1 = String::with_capacity(text.len());
  let bytes = text.as_bytes();
  let mut i = 0;
  while i < bytes.len() {
    let is_http = bytes[i..].get(..7).is_some_and(|s| s.eq_ignore_ascii_case(b"http://"))
      || bytes[i..].get(..8).is_some_and(|s| s.eq_ignore_ascii_case(b"https://"));
    if is_http {
      pass1.push_str("[url]");
      while i < bytes.len() && !bytes[i].is_ascii_whitespace() {
        i += 1;
      }
    } else {
      let ch = text[i..].chars().next().expect("valid utf8 boundary");
      pass1.push(ch);
      i += ch.len_utf8();
    }
  }

  // Pass 2: replace email addresses `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}` with `[email]`,
  // backtracking trailing `.`, `-`, or ASCII digits just like JS regex `/gi`.
  let mut pass2 = String::with_capacity(pass1.len());
  let b2 = pass1.as_bytes();
  let mut j = 0;
  while j < b2.len() {
    if is_email_local_byte(b2[j]) {
      let start = j;
      while j < b2.len() && is_email_local_byte(b2[j]) {
        j += 1;
      }
      if j < b2.len() && b2[j] == b'@' && j > start {
        let dom_start = j + 1;
        let mut k = dom_start;
        while k < b2.len() && is_email_domain_byte(b2[k]) {
          k += 1;
        }
        let mut best_end = None;
        for dot in ((dom_start + 1)..k).rev() {
          if b2[dot] != b'.' {
            continue;
          }
          let mut tld_end = dot + 1;
          while tld_end < k && b2[tld_end].is_ascii_alphabetic() {
            tld_end += 1;
          }
          if tld_end - (dot + 1) >= 2 {
            best_end = Some(tld_end);
            break;
          }
        }
        if let Some(end) = best_end {
          pass2.push_str("[email]");
          j = end;
          continue;
        }
      }
      pass2.push_str(&pass1[start..j]);
    } else {
      let ch = pass1[j..].chars().next().expect("valid utf8 boundary");
      pass2.push(ch);
      j += ch.len_utf8();
    }
  }

  // Pass 3: replace standalone 6+ digit sequences (`\b\d{6,}\b`) with `[code]`.
  let mut pass3 = String::with_capacity(pass2.len());
  let b3 = pass2.as_bytes();
  let mut m = 0;
  while m < b3.len() {
    if b3[m].is_ascii_digit() {
      let prev_word = m > 0 && (b3[m - 1].is_ascii_alphanumeric() || b3[m - 1] == b'_');
      let start = m;
      while m < b3.len() && b3[m].is_ascii_digit() {
        m += 1;
      }
      let next_word = m < b3.len() && (b3[m].is_ascii_alphanumeric() || b3[m] == b'_');
      if !prev_word && !next_word && m - start >= 6 {
        pass3.push_str("[code]");
      } else {
        pass3.push_str(&pass2[start..m]);
      }
    } else {
      let ch = pass2[m..].chars().next().expect("valid utf8 boundary");
      pass3.push(ch);
      m += ch.len_utf8();
    }
  }

  Some(pass3.chars().take(1000).collect())
}

async fn mark_expired_pending(pool: &PgPool, batch_size: i64) -> Result<u64, sqlx::Error> {
  let res = sqlx::query(
    r#"UPDATE mail_deliveries
       SET status = 'failed',
           failed_at = now(),
           settled_at = now(),
           locked_by = NULL,
           locked_until = NULL,
           recipient_email = NULL,
           payload = NULL,
           retention_state = 'anonymized',
           anonymized_at = now(),
           last_error_code = 'expired',
           updated_at = now()
       WHERE id IN (
         SELECT id
         FROM mail_deliveries
         WHERE (
             status IN ('queued', 'retry_wait')
             OR (status = 'sending' AND locked_until < now())
           )
           AND expires_at IS NOT NULL
           AND expires_at <= now()
         ORDER BY expires_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )"#,
  )
  .bind(batch_size)
  .execute(pool)
  .await?;
  Ok(res.rows_affected())
}

async fn release_lease_to_queued(pool: &PgPool, id: &str, worker_id: &str) -> Result<(), sqlx::Error> {
  sqlx::query(
    r#"UPDATE mail_deliveries
       SET status = 'queued',
           locked_by = NULL,
           locked_until = NULL,
           updated_at = now()
       WHERE id = $1::uuid
         AND status = 'sending'
         AND locked_by = $2"#,
  )
  .bind(id)
  .bind(worker_id)
  .execute(pool)
  .await?;
  Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn mark_terminal(
  pool: &PgPool,
  id: &str,
  worker_id: &str,
  status: &str,
  provider_message_id: Option<&str>,
  provider_response: Option<&str>,
  error_code: Option<&str>,
  error: Option<&str>,
) -> Result<(), sqlx::Error> {
  sqlx::query(
    r#"UPDATE mail_deliveries
       SET status = $3,
           sent_at = CASE WHEN $3 = 'sent' THEN now() ELSE sent_at END,
           failed_at = CASE WHEN $3 = 'failed' THEN now() ELSE failed_at END,
           canceled_at = CASE WHEN $3 = 'canceled' THEN now() ELSE canceled_at END,
           settled_at = now(),
           locked_by = NULL,
           locked_until = NULL,
           recipient_email = NULL,
           payload = NULL,
           retention_state = 'anonymized',
           anonymized_at = now(),
           provider_message_id = $4,
           provider_response = $5,
           last_error_code = $6,
           last_error = $7,
           updated_at = now()
       WHERE id = $1::uuid
         AND status = 'sending'
         AND locked_by = $2"#,
  )
  .bind(id)
  .bind(worker_id)
  .bind(status)
  .bind(provider_message_id)
  .bind(redact_error(provider_response))
  .bind(error_code)
  .bind(redact_error(error))
  .execute(pool)
  .await?;
  Ok(())
}

/// Processes a single batch of ready `public.mail_deliveries` rows:
/// 1. Marks expired pending/stale-sending rows as `failed` and anonymizes them.
/// 2. Claims up to `batch_size` direct-render rows (never claiming rows with
///    legacy dynamic `$$...` placeholders) via `FOR UPDATE SKIP LOCKED`.
/// 3. Validates payload, expiry, disabled recipient, and template parsing
///    BEFORE incrementing `attempt_count`.
/// 4. Sends via [`SmtpMailer`], writes `provider_message_id` on `sent`, and
///    retries transient failures with exponential backoff capped at 30 min.
///
/// Returns the number of deliveries attempted in this pass.
pub async fn process_ready_mail_deliveries(
  pool: &PgPool,
  mailer: &SmtpMailer,
  worker_id: &str,
  batch_size: i64,
  lease_ms: i64,
) -> Result<usize, MailWorkerError> {
  let batch_size = batch_size.max(1);
  let lease_ms = lease_ms.max(1_000);

  let _ = mark_expired_pending(pool, batch_size).await?;

  let rows = sqlx::query(
    r#"UPDATE mail_deliveries
       SET status = 'sending',
           locked_by = $1,
           locked_until = now() + ($2::text || ' milliseconds')::interval,
           updated_at = now()
       WHERE id IN (
         SELECT id
         FROM mail_deliveries
         WHERE (
             status IN ('queued', 'retry_wait')
             OR (status = 'sending' AND locked_until < now())
           )
           AND mail_name IN (
             'TestMail', 'SignIn', 'SignUp', 'SetPassword', 'ChangePassword',
             'VerifyEmail', 'ChangeEmail', 'VerifyChangeEmail', 'EmailChanged',
             'TeamLicense', 'MemberInvitation', 'MemberAccepted', 'LinkInvitationApprove'
           )
           AND (payload IS NULL OR payload::text NOT LIKE '%"$$%')
           AND send_after <= now()
           AND (expires_at IS NULL OR expires_at > now())
           AND (locked_until IS NULL OR locked_until < now())
           AND max_attempts > attempt_count
         ORDER BY
           CASE priority
             WHEN 'critical' THEN 0
             WHEN 'high' THEN 1
             WHEN 'normal' THEN 2
             ELSE 3
           END,
           send_after,
           created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $3
       )
       RETURNING id::text AS id, recipient_email, recipient_user_id, payload, expires_at, max_attempts"#,
  )
  .bind(worker_id)
  .bind(lease_ms)
  .bind(batch_size)
  .fetch_all(pool)
  .await?;

  let claimed: Vec<ClaimedDelivery> = rows
    .into_iter()
    .map(|row| ClaimedDelivery {
      id: row.get("id"),
      recipient_email: row.get("recipient_email"),
      recipient_user_id: row.get("recipient_user_id"),
      payload: row.get("payload"),
      expires_at: row.get("expires_at"),
      max_attempts: row.get("max_attempts"),
    })
    .collect();

  let mut processed = 0usize;
  for item in claimed {
    // 1. Pre-attempt checks (NEVER increment `attempt_count` before these pass).
    let recipient_email = item.recipient_email.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let payload = item.payload.filter(|v| !v.is_null());
    let (Some(recipient_email), Some(payload)) = (recipient_email, payload) else {
      mark_terminal(
        pool,
        &item.id,
        worker_id,
        "skipped",
        None,
        None,
        Some("missing_payload"),
        None,
      )
      .await?;
      continue;
    };

    if item.expires_at.is_some_and(|exp| exp <= Utc::now()) {
      mark_terminal(pool, &item.id, worker_id, "failed", None, None, Some("expired"), None).await?;
      continue;
    }

    let recipient_disabled: bool = if let Some(uid) = item.recipient_user_id.as_deref() {
      sqlx::query_scalar::<_, bool>("SELECT disabled FROM users WHERE id = $1")
        .bind(uid)
        .fetch_optional(pool)
        .await?
        .unwrap_or(false)
    } else {
      sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM users WHERE lower(email) = lower($1) AND disabled = true)",
      )
      .bind(recipient_email)
      .fetch_one(pool)
      .await?
    };
    if recipient_disabled {
      mark_terminal(
        pool,
        &item.id,
        worker_id,
        "skipped",
        None,
        None,
        Some("disabled_recipient"),
        None,
      )
      .await?;
      continue;
    }

    // 2. Parse template before incrementing attempt_count; if unrecognized / dynamic,
    //    release lease back to `queued` without modifying payload or attempt_count.
    let template: MailTemplate = match serde_json::from_value(payload) {
      Ok(tpl) => tpl,
      Err(err) => {
        tracing::warn!(delivery_id = %item.id, error = %err, "releasing unsupported mail delivery back to queued");
        release_lease_to_queued(pool, &item.id, worker_id).await?;
        continue;
      }
    };

    // 3. Mark attempt started (atomically guards lease & attempt budget).
    let attempt_started: Option<i32> = sqlx::query_scalar(
      r#"UPDATE mail_deliveries
         SET attempt_count = attempt_count + 1,
             first_attempt_at = COALESCE(first_attempt_at, now()),
             last_attempt_at = now(),
             updated_at = now()
         WHERE id = $1::uuid
           AND status = 'sending'
           AND locked_by = $2
           AND (expires_at IS NULL OR expires_at > now())
           AND max_attempts > attempt_count
         RETURNING attempt_count"#,
    )
    .bind(&item.id)
    .bind(worker_id)
    .fetch_optional(pool)
    .await?;

    let Some(next_attempt) = attempt_started else {
      continue;
    };
    processed += 1;

    let rendered = template.render();
    match mailer.send(recipient_email, &rendered).await {
      MailSendResult::Accepted {
        message_id,
        provider_response,
      } => {
        mark_terminal(
          pool,
          &item.id,
          worker_id,
          "sent",
          Some(&message_id),
          Some(&provider_response),
          None,
          None,
        )
        .await?;
      }
      MailSendResult::Rejected {
        provider_response,
        error_code,
      } => {
        let (_, _, terminal_code) = resolve_failed_delivery(error_code, next_attempt, item.expires_at, Utc::now());
        mark_terminal(
          pool,
          &item.id,
          worker_id,
          "failed",
          None,
          provider_response.as_deref(),
          Some(terminal_code),
          provider_response.as_deref(),
        )
        .await?;
      }
      MailSendResult::Failed {
        retryable,
        error_code,
        error,
      } => {
        // Matches `job.ts:142, 162-169`: exponential backoff capped at 30 minutes (1800 s),
        // and terminal `"expired"` whenever `next_send_after >= expires_at`.
        let (next_send_after, would_expire, terminal_code) =
          resolve_failed_delivery(error_code, next_attempt, item.expires_at, Utc::now());
        let can_retry = retryable && next_attempt < item.max_attempts;
        if can_retry && !would_expire {
          let requeued = sqlx::query(
            r#"UPDATE mail_deliveries
               SET status = 'retry_wait',
                   send_after = $3,
                   locked_by = NULL,
                   locked_until = NULL,
                   last_error_code = $4,
                   last_error = $5,
                   updated_at = now()
               WHERE id = $1::uuid
                 AND status = 'sending'
                 AND locked_by = $2
                 AND (expires_at IS NULL OR $3 < expires_at)
                 AND attempt_count < max_attempts"#,
          )
          .bind(&item.id)
          .bind(worker_id)
          .bind(next_send_after)
          .bind(error_code)
          .bind(redact_error(Some(&error)))
          .execute(pool)
          .await?
          .rows_affected();
          if requeued == 0 {
            mark_terminal(
              pool,
              &item.id,
              worker_id,
              "failed",
              None,
              None,
              Some(terminal_code),
              Some(&error),
            )
            .await?;
          }
        } else {
          mark_terminal(
            pool,
            &item.id,
            worker_id,
            "failed",
            None,
            None,
            Some(terminal_code),
            Some(&error),
          )
          .await?;
        }
      }
    }
  }

  Ok(processed)
}

fn resolve_failed_delivery(
  error_code: &'static str,
  next_attempt: i32,
  expires_at: Option<DateTime<Utc>>,
  now: DateTime<Utc>,
) -> (DateTime<Utc>, bool, &'static str) {
  let backoff_secs = 30_i64
    .saturating_mul(1_i64 << (next_attempt.clamp(0, 6) as u32))
    .min(30 * 60);
  let next_send_after = now + Duration::seconds(backoff_secs);
  let would_expire = expires_at.is_some_and(|exp| next_send_after >= exp);
  let terminal_code = if would_expire { "expired" } else { error_code };
  (next_send_after, would_expire, terminal_code)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn failed_delivery_marks_expired_when_next_send_after_reaches_expires_at() {
    let now = Utc::now();
    // Final attempt (e.g. attempt 5 of 5): backoff is 960s; if expires_at is 60s away,
    // `next_send_after >= expires_at` must surface `"expired"` even when `!can_retry`.
    let (_, would_expire, code) = resolve_failed_delivery("smtp_temp_error", 5, Some(now + Duration::seconds(60)), now);
    assert!(would_expire);
    assert_eq!(code, "expired");

    // Permanent rejection (e.g. attempt 1, backoff 60s) when `next_send_after == expires_at` also writes `"expired"`.
    let (_, would_expire, code) = resolve_failed_delivery("smtp_rejected", 1, Some(now + Duration::seconds(60)), now);
    assert!(would_expire);
    assert_eq!(code, "expired");

    // When `expires_at` is still beyond `next_send_after`, preserve the original `error_code`.
    let (_, would_expire, code) =
      resolve_failed_delivery("smtp_temp_error", 5, Some(now + Duration::seconds(3600)), now);
    assert!(!would_expire);
    assert_eq!(code, "smtp_temp_error");
  }

  #[test]
  fn redact_error_strips_urls_emails_codes_and_truncates_on_utf8_char_boundary() {
    let raw = "SMTP 错误 🚀 无法发送至 alice.test+1@example.com，链接 https://app.affine.pro/magic-link?token=987654，验证码 654321，短号 12345 保留";
    let redacted = redact_error(Some(raw)).expect("redacted");
    assert!(!redacted.contains("alice.test+1@example.com"), "got {redacted}");
    assert!(!redacted.contains("https://app.affine.pro"), "got {redacted}");
    assert!(!redacted.contains("654321"), "got {redacted}");
    assert!(redacted.contains("[email]"), "got {redacted}");
    assert!(redacted.contains("[url]"), "got {redacted}");
    assert!(redacted.contains("[code]"), "got {redacted}");
    assert!(redacted.contains("12345"), "5-digit number must remain: {redacted}");

    // Case-insensitive URLs and trailing punctuation/digits/hyphens on emails.
    let edge = "Sent to alice@example.com. and alice@example.com123 and alice@example.com-foo and alice@example.com.x and alice@example.com1a via HTTPS://app.affine.pro/magic?token=abc";
    let edge_redacted = redact_error(Some(edge)).expect("edge redacted");
    assert_eq!(
      edge_redacted,
      "Sent to [email]. and [email]123 and [email]-foo and [email].x and [email]1a via [url]"
    );

    // Multi-byte UTF-8 truncation at 1000 chars must never panic.
    let long_utf8 = "中🚀".repeat(800);
    let truncated = redact_error(Some(&long_utf8)).expect("truncated");
    assert_eq!(truncated.chars().count(), 1000);
  }
}
