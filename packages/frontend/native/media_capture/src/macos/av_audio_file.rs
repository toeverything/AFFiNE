use std::ptr;

use objc2::{
  AllocAnyThread, msg_send,
  runtime::{AnyClass, AnyObject},
};
use objc2_foundation::{NSDictionary, NSError, NSNumber, NSString, NSUInteger, NSURL};

use crate::{av_audio_format::AVAudioFormat, av_audio_pcm_buffer::AVAudioPCMBuffer, error::CoreAudioError};

#[allow(unused)]
pub(crate) struct AVAudioFile {
  inner: *mut AnyObject,
}

#[allow(unused)]
impl AVAudioFile {
  pub(crate) fn new(url: &str, format: &AVAudioFormat) -> Result<Self, CoreAudioError> {
    let cls = AnyClass::get(c"AVAudioFile").ok_or(CoreAudioError::AVAudioFileClassNotFound)?;
    let obj: *mut AnyObject = unsafe { msg_send![cls, alloc] };
    if obj.is_null() {
      return Err(CoreAudioError::AllocAVAudioFileFailed);
    }
    let url: &NSURL = &*unsafe { NSURL::fileURLWithPath(&NSString::from_str(url)) };
    let settings = &*NSDictionary::from_retained_objects(
      &[
        &*NSString::from_str("AVFormatIDKey"),
        &*NSString::from_str("AVSampleRateKey"),
        &*NSString::from_str("AVNumberOfChannelsKey"),
      ],
      &[
        NSNumber::initWithUnsignedInt(NSNumber::alloc(), format.audio_stream_basic_description.0.mFormatID),
        NSNumber::initWithDouble(NSNumber::alloc(), format.get_sample_rate()),
        NSNumber::initWithUnsignedInt(NSNumber::alloc(), format.get_channel_count()),
      ],
    );
    let is_interleaved = format.is_interleaved();
    let mut error: *mut NSError = ptr::null_mut();
    let common_format: NSUInteger = 1;
    let obj: *mut AnyObject = unsafe {
      msg_send![
        obj,
        initForWriting: url,
        settings: settings,
        commonFormat: common_format,
        interleaved: is_interleaved,
        error: &mut error
      ]
    };
    if obj.is_null() {
      return Err(CoreAudioError::InitAVAudioFileFailed);
    }
    Ok(Self { inner: obj })
  }

  pub(crate) fn write(&self, buffer: AVAudioPCMBuffer) -> Result<(), CoreAudioError> {
    let mut error: *mut NSError = ptr::null_mut();
    let success: bool = unsafe { msg_send![self.inner, writeFromBuffer: buffer.inner, error: &mut error] };
    if !success {
      return Err(CoreAudioError::WriteAVAudioFileFailed);
    }
    Ok(())
  }
}
