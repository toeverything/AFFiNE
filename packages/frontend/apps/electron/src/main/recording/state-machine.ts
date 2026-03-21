import { BehaviorSubject } from 'rxjs';

import { shallowEqual } from '../../shared/utils';
import { logger } from '../logger';
import type { AppGroupInfo, RecordingStatus } from './types';

/**
 * Recording state machine events
 */
export type RecordingEvent =
  | { type: 'NEW_RECORDING'; appGroup?: AppGroupInfo }
  | {
      type: 'START_RECORDING';
      appGroup?: AppGroupInfo;
    }
  | {
      type: 'ATTACH_NATIVE_RECORDING';
      id: number;
      nativeId: string;
      startTime: number;
      filepath: string;
      sampleRate: number;
      numberOfChannels: number;
    }
  | {
      type: 'STOP_RECORDING';
      id: number;
    }
  | {
      type: 'ATTACH_RECORDING_ARTIFACT';
      id: number;
      filepath: string;
      sampleRate?: number;
      numberOfChannels?: number;
    }
  | {
      type: 'SET_BLOCK_CREATION_STATUS';
      id: number;
      status: 'success' | 'failed';
      errorMessage?: string;
    }
  | { type: 'REMOVE_RECORDING'; id: number };

/**
 * Recording State Machine
 * Handles state transitions for the recording process
 */
export class RecordingStateMachine {
  private recordingId = 0;
  private readonly recordingStatus$ =
    new BehaviorSubject<RecordingStatus | null>(null);

  /**
   * Get the current recording status
   */
  get status(): RecordingStatus | null {
    return this.recordingStatus$.value;
  }

  /**
   * Get the BehaviorSubject for recording status
   */
  get status$(): BehaviorSubject<RecordingStatus | null> {
    return this.recordingStatus$;
  }

  /**
   * Dispatch an event to the state machine
   * @param event The event to dispatch
   * @returns The new recording status after the event is processed
   */
  dispatch(event: RecordingEvent, emit = true): RecordingStatus | null {
    const currentStatus = this.recordingStatus$.value;
    let newStatus: RecordingStatus | null = null;

    switch (event.type) {
      case 'NEW_RECORDING':
        newStatus = this.handleNewRecording(event.appGroup);
        break;
      case 'START_RECORDING':
        newStatus = this.handleStartRecording(event.appGroup);
        break;
      case 'ATTACH_NATIVE_RECORDING':
        newStatus = this.handleAttachNativeRecording(event);
        break;
      case 'STOP_RECORDING':
        newStatus = this.handleStopRecording(event.id);
        break;
      case 'ATTACH_RECORDING_ARTIFACT':
        newStatus = this.handleAttachRecordingArtifact(
          event.id,
          event.filepath,
          event.sampleRate,
          event.numberOfChannels
        );
        break;
      case 'SET_BLOCK_CREATION_STATUS':
        newStatus = this.handleSetBlockCreationStatus(
          event.id,
          event.status,
          event.errorMessage
        );
        break;
      case 'REMOVE_RECORDING':
        this.handleRemoveRecording(event.id);
        newStatus = currentStatus?.id === event.id ? null : currentStatus;
        break;
      default:
        logger.error('Unknown recording event type');
        return currentStatus;
    }

    if (shallowEqual(newStatus, currentStatus)) {
      return currentStatus;
    }

    if (emit) {
      this.recordingStatus$.next(newStatus);
    }

    return newStatus;
  }

  /**
   * Handle the NEW_RECORDING event
   */
  private handleNewRecording(appGroup?: AppGroupInfo): RecordingStatus {
    const recordingStatus: RecordingStatus = {
      id: this.recordingId++,
      status: 'new',
      startTime: Date.now(),
      app: appGroup?.apps.find(app => app.isRunning),
      appGroup,
    };
    return recordingStatus;
  }

