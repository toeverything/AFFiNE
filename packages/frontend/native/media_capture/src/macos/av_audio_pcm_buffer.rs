use block2::RcBlock;
use objc2::{
  msg_send,
  runtime::{AnyClass, AnyObject},
};

use crate::{audio_buffer::AudioBufferList, av_audio_format::AVAudioFormat, error::CoreAudioError};

#[allow(unused)]
pub(crate) struct AVAudioPCMBuffer {
  pub(crate) inner: *mut AnyObject,
}

#[allow(unused)]
impl AVAudioPCMBuffer {
  pub(crate) fn new(audio_format: &AVAudioFormat, buffer_list: *const AudioBufferList) -> Result<Self, CoreAudioError> {
    let cls = AnyClass::get(c"AVAudioPCMBuffer").ok_or(CoreAudioError::AVAudioPCMBufferClassNotFound)?;
    let obj: *mut AnyObject = unsafe { msg_send![cls, alloc] };
    if obj.is_null() {
      return Err(CoreAudioError::AllocAVAudioPCMBufferFailed);
    }
    let deallocator = RcBlock::new(|_buffer_list: *const AudioBufferList| {});
    let obj: *mut AnyObject = unsafe {
      msg_send![obj, initWithPCMFormat: audio_format.inner.0, bufferListNoCopy: buffer_list, deallocator: &*deallocator]
    };
    if obj.is_null() {
      return Err(CoreAudioError::InitAVAudioPCMBufferFailed);
    }
    Ok(Self { inner: obj })
  }
}
