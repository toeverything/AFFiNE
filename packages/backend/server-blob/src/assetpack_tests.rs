use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};

use super::*;

struct Hook {
  active: AtomicUsize,
  peak: AtomicUsize,
  entered: Mutex<usize>,
  entered_cv: Condvar,
  released: Mutex<bool>,
  released_cv: Condvar,
  gate: AtomicBool,
}

static WRITE_HOOK: OnceLock<Mutex<Option<Arc<Hook>>>> = OnceLock::new();
static READ_HOOK: OnceLock<Mutex<Option<Arc<Hook>>>> = OnceLock::new();
static MANIFEST_CHECKED_HOOK: OnceLock<Mutex<Option<Arc<Hook>>>> = OnceLock::new();
static HOOK_TEST_LOCK: Mutex<()> = Mutex::new(());

pub(super) struct Guard(Option<Arc<Hook>>);

impl Drop for Guard {
  fn drop(&mut self) {
    if let Some(h) = &self.0 {
      h.active.fetch_sub(1, Ordering::SeqCst);
    }
  }
}

struct CleanupGuard {
  slot: &'static OnceLock<Mutex<Option<Arc<Hook>>>>,
  hook: Arc<Hook>,
}

impl Drop for CleanupGuard {
  fn drop(&mut self) {
    if let Some(slot) = self.slot.get()
      && let Ok(mut g) = slot.lock()
    {
      *g = None;
    }
    self.hook.gate.store(false, Ordering::SeqCst);
    if let Ok(mut rel) = self.hook.released.lock() {
      *rel = true;
      self.hook.released_cv.notify_all();
    }
  }
}

fn new_hook() -> Arc<Hook> {
  Arc::new(Hook {
    active: AtomicUsize::new(0),
    peak: AtomicUsize::new(0),
    entered: Mutex::new(0),
    entered_cv: Condvar::new(),
    released: Mutex::new(false),
    released_cv: Condvar::new(),
    gate: AtomicBool::new(true),
  })
}

fn enter_slot(slot: &'static OnceLock<Mutex<Option<Arc<Hook>>>>) -> Guard {
  let hook = slot.get_or_init(|| Mutex::new(None)).lock().unwrap().clone();
  if let Some(h) = &hook {
    let cur = h.active.fetch_add(1, Ordering::SeqCst) + 1;
    h.peak.fetch_max(cur, Ordering::SeqCst);
    {
      let mut n = h.entered.lock().unwrap();
      *n += 1;
      h.entered_cv.notify_all();
    }
    if h.gate.load(Ordering::SeqCst) {
      let mut rel = h.released.lock().unwrap();
      while !*rel {
        rel = h.released_cv.wait(rel).unwrap();
      }
    }
  }
  Guard(hook)
}

pub(super) fn enter_write_blocking_hook() -> Guard {
  enter_slot(&WRITE_HOOK)
}

pub(super) fn enter_read_blocking_hook() -> Guard {
  enter_slot(&READ_HOOK)
}

/// Runs right after a read checked its manifest snapshot and before it reads
/// the recipe.
pub(super) fn enter_manifest_checked_hook() -> Guard {
  enter_slot(&MANIFEST_CHECKED_HOOK)
}

