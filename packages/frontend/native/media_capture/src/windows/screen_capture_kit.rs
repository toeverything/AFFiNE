use std::{
  collections::HashSet,
  ffi::OsString,
  os::windows::ffi::OsStringExt,
  sync::{
    Arc, LazyLock, RwLock,
    atomic::{AtomicBool, AtomicU32, Ordering},
  },
  thread,
  time::Duration,
};

use napi::{
  bindgen_prelude::{Buffer, Error, Result, Status},
  threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use napi_derive::napi;
// Windows API imports
use windows::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE}; // HWND removed
use windows::Win32::System::{
  Com::{COINIT_MULTITHREADED, CoInitializeEx},
  Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
  },
  ProcessStatus::{GetModuleFileNameExW, GetProcessImageFileNameW},
  Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ},
};

// Import the function from microphone_listener
use crate::windows::microphone_listener::is_process_actively_using_microphone;

// Type alias to match macOS API
pub type AudioObjectID = u32;

// Global storage for running applications (Windows equivalent of macOS audio
// process list)
static RUNNING_APPLICATIONS: LazyLock<RwLock<Vec<u32>>> = LazyLock::new(|| RwLock::new(get_running_processes()));

// Simple counter for generating unique handles
static NEXT_HANDLE: AtomicU32 = AtomicU32::new(1);

// Global storage for active watchers
static ACTIVE_APP_WATCHERS: LazyLock<RwLock<Vec<(u32, u32, Arc<ThreadsafeFunction<(), ()>>, Arc<AtomicBool>)>>> =
  LazyLock::new(|| RwLock::new(Vec::new()));

static ACTIVE_LIST_WATCHERS: LazyLock<RwLock<Vec<(u32, Arc<ThreadsafeFunction<(), ()>>, Arc<AtomicBool>)>>> =
  LazyLock::new(|| RwLock::new(Vec::new()));

// Plain struct for efficient transmission via napi-rs
#[napi]
#[derive(Clone)]
pub struct ApplicationInfo {
  pub process_id: i32,
  pub name: String,
  pub object_id: u32,
}

#[napi]
impl ApplicationInfo {
  #[napi(constructor)]
  pub fn new(process_id: i32, name: String, object_id: u32) -> Self {
    Self {
      process_id,
      name,
      object_id,
    }
  }

  #[napi(getter)]
  pub fn process_group_id(&self) -> i32 {
    // Windows doesn't have process groups like Unix, return the process ID
    self.process_id
  }

  #[napi(getter)]
  pub fn bundle_identifier(&self) -> String {
    // For Windows, return the fully-qualified path to the .exe on disk
    let path = get_process_executable_path(self.process_id as u32).unwrap_or_default();
    // Escape invalid filename characters for Windows
    escape_filename(&path)
  }

  #[napi(getter)]
  pub fn icon(&self) -> Buffer {
    // For now, return empty buffer. In a full implementation, you would extract
    // the icon from the executable file using Windows APIs
    Buffer::from(Vec::<u8>::new())
  }
}

#[napi]
pub struct ApplicationListChangedSubscriber {
  handle: u32,
  // We'll store the callback and manage it through a background thread
  _callback: Arc<ThreadsafeFunction<(), ()>>,
}

#[napi]
impl ApplicationListChangedSubscriber {
  #[napi]
  pub fn unsubscribe(&self) -> Result<()> {
    if let Ok(mut watchers) = ACTIVE_LIST_WATCHERS.write() {
      if let Some(pos) = watchers.iter().position(|(handle, _, _)| *handle == self.handle) {
        let (_, _, should_stop) = &watchers[pos];
        should_stop.store(true, Ordering::Relaxed);
        watchers.remove(pos);
      }
    }
    Ok(())
  }
}

#[napi]
pub struct ApplicationStateChangedSubscriber {
  handle: u32,
  process_id: u32,
  _callback: Arc<ThreadsafeFunction<(), ()>>,
}

#[napi]
impl ApplicationStateChangedSubscriber {
  pub fn process_id(&self) -> u32 {
    self.process_id
  }

  #[napi]
  pub fn unsubscribe(&self) {
    if let Ok(mut watchers) = ACTIVE_APP_WATCHERS.write() {
      if let Some(pos) = watchers.iter().position(|(handle, _, _, _)| *handle == self.handle) {
        let (_, _, _, should_stop) = &watchers[pos];
        should_stop.store(true, Ordering::Relaxed);
        watchers.remove(pos);
      }
    }
  }
}

#[napi]
pub struct ShareableContent {
  // Windows doesn't need an inner SCShareableContent equivalent
}

