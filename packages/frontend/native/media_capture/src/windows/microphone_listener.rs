use std::{
  ffi::OsString,
  os::windows::ffi::OsStringExt,
  process,
  sync::{
    Arc, Mutex,
    atomic::{AtomicBool, AtomicUsize, Ordering},
  },
};

use napi::{
  Result,
  threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use windows::{
  Win32::{
    Foundation::CloseHandle,
    Media::Audio::{
      AudioSessionState, AudioSessionStateActive, DEVICE_STATE_ACTIVE, IAudioSessionControl, IAudioSessionControl2,
      IAudioSessionEnumerator, IAudioSessionEvents, IAudioSessionEvents_Impl, IAudioSessionManager2,
      IAudioSessionNotification, IAudioSessionNotification_Impl, IMMDevice, IMMDeviceCollection, IMMDeviceEnumerator,
      MMDeviceEnumerator, eCapture, eCommunications, eConsole,
    },
    System::{
      Com::{CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx},
      ProcessStatus::{GetModuleFileNameExW, GetProcessImageFileNameW},
      Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ},
    },
  },
  core::Interface,
};
use windows_core::implement;

pub struct AudioProcess {
  pub process_name: String,
  pub process_id: u32,
  pub device_id: String,
  pub device_name: String,
  pub is_running: bool,
}

pub struct AudioDevice {
  pub device_id: String,
  pub device_name: String,
  pub is_default_communications: bool,
  pub is_default_console: bool,
  pub has_active_sessions: bool,
}

// Simple struct for callback data - not a NAPI object
#[derive(Clone)]
pub struct MicrophoneActivateCallback {
  pub is_running: bool,
  pub process_name: String,
  pub device_id: String,
  pub device_name: String,
}

#[implement(IAudioSessionEvents)]
struct SessionEvents {
  process_name: String,
  device_id: String,
  device_name: String,
  callback: Arc<ThreadsafeFunction<(bool, String, String, String)>>,
  ctrl: IAudioSessionControl,
  events_ref: Arc<Mutex<Option<IAudioSessionEvents>>>,
  is_running: Arc<AtomicBool>,
  active_sessions: Arc<AtomicUsize>,
  session_is_active: AtomicBool,
}

impl IAudioSessionEvents_Impl for SessionEvents_Impl {
  fn OnChannelVolumeChanged(
    &self,
    _channelcount: u32,
    _newchannelvolumearray: *const f32,
    _changedchannel: u32,
    _eventcontext: *const windows_core::GUID,
  ) -> windows_core::Result<()> {
    Ok(())
  }

  fn OnDisplayNameChanged(
    &self,
    _newdisplayname: &windows_core::PCWSTR,
    _eventcontext: *const windows_core::GUID,
  ) -> windows_core::Result<()> {
    Ok(())
  }

  fn OnGroupingParamChanged(
    &self,
    _newgroupingparam: *const windows_core::GUID,
    _eventcontext: *const windows_core::GUID,
  ) -> windows_core::Result<()> {
    Ok(())
  }

  fn OnIconPathChanged(
    &self,
    _newiconpath: &windows_core::PCWSTR,
    _eventcontext: *const windows_core::GUID,
  ) -> windows_core::Result<()> {
    Ok(())
  }

  fn OnSessionDisconnected(
    &self,
    _disconnectreason: windows::Win32::Media::Audio::AudioSessionDisconnectReason,
  ) -> windows_core::Result<()> {
    if let Some(events) = self.events_ref.lock().unwrap().take() {
      unsafe { self.ctrl.UnregisterAudioSessionNotification(&events)? };
    }

    // If this session was active, decrement the global counter
    if self.session_is_active.swap(false, Ordering::SeqCst) {
      let prev = self.active_sessions.fetch_sub(1, Ordering::SeqCst);
      if prev == 1 {
        // Last active session ended
        self.is_running.store(false, Ordering::Relaxed);
        // Notify JS side that recording has stopped
        self.callback.call(
          Ok((
            false,
            self.process_name.clone(),
            self.device_id.clone(),
            self.device_name.clone(),
          )),
          ThreadsafeFunctionCallMode::NonBlocking,
        );
      }
    }
    Ok(())
  }

