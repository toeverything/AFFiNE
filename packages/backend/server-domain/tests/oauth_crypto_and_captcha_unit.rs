//! Unit tests for OAuth JWT verification (all 8 RS/PS/ES algorithms, clock leeway,
//! weak RSA rejection, leading-zero JWK normalization) and Hashcash SHA3-256.

use std::process::Command;

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::Utc;
use p256::ecdsa::{Signature, SigningKey, signature::Signer as _};
use p256::pkcs8::EncodePrivateKey as _;
use ring::rand::SystemRandom;
use ring::signature::{
  ECDSA_P384_SHA384_FIXED_SIGNING, EcdsaKeyPair, KeyPair as _, RSA_PKCS1_SHA256, RSA_PKCS1_SHA384, RSA_PKCS1_SHA512,
  RSA_PSS_SHA256, RSA_PSS_SHA384, RSA_PSS_SHA512, RsaKeyPair,
};
use server_domain::auth::captcha::{HashcashStamp, sha3_256};
use server_domain::auth::oauth_crypto::{
  Jwk, JwkSet, apple_client_secret, verify_identity_token, verify_identity_token_at,
};

fn strip_leading_zeros(bytes: &[u8]) -> &[u8] {
  let first_nonzero = bytes.iter().position(|&b| b != 0).unwrap_or(bytes.len());
  &bytes[first_nonzero..]
}

fn parse_der_rsa_pub_n_e(der: &[u8]) -> (&[u8], &[u8]) {
  fn read_tlv(buf: &[u8], expected_tag: u8) -> (&[u8], &[u8]) {
    assert_eq!(buf[0], expected_tag);
    let (len, rest) = if buf[1] & 0x80 == 0 {
      (buf[1] as usize, &buf[2..])
    } else {
      let count = (buf[1] & 0x7f) as usize;
      let len = buf[2..2 + count].iter().fold(0usize, |acc, &b| (acc << 8) | b as usize);
      (len, &buf[2 + count..])
    };
    (&rest[..len], &rest[len..])
  }
  let (seq, _) = read_tlv(der, 0x30);
  let (n, rest) = read_tlv(seq, 0x02);
  let (e, _) = read_tlv(rest, 0x02);
  (n, e)
}

fn generate_rsa_pkcs8_der(bits: usize) -> Vec<u8> {
  let out = Command::new("sh")
    .args([
      "-c",
      &format!(
        "openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:{bits} 2>/dev/null | openssl pkcs8 -topk8 -nocrypt -outform DER 2>/dev/null"
      ),
    ])
    .output()
    .expect("openssl genpkey must succeed");
  assert!(out.status.success() && !out.stdout.is_empty(), "openssl genpkey failed");
  out.stdout
}

