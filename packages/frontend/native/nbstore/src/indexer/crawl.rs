use affine_doc_loader::{ParseError, parse_doc_from_binary};
use y_octo::merge_updates_v1;

use super::{NativeCrawlResult, SqliteDocStorage, error::Result};

impl SqliteDocStorage {
  pub async fn crawl_doc_data(&self, doc_id: &str) -> Result<NativeCrawlResult> {
    let doc_bin = self.load_doc_binary(doc_id).await?.ok_or(ParseError::DocNotFound)?;
    Ok(parse_doc_from_binary(doc_bin, doc_id.to_string())?.into())
  }

  async fn load_doc_binary(&self, doc_id: &str) -> Result<Option<Vec<u8>>> {
    let snapshot = self.get_doc_snapshot(doc_id.to_string()).await?;
    let mut updates = self.get_doc_updates(doc_id.to_string()).await?;
    if snapshot.is_none() && updates.is_empty() {
      return Ok(None);
    }
    updates.sort_by_key(|update| update.timestamp);
    let mut segments = Vec::with_capacity(snapshot.as_ref().map(|_| 1).unwrap_or(0) + updates.len());
    if let Some(record) = snapshot {
      segments.push(record.bin.to_vec());
    }
    segments.extend(updates.into_iter().map(|update| update.bin.to_vec()));
    merge_updates(segments).map(Some)
  }
}

fn merge_updates(mut segments: Vec<Vec<u8>>) -> Result<Vec<u8>> {
  if segments.is_empty() {
    return Err(ParseError::DocNotFound.into());
  }
  if segments.len() == 1 {
    return segments.pop().ok_or(ParseError::DocNotFound.into());
  }
  let update = merge_updates_v1(segments).map_err(|_| ParseError::InvalidBinary)?;
  update
    .encode_v1()
    .map_err(|error| ParseError::ParserError(error.to_string()).into())
}
