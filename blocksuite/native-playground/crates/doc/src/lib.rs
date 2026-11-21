#![forbid(unsafe_code)]

pub mod awareness;
#[cfg(all(feature = "server", not(target_family = "wasm")))]
pub mod room;
pub mod schema;
pub mod session;
pub mod wire;

use thiserror::Error;

/// Maximum client ID representable exactly as a JavaScript IEEE-754 integer (`2^53 - 1`).
pub const MAX_JS_CLIENT_ID: u64 = 0x001F_FFFF_FFFF_FFFF;

/// Validate that a `client_id` is in the JavaScript-safe 53-bit range `1..=2^53-1`.
pub fn validate_client_id(client_id: u64) -> Result<u64, DocError> {
    if client_id == 0 || client_id > MAX_JS_CLIENT_ID {
        return Err(DocError::InvalidClientId(client_id));
    }
    Ok(client_id)
}

/// Deterministically derive a non-zero 53-bit client ID from an arbitrary seed.
///
/// Safe on both native and `wasm32-unknown-unknown` targets without relying on
/// platform randomness or wall-clock time.
pub fn client_id_from_seed(seed: u64) -> u64 {
    let mut z = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^= z >> 31;
    let masked = z & MAX_JS_CLIENT_ID;
    if masked == 0 { 1 } else { masked }
}

/// Generate a random non-zero 53-bit client ID on native platforms.
#[cfg(not(target_family = "wasm"))]
pub fn random_client_id() -> u64 {
    use rand::Rng;
    rand::rng().random_range(1..=MAX_JS_CLIENT_ID)
}

#[derive(Debug, Error)]
pub enum DocError {
    #[error("invalid 53-bit client id: {0} (must be in 1..=2^53-1)")]
    InvalidClientId(u64),
    #[error("crdt codec error: {0}")]
    Codec(#[from] y_octo::JwstCodecError),
    #[error("wire protocol error: {0}")]
    Wire(String),
    #[error("awareness error: {0}")]
    Awareness(String),
    #[error("block not found: {0}")]
    BlockNotFound(String),
    #[error("surface element not found: {0}")]
    ElementNotFound(String),
    #[error("page not found: {0}")]
    PageNotFound(String),
    #[error("invalid document state: {0}")]
    InvalidState(String),
    #[error("serialization error: {0}")]
    Json(#[from] serde_json::Error),
}

pub type DocResult<T = ()> = Result<T, DocError>;
