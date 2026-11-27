//! Per-handler and session `x-affine-version` client version guard aligned 1:1
//! with `v0.27.5` `core/version/` and `core/auth/guard.ts`.

mod npm_semver_compat;

use std::collections::HashSet;
use std::sync::{LazyLock, Mutex};

use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use serde_json::Value;

pub(crate) use self::npm_semver_compat::is_newer_semver;
use self::npm_semver_compat::{SemverRange, parse_semver, trim_ecmascript};
use crate::legacy_compat::errors::LegacyErrorEnvelope;
use crate::rest::envelope_to_http_response;

/// HTTP request header carrying the client version string.
pub const CLIENT_VERSION_HEADER: &str = "x-affine-version";
/// AppConfig key enabling or disabling client version checks.
pub const CLIENT_VERSION_CONTROL_ENABLED_KEY: &str = "client.versionControl.enabled";
/// AppConfig key specifying the allowed semver range.
pub const CLIENT_VERSION_CONTROL_REQUIRED_VERSION_KEY: &str = "client.versionControl.requiredVersion";
/// Default required semver range when `client.versionControl.requiredVersion` is unset.
pub const DEFAULT_REQUIRED_CLIENT_VERSION: &str = ">=0.25.0";
/// Built-in hard floor enforced for ordinary semver clients even when config relaxes the range.
pub const HARD_REQUIRED_VERSION: &str = ">=0.25.0";
/// Required version label returned when a canary date build is outside the allowed age window.
pub const CANARY_REQUIRED_VERSION: &str = "canary (within 2 months)";
/// Maximum age in days for a canary date client version.
pub const CANARY_CLIENT_VERSION_MAX_AGE_DAYS: i64 = 62;
/// Maximum allowed future clock skew in days for a canary date client version.
pub const CANARY_CLIENT_VERSION_MAX_FUTURE_SKEW_DAYS: i64 = 2;

const DAY_MS: i64 = 24 * 60 * 60 * 1000;

/// Effective `client.versionControl` settings from `AppConfig`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClientVersionControlConfig {
  pub enabled: bool,
  pub required_version: String,
}

impl Default for ClientVersionControlConfig {
  fn default() -> Self {
    Self {
      enabled: false,
      required_version: DEFAULT_REQUIRED_CLIENT_VERSION.to_owned(),
    }
  }
}

impl ClientVersionControlConfig {
  /// Extracts `client.versionControl.{enabled, requiredVersion}` from an
  /// effective `AppConfig` JSON object.
  pub fn from_app_config(app_config: &Value) -> Self {
    let vc = app_config.get("client").and_then(|c| c.get("versionControl"));
    let enabled = vc
      .and_then(|v| v.get("enabled"))
      .and_then(Value::as_bool)
      .unwrap_or(false);
    let required_version = vc
      .and_then(|v| v.get("requiredVersion"))
      .and_then(Value::as_str)
      .map(str::to_owned)
      .unwrap_or_else(|| DEFAULT_REQUIRED_CLIENT_VERSION.to_owned());
    Self {
      enabled,
      required_version,
    }
  }
}

/// Error produced by client version checks, matching `v0.27.5`
/// `UNSUPPORTED_CLIENT_VERSION`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VersionGuardError {
  UnsupportedClientVersion {
    client_version: String,
    required_version: String,
  },
}

impl VersionGuardError {
  pub fn into_parts(self) -> (String, String) {
    match self {
      Self::UnsupportedClientVersion {
        client_version,
        required_version,
      } => (client_version, required_version),
    }
  }

  /// Converts the error into the exact `v0.27.5` `UserFriendlyError` envelope.
  pub fn into_envelope(self) -> LegacyErrorEnvelope {
    match self {
      Self::UnsupportedClientVersion {
        client_version,
        required_version,
      } => LegacyErrorEnvelope {
        status: StatusCode::FORBIDDEN.as_u16(),
        code: "Forbidden".into(),
        error_type: "ACTION_FORBIDDEN".into(),
        name: "UNSUPPORTED_CLIENT_VERSION".into(),
        message: format!(
          "Unsupported client with version [{client_version}], required version is [{required_version}]."
        ),
        data: Some(serde_json::json!({
          "clientVersion": client_version,
          "requiredVersion": required_version,
        })),
      },
    }
  }

