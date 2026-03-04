use std::fmt::Display;

use coreaudio::sys::{AudioObjectID, kAudioTapPropertyFormat};
use objc2::{Encode, Encoding, RefEncode};

use crate::{error::CoreAudioError, utils::get_global_main_property};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum AudioFormatID {
  LinearPcm = 0x6C70636D,            // 'lpcm'
  Ac3 = 0x61632D33,                  // 'ac-3'
  Ac360958 = 0x63616333,             // 'cac3'
  AppleIma4 = 0x696D6134,            // 'ima4'
  Mpeg4Aac = 0x61616320,             // 'aac '
  Mpeg4Celp = 0x63656C70,            // 'celp'
  Mpeg4Hvxc = 0x68767863,            // 'hvxc'
  Mpeg4TwinVq = 0x74777671,          // 'twvq'
  Mace3 = 0x4D414333,                // 'MAC3'
  Mace6 = 0x4D414336,                // 'MAC6'
  ULaw = 0x756C6177,                 // 'ulaw'
  ALaw = 0x616C6177,                 // 'alaw'
  QDesign = 0x51444D43,              // 'QDMC'
  QDesign2 = 0x51444D32,             // 'QDM2'
  Qualcomm = 0x51636C70,             // 'Qclp'
  MpegLayer1 = 0x2E6D7031,           // '.mp1'
  MpegLayer2 = 0x2E6D7032,           // '.mp2'
  MpegLayer3 = 0x2E6D7033,           // '.mp3'
  TimeCode = 0x74696D65,             // 'time'
  MidiStream = 0x6D696469,           // 'midi'
  ParameterValueStream = 0x61707673, // 'apvs'
  AppleLossless = 0x616C6163,        // 'alac'
  Mpeg4AacHe = 0x61616368,           // 'aach'
  Mpeg4AacLd = 0x6161636C,           // 'aacl'
  Mpeg4AacEld = 0x61616365,          // 'aace'
  Mpeg4AacEldSbr = 0x61616366,       // 'aacf'
  Mpeg4AacEldV2 = 0x61616367,        // 'aacg'
  Mpeg4AacHeV2 = 0x61616370,         // 'aacp'
  Mpeg4AacSpatial = 0x61616373,      // 'aacs'
  MpegdUsac = 0x75736163,            // 'usac'
  Amr = 0x73616D72,                  // 'samr'
  AmrWb = 0x73617762,                // 'sawb'
  Audible = 0x41554442,              // 'AUDB'
  ILbc = 0x696C6263,                 // 'ilbc'
  DviIntelIma = 0x6D730011,
  MicrosoftGsm = 0x6D730031,
  Aes3 = 0x61657333,        // 'aes3'
  EnhancedAc3 = 0x65632D33, // 'ec-3'
  Flac = 0x666C6163,        // 'flac'
  Opus = 0x6F707573,        // 'opus'
  Apac = 0x61706163,        // 'apac'
  Unknown = 0x00000000,
}

