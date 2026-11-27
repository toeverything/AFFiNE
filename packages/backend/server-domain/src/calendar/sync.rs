//! Calendar subscription synchronization and periodic polling.
//!
//! Enforces strict separation between short PostgreSQL transactions and
//! external provider HTTP requests so `PgPool` connections are never held
//! across network I/O (verified with `max_connections = 1`).
use super::caldav::CaldavCalendarProvider;
use super::crypto::decrypt_token;
use super::google::GoogleCalendarProvider;
use super::ical::{parse_js_iso_datetime, try_offset_at_utc_guess_ymd_f64};
use super::{
  CalendarAccountRecord, CalendarError, CalendarProviderEvent, CalendarProviderEventTime,
  CalendarProviderListEventsResult, CalendarProviderName, CalendarService, CalendarSubscriptionRecord, TokenPatch,
  internal_err, truncate_calendar_error,
};
use chrono::{DateTime, Duration, Utc};
use futures_util::{FutureExt as _, StreamExt as _};
use server_db::WorkloadTier;
use sqlx::Row;
use std::panic::AssertUnwindSafe;
use uuid::Uuid;
const TOKEN_REFRESH_SKEW_SECS: i64 = 60;
const DEFAULT_PAST_DAYS: i64 = 90;
const DEFAULT_FUTURE_DAYS: i64 = 180;
const SYNC_CLAIM_SECS: i64 = 30 * 60;
const SYNC_FAILURE_BACKOFF_BASE_SECS: i64 = 5 * 60;
const SYNC_FAILURE_BACKOFF_MAX_SECS: i64 = 6 * 3600;
const CHANNEL_RENEW_RETRY_SECS: i64 = 15 * 60;
pub const CALENDAR_SYNC_CONCURRENCY: usize = 8;
pub const CALENDAR_POLL_BATCHES: usize = 25;
#[derive(Clone, Debug, Default)]
pub struct SyncSubscriptionOptions {
  pub force_full: bool,
  pub claimed_until: Option<DateTime<Utc>>,
}
#[derive(Clone, Debug)]
pub struct ClaimedSubscription {
  pub id: String,
  pub claimed_until: DateTime<Utc>,
}
async fn run_sync_batch(service: &CalendarService, items: Vec<(String, Option<DateTime<Utc>>)>) {
  futures_util::stream::iter(items)
    .map(|(id, claimed_until)| {
      let svc = service.clone();
      async move {
        let opts = SyncSubscriptionOptions {
          force_full: false,
          claimed_until,
        };
        let _ = AssertUnwindSafe(sync_subscription(&svc, &id, opts))
          .catch_unwind()
          .await;
      }
    })
    .buffer_unordered(CALENDAR_SYNC_CONCURRENCY)
    .collect::<Vec<()>>()
    .await;
}
pub async fn poll_due_calendar_subscriptions(service: &CalendarService) -> Result<usize, CalendarError> {
  let mut total = 0usize;
  for _ in 0..CALENDAR_POLL_BATCHES {
    let claimed = claim_due_for_sync(service, CALENDAR_SYNC_CONCURRENCY as i64, None).await?;
    let count = claimed.len();
    if count == 0 {
      break;
    }
    run_sync_batch(
      service,
      claimed.into_iter().map(|i| (i.id, Some(i.claimed_until))).collect(),
    )
    .await;
    total += count;
    if count < CALENDAR_SYNC_CONCURRENCY {
      break;
    }
  }
  Ok(total)
}
pub async fn sync_due_subscription_ids(service: &CalendarService, ids: &[String]) -> Result<(), CalendarError> {
  if ids.is_empty() {
    return Ok(());
  }
  let mut tx = service
    .begin_tx(WorkloadTier::InteractiveWrite, "enqueue due workspace calendar sync")
    .await?;
  sqlx::query(
    r#"UPDATE calendar_subscriptions
       SET next_sync_at = LEAST(COALESCE(next_sync_at, clock_timestamp()), clock_timestamp()),
           updated_at = clock_timestamp()
       WHERE id = ANY($1) AND enabled = true AND next_sync_at <= clock_timestamp()"#,
  )
  .bind(ids)
  .execute(&mut **tx.tx_mut())
  .await
  .map_err(internal_err("enqueue due workspace calendar sync"))?;
  tx.commit()
    .await
    .map_err(internal_err("commit enqueue due workspace calendar sync"))?;
  run_sync_batch(service, ids.iter().cloned().map(|id| (id, None)).collect()).await;
  Ok(())
}
/// Claims up to `limit` due subscriptions using PostgreSQL `clock_timestamp()`
/// and `FOR UPDATE SKIP LOCKED` in a short transaction, then releases the DB connection.
pub async fn claim_due_for_sync(
  service: &CalendarService,
  limit: i64,
  subscription_id: Option<&str>,
) -> Result<Vec<ClaimedSubscription>, CalendarError> {
  let mut tx = service
    .begin_tx(WorkloadTier::InteractiveWrite, "begin claim_due_for_sync")
    .await?;
  let rows = sqlx::query(
    r#"WITH now_ts AS (SELECT clock_timestamp() AS t),
       candidates AS (
         SELECT subscription.id
         FROM calendar_subscriptions subscription
         JOIN calendar_accounts account ON account.id = subscription.account_id
         CROSS JOIN now_ts
         WHERE subscription.enabled
           AND subscription.next_sync_at <= now_ts.t
           AND ($1::text IS NULL OR subscription.id = $1)
           AND (subscription.sync_claimed_until IS NULL OR subscription.sync_claimed_until <= now_ts.t)
           AND account.status = 'active'
         ORDER BY subscription.next_sync_at ASC, subscription.id ASC
         FOR UPDATE OF subscription SKIP LOCKED
         LIMIT $2
       )
       UPDATE calendar_subscriptions subscription
       SET next_sync_at = now_ts.t + make_interval(secs => $3),
           sync_claimed_until = now_ts.t + make_interval(secs => $3),
           updated_at = now_ts.t
       FROM candidates, now_ts
       WHERE subscription.id = candidates.id
       RETURNING subscription.id, subscription.sync_claimed_until"#,
  )
  .bind(subscription_id)
  .bind(limit)
  .bind(SYNC_CLAIM_SECS as f64)
  .fetch_all(&mut **tx.tx_mut())
  .await
  .map_err(internal_err("claim_due_for_sync query"))?;
  tx.commit().await.map_err(internal_err("commit claim_due_for_sync"))?;
  Ok(
    rows
      .into_iter()
      .map(|r| ClaimedSubscription {
        id: r.get("id"),
        claimed_until: r.get("sync_claimed_until"),
      })
      .collect(),
  )
}
async fn db_clock_timestamp(service: &CalendarService) -> Result<DateTime<Utc>, CalendarError> {
  let mut conn = service.read_conn("acquire db clock_timestamp").await?;
  sqlx::query_scalar("SELECT clock_timestamp()")
    .fetch_one(&mut *conn)
    .await
    .map_err(internal_err("read clock_timestamp"))
}
/// Synchronizes a single subscription with its upstream provider.
/// Releases all PostgreSQL connections before every external HTTP request.
pub async fn sync_subscription(
  service: &CalendarService,
  subscription_id: &str,
  options: SyncSubscriptionOptions,
) -> Result<(), CalendarError> {
  let claimed_until = match options.claimed_until {
    Some(c) => c,
    None => match claim_due_for_sync(service, 1, Some(subscription_id))
      .await?
      .into_iter()
      .next()
    {
      Some(c) => c.claimed_until,
      None => return Ok(()),
    },
  };
  let db_now = db_clock_timestamp(service).await?;
  let Some((subscription, account)) = service.load_subscription_with_account(subscription_id).await? else {
    return Ok(());
  };
  if !subscription.enabled
    || subscription.sync_claimed_until != Some(claimed_until)
    || claimed_until <= db_now
    || account.status != "active"
  {
    return Ok(());
  }
  let configs = service.load_configs().await?;
  let provider = account.provider;
  // Step 1: Ensure a fresh access token (external HTTP runs with zero DB conn held).
  let access_token = match ensure_access_token(
    service,
    &account,
    &configs.google,
    Some((&subscription.id, claimed_until)),
  )
  .await
  {
    Ok(Some(token)) => token,
    Ok(None) => return Ok(()),
    Err(err) => {
      handle_sync_failure(service, &subscription, &account, claimed_until, &err, None, false).await?;
      return Ok(());
    }
  };
  let time_min = (db_now - Duration::days(DEFAULT_PAST_DAYS)).to_rfc3339();
  let time_max = (db_now + Duration::days(DEFAULT_FUTURE_DAYS)).to_rfc3339();
  let use_sync_token = subscription.sync_token.is_some() && !options.force_full;
  // Step 2: Fetch events from upstream provider (zero DB conn held).
  let fetch_res = fetch_events_from_provider(
    provider,
    &configs,
    &account,
    &access_token,
    &subscription.external_calendar_id,
    if use_sync_token {
      subscription.sync_token.as_deref()
    } else {
      None
    },
    if use_sync_token { None } else { Some(&time_min) },
    if use_sync_token { None } else { Some(&time_max) },
  )
  .await;
  let events_result = match fetch_res {
    Ok(res) => res,
    Err(CalendarError::SyncTokenInvalid(_)) => {
      let reset = reset_sync_token_under_claim(service, &subscription.id, claimed_until).await?;
      if !reset {
        return Ok(());
      }
      match fetch_events_from_provider(
        provider,
        &configs,
        &account,
        &access_token,
        &subscription.external_calendar_id,
        None,
        Some(&time_min),
        Some(&time_max),
      )
      .await
      {
        Ok(res) => res,
        Err(retry_err) => {
          handle_sync_failure(
            service,
            &subscription,
            &account,
            claimed_until,
            &retry_err,
            Some(&access_token),
            true,
          )
          .await?;
          return Ok(());
        }
      }
    }
    Err(err) => {
      handle_sync_failure(
        service,
        &subscription,
        &account,
        claimed_until,
        &err,
        Some(&access_token),
        true,
      )
      .await?;
      return Ok(());
    }
  };
  // Step 3: Persist events and next_sync_token inside a LongQuery transaction.
  let saved = match persist_events_under_claim(
    service,
    &subscription.id,
    claimed_until,
    subscription.timezone.as_deref(),
    &events_result,
  )
  .await
  {
    Ok(saved) => saved,
    Err(err) => {
      handle_sync_failure(
        service,
        &subscription,
        &account,
        claimed_until,
        &err,
        Some(&access_token),
        true,
      )
      .await?;
      return Ok(());
    }
  };
  if !saved {
    return Ok(());
  }
  let synced_at = db_clock_timestamp(service).await?;
  let mut next_sync_at = synced_at + Duration::minutes(i64::from(account.refresh_interval_minutes.max(1)));
  // Step 4: Ensure Google webhook channel if configured (HTTP outside DB tx).
  if provider == CalendarProviderName::Google
    && let Some(webhook_addr) = service.webhook_address_from_config(&configs.google, "google")
    && let Err(_err) = ensure_google_webhook_channel(
      service,
      &configs.google,
      &subscription,
      &access_token,
      &webhook_addr,
      claimed_until,
    )
    .await
  {
    let retry_at = db_clock_timestamp(service).await? + Duration::seconds(CHANNEL_RENEW_RETRY_SECS);
    if retry_at < next_sync_at {
      next_sync_at = retry_at;
    }
  }
  complete_sync(
    service,
    &subscription.id,
    claimed_until,
    Some(synced_at),
    next_sync_at,
    0,
  )
  .await?;
  Ok(())
}
pub(crate) async fn ensure_access_token(
  service: &CalendarService,
  account: &CalendarAccountRecord,
  google_cfg: &super::google::CalendarGoogleConfig,
  claim: Option<(&str, DateTime<Utc>)>,
) -> Result<Option<String>, CalendarError> {
  let private_key = service.try_effective_private_key().await?;
  let access_token = match account.access_token_encrypted.as_deref() {
    Some(enc) => Some(decrypt_token(&private_key, enc).map_err(CalendarError::Domain)?),
    None => None,
  };
  let refresh_token = match account.refresh_token_encrypted.as_deref() {
    Some(enc) => Some(decrypt_token(&private_key, enc).map_err(CalendarError::Domain)?),
    None => None,
  };
  if let Some(ref token) = access_token
    && account
      .expires_at
      .is_some_and(|exp| exp > Utc::now() + Duration::seconds(TOKEN_REFRESH_SKEW_SECS))
  {
    return Ok(Some(token.clone()));
  }
  let Some(refresh) = refresh_token else {
    return Ok(access_token);
  };
  if account.provider != CalendarProviderName::Google {
    return Ok(access_token);
  }
  let provider = GoogleCalendarProvider::new(google_cfg.clone());
  let refreshed = provider.refresh_tokens(&refresh).await?;
  let saved = if let Some((sub_id, claimed_until)) = claim {
    update_tokens_under_claim(
      service,
      sub_id,
      claimed_until,
      &account.id,
      &refreshed.access_token,
      refreshed.refresh_token.as_deref().unwrap_or(&refresh),
      refreshed.expires_at,
      refreshed.scope.as_deref(),
    )
    .await?
  } else {
    service
      .update_account_tokens(
        &account.id,
        TokenPatch::Set(refreshed.access_token.clone()),
        TokenPatch::Set(refreshed.refresh_token.unwrap_or(refresh)),
        Some(refreshed.expires_at),
        Some(refreshed.scope),
        Some("active".to_owned()),
        Some(None),
      )
      .await?;
    true
  };
  if !saved {
    return Ok(None);
  }
  Ok(Some(refreshed.access_token))
}
#[allow(clippy::too_many_arguments)]
async fn fetch_events_from_provider(
  provider: CalendarProviderName,
  configs: &super::EffectiveCalendarConfigs,
  account: &CalendarAccountRecord,
  access_token: &str,
  calendar_id: &str,
  sync_token: Option<&str>,
  time_min: Option<&str>,
  time_max: Option<&str>,
) -> Result<CalendarProviderListEventsResult, CalendarError> {
  match provider {
    CalendarProviderName::Google => {
      let g = GoogleCalendarProvider::new(configs.google.clone());
      g.list_events(access_token, calendar_id, sync_token, time_min, time_max)
        .await
    }
    CalendarProviderName::CalDAV => {
      let c = CaldavCalendarProvider::new(configs.caldav.clone());
      c.list_events(account, access_token, calendar_id, sync_token, time_min, time_max)
        .await
    }
  }
}
async fn reset_sync_token_under_claim(
  service: &CalendarService,
  subscription_id: &str,
  claimed_until: DateTime<Utc>,
) -> Result<bool, CalendarError> {
  let mut tx = service
    .begin_tx(WorkloadTier::InteractiveWrite, "begin reset sync_token")
    .await?;
  if !lock_and_verify_claim(tx.tx_mut(), subscription_id, claimed_until).await? {
    return Ok(false);
  }
  sqlx::query("UPDATE calendar_subscriptions SET sync_token = NULL, updated_at = clock_timestamp() WHERE id = $1")
    .bind(subscription_id)
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(internal_err("reset sync_token"))?;
  tx.commit().await.map_err(internal_err("commit reset sync_token"))?;
  Ok(true)
}
#[allow(clippy::too_many_arguments)]
async fn update_tokens_under_claim(
  service: &CalendarService,
  subscription_id: &str,
  claimed_until: DateTime<Utc>,
  account_id: &str,
  access_token: &str,
  refresh_token: &str,
  expires_at: Option<DateTime<Utc>>,
  scope: Option<&str>,
) -> Result<bool, CalendarError> {
  let private_key = service.try_effective_private_key().await?;
  let enc_access = super::crypto::encrypt_token(&private_key, access_token).map_err(CalendarError::Domain)?;
  let enc_refresh = super::crypto::encrypt_token(&private_key, refresh_token).map_err(CalendarError::Domain)?;
  let mut tx = service
    .begin_tx(WorkloadTier::InteractiveWrite, "begin update_tokens_under_claim")
    .await?;
  if !lock_and_verify_claim(tx.tx_mut(), subscription_id, claimed_until).await? {
    return Ok(false);
  }
  sqlx::query(
    r#"UPDATE calendar_accounts
       SET access_token = $2, refresh_token = $3, expires_at = $4, scope = $5,
           status = 'active', last_error = NULL, updated_at = clock_timestamp()
       WHERE id = $1"#,
  )
  .bind(account_id)
  .bind(&enc_access)
  .bind(&enc_refresh)
  .bind(expires_at)
  .bind(scope)
  .execute(&mut **tx.tx_mut())
  .await
  .map_err(internal_err("update account tokens"))?;
  tx.commit()
    .await
    .map_err(internal_err("commit update_tokens_under_claim"))?;
  Ok(true)
}
async fn persist_events_under_claim(
  service: &CalendarService,
  subscription_id: &str,
  claimed_until: DateTime<Utc>,
  fallback_tz: Option<&str>,
  result: &CalendarProviderListEventsResult,
) -> Result<bool, CalendarError> {
  let mut tx = service
    .begin_tx(WorkloadTier::LongQuery, "begin persist_events_under_claim")
    .await?;
  if !lock_and_verify_claim(tx.tx_mut(), subscription_id, claimed_until).await? {
    return Ok(false);
  }
  let mut cancelled_ids: Vec<String> = Vec::new();
  let mut failed_event_ids: Vec<String> = Vec::new();
  for event in &result.events {
    if event.status.as_deref() == Some("cancelled") {
      cancelled_ids.push(event.id.clone());
      continue;
    }
    let Some(ResolvedEventTimes {
      start_at_utc,
      end_at_utc,
      all_day,
      orig_tz,
    }) = resolve_event_times(event, fallback_tz)?
    else {
      failed_event_ids.push(event.id.clone());
      continue;
    };
    let recurrence_id = event
      .original_start_time
      .as_ref()
      .and_then(|t| {
        t.date_time
          .as_deref()
          .filter(|s| !s.is_empty())
          .or_else(|| t.date.as_deref().filter(|s| !s.is_empty()))
      })
      .map(str::to_owned)
      .unwrap_or_else(|| event.id.clone());
    let provider_updated_at = event
      .updated
      .as_deref()
      .filter(|s| !s.is_empty())
      .map(|u| parse_js_iso_datetime(u).ok_or_else(|| CalendarError::Internal("Invalid time value".to_owned())))
      .transpose()?;
    sqlx::query(
      r#"INSERT INTO calendar_events (
           id, subscription_id, external_event_id, recurrence_id, etag, status,
           title, description, location, start_at_utc, end_at_utc, original_timezone,
           all_day, provider_updated_at, raw, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, clock_timestamp(), clock_timestamp())
         ON CONFLICT (subscription_id, external_event_id, recurrence_id) DO UPDATE SET
           etag = EXCLUDED.etag, status = EXCLUDED.status, title = EXCLUDED.title,
           description = EXCLUDED.description, location = EXCLUDED.location,
           start_at_utc = EXCLUDED.start_at_utc, end_at_utc = EXCLUDED.end_at_utc,
           original_timezone = EXCLUDED.original_timezone, all_day = EXCLUDED.all_day,
           provider_updated_at = EXCLUDED.provider_updated_at, raw = EXCLUDED.raw, updated_at = clock_timestamp()"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(subscription_id)
    .bind(&event.id)
    .bind(&recurrence_id)
    .bind(&event.etag)
    .bind(&event.status)
    .bind(&event.summary)
    .bind(&event.description)
    .bind(&event.location)
    .bind(start_at_utc)
    .bind(end_at_utc)
    .bind(&orig_tz)
    .bind(all_day)
    .bind(provider_updated_at)
    .bind(event.raw.to_json_value())
    .execute(&mut **tx.tx_mut())
    .await
    .map_err(internal_err("upsert calendar_event"))?;
  }
  if !failed_event_ids.is_empty() {
    tracing::warn!(subscription_id = %subscription_id, failed_count = failed_event_ids.len(), "skipped unmappable calendar events");
  }
  if !cancelled_ids.is_empty() {
    sqlx::query("DELETE FROM calendar_events WHERE subscription_id = $1 AND external_event_id = ANY($2)")
      .bind(subscription_id)
      .bind(&cancelled_ids)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(internal_err("delete cancelled calendar_events"))?;
  }
  if let Some(ref next_token) = result.next_sync_token {
    sqlx::query("UPDATE calendar_subscriptions SET sync_token = $2, updated_at = clock_timestamp() WHERE id = $1")
      .bind(subscription_id)
      .bind(next_token)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(internal_err("update sync_token"))?;
  }
  tx.commit()
    .await
    .map_err(internal_err("commit persist_events_under_claim"))?;
  Ok(true)
}
async fn is_claim_still_valid(
  service: &CalendarService,
  subscription_id: &str,
  claimed_until: DateTime<Utc>,
) -> Result<bool, CalendarError> {
  let mut conn = service.read_conn("check calendar claim active").await?;
  let exists: bool = sqlx::query_scalar(
    r#"SELECT EXISTS(
         SELECT 1 FROM calendar_subscriptions s
         JOIN calendar_accounts a ON a.id = s.account_id
         WHERE s.id = $1 AND s.enabled AND a.status = 'active'
           AND s.sync_claimed_until = $2 AND s.sync_claimed_until > clock_timestamp()
       )"#,
  )
  .bind(subscription_id)
  .bind(claimed_until)
  .fetch_one(&mut *conn)
  .await
  .map_err(internal_err("check calendar claim active"))?;
  Ok(exists)
}
async fn ensure_google_webhook_channel(
  service: &CalendarService,
  google_cfg: &super::google::CalendarGoogleConfig,
  subscription: &CalendarSubscriptionRecord,
  access_token: &str,
  address: &str,
  claimed_until: DateTime<Utc>,
) -> Result<(), CalendarError> {
  let db_now = db_clock_timestamp(service).await?;
  if subscription
    .channel_expiration
    .is_some_and(|exp| exp > db_now + Duration::hours(24))
  {
    return Ok(());
  }
  if !is_claim_still_valid(service, &subscription.id, claimed_until).await? {
    return Ok(());
  }
  let token = service.try_webhook_token_from_config(google_cfg).await?;
  let provider = GoogleCalendarProvider::new(google_cfg.clone());
  if let (Some(ch_id), Some(res_id)) = (
    subscription.custom_channel_id.as_deref(),
    subscription.custom_resource_id.as_deref(),
  ) {
    if let Err(err) = provider.stop_channel(access_token, ch_id, res_id).await
      && !matches!(err, CalendarError::ProviderRequest { status: 404, .. })
    {
      return Err(err);
    }
    if !update_channel_under_claim(service, &subscription.id, claimed_until, None, None, None).await? {
      return Ok(());
    }
  }
  let channel_id = Uuid::new_v4().to_string();
  match provider
    .watch_calendar(
      access_token,
      &subscription.external_calendar_id,
      address,
      Some(&token),
      &channel_id,
    )
    .await
  {
    Ok(res) => {
      let saved = update_channel_under_claim(
        service,
        &subscription.id,
        claimed_until,
        Some(&res.channel_id),
        Some(&res.resource_id),
        res.expiration,
      )
      .await?;
      if !saved {
        let _ = provider
          .stop_channel(access_token, &res.channel_id, &res.resource_id)
          .await;
      }
      Ok(())
    }
    Err(CalendarError::ProviderRequest {
      status: 400,
      ref message,
    }) if message.contains("pushNotSupportedForRequestedResource") => {
      let far_future = DateTime::parse_from_rfc3339("9999-12-31T23:59:59.999Z")
        .ok()
        .map(|d| d.with_timezone(&Utc));
      let _ = update_channel_under_claim(service, &subscription.id, claimed_until, None, None, far_future).await?;
      Ok(())
    }
    Err(err) => Err(err),
  }
}
async fn update_channel_under_claim(
  service: &CalendarService,
  subscription_id: &str,
  claimed_until: DateTime<Utc>,
  channel_id: Option<&str>,
  resource_id: Option<&str>,
  expiration: Option<DateTime<Utc>>,
) -> Result<bool, CalendarError> {
  let mut tx = service
    .begin_tx(WorkloadTier::InteractiveWrite, "begin update_channel")
    .await?;
  if !lock_and_verify_claim(tx.tx_mut(), subscription_id, claimed_until).await? {
    return Ok(false);
  }
  sqlx::query(
    "UPDATE calendar_subscriptions SET custom_channel_id = $2, custom_resource_id = $3, channel_expiration = $4, updated_at = clock_timestamp() WHERE id = $1",
  )
  .bind(subscription_id)
  .bind(channel_id)
  .bind(resource_id)
  .bind(expiration)
  .execute(&mut **tx.tx_mut())
  .await
  .map_err(internal_err("update_channel"))?;
  tx.commit().await.map_err(internal_err("commit update_channel"))?;
  Ok(true)
}
async fn handle_sync_failure(
  service: &CalendarService,
  subscription: &CalendarSubscriptionRecord,
  account: &CalendarAccountRecord,
  claimed_until: DateTime<Utc>,
  err: &CalendarError,
  access_token: Option<&str>,
  disable_on_not_found: bool,
) -> Result<(), CalendarError> {
  if disable_on_not_found && matches!(err, CalendarError::ProviderRequest { status: 404, .. }) {
    if account.provider == CalendarProviderName::Google
      && let (Some(token), Some(ch_id), Some(res_id)) = (
        access_token,
        subscription.custom_channel_id.as_deref(),
        subscription.custom_resource_id.as_deref(),
      )
      && let Ok(configs) = service.load_configs().await
    {
      let _ = GoogleCalendarProvider::new(configs.google)
        .stop_channel(token, ch_id, res_id)
        .await;
    }
    let mut tx = service
      .begin_tx(WorkloadTier::InteractiveWrite, "begin disable_and_purge")
      .await?;
    if lock_and_verify_claim(tx.tx_mut(), &subscription.id, claimed_until).await? {
      sqlx::query(
        r#"UPDATE calendar_subscriptions
           SET enabled = false, sync_token = NULL, sync_retry_count = 0, custom_channel_id = NULL,
               custom_resource_id = NULL, channel_expiration = NULL, sync_claimed_until = NULL, updated_at = clock_timestamp()
           WHERE id = $1"#,
      )
      .bind(&subscription.id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(internal_err("disable subscription"))?;
      sqlx::query("DELETE FROM calendar_events WHERE subscription_id = $1")
        .bind(&subscription.id)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(internal_err("purge subscription events"))?;
      tx.commit().await.map_err(internal_err("commit disable_and_purge"))?;
    }
    return Ok(());
  }
  let is_token_invalid =
    matches!(err, CalendarError::ProviderRequest { status: 401, .. }) || err.to_string().contains("invalid_grant");
  if is_token_invalid {
    let mut tx = service
      .begin_tx(WorkloadTier::InteractiveWrite, "begin invalidate_and_purge")
      .await?;
    if lock_and_verify_claim(tx.tx_mut(), &subscription.id, claimed_until).await? {
      let truncated = truncate_calendar_error(&err.to_string());
      sqlx::query("UPDATE calendar_accounts SET status = 'invalid', last_error = $2, updated_at = clock_timestamp() WHERE id = $1")
        .bind(&account.id)
        .bind(&truncated)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(internal_err("invalidate account"))?;
      sqlx::query("SELECT id FROM calendar_subscriptions WHERE account_id = $1 ORDER BY id ASC FOR UPDATE")
        .bind(&account.id)
        .fetch_all(&mut **tx.tx_mut())
        .await
        .map_err(internal_err("lock account subscriptions"))?;
      sqlx::query("DELETE FROM calendar_events WHERE subscription_id IN (SELECT id FROM calendar_subscriptions WHERE account_id = $1)")
        .bind(&account.id)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(internal_err("purge account events"))?;
      sqlx::query("UPDATE calendar_subscriptions SET sync_token = NULL, sync_claimed_until = NULL, updated_at = clock_timestamp() WHERE account_id = $1")
        .bind(&account.id)
        .execute(&mut **tx.tx_mut())
        .await
        .map_err(internal_err("clear account sync tokens"))?;
      tx.commit().await.map_err(internal_err("commit invalidate_and_purge"))?;
    }
    return Ok(());
  }
  let attempt = subscription.sync_retry_count.saturating_add(1);
  let shift = u32::try_from(attempt.saturating_sub(1)).unwrap_or(0).min(10);
  let delay_secs = SYNC_FAILURE_BACKOFF_BASE_SECS
    .saturating_mul(1i64 << shift)
    .min(SYNC_FAILURE_BACKOFF_MAX_SECS);
  let next_retry = db_clock_timestamp(service).await? + Duration::seconds(delay_secs);
  complete_sync(
    service,
    &subscription.id,
    claimed_until,
    subscription.last_sync_at,
    next_retry,
    attempt,
  )
  .await
}
async fn complete_sync(
  service: &CalendarService,
  subscription_id: &str,
  claimed_until: DateTime<Utc>,
  last_sync_at: Option<DateTime<Utc>>,
  next_sync_at: DateTime<Utc>,
  sync_retry_count: i32,
) -> Result<(), CalendarError> {
  let mut conn = service.write_conn("acquire complete_sync").await?;
  sqlx::query(
    r#"UPDATE calendar_subscriptions
       SET last_sync_at = $2,
           next_sync_at = CASE WHEN sync_claimed_until IS NOT NULL AND next_sync_at < sync_claimed_until THEN next_sync_at ELSE $3 END,
           sync_retry_count = $4, sync_claimed_until = NULL, updated_at = clock_timestamp()
       WHERE id = $1 AND sync_claimed_until = $5 AND sync_claimed_until > clock_timestamp()"#,
  )
  .bind(subscription_id)
  .bind(last_sync_at)
  .bind(next_sync_at)
  .bind(sync_retry_count)
  .bind(claimed_until)
  .execute(&mut *conn)
  .await
  .map_err(internal_err("complete_sync"))?;
  Ok(())
}
async fn lock_and_verify_claim(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  subscription_id: &str,
  claimed_until: DateTime<Utc>,
) -> Result<bool, CalendarError> {
  let active_account: Option<String> = sqlx::query_scalar(
    r#"SELECT account.id FROM calendar_accounts account
       JOIN calendar_subscriptions subscription ON subscription.account_id = account.id
       WHERE subscription.id = $1 AND account.status = 'active' FOR UPDATE OF account"#,
  )
  .bind(subscription_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(internal_err("lock calendar account"))?;
  if active_account.is_none() {
    return Ok(false);
  }
  let valid_claim: Option<String> = sqlx::query_scalar(
    "SELECT id FROM calendar_subscriptions WHERE id = $1 AND enabled AND sync_claimed_until = $2 AND sync_claimed_until > clock_timestamp() FOR UPDATE",
  )
  .bind(subscription_id)
  .bind(claimed_until)
  .fetch_optional(&mut **tx)
  .await
  .map_err(internal_err("lock calendar subscription claim"))?;
  Ok(valid_claim.is_some())
}
fn resolve_event_time(
  time: &CalendarProviderEventTime,
  fallback_tz: Option<&str>,
) -> Result<Option<(DateTime<Utc>, bool)>, CalendarError> {
  let inv = || CalendarError::Internal("Invalid time value".to_owned());
  if let Some(dt_str) = time.date_time.as_deref().filter(|s| !s.is_empty()) {
    let dt = parse_js_iso_datetime(dt_str).ok_or_else(inv)?;
    return Ok(Some((dt, false)));
  }
  let Some(date_str) = time.date.as_deref().filter(|s| !s.is_empty()) else {
    return Ok(None);
  };
  let parse_js_num = |seg: &str| -> Option<f64> {
    let t = seg.trim_matches(|c: char| {
      matches!(
        c,
        '\u{0009}'..='\u{000D}'
          | '\u{0020}'
          | '\u{00A0}'
          | '\u{1680}'
          | '\u{2000}'..='\u{200A}'
          | '\u{2028}'
          | '\u{2029}'
          | '\u{202F}'
          | '\u{205F}'
          | '\u{3000}'
          | '\u{FEFF}'
      )
    });
    if t.is_empty() {
      return Some(0.0);
    }
    if !t.is_ascii() {
      return None;
    }
    for (p1, p2, radix) in [("0x", "0X", 16u32), ("0b", "0B", 2u32), ("0o", "0O", 8u32)] {
      if let Some(rest) = t.strip_prefix(p1).or_else(|| t.strip_prefix(p2)) {
        if rest.is_empty() {
          return None;
        }
        let mut acc = 0.0f64;
        for b in rest.bytes() {
          let digit = (b as char).to_digit(radix)?;
          acc = acc * f64::from(radix) + f64::from(digit);
        }
        return acc.is_finite().then_some(acc);
      }
    }
    let body = t.strip_prefix(['+', '-']).unwrap_or(t);
    let mant = if let Some(idx) = body.find(['e', 'E']) {
      let ed = body[idx + 1..].strip_prefix(['+', '-']).unwrap_or(&body[idx + 1..]);
      if ed.is_empty() || !ed.bytes().all(|b| b.is_ascii_digit()) {
        return None;
      }
      &body[..idx]
    } else {
      body
    };
    let valid_mant = if let Some((l, r)) = mant.split_once('.') {
      !(l.is_empty() && r.is_empty()) && l.bytes().all(|b| b.is_ascii_digit()) && r.bytes().all(|b| b.is_ascii_digit())
    } else {
      !mant.is_empty() && mant.bytes().all(|b| b.is_ascii_digit())
    };
    if !valid_mant {
      return None;
    }
    t.parse::<f64>().ok().filter(|f| f.is_finite())
  };
  let mut parts = date_str.split('-');
  let (Some(y), Some(m), Some(d)) = (
    parts.next().and_then(parse_js_num),
    parts.next().and_then(parse_js_num),
    parts.next().and_then(parse_js_num),
  ) else {
    return Ok(None);
  };
  let tz = time.time_zone.as_deref().or(fallback_tz).unwrap_or("UTC");
  let Ok(Some(dt)) = try_offset_at_utc_guess_ymd_f64(y, m - 1.0, d, Some(tz)) else {
    return Ok(None);
  };
  Ok(Some((dt, true)))
}
struct ResolvedEventTimes {
  start_at_utc: DateTime<Utc>,
  end_at_utc: DateTime<Utc>,
  all_day: bool,
  orig_tz: Option<String>,
}
fn resolve_event_times(
  event: &CalendarProviderEvent,
  fallback_tz: Option<&str>,
) -> Result<Option<ResolvedEventTimes>, CalendarError> {
  let Some((start_at_utc, start_all_day)) = resolve_event_time(&event.start, fallback_tz)? else {
    return Ok(None);
  };
  let Some((end_at_utc, end_all_day)) = resolve_event_time(&event.end, fallback_tz)? else {
    return Ok(None);
  };
  let orig_tz = event
    .start
    .time_zone
    .clone()
    .or_else(|| event.end.time_zone.clone())
    .or_else(|| fallback_tz.map(str::to_owned));
  Ok(Some(ResolvedEventTimes {
    start_at_utc,
    end_at_utc,
    all_day: start_all_day || end_all_day,
    orig_tz,
  }))
}