#[napi]
impl ShareableContent {
  #[napi]
  pub fn on_application_list_changed(callback: ThreadsafeFunction<(), ()>) -> Result<ApplicationListChangedSubscriber> {
    let handle = NEXT_HANDLE.fetch_add(1, Ordering::Relaxed);
    let callback_arc = Arc::new(callback);

    // Start monitoring for application list changes
    start_list_monitoring(handle, callback_arc.clone());

    Ok(ApplicationListChangedSubscriber {
      handle,
      _callback: callback_arc,
    })
  }

  #[napi]
  pub fn on_app_state_changed(
    app: &ApplicationInfo,
    callback: ThreadsafeFunction<(), ()>,
  ) -> Result<ApplicationStateChangedSubscriber> {
    let handle = NEXT_HANDLE.fetch_add(1, Ordering::Relaxed);
    let process_id = app.process_id as u32;
    let callback_arc = Arc::new(callback);

    // Start monitoring for this specific process's microphone state
    start_process_monitoring(handle, process_id, callback_arc.clone());

    Ok(ApplicationStateChangedSubscriber {
      handle,
      process_id,
      _callback: callback_arc,
    })
  }

  #[napi(constructor)]
  pub fn new() -> Self {
    unsafe {
      CoInitializeEx(None, COINIT_MULTITHREADED).ok().unwrap_or_else(|_| {
        // COM initialization failed, but we can't return an error from
        // constructor This is typically not fatal as COM might
        // already be initialized
      });
    }
    Self {}
  }

  #[napi]
  pub fn applications() -> Result<Vec<ApplicationInfo>> {
    let processes = RUNNING_APPLICATIONS
      .read()
      .map_err(|_| Error::new(Status::GenericFailure, "Failed to read running applications"))?;

    let mut apps = Vec::new();
    for &process_id in processes.iter() {
      let name = get_process_name(process_id).unwrap_or_else(|| format!("Process {}", process_id));
      if !name.is_empty() && name != format!("Process {}", process_id) {
        let app_info = ApplicationInfo::new(process_id as i32, name, process_id);
        apps.push(app_info);
      }
    }
    Ok(apps)
  }

  #[napi]
  pub fn application_with_process_id(process_id: u32) -> Option<ApplicationInfo> {
    if is_process_running(process_id) {
      let name = get_process_name(process_id).unwrap_or_else(|| format!("Process {}", process_id));
      Some(ApplicationInfo::new(process_id as i32, name, process_id))
    } else {
      None
    }
  }

  #[napi]
  pub fn tap_audio(
    _process_id: u32, // Currently unused - Windows captures global audio
    audio_stream_callback: ThreadsafeFunction<napi::bindgen_prelude::Float32Array, ()>,
  ) -> Result<AudioCaptureSession> {
    // On Windows with CPAL, we capture global audio (mic + loopback)
    // since per-application audio tapping isn't supported the same way as macOS
    crate::windows::audio_capture::start_recording(audio_stream_callback)
  }

  #[napi]
  pub fn tap_global_audio(
    _excluded_processes: Option<Vec<&ApplicationInfo>>,
    audio_stream_callback: ThreadsafeFunction<napi::bindgen_prelude::Float32Array, ()>,
  ) -> Result<AudioCaptureSession> {
    // Delegate to audio_capture::start_recording which handles mixing mic +
    // loopback
    crate::windows::audio_capture::start_recording(audio_stream_callback)
  }

  #[napi]
  pub fn is_using_microphone(process_id: u32) -> Result<bool> {
    is_process_actively_using_microphone(process_id)
  }
}

// Re-export the concrete audio capture session implemented in audio_capture.rs
pub use crate::windows::audio_capture::AudioCaptureSession;

// Helper function to escape invalid filename characters
fn escape_filename(path: &str) -> String {
  // Replace invalid filename characters with underscores
  // Invalid chars on Windows: < > : " | ? * \ spaces and control chars (0-31)
  path
    .chars()
    .map(|c| match c {
      '<' | '>' | ':' | '"' | '|' | '?' | '*' | '\\' | ' ' => '_',
      c if c.is_control() => '_',
      c => c,
    })
    .collect::<String>()
    .to_lowercase()
}

// Helper functions for Windows process management

fn get_running_processes() -> Vec<u32> {
  let mut processes_set = HashSet::new(); // Use HashSet to avoid duplicates from the start
  unsafe {
    let h_snapshot_result = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);

    let h_snapshot = match h_snapshot_result {
      Ok(handle) => {
        if handle == INVALID_HANDLE_VALUE {
          // eprintln!("CreateToolhelp32Snapshot returned INVALID_HANDLE_VALUE");
          return Vec::new();
        }
        handle
      }
      Err(_e) => {
        // eprintln!("CreateToolhelp32Snapshot failed: {:?}", e);
        return Vec::new();
      }
    };

    let mut pe32 = PROCESSENTRY32W::default();
    pe32.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

    if Process32FirstW(h_snapshot, &mut pe32).is_ok() {
      loop {
        processes_set.insert(pe32.th32ProcessID);
        if Process32NextW(h_snapshot, &mut pe32).is_err() {
          break;
        }
      }
    }
    CloseHandle(h_snapshot).unwrap_or_else(|_e| {
      // eprintln!("CloseHandle failed for snapshot: {:?}", e);
    });
  }
  let mut processes_vec: Vec<u32> = processes_set.into_iter().collect();
  processes_vec.sort_unstable(); // Sort for consistent ordering, though not strictly necessary for functionality
  processes_vec
}