#[test]
fn semaphore_permit_survives_future_cancellation_and_caps_concurrency_at_four() {
  let _serial = HOOK_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(4)
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let root = std::env::temp_dir().join(format!("affine-ap-sem-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let ap = Arc::new(AssetpackBlobStorage::new(root.to_str().unwrap(), "blobs", "blob").unwrap());
    ap.put("ws/seed.bin", b"seed-data".to_vec(), "application/octet-stream")
      .await
      .expect("seed");

    for is_write in [true, false] {
      let slot = if is_write { &WRITE_HOOK } else { &READ_HOOK };
      let sem = if is_write {
        &ASSETPACK_WRITE_SEM
      } else {
        &ASSETPACK_READ_SEM
      };
      let hook = new_hook();
      *slot.get_or_init(|| Mutex::new(None)).lock().unwrap() = Some(Arc::clone(&hook));
      let cleanup = CleanupGuard {
        slot,
        hook: Arc::clone(&hook),
      };

      let mut batch1 = Vec::new();
      for i in 0..4 {
        let a = Arc::clone(&ap);
        batch1.push(tokio::spawn(async move {
          if is_write {
            let _ = a
              .put(&format!("ws/b1-{i}.bin"), vec![i as u8; 64], "application/octet-stream")
              .await;
          } else {
            let _ = a.get("ws/seed.bin").await;
          }
        }));
      }
      let h_wait = Arc::clone(&hook);
      tokio::task::spawn_blocking(move || {
        let mut n = h_wait.entered.lock().unwrap();
        while *n < 4 {
          n = h_wait.entered_cv.wait(n).unwrap();
        }
      })
      .await
      .unwrap();
      for h in batch1 {
        h.abort();
        assert!(h.await.unwrap_err().is_cancelled());
      }
      let avail_after_cancel = sem.available_permits();

      let mut batch2 = Vec::new();
      for i in 0..4 {
        let a = Arc::clone(&ap);
        batch2.push(tokio::spawn(async move {
          if is_write {
            a.put(&format!("ws/b2-{i}.bin"), vec![i as u8; 64], "application/octet-stream")
              .await
              .map(|_| ())
          } else {
            a.get("ws/seed.bin").await.map(|_| ())
          }
        }));
      }

      hook.gate.store(false, Ordering::SeqCst);
      *hook.released.lock().unwrap() = true;
      hook.released_cv.notify_all();
      for h in batch2 {
        h.await.unwrap().expect("second batch succeeds after permits release");
      }
      drop(cleanup);

      assert_eq!(avail_after_cancel, 0);
      assert_eq!(*hook.entered.lock().unwrap(), 8);
      assert_eq!(hook.peak.load(Ordering::SeqCst), 4);
    }

    let _ = std::fs::remove_dir_all(&root);
  });
}

#[test]
fn promote_object_copies_manifest_without_recomputing_and_reads_bypass_saturated_writes() {
  let _serial = HOOK_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(4)
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let root = std::env::temp_dir().join(format!("affine-ap-iso-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let ap = Arc::new(AssetpackBlobStorage::new(root.to_str().unwrap(), "blobs", "blob").unwrap());
    let payload = b"assetpack-promote-and-read-isolation-payload".to_vec();
    ap.put(
      "ws/.reservations/r1/item.bin",
      payload.clone(),
      "application/octet-stream",
    )
    .await
    .expect("put staging");

    let pool = ap.open_pool().await.expect("open pool");
    let objs_before: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM objects")
      .fetch_one(pool)
      .await
      .unwrap();
    let promoted = ap
      .promote_object("ws/.reservations/r1/item.bin", "ws/item.bin", "text/plain")
      .await
      .expect("promote_object");
    let objs_after: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM objects")
      .fetch_one(pool)
      .await
      .unwrap();
    assert_eq!(objs_before, objs_after, "promote_object must not rewrite objects");
    assert_eq!(promoted.content_type, "text/plain");
    assert_eq!(promoted.content_length, payload.len() as i64);
    assert!(ap.head("ws/.reservations/r1/item.bin").await.unwrap().is_some());

    // Saturate all 4 write permits; get() must still complete immediately via ASSETPACK_READ_SEM.
    let hook = new_hook();
    *WRITE_HOOK.get_or_init(|| Mutex::new(None)).lock().unwrap() = Some(Arc::clone(&hook));
    let cleanup = CleanupGuard {
      slot: &WRITE_HOOK,
      hook: Arc::clone(&hook),
    };
    let mut writers = Vec::new();
    for i in 0..4 {
      let a = Arc::clone(&ap);
      writers.push(tokio::spawn(async move {
        a.put(
          &format!("ws/slow-{i}.bin"),
          vec![i as u8; 64],
          "application/octet-stream",
        )
        .await
      }));
    }
    let h_wait = Arc::clone(&hook);
    tokio::task::spawn_blocking(move || {
      let mut n = h_wait.entered.lock().unwrap();
      while *n < 4 {
        n = h_wait.entered_cv.wait(n).unwrap();
      }
    })
    .await
    .unwrap();
    assert_eq!(ASSETPACK_WRITE_SEM.available_permits(), 0);

    let (got, meta) = ap
      .get("ws/item.bin")
      .await
      .expect("get during saturated writes")
      .expect("exists");
    assert_eq!(got, payload);
    assert_eq!(meta.content_type, "text/plain");

    hook.gate.store(false, Ordering::SeqCst);
    *hook.released.lock().unwrap() = true;
    hook.released_cv.notify_all();
    for w in writers {
      w.await.unwrap().expect("writer completes");
    }
    drop(cleanup);
    let _ = std::fs::remove_dir_all(&root);
  });
}

