use std::{cmp::Ordering, ffi::c_void};

use coreaudio::sys::kAudioHardwareBadStreamError;
use objc2::{Encode, Encoding, RefEncode};

use crate::{error::CoreAudioError, utils::process_audio_frame};

pub const AUDIO_MIX_OUTPUT_WEIGHT: f32 = 0.75;

/// Mix audio samples using scalar operations (no SIMD)
///
/// # Arguments
/// * `input_samples` - Samples from the input stream
/// * `output_samples` - Samples from the output stream
/// * `mixed_samples` - Buffer to store the result (must be pre-allocated)
/// * `start_index` - Starting index in the buffers
/// * `end_index` - Ending index in the buffers (exclusive)
pub fn mix_audio_samples_scalar(
  input_samples: &[f32],
  output_samples: &[f32],
  mixed_samples: &mut [f32],
  start_index: usize,
  end_index: usize,
) {
  // performance downgraded 4x if apply suggestion from this lint rule
  #[allow(clippy::needless_range_loop)]
  for sample_index in start_index..end_index {
    let sample_in = input_samples.get(sample_index).unwrap_or(&0.0);
    let sample_out = output_samples.get(sample_index).unwrap_or(&0.0);
    mixed_samples[sample_index] = sample_in + sample_out * AUDIO_MIX_OUTPUT_WEIGHT;
  }
}

/// Mix audio samples from input and output streams with specified weights
/// Uses NEON SIMD acceleration on supported platforms
///
/// # Arguments
/// * `input_samples` - Samples from the input stream
/// * `output_samples` - Samples from the output stream
///
/// # Returns
/// A vector of mixed audio samples
pub fn mix_audio_samples(input_samples: &[f32], output_samples: &[f32]) -> Vec<f32> {
  let mixed_samples_length = input_samples.len();
  let mut mixed_samples = vec![0.0; mixed_samples_length];

  // For very small arrays, use scalar implementation
  if mixed_samples_length < 16 {
    mix_audio_samples_scalar(
      input_samples,
      output_samples,
      &mut mixed_samples,
      0,
      mixed_samples_length,
    );
    return mixed_samples;
  }

  #[cfg(any(target_arch = "aarch64", target_arch = "arm"))]
  unsafe {
    use std::arch::aarch64::{vdupq_n_f32, vld1q_f32, vmlaq_f32, vst1q_f32};

    let output_weight_vec = vdupq_n_f32(AUDIO_MIX_OUTPUT_WEIGHT);
    // Process the common length where both arrays have data
    let common_length = input_samples.len();

    // Main SIMD loop - process each block of 4 samples
    let input_ptr = input_samples.as_ptr();
    let output_ptr = output_samples.as_ptr();
    let result_ptr = mixed_samples.as_mut_ptr();

    let mut offset: usize = 0;
    let mut remaining_offset: Option<usize> = None;

    // Process 16 samples at a time (4 SIMD vectors)
    while offset < common_length {
      // Load 4 vectors of 4 floats each
      let in_vec1 = vld1q_f32(input_ptr.add(offset));
      let out_vec1 = vld1q_f32(output_ptr.add(offset));
      let in_vec2 = vld1q_f32(input_ptr.add(offset + 4));
      let out_vec2 = vld1q_f32(output_ptr.add(offset + 4));
      let in_vec3 = vld1q_f32(input_ptr.add(offset + 8));
      let out_vec3 = vld1q_f32(output_ptr.add(offset + 8));
      let in_vec4 = vld1q_f32(input_ptr.add(offset + 12));
      let out_vec4 = vld1q_f32(output_ptr.add(offset + 12));

      // Using fused multiply-add: (a * b) + c in one operation
      // First multiply input by weight
      let result1 = vmlaq_f32(in_vec1, out_vec1, output_weight_vec);
      let result2 = vmlaq_f32(in_vec2, out_vec2, output_weight_vec);
      let result3 = vmlaq_f32(in_vec3, out_vec3, output_weight_vec);

      let result4 = vmlaq_f32(in_vec4, out_vec4, output_weight_vec);

      // Store results
      vst1q_f32(result_ptr.add(offset), result1);
      vst1q_f32(result_ptr.add(offset + 4), result2);
      vst1q_f32(result_ptr.add(offset + 8), result3);
      vst1q_f32(result_ptr.add(offset + 12), result4);
      offset += 16;
      // accept clippy lint suggestion would downgrade the performance by 15%
      #[allow(clippy::comparison_chain)]
      // fast path for aligned length
      if offset == common_length {
        break;
      } else if offset > common_length {
        remaining_offset = Some(offset - 16);
      } else {
        let remaining = common_length - offset;
        if remaining < 16 {
          remaining_offset = Some(offset);
          break;
        }
      }
    }

    if let Some(remaining_offset) = remaining_offset {
      mix_audio_samples_scalar(
        input_samples,
        output_samples,
        &mut mixed_samples,
        remaining_offset,
        common_length,
      );
    }
  }

  #[cfg(not(any(target_arch = "aarch64", target_arch = "arm")))]
  {
    // Fallback for non-ARM architectures
    mix_audio_samples_scalar(
      input_samples,
      output_samples,
      &mut mixed_samples,
      0,
      mixed_samples_length,
    );
  }

  mixed_samples
}

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
  const ENCODING: Encoding = Encoding::Struct("AudioBufferList", &[<u32>::ENCODING, <[AudioBuffer; 1]>::ENCODING]);
}

