//! Embedding configuration: storage-space dimensions and worker batch caps.
//!
//! `dimensions` defines the storage space (the vector width of the embedding
//! tables) — it is a storage option, not a model option: whichever model the
//! router selects must serve exactly this width. The batch caps are worker
//! policy for provider requests.
//!
//! Values resolve per field as environment override, then config file, then
//! compiled defaults. Invalid values are hard errors, never silent fallbacks.

use serde::Deserialize;

use super::{RuntimeError, RuntimeResult};
use crate::runtime::embedding_storage::MAX_EMBEDDING_DIMENSIONS;

pub(crate) const DIMENSIONS_ENV_VAR: &str = "AFFINE_EMBEDDING_SPACE_DIMENSIONS";
pub(crate) const BATCH_TOKENS_ENV_VAR: &str = "AFFINE_EMBEDDING_WORKER_MAX_BATCH_TOKENS";
pub(crate) const BATCH_ITEMS_ENV_VAR: &str = "AFFINE_EMBEDDING_WORKER_MAX_BATCH_ITEMS";

const DEFAULT_DIMENSIONS: u32 = 1024;
const DEFAULT_MAX_BATCH_TOKENS: u32 = 1024;
const DEFAULT_MAX_BATCH_ITEMS: u32 = 128;

#[derive(Clone)]
pub(crate) struct EmbeddingRuntimeConfig {
  /// Storage-space dimensions (vector width of the embedding tables).
  pub(crate) dimensions: u32,
  /// Worker batch policy: caps per provider request.
  pub(crate) max_batch_tokens: usize,
  pub(crate) max_batch_items: usize,
}

impl Default for EmbeddingRuntimeConfig {
  fn default() -> Self {
    Self {
      dimensions: DEFAULT_DIMENSIONS,
      max_batch_tokens: DEFAULT_MAX_BATCH_TOKENS as usize,
      max_batch_items: DEFAULT_MAX_BATCH_ITEMS as usize,
    }
  }
}

#[derive(Default, Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct EmbeddingConfigFile {
  dimensions: Option<u32>,
  max_batch_tokens: Option<u32>,
  max_batch_items: Option<u32>,
}

fn parse_bounded_u32(raw: &str, min: u32, max: u32) -> Option<u32> {
  raw
    .trim()
    .parse::<u32>()
    .ok()
    .filter(|value| (min..=max).contains(value))
}

fn resolve_field(var: &str, file: Option<u32>, default: u32, min: u32, max: u32, key: &str) -> RuntimeResult<u32> {
  if let Ok(raw) = std::env::var(var) {
    return parse_bounded_u32(&raw, min, max)
      .ok_or_else(|| RuntimeError::config(format!("invalid {var}={raw:?}: expected an integer {min}..={max}")));
  }
  if let Some(value) = file {
    if (min..=max).contains(&value) {
      return Ok(value);
    }
    return Err(RuntimeError::config(format!(
      "invalid {key}: expected an integer {min}..={max}"
    )));
  }
  Ok(default)
}

impl EmbeddingRuntimeConfig {
  pub(crate) fn from_sources(file: Option<EmbeddingConfigFile>) -> RuntimeResult<Self> {
    let file = file.unwrap_or_default();
    Ok(Self {
      dimensions: resolve_field(
        DIMENSIONS_ENV_VAR,
        file.dimensions,
        DEFAULT_DIMENSIONS,
        1,
        MAX_EMBEDDING_DIMENSIONS,
        "embedding.dimensions",
      )?,
      max_batch_tokens: resolve_field(
        BATCH_TOKENS_ENV_VAR,
        file.max_batch_tokens,
        DEFAULT_MAX_BATCH_TOKENS,
        1,
        u32::MAX,
        "embedding.maxBatchTokens",
      )? as usize,
      max_batch_items: resolve_field(
        BATCH_ITEMS_ENV_VAR,
        file.max_batch_items,
        DEFAULT_MAX_BATCH_ITEMS,
        1,
        u32::MAX,
        "embedding.maxBatchItems",
      )? as usize,
    })
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parse_bounded_accepts_range_only() {
    assert_eq!(parse_bounded_u32("1024", 1, 4000), Some(1024));
    assert_eq!(parse_bounded_u32(" 2560 ", 1, 4000), Some(2560));
    assert_eq!(parse_bounded_u32("1", 1, 4000), Some(1));
    assert_eq!(parse_bounded_u32("4000", 1, 4000), Some(4000));
    assert_eq!(parse_bounded_u32("", 1, 4000), None);
    assert_eq!(parse_bounded_u32("lots", 1, 4000), None);
    assert_eq!(parse_bounded_u32("0", 1, 4000), None);
    assert_eq!(parse_bounded_u32("4001", 1, 4000), None);
    assert_eq!(parse_bounded_u32("-5", 1, 4000), None);
  }

  // Assumes AFFINE_EMBEDDING_* unset (nothing in tests sets process env).
  #[test]
  fn file_values_resolve_with_defaults_for_missing() {
    let file = EmbeddingConfigFile {
      dimensions: Some(2560),
      max_batch_tokens: None,
      max_batch_items: Some(64),
    };
    let config = EmbeddingRuntimeConfig::from_sources(Some(file)).unwrap();
    assert_eq!(config.dimensions, 2560);
    assert_eq!(config.max_batch_tokens, 1024);
    assert_eq!(config.max_batch_items, 64);
  }

  #[test]
  fn file_out_of_range_is_rejected() {
    for dimensions in [0, 4001] {
      let file = EmbeddingConfigFile {
        dimensions: Some(dimensions),
        max_batch_tokens: None,
        max_batch_items: None,
      };
      assert!(EmbeddingRuntimeConfig::from_sources(Some(file)).is_err());
    }
  }
}
