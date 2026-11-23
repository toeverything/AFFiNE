use thiserror::Error;

#[derive(Error, Debug)]
pub enum CoreAudioError {
  #[error("Map pid {0} to AudioObjectID failed")]
  PidNotFound(i32),
  #[error("Create process tap failed, status: {0}")]
  CreateProcessTapFailed(i32),
  #[error("Get default device failed, status: {0}")]
  GetDefaultDeviceFailed(i32),
  #[error("Get device uid failed, status: {0}")]
  GetDeviceUidFailed(i32),
  #[error("Create aggregate device failed, status: {0}")]
  CreateAggregateDeviceFailed(i32),
  #[error("Get process object list size failed, status: {0}")]
  GetProcessObjectListSizeFailed(i32),
  #[error("Get process object list failed, status: {0}")]
  GetProcessObjectListFailed(i32),
  #[error("AudioObjectGetPropertyDataSize failed, status: {0}")]
  AudioObjectGetPropertyDataSizeFailed(i32),
  #[error("CATapDescription class not found")]
  CATapDescriptionClassNotFound,
  #[error("Alloc CATapDescription failed")]
  AllocCATapDescriptionFailed,
  #[error("Call initStereoMixdownOfProcesses on CATapDescription failed")]
  InitStereoMixdownOfProcessesFailed,
  #[error("Call initStereoGlobalTapButExcludeProcesses on CATapDescription failed")]
  InitStereoGlobalTapButExcludeProcessesFailed,
  #[error("Get UUID on CATapDescription failed")]
  GetCATapDescriptionUUIDFailed,
  #[error("Get mute behavior on CATapDescription failed")]
  GetMuteBehaviorFailed,
  #[error("Convert UUID to CFString failed")]
  ConvertUUIDToCFStringFailed,
  #[error("Get AudioStreamBasicDescription failed, status: {0}")]
  GetAudioStreamBasicDescriptionFailed(i32),
  #[error("AVAudioFormat class not found")]
  AVAudioFormatClassNotFound,
  #[error("Alloc AVAudioFormat failed")]
  AllocAVAudioFormatFailed,
  #[error("Init AVAudioFormat failed")]
  InitAVAudioFormatFailed,
  #[error("Create IOProcIDWithBlock failed, status: {0}")]
  CreateIOProcIDWithBlockFailed(i32),
  #[error("Get hardware devices failed, status: {0}")]
  GetHardwareDevicesFailed(i32),
  #[error("AudioDeviceStart failed, status: {0}")]
  AudioDeviceStartFailed(i32),
  #[error("AudioDeviceStop failed, status: {0}")]
  AudioDeviceStopFailed(i32),
  #[error("AudioDeviceDestroyIOProcID failed, status: {0}")]
  AudioDeviceDestroyIOProcIDFailed(i32),
  #[error("AudioHardwareDestroyAggregateDevice failed, status: {0}")]
  AudioHardwareDestroyAggregateDeviceFailed(i32),
  #[error("AudioHardwareDestroyProcessTap failed, status: {0}")]
  AudioHardwareDestroyProcessTapFailed(i32),
  #[error("Get aggregate device property full sub device list failed, status: {0}")]
  GetAggregateDevicePropertyFullSubDeviceListFailed(i32),
  #[error("Add property listener block failed, status: {0}")]
  AddPropertyListenerBlockFailed(i32),
  #[error("AudioObjectGetPropertyData failed, status: {0}")]
  AudioObjectGetPropertyDataFailed(i32),
  #[error("AVAudioFile class not found")]
  AVAudioFileClassNotFound,
  #[error("Alloc AVAudioFile failed")]
  AllocAVAudioFileFailed,
  #[error("Init AVAudioFile failed")]
  InitAVAudioFileFailed,
  #[error("AVAudioPCMBuffer class not found")]
  AVAudioPCMBufferClassNotFound,
  #[error("Alloc AVAudioPCMBuffer failed")]
  AllocAVAudioPCMBufferFailed,
  #[error("Init AVAudioPCMBuffer failed")]
  InitAVAudioPCMBufferFailed,
  #[error("Write AVAudioFile failed")]
  WriteAVAudioFileFailed,
  #[error("Input frame contains no data")]
  InputFrameContainsNoData,
  #[error("Output frame contains no data")]
  OutputFrameContainsNoData,
  #[error("Get property data size failed, status: {0}")]
  GetPropertyDataSizeFailed(i32),
  #[error("Get property data failed, status: {0}")]
  GetPropertyDataFailed(i32),
  #[error("Process audio {0} frame failed")]
  ProcessAudioFrameFailed(&'static str),
}

impl From<CoreAudioError> for napi::Error {
  fn from(value: CoreAudioError) -> Self {
    napi::Error::new(napi::Status::GenericFailure, value.to_string())
  }
}
