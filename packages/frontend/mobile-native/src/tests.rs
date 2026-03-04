use std::{
  fs,
  sync::atomic::{AtomicU64, Ordering},
  time::{SystemTime, UNIX_EPOCH},
};

use affine_nbstore::DocUpdate as NbDocUpdate;
use chrono::{DateTime, Utc};

use crate::{UniffiError, cache, ffi_types::DocUpdate, storage::new_doc_storage_pool};

static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

fn unique_id(prefix: &str) -> String {
  let counter = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .expect("system clock before unix epoch")
    .as_nanos();
  format!("{prefix}-{now}-{counter}")
}

#[test]
fn doc_update_roundtrip_base64() {
  let timestamp = DateTime::<Utc>::from_timestamp_millis(1_700_000_000_000)
    .unwrap()
    .naive_utc();
  let original = NbDocUpdate {
    doc_id: "doc-1".to_string(),
    timestamp,
    bin: vec![1, 2, 3, 4, 5],
  };

  let encoded: DocUpdate = original.into();
  let decoded = NbDocUpdate::try_from(encoded).unwrap();

  assert_eq!(decoded.doc_id, "doc-1");
  assert_eq!(decoded.timestamp, timestamp);
  assert_eq!(decoded.bin, vec![1, 2, 3, 4, 5]);
}

#[test]
fn doc_update_rejects_invalid_base64() {
  let update = DocUpdate {
    doc_id: "doc-2".to_string(),
    timestamp: 0,
    bin: "not-base64!!".to_string(),
  };

  let err = match NbDocUpdate::try_from(update) {
    Ok(_) => panic!("expected base64 decode error"),
    Err(err) => err,
  };
  match err {
    UniffiError::Base64DecodingError(_) => {}
    other => panic!("unexpected error: {other:?}"),
  }
}

#[tokio::test]
async fn decode_blob_data_rejects_out_of_workspace_path() {
  let pool = new_doc_storage_pool();
  let universal_id = unique_id("mobile-doc-outside");
  pool
    .connect(universal_id.clone(), ":memory:".to_string())
    .await
    .expect("connect should succeed");

  let outside_dir = std::env::temp_dir().join(unique_id("mobile-doc-outside-dir"));
  fs::create_dir_all(&outside_dir).expect("create outside dir");
  let outside_file = outside_dir.join("1234567890abcdef.blob");
  fs::write(&outside_file, b"outside").expect("write outside file");
  let token = format!("{}{}", cache::MOBILE_BLOB_FILE_PREFIX, outside_file.display());

  let err = pool
    .decode_blob_data(&universal_id, &token)
    .await
    .expect_err("decode should reject out-of-workspace token");
  let UniffiError::Err(message) = err else {
    panic!("unexpected error kind");
  };
  assert!(message.contains("outside the workspace cache directory"));

  pool.disconnect(universal_id).await.expect("disconnect should succeed");
  let _ = fs::remove_dir_all(outside_dir);
}
