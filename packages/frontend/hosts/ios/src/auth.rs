use chrono::DateTime;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

/// Exact offset in seconds between the Unix epoch (1970-01-01T00:00:00Z) and
/// Apple's Foundation reference date (2001-01-01T00:00:00Z).
pub const APPLE_REFERENCE_EPOCH_OFFSET_SECS: f64 = 978_307_200.0;

/// Keychain `kSecAttrService` used by 0.27.5 `AuthPlugin.swift`.
pub const KEYCHAIN_TOKEN_SERVICE: &str = "app.affine.pro.auth-token";

/// `UserDefaults.standard` key storing the persistent device installation ID.
pub const INSTALLATION_ID_DEFAULTS_KEY: &str = "app.affine.pro.auth-installation-id";

/// Header identifying native mobile auth requests to AFFiNE backend endpoints.
pub const CLIENT_KIND_HEADER: &str = "x-affine-client-kind";
pub const CLIENT_KIND_NATIVE: &str = "native";

/// Header carrying the AFFiNE client version required by `/api/auth/session/*`.
pub const AFFINE_VERSION_HEADER: &str = "x-affine-version";
pub const AFFINE_CLIENT_VERSION: &str = "0.27.5";

/// Error codes returned by `/api/auth/session/refresh` that permanently invalidate
/// the stored Keychain session, matching 0.27.5 `AuthPlugin.swift:44-52`.
const PERMANENT_SESSION_INVALIDATION_CODES: &[&str] = &[
    "AUTH_SESSION_EXPIRED",
    "AUTH_SESSION_REVOKED",
    "REFRESH_TOKEN_INVALID",
    "REFRESH_TOKEN_REUSED",
    "UNSUPPORTED_CLIENT_VERSION",
    "ACCESS_TOKEN_INVALID",
];

/// Supported schema version for `StoredAuthTokenPair`.
pub const STORED_TOKEN_PAIR_VERSION: u32 = 1;

