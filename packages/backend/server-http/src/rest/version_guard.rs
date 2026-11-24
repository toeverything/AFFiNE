//! Per-handler and session `x-affine-version` client version guard aligned 1:1
//! with `v0.27.5` `core/version/` and `core/auth/guard.ts`.

use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use serde_json::Value;

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

fn is_ecmascript_whitespace(c: char) -> bool {
  matches!(
    c,
    '\u{0009}' | '\u{000A}' | '\u{000B}' | '\u{000C}' | '\u{000D}' | '\u{0020}' | '\u{00A0}' | '\u{1680}' | '\u{2000}'
      ..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}'
  )
}

fn trim_ecmascript(s: &str) -> &str {
  s.trim_matches(is_ecmascript_whitespace)
}

fn split_ecmascript_whitespace(s: &str) -> impl Iterator<Item = &str> {
  s.split(is_ecmascript_whitespace).filter(|part| !part.is_empty())
}

/// Extracts the first `x-affine-version` header value from `headers`.
///
/// Returns `None` only when the header is absent or not valid UTF-8. An
/// explicitly present empty header returns `Some("")`, matching `v0.27.5`
/// `getClientVersionFromRequest` so `"" ?? session.refreshClientVersion` does
/// not silently fall back to the session version.
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

#[derive(Clone, Debug)]
enum PrereleaseIdent {
  SafeInt(u64),
  BigNumeric { raw: String, value: f64 },
  AlphaNumeric(String),
}

impl PrereleaseIdent {
  fn same_js_value(&self, other: &Self) -> bool {
    match (self, other) {
      (Self::SafeInt(a), Self::SafeInt(b)) => a == b,
      (Self::BigNumeric { raw: a, .. }, Self::BigNumeric { raw: b, .. }) => a == b,
      (Self::AlphaNumeric(a), Self::AlphaNumeric(b)) => a == b,
      _ => false,
    }
  }

  fn numeric_f64(&self) -> Option<f64> {
    match self {
      Self::SafeInt(n) => Some(*n as f64),
      Self::BigNumeric { value, .. } => Some(*value),
      Self::AlphaNumeric(_) => None,
    }
  }

  fn compare_identifiers_js(&self, other: &Self) -> std::cmp::Ordering {
    match (self.numeric_f64(), other.numeric_f64()) {
      (Some(a), Some(b)) => a.total_cmp(&b),
      (Some(_), None) => std::cmp::Ordering::Less,
      (None, Some(_)) => std::cmp::Ordering::Greater,
      (None, None) => match (self, other) {
        (Self::AlphaNumeric(a), Self::AlphaNumeric(b)) => a.cmp(b),
        _ => std::cmp::Ordering::Equal,
      },
    }
  }
}

#[derive(Clone, Debug)]
struct Semver {
  major: u64,
  minor: u64,
  patch: u64,
  prerelease: Vec<PrereleaseIdent>,
}

impl Semver {
  fn release(major: u64, minor: u64, patch: u64) -> Self {
    Self {
      major,
      minor,
      patch,
      prerelease: Vec::new(),
    }
  }

  /// Smallest possible prerelease sentinel (`X.Y.Z-0`), matching npm
  /// `node-semver` exclusive upper bounds so `<2.0.0-0` rejects `2.0.0-alpha.1`
  /// even under `includePrerelease: true`.
  fn prerelease_zero(major: u64, minor: u64, patch: u64) -> Self {
    Self {
      major,
      minor,
      patch,
      prerelease: vec![PrereleaseIdent::SafeInt(0)],
    }
  }

  /// Matches `semver@7.8.1` `SemVer.prototype.compare` + `comparePre` 1:1.
  fn compare_semver(&self, other: &Self) -> std::cmp::Ordering {
    let main = (self.major, self.minor, self.patch).cmp(&(other.major, other.minor, other.patch));
    if main != std::cmp::Ordering::Equal {
      return main;
    }
    match (self.prerelease.is_empty(), other.prerelease.is_empty()) {
      (true, true) => std::cmp::Ordering::Equal,
      (true, false) => std::cmp::Ordering::Greater,
      (false, true) => std::cmp::Ordering::Less,
      (false, false) => {
        let mut i = 0;
        loop {
          match (self.prerelease.get(i), other.prerelease.get(i)) {
            (None, None) => return std::cmp::Ordering::Equal,
            (Some(_), None) => return std::cmp::Ordering::Greater,
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (Some(a), Some(b)) => {
              if a.same_js_value(b) {
                i += 1;
                continue;
              }
              return a.compare_identifiers_js(b);
            }
          }
        }
      }
    }
  }
}

