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
const PROVIDER_BATCH: usize = 128;

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
  for batch in contents.chunks(PROVIDER_BATCH) {
    let mut output = service
      .provider
      .embed(
        &claim.workspace_id,
        &claim.index_fingerprint,
        batch.to_vec(),
        "RETRIEVAL_DOCUMENT",
      )
      .await
      .map_err(|_| failure("provider_unavailable", None))?;
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

fn failure(code: &'static str, detail: Option<String>) -> EmbeddingFailure {
  EmbeddingFailure {
    code,
    detail,
    class: failure_class(code),
  }
}