unsafe impl RefEncode for AudioBufferList {
  const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
}

/// Represent the audio buffer contains input and output PCM buffers
#[repr(transparent)]
pub struct InputAndOutputAudioBufferList(pub AudioBufferList);

impl InputAndOutputAudioBufferList {
  /// # Safety
  ///
  /// The caller must ensure that the input data is a valid AudioBufferList
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
    let mut mixed_samples = Vec::new();

    // Directly access buffers from the list
    let [input_buffer, output_buffer] = self.0.mBuffers;

    if let Some(processed_input) = process_audio_frame(
      input_buffer.mData,
      input_buffer.mDataByteSize,
      input_buffer.mNumberChannels,
      input_sample_rate,
      target_sample_rate,
    ) {
      mixed_samples = processed_input;
    }

    if let Some(processed_output) = process_audio_frame(
      output_buffer.mData,
      output_buffer.mDataByteSize,
      output_buffer.mNumberChannels,
      output_sample_rate,
      target_sample_rate,
    ) {
      if mixed_samples.is_empty() {
        mixed_samples = processed_output;
      } else {
        let len1 = mixed_samples.len();
        let len2 = processed_output.len();
        match len1.cmp(&len2) {
          Ordering::Less => {
            mixed_samples.resize(len2, 0.0);
          }
          Ordering::Greater => {
            let mut padded_output = processed_output;
            padded_output.resize(len1, 0.0);
            for (sample1, sample2) in mixed_samples.iter_mut().zip(padded_output.iter()) {
              *sample1 = (*sample1 + *sample2) / 2.0;
            }
            return Ok(mixed_samples);
          }
          _ => {}
        }

        for (sample1, sample2) in mixed_samples.iter_mut().zip(processed_output.iter()) {
          *sample1 = (*sample1 + *sample2) / 2.0;
        }
      }
    }

    Ok(mixed_samples)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_mix_audio_samples_empty() {
    let input: Vec<f32> = vec![];
    let output: Vec<f32> = vec![];
    let mixed = mix_audio_samples(&input, &output);
    assert_eq!(mixed.len(), 0);
  }

  #[test]
  fn test_mix_audio_samples_equal_length() {
    let input = vec![0.1, 0.2, 0.3, 0.4, 0.5];
    let output = vec![0.5, 0.4, 0.3, 0.2, 0.1];
    let mixed = mix_audio_samples(&input, &output);

    assert_eq!(mixed.len(), 5);

    // Verify calculations: (input + output * 0.75)
    let expected = [
      (0.1 + 0.5 * AUDIO_MIX_OUTPUT_WEIGHT),
      (0.2 + 0.4 * AUDIO_MIX_OUTPUT_WEIGHT),
      (0.3 + 0.3 * AUDIO_MIX_OUTPUT_WEIGHT),
      (0.4 + 0.2 * AUDIO_MIX_OUTPUT_WEIGHT),
      (0.5 + 0.1 * AUDIO_MIX_OUTPUT_WEIGHT),
    ];

    for i in 0..mixed.len() {
      assert!(
        (mixed[i] - expected[i]).abs() < 1e-6,
        "Mismatch at index {}: expected {}, got {}",
        i,
        expected[i],
        mixed[i]
      );
    }
  }

