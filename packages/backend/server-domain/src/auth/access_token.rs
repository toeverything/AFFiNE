//! Native auth-session JWT access token signing and verification aligned 1:1
//! with `v0.27.5` `packages/backend/native/src/auth_session.rs` and
//! `packages/backend/server/src/core/auth/access-token.ts`.

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac as _};
use serde::{Deserialize, Serialize};
use server_types::DomainError;
use sha2::Sha256;

use crate::users::CurrentUserView;

type HmacSha256 = Hmac<Sha256>;

pub const ACCESS_TOKEN_TYPE: &str = "access";
pub const ACCESS_TOKEN_ISSUER: &str = "affine";
pub const ACCESS_TOKEN_AUDIENCE: &str = "affine-server";
pub const CLOCK_TOLERANCE_SECONDS: i64 = 30;
pub const DEFAULT_ACCESS_TOKEN_TTL_SECONDS: i64 = 900;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AccessTokenErrorCode {
  AccessTokenInvalid,
  AccessTokenExpired,
  AuthSessionRevoked,
  AuthSessionExpired,
}

impl AccessTokenErrorCode {
  pub const fn as_code(self) -> &'static str {
    match self {
      Self::AccessTokenInvalid => "ACCESS_TOKEN_INVALID",
      Self::AccessTokenExpired => "ACCESS_TOKEN_EXPIRED",
      Self::AuthSessionRevoked => "AUTH_SESSION_REVOKED",
      Self::AuthSessionExpired => "AUTH_SESSION_EXPIRED",
    }
  }

  pub const fn as_name(self) -> &'static str {
    self.as_code()
  }
}

#[derive(Clone, Debug)]
pub struct BearerPrincipal {
  pub user: CurrentUserView,
  pub session_id: String,
  pub user_session_id: String,
  pub auth_session_id: String,
  pub authenticated_at: DateTime<Utc>,
  pub expires_at: Option<DateTime<Utc>>,
  pub sign_in_client_version: Option<String>,
  pub refresh_client_version: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AccessTokenVerification {
  Valid { user_id: String, auth_session_id: String },
  Expired,
  Invalid,
}

#[derive(Serialize)]
struct AccessTokenHeader<'a> {
  alg: &'static str,
  typ: &'static str,
  kid: &'a str,
}

#[derive(Deserialize)]
struct ParsedAccessTokenHeader {
  alg: String,
  typ: String,
  kid: String,
}

#[derive(Serialize)]
struct AccessTokenClaims<'a> {
  sub: &'a str,
  sid: &'a str,
  typ: &'static str,
  iss: &'static str,
  aud: &'static str,
  iat: i64,
  exp: i64,
}

#[derive(Deserialize)]
struct ParsedAccessTokenClaims {
  sub: String,
  sid: String,
  typ: String,
  iss: String,
  aud: String,
  iat: i64,
  exp: i64,
}

/// Returns `true` when `token` has the 3-segment base64url JWT shape.
/// Rejects raw cookie `session_id` UUIDs passed as `Authorization: Bearer`.
pub fn is_likely_jwt(token: &str) -> bool {
  let mut parts = token.split('.');
  let (Some(h), Some(p), Some(s), None) = (parts.next(), parts.next(), parts.next(), parts.next()) else {
    return false;
  };
  let is_b64url =
    |seg: &str| !seg.is_empty() && seg.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
  is_b64url(h) && is_b64url(p) && is_b64url(s)
}

fn decode_segment<T: for<'de> Deserialize<'de>>(segment: &str) -> Option<T> {
  let bytes = URL_SAFE_NO_PAD.decode(segment).ok()?;
  serde_json::from_slice(&bytes).ok()
}

pub fn access_token_key_id(token: &str) -> Option<String> {
  let mut segments = token.split('.');
  let header: ParsedAccessTokenHeader = decode_segment(segments.next()?)?;
  segments.next()?;
  segments.next()?;
  if segments.next().is_some() || header.alg != "HS256" || header.typ != "JWT" {
    return None;
  }
  Some(header.kid)
}

