//! Cross-version AES-256-GCM encryption for calendar account credentials.
//!
//! Matches `v0.27.5` `CryptoHelper.encrypt` / `CryptoHelper.decrypt`:
//! key is `SHA-256(private_key)`, nonce is 12 random bytes, authentication tag
//! is 12 bytes (`AesGcm<Aes256, U12, U12>`), and wire format is
//! `Base64(12B IV || 12B auth_tag || ciphertext)`.
use aes_gcm::aead::consts::U12;
use aes_gcm::aead::{AeadInPlace, KeyInit};
use aes_gcm::aes::Aes256;
use aes_gcm::{AesGcm, Nonce, Tag};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use rand::RngCore as _;
use server_types::DomainError;
use sha2::{Digest, Sha256};
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 12;
type Aes256Gcm12 = AesGcm<Aes256, U12, U12>;
fn derive_key(private_key: &str) -> [u8; 32] {
  Sha256::digest(private_key.as_bytes()).into()
}
/// Encrypts `plaintext` into `Base64(12B IV || 12B tag || ciphertext)` using
/// `SHA-256(private_key)` as the AES-256-GCM key.
pub fn encrypt_token(private_key: &str, plaintext: &str) -> Result<String, DomainError> {
  if private_key.is_empty() {
    return Err(DomainError::Validation(
      "calendar encryption private key must not be empty".to_owned(),
    ));
  }
  let key = derive_key(private_key);
  let cipher = Aes256Gcm12::new_from_slice(&key)
    .map_err(|err| DomainError::Internal(format!("calendar token cipher init failed: {err}")))?;
  let mut iv = [0u8; NONCE_LEN];
  rand::rng().fill_bytes(&mut iv);
  let nonce = Nonce::from(iv);
  let mut buffer = plaintext.as_bytes().to_vec();
  let tag = cipher
    .encrypt_in_place_detached(&nonce, b"", &mut buffer)
    .map_err(|err| DomainError::Internal(format!("calendar token encrypt failed: {err}")))?;
  let mut out = Vec::with_capacity(NONCE_LEN + TAG_LEN + buffer.len());
  out.extend_from_slice(&iv);
  out.extend_from_slice(&tag[..]);
  out.extend_from_slice(&buffer);
  Ok(BASE64_STANDARD.encode(out))
}
/// Decrypts a `Base64(12B IV || 12B tag || ciphertext)` token produced by
/// [`encrypt_token`] or `v0.27.5` `CryptoHelper.encrypt`.
pub fn decrypt_token(private_key: &str, encoded: &str) -> Result<String, DomainError> {
  if private_key.is_empty() {
    return Err(DomainError::Validation(
      "calendar encryption private key must not be empty".to_owned(),
    ));
  }
  let raw = BASE64_STANDARD
    .decode(encoded)
    .map_err(|err| DomainError::Validation(format!("invalid calendar token base64: {err}")))?;
  if raw.len() < NONCE_LEN + TAG_LEN {
    return Err(DomainError::Validation(
      "calendar token payload is shorter than 24 bytes".to_owned(),
    ));
  }
  let (iv, rest) = raw.split_at(NONCE_LEN);
  let (tag_bytes, ciphertext) = rest.split_at(TAG_LEN);
  let iv_arr: [u8; NONCE_LEN] = iv
    .try_into()
    .map_err(|_| DomainError::Validation("invalid calendar token IV length".to_owned()))?;
  let tag_arr: [u8; TAG_LEN] = tag_bytes
    .try_into()
    .map_err(|_| DomainError::Validation("invalid calendar token tag length".to_owned()))?;
  let key = derive_key(private_key);
  let cipher = Aes256Gcm12::new_from_slice(&key)
    .map_err(|err| DomainError::Internal(format!("calendar token cipher init failed: {err}")))?;
  let mut buffer = ciphertext.to_vec();
  let nonce = Nonce::from(iv_arr);
  let tag: Tag<U12> = Tag::from(tag_arr);
  cipher
    .decrypt_in_place_detached(&nonce, b"", &mut buffer, &tag)
    .map_err(|_| DomainError::Validation("calendar token authentication failed".to_owned()))?;
  String::from_utf8(buffer)
    .map_err(|err| DomainError::Validation(format!("calendar token plaintext is not valid UTF-8: {err}")))
}
