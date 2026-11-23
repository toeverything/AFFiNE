use std::{
  sync::Arc,
  time::{Duration, Instant},
};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use doc_extractor::Doc;
use sha2::{Digest, Sha256};
use tokio::{sync::watch, task::JoinHandle};
use uuid::Uuid;

use super::{
  ChunkLocator, EmbeddingFailure, EmbeddingService, IndexProbeClaim, MaterializedChunk, ProjectionClaim, RuntimeError,
  RuntimeResult, extraction_file_name, failure_class, release_index_probe, release_projection,
};
use crate::runtime::object_storage::types::{ObjectKey, ObjectLocator, StorageScope};

const MAX_INPUT_BYTES: usize = 50 * 1024 * 1024;
const MAX_TEXT_BYTES: usize = 64 * 1024 * 1024;
const MAX_TOKENS: usize = 1_000_000;
const MAX_CHUNKS: usize = 2048;

// Split depth backstop: planned batches are within budget with ~4x total
// headroom, so realistic estimate misses need at most 2 levels.
const MAX_EMBED_SPLITS: u8 = 2;

pub(super) struct WorkerHandle {
  stop: watch::Sender<bool>,
  task: JoinHandle<()>,
}

impl WorkerHandle {
  pub(super) async fn stop(self) {
    let _ = self.stop.send(true);
    let _ = self.task.await;
  }
}

pub(super) fn start(service: Arc<EmbeddingService>) -> WorkerHandle {
  let (stop, mut stopping) = watch::channel(false);
  let owner = format!("{}:{}", std::process::id(), Uuid::new_v4());
  let task = tokio::spawn(async move {
    let mut next_gc = Instant::now();
    let mut probe = None;
    let mut claim = None;
    loop {
      tokio::select! {
        biased;
        _ = stopping.changed() => break,
        result = async {
          tokio::select! {
            _ = service.wake.notified() => {}
            _ = tokio::time::sleep(Duration::from_secs(2)) => {}
          }
          process_next(&service, &owner, &mut next_gc, &mut probe, &mut claim).await
        } => {
          probe = None;
          claim = None;
          if let Err(error) = result {
            eprintln!("embedding worker failed: {error}");
          }
        }
      }
    }
    let released = tokio::time::timeout(Duration::from_secs(1), async {
      if let Some(probe) = probe {
        release_index_probe(&service.pool, &probe).await?;
      }
      if let Some(claim) = claim {
        release_projection(&service.pool, &claim).await?;
      }
      Ok::<_, RuntimeError>(())
    })
    .await;
    match released {
      Ok(Ok(())) => {}
      Ok(Err(error)) => eprintln!("release embedding claim on shutdown failed: {error}"),
      Err(_) => eprintln!("release embedding claim on shutdown timed out"),
    }
  });
  WorkerHandle { stop, task }
}

async fn process_next(
  service: &EmbeddingService,
  owner: &str,
  next_gc: &mut Instant,
  active_probe: &mut Option<IndexProbeClaim>,
  active_claim: &mut Option<ProjectionClaim>,
) -> RuntimeResult<()> {
  *active_probe = service.claim_probe(owner).await?;
  if let Some(probe) = active_probe.as_ref() {
    return match service
      .provider
      .embed(
        &probe.workspace_id,
        &probe.fingerprint,
        vec!["health".to_string()],
        "RETRIEVAL_DOCUMENT",
      )
      .await
    {
      Ok(vectors) if vectors.len() == 1 => service.complete_probe(probe).await,
      _ => service.fail_probe(probe, "provider_unavailable").await,
    };
  }
  *active_claim = service.claim(owner).await?;
  let Some(claim) = active_claim.as_ref() else {
    if Instant::now() >= *next_gc {
      *next_gc = Instant::now() + Duration::from_secs(300);
      let result = service.gc().await?;
      if result.indexes > 0 || result.chunks > 0 {
        eprintln!(
          "embedding garbage collection removed {} indexes and {} chunks",
          result.indexes, result.chunks
        );
      }
    }
    return Ok(());
  };
  match materialize(service, claim).await {
    Ok(chunks) => match service.commit(claim, &chunks).await {
      Ok(_) => Ok(()),
      Err(error) => {
        service
          .fail(claim, failure("commit_failed", Some(error.to_string())))
          .await
      }
    },
    Err(failure) => service.fail(claim, failure).await,
  }
}

