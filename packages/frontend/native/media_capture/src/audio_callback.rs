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
          overflow_count.fetch_add(1, Ordering::Relaxed);
        }
        Err(TrySendError::Disconnected(_)) => {}
      },
    }
  }
}

#[cfg(test)]
mod tests {
  use std::sync::atomic::Ordering;

  use crossbeam_channel::bounded;

  use super::AudioCallback;

  #[test]
  fn channel_overflow_only_increments_the_counter() {
    let (sender, _rx) = bounded(1);
    let overflow_count = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
    let callback = AudioCallback::Channel {
      sender: sender.clone(),
      overflow_count: overflow_count.clone(),
    };

    sender.send(vec![0.0]).unwrap();
    callback.call(vec![1.0]);
    callback.call(vec![2.0]);

    assert_eq!(overflow_count.load(Ordering::Relaxed), 2);
  }
}
