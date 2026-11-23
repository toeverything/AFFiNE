use core_foundation::{
  base::{FromVoid, ItemRef},
  string::CFString,
};
use coreaudio::sys::AudioObjectID;
use objc2::{
  AllocAnyThread, msg_send,
  runtime::{AnyClass, AnyObject},
};
use objc2_foundation::{NSArray, NSNumber, NSString, NSUUID};

use crate::error::CoreAudioError;

pub(crate) struct CATapDescription {
  pub(crate) inner: *mut AnyObject,
}

impl CATapDescription {
  pub fn init_stereo_mixdown_of_processes(process: AudioObjectID) -> std::result::Result<Self, CoreAudioError> {
    let cls = AnyClass::get(c"CATapDescription").ok_or(CoreAudioError::CATapDescriptionClassNotFound)?;
    let obj: *mut AnyObject = unsafe { msg_send![cls, alloc] };
    if obj.is_null() {
      return Err(CoreAudioError::AllocCATapDescriptionFailed);
    }
    let processes_array = NSArray::from_retained_slice(&[NSNumber::initWithUnsignedInt(NSNumber::alloc(), process)]);
    let obj: *mut AnyObject = unsafe { msg_send![obj, initStereoMixdownOfProcesses: &*processes_array] };
    if obj.is_null() {
      return Err(CoreAudioError::InitStereoMixdownOfProcessesFailed);
    }

    unsafe {
      let _: () = msg_send![obj, setMuteBehavior: 0_i64];
    }

    Ok(Self { inner: obj })
  }

  pub fn init_stereo_global_tap_but_exclude_processes(
    processes: &[AudioObjectID],
  ) -> std::result::Result<Self, CoreAudioError> {
    let cls = AnyClass::get(c"CATapDescription").ok_or(CoreAudioError::CATapDescriptionClassNotFound)?;
    let obj: *mut AnyObject = unsafe { msg_send![cls, alloc] };
    if obj.is_null() {
      return Err(CoreAudioError::AllocCATapDescriptionFailed);
    }
    let processes_array = NSArray::from_retained_slice(
      processes
        .iter()
        .map(|p| NSNumber::initWithUnsignedInt(NSNumber::alloc(), *p))
        .collect::<Vec<_>>()
        .as_slice(),
    );
    let obj: *mut AnyObject = unsafe { msg_send![obj, initStereoGlobalTapButExcludeProcesses: &*processes_array] };
    if obj.is_null() {
      return Err(CoreAudioError::InitStereoGlobalTapButExcludeProcessesFailed);
    }

    Ok(Self { inner: obj })
  }

  pub fn get_uuid(&self) -> std::result::Result<ItemRef<'_, CFString>, CoreAudioError> {
    let uuid: *mut NSUUID = unsafe { msg_send![self.inner, UUID] };
    if uuid.is_null() {
      return Err(CoreAudioError::GetCATapDescriptionUUIDFailed);
    }
    let uuid_string: *mut NSString = unsafe { msg_send![uuid, UUIDString] };
    if uuid_string.is_null() {
      return Err(CoreAudioError::ConvertUUIDToCFStringFailed);
    }
    Ok(unsafe { CFString::from_void(uuid_string.cast()) })
  }
}

impl Drop for CATapDescription {
  fn drop(&mut self) {
    unsafe {
      let _: () = msg_send![self.inner, release];
    }
  }
}
