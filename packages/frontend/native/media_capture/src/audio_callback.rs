use std::sync::Arc;

use crossbeam_channel::Sender;
use napi::{
  bindgen_prelude::Float32Array,
  threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};

/// Internal callback abstraction so audio taps can target JS or native
/// pipelines.
#[derive(Clone)]
pub enum AudioCallback {
  Js(Arc<ThreadsafeFunction<Float32Array, ()>>),
  Channel(Sender<Vec<f32>>),
}

impl AudioCallback {
  pub fn call(&self, samples: Vec<f32>) {
    match self {
      Self::Js(func) => {
        // Non-blocking call into JS; errors are ignored to avoid blocking the
        // audio thread.
        let _ = func.call(Ok(samples.into()), ThreadsafeFunctionCallMode::NonBlocking);
      }
      Self::Channel(sender) => {
        // Drop the chunk if the channel is full to avoid blocking capture.
        let _ = sender.try_send(samples);
      }
    }
  }
}
