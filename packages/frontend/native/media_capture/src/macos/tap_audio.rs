use std::{ffi::c_void, ptr, sync::Arc};

use block2::{Block, RcBlock};
use core_foundation::{
  base::{CFType, ItemRef, TCFType},
  dictionary::CFDictionary,
  string::CFString,
  uuid::CFUUID,
};
use coreaudio::sys::{
  kAudioAggregateDeviceClockDeviceKey, kAudioAggregateDeviceIsPrivateKey,
  kAudioAggregateDeviceIsStackedKey, kAudioAggregateDeviceMainSubDeviceKey,
  kAudioAggregateDeviceNameKey, kAudioAggregateDeviceSubDeviceListKey,
  kAudioAggregateDeviceTapAutoStartKey, kAudioAggregateDeviceTapListKey,
  kAudioAggregateDeviceUIDKey, kAudioDevicePropertyNominalSampleRate, kAudioHardwareBadDeviceError,
  kAudioHardwareBadStreamError, kAudioHardwareNoError, kAudioHardwarePropertyDefaultInputDevice,
  kAudioHardwarePropertyDefaultSystemOutputDevice, kAudioSubDeviceUIDKey, kAudioSubTapUIDKey,
  AudioDeviceCreateIOProcIDWithBlock, AudioDeviceDestroyIOProcID, AudioDeviceIOProcID,
  AudioDeviceStart, AudioDeviceStop, AudioHardwareCreateAggregateDevice,
  AudioHardwareDestroyAggregateDevice, AudioObjectID, AudioTimeStamp, OSStatus,
};
use napi::{
  bindgen_prelude::Float32Array,
  threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
  Result,
};
use napi_derive::napi;
use objc2::runtime::AnyObject;

use crate::{
  audio_buffer::InputAndOutputAudioBufferList,
  ca_tap_description::CATapDescription,
  cf_types::CFDictionaryBuilder,
  device::{get_device_audio_id, get_device_uid},
  error::CoreAudioError,
  queue::create_audio_tap_queue,
  screen_capture_kit::TappableApplication,
  utils::{cfstring_from_bytes_with_nul, get_global_main_property},
};

extern "C" {
  fn AudioHardwareCreateProcessTap(
    inDescription: *mut AnyObject,
    outTapID: *mut AudioObjectID,
  ) -> OSStatus;

  fn AudioHardwareDestroyProcessTap(tapID: AudioObjectID) -> OSStatus;
}

// Audio statistics structure to track audio format information
#[derive(Clone, Copy, Debug)]
pub struct AudioStats {
  pub sample_rate: f64,
  pub channels: u32,
}

pub struct AggregateDevice {
  pub tap_id: AudioObjectID,
  pub id: AudioObjectID,
  pub audio_stats: Option<AudioStats>,
  pub input_device_id: AudioObjectID,
  pub output_device_id: Option<AudioObjectID>,
  pub input_proc_id: Option<AudioDeviceIOProcID>,
  pub output_proc_id: Option<AudioDeviceIOProcID>,
}

impl AggregateDevice {
  pub fn new(app: &TappableApplication) -> Result<Self> {
    let object_id = app.object_id;

    let tap_description = CATapDescription::init_stereo_mixdown_of_processes(object_id)?;
    let mut tap_id: AudioObjectID = 0;

    let status = unsafe { AudioHardwareCreateProcessTap(tap_description.inner, &mut tap_id) };

    if status != 0 {
      return Err(CoreAudioError::CreateProcessTapFailed(status).into());
    }

    let (input_device_id, default_input_uid) =
      get_device_uid(kAudioHardwarePropertyDefaultInputDevice)?;

    let description_dict =
      Self::create_aggregate_description(tap_id, tap_description.get_uuid()?, default_input_uid)?;

    let mut aggregate_device_id: AudioObjectID = 0;

    let status = unsafe {
      AudioHardwareCreateAggregateDevice(
        description_dict.as_concrete_TypeRef().cast(),
        &mut aggregate_device_id,
      )
    };

    if status != 0 {
      return Err(CoreAudioError::CreateAggregateDeviceFailed(status).into());
    }

    Ok(Self {
      tap_id,
      id: aggregate_device_id,
      audio_stats: None,
      input_device_id,
      output_device_id: None,
      input_proc_id: None,
      output_proc_id: None,
    })
  }