  /// Converts the error into a UTF-8 JSON HTTP response.
  pub fn into_http_response(self) -> Response {
    envelope_to_http_response(self.into_envelope())
  }
}

/// Extracts the first `x-affine-version` header value from `headers`.
///
/// Returns `None` only when the header is absent or not valid UTF-8. An
/// explicitly present empty header returns `Some("")`, matching `v0.27.5`
/// `getClientVersionFromRequest` so `"" ?? session.refreshClientVersion` does
/// not silently fall back to the session version.
pub fn verify_session_client_version_now(
  headers: &HeaderMap,
  refresh_client_version: Option<&str>,
  sign_in_client_version: Option<&str>,
  cfg: &ClientVersionControlConfig,
  allow_canary: bool,
) -> Result<(), VersionGuardError> {
  verify_session_client_version_at(
    headers,
    refresh_client_version,
    sign_in_client_version,
    cfg,
    allow_canary,
    Utc::now(),
  )
}

pub fn extract_client_version(headers: &HeaderMap) -> Option<&str> {
  headers
    .get(CLIENT_VERSION_HEADER)
    .and_then(|v| v.to_str().ok())
    .map(|s| s.trim_matches(|c: char| c == ' ' || c == '\t'))
}

/// Extracts a non-empty `x-affine-version` header value for persistence in
/// session metadata columns.
pub fn extract_non_empty_client_version(headers: &HeaderMap) -> Option<String> {
  extract_client_version(headers)
    .filter(|s| !s.is_empty())
    .map(str::to_owned)
}

/// Parsed canary date version (for example `2026.2.6-canary.015`).
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CanaryDateClientVersion {
  pub raw: String,
  pub normalized: String,
  pub date_ms: i64,
}

/// Parses a canary date client version matching
/// `^v?(\d{4})\.(\d{1,2})\.(\d{1,2})-canary\.(\d+)(?:\+.*)?$`.
pub fn parse_canary_date_client_version(version: &str) -> Option<CanaryDateClientVersion> {
  let raw = trim_ecmascript(version);
  let without_v = raw.strip_prefix('v').or_else(|| raw.strip_prefix('V')).unwrap_or(raw);
  let without_build = without_v.split('+').next()?;
  let lower = without_build.to_ascii_lowercase();
  let (date_part, build_part) = lower.split_once("-canary.")?;
  if build_part.is_empty() || !build_part.bytes().all(|b| b.is_ascii_digit()) {
    return None;
  }

  let mut date_parts = date_part.split('.');
  let year_str = date_parts.next()?;
  let month_str = date_parts.next()?;
  let day_str = date_parts.next()?;
  if date_parts.next().is_some() {
    return None;
  }
  if year_str.len() != 4 || !(1..=2).contains(&month_str.len()) || !(1..=2).contains(&day_str.len()) {
    return None;
  }
  if !year_str.bytes().all(|b| b.is_ascii_digit())
    || !month_str.bytes().all(|b| b.is_ascii_digit())
    || !day_str.bytes().all(|b| b.is_ascii_digit())
  {
    return None;
  }

  let year: i32 = year_str.parse().ok()?;
  let month: u32 = month_str.parse().ok()?;
  let day: u32 = day_str.parse().ok()?;
  let naive = NaiveDate::from_ymd_opt(year, month, day)?;
  let dt = Utc.from_utc_datetime(&naive.and_hms_opt(0, 0, 0)?);
  let normalized_build = build_part.trim_start_matches('0');
  let normalized_build = if normalized_build.is_empty() {
    "0"
  } else {
    normalized_build
  };

  Some(CanaryDateClientVersion {
    raw: raw.to_owned(),
    normalized: format!("{year}.{month}.{day}-canary.{normalized_build}"),
    date_ms: dt.timestamp_millis(),
  })
}

/// Result of checking a version string against the canary date window.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CanaryClientVersionCheck {
  NotMatched,
  Matched { allowed: bool, normalized: String },
}