async fn materialize(
  service: &EmbeddingService,
  claim: &ProjectionClaim,
) -> Result<Vec<MaterializedChunk>, EmbeddingFailure> {
  if claim.lease_until <= chrono::Utc::now() {
    return Err(failure("lease_expired", None));
  }
  let (contents, locators) = if claim.source_kind == "document" {
    let projection: crate::runtime::types::DocumentEmbeddingProjectionInput = serde_json::from_str(
      claim
        .document_projection
        .as_deref()
        .ok_or_else(|| failure("document_projection_missing", None))?,
    )
    .map_err(|_| failure("document_projection_invalid", None))?;
    if let Some(reason) = projection.skip_reason {
      return Err(failure("document_projection_skipped", Some(reason)));
    }
    let mut contents = Vec::with_capacity(projection.units.len());
    let mut locators = Vec::with_capacity(projection.units.len());
    for unit in projection.units {
      let content = crate::utils::clean_content(&unit.text);
      if content.trim().is_empty() {
        continue;
      }
      contents.push(content);
      locators.push(ChunkLocator::Document {
        doc_id: projection.doc_id.clone(),
        unit_id: unit.unit_id,
        visibility: unit.visibility,
        block_id: unit.block_id,
        element_id: unit.element_id,
        frame_id: unit.frame_id,
      });
    }
    (contents, locators)
  } else {
    let scope = claim
      .storage_scope
      .as_deref()
      .ok_or_else(|| failure("invalid_locator", None))?;
    let key = claim
      .storage_key
      .as_deref()
      .ok_or_else(|| failure("invalid_locator", None))?;
    let locator = ObjectLocator::new(
      StorageScope::parse(scope).map_err(|_| failure("invalid_locator", None))?,
      ObjectKey::new(key).map_err(|_| failure("invalid_locator", None))?,
    );
    let storage = service
      .object_storage()
      .map_err(|_| failure("storage_unavailable", None))?;
    let object = storage
      .get_limited(&locator, MAX_INPUT_BYTES)
      .await
      .map_err(|error| match error {
        RuntimeError::InvalidInput(message) if message == "resource_exceeded" => failure("resource_exceeded", None),
        _ => failure("storage_unavailable", None),
      })?
      .ok_or_else(|| failure("object_not_found", None))?;
    let revision = URL_SAFE_NO_PAD.encode(Sha256::digest(&object.body));
    if revision != claim.content_revision {
      return Err(failure("object_changed", None));
    }
    let file_name = claim
      .file_name
      .clone()
      .or_else(|| claim.mime_type.as_deref().map(extraction_file_name))
      .unwrap_or_else(|| claim.source_key.clone());
    let body = object.body;
    let parsed = tokio::time::timeout(
      Duration::from_secs(120),
      tokio::task::spawn_blocking(move || Doc::new(&file_name, &body)),
    )
    .await
    .map_err(|_| failure("resource_exceeded", None))?
    .map_err(|_| failure("extract_failed", None))?
    .map_err(|_| failure("unsupported_format", None))?;
    let contents = parsed
      .chunks
      .into_iter()
      .map(|chunk| crate::utils::clean_content(&chunk.content))
      .filter(|content| !content.trim().is_empty())
      .collect::<Vec<_>>();
    let locators = contents
      .iter()
      .map(|_| {
        uuid::Uuid::parse_str(&claim.source_key)
          .map(|artifact_id| ChunkLocator::Artifact { artifact_id })
          .map_err(|_| failure("invalid_locator", None))
      })
      .collect::<Result<Vec<_>, _>>()?;
    (contents, locators)
  };
  let bytes = contents.iter().map(String::len).sum::<usize>();
  if contents.is_empty() {
    return Err(failure("empty_content", None));
  }
  if contents.len() > MAX_CHUNKS || bytes > MAX_TEXT_BYTES || bytes / 4 > MAX_TOKENS {
    return Err(failure("resource_exceeded", None));
  }
  let mut vectors = Vec::with_capacity(contents.len());
  let max_items = service.embedding.max_batch_items;
  let token_budget = service.embedding.max_batch_tokens;
  for range in plan_batches(&contents, max_items, token_budget) {
    let batch = &contents[range];
    let mut output = embed_batch(service, claim, batch, token_budget, MAX_EMBED_SPLITS).await?;
    if output.len() != batch.len() {
      return Err(failure("invalid_embedding_count", None));
    }
    vectors.append(&mut output);
  }
  contents
    .into_iter()
    .zip(vectors)
    .zip(locators)
    .enumerate()
    .map(|(index, ((content, embedding), locator))| {
      Ok(MaterializedChunk {
        index: index as i32,
        content,
        embedding,
        locator,
      })
    })
    .collect()
}

