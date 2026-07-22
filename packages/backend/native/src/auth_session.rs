use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, KeyInit, Mac};
use napi::{Result, bindgen_prelude::*};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const ACCESS_TOKEN_TYPE: &str = "session_access";
const ACCESS_TOKEN_ISSUER: &str = "affine";
const ACCESS_TOKEN_AUDIENCE: &str = "affine-client";
const REFRESH_TOKEN_PREFIX: &str = "aff_rt_v1";
const CLOCK_TOLERANCE_SECONDS: i64 = 30;

type HmacSha256 = Hmac<Sha256>;

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

#[derive(Serialize, Deserialize)]
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

#[napi(object)]
pub struct AuthSessionAccessTokenVerification {
  pub status: String,
  pub user_id: Option<String>,
  pub auth_session_id: Option<String>,
}

#[napi(object)]
pub struct AuthSessionRefreshToken {
  pub token: String,
  pub id: String,
  pub secret_hash: String,
}

#[napi(object)]
pub struct ParsedAuthSessionRefreshToken {
  pub id: String,
  pub secret_hash: String,
}

fn invalid_access_token() -> AuthSessionAccessTokenVerification {
  AuthSessionAccessTokenVerification {
    status: "invalid".into(),
    user_id: None,
    auth_session_id: None,
  }
}

fn decode_segment<T: for<'de> Deserialize<'de>>(segment: &str) -> Option<T> {
  let bytes = URL_SAFE_NO_PAD.decode(segment).ok()?;
  serde_json::from_slice(&bytes).ok()
}

fn hash_refresh_secret(secret: &[u8]) -> String {
  hex::encode(Sha256::digest(secret))
}

#[napi]
pub fn auth_session_access_token_key_id(token: String) -> Option<String> {
  let mut segments = token.split('.');
  let header: ParsedAccessTokenHeader = decode_segment(segments.next()?)?;
  segments.next()?;
  segments.next()?;
  if segments.next().is_some() || header.alg != "HS256" || header.typ != "JWT" {
    return None;
  }
  Some(header.kid)
}

#[napi]
pub fn sign_auth_session_access_token(
  user_id: String,
  auth_session_id: String,
  key_id: String,
  secret: Buffer,
  issued_at: i64,
  expires_at: i64,
) -> Result<String> {
  if user_id.is_empty() || auth_session_id.is_empty() || key_id.is_empty() {
    return Err(Error::from_reason("Access token identifiers must not be empty"));
  }
  if secret.len() < 32 {
    return Err(Error::from_reason("Access token signing key is too short"));
  }
  if expires_at <= issued_at {
    return Err(Error::from_reason("Access token expiry must follow issuance"));
  }
  let header = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&AccessTokenHeader {
    alg: "HS256",
    typ: "JWT",
    kid: &key_id,
  })?);
  let claims = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&AccessTokenClaims {
    sub: &user_id,
    sid: &auth_session_id,
    typ: ACCESS_TOKEN_TYPE,
    iss: ACCESS_TOKEN_ISSUER,
    aud: ACCESS_TOKEN_AUDIENCE,
    iat: issued_at,
    exp: expires_at,
  })?);
  let signing_input = format!("{header}.{claims}");
  let mut mac =
    HmacSha256::new_from_slice(secret.as_ref()).map_err(|_| Error::from_reason("Invalid access token signing key"))?;
  mac.update(signing_input.as_bytes());
  let signature = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
  Ok(format!("{signing_input}.{signature}"))
}

