//! Google Calendar OAuth and REST API provider routed through `safe_fetch`.
//!
//! Aligns with `v0.27.5` `plugins/calendar/providers/google.ts`, including
//! paginated calendar/event listing, HTTP 410 sync-token invalidation, and
//! push webhook channel management.
use super::{
  CalendarAccountProfile, CalendarError, CalendarProviderCalendar, CalendarProviderEvent, CalendarProviderEventRaw,
  CalendarProviderEventTime, CalendarProviderListEventsResult, CalendarProviderTokens, CalendarProviderWatchResult,
};
use crate::safe_fetch::{SafeFetchError, SafeFetchPolicy, SafeFetchRequest, SafeFetchResponse, safe_fetch};
use chrono::{DateTime, Utc};
use reqwest::Method;
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;
use std::fmt;
use std::time::Duration;
use url::Url;
const DEFAULT_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const DEFAULT_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const DEFAULT_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";
const DEFAULT_CALENDAR_API_BASE: &str = "https://www.googleapis.com/calendar/v3";
const DEFAULT_REQUEST_TIMEOUT_MS: u64 = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES: usize = 10 * 1024 * 1024;
const MAX_GOOGLE_PAGES: usize = 100;
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarGoogleConfig {
  #[serde(default)]
  pub enabled: bool,
  #[serde(default = "default_allow_new_accounts")]
  pub allow_new_accounts: Option<bool>,
  #[serde(default)]
  pub client_id: String,
  #[serde(default)]
  pub client_secret: String,
  #[serde(default)]
  pub external_webhook_url: Option<String>,
  #[serde(default)]
  pub webhook_verification_token: Option<String>,
  #[serde(default)]
  pub request_timeout_ms: Option<u64>,
  /// Test-only endpoint overrides. Skipped by serde so they can never be
  /// deserialized from `app_configs` or any untrusted JSON input.
  #[serde(skip)]
  pub auth_endpoint_override: Option<String>,
  #[serde(skip)]
  pub token_endpoint_override: Option<String>,
  #[serde(skip)]
  pub userinfo_endpoint_override: Option<String>,
  #[serde(skip)]
  pub api_base_override: Option<String>,
}
impl fmt::Debug for CalendarGoogleConfig {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.debug_struct("CalendarGoogleConfig")
      .field("enabled", &self.enabled)
      .field("allow_new_accounts", &self.allow_new_accounts)
      .field("client_id", &self.client_id)
      .field("client_secret", &"[REDACTED]")
      .field("external_webhook_url", &self.external_webhook_url)
      .field(
        "webhook_verification_token",
        &self.webhook_verification_token.as_ref().map(|_| "[REDACTED]"),
      )
      .field("request_timeout_ms", &self.request_timeout_ms)
      .finish_non_exhaustive()
  }
}
fn default_allow_new_accounts() -> Option<bool> {
  Some(true)
}
impl CalendarGoogleConfig {
  pub fn is_configured(&self) -> bool {
    self.enabled && !self.client_id.is_empty() && !self.client_secret.is_empty()
  }
  pub fn allows_new_accounts(&self) -> bool {
    self.allow_new_accounts.unwrap_or(true)
  }
  pub fn timeout(&self) -> Duration {
    Duration::from_millis(
      self
        .request_timeout_ms
        .filter(|&ms| ms > 0)
        .unwrap_or(DEFAULT_REQUEST_TIMEOUT_MS),
    )
  }
}
#[derive(Debug, Deserialize)]
struct GoogleTokenResponse {
  access_token: String,
  refresh_token: Option<String>,
  expires_in: Option<i64>,
  scope: Option<String>,
  token_type: Option<String>,
}
#[derive(Debug, Deserialize)]
struct GoogleUserInfo {
  id: String,
  email: Option<String>,
  name: Option<String>,
}
#[derive(Debug, Deserialize)]
struct GoogleCalendarListResponse {
  items: Option<Vec<GoogleCalendarListItem>>,
  #[serde(rename = "nextPageToken")]
  next_page_token: Option<String>,
}
#[derive(Debug, Deserialize)]
struct GoogleCalendarListItem {
  id: String,
  summary: Option<String>,
  #[serde(rename = "timeZone")]
  time_zone: Option<String>,
  #[serde(rename = "colorId")]
  color_id: Option<String>,
  primary: Option<bool>,
}
#[derive(Debug, Deserialize, Serialize)]
struct GoogleEventTime {
  date: Option<String>,
  #[serde(rename = "dateTime")]
  date_time: Option<String>,
  #[serde(rename = "timeZone")]
  time_zone: Option<String>,
}
#[derive(Debug, Deserialize, Serialize)]
struct GoogleEventItem {
  id: String,
  status: Option<String>,
  etag: Option<String>,
  summary: Option<String>,
  description: Option<String>,
  location: Option<String>,
  updated: Option<String>,
  #[serde(rename = "recurringEventId")]
  recurring_event_id: Option<String>,
  #[serde(rename = "originalStartTime")]
  original_start_time: Option<GoogleEventTime>,
  start: Option<GoogleEventTime>,
  end: Option<GoogleEventTime>,
}
#[derive(Debug, Deserialize)]
struct GoogleEventsResponse {
  items: Option<Vec<Value>>,
  #[serde(rename = "nextPageToken")]
  next_page_token: Option<String>,
  #[serde(rename = "nextSyncToken")]
  next_sync_token: Option<String>,
}
pub fn encode_path_segment(segment: &str) -> Result<String, CalendarError> {
  if segment.is_empty() || segment == "." || segment == ".." {
    return Err(CalendarError::bad_request(
      "invalid_calendar_id",
      "Calendar identifier is invalid.",
    ));
  }
  let mut out = String::with_capacity(segment.len());
  for &b in segment.as_bytes() {
    if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')') {
      out.push(b as char);
    } else {
      out.push_str(&format!("%{b:02X}"));
    }
  }
  Ok(out)
}
#[derive(Debug, Deserialize)]
struct GoogleWatchResponse {
  id: String,
  #[serde(rename = "resourceId")]
  resource_id: String,
  expiration: Option<String>,
}
fn map_google_fetch_err(err: SafeFetchError) -> CalendarError {
  CalendarError::ProviderRequest {
    status: 502,
    message: err.to_string(),
  }
}
/// Stateless Google Calendar HTTP client bound to a [`CalendarGoogleConfig`].
#[derive(Clone, Debug)]
pub struct GoogleCalendarProvider {
  config: CalendarGoogleConfig,
}
impl GoogleCalendarProvider {
  pub fn new(config: CalendarGoogleConfig) -> Self {
    Self { config }
  }
  fn auth_url_base(&self) -> &str {
    self
      .config
      .auth_endpoint_override
      .as_deref()
      .unwrap_or(DEFAULT_AUTH_URL)
  }
  fn token_url(&self) -> &str {
    self
      .config
      .token_endpoint_override
      .as_deref()
      .unwrap_or(DEFAULT_TOKEN_URL)
  }
  fn userinfo_url(&self) -> &str {
    self
      .config
      .userinfo_endpoint_override
      .as_deref()
      .unwrap_or(DEFAULT_USERINFO_URL)
  }
  fn api_base(&self) -> &str {
    self
      .config
      .api_base_override
      .as_deref()
      .unwrap_or(DEFAULT_CALENDAR_API_BASE)
      .trim_end_matches('/')
  }
  /// Builds a strict `SafeFetchPolicy`. Only permits plain HTTP and private
  /// origins when an explicit `#[serde(skip)]` test override matches the
  /// target URL's exact origin.
  fn policy_for(&self, url: &str, test_override: Option<&str>, max_redirects: usize) -> SafeFetchPolicy {
    let mut allow_http = false;
    let mut allow_private_origins = Vec::new();
    if let (Some(ov), Ok(target)) = (test_override, Url::parse(url))
      && let Ok(ov_url) = Url::parse(ov)
      && target.origin() == ov_url.origin()
    {
      allow_http = ov_url.scheme() == "http";
      allow_private_origins.push(ov_url.origin());
    }
    SafeFetchPolicy {
      allow_http,
      allowed_hosts: Vec::new(),
      allow_private_origins,
      allow_cross_origin_body_replay: false,
      max_redirects,
      connect_timeout: self.config.timeout(),
      timeout: self.config.timeout(),
      max_response_bytes: DEFAULT_MAX_RESPONSE_BYTES,
    }
  }
  async fn send_request(
    &self,
    method: Method,
    url: &str,
    headers: HeaderMap,
    body: Option<Vec<u8>>,
    test_override: Option<&str>,
    max_redirects: usize,
  ) -> Result<SafeFetchResponse, CalendarError> {
    let policy = self.policy_for(url, test_override, max_redirects);
    safe_fetch(SafeFetchRequest {
      method,
      url: url.to_owned(),
      headers,
      body,
      policy,
    })
    .await
    .map_err(map_google_fetch_err)
  }
  fn bearer_headers(access_token: &str, json_body: bool) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    if let Ok(val) = HeaderValue::from_str(&format!("Bearer {access_token}")) {
      headers.insert(AUTHORIZATION, val);
    }
    if json_body {
      headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    }
    headers
  }
  pub fn get_auth_url(&self, state: &str, redirect_uri: &str) -> Result<String, CalendarError> {
    let mut url = Url::parse(self.auth_url_base())
      .map_err(|err| CalendarError::Internal(format!("invalid google auth url: {err}")))?;
    url
      .query_pairs_mut()
      .append_pair("client_id", &self.config.client_id)
      .append_pair("redirect_uri", redirect_uri)
      .append_pair("response_type", "code")
      .append_pair("access_type", "offline")
      .append_pair("prompt", "consent")
      .append_pair("include_granted_scopes", "true")
      .append_pair(
        "scope",
        "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
      )
      .append_pair("state", state);
    Ok(url.into())
  }
  pub async fn exchange_code(&self, code: &str, redirect_uri: &str) -> Result<CalendarProviderTokens, CalendarError> {
    let body = url::form_urlencoded::Serializer::new(String::new())
      .append_pair("code", code)
      .append_pair("client_id", &self.config.client_id)
      .append_pair("client_secret", &self.config.client_secret)
      .append_pair("redirect_uri", redirect_uri)
      .append_pair("grant_type", "authorization_code")
      .finish();
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(
      CONTENT_TYPE,
      HeaderValue::from_static("application/x-www-form-urlencoded"),
    );
    let resp = self
      .send_request(
        Method::POST,
        self.token_url(),
        headers,
        Some(body.into_bytes()),
        self.config.token_endpoint_override.as_deref(),
        0,
      )
      .await?;
    let text = String::from_utf8_lossy(&resp.body).into_owned();
    if !resp.status.is_success() {
      return Err(CalendarError::ProviderRequest {
        status: resp.status.as_u16(),
        message: text,
      });
    }
    let parsed: GoogleTokenResponse = serde_json::from_str(&text)
      .map_err(|err| CalendarError::Internal(format!("decode google token response: {err}")))?;
    Ok(CalendarProviderTokens {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      expires_at: parsed
        .expires_in
        .map(|secs| Utc::now() + chrono::Duration::seconds(secs)),
      scope: parsed.scope,
      token_type: parsed.token_type,
    })
  }
  pub async fn refresh_tokens(&self, refresh_token: &str) -> Result<CalendarProviderTokens, CalendarError> {
    let body = url::form_urlencoded::Serializer::new(String::new())
      .append_pair("refresh_token", refresh_token)
      .append_pair("client_id", &self.config.client_id)
      .append_pair("client_secret", &self.config.client_secret)
      .append_pair("grant_type", "refresh_token")
      .finish();
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(
      CONTENT_TYPE,
      HeaderValue::from_static("application/x-www-form-urlencoded"),
    );
    let resp = self
      .send_request(
        Method::POST,
        self.token_url(),
        headers,
        Some(body.into_bytes()),
        self.config.token_endpoint_override.as_deref(),
        0,
      )
      .await?;
    let text = String::from_utf8_lossy(&resp.body).into_owned();
    if !resp.status.is_success() {
      return Err(CalendarError::ProviderRequest {
        status: resp.status.as_u16(),
        message: text,
      });
    }
    let parsed: GoogleTokenResponse = serde_json::from_str(&text)
      .map_err(|err| CalendarError::Internal(format!("decode google refresh response: {err}")))?;
    Ok(CalendarProviderTokens {
      access_token: parsed.access_token,
      refresh_token: Some(refresh_token.to_owned()),
      expires_at: parsed
        .expires_in
        .map(|secs| Utc::now() + chrono::Duration::seconds(secs)),
      scope: parsed.scope,
      token_type: parsed.token_type,
    })
  }
  pub async fn get_account_profile(&self, access_token: &str) -> Result<CalendarAccountProfile, CalendarError> {
    let resp = self
      .send_request(
        Method::GET,
        self.userinfo_url(),
        Self::bearer_headers(access_token, false),
        None,
        self.config.userinfo_endpoint_override.as_deref(),
        3,
      )
      .await?;
    let text = String::from_utf8_lossy(&resp.body).into_owned();
    if !resp.status.is_success() {
      return Err(CalendarError::ProviderRequest {
        status: resp.status.as_u16(),
        message: text,
      });
    }
    let parsed: GoogleUserInfo =
      serde_json::from_str(&text).map_err(|err| CalendarError::Internal(format!("decode google userinfo: {err}")))?;
    Ok(CalendarAccountProfile {
      provider_account_id: parsed.id,
      display_name: parsed.name,
      email: parsed.email,
    })
  }
  pub async fn list_calendars(&self, access_token: &str) -> Result<Vec<CalendarProviderCalendar>, CalendarError> {
    let mut calendars = Vec::new();
    let mut page_token: Option<String> = None;
    let mut seen_tokens: HashSet<String> = HashSet::new();
    for _ in 0..MAX_GOOGLE_PAGES {
      let mut url = Url::parse(&format!("{}/users/me/calendarList", self.api_base()))
        .map_err(|err| CalendarError::Internal(format!("build google calendarList url: {err}")))?;
      url.query_pairs_mut().append_pair("maxResults", "250");
      if let Some(ref token) = page_token {
        url.query_pairs_mut().append_pair("pageToken", token);
      }
      let resp = self
        .send_request(
          Method::GET,
          url.as_str(),
          Self::bearer_headers(access_token, false),
          None,
          self.config.api_base_override.as_deref(),
          3,
        )
        .await?;
      let text = String::from_utf8_lossy(&resp.body).into_owned();
      if !resp.status.is_success() {
        return Err(CalendarError::ProviderRequest {
          status: resp.status.as_u16(),
          message: text,
        });
      }
      let parsed: GoogleCalendarListResponse = serde_json::from_str(&text)
        .map_err(|err| CalendarError::Internal(format!("decode google calendarList: {err}")))?;
      if let Some(items) = parsed.items {
        for item in items {
          calendars.push(CalendarProviderCalendar {
            id: item.id,
            summary: item.summary,
            time_zone: item.time_zone,
            color_id: item.color_id,
            primary: item.primary.unwrap_or(false),
          });
        }
      }
      page_token = parsed.next_page_token.filter(|t| !t.is_empty());
      match page_token {
        Some(ref next) if seen_tokens.insert(next.clone()) => {}
        _ => break,
      }
    }
    Ok(calendars)
  }
  pub async fn list_events(
    &self,
    access_token: &str,
    calendar_id: &str,
    sync_token: Option<&str>,
    time_min: Option<&str>,
    time_max: Option<&str>,
  ) -> Result<CalendarProviderListEventsResult, CalendarError> {
    let mut events = Vec::new();
    let mut page_token: Option<String> = None;
    let mut next_sync_token: Option<String> = None;
    let mut seen_tokens: HashSet<String> = HashSet::new();
    let encoded_cal_id = encode_path_segment(calendar_id)?;
    for _ in 0..MAX_GOOGLE_PAGES {
      let mut url = Url::parse(&format!("{}/calendars/{encoded_cal_id}/events", self.api_base()))
        .map_err(|err| CalendarError::Internal(format!("build google events url: {err}")))?;
      {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("singleEvents", "true");
        pairs.append_pair("showDeleted", "true");
        pairs.append_pair("maxResults", "2500");
        if let Some(st) = sync_token {
          pairs.append_pair("syncToken", st);
        } else {
          if let Some(min) = time_min {
            pairs.append_pair("timeMin", min);
          }
          if let Some(max) = time_max {
            pairs.append_pair("timeMax", max);
          }
          pairs.append_pair("orderBy", "startTime");
        }
        if let Some(ref pt) = page_token {
          pairs.append_pair("pageToken", pt);
        }
      }
      let resp = self
        .send_request(
          Method::GET,
          url.as_str(),
          Self::bearer_headers(access_token, false),
          None,
          self.config.api_base_override.as_deref(),
          3,
        )
        .await?;
      let text = String::from_utf8_lossy(&resp.body).into_owned();
      if !resp.status.is_success() {
        if resp.status.as_u16() == 410 {
          return Err(CalendarError::SyncTokenInvalid(text));
        }
        return Err(CalendarError::ProviderRequest {
          status: resp.status.as_u16(),
          message: text,
        });
      }
      let parsed: GoogleEventsResponse = serde_json::from_str(&text)
        .map_err(|err| CalendarError::Internal(format!("decode google events response: {err}")))?;
      if let Some(items) = parsed.items {
        for raw_val in items {
          let Ok(item) = serde_json::from_value::<GoogleEventItem>(raw_val.clone()) else {
            continue;
          };
          let start = item
            .start
            .map(|t| CalendarProviderEventTime {
              date_time: t.date_time,
              date: t.date,
              time_zone: t.time_zone,
            })
            .unwrap_or_default();
          let end = item
            .end
            .map(|t| CalendarProviderEventTime {
              date_time: t.date_time,
              date: t.date,
              time_zone: t.time_zone,
            })
            .unwrap_or_default();
          let original_start_time = item.original_start_time.map(|t| CalendarProviderEventTime {
            date_time: t.date_time,
            date: t.date,
            time_zone: t.time_zone,
          });
          events.push(CalendarProviderEvent {
            id: item.id,
            status: item.status,
            etag: item.etag,
            summary: item.summary,
            description: item.description,
            location: item.location,
            updated: item.updated,
            recurring_event_id: item.recurring_event_id,
            original_start_time,
            start,
            end,
            raw: CalendarProviderEventRaw::Json(raw_val),
          });
        }
      }
      page_token = parsed.next_page_token.filter(|t| !t.is_empty());
      if parsed.next_sync_token.is_some() {
        next_sync_token = parsed.next_sync_token;
      }
      match page_token {
        Some(ref next) if seen_tokens.insert(next.clone()) => {}
        _ => break,
      }
    }
    Ok(CalendarProviderListEventsResult {
      events,
      next_sync_token,
    })
  }
  pub async fn watch_calendar(
    &self,
    access_token: &str,
    calendar_id: &str,
    address: &str,
    token: Option<&str>,
    channel_id: &str,
  ) -> Result<CalendarProviderWatchResult, CalendarError> {
    let encoded_cal_id = encode_path_segment(calendar_id)?;
    let url = format!("{}/calendars/{encoded_cal_id}/events/watch", self.api_base());
    let payload = json!({
      "id": channel_id,
      "type": "web_hook",
      "address": address,
      "token": token,
    });
    let resp = self
      .send_request(
        Method::POST,
        &url,
        Self::bearer_headers(access_token, true),
        Some(payload.to_string().into_bytes()),
        self.config.api_base_override.as_deref(),
        0,
      )
      .await?;
    let text = String::from_utf8_lossy(&resp.body).into_owned();
    if !resp.status.is_success() {
      return Err(CalendarError::ProviderRequest {
        status: resp.status.as_u16(),
        message: text,
      });
    }
    let parsed: GoogleWatchResponse = serde_json::from_str(&text)
      .map_err(|err| CalendarError::Internal(format!("decode google watch response: {err}")))?;
    let expiration = parsed
      .expiration
      .as_deref()
      .and_then(|raw| raw.parse::<i64>().ok())
      .and_then(DateTime::<Utc>::from_timestamp_millis);
    Ok(CalendarProviderWatchResult {
      channel_id: parsed.id,
      resource_id: parsed.resource_id,
      expiration,
    })
  }
  pub async fn stop_channel(
    &self,
    access_token: &str,
    channel_id: &str,
    resource_id: &str,
  ) -> Result<(), CalendarError> {
    let url = format!("{}/channels/stop", self.api_base());
    let payload = json!({
      "id": channel_id,
      "resourceId": resource_id,
    });
    let resp = self
      .send_request(
        Method::POST,
        &url,
        Self::bearer_headers(access_token, true),
        Some(payload.to_string().into_bytes()),
        self.config.api_base_override.as_deref(),
        0,
      )
      .await?;
    let text = String::from_utf8_lossy(&resp.body).into_owned();
    if !resp.status.is_success() {
      return Err(CalendarError::ProviderRequest {
        status: resp.status.as_u16(),
        message: text,
      });
    }
    Ok(())
  }
}
#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn path_segment_encoder_uses_rfc3986_and_rejects_traversal() {
    assert_eq!(
      encode_path_segment("team calendar@group.com").unwrap(),
      "team%20calendar%40group.com"
    );
    assert!(encode_path_segment("").is_err());
    assert!(encode_path_segment(".").is_err());
    assert!(encode_path_segment("..").is_err());
  }
}
