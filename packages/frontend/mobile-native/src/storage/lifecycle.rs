use super::*;

#[uniffi::export(async_runtime = "tokio")]
impl DocStoragePool {
  /// Initialize the database and run migrations.
  pub async fn connect(&self, universal_id: String, path: String) -> Result<()> {
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    {
      let universal_id_for_cache = universal_id.clone();
      let path_for_cache = path.clone();
      self
        .run_mobile_cache_io(
          move |cache| cache.register_workspace(&universal_id_for_cache, &path_for_cache),
          "Failed to initialize mobile blob cache",
        )
        .await?;
    }

    if let Err(err) = self.inner.connect(universal_id.clone(), path).await {
      #[cfg(any(target_os = "android", target_os = "ios", test))]
      {
        let universal_id_for_cache = universal_id.clone();
        let _ = self
          .run_mobile_cache_io(
            move |cache| {
              cache.invalidate_workspace(&universal_id_for_cache);
              Ok(())
            },
            "Failed to rollback mobile blob cache workspace",
          )
          .await;
      }
      return Err(err.into());
    }

    Ok(())
  }

  pub async fn disconnect(&self, universal_id: String) -> Result<()> {
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    {
      let universal_id_for_cache = universal_id.clone();
      let _ = self
        .run_mobile_cache_io(
          move |cache| {
            cache.invalidate_workspace(&universal_id_for_cache);
            Ok(())
          },
          "Failed to clear mobile blob cache workspace",
        )
        .await;
    }
    self.inner.disconnect(universal_id).await?;
    Ok(())
  }

  pub async fn set_space_id(&self, universal_id: String, space_id: String) -> Result<()> {
    Ok(self.inner.get(universal_id).await?.set_space_id(space_id).await?)
  }

  pub async fn push_update(&self, universal_id: String, doc_id: String, update: String) -> Result<i64> {
    let decoded_update = self.decode_base64_payload(&update)?;
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .push_update(doc_id, decoded_update)
        .await?
        .and_utc()
        .timestamp_millis(),
    )
  }
}
