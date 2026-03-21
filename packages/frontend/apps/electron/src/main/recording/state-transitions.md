# Recording State Transitions

The desktop recording flow now uses two independent lifecycle models:

1. recording session state in Electron main, which tracks native capture/finalize.
2. artifact import state in Electron main, which tracks renderer-side doc import.

## Recording Session State

- `inactive`: no session has been created yet.
- `new`: app detected, waiting for user confirmation.
- `starting`: native session setup is in progress.
- `recording`: native capture is running.
- `finalizing`: native stop/finalize is in progress.
- `finalized`: native finalized an artifact successfully.
- `finalize_failed`: native finalize failed.
- `aborted`: native session was discarded without producing an artifact.

Only `starting`, `recording`, and `finalizing` occupy the active native slot.
`finalized`, `finalize_failed`, and `aborted` no longer block the next recording.

## Recording Artifact Import State

- `pending_import`: artifact is finalized and durable in main, waiting for a renderer to consume it.
- `importing`: a renderer has claimed the artifact and is importing it into a doc.
- `imported`: doc import finished successfully.
- `import_failed`: doc import failed; the artifact remains available for retry.

Artifacts are persisted in main process storage so renderer reloads or missing workspace context do not drop them.

## Session Flow

```text
inactive -> new -> starting -> recording -> finalizing -> finalized
                         \                              \
                          \                              -> finalize_failed
                           -> finalize_failed
```

- `START_RECORDING` creates or reuses a pending `new` recording and moves it to `starting`.
- `ATTACH_NATIVE_RECORDING` attaches native session metadata and moves the session to `recording`.
- `START_RECORDING_FAILED` keeps the session terminal with `finalize_failed`.
- `STOP_RECORDING` moves the session to `finalizing`.
- `ATTACH_RECORDING_ARTIFACT` marks the session `finalized` with the native artifact metadata.
- `FINALIZE_RECORDING_FAILED` marks the session `finalize_failed`.
- `ABORT_RECORDING` marks the session `aborted`.

## Import Flow

```text
pending_import -> importing -> imported
                       \
                        -> import_failed -> importing
```

- main enqueues `pending_import` after native finalize succeeds.
- renderer claims the artifact, moving it to `importing`.
- renderer marks the artifact `imported` or `import_failed`.
- `import_failed` artifacts can be claimed again for retry.

## Popup Projection

The popup still renders a single current status, but it is now a projection:

- active session states map to `new`, `starting`, `recording`, `finalizing`, `finalize_failed`.
- otherwise the latest import entry maps to `pending_import`, `importing`, `imported`, `import_failed`.

This keeps the UI simple without collapsing the underlying source-of-truth back into a single overloaded `processing` state.