/// Checks whether `version` is a canary date version within the allowed window
/// `[now - 62 days, now + 2 days]`.
pub fn check_canary_date_client_version(version: &str, now: DateTime<Utc>) -> CanaryClientVersionCheck {
  let Some(parsed) = parse_canary_date_client_version(version) else {
    return CanaryClientVersionCheck::NotMatched;
  };
  let age_ms = now.timestamp_millis() - parsed.date_ms;
  let max_age_ms = CANARY_CLIENT_VERSION_MAX_AGE_DAYS * DAY_MS;
  let max_future_skew_ms = CANARY_CLIENT_VERSION_MAX_FUTURE_SKEW_DAYS * DAY_MS;
  CanaryClientVersionCheck::Matched {
    allowed: age_ms <= max_age_ms && age_ms >= -max_future_skew_ms,
    normalized: parsed.normalized,
  }
}

/// Most distinct invalid ranges whose first error is logged; later ones are
/// not logged, so a changing config cannot grow the set without bound.
const MAX_LOGGED_INVALID_RANGES: usize = 256;

fn log_invalid_version_range_once(version_range: &str) {
  static LOGGED: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));
  if let Ok(mut logged) = LOGGED.lock()
    && logged.len() < MAX_LOGGED_INVALID_RANGES
    && logged.insert(version_range.to_owned())
  {
    tracing::error!(version_range = %version_range, "invalid version range");
  }
}

static HARD_REQUIRED_RANGE: LazyLock<Option<SemverRange>> = LazyLock::new(|| SemverRange::parse(HARD_REQUIRED_VERSION));

/// Core client version evaluation matching `core/version/service.ts` and
/// `core/auth/guard.ts:242-282` 1:1.
pub fn evaluate_client_version_at(
  client_version: Option<&str>,
  required_version: &str,
  allow_canary: bool,
  now: DateTime<Utc>,
) -> Result<(), VersionGuardError> {
  if allow_canary && let Some(raw) = client_version {
    match check_canary_date_client_version(raw, now) {
      CanaryClientVersionCheck::Matched { allowed: true, .. } => return Ok(()),
      CanaryClientVersionCheck::Matched { allowed: false, .. } => {
        return Err(VersionGuardError::UnsupportedClientVersion {
          client_version: raw.to_owned(),
          required_version: CANARY_REQUIRED_VERSION.to_owned(),
        });
      }
      CanaryClientVersionCheck::NotMatched => {}
    }
  }

  let parsed_client = client_version.and_then(parse_semver);

  match SemverRange::parse(required_version) {
    Some(config_range) => {
      let ok = parsed_client
        .as_ref()
        .is_some_and(|v| config_range.satisfies_include_prerelease(v));
      if !ok {
        return Err(VersionGuardError::UnsupportedClientVersion {
          client_version: client_version.unwrap_or("unset_or_invalid").to_owned(),
          required_version: required_version.to_owned(),
        });
      }
    }
    None => log_invalid_version_range_once(required_version),
  }

  if let Some(hard_range) = HARD_REQUIRED_RANGE.as_ref() {
    let ok = parsed_client
      .as_ref()
      .is_some_and(|v| hard_range.satisfies_include_prerelease(v));
    if !ok {
      return Err(VersionGuardError::UnsupportedClientVersion {
        client_version: client_version.unwrap_or("unset_or_invalid").to_owned(),
        required_version: HARD_REQUIRED_VERSION.to_owned(),
      });
    }
  }

  Ok(())
}

/// Per-handler client version check (`@UseNamedGuard('version')`) using the
/// current UTC clock.
pub fn verify_client_version(
  headers: &HeaderMap,
  minimum_version: Option<&str>,
  allow_canary: bool,
) -> Result<(), VersionGuardError> {
  verify_client_version_at(headers, minimum_version, allow_canary, Utc::now())
}

/// Deterministic clock variant of [`verify_client_version`].
pub fn verify_client_version_at(
  headers: &HeaderMap,
  minimum_version: Option<&str>,
  allow_canary: bool,
  now: DateTime<Utc>,
) -> Result<(), VersionGuardError> {
  let client_version = extract_client_version(headers);
  let required = minimum_version.unwrap_or(HARD_REQUIRED_VERSION);
  evaluate_client_version_at(client_version, required, allow_canary, now)
}