  pub fn create_global_tap_but_exclude_processes(processes: &[AudioObjectID]) -> Result<Self> {
    let mut tap_id: AudioObjectID = 0;
    let tap_description =
      CATapDescription::init_stereo_global_tap_but_exclude_processes(processes)?;
    let status = unsafe { AudioHardwareCreateProcessTap(tap_description.inner, &mut tap_id) };

    if status != 0 {
      return Err(CoreAudioError::CreateProcessTapFailed(status).into());
    }

    // Get the default input device (microphone) UID and ID
    let (input_device_id, default_input_uid) =
      get_device_uid(kAudioHardwarePropertyDefaultInputDevice)?;

    // Get the default output device ID
    let output_device_id = get_device_audio_id(kAudioHardwarePropertyDefaultSystemOutputDevice)?;

    let description_dict =
      Self::create_aggregate_description(tap_id, tap_description.get_uuid()?, default_input_uid)?;

    let mut aggregate_device_id: AudioObjectID = 0;

    let status = unsafe {
      AudioHardwareCreateAggregateDevice(
        description_dict.as_concrete_TypeRef().cast(),
        &mut aggregate_device_id,
      )
    };

    // Check the status and return the appropriate result
    if status != 0 {
      return Err(CoreAudioError::CreateAggregateDeviceFailed(status).into());
    }

    // Create a device with stored device IDs
    let mut device = Self {
      tap_id,
      id: aggregate_device_id,
      audio_stats: None,
      input_device_id,
      output_device_id: Some(output_device_id),
      input_proc_id: None,
      output_proc_id: None,
    };

    // Configure the aggregate device to ensure proper handling of both input and
    // output
    device.get_aggregate_device_stats()?;

    // Activate both the input and output devices and store their proc IDs
    let input_proc_id = device.activate_audio_device(input_device_id)?;
    let output_proc_id = device.activate_audio_device(output_device_id)?;

    device.input_proc_id = Some(input_proc_id);
    device.output_proc_id = Some(output_proc_id);

    Ok(device)
  }

  fn get_aggregate_device_stats(&self) -> Result<AudioStats> {
    let mut sample_rate: f64 = 0.0;
    get_global_main_property(
      self.id,
      kAudioDevicePropertyNominalSampleRate,
      &mut sample_rate,
    )?;

    let audio_stats = AudioStats {
      sample_rate,
      channels: 1, // we combined the stereo pcm data into a single channel
    };

    Ok(audio_stats)
  }

  // Activates an audio device by creating a dummy IO proc
  fn activate_audio_device(&self, device_id: AudioObjectID) -> Result<AudioDeviceIOProcID> {
    // Create a simple no-op dummy proc
    let dummy_block = RcBlock::new(
      |_: *mut c_void, _: *mut c_void, _: *mut c_void, _: *mut c_void, _: *mut c_void| {
        // No-op function that just returns success
        kAudioHardwareNoError as i32
      },
    );

    let mut dummy_proc_id: AudioDeviceIOProcID = None;

    // Create the IO proc with our dummy block
    let status = unsafe {
      AudioDeviceCreateIOProcIDWithBlock(
        &mut dummy_proc_id,
        device_id,
        ptr::null_mut(),
        (&*dummy_block.copy() as *const Block<dyn Fn(_, _, _, _, _) -> i32>)
          .cast_mut()
          .cast(),
      )
    };

    if status != 0 {
      return Err(CoreAudioError::CreateIOProcIDWithBlockFailed(status).into());
    }

    // Start the device to activate it
    let status = unsafe { AudioDeviceStart(device_id, dummy_proc_id) };
    if status != 0 {
      return Err(CoreAudioError::AudioDeviceStartFailed(status).into());
    }

    // Return the proc ID for later cleanup
    Ok(dummy_proc_id)
  }

