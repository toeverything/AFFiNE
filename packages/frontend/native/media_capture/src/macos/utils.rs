use std::{ffi::c_void, mem::size_of};

use core_foundation::string::CFString;
use coreaudio::sys::{
  kAudioObjectPropertyElementMain, kAudioObjectPropertyScopeGlobal, AudioObjectGetPropertyData,
  AudioObjectID, AudioObjectPropertyAddress,
};
use rubato::{Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType};

use crate::error::CoreAudioError;

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

  let processed_samples = if channel_count > 1 {
    // For stereo, samples are interleaved: [L, R, L, R, ...]
    // We need to average each pair to get mono
    samples
      .chunks(channel_count)
      .map(|chunk| chunk.iter().sum::<f32>() / channel_count as f32)
      .collect()
  } else {
    // For mono, just copy the samples
    samples.to_vec()
  };

  if current_sample_rate != target_sample_rate {
    let params = SincInterpolationParameters {
      sinc_len: 256,
      f_cutoff: 0.95,
      interpolation: SincInterpolationType::Linear,
      oversampling_factor: 256,
      window: rubato::WindowFunction::BlackmanHarris2,
    };
    let mut resampler = SincFixedIn::<f32>::new(
      target_sample_rate / current_sample_rate,
      2.0,
      params,
      processed_samples.len(),
      1,
    )
    .ok()?;
    let mut waves_out = resampler.process(&[processed_samples], None).ok()?;
    waves_out.pop()
  } else {
    Some(processed_samples)
  }
}
