use super::*;
use crate::DocDiff;

#[uniffi::export(async_runtime = "tokio")]
impl DocStoragePool {
  pub async fn get_doc(&self, universal_id: String, doc_id: String) -> Result<Option<DocRecord>> {
    let Some(record) = self.inner.get(universal_id.clone()).await?.get_doc(doc_id).await? else {
      return Ok(None);
    };
    let timestamp = record.timestamp.and_utc().timestamp_millis();
    let bin = self
      .encode_doc_data(&universal_id, &record.doc_id, timestamp, &record.bin)
      .await?;
    Ok(Some(DocRecord {
      doc_id: record.doc_id,
      bin,
      timestamp,
    }))
  }

  pub async fn get_doc_diff(
    &self,
    universal_id: String,
    doc_id: String,
    state: Option<String>,
  ) -> Result<Option<DocDiff>> {
    let remote_state_vector = state.as_deref().map(decode_base64_data).transpose()?;
    let Some(diff) = self
      .inner
      .get(universal_id)
      .await?
      .get_doc_diff(doc_id, remote_state_vector)
      .await?
    else {
      return Ok(None);
    };
    let timestamp = diff.timestamp.and_utc().timestamp_millis();
    Ok(Some(DocDiff {
      doc_id: diff.doc_id,
      missing: encode_base64_data(&diff.missing),
      state: encode_base64_data(&diff.state),
      timestamp,
    }))
  }

  pub fn merge_updates(&self, updates: Vec<String>) -> Result<String> {
    let decoded: Vec<Vec<u8>> = updates
      .iter()
      .map(|u| decode_base64_data(u))
      .collect::<Result<Vec<_>>>()?;
    let slices: Vec<&[u8]> = decoded.iter().map(|u| u.as_slice()).collect();
    let merged = affine_nbstore::merge_updates(&slices)?;
    Ok(encode_base64_data(&merged))
  }

  pub async fn delete_doc(&self, universal_id: String, doc_id: String) -> Result<()> {
    Ok(self.inner.get(universal_id).await?.delete_doc(doc_id).await?)
  }

  pub async fn get_doc_clocks(&self, universal_id: String, after: Option<i64>) -> Result<Vec<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_doc_clocks(after.map(millis_to_naive_utc).transpose()?)
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn get_doc_clock(&self, universal_id: String, doc_id: String) -> Result<Option<DocClock>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_doc_clock(doc_id)
        .await?
        .map(Into::into),
    )
  }
}
