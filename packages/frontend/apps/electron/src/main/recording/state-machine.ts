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
  | { type: 'PAUSE_RECORDING'; id: number }
  | { type: 'RESUME_RECORDING'; id: number }
  | {
      type: 'STOP_RECORDING';
      id: number;
    }
  | {
      type: 'SAVE_RECORDING';
      id: number;
      filepath: string;
    }
  | {
      type: 'CREATE_BLOCK_FAILED';
      id: number;
      error?: Error;
    }
  | {
      type: 'CREATE_BLOCK_SUCCESS';
      id: number;
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
      case 'PAUSE_RECORDING':
        newStatus = this.handlePauseRecording();
        break;
      case 'RESUME_RECORDING':
        newStatus = this.handleResumeRecording();
        break;
      case 'STOP_RECORDING':
        newStatus = this.handleStopRecording(event.id);
        break;
      case 'SAVE_RECORDING':
        newStatus = this.handleSaveRecording(event.id, event.filepath);
        break;
      case 'CREATE_BLOCK_SUCCESS':
        newStatus = this.handleCreateBlockSuccess(event.id);
        break;
      case 'CREATE_BLOCK_FAILED':
        newStatus = this.handleCreateBlockFailed(event.id, event.error);
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
      currentStatus?.status === 'stopped'
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
   * Handle the PAUSE_RECORDING event
   */
  private handlePauseRecording(): RecordingStatus | null {
    const currentStatus = this.recordingStatus$.value;

    if (!currentStatus) {
      logger.error('No active recording to pause');
      return null;
    }

    if (currentStatus.status !== 'recording') {
      logger.error(`Cannot pause recording in ${currentStatus.status} state`);
      return currentStatus;
    }

    return {
      ...currentStatus,
      status: 'paused',
    };
  }

  /**
   * Handle the RESUME_RECORDING event
   */
  private handleResumeRecording(): RecordingStatus | null {
    const currentStatus = this.recordingStatus$.value;

    if (!currentStatus) {
      logger.error('No active recording to resume');
      return null;
    }

    if (currentStatus.status !== 'paused') {
      logger.error(`Cannot resume recording in ${currentStatus.status} state`);
      return currentStatus;
    }

    return {
      ...currentStatus,
      status: 'recording',
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

    if (
      currentStatus.status !== 'recording' &&
      currentStatus.status !== 'paused'
    ) {
      logger.error(`Cannot stop recording in ${currentStatus.status} state`);
      return currentStatus;
    }

    return {
      ...currentStatus,
      status: 'stopped',
    };
  }

  /**
   * Handle the SAVE_RECORDING event
   */
  private handleSaveRecording(
    id: number,
    filepath: string
  ): RecordingStatus | null {
    const currentStatus = this.recordingStatus$.value;

    if (!currentStatus || currentStatus.id !== id) {
      logger.error(`Recording ${id} not found for saving`);
      return currentStatus;
    }

    return {
      ...currentStatus,
      status: 'ready',
      filepath,
    };
  }

  /**
   * Handle the CREATE_BLOCK_SUCCESS event
   */
  private handleCreateBlockSuccess(id: number): RecordingStatus | null {
    const currentStatus = this.recordingStatus$.value;

    if (!currentStatus || currentStatus.id !== id) {
      logger.error(`Recording ${id} not found for create-block-success`);
      return currentStatus;
    }

    return {
      ...currentStatus,
      status: 'create-block-success',
    };
  }

  /**
   * Handle the CREATE_BLOCK_FAILED event
   */
  private handleCreateBlockFailed(
    id: number,
    error?: Error
  ): RecordingStatus | null {
    const currentStatus = this.recordingStatus$.value;

    if (!currentStatus || currentStatus.id !== id) {
      logger.error(`Recording ${id} not found for create-block-failed`);
      return currentStatus;
    }

    if (error) {
      logger.error(`Recording ${id} create block failed:`, error);
    }

    return {
      ...currentStatus,
      status: 'create-block-failed',
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
