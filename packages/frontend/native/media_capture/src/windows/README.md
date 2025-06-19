# Windows Audio Recording

This module provides Windows-specific audio recording functionality using the Windows Audio Session API (WASAPI).

## Features

- **Microphone Activity Detection**: Monitor when applications are using the microphone
- **Process Identification**: Identify which process is using the microphone
- **Real-time Notifications**: Get callbacks when microphone usage starts/stops

## Usage

### MicrophoneListener

The `MicrophoneListener` class provides real-time monitoring of microphone usage:

```typescript
import { MicrophoneListener } from '@affine/native';

const listener = new MicrophoneListener((isRunning: boolean, processName: string) => {
  console.log(`Microphone ${isRunning ? 'started' : 'stopped'} by ${processName}`);
});

// Check current status
console.log('Is microphone currently active:', listener.is_running());
```

### Callback Parameters

The callback receives two parameters:

- `isRunning: boolean` - Whether the microphone is currently active
- `processName: string` - Name of the process using the microphone

## Implementation Details

### Audio Session Monitoring

The implementation uses Windows Audio Session API to:

1. **Enumerate Audio Sessions**: Get all active audio sessions
2. **Monitor Session State**: Track when sessions become active/inactive
3. **Process Identification**: Map audio sessions to process names
4. **Event Handling**: Provide real-time notifications

### COM Initialization

The module automatically initializes COM (Component Object Model) with `COINIT_MULTITHREADED` for proper Windows API interaction.

### Error Handling

All Windows API errors are wrapped in `WindowsAudioError` enum and converted to NAPI errors for JavaScript consumption.

## Cross-Platform Compatibility

This Windows implementation maintains API compatibility with the macOS version, providing the same JavaScript interface while using Windows-specific APIs underneath.

## Platform Requirements

- Windows 10 or later
- Microphone access permissions
- Audio devices available

## Dependencies

- `windows` crate v0.61 with Audio and Process features
- `windows-core` crate v0.61
- `napi` and `napi-derive` for JavaScript bindings

## Technical Notes

### Thread Safety

The implementation uses thread-safe callbacks to JavaScript with `ThreadsafeFunction<(bool, String), ()>` to ensure proper communication between the Windows audio session monitoring thread and the JavaScript runtime.

### Process Name Resolution

Process names are resolved using Windows APIs:

- `GetModuleFileNameExW` for full executable path
- `GetProcessImageFileNameW` as fallback
- Automatic extraction of filename from full path

### Session Filtering

The implementation automatically filters out system audio sessions (like `AudioSrv`) to focus on user applications.