  pub fn start(
    &mut self,
    audio_stream_callback: Arc<ThreadsafeFunction<Float32Array, (), Float32Array, true>>,
  ) -> Result<AudioTapStream> {
    let mut audio_stats = self.get_aggregate_device_stats()?;

    let queue = create_audio_tap_queue();
    let mut in_proc_id: AudioDeviceIOProcID = None;
    let mut input_device_sample_rate: f64 = 0.0;
    get_global_main_property(
      self.input_device_id,
      kAudioDevicePropertyNominalSampleRate,
      &mut input_device_sample_rate,
    )?;
    let output_sample_rate = audio_stats.sample_rate;
    let target_sample_rate = input_device_sample_rate.max(output_sample_rate);

    audio_stats.sample_rate = target_sample_rate;

    let audio_stats_clone = audio_stats;
    self.audio_stats = Some(audio_stats);

    let in_io_block: RcBlock<
      dyn Fn(*mut c_void, *mut c_void, *mut c_void, *mut c_void, *mut c_void) -> i32,
    > = RcBlock::new(
      move |_in_now: *mut c_void,
            in_input_data: *mut c_void,
            in_input_time: *mut c_void,
            _in_output_data: *mut c_void,
            _in_output_time: *mut c_void| {
        let AudioTimeStamp { mSampleTime, .. } = unsafe { &*in_input_time.cast() };

        // ignore pre-roll
        if *mSampleTime < 0.0 {
          return kAudioHardwareNoError as i32;
        }
        let Ok(dua_audio_buffer_list) =
          (unsafe { InputAndOutputAudioBufferList::from_raw(in_input_data) })
        else {
          return kAudioHardwareBadDeviceError as i32;
        };

        let Ok(mixed_samples) = dua_audio_buffer_list.mix_input_and_output(
          target_sample_rate,
          input_device_sample_rate,
          output_sample_rate,
        ) else {
          return kAudioHardwareBadStreamError as i32;
        };

        // Send the processed audio data to JavaScript
        audio_stream_callback.call(
          Ok(mixed_samples.into()),
          ThreadsafeFunctionCallMode::NonBlocking,
        );

        kAudioHardwareNoError as i32
      },
    );

    let status = unsafe {
      AudioDeviceCreateIOProcIDWithBlock(
        &mut in_proc_id,
        self.id,
        queue.cast(),
        (&*in_io_block
          as *const Block<
            dyn Fn(*mut c_void, *mut c_void, *mut c_void, *mut c_void, *mut c_void) -> i32,
          >)
          .cast_mut()
          .cast(),
      )
    };
    if status != 0 {
      return Err(CoreAudioError::CreateIOProcIDWithBlockFailed(status).into());
    }
    let status = unsafe { AudioDeviceStart(self.id, in_proc_id) };
    if status != 0 {
      return Err(CoreAudioError::AudioDeviceStartFailed(status).into());
    }

    Ok(AudioTapStream {
      device_id: self.id,
      in_proc_id,
      stop_called: false,
      audio_stats: audio_stats_clone, // Use the updated audio_stats with the actual sample rate
      input_device_id: self.input_device_id,
      output_device_id: self.output_device_id,
      input_proc_id: self.input_proc_id,
      output_proc_id: self.output_proc_id,
    })
  }

