//! Calendar integration shared domain types and provider adapters (Google
//! Calendar OAuth, CalDAV discovery, iCalendar parsing, token encryption,
//! and Redis OAuth state management).
pub mod caldav;
pub mod crypto;
pub mod google;
pub mod ical;
pub mod oauth;
use self::caldav::CalendarCaldavConfig;
use self::google::CalendarGoogleConfig;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use server_types::DomainError;
use std::fmt;
use std::sync::Arc;
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
