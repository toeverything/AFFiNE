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

use crate::{InlineAttachment, MailSendResult, MailTemplate, SmtpMailer};

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

/// Runtime delivery options for [`process_ready_mail_deliveries_with_options`].
/// Workspace metadata resolved for dynamic `$$workspaceId` mail templates.
#[derive(Clone, Debug, Default)]
pub struct ResolvedWorkspaceMailMeta {
  pub name: String,
  pub avatar: Option<InlineAttachment>,
  pub name_contains_domain: bool,
}

/// Optional host-supplied resolver for dynamic `$$workspaceId` placeholders
/// (Yjs root doc `meta.name`/`meta.avatar`, content-policy domain checks, and
/// workspace avatar blob loading).
pub trait WorkspaceMailMetaResolver: Send + Sync {
  fn resolve_workspace_meta<'a>(
    &'a self,
    workspace_id: &'a str,
  ) -> std::pin::Pin<
    Box<dyn std::future::Future<Output = Result<Option<ResolvedWorkspaceMailMeta>, MailWorkerError>> + Send + 'a>,
  >;
}

#[derive(Clone, Default)]
pub struct MailDeliveryOptions<'a> {
  pub base_url: &'a str,
  pub fallback_mailer: Option<&'a SmtpMailer>,
  pub fallback_domains: &'a [String],
  pub workspace_resolver: Option<&'a dyn WorkspaceMailMetaResolver>,
}

/// Returns `true` if a workspace name contains a URL or a domain.
/// It folds invisible characters, full-width ASCII, enclosed alphanumerics and
/// URL punctuation variants before the scan, as `server_domain::content_policy` does.
pub fn workspace_name_contains_domain(name: &str) -> bool {
  let folded: String = name.chars().filter_map(fold_domain_char).collect();
  let mut start = 0;
  while start < folded.len() {
    let rest = &folded[start..];
    if rest.starts_with("http://") || rest.starts_with("https://") || rest.starts_with("www.") {
      return true;
    }
    if is_domain_boundary_before(&folded, start) {
      let end = start + rest.find(|ch: char| !is_domain_char(ch)).unwrap_or(rest.len());
      if end > start && is_domain_candidate(&folded[start..end]) && is_domain_boundary_after(&folded, end) {
        return true;
      }
    }
    start += rest.chars().next().map_or(1, char::len_utf8);
  }
  false
}

fn fold_domain_char(ch: char) -> Option<char> {
  let code = ch as u32;
  let folded = match ch {
    '\u{00ad}'
    | '\u{034f}'
    | '\u{061c}'
    | '\u{180e}'
    | '\u{200b}'..='\u{200f}'
    | '\u{202a}'..='\u{202e}'
    | '\u{2060}'..='\u{206f}'
    | '\u{fe00}'..='\u{fe0f}'
    | '\u{feff}'
    | '\u{e0100}'..='\u{e01ef}' => return None,
    '。' | '｡' | '․' | '‧' | '∙' | '●' | '•' => '.',
    '⁄' | '∕' | '╱' => '/',
    '꞉' | 'ː' | '։' => ':',
    '‐' | '‑' | '‒' | '–' | '—' | '―' | '−' | '﹘' => '-',
    '⓿' | '🄌' => '0',
    // Full-width ASCII, which includes the full-width forms of `.`, `/`, `:`, `-` and `_`.
    '\u{ff01}'..='\u{ff5e}' => char::from_u32(code - 0xfee0)?,
    '\u{1f150}'..='\u{1f169}' => char::from_u32('a' as u32 + code - 0x1f150)?,
    '\u{2776}'..='\u{277e}' => char::from_u32('1' as u32 + code - 0x2776)?,
    '\u{2780}'..='\u{2788}' => char::from_u32('1' as u32 + code - 0x2780)?,
    '\u{278a}'..='\u{2792}' => char::from_u32('1' as u32 + code - 0x278a)?,
    other => other,
  };
  Some(folded.to_ascii_lowercase())
}

fn is_domain_char(ch: char) -> bool {
  ch.is_ascii_alphanumeric() || ch == '-' || ch == '.'
}

