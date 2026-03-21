# Recording State Transitions

The desktop recording flow now has a single linear engine state and a separate post-process result.

## Engine states

- `inactive`: no active recording
- `new`: app detected, waiting for user confirmation
- `recording`: native capture is running
- `processing`: native capture has stopped and the artifact is being imported
- `ready`: post-processing has finished

## Post-process result

`ready` recordings may carry `blockCreationStatus`:

- `success`: the recording block was created successfully
- `failed`: the artifact was saved, but block creation/import failed

## State flow

```text
inactive -> new -> recording -> processing -> ready
                     ^                      |
                     |                      |
                     +------ start ---------+
```

- `START_RECORDING` creates or reuses a pending `new` recording.
- `ATTACH_NATIVE_RECORDING` fills in native metadata while staying in `recording`.
- `STOP_RECORDING` moves the flow to `processing`.
- `ATTACH_RECORDING_ARTIFACT` attaches the finalized `.opus` artifact while staying in `processing`.
- `SET_BLOCK_CREATION_STATUS` settles the flow as `ready`.

Only one recording can be active at a time. A new recording can start only after the previous one has been removed or its `ready` result has been settled.