fn encode_gradient_png(width: u32, height: u32) -> Vec<u8> {
  use image::ImageEncoder as _;
  let mut pixels = vec![0u8; (width * height * 3) as usize];
  for y in 0..height {
    for x in 0..width {
      let idx = ((y * width + x) * 3) as usize;
      pixels[idx] = ((x * 255) / width.max(1)) as u8;
      pixels[idx + 1] = ((y * 255) / height.max(1)) as u8;
      pixels[idx + 2] = (((x + y) * 127) / (width + height).max(1)) as u8;
    }
  }
  let mut out = Vec::new();
  image::codecs::png::PngEncoder::new(&mut out)
    .write_image(&pixels, width, height, image::ExtendedColorType::Rgb8)
    .expect("encode gradient png");
  out
}

#[test]
fn high_ratio_gradient_png_put_promote_get_roundtrip() {
  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let root = std::env::temp_dir().join(format!("affine-ap-grad-png-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let ap = AssetpackBlobStorage::new(root.to_str().unwrap(), "blobs", "blob").unwrap();

    for (w, h) in [(1500u32, 1500u32), (2800u32, 2800u32)] {
      let png = encode_gradient_png(w, h);
      let raw_pixels = u64::from(w) * u64::from(h) * 3;
      assert!(
        png.len() >= 32 * 1024 && raw_pixels > (png.len() as u64) * 16,
        "{w}x{h} gradient png size {} vs raw pixels {raw_pixels}",
        png.len()
      );
      let src_key = format!("ws/.reservations/r1/grad-{w}x{h}.png");
      let dst_key = format!("ws/grad-{w}x{h}.png");
      ap.put(&src_key, png.clone(), "image/png")
        .await
        .unwrap_or_else(|e| panic!("put {w}x{h}: {e}"));
      ap.promote_object(&src_key, &dst_key, "image/png")
        .await
        .unwrap_or_else(|e| panic!("promote {w}x{h}: {e}"));

      let pool = ap.open_pool().await.unwrap();
      let rhex: String =
        sqlx::query_scalar("SELECT recipe_hash FROM storage_assetpack_blobs WHERE scope = 'blob' AND key = ?1")
          .bind(&dst_key)
          .fetch_one(pool)
          .await
          .unwrap();
      let rhash = Hash32::from_hex(&rhex).unwrap();
      let rrow = fetch_bounded_obj_row(
        pool,
        rhash,
        ObjectKind::Recipe,
        (0, MAX_RECIPE_BYTES, MAX_RECIPE_BYTES),
        "r",
      )
      .await
      .unwrap();
      let robj = decode_verified_object(rhash, ObjectKind::Recipe, rrow.0 as u64, &rrow).unwrap();
      let parsed = parse_recipe_checked(&robj.bytes, &rhash).unwrap();
      assert_ne!(parsed.transform_id, 0, "{w}x{h} gradient PNG must trigger precomp2");
      assert_eq!(parsed.transform_version, 2, "{w}x{h} gradient PNG must use v2");

      let (got, meta) = ap
        .get(&dst_key)
        .await
        .unwrap_or_else(|e| panic!("get {w}x{h}: {e}"))
        .expect("exists");
      assert_eq!(meta.content_length, png.len() as i64);
      assert_eq!(got, png, "{w}x{h} gradient PNG roundtrip mismatch");
    }

    let _ = std::fs::remove_dir_all(&root);
  });
}