impl From<u32> for AudioFormatID {
  fn from(value: u32) -> Self {
    match value {
      0x6C70636D => Self::LinearPcm,
      0x61632D33 => Self::Ac3,
      0x63616333 => Self::Ac360958,
      0x696D6134 => Self::AppleIma4,
      0x61616320 => Self::Mpeg4Aac,
      0x63656C70 => Self::Mpeg4Celp,
      0x68767863 => Self::Mpeg4Hvxc,
      0x74777671 => Self::Mpeg4TwinVq,
      0x4D414333 => Self::Mace3,
      0x4D414336 => Self::Mace6,
      0x756C6177 => Self::ULaw,
      0x616C6177 => Self::ALaw,
      0x51444D43 => Self::QDesign,
      0x51444D32 => Self::QDesign2,
      0x51636C70 => Self::Qualcomm,
      0x2E6D7031 => Self::MpegLayer1,
      0x2E6D7032 => Self::MpegLayer2,
      0x2E6D7033 => Self::MpegLayer3,
      0x74696D65 => Self::TimeCode,
      0x6D696469 => Self::MidiStream,
      0x61707673 => Self::ParameterValueStream,
      0x616C6163 => Self::AppleLossless,
      0x61616368 => Self::Mpeg4AacHe,
      0x6161636C => Self::Mpeg4AacLd,
      0x61616365 => Self::Mpeg4AacEld,
      0x61616366 => Self::Mpeg4AacEldSbr,
      0x61616367 => Self::Mpeg4AacEldV2,
      0x61616370 => Self::Mpeg4AacHeV2,
      0x61616373 => Self::Mpeg4AacSpatial,
      0x75736163 => Self::MpegdUsac,
      0x73616D72 => Self::Amr,
      0x73617762 => Self::AmrWb,
      0x41554442 => Self::Audible,
      0x696C6263 => Self::ILbc,
      0x6D730011 => Self::DviIntelIma,
      0x6D730031 => Self::MicrosoftGsm,
      0x61657333 => Self::Aes3,
      0x65632D33 => Self::EnhancedAc3,
      0x666C6163 => Self::Flac,
      0x6F707573 => Self::Opus,
      0x61706163 => Self::Apac,
      _ => Self::Unknown,
    }
  }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub struct AudioFormatFlags(pub u32);

#[allow(unused)]
impl AudioFormatFlags {
  pub const IS_FLOAT: u32 = 1 << 0;
  pub const IS_BIG_ENDIAN: u32 = 1 << 1;
  pub const IS_SIGNED_INTEGER: u32 = 1 << 2;
  pub const IS_PACKED: u32 = 1 << 3;
  pub const IS_ALIGNED_HIGH: u32 = 1 << 4;
  pub const IS_NON_INTERLEAVED: u32 = 1 << 5;
  pub const IS_NON_MIXABLE: u32 = 1 << 6;
  pub const ARE_ALL_CLEAR: u32 = 0x80000000;

  pub const LINEAR_PCM_IS_FLOAT: u32 = Self::IS_FLOAT;
  pub const LINEAR_PCM_IS_BIG_ENDIAN: u32 = Self::IS_BIG_ENDIAN;
  pub const LINEAR_PCM_IS_SIGNED_INTEGER: u32 = Self::IS_SIGNED_INTEGER;
  pub const LINEAR_PCM_IS_PACKED: u32 = Self::IS_PACKED;
  pub const LINEAR_PCM_IS_ALIGNED_HIGH: u32 = Self::IS_ALIGNED_HIGH;
  pub const LINEAR_PCM_IS_NON_INTERLEAVED: u32 = Self::IS_NON_INTERLEAVED;
  pub const LINEAR_PCM_IS_NON_MIXABLE: u32 = Self::IS_NON_MIXABLE;
  pub const LINEAR_PCM_SAMPLE_FRACTION_SHIFT: u32 = 7;
  pub const LINEAR_PCM_SAMPLE_FRACTION_MASK: u32 = 0x3F << Self::LINEAR_PCM_SAMPLE_FRACTION_SHIFT;
  pub const LINEAR_PCM_ARE_ALL_CLEAR: u32 = Self::ARE_ALL_CLEAR;

  pub const APPLE_LOSSLESS_FORMAT_FLAG_16_BIT_SOURCE_DATA: u32 = 1;
  pub const APPLE_LOSSLESS_FORMAT_FLAG_20_BIT_SOURCE_DATA: u32 = 2;
  pub const APPLE_LOSSLESS_FORMAT_FLAG_24_BIT_SOURCE_DATA: u32 = 3;
  pub const APPLE_LOSSLESS_FORMAT_FLAG_32_BIT_SOURCE_DATA: u32 = 4;
}

impl std::fmt::Display for AudioFormatFlags {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    let mut flags = Vec::new();