fn is_domain_candidate(candidate: &str) -> bool {
  let labels: Vec<&str> = candidate.split('.').collect();
  let Some(tld) = labels.last().filter(|_| labels.len() >= 2) else {
    return false;
  };
  (2..=63).contains(&tld.len())
    && tld.chars().all(|ch| ch.is_ascii_alphabetic())
    && labels.iter().all(|label| {
      (1..=63).contains(&label.len())
        && !label.starts_with('-')
        && !label.ends_with('-')
        && label.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
    })
}

fn is_domain_boundary_before(value: &str, start: usize) -> bool {
  value[..start]
    .chars()
    .next_back()
    .is_none_or(|prev| !(prev.is_ascii_alphanumeric() || prev == '-' || prev == '_' || prev == '@'))
}

fn is_domain_boundary_after(value: &str, end: usize) -> bool {
  value[end..]
    .chars()
    .next()
    .is_none_or(|next| !(next.is_ascii_alphanumeric() || next == '-' || next == '_' || next == '.'))
}

async fn resolve_dynamic_payload_props(
  pool: &PgPool,
  payload: &mut Value,
  options: &MailDeliveryOptions<'_>,
) -> Result<(Option<&'static str>, Vec<InlineAttachment>), MailWorkerError> {
  let mail_name = payload
    .get("name")
    .and_then(Value::as_str)
    .unwrap_or_default()
    .to_owned();
  let mut inline_attachments = Vec::new();
  let Some(props) = payload.get_mut("props").and_then(Value::as_object_mut) else {
    return Ok((None, inline_attachments));
  };
  let base = options.base_url.trim_end_matches('/');
  let keys: Vec<String> = props.keys().cloned().collect();
  for key in keys {
    let Some(obj) = props.get(&key).and_then(Value::as_object).cloned() else {
      continue;
    };
    if let Some(ws_id) = obj.get("$$workspaceUrl").and_then(Value::as_str) {
      props.insert(key, Value::String(format!("{base}/workspace/{ws_id}")));
      continue;
    }
    if let Some(ws_id) = obj.get("$$workspaceId").and_then(Value::as_str) {
      let resolved = if let Some(resolver) = options.workspace_resolver {
        resolver.resolve_workspace_meta(ws_id).await?
      } else {
        let ws_name: Option<String> = sqlx::query_scalar("SELECT NULLIF(trim(name), '') FROM workspaces WHERE id = $1")
          .bind(ws_id)
          .fetch_optional(pool)
          .await?
          .flatten();
        let exists: bool = if ws_name.is_some() {
          true
        } else {
          sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1) \
             OR EXISTS(SELECT 1 FROM snapshots WHERE workspace_id = $1 AND guid = $1)",
          )
          .bind(ws_id)
          .fetch_one(pool)
          .await?
        };
        exists.then(|| {
          let name = ws_name.unwrap_or_else(|| "Untitled Workspace".to_owned());
          let name_contains_domain = workspace_name_contains_domain(&name);
          ResolvedWorkspaceMailMeta {
            name,
            avatar: None,
            name_contains_domain,
          }
        })
      };
      let Some(meta) = resolved else {
        return Ok((Some("dynamic_props_missing"), inline_attachments));
      };
      if mail_name == "MemberInvitation" && meta.name_contains_domain {
        return Ok((Some("workspace_name_contains_domain"), inline_attachments));
      }
      let mut merged = obj;
      merged.remove("$$workspaceId");
      merged.insert("name".to_owned(), Value::String(meta.name));
      if let Some(att) = meta.avatar {
        merged.insert("avatar".to_owned(), Value::String(format!("cid:{}", att.content_id)));
        inline_attachments.push(att);
      }
      props.insert(key, Value::Object(merged));
      continue;
    }
    if mail_name == "MemberInvitation"
      && key == "workspace"
      && let Some(ws_name) = obj.get("name").and_then(Value::as_str)
      && workspace_name_contains_domain(ws_name)
    {
      return Ok((Some("workspace_name_contains_domain"), inline_attachments));
    }
    if let Some(uid) = obj.get("$$userId").and_then(Value::as_str) {
      let email: Option<String> = sqlx::query_scalar("SELECT email FROM users WHERE id = $1")
        .bind(uid)
        .fetch_optional(pool)
        .await?;
      let Some(email) = email else {
        return Ok((Some("dynamic_props_missing"), inline_attachments));
      };
      let mut merged = obj;
      merged.remove("$$userId");
      merged.insert("email".to_owned(), Value::String(email));
      props.insert(key, Value::Object(merged));
    }
  }
  Ok((None, inline_attachments))
}