  fn OnSimpleVolumeChanged(
    &self,
    _newvolume: f32,
    _newmute: windows_core::BOOL,
    _eventcontext: *const windows_core::GUID,
  ) -> windows_core::Result<()> {
    Ok(())
  }

  fn OnStateChanged(&self, newstate: AudioSessionState) -> windows_core::Result<()> {
    // Determine the new recording state for this session
    let currently_recording = newstate == AudioSessionStateActive;

    // Atomically swap the flag tracking this particular session
    let previously_recording = self.session_is_active.swap(currently_recording, Ordering::SeqCst);

    // Update the global counter accordingly
    if !previously_recording && currently_recording {
      // Session started
      let prev = self.active_sessions.fetch_add(1, Ordering::SeqCst);
      if prev == 0 {
        // First active session across the whole system
        self.is_running.store(true, Ordering::Relaxed);
      }
    } else if previously_recording && !currently_recording {
      // Session stopped
      let prev = self.active_sessions.fetch_sub(1, Ordering::SeqCst);
      if prev == 1 {
        // Last active session just stopped
        self.is_running.store(false, Ordering::Relaxed);
      }
    }

    let overall_is_running = self.active_sessions.load(Ordering::SeqCst) > 0;

    // Notify JS side (non-blocking)
    self.callback.call(
      Ok((
        overall_is_running,
        self.process_name.clone(),
        self.device_id.clone(),
        self.device_name.clone(),
      )),
      ThreadsafeFunctionCallMode::NonBlocking,
    );

    Ok(())
  }
}

#[implement(IAudioSessionNotification)]
struct SessionNotifier {
  _mgr: IAudioSessionManager2, // keep mgr alive
  device_id: String,
  device_name: String,
  ctrl: Mutex<Option<(IAudioSessionControl2, IAudioSessionEvents)>>, /* keep the ctrl2 and
                                                                      * events alive */
  callback: Arc<ThreadsafeFunction<(bool, String, String, String)>>,
  is_running: Arc<AtomicBool>,       // Shared is_running flag
  active_sessions: Arc<AtomicUsize>, // Global counter of active sessions
}

impl SessionNotifier {
  fn new(
    mgr: &IAudioSessionManager2,
    device_id: String,
    device_name: String,
    callback: Arc<ThreadsafeFunction<(bool, String, String, String)>>,
    is_running: Arc<AtomicBool>,
    active_sessions: Arc<AtomicUsize>,
  ) -> Self {
    Self {
      _mgr: mgr.clone(),
      device_id,
      device_name,
      ctrl: Default::default(),
      callback,
      is_running,
      active_sessions,
    }
  }

