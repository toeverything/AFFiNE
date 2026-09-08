use super::{RuntimeError, StorageRuntime};

const DELETE_PAGE_SIZE: i32 = 1_000;

#[napi_derive::napi]
impl StorageRuntime {
  #[napi]
  pub async fn delete_workspace_objects(&self, workspace_id: String) -> napi::Result<i64> {
    let mut deleted = 0_i64;
    for prefix in [
      format!("{workspace_id}/"),
      format!("comment-attachments/{workspace_id}/"),
    ] {
      loop {
        let page = self
          .object_storage_list_page(Some(prefix.clone()), None, None, DELETE_PAGE_SIZE)
          .await?;
        if page.entries.is_empty() {
          break;
        }
        let outcomes = self
          .object_storage_delete_many(page.entries.into_iter().map(|entry| entry.key).collect())
          .await?;
        if let Some(failed) = outcomes.iter().find(|outcome| outcome.error.is_some()) {
          return Err(
            RuntimeError::invalid_state(format!(
              "Workspace object delete failed for {}: {}",
              failed.key,
              failed.error.as_deref().unwrap_or("unknown")
            ))
            .into(),
          );
        }
        deleted = deleted.saturating_add(i64::try_from(outcomes.len()).unwrap_or(i64::MAX));
      }
    }
    Ok(deleted)
  }
}

#[cfg(test)]
mod tests {
  use napi::bindgen_prelude::Buffer;

  use super::*;

  fn runtime(root: &std::path::Path) -> StorageRuntime {
    let runtime = StorageRuntime::new().unwrap();
    runtime
      .configure(format!(
        r#"{{"storages":{{"blob.storage":{{"provider":"fs","bucket":"workspace-cleanup","config":{{"path":{}}}}}}}}}"#,
        serde_json::to_string(root).unwrap()
      ))
      .unwrap();
    runtime
  }

  async fn put(runtime: &StorageRuntime, key: String) {
    runtime
      .put_object("blob".to_string(), key, Buffer::from(b"x".as_slice()), None)
      .await
      .unwrap();
  }

  #[tokio::test]
  async fn deletes_all_workspace_object_prefixes_across_pages() {
    let temp = tempfile::tempdir().unwrap();
    let runtime = runtime(temp.path());
    let workspace_id = "workspace-cleanup-paged";

    for index in 0..=DELETE_PAGE_SIZE {
      put(&runtime, format!("{workspace_id}/{index:04}")).await;
    }
    for index in 0..2 {
      put(&runtime, format!("comment-attachments/{workspace_id}/doc/{index}")).await;
    }
    put(&runtime, "another-workspace/keep".to_string()).await;

    assert_eq!(
      runtime
        .delete_workspace_objects(workspace_id.to_string())
        .await
        .unwrap(),
      i64::from(DELETE_PAGE_SIZE) + 3
    );
    assert!(
      runtime
        .list_objects("blob".to_string(), Some(format!("{workspace_id}/")))
        .await
        .unwrap()
        .is_empty()
    );
    assert!(
      runtime
        .list_objects("blob".to_string(), Some(format!("comment-attachments/{workspace_id}/")))
        .await
        .unwrap()
        .is_empty()
    );
    assert_eq!(
      runtime
        .list_objects("blob".to_string(), Some("another-workspace/".to_string()))
        .await
        .unwrap()
        .len(),
      1
    );
  }

  #[tokio::test]
  async fn reports_partial_delete_failure() {
    let temp = tempfile::tempdir().unwrap();
    let runtime = runtime(temp.path());
    let workspace_id = "workspace-cleanup-failure";
    let key = format!("{workspace_id}/object");
    put(&runtime, key.clone()).await;
    let metadata = temp
      .path()
      .join("workspace-cleanup")
      .join(format!("{key}.metadata.json"));
    std::fs::remove_file(&metadata).unwrap();
    std::fs::create_dir(&metadata).unwrap();

    let error = runtime
      .delete_workspace_objects(workspace_id.to_string())
      .await
      .unwrap_err();
    assert!(error.to_string().contains("Workspace object delete failed"));
    assert!(error.to_string().contains(&key));
  }
}
