use thiserror::Error;

#[derive(Error, Debug)]
pub enum WindowsAudioError {
  #[error("Failed to initialize COM: {0}")]
  ComInitializationFailed(String),
  #[error("Failed to create device enumerator: {0}")]
  DeviceEnumeratorCreationFailed(String),
  #[error("Failed to get default audio endpoint: {0}")]
  DefaultAudioEndpointFailed(String),
  #[error("Failed to activate audio session manager: {0}")]
  AudioSessionManagerActivationFailed(String),
  #[error("Failed to register session notification: {0}")]
  SessionNotificationRegistrationFailed(String),
  #[error("Failed to get session enumerator: {0}")]
  SessionEnumeratorFailed(String),
  #[error("Failed to get session count: {0}")]
  SessionCountFailed(String),
  #[error("Failed to get session: {0}")]
  GetSessionFailed(String),
  #[error("Failed to get process ID: {0}")]
  ProcessIdFailed(String),
  #[error("Failed to get session state: {0}")]
  SessionStateFailed(String),
  #[error("Failed to register audio session notification: {0}")]
  AudioSessionNotificationFailed(String),
  #[error("Failed to unregister audio session notification: {0}")]
  AudioSessionUnregisterFailed(String),
  #[error("Failed to open process: {0}")]
  ProcessOpenFailed(String),
  #[error("Failed to get process name: {0}")]
  ProcessNameFailed(String),
}

impl From<WindowsAudioError> for napi::Error {
  fn from(value: WindowsAudioError) -> Self {
    napi::Error::new(napi::Status::GenericFailure, value.to_string())
  }
}