fn should_use_fallback_mailer(recipient_email: &str, fallback_domains: &[String]) -> bool {
  if fallback_domains.is_empty() {
    return false;
  }
  let Some((_, domain)) = recipient_email.rsplit_once('@') else {
    return false;
  };
  let domain_lower = domain.trim().to_ascii_lowercase();
  fallback_domains
    .iter()
    .any(|d| d.trim().eq_ignore_ascii_case(&domain_lower))
}

/// Processes a single batch of ready `public.mail_deliveries` rows using the
/// primary [`SmtpMailer`] and default options.
pub async fn process_ready_mail_deliveries(
  pool: &PgPool,
  mailer: &SmtpMailer,
  worker_id: &str,
  batch_size: i64,
  lease_ms: i64,
) -> Result<usize, MailWorkerError> {
  process_ready_mail_deliveries_with_options(
    pool,
    mailer,
    worker_id,
    batch_size,
    lease_ms,
    &MailDeliveryOptions {
      base_url: "http://localhost:3010",
      fallback_mailer: None,
      fallback_domains: &[],
      workspace_resolver: None,
    },
  )
  .await
}

/// Processes a single batch of ready `public.mail_deliveries` rows across all
/// 30 `v0.27.5` mail templates, resolving dynamic `$$workspaceId`, `$$userId`,
/// and `$$workspaceUrl` placeholders from PostgreSQL before rendering, and
/// routing matching domains (or fallback retries) to `fallback_mailer`.
pub async fn process_ready_mail_deliveries_with_options(
  pool: &PgPool,
  mailer: &SmtpMailer,
  worker_id: &str,
  batch_size: i64,
  lease_ms: i64,
  options: &MailDeliveryOptions<'_>,
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
    let (Some(recipient_email), Some(mut payload)) = (recipient_email, payload) else {
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

    // 2. Resolve dynamic `$$workspaceId` / `$$userId` / `$$workspaceUrl` props.
    let (skip_reason, inline_attachments) = resolve_dynamic_payload_props(pool, &mut payload, options).await?;
    if let Some(skip_reason) = skip_reason {
      mark_terminal(
        pool,
        &item.id,
        worker_id,
        "skipped",
        None,
        None,
        Some(skip_reason),
        None,
      )
      .await?;
      continue;
    }

    // 3. Parse template before incrementing attempt_count; if unrecognized,
    //    release lease back to `queued` without modifying payload or attempt_count.
    let template: MailTemplate = match serde_json::from_value(payload) {
      Ok(tpl) => tpl,
      Err(err) => {
        tracing::warn!(delivery_id = %item.id, error = %err, "releasing unsupported mail delivery back to queued");
        release_lease_to_queued(pool, &item.id, worker_id).await?;
        continue;
      }
    };

    // 4. Mark attempt started (atomically guards lease & attempt budget).
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
      mark_terminal(pool, &item.id, worker_id, "failed", None, None, Some("expired"), None).await?;
      continue;
    };
    processed += 1;

    let rendered = template.render();
    let active_mailer = if should_use_fallback_mailer(recipient_email, options.fallback_domains) {
      options.fallback_mailer.unwrap_or(mailer)
    } else {
      mailer
    };
    let send_res = active_mailer
      .send_with_attachments(recipient_email, &rendered, &inline_attachments)
      .await;
    match send_res {
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

  #[test]
  fn workspace_name_contains_domain_detects_folded_urls_and_domains() {
    let cases: &[(&str, bool)] = &[
      ("BTC example.com", true),
      ("evil\u{2024}com", true),
      ("https://\u{ff45}xample\u{ff0e}com", true),
      ("exa\u{200b}mple.com", true),
      ("www.affine", true),
      ("http://localhost", true),
      ("Visit \u{1f154}xample.org now", true),
      ("sub-domain.example.co.uk", true),
      ("EXAMPLE.COM", true),
      ("v1.0", false),
      ("3.14", false),
      ("Rev.2", false),
      ("Workspace 2.0", false),
      ("user@example.com", false),
      ("My Team", false),
      ("a.b", false),
      ("-bad.com", false),
      ("bad-.com", false),
      ("", false),
    ];
    for (name, expected) in cases {
      assert_eq!(workspace_name_contains_domain(name), *expected, "{name:?}");
    }
  }
}