  fn refresh_state(&self, ctrl: &IAudioSessionControl) -> windows_core::Result<()> {
    let ctrl2: IAudioSessionControl2 = ctrl.cast()?;
    let process_id = unsafe { ctrl2.GetProcessId()? };

    // Skip current process to avoid self-detection
    if process_id == process::id() {
      return Ok(());
    }

    let process_name = match get_process_name(process_id) {
      Some(n) => n,
      None => unsafe { ctrl2.GetDisplayName()?.to_string()? },
    };
    // Skip system-sounds session
    // The `IsSystemSoundsSession` always true for unknown reason
    if process_name.contains("AudioSrv") {
      return Ok(());
    }

    // Active ⇒ microphone is recording
    if unsafe { ctrl.GetState()? } == AudioSessionStateActive {
      let mut should_notify = false;
      if let Ok(mut optional_ctrl) = self.ctrl.lock() {
        // Increment the active session counter. If this was the first, flip is_running
        // to true.
        let prev = self.active_sessions.fetch_add(1, Ordering::SeqCst);
        if prev == 0 {
          self.is_running.store(true, Ordering::Relaxed);
        }

        let events_ref = Arc::new(Mutex::new(None));
        let events: IAudioSessionEvents = SessionEvents {
          callback: self.callback.clone(),
          process_name: process_name.clone(),
          device_id: self.device_id.clone(),
          device_name: self.device_name.clone(),
          events_ref: events_ref.clone(),
          ctrl: ctrl.clone(),
          is_running: self.is_running.clone(),
          active_sessions: self.active_sessions.clone(),
          session_is_active: AtomicBool::new(true),
        }
        .into();
        let mut events_mut_ref = events_ref.lock().unwrap();
        *events_mut_ref = Some(events.clone());
        unsafe { ctrl.RegisterAudioSessionNotification(&events)? };
        // keep the ctrl2 alive so that the notification can be called
        *optional_ctrl = Some((ctrl2, events));

        should_notify = true;
      }

      if should_notify {
        self.callback.call(
          Ok((true, process_name, self.device_id.clone(), self.device_name.clone())),
          ThreadsafeFunctionCallMode::NonBlocking,
        );
      }
      return Ok(());
    }
    Ok(())
  }
}

impl IAudioSessionNotification_Impl for SessionNotifier_Impl {
  fn OnSessionCreated(
    &self,
    ctrl_ref: windows_core::Ref<'_, windows::Win32::Media::Audio::IAudioSessionControl>,
  ) -> windows_core::Result<()> {
    let Some(ctrl) = ctrl_ref.as_ref() else {
      return Ok(());
    };
    self.refresh_state(ctrl)?;
    Ok(())
  }
}

pub fn register_audio_device_status_callback(
  is_running: Arc<AtomicBool>,
  active_sessions: Arc<AtomicUsize>,
  callback: Arc<ThreadsafeFunction<(bool, String, String, String)>>,
) -> windows_core::Result<Vec<IAudioSessionNotification>> {
  unsafe {
    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;

    // Get all active capture devices
    let device_collection: IMMDeviceCollection = enumerator.EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE)?;

    let device_count = device_collection.GetCount()?;
    let mut session_notifiers = Vec::new();

    for i in 0..device_count {
      let device: IMMDevice = device_collection.Item(i)?;

      // Device identifiers
      let device_id_pwstr = device.GetId()?;
      let device_id = device_id_pwstr.to_string()?;
      let device_name = format!("Audio Device {}", i);

      // Activate session manager for this device
      let mgr: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;

      // Create notifier for this device
      let session_notifier = SessionNotifier::new(
        &mgr,
        device_id.clone(),
        device_name.clone(),
        callback.clone(),
        is_running.clone(),
        active_sessions.clone(),
      );

      // Enumerate existing sessions to update counters and state immediately
      let list: IAudioSessionEnumerator = mgr.GetSessionEnumerator()?;
      let sessions = list.GetCount()?;
      for idx in 0..sessions {
        let ctrl = list.GetSession(idx)?;
        session_notifier.refresh_state(&ctrl)?;
      }

      let session_notifier_impl: IAudioSessionNotification = session_notifier.into();
      mgr.RegisterSessionNotification(&session_notifier_impl)?;

      session_notifiers.push(session_notifier_impl);
    }

    Ok(session_notifiers)
  }
}

pub struct MicrophoneListener {
  _session_notifiers: Vec<IAudioSessionNotification>, // keep the session_notifiers alive
  is_running: Arc<AtomicBool>,
}

impl MicrophoneListener {
  pub fn new(callback: ThreadsafeFunction<(bool, String, String, String)>) -> Self {
    unsafe {
      if CoInitializeEx(None, COINIT_MULTITHREADED).is_err() {
        // If COM initialization fails, create a listener with empty notifiers
        return Self {
          is_running: Arc::new(AtomicBool::new(false)),
          _session_notifiers: Vec::new(),
        };
      }
    };

    let is_running = Arc::new(AtomicBool::new(false));
    let active_sessions = Arc::new(AtomicUsize::new(0));

    let session_notifiers =
      match register_audio_device_status_callback(is_running.clone(), active_sessions.clone(), Arc::new(callback)) {
        Ok(notifiers) => notifiers,
        Err(_) => {
          // If registration fails, create a listener with empty notifiers
          Vec::new()
        }
      };

    Self {
      is_running,
      _session_notifiers: session_notifiers,
    }
  }