/// Estimated bytes per token (OpenAI's ~4 chars/token rule of thumb for English
/// BPE text). Coarse for CJK, where it underestimates; overruns surface as
/// provider size errors and split-retry.
const ESTIMATED_BYTES_PER_TOKEN: usize = 4;

fn estimate_tokens(content: &str) -> usize {
  content.len() / ESTIMATED_BYTES_PER_TOKEN
}

fn plan_batches(contents: &[String], max_items: usize, token_budget: usize) -> Vec<std::ops::Range<usize>> {
  let mut batches = Vec::new();
  let mut start = 0;
  let mut tokens = 0;
  for (index, content) in contents.iter().enumerate() {
    let cost = estimate_tokens(content).max(1);
    if index > start && (index - start >= max_items || tokens + cost > token_budget) {
      batches.push(start..index);
      start = index;
      tokens = 0;
    }
    tokens += cost;
  }
  if start < contents.len() {
    batches.push(start..contents.len());
  }
  batches
}

fn is_size_status(status: Option<u16>) -> bool {
  matches!(status, Some(400 | 413 | 422))
}

fn classify_embed_error(batch: &[String], error: &RuntimeError, token_budget: usize) -> EmbeddingFailure {
  // A provider that answers with wrong-shaped vectors can never satisfy this
  // space: fail loud instead of retrying the same request forever.
  if matches!(error, RuntimeError::InvalidState(message) if message == "invalid_embedding_vector") {
    return failure("invalid_embedding_vector", Some(error.to_string()));
  }
  let status = error.provider_status();
  if matches!(batch, [_]) && is_size_status(status) {
    // A lone input the provider refuses as too big can never succeed.
    let detail = if estimate_tokens(&batch[0]) > token_budget {
      format!("{} estimated tokens", estimate_tokens(&batch[0]))
    } else {
      error.to_string()
    };
    return failure("input_too_large", Some(detail));
  }
  if matches!(status, Some(401 | 403)) {
    return failure("provider_unauthorized", Some(error.to_string()));
  }
  if status == Some(404) {
    return failure("provider_model_not_found", Some(error.to_string()));
  }
  if status == Some(429) {
    return failure("provider_rate_limited", Some(error.to_string()));
  }
  failure("provider_unavailable", Some(error.to_string()))
}

