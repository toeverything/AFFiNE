# Recording State Transitions

This document visualizes the possible state transitions in the recording system.

## States

The recording system has the following states:

- **inactive**: No active recording (null state)
- **new**: A new recording has been detected but not yet started
- **recording**: Audio is being recorded
- **paused**: Recording is temporarily paused
- **stopped**: Recording has been stopped and is processing
- **ready**: Recording is processed and ready for use

## Transitions

```
┌───────────┐                ┌───────┐
│           │                │       │
│ inactive  │◀───────────────│ ready │
│           │                │       │
└─────┬─────┘                └───┬───┘
      │                          │
      │ NEW_RECORDING            │
      ▼                          │
┌───────────┐                    │
│           │                    │
│   new     │                    │
│           │                    │
└─────┬─────┘                    │
      │                          │
      │ START_RECORDING          │
      ▼                          │
┌───────────┐                    │
│           │      STOP_RECORDING│
│ recording │─────────────────┐  │
│           │◀────────────┐   │  │
└─────┬─────┘             │   │  │
      │                   │   │  │
      │ PAUSE_RECORDING   │   │  │
      ▼                   │   │  │
┌───────────┐             │   │  │
│           │             │   │  │
│  paused   │             │   │  │
│           │             │   │  │
└─────┬─────┘             │   │  │
      │                   │   │  │
      │ RESUME_RECORDING  │   │  │
      └───────────────────┘   │  │
                              │  │
                              ▼  │
                        ┌───────────┐
                        │           │
                        │ stopped   │
                        │           │
                        └─────┬─────┘
                              │
                              │ SAVE_RECORDING
                              ▼
                        ┌───────────┐
                        │           │
                        │  ready    │
                        │           │
                        └───────────┘
```

## Events

The following events trigger state transitions:

- `NEW_RECORDING`: Create a new recording when an app starts or is detected
- `START_RECORDING`: Start recording audio
- `PAUSE_RECORDING`: Pause the current recording
- `RESUME_RECORDING`: Resume a paused recording
- `STOP_RECORDING`: Stop the current recording
- `SAVE_RECORDING`: Save and finalize a recording
- `REMOVE_RECORDING`: Delete a recording

## Error Handling

Invalid state transitions are logged and prevented. For example:

- Cannot start a new recording when one is already in progress
- Cannot pause a recording that is not in the 'recording' state
- Cannot resume a recording that is not in the 'paused' state

Each transition function in the state machine validates the current state before allowing a transition.
