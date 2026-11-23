use std::{mem::MaybeUninit, ptr};

use coreaudio::sys::{
  AudioObjectGetPropertyData, AudioObjectGetPropertyDataSize, AudioObjectID, AudioObjectPropertyAddress,
  AudioObjectPropertySelector, kAudioHardwareNoError, kAudioHardwarePropertyProcessObjectList,
  kAudioObjectPropertyElementMain, kAudioObjectPropertyScopeGlobal, kAudioObjectSystemObject,
};

use crate::error::CoreAudioError;

pub fn audio_process_list() -> Result<Vec<AudioObjectID>, CoreAudioError> {
  let address = AudioObjectPropertyAddress {
    mSelector: kAudioHardwarePropertyProcessObjectList,
    mScope: kAudioObjectPropertyScopeGlobal,
    mElement: kAudioObjectPropertyElementMain,
  };

  let mut data_size = 0u32;
  let status =
    unsafe { AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &address, 0, ptr::null_mut(), &mut data_size) };

  if status != kAudioHardwareNoError as i32 {
    return Err(CoreAudioError::GetProcessObjectListSizeFailed(status));
  }

  let mut process_list: Vec<AudioObjectID> = vec![0; data_size as usize];

  let status = unsafe {
    AudioObjectGetPropertyData(
      kAudioObjectSystemObject,
      &address,
      0,
      ptr::null_mut(),
      (&mut data_size as *mut u32).cast(),
      process_list.as_mut_ptr().cast(),
    )
  };

  if status != kAudioHardwareNoError as i32 {
    return Err(CoreAudioError::GetProcessObjectListFailed(status));
  }

  Ok(process_list)
}

pub fn get_process_property<T: Sized>(
  object: &AudioObjectID,
  selector: AudioObjectPropertySelector,
) -> Result<T, CoreAudioError> {
  let object_id = *object;
  let address = AudioObjectPropertyAddress {
    mSelector: selector,
    mScope: kAudioObjectPropertyScopeGlobal,
    mElement: kAudioObjectPropertyElementMain,
  };

  let mut data_size = 0u32;
  let status = unsafe { AudioObjectGetPropertyDataSize(object_id, &address, 0, ptr::null_mut(), &mut data_size) };

  if status != kAudioHardwareNoError as i32 {
    return Err(CoreAudioError::AudioObjectGetPropertyDataSizeFailed(status));
  }
  get_property_data(object_id, &address, &mut data_size)
}

pub fn get_property_data<T: Sized>(
  object_id: AudioObjectID,
  address: &AudioObjectPropertyAddress,
  data_size: &mut u32,
) -> Result<T, CoreAudioError> {
  let mut property = MaybeUninit::<T>::uninit();
  let status = unsafe {
    AudioObjectGetPropertyData(
      object_id,
      address,
      0,
      ptr::null_mut(),
      (data_size as *mut u32).cast(),
      property.as_mut_ptr().cast(),
    )
  };

  if status != kAudioHardwareNoError as i32 {
    return Err(CoreAudioError::AudioObjectGetPropertyDataFailed(status));
  }

  Ok(unsafe { property.assume_init() })
}
