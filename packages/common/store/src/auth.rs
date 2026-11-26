//! Authoritative pure-protocol AFFiNE auth helpers shared by `affine-client`
//! (both native and `wasm32`), `affine-ios-host`, and `affine-android-host`
//! without any GUI or host storage dependencies.

use chrono::{Datelike, Timelike};
use serde::Deserialize;

use crate::{
    api_client::{AuthSessionMeta, AuthTokenPairResponse},
    error::{StoreError, StoreResult},
};

/// Supported schema version for persisted native token pairs (`StoredAuthTokenPair`).
pub const STORED_TOKEN_PAIR_VERSION: u32 = 1;

/// Minimum allowed `expiresIn` in seconds (`1..=86_400`).
pub const MIN_EXPIRES_IN_SECS: u64 = 1;

/// Maximum allowed `expiresIn` in seconds (`24h`, matching `0.27.5` mobile auth plugins).
pub const MAX_EXPIRES_IN_SECS: u64 = 86_400;

/// Permanent auth server error codes requiring stored session cleanup while preserving
/// `installationId`.
pub const PERMANENT_AUTH_ERROR_CODES: &[&str] = &[
    "ACCESS_TOKEN_INVALID",
    "AUTH_SESSION_EXPIRED",
    "AUTH_SESSION_REVOKED",
    "REFRESH_TOKEN_INVALID",
    "REFRESH_TOKEN_REUSED",
    "UNSUPPORTED_CLIENT_VERSION",
];

#[derive(Debug, Deserialize)]
struct AuthErrorPayload {
    code: Option<String>,
    name: Option<String>,
}

/// Return `true` when `code` is a permanent auth error requiring session cleanup.
pub fn is_permanent_auth_error_code(code: &str) -> bool {
    PERMANENT_AUTH_ERROR_CODES.contains(&code)
}

/// Return `true` when an auth server error JSON payload carries a permanent invalidation code
/// in either `code` or `name`.
pub fn auth_error_json_permanently_invalidates_session(error_json: &str) -> bool {
    let Ok(payload) = serde_json::from_str::<AuthErrorPayload>(error_json) else {
        return false;
    };
    let code = payload.code.as_deref().or(payload.name.as_deref());
    matches!(code, Some(c) if is_permanent_auth_error_code(c))
}

/// Return `true` when `token_type` matches `"Bearer"` case-insensitively (RFC 6750 / OAuth2).
pub fn is_bearer_token_type(token_type: &str) -> bool {
    token_type.eq_ignore_ascii_case("Bearer")
}

fn format_http_endpoint(endpoint: &str, strip_ipv6_brackets: bool) -> String {
    let trimmed = endpoint.trim();
    let Ok(parsed) = url::Url::parse(trimmed) else {
        return endpoint.to_string();
    };
    let scheme = parsed.scheme();
    if !matches!(scheme, "http" | "https") {
        return endpoint.to_string();
    }
    let Some(host_raw) = parsed.host_str() else {
        return endpoint.to_string();
    };
    let host = if strip_ipv6_brackets {
        host_raw
            .strip_prefix('[')
            .and_then(|s| s.strip_suffix(']'))
            .unwrap_or(host_raw)
    } else {
        host_raw
    };
    match parsed.port() {
        Some(port) => format!("{scheme}://{host}:{port}"),
        None => format!("{scheme}://{host}"),
    }
}

/// Canonicalize an `http`/`https` endpoint URL via `url::Url` (including IDNA Punycode):
/// lowercase scheme and host, omit default ports (`80` for `http`, `443` for `https`),
/// keep brackets around IPv6 hosts for valid HTTP URLs, and strip path/query/fragment
/// components without appending a trailing `/`. Returns `endpoint` unchanged when it is
/// not a valid `http`/`https` URL.
pub fn canonical_endpoint(endpoint: &str) -> String {
    format_http_endpoint(endpoint, false)
}