  fn create_aggregate_description(
    tap_id: AudioObjectID,
    tap_uuid_string: ItemRef<CFString>,
    input_device_id: CFString,
  ) -> Result<CFDictionary<CFType, CFType>> {
    let aggregate_device_name = CFString::new(&format!("Tap-{}", tap_id));
    let aggregate_device_uid: uuid::Uuid = CFUUID::new().into();
    let aggregate_device_uid_string = aggregate_device_uid.to_string();

    let (_, output_device_uid) = get_device_uid(kAudioHardwarePropertyDefaultSystemOutputDevice)?;

    let sub_device_input_dict = CFDictionary::from_CFType_pairs(&[(
      cfstring_from_bytes_with_nul(kAudioSubDeviceUIDKey).as_CFType(),
      input_device_id.as_CFType(),
    )]);

    let tap_device_dict = CFDictionary::from_CFType_pairs(&[(
      cfstring_from_bytes_with_nul(kAudioSubTapUIDKey).as_CFType(),
      tap_uuid_string.as_CFType(),
    )]);

    let capture_device_list = vec![sub_device_input_dict];

    // Create the aggregate device description dictionary with a balanced
    // configuration

    let mut cf_dict_builder = CFDictionaryBuilder::new();

    cf_dict_builder
      .add(
        kAudioAggregateDeviceNameKey.as_slice(),
        aggregate_device_name,
      )
      .add(
        kAudioAggregateDeviceUIDKey.as_slice(),
        aggregate_device_uid_string,
      )
      .add(
        kAudioAggregateDeviceMainSubDeviceKey.as_slice(),
        output_device_uid,
      )
      .add(kAudioAggregateDeviceIsPrivateKey.as_slice(), true)
      .add(kAudioAggregateDeviceIsStackedKey.as_slice(), false)
      .add(kAudioAggregateDeviceTapAutoStartKey.as_slice(), true)
      .add(
        kAudioAggregateDeviceSubDeviceListKey.as_slice(),
        capture_device_list,
      )
      .add(
        kAudioAggregateDeviceClockDeviceKey.as_slice(),
        input_device_id,
      )
      .add(
        kAudioAggregateDeviceTapListKey.as_slice(),
        vec![tap_device_dict],
      );

    Ok(cf_dict_builder.build())
  }
}

#[napi]
pub struct AudioTapStream {
  device_id: AudioObjectID,
  in_proc_id: AudioDeviceIOProcID,
  stop_called: bool,
  audio_stats: AudioStats,
  input_device_id: AudioObjectID,
  output_device_id: Option<AudioObjectID>,
  input_proc_id: Option<AudioDeviceIOProcID>,
  output_proc_id: Option<AudioDeviceIOProcID>,
}

#[napi]
impl AudioTapStream {
  #[napi]
  pub fn stop(&mut self) -> Result<()> {
    if self.stop_called {
      return Ok(());
    }
    self.stop_called = true;

    // Stop the main aggregate device
    let status = unsafe { AudioDeviceStop(self.device_id, self.in_proc_id) };
    if status != 0 {
      return Err(CoreAudioError::AudioDeviceStopFailed(status).into());
    }

    // Stop the input device if it was activated
    if let Some(proc_id) = self.input_proc_id {
      let _ = unsafe { AudioDeviceStop(self.input_device_id, proc_id) };
      let _ = unsafe { AudioDeviceDestroyIOProcID(self.input_device_id, proc_id) };
    }

    // Stop the output device if it was activated
    if let Some(output_id) = self.output_device_id {
      if let Some(proc_id) = self.output_proc_id {
        let _ = unsafe { AudioDeviceStop(output_id, proc_id) };
        let _ = unsafe { AudioDeviceDestroyIOProcID(output_id, proc_id) };
      }
    }

    // Destroy the main IO proc
    let status = unsafe { AudioDeviceDestroyIOProcID(self.device_id, self.in_proc_id) };
    if status != 0 {
      return Err(CoreAudioError::AudioDeviceDestroyIOProcIDFailed(status).into());
    }

    // Destroy the aggregate device
    let status = unsafe { AudioHardwareDestroyAggregateDevice(self.device_id) };
    if status != 0 {
      return Err(CoreAudioError::AudioHardwareDestroyAggregateDeviceFailed(status).into());
    }

    // Destroy the process tap
    let status = unsafe { AudioHardwareDestroyProcessTap(self.device_id) };
    if status != 0 {
      return Err(CoreAudioError::AudioHardwareDestroyProcessTapFailed(status).into());
    }

    Ok(())
  }

  #[napi(getter)]
  pub fn get_sample_rate(&self) -> f64 {
    self.audio_stats.sample_rate
  }

  #[napi(getter)]
  pub fn get_channels(&self) -> u32 {
    self.audio_stats.channels
  }
}
