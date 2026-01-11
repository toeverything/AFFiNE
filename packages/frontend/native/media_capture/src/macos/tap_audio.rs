use std::{ffi::c_void, ptr, sync::Arc};

use block2::{Block, RcBlock};
use core_foundation::{
  base::{CFType, ItemRef, TCFType},
  dictionary::CFDictionary,
  string::CFString,
  uuid::CFUUID,
};
use coreaudio::sys::{
  AudioDeviceCreateIOProcIDWithBlock, AudioDeviceDestroyIOProcID, AudioDeviceIOProcID, AudioDeviceStart,
  AudioDeviceStop, AudioHardwareCreateAggregateDevice, AudioHardwareDestroyAggregateDevice,
  AudioObjectAddPropertyListenerBlock, AudioObjectGetPropertyDataSize, AudioObjectID, AudioObjectPropertyAddress,
  AudioObjectRemovePropertyListenerBlock, AudioTimeStamp, OSStatus, kAudioAggregateDeviceClockDeviceKey,
  kAudioAggregateDeviceIsPrivateKey, kAudioAggregateDeviceIsStackedKey, kAudioAggregateDeviceMainSubDeviceKey,
  kAudioAggregateDeviceNameKey, kAudioAggregateDeviceSubDeviceListKey, kAudioAggregateDeviceTapAutoStartKey,
  kAudioAggregateDeviceTapListKey, kAudioAggregateDeviceUIDKey, kAudioDevicePropertyDeviceIsAlive,
  kAudioDevicePropertyNominalSampleRate, kAudioHardwareBadDeviceError, kAudioHardwareBadStreamError,
  kAudioHardwareNoError, kAudioHardwarePropertyDefaultInputDevice, kAudioHardwarePropertyDefaultOutputDevice,
  kAudioObjectPropertyElementMain, kAudioObjectPropertyScopeGlobal, kAudioObjectSystemObject, kAudioSubDeviceUIDKey,
  kAudioSubTapUIDKey,
};
use napi::{
  bindgen_prelude::{Float32Array, Result, Status},
  threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use napi_derive::napi;
use objc2::runtime::AnyObject;

use crate::{
  audio_buffer::InputAndOutputAudioBufferList,
  ca_tap_description::CATapDescription,
  cf_types::CFDictionaryBuilder,
  device::get_device_uid,
  error::CoreAudioError,
  queue::create_audio_tap_queue,
  screen_capture_kit::ApplicationInfo,
  utils::{cfstring_from_bytes_with_nul, get_global_main_property},
};

unsafe extern "C" {
  fn AudioHardwareCreateProcessTap(inDescription: *mut AnyObject, outTapID: *mut AudioObjectID) -> OSStatus;

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
  pub output_device_id: AudioObjectID,
  pub input_proc_id: Option<AudioDeviceIOProcID>,
  pub output_proc_id: Option<AudioDeviceIOProcID>,
}

impl AggregateDevice {
  pub fn new(app: &ApplicationInfo) -> Result<Self> {
    let object_id = app.object_id;

    let tap_description = CATapDescription::init_stereo_mixdown_of_processes(object_id)?;
    let mut tap_id: AudioObjectID = 0;

    let status = unsafe { AudioHardwareCreateProcessTap(tap_description.inner, &mut tap_id) };

    if status != 0 {
      return Err(CoreAudioError::CreateProcessTapFailed(status).into());
    }

    let (input_device_id, default_input_uid) = get_device_uid(kAudioHardwarePropertyDefaultInputDevice)?;

    // Get the default output device ID
    let (output_device_id, output_device_uid) = get_device_uid(kAudioHardwarePropertyDefaultOutputDevice)?;
    let description_dict = Self::create_aggregate_description(
      tap_id,
      tap_description.get_uuid()?,
      default_input_uid,
      output_device_uid,
    )?;

    let mut aggregate_device_id: AudioObjectID = 0;

    let status = unsafe {
      AudioHardwareCreateAggregateDevice(description_dict.as_concrete_TypeRef().cast(), &mut aggregate_device_id)
    };

    if status != 0 {
      return Err(CoreAudioError::CreateAggregateDeviceFailed(status).into());
    }

    Ok(Self {
      tap_id,
      id: aggregate_device_id,
      audio_stats: None,
      input_device_id,
      output_device_id,
      input_proc_id: None,
      output_proc_id: None,
    })
  }

  pub fn create_global_tap_but_exclude_processes(processes: &[AudioObjectID]) -> Result<Self> {
    let mut tap_id: AudioObjectID = 0;
    let tap_description = CATapDescription::init_stereo_global_tap_but_exclude_processes(processes)?;
    let status = unsafe { AudioHardwareCreateProcessTap(tap_description.inner, &mut tap_id) };

    if status != 0 {
      return Err(CoreAudioError::CreateProcessTapFailed(status).into());
    }

    // Get the default input device (microphone) UID and ID
    let (input_device_id, default_input_uid) = get_device_uid(kAudioHardwarePropertyDefaultInputDevice)?;

    // Get the default output device ID
    let (output_device_id, output_device_uid) = get_device_uid(kAudioHardwarePropertyDefaultOutputDevice)?;

    let description_dict = Self::create_aggregate_description(
      tap_id,
      tap_description.get_uuid()?,
      default_input_uid,
      output_device_uid,
    )?;

    let mut aggregate_device_id: AudioObjectID = 0;

    let status = unsafe {
      AudioHardwareCreateAggregateDevice(description_dict.as_concrete_TypeRef().cast(), &mut aggregate_device_id)
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
      output_device_id,
      input_proc_id: None,
      output_proc_id: None,
    };

    // Restore the activation logic as it seems necessary for audio flow
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
    get_global_main_property(self.id, kAudioDevicePropertyNominalSampleRate, &mut sample_rate)?;

    let audio_stats = AudioStats {
      sample_rate,
      channels: 2,
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
      // Clean up the IO proc if AudioDeviceStart fails
      let _ = unsafe { AudioDeviceDestroyIOProcID(device_id, dummy_proc_id) };
      return Err(CoreAudioError::AudioDeviceStartFailed(status).into());
    }

    // Return the proc ID for later cleanup
    Ok(dummy_proc_id)
  }

  /// Implementation for the AggregateDevice to start processing audio
  pub fn start(
    &mut self,
    audio_stream_callback: Arc<ThreadsafeFunction<Float32Array, (), Float32Array, Status, true>>,
    // Add original_audio_stats to ensure consistent target rate
    original_audio_stats: AudioStats,
  ) -> Result<AudioTapStream> {
    let mut current_audio_stats = self.get_aggregate_device_stats()?;

    let queue = create_audio_tap_queue();
    let mut in_proc_id: AudioDeviceIOProcID = None;

    // Get the current input and output sample rates
    let mut input_device_sample_rate: f64 = 0.0;
    get_global_main_property(
      self.input_device_id,
      kAudioDevicePropertyNominalSampleRate,
      &mut input_device_sample_rate,
    )?;

    let output_sample_rate = current_audio_stats.sample_rate;
    // Use the consistent original sample rate as the target for the IO block
    let target_sample_rate = original_audio_stats.sample_rate;

    // Update the device's reported stats to the consistent one
    current_audio_stats.sample_rate = target_sample_rate;
    current_audio_stats.channels = original_audio_stats.channels;
    self.audio_stats = Some(current_audio_stats);

    // Use the consistent stats for the stream object returned
    let audio_stats_for_stream = current_audio_stats;

    let in_io_block: RcBlock<dyn Fn(*mut c_void, *mut c_void, *mut c_void, *mut c_void, *mut c_void) -> i32>;
    {
      in_io_block = RcBlock::new(
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
          let Ok(dua_audio_buffer_list) = (unsafe { InputAndOutputAudioBufferList::from_raw(in_input_data) }) else {
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
          audio_stream_callback.call(Ok(mixed_samples.into()), ThreadsafeFunctionCallMode::NonBlocking);

          kAudioHardwareNoError as i32
        },
      );
    }

    let status = unsafe {
      AudioDeviceCreateIOProcIDWithBlock(
        &mut in_proc_id,
        self.id,
        dispatch2::DispatchRetained::as_ptr(&queue).as_ptr().cast(),
        (&*in_io_block as *const Block<dyn Fn(*mut c_void, *mut c_void, *mut c_void, *mut c_void, *mut c_void) -> i32>)
          .cast_mut()
          .cast(),
      )
    };
    if status != 0 {
      return Err(CoreAudioError::CreateIOProcIDWithBlockFailed(status).into());
    }

    let status = unsafe { AudioDeviceStart(self.id, in_proc_id) };
    if status != 0 {
      // Attempt to clean up the IO proc if start failed
      let _cleanup_status = unsafe { AudioDeviceDestroyIOProcID(self.id, in_proc_id) };
      return Err(CoreAudioError::AudioDeviceStartFailed(status).into());
    }

    Ok(AudioTapStream {
      device_id: self.id,
      in_proc_id,
      stop_called: false,
      audio_stats: audio_stats_for_stream,
      input_device_id: self.input_device_id,
      output_device_id: self.output_device_id,
      input_proc_id: self.input_proc_id,
      output_proc_id: self.output_proc_id,
      queue: Some(queue),
    })
  }

  fn create_aggregate_description(
    tap_id: AudioObjectID,
    tap_uuid_string: ItemRef<CFString>,
    input_device_id: CFString,
    output_device_id: CFString,
  ) -> Result<CFDictionary<CFType, CFType>> {
    let aggregate_device_name = CFString::new(&format!("Tap-{tap_id}"));
    let aggregate_device_uid: uuid::Uuid = CFUUID::new().into();
    let aggregate_device_uid_string = aggregate_device_uid.to_string();

    let mut sub_device_input_dict = CFDictionaryBuilder::new();
    sub_device_input_dict.add(kAudioSubDeviceUIDKey.as_slice(), &input_device_id);

    let tap_device_dict = CFDictionary::from_CFType_pairs(&[(
      cfstring_from_bytes_with_nul(kAudioSubTapUIDKey).as_CFType(),
      tap_uuid_string.as_CFType(),
    )]);

    let capture_device_list = vec![sub_device_input_dict.build()];

    // Create the aggregate device description dictionary with a balanced
    // configuration

    let mut cf_dict_builder = CFDictionaryBuilder::new();

    cf_dict_builder
      .add(kAudioAggregateDeviceNameKey.as_slice(), aggregate_device_name)
      .add(kAudioAggregateDeviceUIDKey.as_slice(), aggregate_device_uid_string)
      .add(kAudioAggregateDeviceMainSubDeviceKey.as_slice(), &output_device_id)
      .add(kAudioAggregateDeviceIsPrivateKey.as_slice(), true)
      // can't be stacked because we're using a tap
      .add(kAudioAggregateDeviceIsStackedKey.as_slice(), false)
      .add(kAudioAggregateDeviceTapAutoStartKey.as_slice(), true)
      .add(kAudioAggregateDeviceSubDeviceListKey.as_slice(), capture_device_list)
      .add(kAudioAggregateDeviceClockDeviceKey.as_slice(), input_device_id)
      .add(kAudioAggregateDeviceTapListKey.as_slice(), vec![tap_device_dict]);

    Ok(cf_dict_builder.build())
  }
}

pub struct AudioTapStream {
  device_id: AudioObjectID,
  in_proc_id: AudioDeviceIOProcID,
  stop_called: bool,
  audio_stats: AudioStats,
  input_device_id: AudioObjectID,
  output_device_id: AudioObjectID,
  input_proc_id: Option<AudioDeviceIOProcID>,
  output_proc_id: Option<AudioDeviceIOProcID>,
  queue: Option<dispatch2::DispatchRetained<dispatch2::DispatchQueue>>,
}

impl AudioTapStream {
  pub fn stop(&mut self) -> Result<()> {
    if self.stop_called {
      return Ok(());
    }

    self.stop_called = true;

    // Check if device exists before attempting to stop it
    let mut device_exists = false;
    let mut dummy_size: u32 = 0;
    let device_check_status = unsafe {
      AudioObjectGetPropertyDataSize(
        self.device_id,
        &AudioObjectPropertyAddress {
          mSelector: kAudioDevicePropertyDeviceIsAlive,
          mScope: kAudioObjectPropertyScopeGlobal,
          mElement: kAudioObjectPropertyElementMain,
        },
        0,
        ptr::null(),
        &mut dummy_size,
      )
    };

    if device_check_status == 0 {
      device_exists = true;
    }

    // Stop the main aggregate device - ignore errors as device might already be
    // stopped or disconnected
    if device_exists {
      let status = unsafe { AudioDeviceStop(self.device_id, self.in_proc_id) };
      // Don't fail the whole stop process if this fails, just log the error and
      // continue cleanup
      if status != 0 {
        // kAudioHardwareBadDeviceError (560227702 / 0x2166616E in hex) indicates the
        // device is gone, which is expected in some scenarios (like device
        // unplug). Treat this as non-existent.
        if status == kAudioHardwareBadDeviceError as i32 {
          device_exists = false; // Treat as non-existent for subsequent steps
        }
      }
    }

    // Stop the input device if it was activated
    if let Some(proc_id) = self.input_proc_id {
      // Ignore errors as device might be disconnected
      let status = unsafe { AudioDeviceStop(self.input_device_id, proc_id) };
      if status != 0 {
        println!("DEBUG: WARNING: Input device stop failed with status: {status}");
      }

      let status = unsafe { AudioDeviceDestroyIOProcID(self.input_device_id, proc_id) };
      if status != 0 {
        println!("DEBUG: WARNING: Input device destroy IO proc failed with status: {status}");
      }
    }

    // Stop the output device if it was activated
    if let Some(proc_id) = self.output_proc_id {
      // Ignore errors as device might be disconnected
      let status = unsafe { AudioDeviceStop(self.output_device_id, proc_id) };
      if status != 0 {
        println!("DEBUG: WARNING: Output device stop failed with status: {status}");
      }

      let status = unsafe { AudioDeviceDestroyIOProcID(self.output_device_id, proc_id) };
      if status != 0 {
        println!("DEBUG: WARNING: Output device destroy IO proc failed with status: {status}");
      }
    }

    // Destroy the main IO proc if device still exists
    if device_exists {
      let status = unsafe { AudioDeviceDestroyIOProcID(self.device_id, self.in_proc_id) };
      if status != 0 {
        println!("DEBUG: WARNING: Destroy IO proc failed with status: {status}");
      }
    }
    let status = unsafe { AudioHardwareDestroyAggregateDevice(self.device_id) };
    if status != 0 {
      println!("DEBUG: WARNING: AudioHardwareDestroyAggregateDevice failed with status: {status}");
    }

    // Destroy the process tap - don't fail if this fails
    let status = unsafe { AudioHardwareDestroyProcessTap(self.device_id) };
    if status != 0 {
      println!("DEBUG: WARNING: AudioHardwareDestroyProcessTap failed with status: {status}");
    }

    // destroy the queue
    drop(self.queue.take());

    // Always return success to prevent errors from bubbling up to JavaScript
    // since we've made a best effort to clean up
    Ok(())
  }

  pub fn get_sample_rate(&self) -> f64 {
    self.audio_stats.sample_rate
  }

  /// Gets the actual sample rate of the current device
  ///
  /// This can be different from the original sample rate if the default device
  /// has changed. The original sample rate is maintained for consistency in
  /// audio processing, but applications might need to know the actual device
  /// sample rate for certain operations.
  pub fn get_actual_sample_rate(&self) -> Result<f64> {
    let device_id = self.output_device_id;
    let mut actual_sample_rate: f64 = 0.0;
    let status = unsafe {
      let address = AudioObjectPropertyAddress {
        mSelector: kAudioDevicePropertyNominalSampleRate,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain,
      };

      let mut size = std::mem::size_of::<f64>() as u32;
      coreaudio::sys::AudioObjectGetPropertyData(
        device_id,
        &address,
        0,
        ptr::null(),
        &mut size,
        &mut actual_sample_rate as *mut f64 as *mut c_void,
      )
    };

    if status != 0 {
      return Err(CoreAudioError::GetPropertyDataFailed(status).into());
    }

    Ok(actual_sample_rate)
  }

  pub fn get_channels(&self) -> u32 {
    self.audio_stats.channels
  }

  /// Mark the stream as stopped without performing actual cleanup
  /// This is used when the device is known to be in an invalid state
  pub fn mark_stopped_without_cleanup(&mut self) {
    self.stop_called = true;
  }
}

/// A manager for audio device handling that automatically adapts to device
/// changes
pub struct AggregateDeviceManager {
  device: AggregateDevice,
  default_devices_listener: Option<*mut c_void>,
  is_app_specific: bool,
  app_id: Option<AudioObjectID>,
  excluded_processes: Vec<AudioObjectID>,
  active_stream: Option<Arc<std::sync::Mutex<Option<AudioTapStream>>>>,
  audio_callback: Option<Arc<ThreadsafeFunction<Float32Array, (), Float32Array, Status, true>>>,
  original_audio_stats: Option<AudioStats>,
}

impl AggregateDeviceManager {
  /// Creates a new AggregateDeviceManager for a specific application
  pub fn new(app: &ApplicationInfo) -> Result<Self> {
    let device = AggregateDevice::new(app)?;

    Ok(Self {
      device,
      default_devices_listener: None,
      is_app_specific: true,
      app_id: Some(app.object_id),
      excluded_processes: Vec::new(),
      active_stream: None,
      audio_callback: None,
      original_audio_stats: None,
    })
  }

  /// Creates a new AggregateDeviceManager for global audio with option to
  /// exclude processes
  pub fn new_global(excluded_processes: &[AudioObjectID]) -> Result<Self> {
    let device = AggregateDevice::create_global_tap_but_exclude_processes(excluded_processes)?;
    Ok(Self {
      device,
      default_devices_listener: None,
      is_app_specific: false,
      app_id: None,
      excluded_processes: excluded_processes.to_vec(),
      active_stream: None,
      audio_callback: None,
      original_audio_stats: None,
    })
  }

  /// This sets up the initial stream and listeners.
  pub fn start_capture(
    &mut self,
    audio_stream_callback: Arc<ThreadsafeFunction<Float32Array, (), Float32Array, Status, true>>,
  ) -> Result<()> {
    // Store the callback for potential device switch later
    self.audio_callback = Some(audio_stream_callback.clone());

    // Create a shared reference for the active stream
    let stream_mutex = Arc::new(std::sync::Mutex::new(None));
    self.active_stream = Some(stream_mutex.clone());

    // Start the initial stream
    // Pass the initially determined consistent audio stats
    let original_audio_stats = self.device.get_aggregate_device_stats().unwrap_or(AudioStats {
      sample_rate: 48000.0, // Match fallback in setup_device_change_listeners
      channels: 2,
    });
    self.original_audio_stats = Some(original_audio_stats); // Store for listener use

    let initial_audio_tap_stream = self.device.start(audio_stream_callback.clone(), original_audio_stats)?; // Pass clone of callback

    // Setup device change listeners AFTER getting initial stats and stream
    self.setup_device_change_listeners()?;

    // Store a reference to the stream
    if let Ok(mut stream_guard) = stream_mutex.lock() {
      *stream_guard = Some(initial_audio_tap_stream);
    } else {
      println!("DEBUG: Failed to lock stream_mutex to store AudioTapStream reference");
      // If we can't store the initial stream, something is wrong.
      // Attempt to stop the stream we just created? Or just return error?
      // For now, return an error.
      return Err(napi::Error::from_reason(
        "Failed to lock internal stream mutex during startup",
      ));
    }

    Ok(())
  }

  /// Sets up listeners for default device changes
  fn setup_device_change_listeners(&mut self) -> Result<()> {
    // We need to clean up any existing listeners first
    self.cleanup_device_listeners();

    // Create a weak reference to self to avoid circular references
    let stream_arc = self.active_stream.clone();
    let callback_arc = self.audio_callback.clone();
    let is_app_specific = self.is_app_specific;
    let app_id = self.app_id;
    let excluded_processes = self.excluded_processes.clone();

    // Retrieve the stored original audio stats
    let Some(original_audio_stats) = self.original_audio_stats else {
      return Err(napi::Error::from_reason(
        "Internal error: Original audio stats not available for listener.",
      ));
    };

    // Create a block that will handle device changes
    let device_changed_block = RcBlock::new(move |_in_number_addresses: u32, _in_addresses: *mut c_void| {
      // Skip if we don't have all required information
      let Some(stream_mutex) = stream_arc.as_ref() else {
        return;
      };
      let Some(callback) = callback_arc.as_ref() else {
        return;
      };

      // Try to lock the stream mutex
      let Ok(mut stream_guard) = stream_mutex.lock() else {
        return;
      };

      // Create a new device with updated default devices
      let result: Result<AggregateDevice> = {
        if is_app_specific {
          if let Some(id) = app_id {
            // For device change listener, we need to create a minimal ApplicationInfo
            // We don't have the name here, so we'll use an empty string
            let app = ApplicationInfo::new(id as i32, String::new(), id);
            AggregateDevice::new(&app)
          } else {
            Err(CoreAudioError::CreateProcessTapFailed(0).into())
          }
        } else {
          AggregateDevice::create_global_tap_but_exclude_processes(&excluded_processes)
        }
      };

      // If we successfully created a new device, stop the old stream and start a new
      // one
      match result {
        Ok(mut new_device) => {
          // Stop and drop the old stream if it exists
          if let Some(mut old_stream) = stream_guard.take() {
            // Explicitly drop the old stream's Box before creating the new device.
            // The drop implementation handles cleanup.
            // We call stop() directly.
            let stop_result = old_stream.stop();
            match stop_result {
              Ok(_) => {}
              Err(e) => println!("DEBUG: Error stopping old stream (proceeding anyway): {e}"),
            };
            drop(old_stream); // Ensure it's dropped now
          }

          match new_device.start(callback.clone(), original_audio_stats) {
            Ok(new_stream) => {
              // Use the existing stream_guard which already holds the lock
              *stream_guard = Some(new_stream);
            }
            Err(e) => {
              println!("DEBUG: Failed to start new stream: {e}");
            }
          }
        }
        Err(e) => {
          println!("DEBUG: Failed to create new device: {e}");
        }
      }
    });

    // Create pointers to the device_changed_block that can be used in C functions
    let block_ptr = &*device_changed_block as *const Block<dyn Fn(u32, *mut c_void)>;
    let block_ptr_cast = block_ptr.cast_mut().cast();

    // Register listeners for both input and output device changes
    unsafe {
      let status = AudioObjectAddPropertyListenerBlock(
        kAudioObjectSystemObject,
        &AudioObjectPropertyAddress {
          mSelector: kAudioHardwarePropertyDefaultInputDevice,
          mScope: kAudioObjectPropertyScopeGlobal,
          mElement: kAudioObjectPropertyElementMain,
        },
        ptr::null_mut(),
        block_ptr_cast,
      );

      if status != 0 {
        println!("DEBUG: Failed to register input device listener, status: {status}");
        return Err(CoreAudioError::AddPropertyListenerBlockFailed(status).into());
      }

      let status = AudioObjectAddPropertyListenerBlock(
        kAudioObjectSystemObject,
        &AudioObjectPropertyAddress {
          mSelector: kAudioHardwarePropertyDefaultOutputDevice,
          mScope: kAudioObjectPropertyScopeGlobal,
          mElement: kAudioObjectPropertyElementMain,
        },
        ptr::null_mut(),
        block_ptr_cast,
      );

      if status != 0 {
        println!("DEBUG: Failed to register output device listener, status: {status}");
        // Clean up the first listener if the second one fails
        AudioObjectRemovePropertyListenerBlock(
          kAudioObjectSystemObject,
          &AudioObjectPropertyAddress {
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain,
          },
          ptr::null_mut(),
          block_ptr_cast,
        );
        return Err(CoreAudioError::AddPropertyListenerBlockFailed(status).into());
      }
    }

    // Store the listener pointer for cleanup
    self.default_devices_listener = Some(block_ptr_cast);

    Ok(())
  }

  /// Cleans up device change listeners
  fn cleanup_device_listeners(&mut self) {
    if let Some(listener) = self.default_devices_listener.take() {
      unsafe {
        // Add a runtime check to ensure we're not in shutdown
        let is_system_shutting_down = std::panic::catch_unwind(|| {
          // Try a simple CoreAudio API call to see if the system is still responsive
          let mut size: u32 = 0;
          AudioObjectGetPropertyDataSize(
            kAudioObjectSystemObject,
            &AudioObjectPropertyAddress {
              mSelector: kAudioHardwarePropertyDefaultInputDevice,
              mScope: kAudioObjectPropertyScopeGlobal,
              mElement: kAudioObjectPropertyElementMain,
            },
            0,
            ptr::null(),
            &mut size,
          )
        })
        .is_err();

        if is_system_shutting_down {
          // Don't try to remove listeners if the system is shutting down
          return;
        }

        // Remove input device change listener
        let status = AudioObjectRemovePropertyListenerBlock(
          kAudioObjectSystemObject,
          &AudioObjectPropertyAddress {
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain,
          },
          ptr::null_mut(),
          listener,
        );
        if status != 0 {
          // Don't log errors during shutdown to avoid additional issues
        }

        let status = AudioObjectRemovePropertyListenerBlock(
          kAudioObjectSystemObject,
          &AudioObjectPropertyAddress {
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain,
          },
          ptr::null_mut(),
          listener,
        );
        if status != 0 {
          // Don't log errors during shutdown to avoid additional issues
        }
      }
    }
  }

  /// Stops the active stream and cleans up listeners.
  pub fn stop_capture(&mut self) -> Result<()> {
    self.cleanup_device_listeners();

    let stream_to_stop = if let Some(stream_mutex) = &self.active_stream {
      if let Ok(mut stream_guard) = stream_mutex.lock() {
        stream_guard.take() // Take ownership from the Option<Arc<Mutex<...>>>
      } else {
        println!("DEBUG: Failed to lock stream mutex during stop");
        None
      }
    } else {
      None
    };

    if let Some(mut stream) = stream_to_stop {
      match stream.stop() {
        Ok(_) => {}
        Err(e) => println!("DEBUG: Error stopping stream in stop_capture (ignored): {e}"),
      }
      // Explicitly drop here after stopping
      drop(stream);
    }

    // Clear related fields
    self.active_stream = None;
    self.audio_callback = None;
    self.original_audio_stats = None;

    Ok(())
  }

  /// Gets the stats of the currently active stream, if any.
  pub fn get_current_stats(&self) -> Option<AudioStats> {
    if let Some(stream_mutex) = &self.active_stream {
      if let Ok(stream_guard) = stream_mutex.lock() {
        // Borrow the stream Option, then map to get stats
        stream_guard.as_ref().map(|stream| stream.audio_stats)
      } else {
        println!("DEBUG: Failed to lock stream mutex for get_current_stats");
        None
      }
    } else {
      None
    }
  }

  /// Gets the actual sample rate of the currently active stream's output
  /// device.
  pub fn get_current_actual_sample_rate(&self) -> Result<Option<f64>> {
    let maybe_stream_ref = if let Some(stream_mutex) = &self.active_stream {
      match stream_mutex.lock() {
        Ok(guard) => guard,
        Err(_) => {
          println!("DEBUG: Failed to lock stream mutex for get_current_actual_sample_rate");
          // Return Ok(None) or an error? Let's return None.
          return Ok(None);
        }
      }
    } else {
      return Ok(None); // No active stream manager
    };

    if let Some(stream) = maybe_stream_ref.as_ref() {
      // Call the existing non-napi method on AudioTapStream
      match stream.get_actual_sample_rate() {
        Ok(rate) => Ok(Some(rate)),
        Err(e) => {
          println!("DEBUG: Error getting actual sample rate from stream: {e}");
          // Propagate the error
          Err(e)
        }
      }
    } else {
      Ok(None) // No active stream
    }
  }
}

impl Drop for AggregateDeviceManager {
  fn drop(&mut self) {
    // Call stop_capture which handles listener cleanup and stream stopping
    match self.stop_capture() {
      Ok(_) => {}
      Err(e) => println!("DEBUG: Error during stop_capture in Drop (ignored): {e}"),
    }
  }
}

// NEW NAPI Struct: AudioCaptureSession
#[napi]
pub struct AudioCaptureSession {
  // Use Option<Box<...>> to allow taking ownership in stop()
  manager: Option<Box<AggregateDeviceManager>>,
  sample_rate: Option<f64>,
  channels: Option<u32>,
}

#[napi]
impl AudioCaptureSession {
  // Constructor called internally, not directly via NAPI
  pub(crate) fn new(manager: Box<AggregateDeviceManager>) -> Self {
    Self {
      manager: Some(manager),
      sample_rate: None,
      channels: None,
    }
  }

  #[napi]
  pub fn stop(&mut self) -> Result<()> {
    if let Some(manager) = self.manager.take() {
      // Cache the stats before dropping
      if let Some(stats) = manager.get_current_stats() {
        self.sample_rate = Some(stats.sample_rate);
        self.channels = Some(stats.channels);
      }

      // Drop the manager
      drop(manager);
      Ok(())
    } else {
      println!("DEBUG: AudioCaptureSession.stop() called, but manager was already taken");
      // Return Ok even if called multiple times, idempotent behavior
      Ok(())
    }
  }

  #[napi(getter)]
  pub fn get_sample_rate(&self) -> Result<f64> {
    if let Some(manager) = &self.manager {
      manager
        .get_current_stats()
        .map(|stats| stats.sample_rate)
        .ok_or_else(|| napi::Error::from_reason("No active audio stream to get sample rate from"))
    } else if let Some(cached_rate) = self.sample_rate {
      // Return cached value when session is stopped
      Ok(cached_rate)
    } else {
      Err(napi::Error::from_reason(
        "Audio session is stopped and no cached sample rate available",
      ))
    }
  }

  #[napi(getter)]
  pub fn get_channels(&self) -> Result<u32> {
    if let Some(manager) = &self.manager {
      manager
        .get_current_stats()
        .map(|stats| stats.channels)
        .ok_or_else(|| napi::Error::from_reason("No active audio stream to get channels from"))
    } else if let Some(cached_channels) = self.channels {
      // Return cached value when session is stopped
      Ok(cached_channels)
    } else {
      Err(napi::Error::from_reason(
        "Audio session is stopped and no cached channels available",
      ))
    }
  }

  #[napi(getter)]
  pub fn get_actual_sample_rate(&self) -> Result<f64> {
    if let Some(manager) = &self.manager {
      manager
        .get_current_actual_sample_rate()? // Propagate CoreAudioError
        .ok_or_else(|| napi::Error::from_reason("No active audio stream to get actual sample rate from"))
    } else if let Some(cached_rate) = self.sample_rate {
      // Return cached sample rate as the best approximation when session is stopped
      Ok(cached_rate)
    } else {
      Err(napi::Error::from_reason(
        "Audio session is stopped and no cached sample rate available",
      ))
    }
  }
}

// Ensure the manager is dropped if the session object is dropped without
// calling stop()
impl Drop for AudioCaptureSession {
  fn drop(&mut self) {
    // Automatically calls drop on self.manager if it's Some
    if let Some(manager) = self.manager.take() {
      drop(manager);
    }
  }
}
