//! OIDC and Apple JWT verification (RS256/RS384/RS512, PS256/PS384/PS512,
//! ES256, ES384) via `ring` and `p256`, plus Apple ES256 client-secret signing.
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::Utc;
use p256::ecdsa::{
  Signature, SigningKey, VerifyingKey,
  signature::{Signer as _, Verifier as _},
};
use p256::{EncodedPoint, SecretKey, pkcs8::DecodePrivateKey as _};
use ring::rsa::PublicKeyComponents;
use ring::signature::{
  ECDSA_P384_SHA384_FIXED, RSA_PKCS1_2048_8192_SHA256, RSA_PKCS1_2048_8192_SHA384, RSA_PKCS1_2048_8192_SHA512,
  RSA_PSS_2048_8192_SHA256, RSA_PSS_2048_8192_SHA384, RSA_PSS_2048_8192_SHA512, RsaParameters, UnparsedPublicKey,
};
use serde::Deserialize;
use server_types::DomainError;
const CLOCK_LEEWAY_SECS: i64 = 60;
#[derive(Debug, Deserialize)]
pub struct IdentityClaims {
  pub sub: Option<String>,
  pub email: Option<String>,
  pub nonce: Option<String>,
  pub iss: Option<String>,
  pub aud: Option<serde_json::Value>,
  pub exp: Option<i64>,
  #[serde(flatten)]
  pub extra: serde_json::Map<String, serde_json::Value>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct JwkSet {
  pub keys: Vec<Jwk>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Jwk {
  pub kty: String,
  pub kid: Option<String>,
  pub n: Option<String>,
  pub e: Option<String>,
  pub crv: Option<String>,
  pub x: Option<String>,
  pub y: Option<String>,
}
#[derive(Deserialize)]
struct JwtHeader {
  alg: String,
  kid: Option<String>,
}
pub fn extract_jwt_kid(token: &str) -> Option<String> {
  let header_b64 = token.split('.').next()?;
  let header_bytes = URL_SAFE_NO_PAD.decode(header_b64).ok()?;
  let header: JwtHeader = serde_json::from_slice(&header_bytes).ok()?;
  header.kid
}
pub fn claim_string<'a>(claims: &'a IdentityClaims, name: &str) -> Option<&'a str> {
  match name {
    "sub" => claims.sub.as_deref(),
    "email" => claims.email.as_deref(),
    _ => claims.extra.get(name).and_then(serde_json::Value::as_str),
  }
}
pub fn json_bool(value: &serde_json::Value) -> Option<bool> {
  value.as_bool().or_else(|| {
    value.as_str().and_then(|s| match s.to_ascii_lowercase().as_str() {
      "true" | "1" | "yes" => Some(true),
      "false" | "0" | "no" => Some(false),
      _ => None,
    })
  })
}
pub fn claim_bool(claims: &IdentityClaims, name: &str) -> Option<bool> {
  claims.extra.get(name).and_then(json_bool)
}
fn invalid_auth_state() -> DomainError {
  DomainError::Unauthorized("invalid_auth_state".to_owned())
}
pub fn verify_identity_token(
  token: &str,
  jwks: &JwkSet,
  issuer: &str,
  audience: &str,
) -> Result<IdentityClaims, DomainError> {
  verify_identity_token_at(token, jwks, issuer, audience, Utc::now().timestamp())
}
pub fn verify_identity_token_at(
  token: &str,
  jwks: &JwkSet,
  issuer: &str,
  audience: &str,
  now_ts: i64,
) -> Result<IdentityClaims, DomainError> {
  let parts: Vec<&str> = token.split('.').collect();
  if parts.len() != 3 {
    return Err(invalid_auth_state());
  }
  let header: JwtHeader = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[0]).map_err(|_| invalid_auth_state())?)
    .map_err(|_| invalid_auth_state())?;
  let kid = header.kid.as_deref().ok_or_else(invalid_auth_state)?;
  let jwk = jwks
    .keys
    .iter()
    .find(|k| k.kid.as_deref() == Some(kid))
    .ok_or_else(invalid_auth_state)?;
  let signing_input = format!("{}.{}", parts[0], parts[1]);
  let sig_bytes = URL_SAFE_NO_PAD.decode(parts[2]).map_err(|_| invalid_auth_state())?;
  let verified = match header.alg.as_str() {
    "RS256" => verify_rsa_jwk(jwk, signing_input.as_bytes(), &sig_bytes, &RSA_PKCS1_2048_8192_SHA256),
    "RS384" => verify_rsa_jwk(jwk, signing_input.as_bytes(), &sig_bytes, &RSA_PKCS1_2048_8192_SHA384),
    "RS512" => verify_rsa_jwk(jwk, signing_input.as_bytes(), &sig_bytes, &RSA_PKCS1_2048_8192_SHA512),
    "PS256" => verify_rsa_jwk(jwk, signing_input.as_bytes(), &sig_bytes, &RSA_PSS_2048_8192_SHA256),
    "PS384" => verify_rsa_jwk(jwk, signing_input.as_bytes(), &sig_bytes, &RSA_PSS_2048_8192_SHA384),
    "PS512" => verify_rsa_jwk(jwk, signing_input.as_bytes(), &sig_bytes, &RSA_PSS_2048_8192_SHA512),
    "ES256" => verify_es256_jwk(jwk, signing_input.as_bytes(), &sig_bytes),
    "ES384" => verify_es384_jwk(jwk, signing_input.as_bytes(), &sig_bytes),
    _ => false,
  };
  if !verified {
    return Err(invalid_auth_state());
  }
  let claims: IdentityClaims =
    serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[1]).map_err(|_| invalid_auth_state())?)
      .map_err(|_| invalid_auth_state())?;
  let exp = claims.exp.ok_or_else(invalid_auth_state)?;
  let aud_ok = match &claims.aud {
    Some(serde_json::Value::String(s)) => s == audience,
    Some(serde_json::Value::Array(arr)) => arr.iter().any(|v| v.as_str() == Some(audience)),
    _ => false,
  };
  if exp + CLOCK_LEEWAY_SECS < now_ts
    || claims.iss.as_deref() != Some(issuer)
    || !aud_ok
    || claims.sub.as_deref().is_none_or(str::is_empty)
  {
    return Err(invalid_auth_state());
  }
  Ok(claims)
}
pub fn apple_client_secret(
  private_key_pem: &str,
  key_id: &str,
  team_id: &str,
  client_id: &str,
  now: i64,
) -> Result<String, DomainError> {
  let key = SecretKey::from_pkcs8_pem(private_key_pem)
    .or_else(|_| SecretKey::from_sec1_pem(private_key_pem))
    .map_err(|_| DomainError::Validation("invalid_oauth_provider_config".to_owned()))?;
  let header = URL_SAFE_NO_PAD.encode(serde_json::json!({ "alg": "ES256", "kid": key_id }).to_string());
  let claims = URL_SAFE_NO_PAD.encode(
    serde_json::json!({ "iss": team_id, "sub": client_id, "aud": "https://appleid.apple.com", "iat": now, "exp": now + 300 }).to_string(),
  );
  let input = format!("{header}.{claims}");
  let sig: Signature = SigningKey::from(key).sign(input.as_bytes());
  Ok(format!("{input}.{}", URL_SAFE_NO_PAD.encode(sig.to_bytes())))
}
fn decode_ec_sec1_uncompressed(jwk: &Jwk, crv: &str, coord_len: usize) -> Option<Vec<u8>> {
  if jwk.kty != "EC" || jwk.crv.as_deref() != Some(crv) {
    return None;
  }
  let x = URL_SAFE_NO_PAD.decode(jwk.x.as_deref()?).ok()?;
  let y = URL_SAFE_NO_PAD.decode(jwk.y.as_deref()?).ok()?;
  if x.len() != coord_len || y.len() != coord_len {
    return None;
  }
  let mut sec1 = Vec::with_capacity(1 + coord_len * 2);
  sec1.push(0x04);
  sec1.extend_from_slice(&x);
  sec1.extend_from_slice(&y);
  Some(sec1)
}
fn verify_es256_jwk(jwk: &Jwk, message: &[u8], sig_bytes: &[u8]) -> bool {
  let Some(sec1) = (sig_bytes.len() == 64)
    .then(|| decode_ec_sec1_uncompressed(jwk, "P-256", 32))
    .flatten()
  else {
    return false;
  };
  EncodedPoint::from_bytes(&sec1)
    .ok()
    .and_then(|pt| VerifyingKey::from_encoded_point(&pt).ok())
    .and_then(|vk| {
      Signature::from_slice(sig_bytes)
        .ok()
        .map(|sig| vk.verify(message, &sig).is_ok())
    })
    .unwrap_or(false)
}
fn verify_es384_jwk(jwk: &Jwk, message: &[u8], sig_bytes: &[u8]) -> bool {
  let Some(sec1) = (sig_bytes.len() == 96)
    .then(|| decode_ec_sec1_uncompressed(jwk, "P-384", 48))
    .flatten()
  else {
    return false;
  };
  UnparsedPublicKey::new(&ECDSA_P384_SHA384_FIXED, &sec1)
    .verify(message, sig_bytes)
    .is_ok()
}
fn strip_leading_zeros(bytes: &[u8]) -> &[u8] {
  let first_nonzero = bytes.iter().position(|&b| b != 0).unwrap_or(bytes.len());
  &bytes[first_nonzero..]
}
fn verify_rsa_jwk(jwk: &Jwk, message: &[u8], signature: &[u8], alg: &'static RsaParameters) -> bool {
  let dec = |opt: &Option<String>| opt.as_deref().and_then(|s| URL_SAFE_NO_PAD.decode(s).ok());
  let (Some(n_raw), Some(e_raw)) = (dec(&jwk.n), dec(&jwk.e)) else {
    return false;
  };
  let (n, e) = (strip_leading_zeros(&n_raw), strip_leading_zeros(&e_raw));
  jwk.kty == "RSA"
    && !n.is_empty()
    && !e.is_empty()
    && PublicKeyComponents { n, e }.verify(alg, message, signature).is_ok()
}