impl PartialEq for Semver {
  fn eq(&self, other: &Self) -> bool {
    self.compare_semver(other) == std::cmp::Ordering::Equal
  }
}

impl Eq for Semver {}

impl Ord for Semver {
  fn cmp(&self, other: &Self) -> std::cmp::Ordering {
    self.compare_semver(other)
  }
}

impl PartialOrd for Semver {
  fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
    Some(self.cmp(other))
  }
}

const MAX_SEMVER_LENGTH: usize = 256;
const MAX_SAFE_BUILD_LENGTH: usize = 250;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

fn parse_strict_numeric(part: &str) -> Option<u64> {
  if part.is_empty() || !part.bytes().all(|b| b.is_ascii_digit()) {
    return None;
  }
  if part.len() > 1 && part.starts_with('0') {
    return None;
  }
  let val = part.parse::<u64>().ok()?;
  (val <= MAX_SAFE_INTEGER).then_some(val)
}

fn parse_prerelease_list(pre: &str) -> Option<Vec<PrereleaseIdent>> {
  if pre.is_empty() {
    return None;
  }
  let mut out = Vec::new();
  for ident in pre.split('.') {
    if ident.is_empty() || !ident.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
      return None;
    }
    if ident.bytes().all(|b| b.is_ascii_digit()) {
      if ident.len() > 1 && ident.starts_with('0') {
        return None;
      }
      if let Ok(n) = ident.parse::<u64>()
        && n < MAX_SAFE_INTEGER
      {
        out.push(PrereleaseIdent::SafeInt(n));
      } else {
        let value = ident.parse::<f64>().ok().filter(|v| v.is_finite())?;
        out.push(PrereleaseIdent::BigNumeric {
          raw: ident.to_owned(),
          value,
        });
      }
    } else {
      if ident.len() > MAX_SAFE_BUILD_LENGTH {
        return None;
      }
      out.push(PrereleaseIdent::AlphaNumeric(ident.to_owned()));
    }
  }
  Some(out)
}

fn is_valid_build_metadata(build: &str) -> bool {
  !build.is_empty()
    && build.split('.').all(|seg| {
      !seg.is_empty()
        && seg.len() <= MAX_SAFE_BUILD_LENGTH
        && seg.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    })
}

pub(crate) fn is_newer_semver(current: &str, candidate: &str) -> bool {
  let (c, n) = (current.trim(), candidate.trim());
  if n.is_empty() {
    return false;
  }
  match (parse_semver(c), parse_semver(n)) {
    (Some(cv), Some(nv)) => nv.compare_semver(&cv) == std::cmp::Ordering::Greater,
    _ => c != n,
  }
}

fn parse_semver(input: &str) -> Option<Semver> {
  if input.encode_utf16().count() > MAX_SEMVER_LENGTH {
    return None;
  }
  let trimmed = trim_ecmascript(input);
  let s = trimmed.strip_prefix('v').unwrap_or(trimmed);
  let (without_build, _) = match s.split_once('+') {
    Some((before, build)) => {
      if !is_valid_build_metadata(build) {
        return None;
      }
      (before, Some(build))
    }
    None => (s, None),
  };
  let (core, pre_opt) = match without_build.split_once('-') {
    Some((c, p)) => (c, Some(p)),
    None => (without_build, None),
  };
  let mut parts = core.split('.');
  let major = parse_strict_numeric(parts.next()?)?;
  let minor = parse_strict_numeric(parts.next()?)?;
  let patch = parse_strict_numeric(parts.next()?)?;
  if parts.next().is_some() {
    return None;
  }
  let prerelease = match pre_opt {
    Some(pre) => parse_prerelease_list(pre)?,
    None => Vec::new(),
  };
  Some(Semver {
    major,
    minor,
    patch,
    prerelease,
  })
}

