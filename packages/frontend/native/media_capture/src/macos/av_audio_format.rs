use objc2::{
  Encode, Encoding, RefEncode, msg_send,
  runtime::{AnyClass, AnyObject},
};

use crate::{audio_stream_basic_desc::AudioStreamDescription, error::CoreAudioError};

#[derive(Debug)]
#[allow(unused)]
pub(crate) struct AVAudioFormat {
  pub(crate) inner: AVAudioFormatRef,
  pub(crate) audio_stream_basic_description: AudioStreamDescription,
}

#[repr(transparent)]
#[derive(Debug, Clone, Copy)]
pub(crate) struct AVAudioFormatRef(pub(crate) *mut AnyObject);

unsafe impl Encode for AVAudioFormatRef {
  const ENCODING: Encoding = Encoding::Struct(
    "AVAudioFormat",
    &[
      Encoding::Double,
      Encoding::UInt,
      Encoding::Pointer(&Encoding::Struct(
        "AVAudioChannelLayout",
        &[
          Encoding::UInt,
          Encoding::UInt,
          Encoding::Pointer(&Encoding::Struct(
            "AudioChannelLayout",
            &[
              Encoding::UInt,
              Encoding::UInt,
              Encoding::Array(
                1,
                &Encoding::Struct(
                  "AudioChannelDescription",
                  &[Encoding::UInt, Encoding::UInt, Encoding::Array(3, &Encoding::Float)],
                ),
              ),
              Encoding::UInt,
              Encoding::UInt,
            ],
          )),
          Encoding::UInt,
        ],
      )),
      Encoding::Pointer(&Encoding::Object),
    ],
  );
}

unsafe impl RefEncode for AVAudioFormatRef {
  const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
}

#[allow(unused)]
impl AVAudioFormat {
  pub fn new(audio_stream_basic_description: AudioStreamDescription) -> Result<Self, CoreAudioError> {
    let cls = AnyClass::get(c"AVAudioFormat").ok_or(CoreAudioError::AVAudioFormatClassNotFound)?;
    let obj: *mut AnyObject = unsafe { msg_send![cls, alloc] };
    if obj.is_null() {
      return Err(CoreAudioError::AllocAVAudioFormatFailed);
    }
    let obj: *mut AnyObject = unsafe { msg_send![obj, initWithStreamDescription: &audio_stream_basic_description.0] };
    if obj.is_null() {
      return Err(CoreAudioError::InitAVAudioFormatFailed);
    }
    Ok(Self {
      inner: AVAudioFormatRef(obj),
      audio_stream_basic_description,
    })
  }

  pub(crate) fn get_sample_rate(&self) -> f64 {
    unsafe { msg_send![self.inner.0, sampleRate] }
  }

  pub(crate) fn get_channel_count(&self) -> u32 {
    unsafe { msg_send![self.inner.0, channelCount] }
  }

  pub(crate) fn is_interleaved(&self) -> bool {
    unsafe { msg_send![self.inner.0, isInterleaved] }
  }
}
