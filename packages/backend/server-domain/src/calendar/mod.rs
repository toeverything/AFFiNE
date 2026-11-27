//! Calendar integration shared domain types and provider adapters (Google
//! Calendar OAuth, CalDAV discovery, iCalendar parsing, token encryption,
//! and Redis OAuth state management).
pub mod caldav;
pub mod crypto;
pub mod google;
pub mod ical;
pub mod oauth;
pub mod sync;
use self::caldav::{CaldavCalendarProvider, CalendarCaldavConfig, CalendarCaldavProviderPreset};
use self::crypto::{decrypt_token, encrypt_token};
use self::google::{CalendarGoogleConfig, GoogleCalendarProvider};
use self::sync::{SyncSubscriptionOptions, ensure_access_token, sync_subscription};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use server_db::{ServerDb, TieredConn, TieredTx, WorkloadTier};
use server_types::DomainError;
use sqlx::Row;
use std::collections::HashMap;
use std::fmt;
use std::sync::{Arc, Mutex};
use subtle::ConstantTimeEq as _;
use uuid::Uuid;
const DEFAULT_REFRESH_INTERVAL_MINUTES: i32 = 30;
pub const MAX_CALENDAR_ERROR_LEN: usize = 4096;
pub fn truncate_calendar_error(msg: &str) -> String {
  if msg.chars().count() <= MAX_CALENDAR_ERROR_LEN {
    msg.to_owned()
  } else {
    msg.chars().take(MAX_CALENDAR_ERROR_LEN).collect()
  }
}
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CalendarProviderName {
  Google,
  #[serde(rename = "caldav")]
  CalDAV,
}
impl CalendarProviderName {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Google => "google",
      Self::CalDAV => "caldav",
    }
  }
  pub fn parse(raw: &str) -> Option<Self> {
    match raw.trim().to_ascii_lowercase().as_str() {
      "google" => Some(Self::Google),
      "caldav" => Some(Self::CalDAV),
      _ => None,
    }
  }
}
/// Three-state patch for encrypted credential fields: omit (`Keep`) to preserve
/// the existing DB value, `Set` to encrypt and store a new value, or `Clear`
/// to explicitly wipe the stored column to `NULL`.
#[derive(Clone, Default, Eq, PartialEq)]
pub enum TokenPatch {
  #[default]
  Keep,
  Set(String),
  Clear,
}
impl fmt::Debug for TokenPatch {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Self::Keep => f.write_str("TokenPatch::Keep"),
      Self::Set(_) => f.write_str("TokenPatch::Set([REDACTED])"),
      Self::Clear => f.write_str("TokenPatch::Clear"),
    }
  }
}
#[derive(Debug, thiserror::Error)]
pub enum CalendarError {
  #[error("{message}")]
  BadRequest { code: String, message: String },
  #[error("calendar provider request failed ({status}): {message}")]
  ProviderRequest { status: u16, message: String },
  #[error("calendar sync token invalid: {0}")]
  SyncTokenInvalid(String),
  #[error(transparent)]
  Domain(#[from] DomainError),
  #[error("internal calendar error: {0}")]
  Internal(String),
}
impl CalendarError {
  pub fn bad_request(code: impl Into<String>, message: impl Into<String>) -> Self {
    Self::BadRequest {
      code: code.into(),
      message: message.into(),
    }
  }
}
#[derive(Clone)]
pub struct CalendarProviderTokens {
  pub access_token: String,
  pub refresh_token: Option<String>,
  pub expires_at: Option<DateTime<Utc>>,
  pub scope: Option<String>,
  pub token_type: Option<String>,
}
impl fmt::Debug for CalendarProviderTokens {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("CalendarProviderTokens")
      .field("access_token", &"[REDACTED]")
      .field("refresh_token", &self.refresh_token.as_ref().map(|_| "[REDACTED]"))
      .field("expires_at", &self.expires_at)
      .field("scope", &self.scope)
      .field("token_type", &self.token_type)
      .finish()
  }
}
#[derive(Clone, Debug)]
pub struct CalendarAccountProfile {
  pub provider_account_id: String,
  pub display_name: Option<String>,
  pub email: Option<String>,
}
#[derive(Clone, Debug)]
pub struct CalendarProviderCalendar {
  pub id: String,
  pub summary: Option<String>,
  pub time_zone: Option<String>,
  pub color_id: Option<String>,
  pub primary: bool,
}
#[derive(Clone, Debug, Default)]
pub struct CalendarProviderEventTime {
  pub date_time: Option<String>,
  pub date: Option<String>,
  pub time_zone: Option<String>,
}
#[derive(Clone, Debug)]
pub enum CalendarProviderEventRaw {
  Json(Value),
  Ical {
    ical: Arc<str>,
    href: String,
    etag: Option<String>,
    uid: String,
  },
}
impl CalendarProviderEventRaw {
  pub fn to_json_value(&self) -> Value {
    match self {
      Self::Json(v) => v.clone(),
      Self::Ical { ical, href, etag, uid } => serde_json::json!({
        "ical": ical.as_ref(),
        "href": href,
        "etag": etag,
        "uid": uid,
      }),
    }
  }
}
#[derive(Clone, Debug)]
pub struct CalendarProviderEvent {
  pub id: String,
  pub status: Option<String>,
  pub etag: Option<String>,
  pub summary: Option<String>,
  pub description: Option<String>,
  pub location: Option<String>,
  pub updated: Option<String>,
  pub recurring_event_id: Option<String>,
  pub original_start_time: Option<CalendarProviderEventTime>,
  pub start: CalendarProviderEventTime,
  pub end: CalendarProviderEventTime,
  pub raw: CalendarProviderEventRaw,
}
#[derive(Clone, Debug, Default)]
pub struct CalendarProviderListEventsResult {
  pub events: Vec<CalendarProviderEvent>,
  pub next_sync_token: Option<String>,
}
#[derive(Clone, Debug)]
pub struct CalendarProviderWatchResult {
  pub channel_id: String,
  pub resource_id: String,
  pub expiration: Option<DateTime<Utc>>,
}
#[derive(Clone, Debug)]
pub struct EffectiveCalendarConfigs {
  pub google: CalendarGoogleConfig,
  pub caldav: CalendarCaldavConfig,
}
#[derive(Clone, Debug)]
pub struct CalendarAccountRecord {
  pub id: String,
  pub user_id: String,
  pub provider: CalendarProviderName,
  pub provider_account_id: String,
  pub display_name: Option<String>,
  pub email: Option<String>,
  pub provider_preset_id: Option<String>,
  pub server_url: Option<String>,
  pub principal_url: Option<String>,
  pub calendar_home_url: Option<String>,
  pub username: Option<String>,
  pub auth_type: Option<String>,
  pub access_token_encrypted: Option<String>,
  pub refresh_token_encrypted: Option<String>,
  pub expires_at: Option<DateTime<Utc>>,
  pub scope: Option<String>,
  pub status: String,
  pub last_error: Option<String>,
  pub refresh_interval_minutes: i32,
  pub calendars_count: i32,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
}
#[derive(Clone, Debug)]
pub struct CalendarSubscriptionRecord {
  pub id: String,
  pub account_id: String,
  pub provider: CalendarProviderName,
  pub external_calendar_id: String,
  pub display_name: Option<String>,
  pub timezone: Option<String>,
  pub color: Option<String>,
  pub enabled: bool,
  pub sync_token: Option<String>,
  pub last_sync_at: Option<DateTime<Utc>>,
  pub next_sync_at: DateTime<Utc>,
  pub sync_retry_count: i32,
  pub sync_claimed_until: Option<DateTime<Utc>>,
  pub custom_channel_id: Option<String>,
  pub custom_resource_id: Option<String>,
  pub channel_expiration: Option<DateTime<Utc>>,
}
#[derive(Clone, Debug)]
pub struct WorkspaceCalendarItemRecord {
  pub id: String,
  pub subscription_id: String,
  pub sort_order: Option<i32>,
  pub color_override: Option<String>,
  pub enabled: bool,
}
#[derive(Clone, Debug)]
pub struct WorkspaceCalendarRecord {
  pub id: String,
  pub workspace_id: String,
  pub created_by_user_id: String,
  pub display_name_override: Option<String>,
  pub color_override: Option<String>,
  pub enabled: bool,
  pub items: Vec<WorkspaceCalendarItemRecord>,
}
#[derive(Clone, Debug)]
pub struct WorkspaceCalendarItemPatch {
  pub subscription_id: String,
  pub sort_order: Option<i32>,
  pub color_override: Option<String>,
}
#[derive(Clone, Debug)]
pub struct CalendarEventRecord {
  pub id: String,
  pub subscription_id: String,
  pub external_event_id: String,
  pub recurrence_id: Option<String>,
  pub status: Option<String>,
  pub title: Option<String>,
  pub description: Option<String>,
  pub location: Option<String>,
  pub start_at_utc: DateTime<Utc>,
  pub end_at_utc: DateTime<Utc>,
  pub original_timezone: Option<String>,
  pub all_day: bool,
}
#[derive(Clone)]
pub struct LinkCaldavInput {
  pub provider_preset_id: String,
  pub username: String,
  pub password: String,
  pub display_name: Option<String>,
}
impl fmt::Debug for LinkCaldavInput {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("LinkCaldavInput")
      .field("provider_preset_id", &self.provider_preset_id)
      .field("username", &self.username)
      .field("password", &"[REDACTED]")
      .field("display_name", &self.display_name)
      .finish()
  }
}
#[derive(Clone)]
pub struct UpsertCalendarAccountParams {
  pub user_id: String,
  pub provider: CalendarProviderName,
  pub provider_account_id: String,
  pub display_name: Option<String>,
  pub email: Option<String>,
  pub provider_preset_id: Option<String>,
  pub server_url: Option<String>,
  pub principal_url: Option<String>,
  pub calendar_home_url: Option<String>,
  pub username: Option<String>,
  pub auth_type: Option<String>,
  pub access_token: TokenPatch,
  pub refresh_token: TokenPatch,
  pub expires_at: Option<DateTime<Utc>>,
  pub scope: Option<String>,
  pub status: String,
  pub last_error: Option<String>,
  pub refresh_interval_minutes: i32,
}
impl fmt::Debug for UpsertCalendarAccountParams {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("UpsertCalendarAccountParams")
      .field("user_id", &self.user_id)
      .field("provider", &self.provider)
      .field("provider_account_id", &self.provider_account_id)
      .field("email", &self.email)
      .field("access_token", &self.access_token)
      .field("refresh_token", &self.refresh_token)
      .field("status", &self.status)
      .finish_non_exhaustive()
  }
}
/// Pure canonical domain service for calendar accounts, subscriptions,
/// workspace calendar bindings, and upstream synchronization.
#[derive(Clone)]
pub struct CalendarService {
  db: ServerDb,
  private_key: String,
  external_url: String,
  generated_webhook_token: Arc<Mutex<Option<String>>>,
  config_override: Option<EffectiveCalendarConfigs>,
  file_json: Option<Value>,
  app_config: Option<crate::app_config::AppConfigService>,
}
impl CalendarService {
  pub fn new(db: ServerDb, private_key: String, external_url: String) -> Self {
    Self {
      db,
      private_key,
      external_url,
      generated_webhook_token: Arc::new(Mutex::new(None)),
      config_override: None,
      file_json: None,
      app_config: None,
    }
  }
  /// Wires `AppConfigService` so DB `crypto.privateKey` overrides take effect dynamically.
  pub fn with_app_config(mut self, app_config: crate::app_config::AppConfigService) -> Self {
    self.app_config = Some(app_config);
    self
  }
  /// Provides `config.json` baseline values (`calendar.google`, `calendar.caldav`, `crypto.privateKey`).
  pub fn with_file_json(mut self, file_json: Option<Value>) -> Self {
    self.file_json = file_json;
    self
  }
  /// Shares a process-wide generated webhook verification token across requests.
  pub fn with_shared_webhook_token(mut self, token: Arc<Mutex<Option<String>>>) -> Self {
    self.generated_webhook_token = token;
    self
  }
  /// Injects explicit calendar provider configs (primarily for integration tests
  /// pointing Google/CalDAV endpoints at local mock servers).
  pub fn with_config_override(mut self, configs: EffectiveCalendarConfigs) -> Self {
    self.config_override = Some(configs);
    self
  }
  /// Resolves the effective `crypto.privateKey` preserving exact raw bytes (no `.trim()`),
  /// reading the internal unredacted cache so DB `app_configs` overrides take effect dynamically.
  pub async fn effective_private_key(&self) -> String {
    if let Some(ref cfg_svc) = self.app_config
      && let Ok(Some(raw)) = cfg_svc.get_internal_private_key().await
    {
      return raw;
    }
    self.private_key.clone()
  }
  pub(crate) async fn read_conn(&self, ctx: &'static str) -> Result<TieredConn, CalendarError> {
    self
      .db
      .acquire_tiered(WorkloadTier::InteractiveRead)
      .await
      .map_err(internal_err(ctx))
  }
  pub(crate) async fn write_conn(&self, ctx: &'static str) -> Result<TieredConn, CalendarError> {
    self
      .db
      .acquire_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(internal_err(ctx))
  }
  pub(crate) async fn begin_tx(&self, tier: WorkloadTier, ctx: &'static str) -> Result<TieredTx<'_>, CalendarError> {
    self.db.begin_tiered(tier).await.map_err(internal_err(ctx))
  }
  async fn encrypt_patch_async(&self, patch: &TokenPatch) -> Result<Option<String>, CalendarError> {
    match patch {
      TokenPatch::Set(v) => {
        let key = self.effective_private_key().await;
        Ok(Some(encrypt_token(&key, v).map_err(CalendarError::Domain)?))
      }
      TokenPatch::Keep | TokenPatch::Clear => Ok(None),
    }
  }
  pub fn callback_url(&self) -> String {
    self.callback_url_for(&self.external_url)
  }
  pub fn callback_url_for(&self, external_url: &str) -> String {
    format!("{}/api/calendar/oauth/callback", external_url.trim_end_matches('/'))
  }
  pub async fn webhook_token_from_config(&self, google: &CalendarGoogleConfig) -> String {
    if let Some(ref configured) = google.webhook_verification_token
      && !configured.is_empty()
    {
      return configured.clone();
    }
    let key = self.effective_private_key().await;
    if !key.is_empty() {
      use hmac::{Hmac, Mac as _};
      if let Ok(mut mac) = Hmac::<sha2::Sha256>::new_from_slice(key.as_bytes()) {
        mac.update(b"affine:calendar:google-webhook-token");
        return hex::encode(mac.finalize().into_bytes());
      }
    }
    if let Ok(guard) = self.generated_webhook_token.lock()
      && let Some(ref cached) = *guard
      && !cached.is_empty()
    {
      return cached.clone();
    }
    let derived = Uuid::new_v4().to_string();
    if let Ok(mut guard) = self.generated_webhook_token.lock() {
      *guard = Some(derived.clone());
    }
    derived
  }
  /// Verifies an incoming `x-goog-channel-token` header in constant time.
  pub async fn verify_webhook_token(&self, google: &CalendarGoogleConfig, provided: &str) -> bool {
    let expected = self.webhook_token_from_config(google).await;
    expected.is_empty()
      || (expected.len() == provided.len() && bool::from(expected.as_bytes().ct_eq(provided.as_bytes())))
  }
  pub fn webhook_address_from_config(&self, google: &CalendarGoogleConfig, provider: &str) -> Option<String> {
    let base = google.external_webhook_url.as_deref()?.trim();
    if base.is_empty() {
      return None;
    }
    url::Url::parse(base)
      .and_then(|u| u.join(&format!("/api/calendar/webhook/{provider}")))
      .ok()
      .map(String::from)
  }
  /// Loads unredacted `calendar.google` and `calendar.caldav` configuration from
  /// `public.app_configs` (or returns the test override when configured).
  pub async fn load_configs(&self) -> Result<EffectiveCalendarConfigs, CalendarError> {
    if let Some(ref ov) = self.config_override {
      return Ok(ov.clone());
    }
    let mut google = self
      .file_json
      .as_ref()
      .and_then(|v| v.pointer("/calendar/google"))
      .and_then(|v| serde_json::from_value::<CalendarGoogleConfig>(v.clone()).ok())
      .unwrap_or_default();
    let mut caldav = self
      .file_json
      .as_ref()
      .and_then(|v| v.pointer("/calendar/caldav"))
      .and_then(|v| serde_json::from_value::<CalendarCaldavConfig>(v.clone()).ok())
      .unwrap_or_default();
    let mut conn = self.read_conn("acquire calendar config read").await?;
    let rows = sqlx::query("SELECT id, value FROM app_configs WHERE id IN ('calendar.google', 'calendar.caldav')")
      .fetch_all(&mut *conn)
      .await
      .map_err(internal_err("load calendar app_configs"))?;
    for row in rows {
      let (id, val): (String, Value) = (row.get("id"), row.get("value"));
      if id == "calendar.google" {
        if let Ok(parsed) = serde_json::from_value(val) {
          google = parsed;
        }
      } else if id == "calendar.caldav"
        && let Ok(parsed) = serde_json::from_value(val)
      {
        caldav = parsed;
      }
    }
    Ok(EffectiveCalendarConfigs { google, caldav })
  }
  pub async fn list_available_providers(
    &self,
    user_id: Option<&str>,
  ) -> Result<Vec<CalendarProviderName>, CalendarError> {
    let configs = self.load_configs().await?;
    let mut out = Vec::new();
    if configs.google.is_configured()
      && self
        .can_link_provider_with_cfg(user_id, CalendarProviderName::Google, &configs)
        .await?
    {
      out.push(CalendarProviderName::Google);
    }
    if configs.caldav.is_configured() {
      out.push(CalendarProviderName::CalDAV);
    }
    Ok(out)
  }
  pub async fn list_caldav_presets(&self) -> Result<Vec<CalendarCaldavProviderPreset>, CalendarError> {
    let configs = self.load_configs().await?;
    Ok(if configs.caldav.enabled {
      configs.caldav.providers
    } else {
      Vec::new()
    })
  }
  pub async fn is_oauth_provider_available(&self, provider: CalendarProviderName) -> Result<bool, CalendarError> {
    let configs = self.load_configs().await?;
    Ok(provider == CalendarProviderName::Google && configs.google.is_configured())
  }
  async fn can_link_provider_with_cfg(
    &self,
    user_id: Option<&str>,
    provider: CalendarProviderName,
    configs: &EffectiveCalendarConfigs,
  ) -> Result<bool, CalendarError> {
    if provider != CalendarProviderName::Google || configs.google.allows_new_accounts() {
      return Ok(true);
    }
    let Some(uid) = user_id else {
      return Ok(false);
    };
    let mut conn = self.read_conn("acquire can_link_provider").await?;
    sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM calendar_accounts WHERE user_id = $1 AND provider = $2)")
      .bind(uid)
      .bind(provider.as_str())
      .fetch_one(&mut *conn)
      .await
      .map_err(internal_err("check existing calendar account"))
  }
  pub async fn assert_can_link_provider(
    &self,
    user_id: &str,
    provider: CalendarProviderName,
  ) -> Result<(), CalendarError> {
    let configs = self.load_configs().await?;
    if self
      .can_link_provider_with_cfg(Some(user_id), provider, &configs)
      .await?
    {
      return Ok(());
    }
    Err(CalendarError::bad_request(
      "calendar_provider_link_disabled",
      format!("{} calendar account linking is disabled.", provider.as_str()),
    ))
  }
  pub async fn get_auth_url(
    &self,
    provider: CalendarProviderName,
    state: &str,
    redirect_uri: &str,
  ) -> Result<String, CalendarError> {
    let configs = self.load_configs().await?;
    match provider {
      CalendarProviderName::Google if configs.google.is_configured() => {
        GoogleCalendarProvider::new(configs.google).get_auth_url(state, redirect_uri)
      }
      CalendarProviderName::Google => Err(CalendarError::bad_request(
        "calendar_provider_not_configured",
        "Calendar provider google not configured.",
      )),
      CalendarProviderName::CalDAV => Err(CalendarError::bad_request(
        "calendar_provider_oauth_unsupported",
        "Selected calendar provider does not support OAuth.",
      )),
    }
  }
  pub async fn handle_oauth_callback(
    &self,
    provider: CalendarProviderName,
    code: &str,
    redirect_uri: &str,
    user_id: &str,
  ) -> Result<CalendarAccountRecord, CalendarError> {
    let configs = self.load_configs().await?;
    if provider != CalendarProviderName::Google || !configs.google.is_configured() {
      return Err(CalendarError::bad_request(
        "calendar_provider_oauth_unsupported",
        "Selected calendar provider does not support OAuth.",
      ));
    }
    // External HTTP runs with zero DB connections held.
    let google = GoogleCalendarProvider::new(configs.google.clone());
    let tokens = google.exchange_code(code, redirect_uri).await?;
    let profile = google.get_account_profile(&tokens.access_token).await?;
    if !configs.google.allows_new_accounts()
      && self
        .get_account_by_provider_account(user_id, provider, &profile.provider_account_id)
        .await?
        .is_none()
    {
      return Err(CalendarError::bad_request(
        "calendar_provider_link_disabled",
        "google calendar account linking is disabled.",
      ));
    }
    let account = self
      .upsert_account(UpsertCalendarAccountParams {
        user_id: user_id.to_owned(),
        provider,
        provider_account_id: profile.provider_account_id,
        display_name: profile.display_name,
        email: profile.email,
        provider_preset_id: None,
        server_url: None,
        principal_url: None,
        calendar_home_url: None,
        username: None,
        auth_type: None,
        access_token: TokenPatch::Set(tokens.access_token),
        refresh_token: tokens.refresh_token.map_or(TokenPatch::Keep, TokenPatch::Set),
        expires_at: tokens.expires_at,
        scope: tokens.scope,
        status: "active".to_owned(),
        last_error: None,
        refresh_interval_minutes: DEFAULT_REFRESH_INTERVAL_MINUTES,
      })
      .await?;
    self.sync_or_mark_invalid(&account.id).await?;
    Ok(account)
  }
  pub async fn link_caldav_account(
    &self,
    user_id: &str,
    input: LinkCaldavInput,
  ) -> Result<CalendarAccountRecord, CalendarError> {
    let configs = self.load_configs().await?;
    if !configs.caldav.enabled {
      return Err(CalendarError::bad_request(
        "caldav_disabled",
        "CalDAV integration is not enabled.",
      ));
    }
    let Some(preset) = configs
      .caldav
      .providers
      .iter()
      .find(|p| p.id == input.provider_preset_id)
      .cloned()
    else {
      return Err(CalendarError::bad_request(
        "caldav_provider_not_found",
        "CalDAV provider is not available.",
      ));
    };
    // Discovery HTTP runs with zero DB connections held.
    let discovery = CaldavCalendarProvider::new(configs.caldav.clone())
      .discover_account(&preset, &input.username, &input.password)
      .await?;
    let mut account = self
      .upsert_account(UpsertCalendarAccountParams {
        user_id: user_id.to_owned(),
        provider: CalendarProviderName::CalDAV,
        provider_account_id: discovery.provider_account_id,
        display_name: input.display_name,
        email: Some(input.username.clone()),
        provider_preset_id: Some(input.provider_preset_id),
        server_url: Some(discovery.server_url),
        principal_url: Some(discovery.principal_url),
        calendar_home_url: Some(discovery.calendar_home_url),
        username: Some(input.username),
        auth_type: discovery.auth_type.map(|a| a.as_str().to_owned()),
        access_token: TokenPatch::Set(input.password),
        refresh_token: TokenPatch::Clear,
        expires_at: None,
        scope: None,
        status: "active".to_owned(),
        last_error: None,
        refresh_interval_minutes: DEFAULT_REFRESH_INTERVAL_MINUTES,
      })
      .await?;
    self.sync_or_mark_invalid(&account.id).await?;
    account.calendars_count =
      i32::try_from(self.list_account_calendars(user_id, &account.id).await?.len()).unwrap_or(0);
    Ok(account)
  }
  async fn sync_or_mark_invalid(&self, account_id: &str) -> Result<(), CalendarError> {
    if let Err(err) = self.sync_account_calendars(account_id).await {
      if matches!(err, CalendarError::ProviderRequest { .. }) {
        let truncated = truncate_calendar_error(&err.to_string());
        let _ = self
          .update_account_status(account_id, "invalid", Some(&truncated))
          .await;
      }
      return Err(err);
    }
    Ok(())
  }
  pub async fn sync_account_calendars(&self, account_id: &str) -> Result<(), CalendarError> {
    let Some(account) = self.get_account(account_id).await? else {
      return Ok(());
    };
    let configs = self.load_configs().await?;
    let Some(access_token) = ensure_access_token(self, &account, &configs.google, None).await? else {
      return Ok(());
    };
    // External listCalendars HTTP runs with zero DB connections held.
    let calendars = match account.provider {
      CalendarProviderName::Google if configs.google.is_configured() => {
        GoogleCalendarProvider::new(configs.google)
          .list_calendars(&access_token)
          .await?
      }
      CalendarProviderName::CalDAV if configs.caldav.is_configured() => {
        CaldavCalendarProvider::new(configs.caldav)
          .list_calendars(&account, &access_token)
          .await?
      }
      _ => return Ok(()),
    };
    let mut sub_ids = Vec::with_capacity(calendars.len());
    for cal in calendars {
      let sub = self
        .upsert_subscription(
          &account.id,
          account.provider,
          &cal.id,
          cal.summary.as_deref(),
          cal.time_zone.as_deref(),
          cal.color_id.as_deref(),
          true,
        )
        .await?;
      sub_ids.push(sub.id);
    }
    for sub_id in sub_ids {
      sync_subscription(self, &sub_id, SyncSubscriptionOptions::default()).await?;
    }
    Ok(())
  }
  pub async fn list_accounts(&self, user_id: &str) -> Result<Vec<CalendarAccountRecord>, CalendarError> {
    let mut conn = self.read_conn("acquire list_accounts").await?;
    let rows = sqlx::query(
      r#"SELECT a.*, COALESCE(s.cnt, 0)::int4 AS calendars_count
         FROM calendar_accounts a
         LEFT JOIN (SELECT account_id, COUNT(*)::int4 AS cnt FROM calendar_subscriptions GROUP BY account_id) s
           ON s.account_id = a.id
         WHERE a.user_id = $1 ORDER BY a.created_at DESC"#,
    )
    .bind(user_id)
    .fetch_all(&mut *conn)
    .await
    .map_err(internal_err("list calendar_accounts"))?;
    Ok(rows.into_iter().map(row_to_account).collect())
  }
  pub async fn list_account_calendars(
    &self,
    user_id: &str,
    account_id: &str,
  ) -> Result<Vec<CalendarSubscriptionRecord>, CalendarError> {
    if !self
      .get_account(account_id)
      .await?
      .is_some_and(|a| a.user_id == user_id)
    {
      return Ok(Vec::new());
    }
    let mut conn = self.read_conn("acquire list_account_calendars").await?;
    let rows = sqlx::query("SELECT * FROM calendar_subscriptions WHERE account_id = $1 ORDER BY created_at ASC")
      .bind(account_id)
      .fetch_all(&mut *conn)
      .await
      .map_err(internal_err("list calendar_subscriptions"))?;
    Ok(rows.into_iter().map(row_to_subscription).collect())
  }
  pub async fn update_account_refresh_interval(
    &self,
    user_id: &str,
    account_id: &str,
    refresh_interval_minutes: i32,
  ) -> Result<Option<CalendarAccountRecord>, CalendarError> {
    let mut tx = self
      .begin_tx(WorkloadTier::InteractiveWrite, "begin update_account_refresh_interval")
      .await?;
    let Some(row) = sqlx::query(
      r#"UPDATE calendar_accounts SET refresh_interval_minutes = $3, updated_at = clock_timestamp()
         WHERE id = $1 AND user_id = $2
         RETURNING *, (SELECT COUNT(*)::int4 FROM calendar_subscriptions WHERE account_id = $1) AS calendars_count"#,
    )
    .bind(account_id)
    .bind(user_id)
    .bind(refresh_interval_minutes)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(internal_err("update refresh_interval"))?
    else {
      return Ok(None);
    };
    let subs = sqlx::query(
      "SELECT id FROM calendar_subscriptions WHERE account_id = $1 AND enabled = true ORDER BY id ASC FOR UPDATE",
    )
    .bind(account_id)
    .fetch_all(&mut **tx.tx_mut())
    .await
    .map_err(internal_err("load subs for refresh update"))?;
    for sub in subs {
      let sid: String = sub.get("id");
      sqlx::query(
        "UPDATE calendar_subscriptions SET next_sync_at = COALESCE(last_sync_at, clock_timestamp()) + make_interval(mins => $2), updated_at = clock_timestamp() WHERE id = $1",
      )
      .bind(&sid)
      .bind(refresh_interval_minutes)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(internal_err("update sub next_sync_at"))?;
    }
    tx.commit()
      .await
      .map_err(internal_err("commit update_account_refresh_interval"))?;
    Ok(Some(row_to_account(row)))
  }
  pub async fn unlink_account(&self, user_id: &str, account_id: &str) -> Result<bool, CalendarError> {
    let Some(account) = self.get_account(account_id).await? else {
      return Ok(false);
    };
    if account.user_id != user_id {
      return Ok(false);
    }
    if account.provider == CalendarProviderName::Google {
      let channels: Vec<(String, String)> = self
        .list_account_calendars(user_id, account_id)
        .await?
        .into_iter()
        .filter_map(|s| s.custom_channel_id.zip(s.custom_resource_id))
        .collect();
      if !channels.is_empty()
        && let Some(enc) = account.access_token_encrypted.as_deref()
        && let key = self.effective_private_key().await
        && let Ok(access_token) = decrypt_token(&key, enc)
        && let Ok(configs) = self.load_configs().await
        && configs.google.is_configured()
      {
        let google = GoogleCalendarProvider::new(configs.google);
        for (ch_id, res_id) in channels {
          let _ = google.stop_channel(&access_token, &ch_id, &res_id).await;
        }
      }
    }
    let mut conn = self.write_conn("acquire unlink_account").await?;
    sqlx::query("DELETE FROM calendar_accounts WHERE id = $1")
      .bind(account_id)
      .execute(&mut *conn)
      .await
      .map_err(internal_err("delete calendar_account"))?;
    Ok(true)
  }
  pub async fn get_workspace_calendars(
    &self,
    workspace_id: &str,
  ) -> Result<Vec<WorkspaceCalendarRecord>, CalendarError> {
    let mut conn = self.read_conn("acquire get_workspace_calendars").await?;
    let cal_rows = sqlx::query(
      "SELECT id, workspace_id, created_by_user_id, display_name_override, color_override, enabled FROM workspace_calendars WHERE workspace_id = $1 ORDER BY created_at ASC",
    )
    .bind(workspace_id)
    .fetch_all(&mut *conn)
    .await
    .map_err(internal_err("query workspace_calendars"))?;
    if cal_rows.is_empty() {
      return Ok(Vec::new());
    }
    let cal_ids: Vec<String> = cal_rows.iter().map(|r| r.get("id")).collect();
    let item_rows = sqlx::query(
      "SELECT id, workspace_calendar_id, subscription_id, sort_order, color_override, enabled FROM workspace_calendar_items WHERE workspace_calendar_id = ANY($1) ORDER BY sort_order ASC NULLS LAST, created_at ASC",
    )
    .bind(&cal_ids)
    .fetch_all(&mut *conn)
    .await
    .map_err(internal_err("query workspace_calendar_items"))?;
    let mut items_map: HashMap<String, Vec<WorkspaceCalendarItemRecord>> = HashMap::new();
    for row in item_rows {
      items_map
        .entry(row.get("workspace_calendar_id"))
        .or_default()
        .push(WorkspaceCalendarItemRecord {
          id: row.get("id"),
          subscription_id: row.get("subscription_id"),
          sort_order: row.get("sort_order"),
          color_override: row.get("color_override"),
          enabled: row.get("enabled"),
        });
    }
    Ok(
      cal_rows
        .into_iter()
        .map(|row| {
          let id: String = row.get("id");
          let items = items_map.remove(&id).unwrap_or_default();
          WorkspaceCalendarRecord {
            id,
            workspace_id: row.get("workspace_id"),
            created_by_user_id: row.get("created_by_user_id"),
            display_name_override: row.get("display_name_override"),
            color_override: row.get("color_override"),
            enabled: row.get("enabled"),
            items,
          }
        })
        .collect(),
    )
  }
  pub async fn update_workspace_calendars(
    &self,
    workspace_id: &str,
    user_id: &str,
    items: &[WorkspaceCalendarItemPatch],
  ) -> Result<WorkspaceCalendarRecord, CalendarError> {
    let mut seen_subs = std::collections::HashSet::with_capacity(items.len());
    for item in items {
      if !seen_subs.insert(item.subscription_id.as_str()) {
        return Err(CalendarError::bad_request(
          "duplicate_calendar_subscription",
          "Duplicate calendar subscription in items.",
        ));
      }
    }
    let mut tx = self
      .begin_tx(WorkloadTier::InteractiveWrite, "begin update_workspace_calendars")
      .await?;
    sqlx::query("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
      .bind(workspace_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await
      .map_err(internal_err("lock workspace for calendar update"))?;
    let cal_row = match sqlx::query(
      "SELECT id, workspace_id, created_by_user_id, display_name_override, color_override, enabled FROM workspace_calendars WHERE workspace_id = $1 ORDER BY created_at ASC LIMIT 1 FOR UPDATE",
    )
    .bind(workspace_id)
    .fetch_optional(&mut **tx.tx_mut())
    .await
    .map_err(internal_err("select workspace_calendar"))?
    {
      Some(row) => row,
      None => sqlx::query(
        r#"INSERT INTO workspace_calendars (id, workspace_id, created_by_user_id, enabled, created_at, updated_at)
           VALUES ($1, $2, $3, true, clock_timestamp(), clock_timestamp())
           RETURNING id, workspace_id, created_by_user_id, display_name_override, color_override, enabled"#,
      )
      .bind(Uuid::new_v4().to_string())
      .bind(workspace_id)
      .bind(user_id)
      .fetch_one(&mut **tx.tx_mut())
      .await
      .map_err(internal_err("insert workspace_calendar"))?,
    };
    let cal_id: String = cal_row.get("id");
    // Verify every requested subscription exists and either belongs to the
    // acting user or is already attached to this workspace calendar.
    if !items.is_empty() {
      let requested_ids: Vec<String> = items.iter().map(|i| i.subscription_id.clone()).collect();
      let allowed_rows = sqlx::query(
        r#"SELECT s.id, a.user_id, (wci.id IS NOT NULL) AS already_bound
           FROM calendar_subscriptions s
           JOIN calendar_accounts a ON a.id = s.account_id
           LEFT JOIN workspace_calendar_items wci
             ON wci.subscription_id = s.id AND wci.workspace_calendar_id = $2
           WHERE s.id = ANY($1)"#,
      )
      .bind(&requested_ids)
      .bind(&cal_id)
      .fetch_all(&mut **tx.tx_mut())
      .await
      .map_err(internal_err("verify calendar subscriptions ownership"))?;
      let authorized: std::collections::HashSet<String> = allowed_rows
        .into_iter()
        .filter(|r| r.get::<String, _>("user_id") == user_id || r.get::<bool, _>("already_bound"))
        .map(|r| r.get("id"))
        .collect();
      if items.iter().any(|i| !authorized.contains(&i.subscription_id)) {
        return Err(CalendarError::Domain(DomainError::Forbidden(
          "Cannot bind calendar subscription owned by another user".to_owned(),
        )));
      }
    }
    sqlx::query("DELETE FROM workspace_calendar_items WHERE workspace_calendar_id = $1")
      .bind(&cal_id)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(internal_err("clear workspace_calendar_items"))?;
    let mut inserted = Vec::with_capacity(items.len());
    for (idx, item) in items.iter().enumerate() {
      let item_id = Uuid::new_v4().to_string();
      let sort_order = item.sort_order.unwrap_or(i32::try_from(idx).unwrap_or(0));
      sqlx::query(
        r#"INSERT INTO workspace_calendar_items (
             id, workspace_calendar_id, subscription_id, sort_order, color_override, enabled, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, true, clock_timestamp(), clock_timestamp())"#,
      )
      .bind(&item_id)
      .bind(&cal_id)
      .bind(&item.subscription_id)
      .bind(sort_order)
      .bind(&item.color_override)
      .execute(&mut **tx.tx_mut())
      .await
      .map_err(internal_err("insert workspace_calendar_item"))?;
      inserted.push(WorkspaceCalendarItemRecord {
        id: item_id,
        subscription_id: item.subscription_id.clone(),
        sort_order: Some(sort_order),
        color_override: item.color_override.clone(),
        enabled: true,
      });
    }
    tx.commit()
      .await
      .map_err(internal_err("commit update_workspace_calendars"))?;
    Ok(WorkspaceCalendarRecord {
      id: cal_id,
      workspace_id: cal_row.get("workspace_id"),
      created_by_user_id: cal_row.get("created_by_user_id"),
      display_name_override: cal_row.get("display_name_override"),
      color_override: cal_row.get("color_override"),
      enabled: cal_row.get("enabled"),
      items: inserted,
    })
  }
  pub async fn list_workspace_events(
    &self,
    workspace_calendar_id: &str,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
  ) -> Result<Vec<CalendarEventRecord>, CalendarError> {
    let mut conn = self.read_conn("acquire list_workspace_events").await?;
    let sub_ids: Vec<String> =
      sqlx::query_scalar("SELECT subscription_id FROM workspace_calendar_items WHERE workspace_calendar_id = $1")
        .bind(workspace_calendar_id)
        .fetch_all(&mut *conn)
        .await
        .map_err(internal_err("query calendar items"))?;
    if sub_ids.is_empty() {
      return Ok(Vec::new());
    }
    let due_ids: Vec<String> = sqlx::query_scalar(
      r#"SELECT s.id FROM calendar_subscriptions s
         JOIN calendar_accounts a ON a.id = s.account_id
         WHERE s.id = ANY($1)
           AND s.enabled = true
           AND a.status = 'active'
           AND s.next_sync_at <= clock_timestamp()
           AND (s.sync_claimed_until IS NULL OR s.sync_claimed_until <= clock_timestamp())"#,
    )
    .bind(&sub_ids)
    .fetch_all(&mut *conn)
    .await
    .map_err(internal_err("query due workspace calendar subscriptions"))?;
    let rows = sqlx::query(
      r#"SELECT id, subscription_id, external_event_id, recurrence_id, status, title,
                description, location, start_at_utc, end_at_utc, original_timezone, all_day
         FROM calendar_events
         WHERE subscription_id = ANY($1) AND start_at_utc < $2 AND end_at_utc > $3
         ORDER BY start_at_utc ASC, end_at_utc ASC"#,
    )
    .bind(&sub_ids)
    .bind(to)
    .bind(from)
    .fetch_all(&mut *conn)
    .await
    .map_err(internal_err("query calendar_events"))?;
    drop(conn);
    if !due_ids.is_empty() {
      let svc = self.clone();
      tokio::spawn(async move {
        use futures_util::FutureExt as _;
        match std::panic::AssertUnwindSafe(sync::sync_due_subscription_ids(&svc, &due_ids))
          .catch_unwind()
          .await
        {
          Ok(Err(err)) => tracing::warn!(error = %err, "background workspace calendar sync failed"),
          Err(_) => tracing::warn!("background workspace calendar sync panicked"),
          Ok(Ok(())) => {}
        }
      });
    }
    Ok(
      rows
        .into_iter()
        .map(|row| CalendarEventRecord {
          id: row.get("id"),
          subscription_id: row.get("subscription_id"),
          external_event_id: row.get("external_event_id"),
          recurrence_id: row.get("recurrence_id"),
          status: row.get("status"),
          title: row.get("title"),
          description: row.get("description"),
          location: row.get("location"),
          start_at_utc: row.get("start_at_utc"),
          end_at_utc: row.get("end_at_utc"),
          original_timezone: row.get("original_timezone"),
          all_day: row.get("all_day"),
        })
        .collect(),
    )
  }
  pub async fn handle_webhook(&self, provider: CalendarProviderName, channel_id: &str) -> Result<(), CalendarError> {
    if provider != CalendarProviderName::Google {
      return Ok(());
    }
    let mut conn = self.write_conn("acquire handle_webhook").await?;
    sqlx::query(
      "UPDATE calendar_subscriptions SET next_sync_at = clock_timestamp(), updated_at = clock_timestamp() WHERE custom_channel_id = $1",
    )
    .bind(channel_id)
    .execute(&mut *conn)
    .await
    .map_err(internal_err("enqueue webhook sync"))?;
    Ok(())
  }
  pub async fn upsert_account(
    &self,
    params: UpsertCalendarAccountParams,
  ) -> Result<CalendarAccountRecord, CalendarError> {
    let enc_access = self.encrypt_patch_async(&params.access_token).await?;
    let enc_refresh = self.encrypt_patch_async(&params.refresh_token).await?;
    let mut conn = self.write_conn("acquire upsert_account").await?;
    let row = sqlx::query(
      r#"INSERT INTO calendar_accounts (
           id, user_id, provider, provider_account_id, display_name, email,
           provider_preset_id, server_url, principal_url, calendar_home_url,
           username, auth_type, access_token, refresh_token, expires_at, scope,
           status, last_error, refresh_interval_minutes, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
           $17, $18, $19, clock_timestamp(), clock_timestamp()
         )
         ON CONFLICT (user_id, provider, provider_account_id) DO UPDATE SET
           display_name = EXCLUDED.display_name, email = EXCLUDED.email,
           provider_preset_id = EXCLUDED.provider_preset_id, server_url = EXCLUDED.server_url,
           principal_url = EXCLUDED.principal_url, calendar_home_url = EXCLUDED.calendar_home_url,
           username = EXCLUDED.username, auth_type = EXCLUDED.auth_type,
           access_token = CASE WHEN $20 THEN EXCLUDED.access_token ELSE calendar_accounts.access_token END,
           refresh_token = CASE WHEN $21 THEN EXCLUDED.refresh_token ELSE calendar_accounts.refresh_token END,
           expires_at = EXCLUDED.expires_at, scope = EXCLUDED.scope, status = EXCLUDED.status,
           last_error = EXCLUDED.last_error, refresh_interval_minutes = EXCLUDED.refresh_interval_minutes,
           updated_at = clock_timestamp()
         RETURNING *, (SELECT COUNT(*)::int4 FROM calendar_subscriptions WHERE account_id = calendar_accounts.id) AS calendars_count"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&params.user_id)
    .bind(params.provider.as_str())
    .bind(&params.provider_account_id)
    .bind(&params.display_name)
    .bind(&params.email)
    .bind(&params.provider_preset_id)
    .bind(&params.server_url)
    .bind(&params.principal_url)
    .bind(&params.calendar_home_url)
    .bind(&params.username)
    .bind(&params.auth_type)
    .bind(&enc_access)
    .bind(&enc_refresh)
    .bind(params.expires_at)
    .bind(&params.scope)
    .bind(&params.status)
    .bind(&params.last_error)
    .bind(params.refresh_interval_minutes)
    .bind(!matches!(params.access_token, TokenPatch::Keep))
    .bind(!matches!(params.refresh_token, TokenPatch::Keep))
    .fetch_one(&mut *conn)
    .await
    .map_err(internal_err("upsert calendar_account"))?;
    Ok(row_to_account(row))
  }
  #[allow(clippy::too_many_arguments)]
  pub async fn update_account_tokens(
    &self,
    account_id: &str,
    access_token: TokenPatch,
    refresh_token: TokenPatch,
    expires_at: Option<Option<DateTime<Utc>>>,
    scope: Option<Option<String>>,
    status: Option<String>,
    last_error: Option<Option<String>>,
  ) -> Result<CalendarAccountRecord, CalendarError> {
    let enc_access = self.encrypt_patch_async(&access_token).await?;
    let enc_refresh = self.encrypt_patch_async(&refresh_token).await?;
    let mut conn = self.write_conn("acquire update_account_tokens").await?;
    let row = sqlx::query(
      r#"UPDATE calendar_accounts
         SET access_token = CASE WHEN $2 THEN $3 ELSE access_token END,
             refresh_token = CASE WHEN $4 THEN $5 ELSE refresh_token END,
             expires_at = CASE WHEN $6 THEN $7 ELSE expires_at END,
             scope = CASE WHEN $8 THEN $9 ELSE scope END,
             status = COALESCE($10, status),
             last_error = CASE WHEN $11 THEN $12 ELSE last_error END,
             updated_at = clock_timestamp()
         WHERE id = $1
         RETURNING *, (SELECT COUNT(*)::int4 FROM calendar_subscriptions WHERE account_id = calendar_accounts.id) AS calendars_count"#,
    )
    .bind(account_id)
    .bind(!matches!(access_token, TokenPatch::Keep))
    .bind(&enc_access)
    .bind(!matches!(refresh_token, TokenPatch::Keep))
    .bind(&enc_refresh)
    .bind(expires_at.is_some())
    .bind(expires_at.flatten())
    .bind(scope.is_some())
    .bind(scope.flatten())
    .bind(&status)
    .bind(last_error.is_some())
    .bind(last_error.flatten())
    .fetch_one(&mut *conn)
    .await
    .map_err(internal_err("update_account_tokens"))?;
    Ok(row_to_account(row))
  }
  pub async fn get_account(&self, account_id: &str) -> Result<Option<CalendarAccountRecord>, CalendarError> {
    let mut conn = self.read_conn("acquire get_account").await?;
    let row = sqlx::query(
      r#"SELECT *, (SELECT COUNT(*)::int4 FROM calendar_subscriptions WHERE account_id = calendar_accounts.id) AS calendars_count
         FROM calendar_accounts WHERE id = $1"#,
    )
    .bind(account_id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(internal_err("get calendar_account"))?;
    Ok(row.map(row_to_account))
  }
  async fn get_account_by_provider_account(
    &self,
    user_id: &str,
    provider: CalendarProviderName,
    provider_account_id: &str,
  ) -> Result<Option<CalendarAccountRecord>, CalendarError> {
    let mut conn = self.read_conn("acquire get_account_by_provider").await?;
    let row = sqlx::query(
      r#"SELECT *, (SELECT COUNT(*)::int4 FROM calendar_subscriptions WHERE account_id = calendar_accounts.id) AS calendars_count
         FROM calendar_accounts WHERE user_id = $1 AND provider = $2 AND provider_account_id = $3"#,
    )
    .bind(user_id)
    .bind(provider.as_str())
    .bind(provider_account_id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(internal_err("get calendar_account by provider"))?;
    Ok(row.map(row_to_account))
  }
  async fn update_account_status(
    &self,
    account_id: &str,
    status: &str,
    last_error: Option<&str>,
  ) -> Result<(), CalendarError> {
    let mut conn = self.write_conn("acquire update_account_status").await?;
    let truncated = last_error.map(truncate_calendar_error);
    sqlx::query(
      "UPDATE calendar_accounts SET status = $2, last_error = $3, updated_at = clock_timestamp() WHERE id = $1",
    )
    .bind(account_id)
    .bind(status)
    .bind(truncated.as_deref())
    .execute(&mut *conn)
    .await
    .map_err(internal_err("update account status"))?;
    Ok(())
  }
  #[allow(clippy::too_many_arguments)]
  async fn upsert_subscription(
    &self,
    account_id: &str,
    provider: CalendarProviderName,
    external_calendar_id: &str,
    display_name: Option<&str>,
    timezone: Option<&str>,
    color: Option<&str>,
    enabled: bool,
  ) -> Result<CalendarSubscriptionRecord, CalendarError> {
    let mut conn = self.write_conn("acquire upsert_subscription").await?;
    let row = sqlx::query(
      r#"INSERT INTO calendar_subscriptions (
           id, account_id, provider, external_calendar_id, display_name, timezone,
           color, enabled, next_sync_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, clock_timestamp(), clock_timestamp(), clock_timestamp())
         ON CONFLICT (account_id, external_calendar_id) DO UPDATE SET
           display_name = EXCLUDED.display_name, timezone = EXCLUDED.timezone,
           color = EXCLUDED.color, enabled = EXCLUDED.enabled, updated_at = clock_timestamp()
         RETURNING *"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(account_id)
    .bind(provider.as_str())
    .bind(external_calendar_id)
    .bind(display_name)
    .bind(timezone)
    .bind(color)
    .bind(enabled)
    .fetch_one(&mut *conn)
    .await
    .map_err(internal_err("upsert calendar_subscription"))?;
    Ok(row_to_subscription(row))
  }
  pub(crate) async fn load_subscription_with_account(
    &self,
    subscription_id: &str,
  ) -> Result<Option<(CalendarSubscriptionRecord, CalendarAccountRecord)>, CalendarError> {
    let mut conn = self.read_conn("acquire load_subscription").await?;
    let Some(sub_row) = sqlx::query("SELECT * FROM calendar_subscriptions WHERE id = $1")
      .bind(subscription_id)
      .fetch_optional(&mut *conn)
      .await
      .map_err(internal_err("load subscription"))?
    else {
      return Ok(None);
    };
    let sub = row_to_subscription(sub_row);
    drop(conn);
    Ok(self.get_account(&sub.account_id).await?.map(|acc| (sub, acc)))
  }
}
pub(crate) fn internal_err<E: std::fmt::Display>(ctx: &'static str) -> impl FnOnce(E) -> CalendarError {
  move |err| CalendarError::Internal(format!("{ctx}: {err}"))
}
fn row_to_account(row: sqlx::postgres::PgRow) -> CalendarAccountRecord {
  let provider_str: String = row.get("provider");
  CalendarAccountRecord {
    id: row.get("id"),
    user_id: row.get("user_id"),
    provider: CalendarProviderName::parse(&provider_str).unwrap_or(CalendarProviderName::Google),
    provider_account_id: row.get("provider_account_id"),
    display_name: row.get("display_name"),
    email: row.get("email"),
    provider_preset_id: row.get("provider_preset_id"),
    server_url: row.get("server_url"),
    principal_url: row.get("principal_url"),
    calendar_home_url: row.get("calendar_home_url"),
    username: row.get("username"),
    auth_type: row.get("auth_type"),
    access_token_encrypted: row.get("access_token"),
    refresh_token_encrypted: row.get("refresh_token"),
    expires_at: row.get("expires_at"),
    scope: row.get("scope"),
    status: row.get("status"),
    last_error: row.get("last_error"),
    refresh_interval_minutes: row.get("refresh_interval_minutes"),
    calendars_count: row.try_get("calendars_count").unwrap_or(0),
    created_at: row.get("created_at"),
    updated_at: row.get("updated_at"),
  }
}
fn row_to_subscription(row: sqlx::postgres::PgRow) -> CalendarSubscriptionRecord {
  let provider_str: String = row.get("provider");
  CalendarSubscriptionRecord {
    id: row.get("id"),
    account_id: row.get("account_id"),
    provider: CalendarProviderName::parse(&provider_str).unwrap_or(CalendarProviderName::Google),
    external_calendar_id: row.get("external_calendar_id"),
    display_name: row.get("display_name"),
    timezone: row.get("timezone"),
    color: row.get("color"),
    enabled: row.get("enabled"),
    sync_token: row.get("sync_token"),
    last_sync_at: row.get("last_sync_at"),
    next_sync_at: row.get("next_sync_at"),
    sync_retry_count: row.get("sync_retry_count"),
    sync_claimed_until: row.get("sync_claimed_until"),
    custom_channel_id: row.get("custom_channel_id"),
    custom_resource_id: row.get("custom_resource_id"),
    channel_expiration: row.get("channel_expiration"),
  }
}

#[cfg(test)]
mod tests {
  use std::path::Path;
  use std::sync::Arc;

  use server_db::DbConfig;
  use server_types::ServerRole;
  use test_db_harness::{
    migrations::MigrationSet,
    pg::{DEFAULT_LEASE_TTL, PgCluster},
  };

  use super::*;
  use crate::app_config::{AppConfigService, RuntimeAppConfigBaseline};
  use crate::events::NoopEventPublisher;

  #[test]
  fn calendar_private_key_raw_bytes_and_db_override_interop() {
    let raw_key_with_newline = "calendar-test-key-line-1\ncalendar-test-key-line-2\n";
    let trimmed_key = raw_key_with_newline.trim();
    assert_ne!(raw_key_with_newline, trimmed_key);

    // Exact raw bytes (including trailing newline) round-trip cleanly and never collide with trimmed bytes.
    let ct = encrypt_token(raw_key_with_newline, "oauth-refresh-secret").expect("encrypt with raw key");
    assert_eq!(
      decrypt_token(raw_key_with_newline, &ct).expect("decrypt with identical raw key"),
      "oauth-refresh-secret"
    );
    assert!(
      decrypt_token(trimmed_key, &ct).is_err(),
      "trimmed key must derive a different SHA-256 key than raw key bytes"
    );

    let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
    let migrations_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
    let migrations = MigrationSet::load(&migrations_dir).expect("load migrations");
    let template = cluster.ensure_template(&migrations).expect("ensure template");
    let lease = cluster.lease(&template, DEFAULT_LEASE_TTL).expect("lease db");

    let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
    rt.block_on(async {
      let db = ServerDb::connect(DbConfig {
        database_url: lease.url().to_owned(),
        channel: "production".into(),
        role: ServerRole::Allinone,
        selfhosted: true,
        max_connections: 4,
        statement_timeout_ms: 5_000,
        tier_permits: [8, 4, 4, 2],
      })
      .await
      .expect("connect db");
      sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        .execute(db.pool())
        .await
        .expect("reset schema");
      db.ensure_schema_ready().await.expect("ensure schema ready");

      let baseline = RuntimeAppConfigBaseline {
        file_json: serde_json::json!({ "crypto": { "privateKey": raw_key_with_newline } }),
        ..RuntimeAppConfigBaseline::default()
      };
      let app_config = AppConfigService::new(db.clone(), baseline, Arc::new(NoopEventPublisher::default()));
      let calendar = CalendarService::new(
        db.clone(),
        raw_key_with_newline.to_owned(),
        "http://localhost:3010".to_owned(),
      )
      .with_app_config(app_config.clone());

      let google_cfg = google::CalendarGoogleConfig::default();

      // 1. Initial key comes from file baseline with exact raw bytes; webhook token derives from it.
      assert_eq!(calendar.effective_private_key().await, raw_key_with_newline);
      let k1_webhook = calendar.webhook_token_from_config(&google_cfg).await;
      assert!(calendar.verify_webhook_token(&google_cfg, &k1_webhook).await);

      // 2. DB override with leading/trailing whitespace takes effect live without leaking via public config.
      let db_override_key = "  K2-db-override  ";
      sqlx::query(
        r#"INSERT INTO app_configs (id, value, last_updated_by, created_at, updated_at)
           VALUES ('crypto.privateKey', to_jsonb($1::text), NULL, now(), now())
           ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()"#,
      )
      .bind(db_override_key)
      .execute(db.pool())
      .await
      .expect("insert db privateKey");
      app_config.invalidate_cache();

      let public_cfg = app_config.get_effective_app_config().await.expect("public config");
      assert_ne!(
        public_cfg.pointer("/crypto/privateKey").and_then(|v| v.as_str()),
        Some(db_override_key),
        "public get_effective_app_config must keep crypto.privateKey redacted"
      );
      assert_eq!(calendar.effective_private_key().await, db_override_key);
      let ct2 = encrypt_token(db_override_key, "cal-token").expect("encrypt k2");
      assert_eq!(decrypt_token(db_override_key, &ct2).expect("decrypt k2"), "cal-token");
      assert!(decrypt_token(db_override_key.trim(), &ct2).is_err());

      let k2_webhook = calendar.webhook_token_from_config(&google_cfg).await;
      assert_ne!(k1_webhook, k2_webhook);
      assert!(calendar.verify_webhook_token(&google_cfg, &k2_webhook).await);
      assert!(!calendar.verify_webhook_token(&google_cfg, &k1_webhook).await);

      // 3. Deleting DB override falls back to K1 file key live.
      sqlx::query("DELETE FROM app_configs WHERE id = 'crypto.privateKey'")
        .execute(db.pool())
        .await
        .expect("delete db privateKey");
      app_config.invalidate_cache();
      assert_eq!(calendar.effective_private_key().await, raw_key_with_newline);
      assert_eq!(calendar.webhook_token_from_config(&google_cfg).await, k1_webhook);
      assert!(calendar.verify_webhook_token(&google_cfg, &k1_webhook).await);
    });
  }
}
