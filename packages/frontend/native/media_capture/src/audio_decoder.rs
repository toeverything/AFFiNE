use std::{io::Cursor, path::Path};

use napi::{
  Task,
  bindgen_prelude::{AbortSignal, AsyncTask, Float32Array, Result, Status, Uint8Array},
};
use napi_derive::napi;
use rubato::{Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType};
use symphonia::core::{
  audio::{AudioBuffer, Signal},
  codecs::DecoderOptions,
  errors::Error,
  formats::FormatOptions,
  io::MediaSourceStream,
  meta::MetadataOptions,
  probe::Hint,
};

fn decode<B: AsRef<[u8]> + Send + Sync + 'static>(
  buf: B,
  dest_sample_rate: Option<u32>,
  filename: Option<&str>,
) -> std::result::Result<Vec<f32>, Error> {
  // Create the media source
  let mss = MediaSourceStream::new(Box::new(Cursor::new(buf)), Default::default());

  // Create a probe hint using the file extension
  let mut hint = Hint::new();
  if let Some(ext) = filename.and_then(|filename| Path::new(filename).extension().and_then(|ext| ext.to_str())) {
    hint.with_extension(ext);
  }

  let format_opts = FormatOptions {
    enable_gapless: true,
    ..Default::default()
  };
  let metadata_opts = MetadataOptions::default();
  let decoder_opts = DecoderOptions::default();
  let probed = symphonia::default::get_probe().format(&hint, mss, &format_opts, &metadata_opts)?;

  let mut format = probed.format;

  let track = format
    .default_track()
    .ok_or(Error::Unsupported("No default track found"))?;

  let totol_samples = track
    .codec_params
    .n_frames
    .ok_or(Error::Unsupported("No duration found"))?;
  let sample_rate = track
    .codec_params
    .sample_rate
    .ok_or(Error::Unsupported("No samplerate found"))?;

  let mut decoder = symphonia::default::get_codecs().make(&track.codec_params, &decoder_opts)?;

  let mut output: Vec<f32> = Vec::with_capacity(totol_samples as usize);
  // Decode loop
  while let Ok(packet) = format.next_packet() {
    let decoded = decoder.decode(&packet)?;
    let spec = decoded.spec();
    let mut audio_buf: AudioBuffer<f32> = AudioBuffer::new(decoded.capacity() as u64, *spec);
    decoded.convert(&mut audio_buf);

    if spec.channels.count() > 1 {
      // Mix all channels into mono
      for i in 0..audio_buf.chan(0).len() {
        let mut sample_sum = 0.0;
        for ch in 0..spec.channels.count() {
          sample_sum += audio_buf.chan(ch)[i];
        }
        output.push(sample_sum / spec.channels.count() as f32);
      }
    } else {
      output.extend_from_slice(audio_buf.chan(0));
    }
  }

  let Some(dest_sample_rate) = dest_sample_rate else {
    return Ok(output);
  };

  if sample_rate != dest_sample_rate {
    // Calculate parameters for resampling
    let params = SincInterpolationParameters {
      sinc_len: 256,
      f_cutoff: 0.95,
      interpolation: SincInterpolationType::Linear,
      oversampling_factor: 256,
      window: rubato::WindowFunction::BlackmanHarris2,
    };

    let mut resampler = SincFixedIn::<f32>::new(
      dest_sample_rate as f64 / sample_rate as f64,
      2.0,
      params,
      output.len(),
      1,
    )
    .map_err(|_| Error::Unsupported("Failed to create resampler"))?;

    let waves_in = vec![output];
    let mut waves_out = resampler
      .process(&waves_in, None)
      .map_err(|_| Error::Unsupported("Failed to run resampler"))?;
    output = waves_out.pop().ok_or(Error::Unsupported("No resampled output found"))?;
  }

  Ok(output)
}

#[napi]
/// Decode audio file into a Float32Array
pub fn decode_audio_sync(
  buf: Uint8Array,
  dest_sample_rate: Option<u32>,
  filename: Option<String>,
) -> Result<Float32Array> {
  decode(buf, dest_sample_rate, filename.as_deref())
    .map(Float32Array::new)
    .map_err(|e| {
      napi::Error::new(
        Status::InvalidArg,
        format!("Decode audio into Float32Array failed: {e}"),
      )
    })
}

pub struct DecodeAudioTask {
  buf: Uint8Array,
  dest_sample_rate: Option<u32>,
  filename: Option<String>,
}

#[napi]
impl Task for DecodeAudioTask {
  type Output = Vec<f32>;
  type JsValue = Float32Array;

  fn compute(&mut self) -> Result<Self::Output> {
    decode(
      std::mem::replace(&mut self.buf, Uint8Array::new(vec![])),
      self.dest_sample_rate,
      self.filename.as_deref(),
    )
    .map_err(|e| {
      napi::Error::new(
        Status::InvalidArg,
        format!("Decode audio into Float32Array failed: {e}"),
      )
    })
  }

  fn resolve(&mut self, _: napi::Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(Float32Array::new(output))
  }
}

#[napi]
pub fn decode_audio(
  buf: Uint8Array,
  dest_sample_rate: Option<u32>,
  filename: Option<String>,
  signal: Option<AbortSignal>,
) -> AsyncTask<DecodeAudioTask> {
  AsyncTask::with_optional_signal(
    DecodeAudioTask {
      buf,
      dest_sample_rate,
      filename,
    },
    signal,
  )
}