fn sign_rsa_jwt(
  pair: &RsaKeyPair,
  alg: &str,
  kid: &str,
  exp: i64,
  encoding: &'static dyn ring::signature::RsaEncoding,
) -> String {
  let header = URL_SAFE_NO_PAD.encode(format!(r#"{{"alg":"{alg}","kid":"{kid}"}}"#));
  let payload = URL_SAFE_NO_PAD.encode(format!(
    r#"{{"iss":"https://issuer.test","aud":"client-1","sub":"sub-1","email":"a@b.test","exp":{exp}}}"#
  ));
  let input = format!("{header}.{payload}");
  let mut sig = vec![0_u8; pair.public().modulus_len()];
  pair
    .sign(encoding, &SystemRandom::new(), input.as_bytes(), &mut sig)
    .expect("rsa sign");
  format!("{input}.{}", URL_SAFE_NO_PAD.encode(sig))
}

#[test]
fn es256_verify_and_apple_client_secret_roundtrip() {
  let signing_key = SigningKey::from_slice(&[7_u8; 32]).unwrap();
  let point = signing_key.verifying_key().to_encoded_point(false);

  let jwk = Jwk {
    kty: "EC".into(),
    kid: Some("k1".into()),
    n: None,
    e: None,
    crv: Some("P-256".into()),
    x: Some(URL_SAFE_NO_PAD.encode(point.x().unwrap())),
    y: Some(URL_SAFE_NO_PAD.encode(point.y().unwrap())),
  };
  let header = URL_SAFE_NO_PAD.encode(r#"{"alg":"ES256","kid":"k1"}"#);
  let exp = Utc::now().timestamp() + 300;
  let payload = URL_SAFE_NO_PAD.encode(format!(
    r#"{{"iss":"https://issuer.test","aud":"client-1","sub":"sub-1","email":"a@b.test","exp":{exp}}}"#
  ));
  let input = format!("{header}.{payload}");
  let sig: Signature = signing_key.sign(input.as_bytes());
  let token = format!("{input}.{}", URL_SAFE_NO_PAD.encode(sig.to_bytes()));

  let claims = verify_identity_token(&token, &JwkSet { keys: vec![jwk] }, "https://issuer.test", "client-1").unwrap();
  assert_eq!(claims.sub.as_deref(), Some("sub-1"));
  assert_eq!(claims.email.as_deref(), Some("a@b.test"));

  let pem = signing_key.to_pkcs8_pem(p256::pkcs8::LineEnding::LF).unwrap();
  let apple_jwt = apple_client_secret(&pem, "kid-1", "team-1", "client-1", Utc::now().timestamp()).unwrap();
  let jwk_apple = Jwk {
    kty: "EC".into(),
    kid: Some("kid-1".into()),
    n: None,
    e: None,
    crv: Some("P-256".into()),
    x: Some(URL_SAFE_NO_PAD.encode(point.x().unwrap())),
    y: Some(URL_SAFE_NO_PAD.encode(point.y().unwrap())),
  };
  let verified = verify_identity_token(
    &apple_jwt,
    &JwkSet { keys: vec![jwk_apple] },
    "team-1",
    "https://appleid.apple.com",
  )
  .unwrap();
  assert_eq!(verified.sub.as_deref(), Some("client-1"));
}

#[test]
fn es384_and_all_rsa_algorithms_leeway_and_weak_key_rejection() {
  let rng = SystemRandom::new();
  let now = Utc::now().timestamp();

  // 1. ES384
  let p384_pkcs8 = EcdsaKeyPair::generate_pkcs8(&ECDSA_P384_SHA384_FIXED_SIGNING, &rng).unwrap();
  let p384_pair = EcdsaKeyPair::from_pkcs8(&ECDSA_P384_SHA384_FIXED_SIGNING, p384_pkcs8.as_ref(), &rng).unwrap();
  let pub_bytes = p384_pair.public_key().as_ref();
  assert_eq!(pub_bytes.len(), 97);
  assert_eq!(pub_bytes[0], 0x04);
  let es384_jwk = Jwk {
    kty: "EC".into(),
    kid: Some("p384-1".into()),
    n: None,
    e: None,
    crv: Some("P-384".into()),
    x: Some(URL_SAFE_NO_PAD.encode(&pub_bytes[1..49])),
    y: Some(URL_SAFE_NO_PAD.encode(&pub_bytes[49..97])),
  };
  let es384_header = URL_SAFE_NO_PAD.encode(r#"{"alg":"ES384","kid":"p384-1"}"#);
  let es384_payload = URL_SAFE_NO_PAD.encode(format!(
    r#"{{"iss":"https://issuer.test","aud":"client-1","sub":"sub-384","exp":{}}}"#,
    now + 300
  ));
  let es384_input = format!("{es384_header}.{es384_payload}");
  let es384_sig = p384_pair.sign(&rng, es384_input.as_bytes()).unwrap();
  let es384_token = format!("{es384_input}.{}", URL_SAFE_NO_PAD.encode(es384_sig.as_ref()));
  let es384_claims = verify_identity_token(
    &es384_token,
    &JwkSet { keys: vec![es384_jwk] },
    "https://issuer.test",
    "client-1",
  )
  .unwrap();
  assert_eq!(es384_claims.sub.as_deref(), Some("sub-384"));

  // 2. All 6 RSA algorithms (RS256/384/512 + PS256/384/512) with leading-zero JWK n/e
  let rsa_der = generate_rsa_pkcs8_der(2048);
  let rsa_pair = RsaKeyPair::from_pkcs8(&rsa_der).unwrap();
  let (n_der, e_der) = parse_der_rsa_pub_n_e(rsa_pair.public().as_ref());
  let mut n_with_zero = vec![0x00];
  n_with_zero.extend_from_slice(strip_leading_zeros(n_der));
  let mut e_with_zero = vec![0x00];
  e_with_zero.extend_from_slice(strip_leading_zeros(e_der));
  let rsa_jwk = Jwk {
    kty: "RSA".into(),
    kid: Some("rsa-1".into()),
    n: Some(URL_SAFE_NO_PAD.encode(&n_with_zero)),
    e: Some(URL_SAFE_NO_PAD.encode(&e_with_zero)),
    crv: None,
    x: None,
    y: None,
  };
  let jwks = JwkSet { keys: vec![rsa_jwk] };
  for (alg, enc) in [
    ("RS256", &RSA_PKCS1_SHA256 as &'static dyn ring::signature::RsaEncoding),
    ("RS384", &RSA_PKCS1_SHA384),
    ("RS512", &RSA_PKCS1_SHA512),
    ("PS256", &RSA_PSS_SHA256),
    ("PS384", &RSA_PSS_SHA384),
    ("PS512", &RSA_PSS_SHA512),
  ] {
    let tok = sign_rsa_jwt(&rsa_pair, alg, "rsa-1", now + 300, enc);
    let claims = verify_identity_token(&tok, &jwks, "https://issuer.test", "client-1").unwrap();
    assert_eq!(claims.sub.as_deref(), Some("sub-1"), "failed for {alg}");
  }

  // 3. Clock leeway closed-interval boundary: exp + 59 Ok, exp + 60 Ok, exp + 61 Err
  let fixed_exp = 1_800_000_000_i64;
  let tok_boundary = sign_rsa_jwt(&rsa_pair, "RS256", "rsa-1", fixed_exp, &RSA_PKCS1_SHA256);
  assert!(verify_identity_token_at(&tok_boundary, &jwks, "https://issuer.test", "client-1", fixed_exp + 59).is_ok());
  assert!(verify_identity_token_at(&tok_boundary, &jwks, "https://issuer.test", "client-1", fixed_exp + 60).is_ok());
  assert!(verify_identity_token_at(&tok_boundary, &jwks, "https://issuer.test", "client-1", fixed_exp + 61).is_err());

  // 4. Weak 512-bit RSA JWK rejected by ring's 2048..=8192 policy
  let weak_jwk = Jwk {
    kty: "RSA".into(),
    kid: Some("weak".into()),
    n: Some(URL_SAFE_NO_PAD.encode([0xab_u8; 64])),
    e: Some(URL_SAFE_NO_PAD.encode([0x01, 0x00, 0x01])),
    crv: None,
    x: None,
    y: None,
  };
  let weak_header = URL_SAFE_NO_PAD.encode(r#"{"alg":"RS256","kid":"weak"}"#);
  let weak_payload = URL_SAFE_NO_PAD.encode(format!(
    r#"{{"iss":"https://issuer.test","aud":"client-1","sub":"sub-1","exp":{}}}"#,
    now + 300
  ));
  let weak_tok = format!("{weak_header}.{weak_payload}.{}", URL_SAFE_NO_PAD.encode([0_u8; 64]));
  assert!(
    verify_identity_token(
      &weak_tok,
      &JwkSet { keys: vec![weak_jwk] },
      "https://issuer.test",
      "client-1"
    )
    .is_err()
  );
}

#[test]
fn sha3_256_matches_nist_vectors() {
  assert_eq!(
    hex::encode(sha3_256(b"")),
    "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a"
  );
  assert_eq!(
    hex::encode(sha3_256(b"abc")),
    "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532"
  );
}

#[test]
fn hashcash_mint_and_verify() {
  let stamp = HashcashStamp::mint("res-1", 8);
  let formatted = stamp.format();
  let parsed = HashcashStamp::parse(&formatted).expect("parse stamp");
  assert!(parsed.check(8, "res-1", Utc::now()));
  assert!(!parsed.check(12, "res-1", Utc::now()));
  assert!(!parsed.check(8, "res-2", Utc::now()));
}

#[test]
fn github_token_form_omits_grant_type() {
  let gh = server_domain::auth::oauth::build_oauth_token_form("cid", "sec", "c1", "https://cb", false, None);
  let gh_keys: Vec<&str> = gh.iter().map(|(k, _)| *k).collect();
  assert_eq!(gh_keys, vec!["code", "client_id", "client_secret", "redirect_uri"]);
  let oidc = server_domain::auth::oauth::build_oauth_token_form("cid", "sec", "c1", "https://cb", true, Some("v1"));
  let oidc_keys: Vec<&str> = oidc.iter().map(|(k, _)| *k).collect();
  assert_eq!(
    oidc_keys,
    vec![
      "code",
      "client_id",
      "client_secret",
      "redirect_uri",
      "grant_type",
      "code_verifier"
    ]
  );
}