/// Maximum valid access-token lifetime accepted from `/api/auth/session/*` responses.
pub const MAX_EXPIRES_IN_SECS: i64 = 86_400;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AuthError {
    #[error("invalid JSON payload: {0}")]
    InvalidJson(String),
    #[error("unsupported stored token pair version: {0}")]
    UnsupportedVersion(u32),
    #[error("invalid token type: {0}")]
    InvalidTokenType(String),
    #[error("missing required auth field: {0}")]
    MissingField(&'static str),
    #[error("invalid expires_in value: {0}")]
    InvalidExpiresIn(i64),
    #[error("non-finite accessExpiresAt timestamp")]
    NonFiniteTimestamp,
    #[error("invalid ISO-8601 timestamp in {field}: {value}")]
    InvalidIsoTimestamp { field: &'static str, value: String },
    #[error("invalid endpoint URL: {0}")]
    InvalidEndpoint(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSessionInfo {
    pub id: String,
    pub absolute_expires_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthTokenResponse {
    pub token_type: String,
    pub access_token: String,
    pub expires_in: i64,
    pub refresh_token: String,
    pub refresh_expires_at: String,
    pub session: AuthSessionInfo,
}

/// Keychain payload matching 0.27.5 `AuthPlugin.swift` `StoredAuthTokenPair`.
///
/// `access_expires_at` stores Apple `Date.timeIntervalSinceReferenceDate`
/// (seconds since 2001-01-01T00:00:00Z) so rotated tokens stay valid when
/// downgrading back to the 0.27.5 shell.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredAuthTokenPair {
    pub version: u32,
    pub token_type: String,
    pub access_token: String,
    pub access_expires_at: f64,
    pub refresh_token: String,
    pub refresh_expires_at: String,
    pub session: AuthSessionInfo,
}

/// Canonicalized HTTP request descriptor for `/api/auth/session/{exchange,refresh,revoke}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSessionHttpRequest {
    pub method: String,
    pub url: String,
    pub client_kind_header: String,
    pub client_kind_value: String,
    pub version_header: String,
    pub version_value: String,
    pub body_json: String,
}

#[derive(Debug, Deserialize)]
struct AuthErrorPayload {
    code: Option<String>,
    name: Option<String>,
}

/// Return true when an auth server error JSON permanently invalidates the stored
/// Keychain session (`AuthPlugin.swift:44-52`).
pub fn auth_error_permanently_invalidates_session(error_json: &str) -> bool {
    let Ok(payload) = serde_json::from_str::<AuthErrorPayload>(error_json) else {
        return false;
    };
    let code = payload.code.as_deref().or(payload.name.as_deref());
    matches!(code, Some(c) if PERMANENT_SESSION_INVALIDATION_CODES.contains(&c))
}

/// Convert Unix epoch seconds (1970-01-01) to Apple reference epoch seconds (2001-01-01).
pub fn unix_secs_to_apple_reference_secs(unix_secs: f64) -> f64 {
    unix_secs - APPLE_REFERENCE_EPOCH_OFFSET_SECS
}

/// Convert Apple reference epoch seconds (2001-01-01) to Unix epoch seconds (1970-01-01).
pub fn apple_reference_secs_to_unix_secs(apple_secs: f64) -> f64 {
    apple_secs + APPLE_REFERENCE_EPOCH_OFFSET_SECS
}

/// Canonicalize an endpoint URL identically to 0.27.5 `AuthPlugin.swift:205-213`:
/// lowercase scheme and host, omit default ports (`80` for `http`, `443` for `https`),
/// and strip path/query/fragment components.
pub fn canonical_endpoint(endpoint: &str) -> String {
    let trimmed = endpoint.trim();
    let Some((scheme_raw, rest)) = trimmed.split_once("://") else {
        return endpoint.to_string();
    };
    if scheme_raw.is_empty()
        || !scheme_raw
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
    {
        return endpoint.to_string();
    }

    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.is_empty() {
        return endpoint.to_string();
    }
    let host_port = authority.rsplit('@').next().unwrap_or(authority);
    let (host_raw, port_raw) = if let Some(bracket_end) = host_port.find(']') {
        if !host_port.starts_with('[') {
            return endpoint.to_string();
        }
        let host = &host_port[..=bracket_end];
        let tail = &host_port[bracket_end + 1..];
        if let Some(port_str) = tail.strip_prefix(':') {
            (host, Some(port_str))
        } else if tail.is_empty() {
            (host, None)
        } else {
            return endpoint.to_string();
        }
    } else if let Some((host, port_str)) = host_port.rsplit_once(':') {
        (host, Some(port_str))
    } else {
        (host_port, None)
    };

    if host_raw.is_empty() {
        return endpoint.to_string();
    }

    let scheme = scheme_raw.to_ascii_lowercase();
    let host = host_raw.to_ascii_lowercase();
    let default_port = match scheme.as_str() {
        "http" => Some(80u16),
        "https" => Some(443u16),
        _ => None,
    };

    let port_suffix = match port_raw {
        None | Some("") => String::new(),
        Some(p) => match p.parse::<u16>() {
            Ok(port) if Some(port) == default_port => String::new(),
            Ok(port) => format!(":{port}"),
            Err(_) => return endpoint.to_string(),
        },
    };

    format!("{scheme}://{host}{port_suffix}")
}

fn validate_iso8601(field: &'static str, value: &str) -> Result<(), AuthError> {
    DateTime::parse_from_rfc3339(value).map_err(|_| AuthError::InvalidIsoTimestamp {
        field,
        value: value.to_string(),
    })?;
    Ok(())
}

impl StoredAuthTokenPair {
    /// Parse and validate a Keychain JSON payload matching `AuthPlugin.swift:236-245`.
    pub fn from_json(json: &str) -> Result<Self, AuthError> {
        let pair: Self =
            serde_json::from_str(json).map_err(|err| AuthError::InvalidJson(err.to_string()))?;
        pair.validate()?;
        Ok(pair)
    }

    /// Validate all invariants enforced by 0.27.5 `AuthSessionBroker.read`.
    pub fn validate(&self) -> Result<(), AuthError> {
        if self.version != STORED_TOKEN_PAIR_VERSION {
            return Err(AuthError::UnsupportedVersion(self.version));
        }
        if self.token_type != "Bearer" {
            return Err(AuthError::InvalidTokenType(self.token_type.clone()));
        }
        if self.access_token.is_empty() {
            return Err(AuthError::MissingField("accessToken"));
        }
        if self.refresh_token.is_empty() {
            return Err(AuthError::MissingField("refreshToken"));
        }
        if !self.access_expires_at.is_finite() || !self.access_expires_at_unix_secs().is_finite() {
            return Err(AuthError::NonFiniteTimestamp);
        }
        validate_iso8601("refreshExpiresAt", &self.refresh_expires_at)?;
        validate_iso8601(
            "session.absoluteExpiresAt",
            &self.session.absolute_expires_at,
        )?;
        Ok(())
    }

    /// Convert a server `/api/auth/session/{exchange,refresh}` response into a
    /// Keychain-ready `StoredAuthTokenPair` using an explicit `now_unix_ms` clock.
    pub fn from_token_response(
        response: &AuthTokenResponse,
        now_unix_ms: i64,
    ) -> Result<Self, AuthError> {
        if response.token_type != "Bearer" {
            return Err(AuthError::InvalidTokenType(response.token_type.clone()));
        }
        if response.access_token.is_empty() {
            return Err(AuthError::MissingField("accessToken"));
        }
        if response.refresh_token.is_empty() {
            return Err(AuthError::MissingField("refreshToken"));
        }
        if !(1..=MAX_EXPIRES_IN_SECS).contains(&response.expires_in) {
            return Err(AuthError::InvalidExpiresIn(response.expires_in));
        }
        validate_iso8601("refreshExpiresAt", &response.refresh_expires_at)?;
        validate_iso8601(
            "session.absoluteExpiresAt",
            &response.session.absolute_expires_at,
        )?;

        let expires_unix_secs = (now_unix_ms as f64) / 1000.0 + (response.expires_in as f64);
        let pair = Self {
            version: STORED_TOKEN_PAIR_VERSION,
            token_type: response.token_type.clone(),
            access_token: response.access_token.clone(),
            access_expires_at: unix_secs_to_apple_reference_secs(expires_unix_secs),
            refresh_token: response.refresh_token.clone(),
            refresh_expires_at: response.refresh_expires_at.clone(),
            session: response.session.clone(),
        };
        pair.validate()?;
        Ok(pair)
    }

    /// Serialize to 0.27.5-compatible Keychain JSON (`accessExpiresAt` in 2001 epoch seconds).
    pub fn to_json(&self) -> Result<String, AuthError> {
        self.validate()?;
        serde_json::to_string(self).map_err(|err| AuthError::InvalidJson(err.to_string()))
    }

    /// Return `accessExpiresAt` converted to Unix epoch seconds (1970-01-01 UTC).
    pub fn access_expires_at_unix_secs(&self) -> f64 {
        apple_reference_secs_to_unix_secs(self.access_expires_at)
    }

    /// Return whether the access token has strictly more than `min_validity_secs`
    /// remaining relative to `now_unix_secs`.
    pub fn is_access_token_valid(&self, now_unix_secs: f64, min_validity_secs: f64) -> bool {
        let remaining = self.access_expires_at_unix_secs() - now_unix_secs;
        remaining.is_finite() && remaining > min_validity_secs
    }
}

/// Reuse an existing persisted `app.affine.pro.auth-installation-id` value without
/// modifying it; generate a new lowercase UUID v4 only on a genuine fresh install.
///
/// Returns `(installation_id, created_new)`.
pub fn resolve_installation_id(existing: Option<&str>) -> (String, bool) {
    if let Some(value) = existing {
        if !value.trim().is_empty() {
            return (value.to_string(), false);
        }
    }
    (Uuid::new_v4().as_hyphenated().to_string(), true)
}

fn require_canonical_endpoint(endpoint: &str) -> Result<String, AuthError> {
    let canonical = canonical_endpoint(endpoint);
    if !canonical.starts_with("http://") && !canonical.starts_with("https://") {
        return Err(AuthError::InvalidEndpoint(endpoint.to_string()));
    }
    Ok(canonical)
}

/// Build the `/api/auth/session/exchange` request payload with `x-affine-client-kind: native`.
pub fn build_exchange_request(
    endpoint: &str,
    code: &str,
    installation_id: &str,
    device_name: &str,
) -> Result<AuthSessionHttpRequest, AuthError> {
    if code.is_empty() {
        return Err(AuthError::MissingField("code"));
    }
    if installation_id.trim().is_empty() {
        return Err(AuthError::MissingField("installationId"));
    }
    let base = require_canonical_endpoint(endpoint)?;
    let body = serde_json::json!({
        "code": code,
        "installationId": installation_id,
        "platform": "ios",
        "deviceName": device_name,
    });
    Ok(AuthSessionHttpRequest {
        method: "POST".to_string(),
        url: format!("{base}/api/auth/session/exchange"),
        client_kind_header: CLIENT_KIND_HEADER.to_string(),
        client_kind_value: CLIENT_KIND_NATIVE.to_string(),
        version_header: AFFINE_VERSION_HEADER.to_string(),
        version_value: AFFINE_CLIENT_VERSION.to_string(),
        body_json: body.to_string(),
    })
}

/// Build the `/api/auth/session/refresh` request payload with `x-affine-client-kind: native`.
pub fn build_refresh_request(
    endpoint: &str,
    refresh_token: &str,
) -> Result<AuthSessionHttpRequest, AuthError> {
    if refresh_token.is_empty() {
        return Err(AuthError::MissingField("refreshToken"));
    }
    let base = require_canonical_endpoint(endpoint)?;
    let body = serde_json::json!({
        "refreshToken": refresh_token,
    });
    Ok(AuthSessionHttpRequest {
        method: "POST".to_string(),
        url: format!("{base}/api/auth/session/refresh"),
        client_kind_header: CLIENT_KIND_HEADER.to_string(),
        client_kind_value: CLIENT_KIND_NATIVE.to_string(),
        version_header: AFFINE_VERSION_HEADER.to_string(),
        version_value: AFFINE_CLIENT_VERSION.to_string(),
        body_json: body.to_string(),
    })
}

/// Build the `/api/auth/session/revoke` request payload with `x-affine-client-kind: native`.
pub fn build_revoke_request(
    endpoint: &str,
    refresh_token: &str,
) -> Result<AuthSessionHttpRequest, AuthError> {
    if refresh_token.is_empty() {
        return Err(AuthError::MissingField("refreshToken"));
    }
    let base = require_canonical_endpoint(endpoint)?;
    let body = serde_json::json!({
        "refreshToken": refresh_token,
    });
    Ok(AuthSessionHttpRequest {
        method: "POST".to_string(),
        url: format!("{base}/api/auth/session/revoke"),
        client_kind_header: CLIENT_KIND_HEADER.to_string(),
        client_kind_value: CLIENT_KIND_NATIVE.to_string(),
        version_header: AFFINE_VERSION_HEADER.to_string(),
        version_value: AFFINE_CLIENT_VERSION.to_string(),
        body_json: body.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_endpoint_matches_0275_swift_rules() {
        let cases = [
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
            ("http://127.0.0.1:8080/", "http://127.0.0.1:8080"),
            ("not-a-url", "not-a-url"),
        ];
        for (input, expected) in cases {
            assert_eq!(canonical_endpoint(input), expected, "input={input}");
        }
    }

    #[test]
    fn keychain_2001_epoch_roundtrip_and_rotation_preserve_0275_compatibility() {
        // 2026-11-25T10:00:00Z in Unix seconds = 1_795_600_800.0
        // In Apple 2001 reference epoch seconds = 1_795_600_800.0 - 978_307_200.0 = 817_293_600.0
        let now_unix_secs = 1_795_600_000.0;
        let legacy_access_expires_2001 = unix_secs_to_apple_reference_secs(now_unix_secs + 800.0);
        assert_eq!(legacy_access_expires_2001, 817_293_600.0);

        let legacy_keychain_json = format!(
            r#"{{
              "version": 1,
              "tokenType": "Bearer",
              "accessToken": "acc-legacy-0275",
              "accessExpiresAt": {legacy_access_expires_2001},
              "refreshToken": "ref-legacy-0275",
              "refreshExpiresAt": "2026-12-25T10:00:00.000Z",
              "session": {{
                "id": "sess-0275",
                "absoluteExpiresAt": "2027-05-25T10:00:00.000Z"
              }}
            }}"#
        );

        let parsed = StoredAuthTokenPair::from_json(&legacy_keychain_json).unwrap();
        assert_eq!(parsed.access_expires_at, 817_293_600.0);
        assert_eq!(parsed.access_expires_at_unix_secs(), now_unix_secs + 800.0);
        assert!(parsed.is_access_token_valid(now_unix_secs, 120.0));
        assert!(!parsed.is_access_token_valid(now_unix_secs + 700.0, 120.0));

        // Rotate token via refresh response and encode back for Keychain write-back.
        let rotated_resp = AuthTokenResponse {
            token_type: "Bearer".into(),
            access_token: "acc-rotated-s2".into(),
            expires_in: 3600,
            refresh_token: "ref-rotated-s2".into(),
            refresh_expires_at: "2027-01-25T10:00:00.000Z".into(),
            session: AuthSessionInfo {
                id: "sess-0275".into(),
                absolute_expires_at: "2027-05-25T10:00:00.000Z".into(),
            },
        };
        let rotated =
            StoredAuthTokenPair::from_token_response(&rotated_resp, (now_unix_secs as i64) * 1000)
                .unwrap();
        let written_json = rotated.to_json().unwrap();
        let raw_value: serde_json::Value = serde_json::from_str(&written_json).unwrap();
        let written_epoch_2001 = raw_value["accessExpiresAt"].as_f64().unwrap();
        assert_eq!(
            written_epoch_2001,
            unix_secs_to_apple_reference_secs(now_unix_secs + 3600.0)
        );
        // Rollback check: 0.27.5 reads the written JSON as 2001-epoch Date seconds.
        let rolled_back = StoredAuthTokenPair::from_json(&written_json).unwrap();
        assert_eq!(rolled_back.access_token, "acc-rotated-s2");
        assert!(rolled_back.is_access_token_valid(now_unix_secs, 120.0));
    }

    #[test]
    fn installation_id_reuses_legacy_value_and_generates_lowercase_uuid_only_on_fresh_install() {
        let (reused, created) =
            resolve_installation_id(Some("A1B2C3D4-E5F6-4789-ABCD-EF0123456789"));
        assert!(!created);
        assert_eq!(reused, "A1B2C3D4-E5F6-4789-ABCD-EF0123456789");

        let (fresh, created_fresh) = resolve_installation_id(None);
        assert!(created_fresh);
        assert_eq!(fresh, fresh.to_ascii_lowercase());
        assert!(Uuid::parse_str(&fresh).is_ok());

        let (fresh_empty, created_empty) = resolve_installation_id(Some("   "));
        assert!(created_empty);
        assert_eq!(fresh_empty, fresh_empty.to_ascii_lowercase());
        assert!(Uuid::parse_str(&fresh_empty).is_ok());

        let exchange = build_exchange_request(
            "https://APP.AFFINE.PRO:443/login",
            "ex-code-1",
            &reused,
            "iPhone 16 Pro",
        )
        .unwrap();
        assert_eq!(
            exchange.url,
            "https://app.affine.pro/api/auth/session/exchange"
        );
        assert_eq!(exchange.client_kind_header, "x-affine-client-kind");
        assert_eq!(exchange.client_kind_value, "native");
        assert_eq!(exchange.version_header, "x-affine-version");
        assert_eq!(exchange.version_value, "0.27.5");
        let body: serde_json::Value = serde_json::from_str(&exchange.body_json).unwrap();
        assert_eq!(body["installationId"], reused);
        assert_eq!(body["platform"], "ios");

        let refresh = build_refresh_request("https://app.affine.pro", "ref-1").unwrap();
        assert_eq!(
            refresh.url,
            "https://app.affine.pro/api/auth/session/refresh"
        );
        assert_eq!(refresh.version_header, "x-affine-version");
        assert_eq!(refresh.version_value, "0.27.5");
        let revoke = build_revoke_request("https://app.affine.pro", "ref-1").unwrap();
        assert_eq!(revoke.url, "https://app.affine.pro/api/auth/session/revoke");
        assert_eq!(revoke.version_header, "x-affine-version");
        assert_eq!(revoke.version_value, "0.27.5");
    }

    #[test]
    fn permanent_session_invalidation_matches_0275_error_codes() {
        let cases = [
            (r#"{"code":"AUTH_SESSION_EXPIRED"}"#, true),
            (r#"{"code":"AUTH_SESSION_REVOKED"}"#, true),
            (r#"{"code":"REFRESH_TOKEN_INVALID"}"#, true),
            (r#"{"code":"REFRESH_TOKEN_REUSED"}"#, true),
            (r#"{"code":"UNSUPPORTED_CLIENT_VERSION"}"#, true),
            (r#"{"name":"ACCESS_TOKEN_INVALID"}"#, true),
            (r#"{"code":"INTERNAL_SERVER_ERROR"}"#, false),
            (r#"{"message":"temporary failure"}"#, false),
            ("not-json", false),
        ];
        for (body, expected) in cases {
            assert_eq!(
                auth_error_permanently_invalidates_session(body),
                expected,
                "body={body}"
            );
        }
    }

    #[test]
    fn rejects_invalid_keychain_payloads_and_responses() {
        let invalid_cases = [
            r#"{"version":2,"tokenType":"Bearer","accessToken":"a","accessExpiresAt":1.0,"refreshToken":"r","refreshExpiresAt":"2026-12-01T00:00:00Z","session":{"id":"s","absoluteExpiresAt":"2027-01-01T00:00:00Z"}}"#,
            r#"{"version":1,"tokenType":"Basic","accessToken":"a","accessExpiresAt":1.0,"refreshToken":"r","refreshExpiresAt":"2026-12-01T00:00:00Z","session":{"id":"s","absoluteExpiresAt":"2027-01-01T00:00:00Z"}}"#,
            r#"{"version":1,"tokenType":"Bearer","accessToken":"","accessExpiresAt":1.0,"refreshToken":"r","refreshExpiresAt":"2026-12-01T00:00:00Z","session":{"id":"s","absoluteExpiresAt":"2027-01-01T00:00:00Z"}}"#,
            r#"{"version":1,"tokenType":"Bearer","accessToken":"a","accessExpiresAt":1.0,"refreshToken":"r","refreshExpiresAt":"not-a-date","session":{"id":"s","absoluteExpiresAt":"2027-01-01T00:00:00Z"}}"#,
        ];
        for raw in invalid_cases {
            assert!(StoredAuthTokenPair::from_json(raw).is_err(), "raw={raw}");
        }

        let bad_resp = AuthTokenResponse {
            token_type: "Bearer".into(),
            access_token: "a".into(),
            expires_in: 0,
            refresh_token: "r".into(),
            refresh_expires_at: "2026-12-01T00:00:00Z".into(),
            session: AuthSessionInfo {
                id: "s".into(),
                absolute_expires_at: "2027-01-01T00:00:00Z".into(),
            },
        };
        assert_eq!(
            StoredAuthTokenPair::from_token_response(&bad_resp, 1_795_600_000_000),
            Err(AuthError::InvalidExpiresIn(0))
        );
    }
}
