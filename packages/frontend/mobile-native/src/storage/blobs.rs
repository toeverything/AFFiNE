use super::*;

#[uniffi::export(async_runtime = "tokio")]
impl DocStoragePool {
  pub async fn get_blob(&self, universal_id: String, key: String) -> Result<Option<Blob>> {
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    {
      use affine_nbstore::Blob as NbBlob;
      enum BlobEncodeOutcome {
        Cached(Blob),
        Inline(NbBlob),
      }

      let universal_id_for_cache = universal_id.clone();
      let key_for_cache = key.clone();
      if let Ok(Some(blob)) = self
        .run_mobile_cache_io(
          move |cache| Ok(cache.get_blob(&universal_id_for_cache, &key_for_cache)),
          "Failed to read mobile blob cache",
        )
        .await
      {
        return Ok(Some(blob));
      }

      let Some(blob) = self
        .inner
        .get(universal_id.clone())
        .await?
        .get_blob(key.clone())
        .await?
      else {
        return Ok(None);
      };

      if !should_cache_payload_as_file(blob.data.len()) {
        return Ok(Some(blob.into()));
      }

      let universal_id_for_cache = universal_id.clone();
      let key_for_fallback = key.clone();
      return match self
        .run_mobile_cache_io(
          move |cache| {
            Ok(match cache.cache_blob(&universal_id_for_cache, &blob) {
              Ok(cached) => BlobEncodeOutcome::Cached(cached),
              Err(_) => BlobEncodeOutcome::Inline(blob),
            })
          },
          "Failed to cache blob file",
        )
        .await
      {
        Ok(BlobEncodeOutcome::Cached(cached)) => Ok(Some(cached)),
        Ok(BlobEncodeOutcome::Inline(blob)) => Ok(Some(blob.into())),
        Err(_) => Ok(
          self
            .inner
            .get(universal_id)
            .await?
            .get_blob(key_for_fallback)
            .await?
            .map(Into::into),
        ),
      };
    }

    #[cfg(not(any(target_os = "android", target_os = "ios", test)))]
    {
      Ok(self.inner.get(universal_id).await?.get_blob(key).await?.map(Into::into))
    }
  }

  pub async fn set_blob(&self, universal_id: String, blob: SetBlob) -> Result<()> {
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    let key = blob.key.clone();
    let blob = NbSetBlob {
      key: blob.key,
      data: Into::<Data>::into(self.decode_blob_data(&universal_id, &blob.data).await?),
      mime: blob.mime,
    };
    self.inner.get(universal_id.clone()).await?.set_blob(blob).await?;
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    {
      let universal_id_for_cache = universal_id;
      let _ = self
        .run_mobile_cache_io(
          move |cache| {
            cache.invalidate_blob(&universal_id_for_cache, &key);
            Ok(())
          },
          "Failed to invalidate mobile blob cache entry",
        )
        .await;
    }
    Ok(())
  }

  pub async fn delete_blob(&self, universal_id: String, key: String, permanently: bool) -> Result<()> {
    self
      .inner
      .get(universal_id.clone())
      .await?
      .delete_blob(key.clone(), permanently)
      .await?;
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    {
      let universal_id_for_cache = universal_id;
      let _ = self
        .run_mobile_cache_io(
          move |cache| {
            cache.invalidate_blob(&universal_id_for_cache, &key);
            Ok(())
          },
          "Failed to invalidate mobile blob cache entry",
        )
        .await;
    }
    Ok(())
  }

  pub async fn release_blobs(&self, universal_id: String) -> Result<()> {
    self.inner.get(universal_id.clone()).await?.release_blobs().await?;
    #[cfg(any(target_os = "android", target_os = "ios", test))]
    {
      let universal_id_for_cache = universal_id;
      let _ = self
        .run_mobile_cache_io(
          move |cache| {
            cache.clear_workspace_cache(&universal_id_for_cache);
            Ok(())
          },
          "Failed to clear mobile blob cache workspace",
        )
        .await;
    }
    Ok(())
  }

  pub async fn list_blobs(&self, universal_id: String) -> Result<Vec<ListedBlob>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .list_blobs()
        .await?
        .into_iter()
        .map(Into::into)
        .collect(),
    )
  }

  pub async fn set_blob_uploaded_at(
    &self,
    universal_id: String,
    peer: String,
    blob_id: String,
    uploaded_at: Option<i64>,
  ) -> Result<()> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .set_blob_uploaded_at(peer, blob_id, uploaded_at.map(millis_to_naive_utc).transpose()?)
        .await?,
    )
  }

  pub async fn get_blob_uploaded_at(&self, universal_id: String, peer: String, blob_id: String) -> Result<Option<i64>> {
    Ok(
      self
        .inner
        .get(universal_id)
        .await?
        .get_blob_uploaded_at(peer, blob_id)
        .await?
        .map(|t| t.and_utc().timestamp_millis()),
    )
  }
}