  pub fn is_running(&self) -> bool {
    self.is_running.load(Ordering::Relaxed)
  }

  // Static method to check if a specific process is using microphone
  // This is used by TappableApplication::is_running()
  pub fn is_process_using_microphone(process_id: u32) -> bool {
    // Use the proven get_all_audio_processes logic
    match get_all_audio_processes() {
      Ok(processes) => processes.iter().any(|p| p.process_id == process_id && p.is_running),
      Err(_) => false,
    }
  }
}

fn get_mgr_audio_session_running_status(mgr: &IAudioSessionManager2) -> windows_core::Result<(bool, String)> {
  let list: IAudioSessionEnumerator = unsafe { mgr.GetSessionEnumerator()? };
  let sessions = unsafe { list.GetCount()? };
  for idx in 0..sessions {
    let ctrl = unsafe { list.GetSession(idx)? };
    let ctrl2: IAudioSessionControl2 = ctrl.cast()?;
    let process_id = unsafe { ctrl2.GetProcessId()? };

    // Skip current process to avoid self-detection
    if process_id == process::id() {
      continue;
    }

    let process_name = match get_process_name(process_id) {
      Some(n) => n,
      None => unsafe { ctrl2.GetDisplayName()?.to_string()? },
    };
    // Skip system-sounds session
    // The `IsSystemSoundsSession` always true for unknown reason
    if process_name.contains("AudioSrv") {
      continue;
    }

    // Active ⇒ microphone is recording
    if unsafe { ctrl.GetState()? } == AudioSessionStateActive {
      return Ok((true, process_name));
    }
  }
  Ok((false, String::new()))
}

fn get_process_name(pid: u32) -> Option<String> {
  unsafe {
    // Open process with required access rights
    let process_handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid).ok()?;

    // Allocate a buffer large enough to hold extended-length paths (up to ~32K
    // characters) instead of the legacy MAX_PATH (260) limit.
    let mut buffer: Vec<u16> = std::iter::repeat(0).take(32_768).collect();

    // Try GetModuleFileNameExW first (gives full path with extension)
    let length = GetModuleFileNameExW(
      Some(process_handle),
      None, // NULL for the process executable
      &mut buffer,
    );

    // If that fails, try GetProcessImageFileNameW
    let length = if length == 0 {
      GetProcessImageFileNameW(process_handle, &mut buffer)
    } else {
      length
    };

    // Clean up
    CloseHandle(process_handle).ok()?;

    if length == 0 {
      return None;
    }

    // Convert to OsString then to a regular String. Truncate buffer first.
    buffer.truncate(length as usize);
    let os_string = OsString::from_wide(&buffer);

    // Extract the file name from the path
    let path_str = os_string.to_string_lossy().to_string();
    path_str.rsplit('\\').next().map(|s| s.to_string())
  }
}

pub fn list_audio_processes() -> Result<Vec<AudioProcess>> {
  unsafe {
    // Try to initialize COM, but don't fail if it's already initialized
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
  };

  let result =
    get_all_audio_processes().map_err(|err| napi::Error::new(napi::Status::GenericFailure, err.message()))?;

  Ok(result)
}

pub fn list_audio_devices() -> Result<Vec<AudioDevice>> {
  unsafe {
    // Try to initialize COM, but don't fail if it's already initialized
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
  };

  let result = get_all_audio_devices().map_err(|err| napi::Error::new(napi::Status::GenericFailure, err.message()))?;

  Ok(result)
}