#[test]
fn may_run_precomp2_transform_skips_plain_text_and_unknown_binaries() {
  let fast = FileTransformConfig::fast();
  assert!(DECODE_MAX_TOTAL_OUTPUT_BYTES >= fast.precomp2.max_total_output);
  assert!(DECODE_MAX_TOTAL_OUTPUT_BYTES >= fast.max_transform_bytes);

  let text = vec![b'a'; 256 * 1024];
  assert!(!may_run_precomp2_transform(Some("txt"), &text));
  assert!(!may_run_precomp2_transform(Some("json"), &text));
  assert!(!may_run_precomp2_transform(Some("bin"), &text));
  assert!(!may_run_precomp2_transform(None, &text));

  // Too small (< 32 KiB) always skipped even with matching extension/magic.
  let small_png = b"\x89PNG\r\n\x1a\nhello";
  assert!(!may_run_precomp2_transform(Some("png"), small_png));

  // Matching extension in allow_ext passes.
  assert!(may_run_precomp2_transform(Some("png"), &text));
  assert!(may_run_precomp2_transform(Some("pdf"), &text));
  assert!(may_run_precomp2_transform(Some("zip"), &text));
  assert!(may_run_precomp2_transform(Some("gz"), &text));

  // Matching magic without extension passes.
  for magic in [
    b"\x89PNG\r\n\x1a\n".as_slice(),
    b"\x1f\x8b".as_slice(),
    b"PK\x03\x04".as_slice(),
    b"%PDF-1.7".as_slice(),
    b"UnityFS\0".as_slice(),
  ] {
    let mut buf = vec![0u8; 64 * 1024];
    buf[..magic.len()].copy_from_slice(magic);
    assert!(may_run_precomp2_transform(None, &buf));
    assert!(may_run_precomp2_transform(Some("bin"), &buf));
  }
}

#[test]
fn get_limited_reads_one_manifest_snapshot_while_the_key_is_replaced() {
  let _serial = HOOK_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(4)
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let root = std::env::temp_dir().join(format!("affine-ap-snapshot-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let ap = Arc::new(AssetpackBlobStorage::new(root.to_str().unwrap(), "blobs", "blob").unwrap());
    let small = b"small-version".to_vec();
    ap.put("ws/swap.bin", small.clone(), "application/octet-stream")
      .await
      .unwrap();

    // Block the read after it checked its manifest snapshot and before it reads
    // the recipe, then replace the key with a version over the limit.
    let hook = new_hook();
    *MANIFEST_CHECKED_HOOK.get_or_init(|| Mutex::new(None)).lock().unwrap() = Some(Arc::clone(&hook));
    let cleanup = CleanupGuard {
      slot: &MANIFEST_CHECKED_HOOK,
      hook: Arc::clone(&hook),
    };
    let reader = {
      let ap = Arc::clone(&ap);
      let limit = small.len();
      tokio::spawn(async move { ap.get_limited("ws/swap.bin", limit).await })
    };
    let h_wait = Arc::clone(&hook);
    tokio::task::spawn_blocking(move || {
      let mut n = h_wait.entered.lock().unwrap();
      while *n < 1 {
        n = h_wait.entered_cv.wait(n).unwrap();
      }
    })
    .await
    .unwrap();
    ap.put("ws/swap.bin", vec![b'L'; 4096], "application/octet-stream")
      .await
      .unwrap();
    hook.gate.store(false, Ordering::SeqCst);
    *hook.released.lock().unwrap() = true;
    hook.released_cv.notify_all();
    let (body, _) = reader.await.unwrap().unwrap().expect("snapshot body");
    assert_eq!(body, small, "the read stays on its manifest snapshot");
    drop(cleanup);

    // A fresh read sees the replacement and fails on its manifest size.
    assert!(ap.get_limited("ws/swap.bin", small.len()).await.is_err());
    let _ = std::fs::remove_dir_all(&root);
  });
}
