//! Argon2id password hashing and verification compatible 1:1 with AFFiNE
//! `v0.27.5` (`$argon2id$v=19$m=19456,t=2,p=1$...`).

use argon2::{
  Algorithm, Argon2, Params, Version,
  password_hash::{PasswordHash, PasswordHasher as _, PasswordVerifier as _, SaltString},
};
use rand::RngCore as _;
use server_types::DomainError;

pub const ARGON2_M_COST_KIB: u32 = 19_456;
pub const ARGON2_T_COST: u32 = 2;
pub const ARGON2_P_COST: u32 = 1;

fn canonical_argon2() -> Argon2<'static> {
  let params =
    Params::new(ARGON2_M_COST_KIB, ARGON2_T_COST, ARGON2_P_COST, None).expect("static Argon2id parameters are valid");
  Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

/// Validates password length bounds (default `8..=32` in `v0.27.5`).
pub fn validate_password_requirements(password: &str, min_len: usize, max_len: usize) -> Result<(), DomainError> {
  let len = password.chars().count();
  if len < min_len || len > max_len {
    return Err(DomainError::Validation(format!(
      "password length must be between {min_len} and {max_len} characters"
    )));
  }
  Ok(())
}

/// Hashes `password` using Argon2id (`v=19, m=19456, t=2, p=1`) with a fresh
/// 16-byte random salt, producing a PHC string 100% compatible with `v0.27.5`.
pub fn hash_password(password: &str) -> Result<String, DomainError> {
  let mut salt_bytes = [0_u8; 16];
  rand::rng().fill_bytes(&mut salt_bytes);
  let salt =
    SaltString::encode_b64(&salt_bytes).map_err(|e| DomainError::Internal(format!("encode password salt: {e}")))?;
  let hash = canonical_argon2()
    .hash_password(password.as_bytes(), &salt)
    .map_err(|e| DomainError::Internal(format!("hash password: {e}")))?;
  Ok(hash.to_string())
}

/// Verifies `password` against a stored PHC hash string (Argon2id / Argon2i / Argon2d).
pub fn verify_password(password: &str, phc_hash: &str) -> Result<bool, DomainError> {
  let Ok(parsed) = PasswordHash::new(phc_hash) else {
    return Ok(false);
  };
  Ok(Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn argon2id_hash_matches_v0275_phc_format_and_verifies() {
    let hashed = hash_password("ParityPass123!").expect("hash password");
    assert!(
      hashed.starts_with("$argon2id$v=19$m=19456,t=2,p=1$"),
      "unexpected PHC prefix: {hashed}"
    );
    assert!(verify_password("ParityPass123!", &hashed).unwrap());
    assert!(!verify_password("wrong-password", &hashed).unwrap());
    assert!(!verify_password("ParityPass123!", "not-a-phc-string").unwrap());
  }

  #[test]
  fn verifies_recorded_v0275_argon2id_phc_string_format() {
    // Recorded hash from tools/parity-harness/tests/fixtures/v0275-self-parity.recorded.json
    let recorded = "$argon2id$v=19$m=19456,t=2,p=1$O9YmZEY+DHhng/qUDWGAUw$WPDx0WAJx2PD9zWuih1t5BQaj6rmsE/fRc9czmb3cJM";
    let parsed = PasswordHash::new(recorded).expect("v0.27.5 PHC hash must parse");
    assert_eq!(parsed.algorithm.as_str(), "argon2id");
    assert!(!verify_password("definitely-not-matching", recorded).unwrap());
  }
}
