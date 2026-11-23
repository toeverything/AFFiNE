use affine_doc_loader::{ParseError, parse_doc_from_binary};

use super::{NativeCrawlResult, SqliteDocStorage, error::Result};

impl SqliteDocStorage {
  pub async fn crawl_doc_data(&self, doc_id: &str) -> Result<NativeCrawlResult> {
    let record = self.get_doc(doc_id.to_string()).await?.ok_or(ParseError::DocNotFound)?;
    Ok(parse_doc_from_binary(record.bin.to_vec(), doc_id.to_string())?.into())
  }
}
