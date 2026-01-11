use std::{
  cell::RefCell,
  collections::HashMap,
  sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
  },
  thread::JoinHandle,
};

use cpal::{
  SampleRate,
  traits::{DeviceTrait, HostTrait, StreamTrait},
};
use crossbeam_channel::unbounded;
use napi::{
  Error, Status,
  bindgen_prelude::{Float32Array, Result},
  threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use napi_derive::napi;
use rubato::{FastFixedIn, PolynomialDegree, Resampler};

const RESAMPLER_INPUT_CHUNK: usize = 1024; // samples per channel
const TARGET_FRAME_SIZE: usize = 1024; // frame size returned to JS (in mono samples)

struct BufferedResampler {
  resampler: FastFixedIn<f32>,
  channels: usize,
  fifo: Vec<Vec<f32>>,            // per-channel queue
  initial_output_discarded: bool, // Flag to discard first output block (warm-up)
}

impl BufferedResampler {
  fn new(from_sr: f64, to_sr: f64, channels: usize) -> Self {
    let ratio = to_sr / from_sr;
    let resampler = FastFixedIn::<f32>::new(
      ratio,
      1.0,                      // max_resample_ratio_relative (>= 1.0, fixed ratio)
      PolynomialDegree::Linear, // balance quality/perf
      RESAMPLER_INPUT_CHUNK,
      channels,
    )
    .expect("Failed to create FastFixedIn resampler");

    Self {
      resampler,
      channels,
      fifo: vec![Vec::<f32>::new(); channels],
      initial_output_discarded: false,
    }
  }

  // Feed planar samples; returns interleaved output (may be empty)
  fn feed(&mut self, planar_in: &[Vec<f32>]) -> Vec<f32> {
    // Push incoming samples into fifo buffers
    for (ch, data) in planar_in.iter().enumerate() {
      if ch < self.fifo.len() {
        self.fifo[ch].extend_from_slice(data);
      }
    }

    let mut interleaved_out = Vec::new();

    while self.fifo[0].len() >= RESAMPLER_INPUT_CHUNK {
      // Take exactly RESAMPLER_INPUT_CHUNK per channel
      let mut chunk: Vec<Vec<f32>> = Vec::with_capacity(self.channels);
      for ch in 0..self.channels {
        let tail: Vec<f32> = self.fifo[ch].drain(..RESAMPLER_INPUT_CHUNK).collect();
        chunk.push(tail);
      }

      if let Ok(out_blocks) = self.resampler.process(&chunk, None) {
        if !out_blocks.is_empty() && out_blocks.len() == self.channels {
          if !self.initial_output_discarded {
            self.initial_output_discarded = true;
          } else {
            let out_len = out_blocks[0].len();
            for i in 0..out_len {
              for ch in 0..self.channels {
                interleaved_out.push(out_blocks[ch][i]);
              }
            }
          }
        }
      }
    }

    interleaved_out
  }
}

// Thread-local cache for resamplers keyed by (from, to, channels)
thread_local! {
    static RESAMPLER_CACHE: RefCell<HashMap<(u32, u32, usize), BufferedResampler>> = RefCell::new(HashMap::new());
}

fn process_audio_with_resampler(samples: Vec<f32>, from_sample_rate: u32, to_sample_rate: u32) -> Vec<f32> {
  if from_sample_rate == to_sample_rate {
    return samples;
  }

  RESAMPLER_CACHE.with(|cache| {
    let mut map = cache.borrow_mut();
    let key = (from_sample_rate, to_sample_rate, 1usize); // mono resampler
    let resampler = map
      .entry(key)
      .or_insert_with(|| BufferedResampler::new(from_sample_rate as f64, to_sample_rate as f64, 1));
    resampler.feed(&[samples])
  })
}

fn to_mono(frame: &[f32]) -> f32 {
  if frame.is_empty() {
    return 0.0;
  }
  let sum: f32 = frame.iter().filter(|s| s.is_finite()).copied().sum();
  let mono = if frame.len() == 1 {
    sum // already mono, no reduction needed
  } else {
    // For multi-channel, take the sum but don't divide by channel count
    // This preserves more energy while still avoiding simple doubling
    sum * 0.7 // slight reduction to prevent clipping, but preserve energy
  };
  mono.clamp(-1.0, 1.0)
}

fn mix(a: &[f32], b: &[f32]) -> Vec<f32> {
  let min_len = a.len().min(b.len());
  if min_len == 0 {
    return Vec::new();
  }

  const MIC_GAIN: f32 = 3.0; // Higher gain for microphone input
  const LOOPBACK_GAIN: f32 = 1.5; // Moderate gain for loopback
  const OVERALL_GAIN: f32 = 1.2; // Final boost

  a.iter()
    .take(min_len)
    .zip(b.iter().take(min_len))
    .map(|(x, y)| {
      let x_clean = if x.is_finite() { *x } else { 0.0 };
      let y_clean = if y.is_finite() { *y } else { 0.0 };

      // Apply individual gains to mic (x) and loopback (y), then mix
      let mic_boosted = x_clean * MIC_GAIN;
      let loopback_boosted = y_clean * LOOPBACK_GAIN;
      let mixed = (mic_boosted + loopback_boosted) * OVERALL_GAIN;

      // Soft limiting using tanh for more natural sound than hard clipping
      if mixed.abs() > 1.0 {
        mixed.signum() * (1.0 - (-mixed.abs()).exp())
      } else {
        mixed
      }
    })
    .collect()
}

struct AudioBuffer {
  data: Vec<f32>,
}

#[napi]
pub struct AudioCaptureSession {
  mic_stream: cpal::Stream,
  lb_stream: cpal::Stream,
  stopped: Arc<AtomicBool>,
  sample_rate: SampleRate,
  channels: u32,
  jh: Option<JoinHandle<()>>, // background mixing thread
}

#[napi]
impl AudioCaptureSession {
  #[napi(getter)]
  pub fn get_sample_rate(&self) -> f64 {
    self.sample_rate.0 as f64
  }

  #[napi(getter)]
  pub fn get_channels(&self) -> u32 {
    self.channels
  }

  #[napi(getter)]
  pub fn get_actual_sample_rate(&self) -> f64 {
    // For CPAL we always operate at the target rate which is sample_rate
    self.sample_rate.0 as f64
  }

  #[napi]
  pub fn stop(&mut self) -> Result<()> {
    if self.stopped.load(Ordering::SeqCst) {
      return Ok(());
    }
    self
      .mic_stream
      .pause()
      .map_err(|e| Error::new(Status::GenericFailure, format!("{e}")))?;
    self
      .lb_stream
      .pause()
      .map_err(|e| Error::new(Status::GenericFailure, format!("{e}")))?;
    self.stopped.store(true, Ordering::SeqCst);
    if let Some(jh) = self.jh.take() {
      let _ = jh.join(); // ignore poison
    }
    Ok(())
  }
}

impl Drop for AudioCaptureSession {
  fn drop(&mut self) {
    let _ = self.stop(); // Ensure cleanup even if JS forgets to call stop()
  }
}

pub fn start_recording(audio_buffer_callback: ThreadsafeFunction<Float32Array, ()>) -> Result<AudioCaptureSession> {
  let available_hosts = cpal::available_hosts();
  let host_id = available_hosts
    .first()
    .ok_or_else(|| Error::new(Status::GenericFailure, "No CPAL hosts available"))?;

  let host = cpal::host_from_id(*host_id).map_err(|e| Error::new(Status::GenericFailure, format!("{e}")))?;

  let mic = host
    .default_input_device()
    .ok_or_else(|| Error::new(Status::GenericFailure, "No default input device"))?;
  let loopback_device = host
    .default_output_device()
    .ok_or_else(|| Error::new(Status::GenericFailure, "No default output/loopback device"))?;

  let mic_config = mic
    .default_input_config()
    .map_err(|e| Error::new(Status::GenericFailure, format!("{e}")))?;
  let lb_config = loopback_device
    .default_output_config()
    .map_err(|e| Error::new(Status::GenericFailure, format!("{e}")))?;

  let mic_sample_rate = mic_config.sample_rate();
  let lb_sample_rate = lb_config.sample_rate();
  let target_rate = SampleRate(mic_sample_rate.min(lb_sample_rate).0);

  let mic_channels = mic_config.channels();
  let lb_channels = lb_config.channels();

  // Convert supported configs to concrete StreamConfigs
  let mic_stream_config: cpal::StreamConfig = mic_config.clone().into();
  let lb_stream_config: cpal::StreamConfig = lb_config.clone().into();

  let stopped = Arc::new(AtomicBool::new(false));

  // Channels for passing raw buffers between callback and mixer thread
  let (tx_mic, rx_mic) = unbounded::<AudioBuffer>();
  let (tx_lb, rx_lb) = unbounded::<AudioBuffer>();

  // Build microphone input stream
  let mic_stream = mic
    .build_input_stream(
      &mic_stream_config,
      move |data: &[f32], _| {
        let _ = tx_mic.send(AudioBuffer { data: data.to_vec() });
      },
      |err| eprintln!("CPAL mic stream error: {err}"),
      None,
    )
    .map_err(|e| Error::new(Status::GenericFailure, format!("build_input_stream: {e}")))?;

  // Build loopback stream by creating input stream on output device (WASAPI
  // supports this)
  let lb_stream = loopback_device
    .build_input_stream(
      &lb_stream_config,
      move |data: &[f32], _| {
        let _ = tx_lb.send(AudioBuffer { data: data.to_vec() });
      },
      |err| eprintln!("CPAL loopback stream error: {err}"),
      None,
    )
    .map_err(|e| Error::new(Status::GenericFailure, format!("build_lb_stream: {e}")))?;

  let stopped_flag = stopped.clone();

  let jh = std::thread::spawn(move || {
    // Accumulators before and after resampling
    let mut pre_mic: Vec<f32> = Vec::new();
    let mut pre_lb: Vec<f32> = Vec::new();
    let mut post_mic: Vec<f32> = Vec::new();
    let mut post_lb: Vec<f32> = Vec::new();

    while !stopped_flag.load(Ordering::SeqCst) {
      // Gather input from channels
      while let Ok(buf) = rx_mic.try_recv() {
        let mono_samples: Vec<f32> = if mic_channels == 1 {
          buf.data
        } else {
          buf.data.chunks(mic_channels as usize).map(to_mono).collect()
        };
        pre_mic.extend_from_slice(&mono_samples);
      }

      while let Ok(buf) = rx_lb.try_recv() {
        let mono_samples: Vec<f32> = if lb_channels == 1 {
          buf.data
        } else {
          buf.data.chunks(lb_channels as usize).map(to_mono).collect()
        };
        pre_lb.extend_from_slice(&mono_samples);
      }

      // Resample when enough samples are available
      while pre_mic.len() >= RESAMPLER_INPUT_CHUNK {
        let to_resample: Vec<f32> = pre_mic.drain(..RESAMPLER_INPUT_CHUNK).collect();
        let processed = process_audio_with_resampler(to_resample, mic_sample_rate.0, target_rate.0);
        if !processed.is_empty() {
          post_mic.extend_from_slice(&processed);
        }
      }

      while pre_lb.len() >= RESAMPLER_INPUT_CHUNK {
        let to_resample: Vec<f32> = pre_lb.drain(..RESAMPLER_INPUT_CHUNK).collect();
        let processed = process_audio_with_resampler(to_resample, lb_sample_rate.0, target_rate.0);
        if !processed.is_empty() {
          post_lb.extend_from_slice(&processed);
        }
      }

      // Mix when we have TARGET_FRAME_SIZE samples available from both
      while post_mic.len() >= TARGET_FRAME_SIZE && post_lb.len() >= TARGET_FRAME_SIZE {
        let mic_chunk: Vec<f32> = post_mic.drain(..TARGET_FRAME_SIZE).collect();
        let lb_chunk: Vec<f32> = post_lb.drain(..TARGET_FRAME_SIZE).collect();
        let mixed = mix(&mic_chunk, &lb_chunk);
        if !mixed.is_empty() {
          let _ = audio_buffer_callback.call(Ok(mixed.clone().into()), ThreadsafeFunctionCallMode::NonBlocking);
        }
      }

      // Prevent unbounded growth – keep some slack
      const MAX_PRE: usize = RESAMPLER_INPUT_CHUNK * 10;
      if pre_mic.len() > MAX_PRE {
        pre_mic.drain(..pre_mic.len() - MAX_PRE);
      }
      if pre_lb.len() > MAX_PRE {
        pre_lb.drain(..pre_lb.len() - MAX_PRE);
      }

      const MAX_POST: usize = TARGET_FRAME_SIZE * 10;
      if post_mic.len() > MAX_POST {
        post_mic.drain(..post_mic.len() - MAX_POST);
      }
      if post_lb.len() > MAX_POST {
        post_lb.drain(..post_lb.len() - MAX_POST);
      }

      // Sleep if nothing to do
      if rx_mic.is_empty()
        && rx_lb.is_empty()
        && post_mic.len() < TARGET_FRAME_SIZE
        && post_lb.len() < TARGET_FRAME_SIZE
      {
        std::thread::sleep(std::time::Duration::from_millis(1));
      }
    }
  });

  mic_stream
    .play()
    .map_err(|e| Error::new(Status::GenericFailure, format!("{e}")))?;
  lb_stream
    .play()
    .map_err(|e| Error::new(Status::GenericFailure, format!("{e}")))?;

  Ok(AudioCaptureSession {
    mic_stream,
    lb_stream,
    stopped,
    sample_rate: target_rate,
    channels: 1, // mono output
    jh: Some(jh),
  })
}
