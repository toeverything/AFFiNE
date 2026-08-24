use aes_gcm::{
  Aes256Gcm, Nonce,
  aead::{Aead, KeyInit, Payload},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hkdf::Hkdf;
use rand::RngCore;
use sha2::Sha256;
use thiserror::Error;
use zeroize::{Zeroize, Zeroizing};

const PREFIX: &str = "byok:v1:";
const INFO: &[u8] = b"AFFiNE/Copilot/BYOK/v1";
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;

pub(crate) struct CredentialEnvelopeKey(Zeroizing<[u8; 32]>);
pub(crate) struct SensitiveCredential(Zeroizing<Vec<u8>>);

impl SensitiveCredential {
  pub(crate) fn new(value: impl Into<Vec<u8>>) -> Self {
    Self(Zeroizing::new(value.into()))
  }

  pub(crate) fn expose(&self) -> &[u8] {
    self.0.as_slice()
  }
}

#[derive(Debug, Error)]
pub(crate) enum CredentialEnvelopeError {
  #[error("credential_unavailable")]
  Unavailable,
}

impl CredentialEnvelopeKey {
  pub(crate) fn derive(root_secret: &[u8]) -> Result<Self, CredentialEnvelopeError> {
    if root_secret.is_empty() {
      return Err(CredentialEnvelopeError::Unavailable);
    }
    let mut key = Zeroizing::new([0_u8; 32]);
    Hkdf::<Sha256>::new(None, root_secret)
      .expand(INFO, key.as_mut())
      .map_err(|_| CredentialEnvelopeError::Unavailable)?;
    Ok(Self(key))
  }

  pub(crate) fn encrypt(
    &self,
    credential: &SensitiveCredential,
    aad: &[u8],
  ) -> Result<String, CredentialEnvelopeError> {
    let cipher = Aes256Gcm::new_from_slice(self.0.as_slice()).map_err(|_| CredentialEnvelopeError::Unavailable)?;
    let mut nonce = [0_u8; NONCE_LEN];
    rand::rng().fill_bytes(&mut nonce);
    let ciphertext = cipher
      .encrypt(
        Nonce::from_slice(&nonce),
        Payload {
          msg: credential.expose(),
          aad,
        },
      )
      .map_err(|_| CredentialEnvelopeError::Unavailable)?;
    let mut body = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    body.extend_from_slice(&nonce);
    body.extend_from_slice(&ciphertext);
    let encoded = URL_SAFE_NO_PAD.encode(&body);
    body.zeroize();
    Ok(format!("{PREFIX}{encoded}"))
  }

  pub(crate) fn decrypt(&self, envelope: &str, aad: &[u8]) -> Result<SensitiveCredential, CredentialEnvelopeError> {
    let encoded = envelope
      .strip_prefix(PREFIX)
      .ok_or(CredentialEnvelopeError::Unavailable)?;
    let mut body = URL_SAFE_NO_PAD
      .decode(encoded)
      .map_err(|_| CredentialEnvelopeError::Unavailable)?;
    if body.len() < NONCE_LEN + TAG_LEN {
      body.zeroize();
      return Err(CredentialEnvelopeError::Unavailable);
    }
    let (nonce, ciphertext) = body.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new_from_slice(self.0.as_slice()).map_err(|_| CredentialEnvelopeError::Unavailable)?;
    let result = cipher
      .decrypt(Nonce::from_slice(nonce), Payload { msg: ciphertext, aad })
      .map(SensitiveCredential::new)
      .map_err(|_| CredentialEnvelopeError::Unavailable);
    body.zeroize();
    result
  }
}

pub(crate) fn server_aad(workspace_id: &str, profile_id: &str, provider: &str, endpoint_identity: &str) -> Vec<u8> {
  ["server", workspace_id, profile_id, provider, endpoint_identity]
    .join("\0")
    .into_bytes()
}

pub(crate) fn local_aad(
  workspace_id: &str,
  user_id: &str,
  lease_id: &str,
  index: usize,
  provider: &str,
  endpoint_identity: &str,
) -> Vec<u8> {
  [
    "local".to_string(),
    workspace_id.to_string(),
    user_id.to_string(),
    lease_id.to_string(),
    index.to_string(),
    provider.to_string(),
    endpoint_identity.to_string(),
  ]
  .join("\0")
  .into_bytes()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn round_trips_with_random_nonce_and_rejects_tampering() {
    let key = CredentialEnvelopeKey::derive(b"stable-root").unwrap();
    let credential = SensitiveCredential::new(b"secret".to_vec());
    let aad = server_aad("workspace", "profile", "openai", "default");
    let first = key.encrypt(&credential, &aad).unwrap();
    let second = key.encrypt(&credential, &aad).unwrap();
    assert_ne!(first, second);
    assert_eq!(key.decrypt(&first, &aad).unwrap().expose(), b"secret");

    let mut tampered = first.into_bytes();
    let last = tampered.len() - 1;
    tampered[last] = if tampered[last] == b'A' { b'B' } else { b'A' };
    assert!(key.decrypt(std::str::from_utf8(&tampered).unwrap(), &aad).is_err());
  }

  #[test]
  fn rejects_wrong_context_key_version_and_legacy_ciphertext() {
    let key = CredentialEnvelopeKey::derive(b"stable-root").unwrap();
    let credential = SensitiveCredential::new(b"secret".to_vec());
    let aad = server_aad("workspace", "profile", "openai", "default");
    let encrypted = key.encrypt(&credential, &aad).unwrap();
    assert!(
      key
        .decrypt(&encrypted, &server_aad("other", "profile", "openai", "default"))
        .is_err()
    );
    assert!(
      CredentialEnvelopeKey::derive(b"other")
        .unwrap()
        .decrypt(&encrypted, &aad)
        .is_err()
    );
    assert!(
      key
        .decrypt(&encrypted.replacen("byok:v1:", "byok:v2:", 1), &aad)
        .is_err()
    );
    assert!(key.decrypt("bGVnYWN5", &aad).is_err());
  }

  #[test]
  fn requires_stable_root_secret() {
    assert!(CredentialEnvelopeKey::derive(b"").is_err());
  }
}