fn is_wildcard(s: &str) -> bool {
  matches!(s, "*" | "x" | "X")
}

/// Strips all valid `+build` metadata segments matching `semver@7.8.1`
/// `BUILDSTRIPRE = \+[0-9A-Za-z-]{1,250}(?:\.[0-9A-Za-z-]{1,250})*`.
fn strip_build_metadata(input: &str) -> String {
  let bytes = input.as_bytes();
  let is_build_char = |b: u8| b.is_ascii_alphanumeric() || b == b'-';
  let mut out = String::with_capacity(input.len());
  let mut i = 0;
  while i < bytes.len() {
    if bytes[i] == b'+' {
      let mut j = i + 1;
      let mut seg_len = 0usize;
      while j < bytes.len() && is_build_char(bytes[j]) && seg_len < MAX_SAFE_BUILD_LENGTH {
        j += 1;
        seg_len += 1;
      }
      if seg_len > 0 {
        while j < bytes.len() && bytes[j] == b'.' {
          let dot_pos = j;
          let mut k = dot_pos + 1;
          let mut next_len = 0usize;
          while k < bytes.len() && is_build_char(bytes[k]) && next_len < MAX_SAFE_BUILD_LENGTH {
            k += 1;
            next_len += 1;
          }
          if next_len > 0 {
            j = k;
          } else {
            break;
          }
        }
        i = j;
        continue;
      }
    }
    let ch = input[i..].chars().next().unwrap();
    out.push(ch);
    i += ch.len_utf8();
  }
  out
}

#[derive(Clone, Debug)]
struct PartialVersion {
  major: Option<u64>,
  minor: Option<u64>,
  patch: Option<u64>,
  prerelease: Vec<PrereleaseIdent>,
}