async fn embed_batch(
  service: &EmbeddingService,
  claim: &ProjectionClaim,
  batch: &[String],
  token_budget: usize,
  splits_remaining: u8,
) -> Result<Vec<Vec<f32>>, EmbeddingFailure> {
  debug_assert!(!batch.is_empty());
  match service
    .provider
    .embed(
      &claim.workspace_id,
      &claim.index_fingerprint,
      batch.to_vec(),
      "RETRIEVAL_DOCUMENT",
    )
    .await
  {
    Ok(output) => Ok(output),
    Err(error) if batch.len() > 1 && splits_remaining > 0 && is_size_status(error.provider_status()) => {
      // Binary split: retry each half with the remaining split budget.
      let mid = batch.len() / 2;
      let mut head = Box::pin(embed_batch(
        service,
        claim,
        &batch[..mid],
        token_budget,
        splits_remaining - 1,
      ))
      .await?;
      let mut tail = Box::pin(embed_batch(
        service,
        claim,
        &batch[mid..],
        token_budget,
        splits_remaining - 1,
      ))
      .await?;
      head.append(&mut tail);
      Ok(head)
    }
    Err(error) if batch.len() > 1 && splits_remaining == 0 && is_size_status(error.provider_status()) => {
      // Split budget spent and the provider still refuses on size: this batch
      // can never succeed, fail it instead of retrying it forever.
      Err(failure("input_too_large", Some(error.to_string())))
    }
    Err(error) => Err(classify_embed_error(batch, &error, token_budget)),
  }
}

