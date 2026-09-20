use std::sync::{
  Arc,
  atomic::{AtomicBool, Ordering},
};

#[napi]
pub struct LlmStreamHandle {
  pub(crate) aborted: Arc<AtomicBool>,
}

#[napi]
impl LlmStreamHandle {
  #[napi]
  pub fn abort(&self) {
    self.aborted.store(true, Ordering::SeqCst);
  }
}
