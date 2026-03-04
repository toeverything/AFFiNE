use std::{cell::RefCell, collections::HashMap, ffi::c_void, mem::size_of};

use core_foundation::string::CFString;
use coreaudio::sys::{
  AudioObjectGetPropertyData, AudioObjectID, AudioObjectPropertyAddress, kAudioObjectPropertyElementMain,
  kAudioObjectPropertyScopeGlobal,
};
use rubato::{FastFixedIn, PolynomialDegree, Resampler};

use crate::error::CoreAudioError;

// ------------------------------------------------------------
// A simple wrapper that buffers incoming planar frames so that we always feed
// the Rubato resampler its preferred fixed block-length. This avoids the
// artefacts caused by recreating the resampler every callback.
// ------------------------------------------------------------

const RESAMPLER_INPUT_CHUNK: usize = 1024; // samples per channel

struct BufferedResampler {
  resampler: FastFixedIn<f32>,
  channels: usize,
  fifo: Vec<Vec<f32>>,            // per-channel queue
  initial_output_discarded: bool, // Flag to track if the first output has been discarded
}

impl BufferedResampler {
  fn new(from_sr: f64, to_sr: f64, channels: usize) -> Self {
    let ratio = to_sr / from_sr;
    let resampler = FastFixedIn::<f32>::new(
      ratio,
      1.0,                      // max_resample_ratio_relative (must be >= 1.0, use 1.0 for fixed ratio)
      PolynomialDegree::Linear, // Use Linear interpolation quality
      RESAMPLER_INPUT_CHUNK,
      channels,
    )
    .expect("Failed to create FastFixedIn resampler (5-arg attempt)");

    BufferedResampler {
      resampler,
      channels,
      fifo: vec![Vec::<f32>::new(); channels],
      initial_output_discarded: false,
    }
  }

  // feed planar samples; returns interleaved output (may be empty if not
  // enough samples accumulated yet).
  fn feed(&mut self, planar_in: &[Vec<f32>]) -> Vec<f32> {
    // Append incoming to fifo
    for (ch, data) in planar_in.iter().enumerate() {
      self.fifo[ch].extend_from_slice(data);
    }

    let mut interleaved_out: Vec<f32> = Vec::new();

    while self.fifo[0].len() >= RESAMPLER_INPUT_CHUNK {
      // Drain exactly one chunk per channel
      let mut chunk: Vec<Vec<f32>> = Vec::with_capacity(self.channels);
      for ch in 0..self.channels {
        let tail = self.fifo[ch].drain(..RESAMPLER_INPUT_CHUNK).collect::<Vec<_>>();
        chunk.push(tail);
      }

      if let Ok(out_blocks) = self.resampler.process(&chunk, None) {
        // out_blocks is Vec<Vec<f32>> planar
        if !out_blocks.is_empty() && out_blocks.len() == self.channels {
          // Check if we should discard the initial output
          if !self.initial_output_discarded {
            self.initial_output_discarded = true;
          } else {
            // interleave
            let out_len = out_blocks[0].len();
            #[allow(clippy::needless_range_loop)]
            for i in 0..out_len {
              // apply clippy lint suggestion would regress performance
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

// thread-local cache so that each audio‐tap thread keeps its own resamplers
thread_local! {
  static RESAMPLER_CACHE: RefCell<HashMap<(u32,u32,usize), BufferedResampler>> = RefCell::new(HashMap::new());
}

pub fn cfstring_from_bytes_with_nul(bytes: &[u8]) -> CFString {
  CFString::new(
    unsafe { std::ffi::CStr::from_bytes_with_nul_unchecked(bytes) }
      .to_string_lossy()
      .as_ref(),
  )
}

pub fn get_global_main_property<T: Sized>(
  id: AudioObjectID,
  selector: u32,
  data: *mut T,
) -> Result<(), CoreAudioError> {
  unsafe {
    let address = AudioObjectPropertyAddress {
      mSelector: selector,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain,
    };

    let mut data_size = size_of::<T>() as u32;

    let status = AudioObjectGetPropertyData(
      id,
      &address as *const AudioObjectPropertyAddress,
      0,
      std::ptr::null(),
      &mut data_size,
      data.cast(),
    );

    if status != 0 {
      return Err(CoreAudioError::GetPropertyDataFailed(status));
    }

    Ok(())
  }
}

pub fn process_audio_frame(
  m_data: *mut c_void,
  m_data_byte_size: u32,
  m_number_channels: u32,
  current_sample_rate: f64,
  target_sample_rate: f64,
) -> Option<Vec<f32>> {
  // Only create slice if we have valid data

  if m_data.is_null() || m_data_byte_size == 0 {
    return None;
  }
  // Calculate total number of samples (total bytes / bytes per sample)
  let total_samples = m_data_byte_size as usize / 4; // 4 bytes per f32

  // Create a slice of all samples
  let samples: &[f32] = unsafe { std::slice::from_raw_parts(m_data.cast::<f32>(), total_samples) };

  // Check the channel count and data format
  let channel_count = m_number_channels as usize;

  // If the audio has two or more channels, keep (at most) the first two channels
  // and return them in interleaved stereo format. Otherwise keep mono as-is.

  let interleaved_samples: Vec<f32> = if channel_count >= 2 {
    // Split interleaved input into the first two channels (L, R)
    let mut left: Vec<f32> = Vec::with_capacity(total_samples / channel_count);
    let mut right: Vec<f32> = Vec::with_capacity(total_samples / channel_count);

    for chunk in samples.chunks(channel_count) {
      // SAFETY: chunk has at least 2 items because channel_count >= 2
      left.push(chunk[0]);
      right.push(chunk[1]);
    }

    if current_sample_rate != target_sample_rate {
      // Use (or create) a persistent BufferedResampler

      RESAMPLER_CACHE.with(|cache| {
        let mut map = cache.borrow_mut();
        let key = (current_sample_rate as u32, target_sample_rate as u32, 2usize);
        let resampler = map
          .entry(key)
          .or_insert_with(|| BufferedResampler::new(current_sample_rate, target_sample_rate, 2));
        resampler.feed(&[left, right])
      })
    } else {
      // No resampling needed, just interleave existing left/right data
      let mut interleaved: Vec<f32> = Vec::with_capacity(left.len() * 2);
      for i in 0..left.len() {
        interleaved.push(left[i]);
        interleaved.push(right[i]);
      }

      interleaved
    }
  } else {
    // Mono path – behave as before (optionally resample)
    let mut mono_samples = samples.to_vec();

    if current_sample_rate != target_sample_rate {
      let out_vec = RESAMPLER_CACHE.with(|cache| {
        let mut map = cache.borrow_mut();
        let key = (current_sample_rate as u32, target_sample_rate as u32, 1usize);
        let resampler = map
          .entry(key)
          .or_insert_with(|| BufferedResampler::new(current_sample_rate, target_sample_rate, 1));
        resampler.feed(&[mono_samples])
      });
      // resampler returns interleaved (1 channel) but we still need planar mono
      // (vector of samples) before upmix; since feed returns interleaved single
      // channel, it is planar already.
      mono_samples = out_vec;
    }

    // Upmix mono to stereo by duplicating each sample so that mixing with
    // interleaved stereo streams keeps channel counts aligned.
    let mut stereo_samples: Vec<f32> = Vec::with_capacity(mono_samples.len() * 2);
    for s in &mono_samples {
      stereo_samples.push(*s);
      stereo_samples.push(*s);
    }

    stereo_samples
  };

  if interleaved_samples.is_empty() {
    None
  } else {
    Some(interleaved_samples)
  }
}