  #[test]
  fn test_mix_audio_samples_input_longer() {
    let input = vec![0.1, 0.2, 0.3, 0.4, 0.5];
    let output = vec![0.5, 0.4, 0.3];
    let mixed = mix_audio_samples(&input, &output);

    assert_eq!(mixed.len(), 5);

    // Verify calculations
    let expected = [
      (0.1 + 0.5 * AUDIO_MIX_OUTPUT_WEIGHT),
      (0.2 + 0.4 * AUDIO_MIX_OUTPUT_WEIGHT),
      (0.3 + 0.3 * AUDIO_MIX_OUTPUT_WEIGHT),
      (0.4 + 0.0 * AUDIO_MIX_OUTPUT_WEIGHT),
      (0.5 + 0.0 * AUDIO_MIX_OUTPUT_WEIGHT),
    ];

    for i in 0..mixed.len() {
      assert!(
        (mixed[i] - expected[i]).abs() < 1e-6,
        "Mismatch at index {}: expected {}, got {}",
        i,
        expected[i],
        mixed[i]
      );
    }
  }

  #[test]
  fn test_mix_audio_samples_custom_weights() {
    // Note: We're using the constant weights so we can't really test custom values
    // directly
    let input = vec![0.1, 0.2, 0.3];
    let output = vec![0.5, 0.4, 0.3];
    let mixed = mix_audio_samples(&input, &output);

    // Calculate expected values based on the constants
    let expected = [
      (0.1 + 0.5 * AUDIO_MIX_OUTPUT_WEIGHT),
      (0.2 + 0.4 * AUDIO_MIX_OUTPUT_WEIGHT),
      (0.3 + 0.3 * AUDIO_MIX_OUTPUT_WEIGHT),
    ];

    for i in 0..mixed.len() {
      assert!(
        (mixed[i] - expected[i]).abs() < 1e-6,
        "Mismatch at index {}: expected {}, got {}",
        i,
        expected[i],
        mixed[i]
      );
    }
  }

  #[cfg(any(target_arch = "aarch64", target_arch = "arm"))]
  #[test]
  fn test_simd_implementation_used() {
    const BUFFER_SIZES: [usize; 4] = [100, 127, 128, 512];
    for size in BUFFER_SIZES {
      // Create arrays large enough to trigger SIMD path
      let input: Vec<f32> = (0..size).map(|i| i as f32 * 0.01).collect();
      let output: Vec<f32> = (0..size).map(|i| (size - i) as f32 * 0.01).collect();

      // Mix with standard weights
      let mixed = mix_audio_samples(&input, &output);

      // Compute the same mix using scalar implementation for comparison
      let mut expected = vec![0.0; input.len()];
      mix_audio_samples_scalar(&input, &output, &mut expected, 0, input.len());

      // Verify results match between SIMD and scalar implementations
      for i in 0..mixed.len() {
        assert!(
          (mixed[i] - expected[i]).abs() < 1e-6,
          "SIMD and scalar implementations should produce identical results at index {}",
          i
        );
      }
    }
  }

  #[test]
  fn test_small_vector_uses_scalar() {
    // Create small arrays that should use scalar path even with SIMD available
    let input = vec![0.1, 0.2, 0.3];
    let output = vec![0.5, 0.4, 0.3];

    // Mix with standard weights
    let mixed = mix_audio_samples(&input, &output);

    // Calculate expected values manually
    let expected = [
      (0.1 + 0.5 * AUDIO_MIX_OUTPUT_WEIGHT),
      (0.2 + 0.4 * AUDIO_MIX_OUTPUT_WEIGHT),
      (0.3 + 0.3 * AUDIO_MIX_OUTPUT_WEIGHT),
    ];

    // Verify results
    for i in 0..mixed.len() {
      assert!(
        (mixed[i] - expected[i]).abs() < 1e-6,
        "Small vector mixing should be correct at index {}",
        i
      );
    }
  }
}
