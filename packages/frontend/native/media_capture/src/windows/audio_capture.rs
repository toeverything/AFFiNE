use std::{
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
use napi::{Error, Status, bindgen_prelude::Result};
use napi_derive::napi;
use rubato::{FastFixedIn, PolynomialDegree, Resampler};

use crate::audio_callback::AudioCallback;

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

  fn append_output(&mut self, out_blocks: &[Vec<f32>], interleaved_out: &mut Vec<f32>, final_flush: bool) {
    if out_blocks.is_empty() || out_blocks.len() != self.channels {
      return;
    }

    if !self.initial_output_discarded && !final_flush {
      self.initial_output_discarded = true;
      return;
    }

    self.initial_output_discarded = true;
    let out_len = out_blocks[0].len();
    for i in 0..out_len {
      for channel in out_blocks.iter().take(self.channels) {
        interleaved_out.push(channel[i]);
      }
    }
  }

  fn process_chunk(&mut self, chunk: Vec<Vec<f32>>, interleaved_out: &mut Vec<f32>, final_flush: bool) {
    if let Ok(out_blocks) = self.resampler.process(&chunk, None) {
      self.append_output(&out_blocks, interleaved_out, final_flush);
    }
  }

  // Feed planar samples; returns interleaved output (may be empty)
  fn feed(&mut self, planar_in: &[Vec<f32>]) -> Vec<f32> {
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

      self.process_chunk(chunk, &mut interleaved_out, false);
    }

    interleaved_out
  }

  fn finish(&mut self) -> Vec<f32> {
    let mut interleaved_out = Vec::new();
    if self.fifo.first().is_none_or(|channel| channel.is_empty()) {
      return interleaved_out;
    }

    let mut chunk: Vec<Vec<f32>> = Vec::with_capacity(self.channels);
    for ch in 0..self.channels {
      let mut tail = std::mem::take(&mut self.fifo[ch]);
      tail.resize(RESAMPLER_INPUT_CHUNK, 0.0);
      chunk.push(tail);
    }
    self.process_chunk(chunk, &mut interleaved_out, true);
    interleaved_out
  }
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

fn extend_post_buffer(post_buffer: &mut Vec<f32>, mono_samples: Vec<f32>, resampler: &mut Option<BufferedResampler>) {
  if let Some(resampler) = resampler.as_mut() {
    post_buffer.extend(resampler.feed(&[mono_samples]));
  } else {
    post_buffer.extend(mono_samples);
  }
}

fn emit_mixed_frames(
  post_mic: &mut Vec<f32>,
  post_lb: &mut Vec<f32>,
  audio_buffer_callback: &AudioCallback,
  final_flush: bool,
) {
  while post_mic.len() >= TARGET_FRAME_SIZE && post_lb.len() >= TARGET_FRAME_SIZE {
    let mic_chunk: Vec<f32> = post_mic.drain(..TARGET_FRAME_SIZE).collect();
    let lb_chunk: Vec<f32> = post_lb.drain(..TARGET_FRAME_SIZE).collect();
    let mixed = mix(&mic_chunk, &lb_chunk);
    if !mixed.is_empty() {
      audio_buffer_callback.call(mixed);
    }
  }

  if final_flush && !post_mic.is_empty() && !post_lb.is_empty() {
    let tail_len = post_mic.len().min(post_lb.len());
    let mic_chunk: Vec<f32> = post_mic.drain(..tail_len).collect();
    let lb_chunk: Vec<f32> = post_lb.drain(..tail_len).collect();
    let mixed = mix(&mic_chunk, &lb_chunk);
    if !mixed.is_empty() {
      audio_buffer_callback.call(mixed);
    }
    post_mic.clear();
    post_lb.clear();
  }
}

#[napi]
pub struct AudioCaptureSession {
  mic_stream: Option<cpal::Stream>,
  lb_stream: Option<cpal::Stream>,
  stop_requested: Arc<AtomicBool>,
  sample_rate: SampleRate,
  channels: u32,
  jh: Option<JoinHandle<()>>, // background mixing thread
}

fn teardown_audio_capture_resources<S, F>(
  mic_stream: &mut Option<S>,
  lb_stream: &mut Option<S>,
  stop_requested: &Arc<AtomicBool>,
  jh: &mut Option<JoinHandle<()>>,
  pause_stream: F,
) -> Result<()>
where
  F: Fn(&S) -> std::result::Result<(), String>,
{
  if mic_stream.is_none() && lb_stream.is_none() && jh.is_none() {
    return Ok(());
  }

  let mic_stream = mic_stream.take();
  let lb_stream = lb_stream.take();
  let jh = jh.take();

  let mut pause_errors = Vec::new();

  if let Some(stream) = mic_stream.as_ref() {
    if let Err(error) = pause_stream(stream) {
      pause_errors.push(format!("pause mic stream: {error}"));
    }
  }

  if let Some(stream) = lb_stream.as_ref() {
    if let Err(error) = pause_stream(stream) {
      pause_errors.push(format!("pause loopback stream: {error}"));
    }
  }

  stop_requested.store(true, Ordering::SeqCst);

  drop(mic_stream);
  drop(lb_stream);

  if let Some(jh) = jh {
    let _ = jh.join(); // ignore poison
  }

  if pause_errors.is_empty() {
    Ok(())
  } else {
    Err(Error::new(Status::GenericFailure, pause_errors.join("; ")))
  }
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
    teardown_audio_capture_resources(
      &mut self.mic_stream,
      &mut self.lb_stream,
      &self.stop_requested,
      &mut self.jh,
      |stream| stream.pause().map_err(|error| error.to_string()),
    )
  }
}

