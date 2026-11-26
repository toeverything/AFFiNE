//! Bounded reads and signed download URLs on the local `fs` and `assetpack`
//! backends: oversized objects fail, missing objects read as `None`, and
//! neither backend can sign downloads.

use std::sync::Arc;

use server_blob::{AssetpackBlobStorage, BlobStorageBackend, LocalFsBlobStorage};

#[tokio::test]
async fn local_backends_bound_reads_and_cannot_sign_downloads() {
  let root = std::env::temp_dir().join(format!("server-blob-bounded-{}", uuid::Uuid::new_v4().simple()));
  let root_str = root.to_str().unwrap();
  let backends: [(&str, Arc<dyn BlobStorageBackend>); 2] = [
    ("fs", Arc::new(LocalFsBlobStorage::new(root_str, "fs").unwrap())),
    (
      "assetpack",
      Arc::new(AssetpackBlobStorage::new(root_str, "ap", "blob").unwrap()),
    ),
  ];
  for (name, storage) in backends {
    storage
      .put("ws/key", b"0123456789".to_vec(), "text/plain")
      .await
      .unwrap();
    let (body, _) = storage.get_limited("ws/key", 10).await.unwrap().expect(name);
    assert_eq!(body, b"0123456789", "{name}");
    assert!(
      storage.get_limited("ws/key", 9).await.is_err(),
      "{name}: oversized object must fail"
    );
    assert!(storage.get_limited("ws/missing", 9).await.unwrap().is_none(), "{name}");
    assert!(storage.presign_get("ws/key").await.unwrap().is_none(), "{name}");
  }
  let _ = std::fs::remove_dir_all(&root);
}