/// Canonical storage key for persisted auth credentials matching `0.27.5` Darwin `URL.host`
/// (`AuthPlugin.swift:206-212`) and OkHttp `HttpUrl.host` (`AuthPlugin.kt:271-273`), which
/// strip outer `[` / `]` brackets from IPv6 hosts (e.g. `https://[::1]:8443` -> `https://::1:8443`,
/// `https://[::1]:443` -> `https://::1`).
///
/// In `0.27.5`, self-hosted endpoints are pre-normalized via JS `new URL(url).toString()`
/// (`add-selfhosted.tsx:27-30`, WHATWG compressed IPv6) before reaching native auth plugins;
/// iOS issued HTTP requests with the bracketed endpoint while keying Keychain accounts with
/// the unbracketed host, and Android shares this key rule so storage keys and Keystore aliases
/// stay unified across hosts. Outbound HTTP requests MUST keep using [`canonical_endpoint`]
/// (bracketed IPv6).
pub fn legacy_storage_endpoint_key(endpoint: &str) -> String {
    format_http_endpoint(endpoint, true)
}

/// RFC 3339 timestamp validator backed by `chrono` (native + `wasm32`), rejecting UTC years
/// outside `0..=9999` consistently with [`normalize_rfc3339_utc_z`].
pub fn is_valid_rfc3339(s: &str) -> bool {
    let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(s) else {
        return false;
    };
    let utc = parsed.with_timezone(&chrono::Utc);
    (0..=9999).contains(&utc.year())
}

/// Normalizes any valid RFC 3339 timestamp (including `±HH:MM` offsets and arbitrary fractional
/// digits) to UTC `Z` format compatible with `0.27.5` `AuthPlugin.kt:278-288`:
/// - `YYYY-MM-DDTHH:MM:SSZ` when milliseconds are zero
/// - `YYYY-MM-DDTHH:MM:SS.SSSZ` when milliseconds are non-zero
/// - Leap second `:60` (`nanosecond() >= 1_000_000_000`) clamps to `:59`
/// - Rejects UTC years outside `0..=9999` consistently with [`is_valid_rfc3339`]
pub fn normalize_rfc3339_utc_z(s: &str) -> Option<String> {
    let parsed = chrono::DateTime::parse_from_rfc3339(s).ok()?;
    let utc = parsed.with_timezone(&chrono::Utc);
    let year = utc.year();
    if !(0..=9999).contains(&year) {
        return None;
    }
    let ns = utc.nanosecond();
    let (sec, millis) = if ns >= 1_000_000_000 {
        (59u32, (ns - 1_000_000_000) / 1_000_000)
    } else {
        (utc.second(), ns / 1_000_000)
    };
    if millis == 0 {
        Some(format!(
            "{year:04}-{:02}-{:02}T{:02}:{:02}:{sec:02}Z",
            utc.month(),
            utc.day(),
            utc.hour(),
            utc.minute()
        ))
    } else {
        Some(format!(
            "{year:04}-{:02}-{:02}T{:02}:{:02}:{sec:02}.{millis:03}Z",
            utc.month(),
            utc.day(),
            utc.hour(),
            utc.minute()
        ))
    }
}

/// Validated native token pair fields produced from `/api/auth/session/{exchange,refresh}`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ValidatedTokenPair {
    pub version: u32,
    pub token_type: String,
    pub access_token: String,
    pub access_expires_at_ms: i64,
    pub refresh_token: String,
    pub refresh_expires_at: Option<String>,
    pub session: Option<AuthSessionMeta>,
}

/// Validate common invariant fields of a persisted native token pair.
pub fn validate_token_pair_fields(
    version: u32,
    token_type: &str,
    access_token: &str,
    refresh_token: &str,
    refresh_expires_at: Option<&str>,
    session: Option<&AuthSessionMeta>,
) -> StoreResult<()> {
    if version != STORED_TOKEN_PAIR_VERSION {
        return Err(StoreError::InvalidProtocol(format!(
            "unsupported StoredAuthTokenPair version: {version}"
        )));
    }
    if !is_bearer_token_type(token_type) {
        return Err(StoreError::InvalidProtocol(format!(
            "expected Bearer tokenType, got {token_type:?}"
        )));
    }
    if access_token.trim().is_empty() || refresh_token.trim().is_empty() {
        return Err(StoreError::InvalidProtocol(
            "accessToken and refreshToken must be non-empty".into(),
        ));
    }
    if let Some(ts) = refresh_expires_at
        && !is_valid_rfc3339(ts)
    {
        return Err(StoreError::InvalidProtocol(format!(
            "invalid RFC3339 refreshExpiresAt: `{ts}`"
        )));
    }
    if let Some(meta) = session {
        if meta.id.trim().is_empty() {
            return Err(StoreError::InvalidProtocol(
                "session.id must be non-empty when session is present".into(),
            ));
        }
        if let Some(ref abs_ts) = meta.absolute_expires_at
            && !is_valid_rfc3339(abs_ts)
        {
            return Err(StoreError::InvalidProtocol(format!(
                "invalid RFC3339 session.absoluteExpiresAt: `{abs_ts}`"
            )));
        }
    }
    Ok(())
}