fn failure(code: &'static str, detail: Option<String>) -> EmbeddingFailure {
  EmbeddingFailure {
    code,
    detail,
    class: failure_class(code),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::runtime::EmbeddingRuntimeConfig;

  fn plan_default(contents: &[String]) -> Vec<std::ops::Range<usize>> {
    let defaults = EmbeddingRuntimeConfig::default();
    plan_batches(contents, defaults.max_batch_items, defaults.max_batch_tokens)
  }

  #[test]
  fn batches_nothing_when_empty() {
    assert!(plan_default(&[]).is_empty());
  }

  #[test]
  fn batches_small_inputs_together() {
    let contents = vec!["a".to_string(), "b".to_string(), "c".to_string()];
    assert_eq!(plan_default(&contents), vec![0..3]);
  }

  #[test]
  fn batches_respect_count_cap() {
    let max_items = EmbeddingRuntimeConfig::default().max_batch_items;
    let contents = vec!["x".to_string(); max_items + 1];
    assert_eq!(plan_default(&contents), vec![0..max_items, max_items..max_items + 1]);
  }

  #[test]
  fn batches_respect_token_budget() {
    // 4000 bytes ~= 1000 estimated tokens; two no longer fit into 1024.
    let contents = vec!["y".repeat(4000); 3];
    assert_eq!(plan_default(&contents), vec![0..1, 1..2, 2..3]);
  }

  #[test]
  fn batches_pack_greedily_within_budget() {
    // 1000 bytes ~= 250 estimated tokens; four fit into 1024, five do not.
    let contents = vec!["z".repeat(1000); 5];
    assert_eq!(plan_default(&contents), vec![0..4, 4..5]);
  }

  #[test]
  fn batches_keep_single_over_budget_input_alone() {
    let contents = vec!["w".repeat(EmbeddingRuntimeConfig::default().max_batch_tokens * 4 + 5)];
    assert_eq!(plan_default(&contents), vec![0..1]);
  }

  fn status_error(status: Option<u16>) -> RuntimeError {
    RuntimeError::provider_failure(status, "upstream error".to_string())
  }

  #[test]
  fn split_policy_follows_status() {
    assert!(is_size_status(Some(400)));
    assert!(is_size_status(Some(413)));
    assert!(is_size_status(Some(422)));
    assert!(!is_size_status(Some(500)));
    assert!(!is_size_status(Some(429)));
    assert!(!is_size_status(Some(503)));
    assert!(!is_size_status(None));
  }

  #[test]
  fn classify_marks_size_refused_singles_terminal() {
    let single = vec!["x".to_string()];
    assert_eq!(
      classify_embed_error(
        &single,
        &status_error(Some(400)),
        EmbeddingRuntimeConfig::default().max_batch_tokens
      )
      .code,
      "input_too_large"
    );
  }

  #[test]
  fn classify_marks_bad_vectors_terminal() {
    let batch = vec!["x".to_string(), "y".to_string()];
    assert_eq!(
      classify_embed_error(
        &batch,
        &RuntimeError::invalid_state("invalid_embedding_vector"),
        EmbeddingRuntimeConfig::default().max_batch_tokens
      )
      .code,
      "invalid_embedding_vector"
    );
  }

  #[test]
  fn classify_keeps_ambiguous_singles_retryable() {
    let single = vec!["x".to_string()];
    assert_eq!(
      classify_embed_error(
        &single,
        &status_error(Some(500)),
        EmbeddingRuntimeConfig::default().max_batch_tokens
      )
      .code,
      "provider_unavailable"
    );
  }

  #[test]
  fn classify_maps_auth_failure() {
    let batch = vec!["x".to_string(), "y".to_string()];
    for status in [Some(401), Some(403)] {
      assert_eq!(
        classify_embed_error(
          &batch,
          &status_error(status),
          EmbeddingRuntimeConfig::default().max_batch_tokens
        )
        .code,
        "provider_unauthorized"
      );
    }
  }

  #[test]
  fn classify_maps_model_not_found() {
    let batch = vec!["x".to_string(), "y".to_string()];
    assert_eq!(
      classify_embed_error(
        &batch,
        &status_error(Some(404)),
        EmbeddingRuntimeConfig::default().max_batch_tokens
      )
      .code,
      "provider_model_not_found"
    );
  }

  #[test]
  fn classify_maps_rate_limit() {
    let batch = vec!["x".to_string(), "y".to_string()];
    assert_eq!(
      classify_embed_error(
        &batch,
        &status_error(Some(429)),
        EmbeddingRuntimeConfig::default().max_batch_tokens
      )
      .code,
      "provider_rate_limited"
    );
  }

  #[test]
  fn classify_keeps_outage_retryable() {
    let batch = vec!["x".to_string(), "y".to_string()];
    assert_eq!(
      classify_embed_error(
        &batch,
        &status_error(None),
        EmbeddingRuntimeConfig::default().max_batch_tokens
      )
      .code,
      "provider_unavailable"
    );
  }

  #[test]
  fn classify_over_budget_single_without_size_signal_stays_retryable() {
    let single = vec!["w".repeat(EmbeddingRuntimeConfig::default().max_batch_tokens * 4 + 5)];
    assert_eq!(
      classify_embed_error(
        &single,
        &status_error(None),
        EmbeddingRuntimeConfig::default().max_batch_tokens
      )
      .code,
      "provider_unavailable"
    );
  }

  #[test]
  fn classify_terminal_detail_reports_estimate_when_over_budget() {
    let single = vec!["w".repeat(EmbeddingRuntimeConfig::default().max_batch_tokens * 4 + 5)];
    let failure = classify_embed_error(
      &single,
      &status_error(Some(400)),
      EmbeddingRuntimeConfig::default().max_batch_tokens,
    );
    assert_eq!(failure.code, "input_too_large");
    assert_eq!(failure.detail.as_deref(), Some("1025 estimated tokens"));
  }

  #[test]
  fn batches_honor_custom_token_budget() {
    let contents = vec!["y".repeat(4000); 2];
    assert_eq!(plan_batches(&contents, 128, 2500), vec![0..2]);
    assert_eq!(plan_batches(&contents, 128, 1500), vec![0..1, 1..2]);
  }

  #[test]
  fn batches_honor_custom_item_cap() {
    let contents = vec!["a".to_string(), "b".to_string(), "c".to_string()];
    assert_eq!(plan_batches(&contents, 2, 1024), vec![0..2, 2..3]);
  }
}
