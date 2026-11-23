use std::ptr;

use core_foundation::{base::TCFType, string::CFString};
use coreaudio::sys::{
  AudioDeviceID, AudioObjectID, CFStringRef, kAudioDevicePropertyDeviceUID, kAudioObjectSystemObject,
};

use crate::{error::CoreAudioError, utils::get_global_main_property};

pub(crate) fn get_device_uid(
  device_id: AudioDeviceID,
) -> std::result::Result<(AudioObjectID, CFString), CoreAudioError> {
  let system_audio_id = get_device_audio_id(device_id)?;
  let mut output_uid: CFStringRef = ptr::null_mut();
  get_global_main_property(system_audio_id, kAudioDevicePropertyDeviceUID, &mut output_uid)?;

  Ok((system_audio_id, unsafe {
    CFString::wrap_under_create_rule(output_uid.cast())
  }))
}

pub(crate) fn get_device_audio_id(device_id: AudioDeviceID) -> std::result::Result<AudioObjectID, CoreAudioError> {
  let mut system_output_id: AudioObjectID = 0;

  get_global_main_property(kAudioObjectSystemObject, device_id, &mut system_output_id)?;

  Ok(system_output_id)
}
