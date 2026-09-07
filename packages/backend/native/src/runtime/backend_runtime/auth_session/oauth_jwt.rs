use jsonwebtoken::{
  Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, decode_header, encode, jwk::JwkSet,
};
use serde::{Deserialize, Serialize};

use super::{RuntimeError, RuntimeResult};

#[derive(Debug, Deserialize)]
pub(super) struct IdentityClaims {
  pub(super) sub: Option<String>,
  pub(super) email: Option<String>,
  pub(super) nonce: Option<String>,
  #[serde(flatten)]
  pub(super) extra: serde_json::Map<String, serde_json::Value>,
}

pub(super) fn verify_identity_token(
  token: &str,
  jwks: &JwkSet,
  issuer: &str,
  audience: &str,
) -> RuntimeResult<IdentityClaims> {
  let header = decode_header(token).map_err(|_| RuntimeError::invalid_state("invalid_auth_state"))?;
  if !matches!(
    header.alg,
    Algorithm::RS256
      | Algorithm::RS384
      | Algorithm::RS512
      | Algorithm::PS256
      | Algorithm::PS384
      | Algorithm::PS512
      | Algorithm::ES256
      | Algorithm::ES384
  ) {
    return Err(RuntimeError::invalid_state("invalid_auth_state"));
  }
  let kid = header
    .kid
    .as_deref()
    .ok_or_else(|| RuntimeError::invalid_state("invalid_auth_state"))?;
  let jwk = jwks
    .find(kid)
    .ok_or_else(|| RuntimeError::invalid_state("invalid_auth_state"))?;
  let key = DecodingKey::from_jwk(jwk).map_err(|_| RuntimeError::invalid_state("invalid_auth_state"))?;
  let mut validation = Validation::new(header.alg);
  validation.set_audience(&[audience]);
  validation.set_issuer(&[issuer]);
  validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
  decode::<IdentityClaims>(token, &key, &validation)
    .map(|data| data.claims)
    .map_err(|_| RuntimeError::invalid_state("invalid_auth_state"))
}

#[derive(Serialize)]
struct AppleClientSecretClaims<'a> {
  iss: &'a str,
  sub: &'a str,
  aud: &'static str,
  iat: i64,
  exp: i64,
}

pub(super) fn apple_client_secret(
  private_key: &str,
  key_id: &str,
  team_id: &str,
  client_id: &str,
  now: i64,
) -> RuntimeResult<String> {
  let key = EncodingKey::from_ec_pem(private_key.as_bytes())
    .map_err(|_| RuntimeError::invalid_state("invalid_oauth_provider_config"))?;
  let mut header = Header::new(Algorithm::ES256);
  header.kid = Some(key_id.to_string());
  encode(
    &header,
    &AppleClientSecretClaims {
      iss: team_id,
      sub: client_id,
      aud: "https://appleid.apple.com",
      iat: now,
      exp: now + 300,
    },
    &key,
  )
  .map_err(|_| RuntimeError::invalid_state("invalid_oauth_provider_config"))
}

pub(super) fn claim_string<'a>(claims: &'a IdentityClaims, name: &str) -> Option<&'a str> {
  match name {
    "sub" => claims.sub.as_deref(),
    "email" => claims.email.as_deref(),
    _ => claims.extra.get(name).and_then(serde_json::Value::as_str),
  }
}

pub(super) fn claim_bool(claims: &IdentityClaims, name: &str) -> Option<bool> {
  let value = claims.extra.get(name)?;
  value.as_bool().or_else(|| {
    value
      .as_str()
      .and_then(|value| match value.to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" => Some(true),
        "false" | "0" | "no" => Some(false),
        _ => None,
      })
  })
}