fn is_process_running(process_id: u32) -> bool {
  unsafe {
    match OpenProcess(PROCESS_QUERY_INFORMATION, false, process_id) {
      Ok(handle) => CloseHandle(handle).is_ok(),
      Err(_) => false,
    }
  }
}

fn get_process_name(pid: u32) -> Option<String> {
  unsafe {
    let process_handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid).ok()?;
    // Allocate a buffer large enough to hold extended-length paths (up to ~32K
    // characters) instead of the legacy MAX_PATH (260) limit. 32 768 is the
    // maximum length supported by the Win32 APIs when the path is prefixed
    // with "\\?\".
    let mut buffer: Vec<u16> = std::iter::repeat(0).take(32_768).collect();

    let length = GetModuleFileNameExW(Some(process_handle), None, &mut buffer);
    CloseHandle(process_handle).ok()?;

    if length == 0 {
      return None;
    }

    // Truncate the buffer to the length returned by the Windows API before
    // doing the UTF-16 → UTF-8 conversion.
    buffer.truncate(length as usize);
    let os_string = OsString::from_wide(&buffer);
    let path_str = os_string.to_string_lossy().to_string();
    path_str.rsplit('\\').next().map(|s| s.to_string())
  }
}

fn get_process_executable_path(pid: u32) -> Option<String> {
  unsafe {
    let process_handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid).ok()?;
    // Use a buffer that can hold extended-length paths. See rationale above.
    let mut buffer: Vec<u16> = std::iter::repeat(0).take(32_768).collect();

    let length = GetProcessImageFileNameW(process_handle, &mut buffer);
    CloseHandle(process_handle).ok()?;

    if length == 0 {
      return None;
    }

    buffer.truncate(length as usize);
    let os_string = OsString::from_wide(&buffer);
    let path_str = os_string.to_string_lossy().to_string();
    Some(path_str)
  }
}

// Helper function to start monitoring a specific process
fn start_process_monitoring(handle: u32, process_id: u32, callback: Arc<ThreadsafeFunction<(), ()>>) {
  let should_stop = Arc::new(AtomicBool::new(false));
  let should_stop_clone = should_stop.clone();

  // Store the watcher info
  if let Ok(mut watchers) = ACTIVE_APP_WATCHERS.write() {
    watchers.push((handle, process_id, callback.clone(), should_stop.clone()));
  }

  // Start monitoring thread
  thread::spawn(move || {
    let mut last_state = false;

    loop {
      if should_stop_clone.load(Ordering::Relaxed) {
        break;
      }

      // Check current microphone state
      let current_state = is_process_actively_using_microphone(process_id).unwrap_or(false);

      // If state changed, trigger callback
      if current_state != last_state {
        let _ = callback.call(Ok(()), ThreadsafeFunctionCallMode::NonBlocking);
        last_state = current_state;
      }

      // Sleep for a short interval before checking again
      thread::sleep(Duration::from_millis(500));
    }
  });
}

// Helper function to start monitoring application list changes
fn start_list_monitoring(handle: u32, callback: Arc<ThreadsafeFunction<(), ()>>) {
  let should_stop = Arc::new(AtomicBool::new(false));
  let should_stop_clone = should_stop.clone();

  // Store the watcher info
  if let Ok(mut watchers) = ACTIVE_LIST_WATCHERS.write() {
    watchers.push((handle, callback.clone(), should_stop.clone()));
  }

  // Start monitoring thread
  thread::spawn(move || {
    let mut last_processes = get_running_processes();

    loop {
      if should_stop_clone.load(Ordering::Relaxed) {
        break;
      }

      // Check current process list
      let current_processes = get_running_processes();

      // If process list changed, trigger callback
      if current_processes != last_processes {
        let _ = callback.call(Ok(()), ThreadsafeFunctionCallMode::NonBlocking);
        last_processes = current_processes;

        // Update global process list
        if let Ok(mut apps) = RUNNING_APPLICATIONS.write() {
          *apps = last_processes.clone();
        }
      }

      // Sleep for a longer interval for process list changes
      thread::sleep(Duration::from_millis(2000));
    }
  });
}