    if self.0 & Self::IS_FLOAT != 0 {
      flags.push("FLOAT");
    }
    if self.0 & Self::IS_BIG_ENDIAN != 0 {
      flags.push("BIG_ENDIAN");
    }
    if self.0 & Self::IS_SIGNED_INTEGER != 0 {
      flags.push("SIGNED_INTEGER");
    }
    if self.0 & Self::IS_PACKED != 0 {
      flags.push("PACKED");
    }
    if self.0 & Self::IS_ALIGNED_HIGH != 0 {
      flags.push("ALIGNED_HIGH");
    }
    if self.0 & Self::IS_NON_INTERLEAVED != 0 {
      flags.push("NON_INTERLEAVED");
    }
    if self.0 & Self::IS_NON_MIXABLE != 0 {
      flags.push("NON_MIXABLE");
    }
    if self.0 & Self::ARE_ALL_CLEAR != 0 {
      flags.push("ALL_CLEAR");
    }

    if flags.is_empty() {
      write!(f, "NONE")
    } else {
      write!(f, "{}", flags.join(" | "))
    }
  }
}

impl std::fmt::Debug for AudioFormatFlags {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "AudioFormatFlags({self})")
  }
}

impl From<u32> for AudioFormatFlags {
  fn from(value: u32) -> Self {
    Self(value)
  }
}

/// [Apple's documentation](https://developer.apple.com/documentation/coreaudiotypes/audiostreambasicdescription?language=objc)
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
#[allow(non_snake_case)]
pub struct AudioStreamBasicDescription {
  pub mSampleRate: f64,
  pub mFormatID: u32,
  pub mFormatFlags: u32,
  pub mBytesPerPacket: u32,
  pub mFramesPerPacket: u32,
  pub mBytesPerFrame: u32,
  pub mChannelsPerFrame: u32,
  pub mBitsPerChannel: u32,
  pub mReserved: u32,
}

unsafe impl Encode for AudioStreamBasicDescription {
  const ENCODING: Encoding = Encoding::Struct(
    "AudioStreamBasicDescription",
    &[
      <f64>::ENCODING,
      <u32>::ENCODING,
      <u32>::ENCODING,
      <u32>::ENCODING,
      <u32>::ENCODING,
      <u32>::ENCODING,
      <u32>::ENCODING,
      <u32>::ENCODING,
      <u32>::ENCODING,
    ],
  );
}

unsafe impl RefEncode for AudioStreamBasicDescription {
  const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
}

#[derive(Debug, Clone, Copy)]
#[repr(transparent)]
pub struct AudioStreamDescription(pub(crate) AudioStreamBasicDescription);

impl Display for AudioStreamDescription {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(
      f,
      "AudioStreamBasicDescription {{ mSampleRate: {}, mFormatID: {:?}, mFormatFlags: {}, mBytesPerPacket: {}, \
       mFramesPerPacket: {}, mBytesPerFrame: {}, mChannelsPerFrame: {}, mBitsPerChannel: {}, mReserved: {} }}",
      self.0.mSampleRate,
      AudioFormatID::from(self.0.mFormatID),
      AudioFormatFlags(self.0.mFormatFlags),
      self.0.mBytesPerPacket,
      self.0.mFramesPerPacket,
      self.0.mBytesPerFrame,
      self.0.mChannelsPerFrame,
      self.0.mBitsPerChannel,
      self.0.mReserved
    )
  }
}

pub fn read_audio_stream_basic_description(
  tap_id: AudioObjectID,
) -> std::result::Result<AudioStreamDescription, CoreAudioError> {
  let mut data = AudioStreamBasicDescription {
    mSampleRate: 0.0,
    mFormatID: 0,
    mFormatFlags: 0,
    mBytesPerPacket: 0,
    mFramesPerPacket: 0,
    mBytesPerFrame: 0,
    mChannelsPerFrame: 0,
    mBitsPerChannel: 0,
    mReserved: 0,
  };
  get_global_main_property(tap_id, kAudioTapPropertyFormat, &mut data)?;

  Ok(AudioStreamDescription(data))
}