pub fn sign_access_token(
  user_id: &str,
  auth_session_id: &str,
  key_id: &str,
  secret: &[u8],
  issued_at: i64,
  expires_at: i64,
) -> Result<String, DomainError> {
  if user_id.is_empty() || auth_session_id.is_empty() || key_id.is_empty() {
    return Err(DomainError::Validation("access_token_invalid_identity".to_owned()));
  }
  if secret.len() < 32 {
    return Err(DomainError::Internal("access_token_signing_key_too_short".to_owned()));
  }
  if expires_at <= issued_at {
    return Err(DomainError::Validation("access_token_invalid_expiry".to_owned()));
  }
  let header = URL_SAFE_NO_PAD.encode(
    serde_json::to_vec(&AccessTokenHeader {
      alg: "HS256",
      typ: "JWT",
      kid: key_id,
    })
    .map_err(|e| DomainError::Internal(format!("encode access token header: {e}")))?,
  );
  let claims = URL_SAFE_NO_PAD.encode(
    serde_json::to_vec(&AccessTokenClaims {
      sub: user_id,
      sid: auth_session_id,
      typ: ACCESS_TOKEN_TYPE,
      iss: ACCESS_TOKEN_ISSUER,
      aud: ACCESS_TOKEN_AUDIENCE,
      iat: issued_at,
      exp: expires_at,
    })
    .map_err(|e| DomainError::Internal(format!("encode access token claims: {e}")))?,
  );
  let signing_input = format!("{header}.{claims}");
  let mut mac =
    HmacSha256::new_from_slice(secret).map_err(|_| DomainError::Internal("invalid access token key".to_owned()))?;
  mac.update(signing_input.as_bytes());
  let signature = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
  Ok(format!("{signing_input}.{signature}"))
}

pub fn verify_access_token(token: &str, expected_key_id: &str, secret: &[u8], now: i64) -> AccessTokenVerification {
  let segments: Vec<&str> = token.split('.').collect();
  if segments.len() != 3 {
    return AccessTokenVerification::Invalid;
  }
  let Some(header) = decode_segment::<ParsedAccessTokenHeader>(segments[0]) else {
    return AccessTokenVerification::Invalid;
  };
  if header.alg != "HS256" || header.typ != "JWT" || header.kid != expected_key_id {
    return AccessTokenVerification::Invalid;
  }
  let Ok(signature) = URL_SAFE_NO_PAD.decode(segments[2]) else {
    return AccessTokenVerification::Invalid;
  };
  let Ok(mut mac) = HmacSha256::new_from_slice(secret) else {
    return AccessTokenVerification::Invalid;
  };
  mac.update(format!("{}.{}", segments[0], segments[1]).as_bytes());
  if mac.verify_slice(&signature).is_err() {
    return AccessTokenVerification::Invalid;
  }
  let Some(claims) = decode_segment::<ParsedAccessTokenClaims>(segments[1]) else {
    return AccessTokenVerification::Invalid;
  };
  if claims.typ != ACCESS_TOKEN_TYPE
    || claims.iss != ACCESS_TOKEN_ISSUER
    || claims.aud != ACCESS_TOKEN_AUDIENCE
    || claims.iat > now + CLOCK_TOLERANCE_SECONDS
    || claims.exp <= claims.iat
  {
    return AccessTokenVerification::Invalid;
  }
  if claims.exp + CLOCK_TOLERANCE_SECONDS <= now {
    return AccessTokenVerification::Expired;
  }
  AccessTokenVerification::Valid {
    user_id: claims.sub,
    auth_session_id: claims.sid,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn jwt_sign_verify_tolerance_and_non_jwt_rejection() {
    let secret = [7u8; 32];
    let token = sign_access_token("user-1", "session-1", "key-1", &secret, 1_700_000_000, 1_700_000_900).unwrap();
    assert!(is_likely_jwt(&token));
    assert!(!is_likely_jwt("550e8400-e29b-41d4-a716-446655440000"));
    assert!(!is_likely_jwt("not-a-jwt"));
    assert_eq!(access_token_key_id(&token), Some("key-1".to_owned()));
    assert_eq!(
      verify_access_token(&token, "key-1", &secret, 1_700_000_100),
      AccessTokenVerification::Valid {
        user_id: "user-1".to_owned(),
        auth_session_id: "session-1".to_owned(),
      }
    );
    assert_eq!(
      verify_access_token(&token, "key-1", &secret, 1_700_000_929),
      AccessTokenVerification::Valid {
        user_id: "user-1".to_owned(),
        auth_session_id: "session-1".to_owned(),
      }
    );
    assert_eq!(
      verify_access_token(&token, "key-1", &secret, 1_700_000_930),
      AccessTokenVerification::Expired
    );
    assert_eq!(
      verify_access_token(&token, "wrong-key", &secret, 1_700_000_100),
      AccessTokenVerification::Invalid
    );
  }
}