impl Drop for AudioCaptureSession {
  fn drop(&mut self) {
    let _ = self.stop(); // Ensure cleanup even if JS forgets to call stop()
  }
}

pub fn start_recording(
  audio_buffer_callback: AudioCallback,
  target_sample_rate: Option<SampleRate>,
) -> Result<AudioCaptureSession> {
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
  let target_rate = target_sample_rate.unwrap_or(SampleRate(mic_sample_rate.min(lb_sample_rate).0));

  let mic_channels = mic_config.channels();
  let lb_channels = lb_config.channels();

  // Convert supported configs to concrete StreamConfigs
  let mic_stream_config: cpal::StreamConfig = mic_config.clone().into();
  let lb_stream_config: cpal::StreamConfig = lb_config.clone().into();

  let stop_requested = Arc::new(AtomicBool::new(false));

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

  let stop_requested_flag = stop_requested.clone();

  let jh = std::thread::spawn(move || {
    let mut post_mic: Vec<f32> = Vec::new();
    let mut post_lb: Vec<f32> = Vec::new();
    let mut mic_resampler = (mic_sample_rate != target_rate)
      .then(|| BufferedResampler::new(mic_sample_rate.0 as f64, target_rate.0 as f64, 1));
    let mut lb_resampler =
      (lb_sample_rate != target_rate).then(|| BufferedResampler::new(lb_sample_rate.0 as f64, target_rate.0 as f64, 1));
    let mut flushed_tail = false;

    loop {
      while let Ok(buf) = rx_mic.try_recv() {
        let mono_samples: Vec<f32> = if mic_channels == 1 {
          buf.data
        } else {
          buf.data.chunks(mic_channels as usize).map(to_mono).collect()
        };
        extend_post_buffer(&mut post_mic, mono_samples, &mut mic_resampler);
      }

      while let Ok(buf) = rx_lb.try_recv() {
        let mono_samples: Vec<f32> = if lb_channels == 1 {
          buf.data
        } else {
          buf.data.chunks(lb_channels as usize).map(to_mono).collect()
        };
        extend_post_buffer(&mut post_lb, mono_samples, &mut lb_resampler);
      }

      emit_mixed_frames(&mut post_mic, &mut post_lb, &audio_buffer_callback, false);

      const MAX_POST: usize = TARGET_FRAME_SIZE * 10;
      if post_mic.len() > MAX_POST {
        post_mic.drain(..post_mic.len() - MAX_POST);
      }
      if post_lb.len() > MAX_POST {
        post_lb.drain(..post_lb.len() - MAX_POST);
      }

      let stop_requested = stop_requested_flag.load(Ordering::SeqCst);
      if stop_requested && !flushed_tail && rx_mic.is_empty() && rx_lb.is_empty() {
        if let Some(mut resampler) = mic_resampler.take() {
          post_mic.extend(resampler.finish());
        }
        if let Some(mut resampler) = lb_resampler.take() {
          post_lb.extend(resampler.finish());
        }
        emit_mixed_frames(&mut post_mic, &mut post_lb, &audio_buffer_callback, true);
        flushed_tail = true;
      }

      if stop_requested && flushed_tail && rx_mic.is_empty() && rx_lb.is_empty() {
        break;
      }

      if !stop_requested
        && rx_mic.is_empty()
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
    mic_stream: Some(mic_stream),
    lb_stream: Some(lb_stream),
    stop_requested,
    sample_rate: target_rate,
    channels: 1, // mono output
    jh: Some(jh),
  })
}

#[cfg(test)]
mod tests {
  use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
  };

  use super::teardown_audio_capture_resources;

  #[test]
  fn teardown_consumes_resources_even_when_pause_fails() {
    let mut mic_stream = Some("mic");
    let mut lb_stream = Some("loopback");
    let stop_requested = Arc::new(AtomicBool::new(false));
    let joined = Arc::new(AtomicBool::new(false));
    let joined_flag = joined.clone();
    let mut jh = Some(std::thread::spawn(move || {
      joined_flag.store(true, Ordering::SeqCst);
    }));

    let result = teardown_audio_capture_resources(&mut mic_stream, &mut lb_stream, &stop_requested, &mut jh, |_| {
      Err("pause failed".to_owned())
    });

    assert!(result.is_err());
    assert!(stop_requested.load(Ordering::SeqCst));
    assert!(mic_stream.is_none());
    assert!(lb_stream.is_none());
    assert!(jh.is_none());
    assert!(joined.load(Ordering::SeqCst));
  }

  #[test]
  fn teardown_is_idempotent_after_resources_are_consumed() {
    let mut mic_stream: Option<&'static str> = None;
    let mut lb_stream: Option<&'static str> = None;
    let stop_requested = Arc::new(AtomicBool::new(true));
    let mut jh = None;

    let result = teardown_audio_capture_resources(
      &mut mic_stream,
      &mut lb_stream,
      &stop_requested,
      &mut jh,
      |_| -> std::result::Result<(), String> { panic!("pause should not be called when resources are already gone") },
    );

    assert!(result.is_ok());
  }
}
