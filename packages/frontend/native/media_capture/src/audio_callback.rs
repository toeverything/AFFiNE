use std::sync::{
  Arc,
  atomic::{AtomicU64, Ordering},
};

use crossbeam_channel::{Sender, TrySendError};
use napi::{
  bindgen_prelude::Float32Array,
  threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};

/// Internal callback abstraction so audio taps can target JS or native
/// pipelines.
#[derive(Clone)]
pub enum AudioCallback {
  Js(Arc<ThreadsafeFunction<Float32Array, ()>>),
  Channel {
    sender: Sender<Vec<f32>>,
    overflow_count: Arc<AtomicU64>,
  },
}

impl AudioCallback {
  pub fn call(&self, samples: Vec<f32>) {
    match self {
      Self::Js(func) => {
        // Non-blocking call into JS; errors are ignored to avoid blocking the
        // audio thread.
        let _ = func.call(Ok(samples.into()), ThreadsafeFunctionCallMode::NonBlocking);
      }
      Self::Channel { sender, overflow_count } => match sender.try_send(samples) {
        Ok(()) => {}
        Err(TrySendError::Full(_)) => {
          let dropped = overflow_count.fetch_add(1, Ordering::Relaxed) + 1;
          if dropped == 1 || dropped.is_power_of_two() {
            eprintln!("[affine_media_capture] audio queue overflow, dropped {dropped} chunks");
          }
        }
        Err(TrySendError::Disconnected(_)) => {}
      },
    }
  }
}
