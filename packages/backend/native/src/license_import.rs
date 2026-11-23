use std::borrow::Cow;

use aes_gcm::{
  AesGcm, KeyInit,
  aead::{Aead, generic_array::typenum::U12},
  aes::Aes256,
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use napi::{Error, Result, Status};
use serde::Deserialize;
use sha2::{Digest, Sha256};

const LICENSE_AES_KEY: Option<&str> = match option_env!("AFFINE_PRO_LICENSE_AES_KEY") {
  Some(key) => Some(key),
  None if cfg!(any(test, debug_assertions)) => Some("TEST_LICENSE_AES_KEY"),
  None => None,
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LegacyEnvelope {
  payload: String,
  signature: String,
}

// AES is an import-only compatibility boundary. Stored entitlement payloads
// never need this key.
pub(crate) fn normalize_license(payload: &[u8]) -> Result<Cow<'_, [u8]>> {
  normalize_with_key(payload, LICENSE_AES_KEY)
}

fn normalize_with_key<'a>(payload: &'a [u8], aes_key: Option<&str>) -> Result<Cow<'a, [u8]>> {
  if payload.iter().find(|byte| !byte.is_ascii_whitespace()) == Some(&b'{') {
    return Ok(Cow::Borrowed(payload));
  }
  if payload.len() <= 26 || payload[..2] != [12, 12] {
    return Err(Error::new(Status::InvalidArg, "license_invalid_envelope"));
  }
  let aes_key = aes_key.ok_or_else(|| Error::new(Status::GenericFailure, "license_aes_key_missing"))?;
  let key: [u8; 32] = if aes_key.len() == 64 {
    hex::decode(aes_key)
      .ok()
      .and_then(|key| key.try_into().ok())
      .unwrap_or_else(|| Sha256::digest(aes_key.as_bytes()).into())
  } else {
    Sha256::digest(aes_key.as_bytes()).into()
  };
  let iv = &payload[2..14];
  let mut ciphertext = payload[26..].to_vec();
  ciphertext.extend_from_slice(&payload[14..26]);
  let cipher = AesGcm::<Aes256, U12, U12>::new(&key.into());
  let plaintext = cipher
    .decrypt(iv.into(), ciphertext.as_ref())
    .map_err(|_| Error::new(Status::InvalidArg, "license_decrypt_failed"))?;
  let envelope: LegacyEnvelope =
    serde_json::from_slice(&plaintext).map_err(|_| Error::new(Status::InvalidArg, "license_invalid_envelope"))?;
  serde_json::to_vec(&serde_json::json!({
    "signatureVersion": "legacy-v0",
    "iv": BASE64.encode(iv),
    "payload": envelope.payload,
    "signature": envelope.signature,
  }))
  .map(Cow::Owned)
  .map_err(|_| Error::new(Status::InvalidArg, "license_invalid_envelope"))
}

#[cfg(test)]
pub(crate) mod tests {
  use chrono::{DateTime, Duration, Utc};
  use p256::{
    ecdsa::{Signature, SigningKey, signature::Signer},
    pkcs8::DecodePrivateKey,
  };

  use super::*;

  pub(crate) fn legacy_license(workspace_id: &str, expires_at: DateTime<Utc>) -> Vec<u8> {
    let key = SigningKey::from_pkcs8_pem(crate::entitlement::tests::TEST_PRIVATE_KEY).unwrap();
    let payload = serde_json::to_string_pretty(&serde_json::json!({
      "entity": "test", "issuer": "Toeverything", "subject": "selfhostedteam",
      "issuedAt": (expires_at - Duration::days(365)).to_rfc3339(),
      "expiresAt": expires_at.to_rfc3339(),
      "data": { "id": format!("license:{workspace_id}"), "workspaceId": workspace_id,
        "quantity": 10, "plan": "selfhostedteam", "recurring": "monthly",
        "endAt": (expires_at + Duration::days(1)).to_rfc3339() }
    }))
    .unwrap();
    let iv = [7u8; 12];
    let mut message = iv.to_vec();
    message.extend_from_slice(payload.as_bytes());
    let signature: Signature = key.sign(&message);
    let plaintext = serde_json::to_vec(&serde_json::json!({
      "payload": payload, "signature": hex::encode(signature.to_der())
    }))
    .unwrap();
    let aes_key: [u8; 32] = Sha256::digest(b"TEST_LICENSE_AES_KEY").into();
    let cipher = AesGcm::<Aes256, U12, U12>::new(&aes_key.into());
    let ciphertext = cipher.encrypt((&iv).into(), plaintext.as_ref()).unwrap();
    let split = ciphertext.len() - 12;
    let mut file = vec![12, 12];
    file.extend_from_slice(&iv);
    file.extend_from_slice(&ciphertext[split..]);
    file.extend_from_slice(&ciphertext[..split]);
    file
  }

  #[test]
  fn historical_files_import_without_changing_the_signed_message() {
    let now = DateTime::parse_from_rfc3339("2026-09-08T00:00:00Z")
      .unwrap()
      .with_timezone(&Utc);
    let workspace = "d6f52bc7-d62a-4822-804a-335fa7dfe5a6";
    let files: &[&[u8]] = &[
      include_bytes!("../fixtures/valid.license"),
      include_bytes!("../fixtures/expired.license"),
      include_bytes!("../fixtures/expired-end-at.license"),
    ];
    let hashed_key = hex::encode(Sha256::digest(b"TEST_LICENSE_AES_KEY"));
    for file in files {
      let normalized = normalize_with_key(file, Some("TEST_LICENSE_AES_KEY")).unwrap();
      assert_eq!(normalized, normalize_with_key(file, Some(&hashed_key)).unwrap());
      assert_eq!(
        normalize_with_key(&normalized, None).unwrap().as_ref(),
        normalized.as_ref()
      );
      let envelope: serde_json::Value = serde_json::from_slice(&normalized).unwrap();
      assert_eq!(envelope["signatureVersion"], "legacy-v0");
      assert_eq!(BASE64.decode(envelope["iv"].as_str().unwrap()).unwrap(), file[2..14]);
      assert!(!envelope["signature"].as_str().unwrap().is_empty());
      assert!(normalize_with_key(file, None).is_err());
      assert!(normalize_with_key(file, Some("wrong-key")).is_err());
    }
    let original = legacy_license(workspace, now + Duration::days(365));
    let normalized = normalize_with_key(&original, Some("TEST_LICENSE_AES_KEY")).unwrap();
    let envelope: serde_json::Value = serde_json::from_slice(&normalized).unwrap();
    let payload: serde_json::Value = serde_json::from_str(envelope["payload"].as_str().unwrap()).unwrap();
    assert_eq!(
      envelope["payload"].as_str().unwrap(),
      serde_json::to_string_pretty(&payload).unwrap()
    );
    for malformed in [&original[..1], &original[..26], &[12, 13, 0][..]] {
      assert!(normalize_with_key(malformed, Some("TEST_LICENSE_AES_KEY")).is_err());
    }
    let mut tampered = original;
    *tampered.last_mut().unwrap() ^= 1;
    assert!(normalize_with_key(&tampered, Some("TEST_LICENSE_AES_KEY")).is_err());
  }
}
