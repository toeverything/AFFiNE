use super::*;

#[uniffi::export(async_runtime = "tokio")]
impl DocStoragePool {
  pub async fn get_doc_snapshot(&self, universal_id: String, doc_id: String) -> Result<Option<DocRecord>> {
    let Some(record) = self
      .inner
      .get(universal_id.clone())
      .await?
      .get_doc_snapshot(doc_id)
      .await?
    else {
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

  pub async fn set_doc_snapshot(&self, universal_id: String, snapshot: DocRecord) -> Result<bool> {
    let doc_record = NbDocRecord {
      doc_id: snapshot.doc_id,
      bin: Into::<Data>::into(self.decode_base64_payload(&snapshot.bin)?),
      timestamp: millis_to_naive_utc(snapshot.timestamp)?,
    };
    Ok(self.inner.get(universal_id).await?.set_doc_snapshot(doc_record).await?)
  }

  pub async fn get_doc_updates(&self, universal_id: String, doc_id: String) -> Result<Vec<DocUpdate>> {
    let updates = self
      .inner
      .get(universal_id.clone())
      .await?
      .get_doc_updates(doc_id)
      .await?;

    let mut converted = Vec::with_capacity(updates.len());
    for update in updates {
      let timestamp = update.timestamp.and_utc().timestamp_millis();
      let bin = self
        .encode_doc_data(&universal_id, &update.doc_id, timestamp, &update.bin)
        .await?;
      converted.push(DocUpdate {
        doc_id: update.doc_id,
        timestamp,
        bin,
      });
    }
    Ok(converted)
  }

  pub async fn mark_updates_merged(&self, universal_id: String, doc_id: String, updates: Vec<i64>) -> Result<u32> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .mark_updates_merged(
          doc_id,
          updates
            .into_iter()
            .map(millis_to_naive_utc)
            .collect::<Result<Vec<_>>>()?,
        )
        .await?,
    )
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
