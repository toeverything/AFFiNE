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

static HOOK: OnceLock<Mutex<Option<Arc<Hook>>>> = OnceLock::new();

pub(super) struct Guard(Option<Arc<Hook>>);

impl Drop for Guard {
  fn drop(&mut self) {
    if let Some(h) = &self.0 {
      h.active.fetch_sub(1, Ordering::SeqCst);
    }
  }
}

struct CleanupGuard(Arc<Hook>);

impl Drop for CleanupGuard {
  fn drop(&mut self) {
    if let Some(slot) = HOOK.get()
      && let Ok(mut g) = slot.lock()
    {
      *g = None;
    }
    self.0.gate.store(false, Ordering::SeqCst);
    if let Ok(mut rel) = self.0.released.lock() {
      *rel = true;
      self.0.released_cv.notify_all();
    }
  }
}

pub(super) fn enter_blocking_hook() -> Guard {
  let hook = HOOK.get_or_init(|| Mutex::new(None)).lock().unwrap().clone();
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

#[test]
fn semaphore_permit_survives_future_cancellation_and_caps_concurrency_at_four() {
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
    let hook = Arc::new(Hook {
      active: AtomicUsize::new(0),
      peak: AtomicUsize::new(0),
      entered: Mutex::new(0),
      entered_cv: Condvar::new(),
      released: Mutex::new(false),
      released_cv: Condvar::new(),
      gate: AtomicBool::new(true),
    });
    *HOOK.get_or_init(|| Mutex::new(None)).lock().unwrap() = Some(Arc::clone(&hook));
    let cleanup = CleanupGuard(Arc::clone(&hook));

    let mut batch1 = Vec::new();
    for i in 0..4 {
      let a = Arc::clone(&ap);
      batch1.push(tokio::spawn(async move {
        if i % 2 == 0 {
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
    let avail_after_cancel = ASSETPACK_CPU_SEM.available_permits();

    let mut batch2 = Vec::new();
    for i in 0..4 {
      let a = Arc::clone(&ap);
      batch2.push(tokio::spawn(async move {
        if i % 2 == 0 {
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
    let mut results = Vec::with_capacity(4);
    for h in batch2 {
      results.push(h.await.unwrap());
    }
    drop(cleanup);

    assert_eq!(avail_after_cancel, 0);
    for r in results {
      r.expect("second batch succeeds after permits release");
    }
    assert_eq!(*hook.entered.lock().unwrap(), 8);
    assert_eq!(hook.peak.load(Ordering::SeqCst), 4);
    let _ = std::fs::remove_dir_all(&root);
  });
}
