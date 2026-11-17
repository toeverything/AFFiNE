mod crawl;
mod dto;
mod persistence;
mod table;

use std::sync::atomic::{AtomicBool, Ordering};

pub use dto::{
  NativeBlockInfo, NativeCrawlResult, NativeIndexAggregateResult, NativeIndexBucket, NativeIndexDocument,
  NativeIndexField, NativeIndexHighlight, NativeIndexHighlightValue, NativeIndexHit, NativeIndexQuery,
  NativeIndexSearchOptions, NativeIndexSearchResult, NativeIndexSpan,
};
use error::{Error, Result};
use memory_indexer::MemoryIndex;
pub(super) use table::{TableIndex, string_values};

pub(super) use super::{DocIndexedClock, error, storage::SqliteDocStorage};

// Bumped again (alongside the JS indexer, `impls/idb/indexer/index.ts`): a
// doc whose page title was missing could throw during crawling and get
// silently marked "indexed" with zero blocks, permanently hiding it from
// search with no retry. Fixed in `reader.ts`, but already-affected docs need
// a real version bump to get another attempt.
const NBSTORE_INDEXER_VERSION: u32 = 9;

pub struct IndexManager {
  pub(super) doc: TableIndex,
  pub(super) block: TableIndex,
  pub(super) ready: AtomicBool,
}

impl IndexManager {
  pub fn new() -> Self {
    Self {
      doc: TableIndex::doc(),
      block: TableIndex::block(),
      ready: AtomicBool::new(true),
    }
  }

  pub(super) fn table(&self, table: &str) -> Result<&TableIndex> {
    match table {
      "doc" => Ok(&self.doc),
      "block" => Ok(&self.block),
      _ => Err(Error::Serialization(format!("unknown index table {table}"))),
    }
  }

  pub(super) fn tables(&self) -> [(&'static str, &TableIndex); 2] {
    [("doc", &self.doc), ("block", &self.block)]
  }

  pub(super) fn ensure_ready(&self) -> Result<()> {
    self
      .ready
      .load(Ordering::Acquire)
      .then_some(())
      .ok_or(Error::IndexNotReady)
  }

  pub(super) async fn reset(&self) {
    for (_, table) in self.tables() {
      *table.index.write().await = MemoryIndex::new(table.schema.clone());
    }
    self.ready.store(false, Ordering::Release);
  }
}

impl Default for IndexManager {
  fn default() -> Self {
    Self::new()
  }
}

#[cfg(test)]
mod tests;