  /**
   * Handle the START_RECORDING event
   */
  private handleStartRecording(appGroup?: AppGroupInfo): RecordingStatus {
    const currentStatus = this.recordingStatus$.value;
    if (
      currentStatus?.status === 'recording' ||
      currentStatus?.status === 'processing'
    ) {
      logger.error(
        'Cannot start a new recording if there is already a recording'
      );
      return currentStatus;
    }

    if (
      appGroup &&
      currentStatus?.appGroup?.processGroupId === appGroup.processGroupId &&
      currentStatus.status === 'new'
    ) {
      return {
        ...currentStatus,
        status: 'recording',
      };
    } else {
      const newStatus = this.handleNewRecording(appGroup);
      return {
        ...newStatus,
        status: 'recording',
      };
    }
  }

  /**
   * Attach native recording metadata to the current recording
   */
  private handleAttachNativeRecording(
    event: Extract<RecordingEvent, { type: 'ATTACH_NATIVE_RECORDING' }>
  ): RecordingStatus | null {
    const currentStatus = this.recordingStatus$.value;
    if (!currentStatus || currentStatus.id !== event.id) {
      logger.error(`Recording ${event.id} not found for native attachment`);
      return currentStatus;
    }

    if (currentStatus.status !== 'recording') {
      logger.error(
        `Cannot attach native metadata when recording is in ${currentStatus.status} state`
      );
      return currentStatus;
    }

    return {
      ...currentStatus,
      nativeId: event.nativeId,
      startTime: event.startTime,
      filepath: event.filepath,
      sampleRate: event.sampleRate,
      numberOfChannels: event.numberOfChannels,
    };
  }

  /**
   * Handle the STOP_RECORDING event
   */
  private handleStopRecording(id: number): RecordingStatus | null {
    const currentStatus = this.recordingStatus$.value;

    if (!currentStatus || currentStatus.id !== id) {
      logger.error(`Recording ${id} not found for stopping`);
      return currentStatus;
    }

    if (currentStatus.status !== 'recording') {
      logger.error(`Cannot stop recording in ${currentStatus.status} state`);
      return currentStatus;
    }

    return {
      ...currentStatus,
      status: 'processing',
    };
  }

  /**
   * Attach the encoded artifact once native stop completes
   */
  private handleAttachRecordingArtifact(
    id: number,
    filepath: string,
    sampleRate?: number,
    numberOfChannels?: number
  ): RecordingStatus | null {
    const currentStatus = this.recordingStatus$.value;

    if (!currentStatus || currentStatus.id !== id) {
      logger.error(`Recording ${id} not found for saving`);
      return currentStatus;
    }

    if (currentStatus.status !== 'processing') {
      logger.error(`Cannot attach artifact in ${currentStatus.status} state`);
      return currentStatus;
    }

    return {
      ...currentStatus,
      filepath,
      sampleRate: sampleRate ?? currentStatus.sampleRate,
      numberOfChannels: numberOfChannels ?? currentStatus.numberOfChannels,
    };
  }

  /**
   * Set the renderer-side block creation result
   */
  private handleSetBlockCreationStatus(
    id: number,
    status: 'success' | 'failed',
    errorMessage?: string
  ): RecordingStatus | null {
    const currentStatus = this.recordingStatus$.value;

    if (!currentStatus || currentStatus.id !== id) {
      logger.error(`Recording ${id} not found for block creation status`);
      return currentStatus;
    }

    if (currentStatus.status === 'new') {
      logger.error(`Cannot settle recording ${id} before it starts`);
      return currentStatus;
    }

    if (
      currentStatus.status === 'ready' &&
      currentStatus.blockCreationStatus !== undefined
    ) {
      return currentStatus;
    }

    if (errorMessage) {
      logger.error(`Recording ${id} create block failed: ${errorMessage}`);
    }

    return {
      ...currentStatus,
      status: 'ready',
      blockCreationStatus: status,
    };
  }

  /**
   * Handle the REMOVE_RECORDING event
   */
  private handleRemoveRecording(id: number): void {
    // Actual recording removal logic would be handled by the caller
    // This just ensures the state is updated correctly
    logger.info(`Recording ${id} removed from state machine`);
  }
}

// Create and export a singleton instance
export const recordingStateMachine = new RecordingStateMachine();
