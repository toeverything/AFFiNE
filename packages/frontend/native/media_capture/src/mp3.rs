use mp3lame_encoder::{Builder, Encoder, FlushNoGap, MonoPcm};
use napi::bindgen_prelude::{Result, Uint8Array};
use napi_derive::napi;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum LameError {
  #[error("Create builder failed")]
  CreateBuilderFailed,
  #[error("Failed to create encoder")]
  BuildError(#[from] mp3lame_encoder::BuildError),
  #[error("Failed to encode")]
  EncodeError(#[from] mp3lame_encoder::EncodeError),
}

impl From<LameError> for napi::Error {
  fn from(value: LameError) -> Self {
    napi::Error::new(napi::Status::GenericFailure, value.to_string())
  }
}

#[napi]
#[derive(Debug, Clone)]
///Possible quality parameter.
///From best(0) to worst(9)
pub enum Quality {
  ///Best possible quality
  Best = 0,
  ///Second best
  SecondBest = 1,
  ///Close to best
  NearBest = 2,
  ///Very nice
  VeryNice = 3,
  ///Nice
  Nice = 4,
  ///Good
  Good = 5,
  ///Decent
  Decent = 6,
  ///Okayish
  Ok = 7,
  ///Almost worst
  SecondWorst = 8,
  ///Worst
  Worst = 9,
}

impl From<Quality> for mp3lame_encoder::Quality {
  fn from(value: Quality) -> Self {
    match value {
      Quality::Best => mp3lame_encoder::Quality::Best,
      Quality::SecondBest => mp3lame_encoder::Quality::SecondBest,
      Quality::NearBest => mp3lame_encoder::Quality::NearBest,
      Quality::VeryNice => mp3lame_encoder::Quality::VeryNice,
      Quality::Nice => mp3lame_encoder::Quality::Nice,
      Quality::Good => mp3lame_encoder::Quality::Good,
      Quality::Decent => mp3lame_encoder::Quality::Decent,
      Quality::Ok => mp3lame_encoder::Quality::Ok,
      Quality::SecondWorst => mp3lame_encoder::Quality::SecondWorst,
      Quality::Worst => mp3lame_encoder::Quality::Worst,
    }
  }
}

#[napi]
#[repr(u16)]
#[derive(Debug, Clone)]
///Enumeration of valid values for `set_brate`
pub enum Bitrate {
  ///8_000
  Kbps8 = 8,
  ///16_000
  Kbps16 = 16,
  ///24_000
  Kbps24 = 24,
  ///32_000
  Kbps32 = 32,
  ///40_000
  Kbps40 = 40,
  ///48_000
  Kbps48 = 48,
  ///64_000
  Kbps64 = 64,
  ///80_000
  Kbps80 = 80,
  ///96_000
  Kbps96 = 96,
  ///112_000
  Kbps112 = 112,
  ///128_000
  Kbps128 = 128,
  ///160_000
  Kbps160 = 160,
  ///192_000
  Kbps192 = 192,
  ///224_000
  Kbps224 = 224,
  ///256_000
  Kbps256 = 256,
  ///320_000
  Kbps320 = 320,
}

impl From<Bitrate> for mp3lame_encoder::Bitrate {
  fn from(value: Bitrate) -> Self {
    match value {
      Bitrate::Kbps8 => mp3lame_encoder::Bitrate::Kbps8,
      Bitrate::Kbps16 => mp3lame_encoder::Bitrate::Kbps16,
      Bitrate::Kbps24 => mp3lame_encoder::Bitrate::Kbps24,
      Bitrate::Kbps32 => mp3lame_encoder::Bitrate::Kbps32,
      Bitrate::Kbps40 => mp3lame_encoder::Bitrate::Kbps40,
      Bitrate::Kbps48 => mp3lame_encoder::Bitrate::Kbps48,
      Bitrate::Kbps64 => mp3lame_encoder::Bitrate::Kbps64,
      Bitrate::Kbps80 => mp3lame_encoder::Bitrate::Kbps80,
      Bitrate::Kbps96 => mp3lame_encoder::Bitrate::Kbps96,
      Bitrate::Kbps112 => mp3lame_encoder::Bitrate::Kbps112,
      Bitrate::Kbps128 => mp3lame_encoder::Bitrate::Kbps128,
      Bitrate::Kbps160 => mp3lame_encoder::Bitrate::Kbps160,
      Bitrate::Kbps192 => mp3lame_encoder::Bitrate::Kbps192,
      Bitrate::Kbps224 => mp3lame_encoder::Bitrate::Kbps224,
      Bitrate::Kbps256 => mp3lame_encoder::Bitrate::Kbps256,
      Bitrate::Kbps320 => mp3lame_encoder::Bitrate::Kbps320,
    }
  }
}

#[napi]
#[derive(Debug, Clone)]
/// MPEG mode
pub enum Mode {
  Mono,
  Stereo,
  JointStereo,
  DualChannel,
  NotSet,
}

impl From<Mode> for mp3lame_encoder::Mode {
  fn from(value: Mode) -> Self {
    match value {
      Mode::Mono => mp3lame_encoder::Mode::Mono,
      Mode::Stereo => mp3lame_encoder::Mode::Stereo,
      Mode::JointStereo => mp3lame_encoder::Mode::JointStereo,
      Mode::DualChannel => mp3lame_encoder::Mode::DaulChannel,
      Mode::NotSet => mp3lame_encoder::Mode::NotSet,
    }
  }
}

#[napi(object, object_to_js = false)]
#[derive(Debug, Clone)]
pub struct EncodeOptions {
  pub channels: u32,
  pub quality: Option<Quality>,
  pub bitrate: Option<Bitrate>,
  pub sample_rate: Option<u32>,
  pub mode: Option<Mode>,
}

#[napi]
pub struct Mp3Encoder {
  encoder: Encoder,
}

#[napi]
impl Mp3Encoder {
  #[napi(constructor)]
  pub fn new(options: EncodeOptions) -> Result<Self> {
    let mut builder = Builder::new().ok_or(LameError::CreateBuilderFailed)?;
    builder
      .set_num_channels(options.channels as u8)
      .map_err(LameError::BuildError)?;
    if let Some(quality) = options.quality {
      builder
        .set_quality(quality.into())
        .map_err(LameError::BuildError)?;
    }
    if let Some(bitrate) = options.bitrate {
      builder
        .set_brate(bitrate.into())
        .map_err(LameError::BuildError)?;
    }
    if let Some(sample_rate) = options.sample_rate {
      builder
        .set_sample_rate(sample_rate)
        .map_err(LameError::BuildError)?;
    }
    if let Some(mode) = options.mode {
      builder
        .set_mode(mode.into())
        .map_err(LameError::BuildError)?;
    }
    Ok(Self {
      encoder: builder.build().map_err(LameError::BuildError)?,
    })
  }

  #[napi]
  pub fn encode(&mut self, input: &[f32]) -> Result<Uint8Array> {
    let mut output = Vec::with_capacity(input.len());
    output.reserve(mp3lame_encoder::max_required_buffer_size(input.len()));
    let encoded_size = self
      .encoder
      .encode(MonoPcm(input), output.spare_capacity_mut())
      .map_err(LameError::EncodeError)?;
    unsafe {
      output.set_len(output.len().wrapping_add(encoded_size));
    }
    let encoded_size = self
      .encoder
      .flush::<FlushNoGap>(output.spare_capacity_mut())
      .map_err(LameError::EncodeError)?;
    unsafe {
      output.set_len(output.len().wrapping_add(encoded_size));
    }
    Ok(output.into())
  }
}
