import { describe, expect, test, vi } from 'vitest';

vi.mock('../../src/main/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { RecordingStateMachine } from '../../src/main/recording/state-machine';

function createAttachedRecording(stateMachine: RecordingStateMachine) {
  const pending = stateMachine.dispatch({
    type: 'START_RECORDING',
  });

  stateMachine.dispatch({
    type: 'ATTACH_NATIVE_RECORDING',
    id: pending!.id,
    nativeId: 'native-1',
    startTime: 100,
    filepath: '/tmp/recording.opus',
    sampleRate: 48000,
    numberOfChannels: 2,
  });

  return pending!;
}

describe('RecordingStateMachine', () => {
  test('transitions from recording to ready after artifact import and block creation', () => {
    const stateMachine = new RecordingStateMachine();

    const pending = createAttachedRecording(stateMachine);
    expect(pending?.status).toBe('recording');

    const processing = stateMachine.dispatch({
      type: 'STOP_RECORDING',
      id: pending.id,
    });
    expect(processing?.status).toBe('processing');

    const artifactAttached = stateMachine.dispatch({
      type: 'ATTACH_RECORDING_ARTIFACT',
      id: pending.id,
      filepath: '/tmp/recording.opus',
      sampleRate: 48000,
      numberOfChannels: 2,
    });
    expect(artifactAttached).toMatchObject({
      status: 'processing',
      filepath: '/tmp/recording.opus',
    });

    const ready = stateMachine.dispatch({
      type: 'SET_BLOCK_CREATION_STATUS',
      id: pending.id,
      status: 'success',
    });
    expect(ready).toMatchObject({
      status: 'ready',
      blockCreationStatus: 'success',
    });
  });

  test('keeps native audio metadata when stop artifact omits it', () => {
    const stateMachine = new RecordingStateMachine();

    const pending = createAttachedRecording(stateMachine);
    stateMachine.dispatch({ type: 'STOP_RECORDING', id: pending.id });

    const artifactAttached = stateMachine.dispatch({
      type: 'ATTACH_RECORDING_ARTIFACT',
      id: pending.id,
      filepath: '/tmp/recording.opus',
    });

    expect(artifactAttached).toMatchObject({
      sampleRate: 48000,
      numberOfChannels: 2,
    });
  });

  test.each([
    { status: 'success' as const, errorMessage: undefined },
    { status: 'failed' as const, errorMessage: 'native start failed' },
  ])(
    'settles recordings into ready state with blockCreationStatus=$status',
    ({ status, errorMessage }) => {
      const stateMachine = new RecordingStateMachine();

      const pending = stateMachine.dispatch({
        type: 'START_RECORDING',
      });
      expect(pending?.status).toBe('recording');

      const settled = stateMachine.dispatch({
        type: 'SET_BLOCK_CREATION_STATUS',
        id: pending!.id,
        status,
        errorMessage,
      });
      expect(settled).toMatchObject({
        status: 'ready',
        blockCreationStatus: status,
      });

      const next = stateMachine.dispatch({
        type: 'START_RECORDING',
      });
      expect(next?.id).toBeGreaterThan(pending!.id);
      expect(next?.status).toBe('recording');
      expect(next?.blockCreationStatus).toBeUndefined();
    }
  );
});
