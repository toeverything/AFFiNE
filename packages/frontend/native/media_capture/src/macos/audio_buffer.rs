use std::ffi::c_void;

use coreaudio::sys::kAudioHardwareBadStreamError;
use objc2::{Encode, Encoding, RefEncode};

use crate::{error::CoreAudioError, utils::process_audio_frame};

/// [Apple's documentation](https://developer.apple.com/documentation/coreaudiotypes/audiobuffer?language=objc)
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
#[allow(non_snake_case)]
pub struct AudioBuffer {
  pub mNumberChannels: u32,
  pub mDataByteSize: u32,
  pub mData: *mut c_void,
}

unsafe impl Encode for AudioBuffer {
  const ENCODING: Encoding = Encoding::Struct(
    "AudioBuffer",
    &[<u32>::ENCODING, <u32>::ENCODING, <*mut c_void>::ENCODING],
  );
}

unsafe impl RefEncode for AudioBuffer {
  const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
}

#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
#[allow(non_snake_case)]
pub struct AudioBufferList {
  pub mNumberBuffers: u32,
  pub mBuffers: [AudioBuffer; 2],
}

unsafe impl Encode for AudioBufferList {
  const ENCODING: Encoding = Encoding::Struct(
    "AudioBufferList",
    &[<u32>::ENCODING, <[AudioBuffer; 1]>::ENCODING],
  );
}

unsafe impl RefEncode for AudioBufferList {
  const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
}

/// Represent the audio buffer contains input and output PCM buffers
#[repr(transparent)]
pub struct InputAndOutputAudioBufferList(pub AudioBufferList);

impl InputAndOutputAudioBufferList {
  pub unsafe fn from_raw(in_input_data: *mut c_void) -> Result<Self, i32> {
    let buffer_list: AudioBufferList = unsafe { *in_input_data.cast() };
    if buffer_list.mNumberBuffers != 2 {
      return Err(kAudioHardwareBadStreamError as i32);
    }
    Ok(Self(buffer_list))
  }

  pub fn mix_input_and_output(
    &self,
    target_sample_rate: f64,
    input_sample_rate: f64,
    output_sample_rate: f64,
  ) -> Result<Vec<f32>, CoreAudioError> {
    let [AudioBuffer {
      mData: m_data_input,
      mNumberChannels: m_number_channels_input,
      mDataByteSize: m_data_byte_size_input,
    }, AudioBuffer {
      mData: m_data_output,
      mNumberChannels: m_number_channels_output,
      mDataByteSize: m_data_byte_size_output,
    }] = self.0.mBuffers;
    let Some(processed_samples_input) = process_audio_frame(
      m_data_input,
      m_data_byte_size_input,
      m_number_channels_input,
      input_sample_rate,
      target_sample_rate,
    ) else {
      return Err(CoreAudioError::ProcessAudioFrameFailed("input"));
    };

    let Some(processed_samples_output) = process_audio_frame(
      m_data_output,
      m_data_byte_size_output,
      m_number_channels_output,
      output_sample_rate,
      target_sample_rate,
    ) else {
      return Err(CoreAudioError::ProcessAudioFrameFailed("output"));
    };

    let mixed_samples_length = processed_samples_input
      .len()
      .max(processed_samples_output.len());

    let mut mixed_samples = vec![0.0; mixed_samples_length];

    for (sample_index, mixed_sample) in mixed_samples.iter_mut().enumerate() {
      let sample_in = processed_samples_input.get(sample_index).unwrap_or(&0.0);
      let sample_out = processed_samples_output.get(sample_index).unwrap_or(&0.0);

      *mixed_sample = (sample_in + sample_out) / 2.0;
    }

    Ok(mixed_samples)
  }
}