/// Validate and normalize a server [`AuthTokenPairResponse`] using an explicit `now_ms`.
pub fn parse_and_validate_token_pair_response(
    parsed: AuthTokenPairResponse,
    now_ms: i64,
) -> StoreResult<ValidatedTokenPair> {
    let token_type = parsed
        .token_type
        .as_deref()
        .filter(|t| is_bearer_token_type(t))
        .ok_or_else(|| {
            StoreError::InvalidProtocol(format!(
                "expected Bearer tokenType, got {:?}",
                parsed.token_type
            ))
        })?;
    let expires_in = parsed
        .expires_in
        .filter(|&secs| (MIN_EXPIRES_IN_SECS..=MAX_EXPIRES_IN_SECS).contains(&secs))
        .ok_or_else(|| {
            StoreError::InvalidProtocol("expiresIn must be within 1..=86400 seconds".into())
        })?;
    let session = parsed.session.or_else(|| {
        parsed.session_id.map(|id| AuthSessionMeta {
            id,
            absolute_expires_at: None,
        })
    });
    let expires_ms = expires_in
        .checked_mul(1_000)
        .and_then(|ms| i64::try_from(ms).ok())
        .ok_or_else(|| StoreError::InvalidProtocol("expiresIn overflow".into()))?;
    let refresh_expires_at = match parsed.refresh_expires_at {
        Some(ts) => Some(normalize_rfc3339_utc_z(&ts).ok_or_else(|| {
            StoreError::InvalidProtocol(format!("invalid RFC3339 refreshExpiresAt: `{ts}`"))
        })?),
        None => None,
    };
    let session = match session {
        Some(mut meta) => {
            if let Some(abs_ts) = meta.absolute_expires_at {
                meta.absolute_expires_at =
                    Some(normalize_rfc3339_utc_z(&abs_ts).ok_or_else(|| {
                        StoreError::InvalidProtocol(format!(
                            "invalid RFC3339 session.absoluteExpiresAt: `{abs_ts}`"
                        ))
                    })?);
            }
            Some(meta)
        }
        None => None,
    };
    let _ = token_type;
    let pair = ValidatedTokenPair {
        version: STORED_TOKEN_PAIR_VERSION,
        token_type: "Bearer".to_string(),
        access_token: parsed.access_token,
        access_expires_at_ms: now_ms.saturating_add(expires_ms),
        refresh_token: parsed.refresh_token,
        refresh_expires_at,
        session,
    };
    validate_token_pair_fields(
        pair.version,
        &pair.token_type,
        &pair.access_token,
        &pair.refresh_token,
        pair.refresh_expires_at.as_deref(),
        pair.session.as_ref(),
    )?;
    Ok(pair)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_endpoint_bearer_case_rfc3339_offsets_and_error_codes() {
        let endpoint_cases = [
            ("https://APP.AFFINE.PRO", "https://app.affine.pro"),
            (
                "https://app.affine.pro:443/graphql",
                "https://app.affine.pro",
            ),
            ("http://LOCALHOST:80/api", "http://localhost"),
            (
                "https://self-host.example.com:3010/ws?x=1",
                "https://self-host.example.com:3010",
            ),
            ("https://[::1]:443/graphql", "https://[::1]"),
            ("https://[::1]:8443/graphql", "https://[::1]:8443"),
            (
                "https://bücher.example:443/api",
                "https://xn--bcher-kva.example",
            ),
            ("ftp://example.com/file", "ftp://example.com/file"),
            ("not-a-url", "not-a-url"),
        ];
        for (raw, expected) in endpoint_cases {
            assert_eq!(canonical_endpoint(raw), expected, "raw={raw}");
        }

        let bearer_cases = [
            ("Bearer", true),
            ("bearer", true),
            ("BEARER", true),
            ("Basic", false),
            ("", false),
        ];
        for (raw, expected) in bearer_cases {
            assert_eq!(is_bearer_token_type(raw), expected, "token_type={raw}");
        }

        let ts_cases = [
            ("2026-12-01T00:00:00Z", true),
            ("2026-12-01T00:00:00.123Z", true),
            ("2026-12-01T08:00:00+08:00", true),
            ("2026-12-01T08:00:00.5-05:30", true),
            ("2024-02-29T23:59:59Z", true),
            ("2026-02-29T00:00:00Z", false),
            ("2026-12-01T00:00:00+25:00", false),
            ("not-a-date", false),
        ];
        for (ts, expected) in ts_cases {
            assert_eq!(is_valid_rfc3339(ts), expected, "ts={ts}");
        }

        for code in PERMANENT_AUTH_ERROR_CODES {
            assert!(is_permanent_auth_error_code(code), "code={code}");
            assert!(auth_error_json_permanently_invalidates_session(&format!(
                r#"{{"code":"{code}"}}"#
            )));
            assert!(auth_error_json_permanently_invalidates_session(&format!(
                r#"{{"name":"{code}"}}"#
            )));
        }
        assert!(!auth_error_json_permanently_invalidates_session(
            r#"{"code":"INTERNAL_SERVER_ERROR"}"#
        ));

        let storage_key_cases = [
            ("https://[::1]:443/graphql", "https://::1"),
            ("https://[::1]:8443/graphql", "https://::1:8443"),
            ("https://[2001:DB8::1]/x", "https://2001:db8::1"),
            (
                "https://bücher.example:443/api",
                "https://xn--bcher-kva.example",
            ),
            ("ftp://example.com/file", "ftp://example.com/file"),
            ("not-a-url", "not-a-url"),
        ];
        for (raw, expected) in storage_key_cases {
            assert_eq!(
                legacy_storage_endpoint_key(raw),
                expected,
                "storage_key raw={raw}"
            );
        }

        // 25-case RFC 3339 matrix (leap seconds, out-of-range years, lowercase/space
        // separators, cross-day/year offsets, fractional truncation).
        let rfc3339_matrix: [(&str, Option<&str>); 25] = [
            ("2026-12-01T00:00:00Z", Some("2026-12-01T00:00:00Z")),
            ("2026-12-01T00:00:00.000Z", Some("2026-12-01T00:00:00Z")),
            ("2026-12-01T00:00:00.5Z", Some("2026-12-01T00:00:00.500Z")),
            (
                "2026-12-01T00:00:00.123456789Z",
                Some("2026-12-01T00:00:00.123Z"),
            ),
            (
                "2026-12-01T00:00:00.9996Z",
                Some("2026-12-01T00:00:00.999Z"),
            ),
            ("2026-12-01T01:30:00+08:00", Some("2026-11-30T17:30:00Z")),
            ("2026-12-31T23:30:00-02:00", Some("2027-01-01T01:30:00Z")),
            ("2024-03-01T01:00:00+02:00", Some("2024-02-29T23:00:00Z")),
            ("2024-02-29T23:59:59Z", Some("2024-02-29T23:59:59Z")),
            ("2026-02-29T00:00:00Z", None),
            ("2100-02-29T00:00:00Z", None),
            ("2000-02-29T12:00:00+14:00", Some("2000-02-28T22:00:00Z")),
            ("0001-01-01T00:00:00+00:01", Some("0000-12-31T23:59:00Z")),
            ("9999-12-31T23:59:59-00:01", None),
            ("2026-06-30T23:59:60Z", Some("2026-06-30T23:59:59Z")),
            ("2026-12-01t00:00:00z", Some("2026-12-01T00:00:00Z")),
            ("2026-12-01 00:00:00Z", Some("2026-12-01T00:00:00Z")),
            ("2026-12-01T00:00:00", None),
            ("2026-12-01T00:00:00+0800", None),
            ("2026-12-01T24:00:00Z", None),
            ("2026-13-01T00:00:00Z", None),
            ("2026-12-01T00:00:00.Z", None),
            ("2026-12-01T00:00:00-00:00", Some("2026-12-01T00:00:00Z")),
            ("2026-12-01T00:00:00+23:59", Some("2026-11-30T00:01:00Z")),
            ("20261201T000000Z", None),
        ];
        for (raw, expected) in rfc3339_matrix {
            assert_eq!(
                is_valid_rfc3339(raw),
                expected.is_some(),
                "is_valid_rfc3339 mismatch for {raw}"
            );
            assert_eq!(
                normalize_rfc3339_utc_z(raw).as_deref(),
                expected,
                "normalize_rfc3339_utc_z mismatch for {raw}"
            );
        }
    }
}