fn parse_partial_version(input: &str) -> Option<PartialVersion> {
  let s = input
    .trim_start_matches(|c: char| c == 'v' || c == '=' || is_ecmascript_whitespace(c))
    .trim_end_matches(is_ecmascript_whitespace);
  if s.is_empty() {
    return None;
  }
  let (core, pre_opt) = match s.split_once('-') {
    Some((c, p)) => (c, Some(p)),
    None => (s, None),
  };
  let parts: Vec<&str> = core.split('.').collect();
  if parts.is_empty() || parts.len() > 3 {
    return None;
  }
  let parse_part = |s: &str| -> Option<Option<u64>> {
    if is_wildcard(s) {
      Some(None)
    } else {
      Some(Some(parse_strict_numeric(s)?))
    }
  };
  let raw_major = parse_part(parts[0])?;
  let raw_minor = if parts.len() >= 2 { parse_part(parts[1])? } else { None };
  let raw_patch = if parts.len() == 3 { parse_part(parts[2])? } else { None };

  // semver@7.8.1: xM = isX(M), xm = xM || isX(m), xp = xm || isX(p).
  let major = raw_major;
  let minor = if major.is_none() { None } else { raw_minor };
  let patch = if minor.is_none() { None } else { raw_patch };

  let prerelease = match pre_opt {
    Some(pre) => {
      if parts.len() != 3 {
        return None;
      }
      let parsed = parse_prerelease_list(pre)?;
      if patch.is_none() { Vec::new() } else { parsed }
    }
    None => Vec::new(),
  };

  Some(PartialVersion {
    major,
    minor,
    patch,
    prerelease,
  })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RangeOp {
  Any,
  Eq,
  Lt,
  Lte,
  Gt,
  Gte,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Comparator {
  op: RangeOp,
  version: Semver,
}

impl Comparator {
  fn any() -> Self {
    Self {
      op: RangeOp::Any,
      version: Semver::release(0, 0, 0),
    }
  }

  fn is_empty_set(&self) -> bool {
    self.op == RangeOp::Lt && self.version == Semver::prerelease_zero(0, 0, 0)
  }

  fn matches(&self, candidate: &Semver) -> bool {
    match self.op {
      RangeOp::Any => true,
      RangeOp::Eq => candidate == &self.version,
      RangeOp::Lt => candidate < &self.version,
      RangeOp::Lte => candidate <= &self.version,
      RangeOp::Gt => candidate > &self.version,
      RangeOp::Gte => candidate >= &self.version,
    }
  }
}

fn expand_caret(p: &PartialVersion) -> Option<Vec<Comparator>> {
  let Some(major) = p.major else {
    return Some(vec![Comparator::any()]);
  };
  let lower = if p.minor.is_none() || p.patch.is_none() {
    Semver::prerelease_zero(major, p.minor.unwrap_or(0), 0)
  } else if !p.prerelease.is_empty() {
    Semver {
      major,
      minor: p.minor.unwrap_or(0),
      patch: p.patch.unwrap_or(0),
      prerelease: p.prerelease.clone(),
    }
  } else if major == 0 {
    // semver@7.8.1 replaceCaret: ^0.m.p adds -0 sentinel to lower bound.
    Semver::prerelease_zero(0, p.minor.unwrap_or(0), p.patch.unwrap_or(0))
  } else {
    Semver::release(major, p.minor.unwrap_or(0), p.patch.unwrap_or(0))
  };
  let upper = match (major, p.minor, p.patch) {
    (0, None, _) => Semver::prerelease_zero(1, 0, 0),
    (0, Some(0), None) => Semver::prerelease_zero(0, 1, 0),
    (0, Some(0), Some(patch)) => Semver::prerelease_zero(0, 0, patch.checked_add(1)?),
    (0, Some(minor), _) => Semver::prerelease_zero(0, minor.checked_add(1)?, 0),
    (m, _, _) => Semver::prerelease_zero(m.checked_add(1)?, 0, 0),
  };
  Some(vec![
    Comparator {
      op: RangeOp::Gte,
      version: lower,
    },
    Comparator {
      op: RangeOp::Lt,
      version: upper,
    },
  ])
}

fn expand_tilde(p: &PartialVersion) -> Option<Vec<Comparator>> {
  let Some(major) = p.major else {
    return Some(vec![Comparator::any()]);
  };
  // semver@7.8.1 replaceTilde: lower bound does NOT add -0 for partial or full versions.
  let lower = Semver {
    major,
    minor: p.minor.unwrap_or(0),
    patch: p.patch.unwrap_or(0),
    prerelease: p.prerelease.clone(),
  };
  let upper = match p.minor {
    Some(minor) => Semver::prerelease_zero(major, minor.checked_add(1)?, 0),
    None => Semver::prerelease_zero(major.checked_add(1)?, 0, 0),
  };
  Some(vec![
    Comparator {
      op: RangeOp::Gte,
      version: lower,
    },
    Comparator {
      op: RangeOp::Lt,
      version: upper,
    },
  ])
}

fn expand_x_range(op: Option<RangeOp>, p: &PartialVersion) -> Option<Vec<Comparator>> {
  let Some(major) = p.major else {
    return match op {
      None | Some(RangeOp::Eq) | Some(RangeOp::Gte) | Some(RangeOp::Lte) => Some(vec![Comparator::any()]),
      Some(RangeOp::Lt) | Some(RangeOp::Gt) => Some(vec![Comparator {
        op: RangeOp::Lt,
        version: Semver::prerelease_zero(0, 0, 0),
      }]),
      Some(RangeOp::Any) => Some(vec![Comparator::any()]),
    };
  };

  match (p.minor, p.patch) {
    (Some(minor), Some(patch)) => {
      let ver = Semver {
        major,
        minor,
        patch,
        prerelease: p.prerelease.clone(),
      };
      Some(vec![Comparator {
        op: op.unwrap_or(RangeOp::Eq),
        version: ver,
      }])
    }
    (Some(minor), None) => match op {
      None | Some(RangeOp::Eq) => Some(vec![
        Comparator {
          op: RangeOp::Gte,
          version: Semver::prerelease_zero(major, minor, 0),
        },
        Comparator {
          op: RangeOp::Lt,
          version: Semver::prerelease_zero(major, minor.checked_add(1)?, 0),
        },
      ]),
      Some(RangeOp::Gte) => Some(vec![Comparator {
        op: RangeOp::Gte,
        version: Semver::prerelease_zero(major, minor, 0),
      }]),
      Some(RangeOp::Gt) => Some(vec![Comparator {
        op: RangeOp::Gte,
        version: Semver::prerelease_zero(major, minor.checked_add(1)?, 0),
      }]),
      Some(RangeOp::Lte) => Some(vec![Comparator {
        op: RangeOp::Lt,
        version: Semver::prerelease_zero(major, minor.checked_add(1)?, 0),
      }]),
      Some(RangeOp::Lt) => Some(vec![Comparator {
        op: RangeOp::Lt,
        version: Semver::prerelease_zero(major, minor, 0),
      }]),
      Some(RangeOp::Any) => Some(vec![Comparator::any()]),
    },
    (None, _) => match op {
      None | Some(RangeOp::Eq) => Some(vec![
        Comparator {
          op: RangeOp::Gte,
          version: Semver::prerelease_zero(major, 0, 0),
        },
        Comparator {
          op: RangeOp::Lt,
          version: Semver::prerelease_zero(major.checked_add(1)?, 0, 0),
        },
      ]),
      Some(RangeOp::Gte) => Some(vec![Comparator {
        op: RangeOp::Gte,
        version: Semver::prerelease_zero(major, 0, 0),
      }]),
      Some(RangeOp::Gt) => Some(vec![Comparator {
        op: RangeOp::Gte,
        version: Semver::prerelease_zero(major.checked_add(1)?, 0, 0),
      }]),
      Some(RangeOp::Lte) => Some(vec![Comparator {
        op: RangeOp::Lt,
        version: Semver::prerelease_zero(major.checked_add(1)?, 0, 0),
      }]),
      Some(RangeOp::Lt) => Some(vec![Comparator {
        op: RangeOp::Lt,
        version: Semver::prerelease_zero(major, 0, 0),
      }]),
      Some(RangeOp::Any) => Some(vec![Comparator::any()]),
    },
  }
}

fn expand_hyphen(from_str: &str, to_str: &str) -> Option<Vec<Comparator>> {
  let from = parse_partial_version(from_str)?;
  let to = parse_partial_version(to_str)?;
  let mut out = Vec::new();
  if let Some(major) = from.major {
    let lower = if from.minor.is_none() || from.patch.is_none() {
      Semver::prerelease_zero(major, from.minor.unwrap_or(0), 0)
    } else if !from.prerelease.is_empty() {
      Semver {
        major,
        minor: from.minor.unwrap_or(0),
        patch: from.patch.unwrap_or(0),
        prerelease: from.prerelease,
      }
    } else {
      // semver@7.8.1 hyphenReplace(true): full M.m.p without prerelease adds -0.
      Semver::prerelease_zero(major, from.minor.unwrap_or(0), from.patch.unwrap_or(0))
    };
    out.push(Comparator {
      op: RangeOp::Gte,
      version: lower,
    });
  }
  if let Some(major) = to.major {
    match (to.minor, to.patch) {
      (Some(minor), Some(patch)) => {
        if !to.prerelease.is_empty() {
          out.push(Comparator {
            op: RangeOp::Lte,
            version: Semver {
              major,
              minor,
              patch,
              prerelease: to.prerelease,
            },
          });
        } else {
          out.push(Comparator {
            op: RangeOp::Lt,
            version: Semver::prerelease_zero(major, minor, patch.checked_add(1)?),
          });
        }
      }
      (Some(minor), None) => out.push(Comparator {
        op: RangeOp::Lt,
        version: Semver::prerelease_zero(major, minor.checked_add(1)?, 0),
      }),
      (None, _) => out.push(Comparator {
        op: RangeOp::Lt,
        version: Semver::prerelease_zero(major.checked_add(1)?, 0, 0),
      }),
    }
  }
  if out.is_empty() {
    out.push(Comparator::any());
  }
  Some(out)
}

#[derive(Clone, Debug)]
struct SemverRange {
  /// Disjunction (`||`) of conjunctions (space-separated comparators).
  sets: Vec<Vec<Comparator>>,
}

impl SemverRange {
  fn parse(input: &str) -> Option<Self> {
    let normalized = split_ecmascript_whitespace(input).collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
      return Some(Self {
        sets: vec![vec![Comparator::any()]],
      });
    }
    let mut sets = Vec::new();
    for raw_part in normalized.split("||") {
      let stripped = strip_build_metadata(trim_ecmascript(raw_part));
      let part = trim_ecmascript(&stripped);
      if part.is_empty() {
        sets.push(vec![Comparator::any()]);
        continue;
      }
      if let Some((from_str, to_str)) = part.split_once(" - ") {
        sets.push(expand_hyphen(trim_ecmascript(from_str), trim_ecmascript(to_str))?);
        continue;
      }

      // Collapse whitespace between operators (`>= 0.26.0` -> `>=0.26.0`).
      let raw_tokens: Vec<&str> = split_ecmascript_whitespace(part).collect();
      let mut merged_tokens: Vec<String> = Vec::with_capacity(raw_tokens.len());
      let mut i = 0;
      while i < raw_tokens.len() {
        let tok = raw_tokens[i];
        if matches!(tok, ">=" | "<=" | ">" | "<" | "=" | "^" | "~" | "~>") {
          let next = raw_tokens.get(i + 1)?;
          merged_tokens.push(format!("{tok}{next}"));
          i += 2;
        } else {
          merged_tokens.push(tok.to_owned());
          i += 1;
        }
      }

      let mut comps = Vec::new();
      for token in &merged_tokens {
        if let Some(rest) = token.strip_prefix('^') {
          comps.extend(expand_caret(&parse_partial_version(rest)?)?);
        } else if let Some(rest) = token.strip_prefix("~>").or_else(|| token.strip_prefix('~')) {
          comps.extend(expand_tilde(&parse_partial_version(rest)?)?);
        } else if let Some(rest) = token.strip_prefix(">=") {
          comps.extend(expand_x_range(Some(RangeOp::Gte), &parse_partial_version(rest)?)?);
        } else if let Some(rest) = token.strip_prefix("<=") {
          comps.extend(expand_x_range(Some(RangeOp::Lte), &parse_partial_version(rest)?)?);
        } else if let Some(rest) = token.strip_prefix('>') {
          comps.extend(expand_x_range(Some(RangeOp::Gt), &parse_partial_version(rest)?)?);
        } else if let Some(rest) = token.strip_prefix('<') {
          comps.extend(expand_x_range(Some(RangeOp::Lt), &parse_partial_version(rest)?)?);
        } else if let Some(rest) = token.strip_prefix('=') {
          comps.extend(expand_x_range(Some(RangeOp::Eq), &parse_partial_version(rest)?)?);
        } else {
          comps.extend(expand_x_range(None, &parse_partial_version(token)?)?);
        }
      }
      if comps.is_empty() {
        return None;
      }
      sets.push(comps);
    }
    if sets.len() > 1 {
      let filtered: Vec<Vec<Comparator>> = sets
        .iter()
        .filter(|s| !s.iter().any(Comparator::is_empty_set))
        .cloned()
        .collect();
      if !filtered.is_empty() {
        sets = filtered;
      } else {
        sets.truncate(1);
      }
    }
    Some(Self { sets })
  }

  fn satisfies_include_prerelease(&self, candidate: &Semver) -> bool {
    self
      .sets
      .iter()
      .any(|conjunction| conjunction.iter().all(|c| c.matches(candidate)))
  }
}

fn log_invalid_version_range_once(version_range: &str) {
  static LOGGED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
  let set = LOGGED.get_or_init(|| Mutex::new(HashSet::new()));
  if let Ok(mut guard) = set.lock()
    && guard.insert(version_range.to_owned())
  {
    tracing::error!(version_range = %version_range, "invalid version range");
  }
}

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

  if let Some(hard_range) = SemverRange::parse(HARD_REQUIRED_VERSION) {
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

    let fixture: Fixture = serde_json::from_str(include_str!("../../tests/fixtures/semver_7_8_1_vectors.json"))
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