/// Per-handler version guard honoring `client.versionControl.{enabled, requiredVersion}`.
pub fn verify_client_version_with_config(
  headers: &HeaderMap,
  config: &ClientVersionControlConfig,
  allow_canary: bool,
  now: DateTime<Utc>,
) -> Result<(), VersionGuardError> {
  if !config.enabled {
    return Ok(());
  }
  verify_client_version_at(headers, Some(&config.required_version), allow_canary, now)
}

/// Authenticated session version check matching `core/auth/guard.ts:176-220`:
/// resolves client version in order `header -> refresh_client_version -> sign_in_client_version`.
pub fn verify_session_client_version_at(
  headers: &HeaderMap,
  session_refresh_client_version: Option<&str>,
  session_sign_in_client_version: Option<&str>,
  config: &ClientVersionControlConfig,
  allow_canary: bool,
  now: DateTime<Utc>,
) -> Result<(), VersionGuardError> {
  if !config.enabled {
    return Ok(());
  }
  let client_version = extract_client_version(headers)
    .or(session_refresh_client_version)
    .or(session_sign_in_client_version);
  evaluate_client_version_at(client_version, &config.required_version, allow_canary, now)
}

#[cfg(test)]
mod tests {
  use axum::http::HeaderValue;
  use chrono::Duration;

  use super::*;

  fn headers_with_version(ver: Option<&str>) -> HeaderMap {
    let mut h = HeaderMap::new();
    if let Some(v) = ver {
      h.insert(CLIENT_VERSION_HEADER, HeaderValue::from_str(v).unwrap());
    }
    h
  }

