import { describe, expect, test, vi } from 'vitest';

vi.mock('../../src/main/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { RecordingStateMachine } from '../../src/main/recording/state-machine';

describe('RecordingStateMachine', () => {
  test('transitions from recording to ready after artifact import and block creation', () => {
    const stateMachine = new RecordingStateMachine();

    const pending = stateMachine.dispatch({
      type: 'START_RECORDING',
    });
    expect(pending?.status).toBe('recording');

    const attached = stateMachine.dispatch({
      type: 'ATTACH_NATIVE_RECORDING',
      id: pending!.id,
      nativeId: 'native-1',
      startTime: 100,
      filepath: '/tmp/recording.opus',
      sampleRate: 48000,
      numberOfChannels: 2,
    });
    expect(attached).toMatchObject({
      status: 'recording',
      filepath: '/tmp/recording.opus',
      nativeId: 'native-1',
    });

    const processing = stateMachine.dispatch({
      type: 'STOP_RECORDING',
      id: pending!.id,
    });
    expect(processing?.status).toBe('processing');

    const artifactAttached = stateMachine.dispatch({
      type: 'ATTACH_RECORDING_ARTIFACT',
      id: pending!.id,
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
      id: pending!.id,
      status: 'success',
    });
    expect(ready).toMatchObject({
      status: 'ready',
      blockCreationStatus: 'success',
    });
  });

  test('keeps native audio metadata when stop artifact omits it', () => {
    const stateMachine = new RecordingStateMachine();

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
    stateMachine.dispatch({ type: 'STOP_RECORDING', id: pending!.id });

    const artifactAttached = stateMachine.dispatch({
      type: 'ATTACH_RECORDING_ARTIFACT',
      id: pending!.id,
      filepath: '/tmp/recording.opus',
    });

    expect(artifactAttached).toMatchObject({
      sampleRate: 48000,
      numberOfChannels: 2,
    });
  });

  test('can settle a failed recording without introducing extra failure states', () => {
    const stateMachine = new RecordingStateMachine();

    const pending = stateMachine.dispatch({
      type: 'START_RECORDING',
    });
    expect(pending?.status).toBe('recording');

    const failed = stateMachine.dispatch({
      type: 'SET_BLOCK_CREATION_STATUS',
      id: pending!.id,
      status: 'failed',
      errorMessage: 'native start failed',
    });
    expect(failed).toMatchObject({
      status: 'ready',
      blockCreationStatus: 'failed',
    });
  });

  test('allows a new recording after the previous post-process result is settled', () => {
    const stateMachine = new RecordingStateMachine();

    const first = stateMachine.dispatch({
      type: 'START_RECORDING',
    });
    stateMachine.dispatch({
      type: 'SET_BLOCK_CREATION_STATUS',
      id: first!.id,
      status: 'success',
    });

    const second = stateMachine.dispatch({
      type: 'START_RECORDING',
    });
    expect(second?.id).toBeGreaterThan(first!.id);
    expect(second?.status).toBe('recording');
    expect(second?.blockCreationStatus).toBeUndefined();
  });
});