#[napi]
pub fn verify_auth_session_access_token(
  token: String,
  expected_key_id: String,
  secret: Buffer,
  now: i64,
) -> AuthSessionAccessTokenVerification {
  let segments = token.split('.').collect::<Vec<_>>();
  if segments.len() != 3 {
    return invalid_access_token();
  }
  let Some(header) = decode_segment::<ParsedAccessTokenHeader>(segments[0]) else {
    return invalid_access_token();
  };
  if header.alg != "HS256" || header.typ != "JWT" || header.kid != expected_key_id {
    return invalid_access_token();
  }
  let Ok(signature) = URL_SAFE_NO_PAD.decode(segments[2]) else {
    return invalid_access_token();
  };
  let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_ref()) else {
    return invalid_access_token();
  };
  mac.update(format!("{}.{}", segments[0], segments[1]).as_bytes());
  if mac.verify_slice(&signature).is_err() {
    return invalid_access_token();
  }
  let Some(claims) = decode_segment::<ParsedAccessTokenClaims>(segments[1]) else {
    return invalid_access_token();
  };
  if claims.typ != ACCESS_TOKEN_TYPE
    || claims.iss != ACCESS_TOKEN_ISSUER
    || claims.aud != ACCESS_TOKEN_AUDIENCE
    || claims.iat > now + CLOCK_TOLERANCE_SECONDS
  {
    return invalid_access_token();
  }
  if claims.exp + CLOCK_TOLERANCE_SECONDS <= now {
    return AuthSessionAccessTokenVerification {
      status: "expired".into(),
      user_id: None,
      auth_session_id: None,
    };
  }
  if claims.exp <= claims.iat {
    return invalid_access_token();
  }
  AuthSessionAccessTokenVerification {
    status: "valid".into(),
    user_id: Some(claims.sub),
    auth_session_id: Some(claims.sid),
  }
}

#[napi]
pub fn create_auth_session_refresh_token() -> AuthSessionRefreshToken {
  let mut id = [0_u8; 18];
  let mut secret = [0_u8; 32];
  rand::rng().fill_bytes(&mut id);
  rand::rng().fill_bytes(&mut secret);
  let id = URL_SAFE_NO_PAD.encode(id);
  let encoded_secret = URL_SAFE_NO_PAD.encode(secret);
  AuthSessionRefreshToken {
    token: format!("{REFRESH_TOKEN_PREFIX}.{id}.{encoded_secret}"),
    id,
    secret_hash: hash_refresh_secret(&secret),
  }
}

#[napi]
pub fn parse_auth_session_refresh_token(token: String) -> Option<ParsedAuthSessionRefreshToken> {
  let segments = token.split('.').collect::<Vec<_>>();
  if segments.len() != 3 || segments[0] != REFRESH_TOKEN_PREFIX {
    return None;
  }
  let id = URL_SAFE_NO_PAD.decode(segments[1]).ok()?;
  let secret = URL_SAFE_NO_PAD.decode(segments[2]).ok()?;
  if id.len() != 18 || secret.len() != 32 {
    return None;
  }
  Some(ParsedAuthSessionRefreshToken {
    id: segments[1].into(),
    secret_hash: hash_refresh_secret(&secret),
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn access_token_vector_and_policy() {
    let secret = || Buffer::from(vec![7; 32]);
    let token = sign_auth_session_access_token(
      "user-1".into(),
      "session-1".into(),
      "key-1".into(),
      secret(),
      1_700_000_000,
      1_700_000_900,
    )
    .unwrap();
    assert_eq!(auth_session_access_token_key_id(token.clone()), Some("key-1".into()));
    let valid = verify_auth_session_access_token(token.clone(), "key-1".into(), secret(), 1_700_000_100);
    assert_eq!(valid.status, "valid");
    assert_eq!(valid.user_id.as_deref(), Some("user-1"));
    assert_eq!(
      verify_auth_session_access_token(token.clone(), "key-1".into(), secret(), 1_700_000_929).status,
      "valid"
    );
    assert_eq!(
      verify_auth_session_access_token(token.clone(), "key-1".into(), secret(), 1_700_000_930).status,
      "expired"
    );
    assert_eq!(
      verify_auth_session_access_token(token, "key-1".into(), secret(), 1_700_001_000).status,
      "expired"
    );
  }

  #[test]
  fn refresh_token_round_trip_and_rejection() {
    let created = create_auth_session_refresh_token();
    let parsed = parse_auth_session_refresh_token(created.token).unwrap();
    assert_eq!(parsed.id, created.id);
    assert_eq!(parsed.secret_hash, created.secret_hash);
    assert!(parse_auth_session_refresh_token("aff_rt_v1.bad.bad".into()).is_none());
    let golden = parse_auth_session_refresh_token(
      "aff_rt_v1.AAECAwQFBgcICQoLDA0ODxAR.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8".into(),
    )
    .unwrap();
    assert_eq!(golden.id, "AAECAwQFBgcICQoLDA0ODxAR");
    assert_eq!(
      golden.secret_hash,
      "630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd"
    );
  }
}