  fn fixed_now() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 11, 24, 12, 0, 0).unwrap()
  }

  fn make_canary_date_version(dt: DateTime<Utc>, build: &str) -> String {
    format!(
      "{}.{}.{}-canary.{build}",
      dt.format("%Y"),
      dt.format("%-m"),
      dt.format("%-d")
    )
  }

  #[test]
  fn app_config_reads_client_version_control_keys_with_exact_defaults() {
    let defaults = ClientVersionControlConfig::from_app_config(&serde_json::json!({}));
    assert!(!defaults.enabled);
    assert_eq!(defaults.required_version, ">=0.25.0");

    let configured = ClientVersionControlConfig::from_app_config(&serde_json::json!({
      "client": {
        "versionControl": {
          "enabled": true,
          "requiredVersion": ">=0.26.0 <=0.27.0"
        }
      }
    }));
    assert!(configured.enabled);
    assert_eq!(configured.required_version, ">=0.26.0 <=0.27.0");
  }

  #[test]
  fn version_guard_table_matches_v0275_version_spec_and_npm_semver_ranges() {
    let now = fixed_now();
    let recent_canary = make_canary_date_version(now, "015");
    let old_canary = make_canary_date_version(now - Duration::days(CANARY_CLIENT_VERSION_MAX_AGE_DAYS + 1), "015");

    let disabled = ClientVersionControlConfig {
      enabled: false,
      required_version: ">=0.25.0".into(),
    };
    for hdr in [None, Some(""), Some("0.20.0"), Some("invalid")] {
      assert!(verify_client_version_with_config(&headers_with_version(hdr), &disabled, false, now).is_ok());
    }

    type VersionCase<'a> = (&'a str, &'a str, Option<&'a str>, bool, Result<(), (&'a str, &'a str)>);
    let cases: &[VersionCase<'_>] = &[
      ("exact floor", ">=0.25.0", Some("0.25.0"), false, Ok(())),
      ("higher release", ">=0.25.0", Some("0.26.0"), false, Ok(())),
      (
        "prerelease higher minor",
        ">=0.25.0",
        Some("0.26.0-canary.1"),
        false,
        Ok(()),
      ),
      ("beta higher minor", ">=0.25.0", Some("0.26.0-beta.2"), false, Ok(())),
      (
        "prerelease below floor",
        ">=0.25.0",
        Some("0.25.0-canary.1"),
        false,
        Err(("0.25.0-canary.1", ">=0.25.0")),
      ),
      (
        "missing header",
        ">=0.25.0",
        None,
        false,
        Err(("unset_or_invalid", ">=0.25.0")),
      ),
      (
        "explicit empty header",
        ">=0.25.0",
        Some(""),
        false,
        Err(("", ">=0.25.0")),
      ),
      (
        "invalid header",
        ">=0.25.0",
        Some("invalid"),
        false,
        Err(("invalid", ">=0.25.0")),
      ),
      (
        "invalid range allows >=0.25.0",
        "invalid",
        Some("0.25.0"),
        false,
        Ok(()),
      ),
      (
        "invalid range rejects invalid header",
        "invalid",
        Some("invalid"),
        false,
        Err(("invalid", ">=0.25.0")),
      ),
      (
        "relaxed config still enforces hard floor",
        ">=0.20.0",
        Some("0.24.9"),
        false,
        Err(("0.24.9", ">=0.25.0")),
      ),
      (
        "relaxed config allows 0.25.0",
        ">=0.20.0",
        Some("0.25.0"),
        false,
        Ok(()),
      ),
      (
        "below bounded range",
        ">=0.26.0 <=0.27.0",
        Some("0.25.0"),
        false,
        Err(("0.25.0", ">=0.26.0 <=0.27.0")),
      ),
      (
        "above bounded range",
        ">=0.25.0 <=0.26.0",
        Some("0.27.0"),
        false,
        Err(("0.27.0", ">=0.25.0 <=0.26.0")),
      ),
      // Full npm semver.Range syntax coverage
      ("whitespace after op", ">= 0.26.0", Some("0.26.1"), false, Ok(())),
      (
        "whitespace after op rejects lower",
        ">= 0.26.0",
        Some("0.25.9"),
        false,
        Err(("0.25.9", ">= 0.26.0")),
      ),
      (
        "caret allows minor prerelease",
        "^1.2.0",
        Some("1.9.0-canary.1"),
        false,
        Ok(()),
      ),
      (
        "caret rejects next major",
        "^1.2.0",
        Some("2.0.0"),
        false,
        Err(("2.0.0", "^1.2.0")),
      ),
      (
        "caret rejects next major prerelease",
        "^1.2.0",
        Some("2.0.0-alpha.1"),
        false,
        Err(("2.0.0-alpha.1", "^1.2.0")),
      ),
      ("tilde allows patch", "~0.26.0", Some("0.26.9"), false, Ok(())),
      (
        "tilde rejects next minor",
        "~0.26.0",
        Some("0.27.0-alpha.1"),
        false,
        Err(("0.27.0-alpha.1", "~0.26.0")),
      ),
      ("x-range matches minor", "0.26.x", Some("0.26.5"), false, Ok(())),
      (
        "x-range rejects other minor",
        "0.26.x",
        Some("0.27.0"),
        false,
        Err(("0.27.0", "0.26.x")),
      ),
      ("hyphen range matches", "0.25.0 - 0.27.0", Some("0.26.3"), false, Ok(())),
      (
        "hyphen range rejects above",
        "0.25.0 - 0.27.0",
        Some("0.27.1"),
        false,
        Err(("0.27.1", "0.25.0 - 0.27.0")),
      ),
      // node-semver partial lower bound (-0 sentinel) & build metadata validation
      (
        "partial gte allows prerelease",
        ">=0.26",
        Some("0.26.0-canary.1"),
        false,
        Ok(()),
      ),
      (
        "x-range allows prerelease",
        "0.26.x",
        Some("0.26.0-canary.1"),
        false,
        Ok(()),
      ),
      (
        "partial eq allows prerelease",
        "0.26",
        Some("0.26.0-canary.1"),
        false,
        Ok(()),
      ),
      (
        "partial tilde rejects lower prerelease in semver@7.8.1",
        "~0.26",
        Some("0.26.0-canary.1"),
        false,
        Err(("0.26.0-canary.1", "~0.26")),
      ),
      (
        "partial caret allows prerelease",
        "^1.2",
        Some("1.2.0-beta.1"),
        false,
        Ok(()),
      ),
      (
        "partial gt allows next prerelease",
        ">0.26",
        Some("0.27.0-canary.1"),
        false,
        Ok(()),
      ),
      (
        "partial hyphen allows prerelease",
        "0.26 - 0.27.0",
        Some("0.26.0-canary.1"),
        false,
        Ok(()),
      ),
      (
        "partial hyphen 0.25 prerelease hits hard floor",
        "0.25 - 0.26.0",
        Some("0.25.0-canary.1"),
        false,
        Err(("0.25.0-canary.1", ">=0.25.0")),
      ),
      ("caret zero allows 0.25.0", "^0", Some("0.25.0"), false, Ok(())),
      (
        "caret zero 0.0.0-a hits hard floor",
        "^0",
        Some("0.0.0-a"),
        false,
        Err(("0.0.0-a", ">=0.25.0")),
      ),
      (
        "valid build metadata",
        ">=1.0.0",
        Some("1.2.3+build.meta-1"),
        false,
        Ok(()),
      ),
      (
        "zero-major caret allows prerelease in semver@7.8.1",
        "^0.26.0",
        Some("0.26.0-canary.1"),
        false,
        Ok(()),
      ),
      (
        "full tilde rejects lower prerelease",
        "~0.26.0",
        Some("0.26.0-canary.1"),
        false,
        Err(("0.26.0-canary.1", "~0.26.0")),
      ),
      (
        "full gte rejects lower prerelease",
        ">=0.26.0",
        Some("0.26.0-canary.1"),
        false,
        Err(("0.26.0-canary.1", ">=0.26.0")),
      ),
      (
        "full eq rejects lower prerelease",
        "=0.26.0",
        Some("0.26.0-canary.1"),
        false,
        Err(("0.26.0-canary.1", "=0.26.0")),
      ),
      (
        "partial lte rejects next minor prerelease",
        "<=0.26",
        Some("0.27.0-canary.1"),
        false,
        Err(("0.27.0-canary.1", "<=0.26")),
      ),
      (
        "partial lt rejects target prerelease",
        "<0.27",
        Some("0.27.0-canary.1"),
        false,
        Err(("0.27.0-canary.1", "<0.27")),
      ),
      (
        "x-range rejects next minor prerelease",
        "0.26.x",
        Some("0.27.0-canary.1"),
        false,
        Err(("0.27.0-canary.1", "0.26.x")),
      ),
      (
        "empty build metadata segment rejected",
        ">=1.0.0",
        Some("1.2.3+build..meta"),
        false,
        Err(("1.2.3+build..meta", ">=1.0.0")),
      ),
      (
        "trailing plus build metadata rejected",
        ">=1.0.0",
        Some("1.2.3+"),
        false,
        Err(("1.2.3+", ">=1.0.0")),
      ),
      (
        "invalid char in build metadata rejected",
        ">=1.0.0",
        Some("1.2.3+bad_char"),
        false,
        Err(("1.2.3+bad_char", ">=1.0.0")),
      ),
      ("recent canary allowed", ">=0.25.0", Some(&recent_canary), true, Ok(())),
      (
        "old canary rejected",
        ">=0.25.0",
        Some(&old_canary),
        true,
        Err((&old_canary, CANARY_REQUIRED_VERSION)),
      ),
    ];

    for (label, required, header, allow_canary, expected) in cases {
      let cfg = ClientVersionControlConfig {
        enabled: true,
        required_version: (*required).to_owned(),
      };
      let res = verify_client_version_with_config(&headers_with_version(*header), &cfg, *allow_canary, now);
      match expected {
        Ok(()) => assert!(res.is_ok(), "case={label} failed with {res:?}"),
        Err((exp_client, exp_req)) => {
          let err = res.expect_err(&format!("case={label} expected error"));
          let env = err.into_envelope();
          assert_eq!(env.status, 403, "case={label}");
          assert_eq!(env.name, "UNSUPPORTED_CLIENT_VERSION", "case={label}");
          assert_eq!(env.error_type, "ACTION_FORBIDDEN", "case={label}");
          assert_eq!(
            env.message,
            format!("Unsupported client with version [{exp_client}], required version is [{exp_req}]."),
            "case={label}"
          );
        }
      }
    }
  }

  #[test]
  fn session_version_fallback_chain_hard_floor_and_explicit_empty_header() {
    let now = fixed_now();
    let relaxed_cfg = ClientVersionControlConfig {
      enabled: true,
      required_version: ">=0.20.0".into(),
    };

    // Header takes precedence over session refresh/sign-in versions.
    assert!(
      verify_session_client_version_at(
        &headers_with_version(Some("0.25.0")),
        Some("0.20.0"),
        Some("0.19.0"),
        &relaxed_cfg,
        false,
        now,
      )
      .is_ok()
    );

    // Explicit empty header ("") does NOT fall back to session version.
    let empty_err = verify_session_client_version_at(
      &headers_with_version(Some("")),
      Some("0.26.0"),
      Some("0.26.0"),
      &relaxed_cfg,
      false,
      now,
    )
    .unwrap_err();
    assert_eq!(
      empty_err,
      VersionGuardError::UnsupportedClientVersion {
        client_version: String::new(),
        required_version: ">=0.20.0".into(),
      }
    );

    // Absent header falls back to refresh_client_version, then sign_in_client_version, enforcing >=0.25.0 hard floor.
    let err = verify_session_client_version_at(
      &HeaderMap::new(),
      Some("0.24.0"),
      Some("0.26.0"),
      &relaxed_cfg,
      false,
      now,
    )
    .unwrap_err();
    assert_eq!(
      err,
      VersionGuardError::UnsupportedClientVersion {
        client_version: "0.24.0".into(),
        required_version: HARD_REQUIRED_VERSION.into(),
      }
    );

    assert!(
      verify_session_client_version_at(&HeaderMap::new(), None, Some("0.26.0"), &relaxed_cfg, false, now).is_ok()
    );
  }

  #[test]
  fn semver_7_8_1_locked_vectors_match_1_to_1() {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ExpectedOutcome {
      allowed: bool,
      client_version: Option<String>,
      required_version: Option<String>,
    }
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Vector {
      range: String,
      client_version: Option<String>,
      expected: ExpectedOutcome,
    }
    #[derive(serde::Deserialize)]
    struct Fixture {
      vectors: Vec<Vector>,
    }

    let fixture: Fixture = serde_json::from_str(include_str!("../../../tests/fixtures/semver_7_8_1_vectors.json"))
      .expect("parse semver_7_8_1_vectors.json");
    assert_eq!(fixture.vectors.len(), 155);
    let now = fixed_now();

    for (idx, v) in fixture.vectors.iter().enumerate() {
      let actual = evaluate_client_version_at(v.client_version.as_deref(), &v.range, false, now);
      if v.expected.allowed {
        assert!(
          actual.is_ok(),
          "vector[{idx}] range={:?} client={:?} expected allowed, got {actual:?}",
          v.range,
          v.client_version
        );
      } else {
        let err = actual.expect_err(&format!(
          "vector[{idx}] range={:?} client={:?} expected rejected, got Ok",
          v.range, v.client_version
        ));
        let VersionGuardError::UnsupportedClientVersion {
          client_version,
          required_version,
        } = err;
        assert_eq!(
          Some(client_version),
          v.expected.client_version,
          "vector[{idx}] range={:?} client={:?} clientVersion mismatch",
          v.range,
          v.client_version
        );
        assert_eq!(
          Some(required_version),
          v.expected.required_version,
          "vector[{idx}] range={:?} client={:?} requiredVersion mismatch",
          v.range,
          v.client_version
        );
      }
    }
  }

  #[test]
  fn is_newer_semver_compares_versions_and_falls_back_on_non_semver() {
    assert!(is_newer_semver("0.26.0", "0.27.5"));
    assert!(!is_newer_semver("0.27.5", "0.27.5"));
    assert!(!is_newer_semver("0.27.5", "0.26.0"));
    assert!(is_newer_semver("0.27.5-beta.1", "0.27.5"));
    assert!(!is_newer_semver("0.27.5", ""));
    assert!(is_newer_semver("custom-a", "custom-b"));
    assert!(!is_newer_semver("custom-a", "custom-a"));
  }
}
