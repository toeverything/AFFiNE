use aes_gcm::{
  Aes256Gcm, Nonce,
  aead::{Aead, KeyInit, Payload},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hkdf::Hkdf;
use rand::RngCore;
use sha2::Sha256;
use zeroize::{Zeroize, Zeroizing};

use super::{RuntimeError, RuntimeResult};

const PREFIX: &str = "auth-successor:v1:";
const INFO: &[u8] = b"AFFiNE/Auth/RefreshSuccessor/v1";
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;

pub(super) struct SuccessorKey(Zeroizing<[u8; 32]>);

impl SuccessorKey {
  pub(super) fn derive(private_key: &[u8]) -> RuntimeResult<Self> {
    if private_key.is_empty() {
      return Err(RuntimeError::invalid_state(
        "auth successor encryption key is unavailable",
      ));
    }
    let mut key = Zeroizing::new([0_u8; 32]);
    Hkdf::<Sha256>::new(None, private_key)
      .expand(INFO, key.as_mut())
      .map_err(|_| RuntimeError::invalid_state("auth successor encryption key is unavailable"))?;
    Ok(Self(key))
  }

  pub(super) fn encrypt(&self, token: &str, source_id: &str, auth_session_id: &str) -> RuntimeResult<String> {
    let cipher = Aes256Gcm::new_from_slice(self.0.as_slice())
      .map_err(|_| RuntimeError::invalid_state("auth successor encryption key is unavailable"))?;
    let mut nonce = [0_u8; NONCE_LEN];
    rand::rng().fill_bytes(&mut nonce);
    let aad = aad(source_id, auth_session_id);
    let ciphertext = cipher
      .encrypt(
        Nonce::from_slice(&nonce),
        Payload {
          msg: token.as_bytes(),
          aad: &aad,
        },
      )
      .map_err(|_| RuntimeError::invalid_state("auth successor encryption failed"))?;
    let mut body = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    body.extend_from_slice(&nonce);
    body.extend_from_slice(&ciphertext);
    let encoded = URL_SAFE_NO_PAD.encode(&body);
    body.zeroize();
    Ok(format!("{PREFIX}{encoded}"))
  }

  pub(super) fn decrypt(&self, envelope: &str, source_id: &str, auth_session_id: &str) -> RuntimeResult<String> {
    let encoded = envelope
      .strip_prefix(PREFIX)
      .ok_or_else(|| RuntimeError::invalid_state("auth successor material is unavailable"))?;
    let mut body = URL_SAFE_NO_PAD
      .decode(encoded)
      .map_err(|_| RuntimeError::invalid_state("auth successor material is unavailable"))?;
    if body.len() < NONCE_LEN + TAG_LEN {
      body.zeroize();
      return Err(RuntimeError::invalid_state("auth successor material is unavailable"));
    }
    let (nonce, ciphertext) = body.split_at(NONCE_LEN);
    let aad = aad(source_id, auth_session_id);
    let cipher = Aes256Gcm::new_from_slice(self.0.as_slice())
      .map_err(|_| RuntimeError::invalid_state("auth successor encryption key is unavailable"))?;
    let decrypted = cipher
      .decrypt(
        Nonce::from_slice(nonce),
        Payload {
          msg: ciphertext,
          aad: &aad,
        },
      )
      .map_err(|_| RuntimeError::invalid_state("auth successor material is unavailable"));
    body.zeroize();
    String::from_utf8(decrypted?).map_err(|_| RuntimeError::invalid_state("auth successor material is unavailable"))
  }
}

fn aad(source_id: &str, auth_session_id: &str) -> Vec<u8> {
  ["auth-refresh-successor", source_id, auth_session_id]
    .join("\0")
    .into_bytes()
}