fn get_all_audio_processes() -> windows_core::Result<Vec<AudioProcess>> {
  unsafe {
    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;

    let device_collection: IMMDeviceCollection = enumerator.EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE)?;

    let device_count = device_collection.GetCount()?;
    let mut all_processes = Vec::new();
    let current_pid = process::id();

    for i in 0..device_count {
      let device: IMMDevice = device_collection.Item(i)?;

      let device_id_pwstr = device.GetId()?;
      let device_id = device_id_pwstr.to_string()?;
      let device_name = format!("Audio Device {}", i);

      let mgr: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
      let list: IAudioSessionEnumerator = mgr.GetSessionEnumerator()?;
      let sessions = list.GetCount()?;

      for idx in 0..sessions {
        let ctrl = list.GetSession(idx)?;
        let ctrl2: IAudioSessionControl2 = ctrl.cast()?;
        let process_id = ctrl2.GetProcessId()?;

        // Skip current process to avoid self-detection
        if process_id == current_pid {
          continue;
        }

        let process_name = match get_process_name(process_id) {
          Some(n) => n,
          None => ctrl2.GetDisplayName()?.to_string()?,
        };

        // Skip system-sounds session
        if process_name.contains("AudioSrv") {
          continue;
        }

        let is_running = ctrl.GetState()? == AudioSessionStateActive;

        all_processes.push(AudioProcess {
          process_name,
          process_id,
          device_id: device_id.clone(),
          device_name: device_name.clone(),
          is_running,
        });
      }
    }

    Ok(all_processes)
  }
}

fn get_all_audio_devices() -> windows_core::Result<Vec<AudioDevice>> {
  unsafe {
    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;

    let device_collection: IMMDeviceCollection = enumerator.EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE)?;

    let device_count = device_collection.GetCount()?;
    let mut devices = Vec::new();

    // Get default devices for comparison
    let default_comm_device_id = enumerator
      .GetDefaultAudioEndpoint(eCapture, eCommunications)
      .and_then(|d| d.GetId())
      .and_then(|id| Ok(id.to_string().unwrap_or_default()))
      .ok();
    let default_console_device_id = enumerator
      .GetDefaultAudioEndpoint(eCapture, eConsole)
      .and_then(|d| d.GetId())
      .and_then(|id| Ok(id.to_string().unwrap_or_default()))
      .ok();

    for i in 0..device_count {
      let device: IMMDevice = device_collection.Item(i)?;

      let device_id_pwstr = device.GetId()?;
      let device_id = device_id_pwstr.to_string()?;
      let device_name = format!("Audio Device {}", i);

      let is_default_communications = default_comm_device_id.as_ref() == Some(&device_id);
      let is_default_console = default_console_device_id.as_ref() == Some(&device_id);

      let mgr: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
      let (has_active_sessions, _) = get_mgr_audio_session_running_status(&mgr)?;

      devices.push(AudioDevice {
        device_id,
        device_name,
        is_default_communications,
        is_default_console,
        has_active_sessions,
      });
    }

    Ok(devices)
  }
}

pub fn get_active_audio_processes() -> Result<Vec<AudioProcess>> {
  unsafe {
    // Try to initialize COM, but don't fail if it's already initialized
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
  };

  let result =
    get_all_audio_processes().map_err(|err| napi::Error::new(napi::Status::GenericFailure, err.message()))?;

  // Filter to only return active/running processes
  let active_processes = result.into_iter().filter(|p| p.is_running).collect();
  Ok(active_processes)
}

pub fn is_process_actively_using_microphone(pid: u32) -> Result<bool> {
  unsafe {
    // Try to initialize COM, but don't fail if it's already initialized
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
  };

  let result =
    get_all_audio_processes().map_err(|err| napi::Error::new(napi::Status::GenericFailure, err.message()))?;

  // Check if the PID exists in the list of active processes
  let is_active = result
    .iter()
    .any(|process| process.process_id == pid && process.is_running);

  Ok(is_active)
}
