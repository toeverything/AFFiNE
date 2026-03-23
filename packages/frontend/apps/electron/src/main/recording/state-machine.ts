import { BehaviorSubject } from 'rxjs';

import { shallowEqual } from '../../shared/utils';
import { logger } from '../logger';
import type {
  AppGroupInfo,
  RecordingArtifactInfo,
  RecordingSessionStatus,
} from './types';

export type RecordingEvent =
  | { type: 'NEW_RECORDING'; appGroup?: AppGroupInfo }
  | { type: 'START_RECORDING'; appGroup?: AppGroupInfo }
  | {
      type: 'ATTACH_NATIVE_RECORDING';
      id: number;
      nativeId: string;
      startTime: number;
      filepath: string;
      sampleRate: number;
      numberOfChannels: number;
    }
  | { type: 'START_RECORDING_FAILED'; id: number; errorMessage?: string }
  | { type: 'STOP_RECORDING'; id: number }
  | {
      type: 'ATTACH_RECORDING_ARTIFACT';
      id: number;
      artifact: RecordingArtifactInfo;
    }
  | { type: 'FINALIZE_RECORDING_FAILED'; id: number; errorMessage?: string }
  | { type: 'ABORT_RECORDING'; id: number }
  | { type: 'REMOVE_RECORDING'; id: number };

export class RecordingStateMachine {
  private recordingId = 0;
  private readonly recordingStatus$ =
    new BehaviorSubject<RecordingSessionStatus | null>(null);

  get status(): RecordingSessionStatus | null {
    return this.recordingStatus$.value;
  }

  get status$(): BehaviorSubject<RecordingSessionStatus | null> {
    return this.recordingStatus$;
  }

  dispatch(event: RecordingEvent, emit = true): RecordingSessionStatus | null {
    const currentStatus = this.recordingStatus$.value;
    let newStatus: RecordingSessionStatus | null = null;

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
      case 'START_RECORDING_FAILED':
        newStatus = this.handleStartRecordingFailed(
          event.id,
          event.errorMessage
        );
        break;
      case 'STOP_RECORDING':
        newStatus = this.handleStopRecording(event.id);
        break;
      case 'ATTACH_RECORDING_ARTIFACT':
        newStatus = this.handleAttachRecordingArtifact(
          event.id,
          event.artifact
        );
        break;
      case 'FINALIZE_RECORDING_FAILED':
        newStatus = this.handleFinalizeRecordingFailed(
          event.id,
          event.errorMessage
        );
        break;
      case 'ABORT_RECORDING':
        newStatus = this.handleAbortRecording(event.id);
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

  private hasActiveSession(status: RecordingSessionStatus | null | undefined) {
    return (
      status?.sessionStatus === 'starting' ||
      status?.sessionStatus === 'recording' ||
      status?.sessionStatus === 'finalizing'
    );
  }

  private handleNewRecording(appGroup?: AppGroupInfo): RecordingSessionStatus {
    return {
      id: this.recordingId++,
      sessionStatus: 'new',
      startTime: Date.now(),
      app: appGroup?.apps.find(app => app.isRunning),
      appGroup,
    };
  }

  private handleStartRecording(
    appGroup?: AppGroupInfo
  ): RecordingSessionStatus | null {
    const currentStatus = this.recordingStatus$.value;
    if (this.hasActiveSession(currentStatus)) {
      logger.error(
        'Cannot start a new recording while another session is active'
      );
      return currentStatus;
    }

    if (
      currentStatus?.sessionStatus === 'new' &&
      appGroup &&
      currentStatus.appGroup?.processGroupId === appGroup.processGroupId
    ) {
      return {
        ...currentStatus,
        sessionStatus: 'starting',
        errorMessage: undefined,
      };
    }

    const nextStatus =
      currentStatus?.sessionStatus === 'new' && !appGroup
        ? currentStatus
        : this.handleNewRecording(appGroup);

    return {
      ...nextStatus,
      sessionStatus: 'starting',
      errorMessage: undefined,
    };
  }

  private handleAttachNativeRecording(
    event: Extract<RecordingEvent, { type: 'ATTACH_NATIVE_RECORDING' }>
  ) {
    const currentStatus = this.recordingStatus$.value;
    if (!currentStatus || currentStatus.id !== event.id) {
      logger.error(`Recording ${event.id} not found for native attachment`);
      return currentStatus;
    }

    if (currentStatus.sessionStatus !== 'starting') {
      logger.error(
        `Cannot attach native metadata when recording is in ${currentStatus.sessionStatus} state`
      );
      return currentStatus;
    }

    return {
      ...currentStatus,
      sessionStatus: 'recording' as const,
      nativeId: event.nativeId,
      startTime: event.startTime,
      artifact: {
        filepath: event.filepath,
        sampleRate: event.sampleRate,
        numberOfChannels: event.numberOfChannels,
      },
    };
  }

  private handleStartRecordingFailed(id: number, errorMessage?: string) {
    const currentStatus = this.recordingStatus$.value;

    if (!currentStatus || currentStatus.id !== id) {
      logger.error(`Recording ${id} not found for start failure`);
      return currentStatus;
    }

    return {
      ...currentStatus,
      sessionStatus: 'start_failed' as const,
      errorMessage,
    };
  }

  private handleStopRecording(id: number) {
    const currentStatus = this.recordingStatus$.value;

    if (!currentStatus || currentStatus.id !== id) {
      logger.error(`Recording ${id} not found for stopping`);
      return currentStatus;
    }

    if (currentStatus.sessionStatus !== 'recording') {
      logger.error(
        `Cannot stop recording in ${currentStatus.sessionStatus} state`
      );
      return currentStatus;
    }

    return {
      ...currentStatus,
      sessionStatus: 'finalizing' as const,
      errorMessage: undefined,
    };
  }

  private handleAttachRecordingArtifact(
    id: number,
    artifact: RecordingArtifactInfo
  ) {
    const currentStatus = this.recordingStatus$.value;

    if (!currentStatus || currentStatus.id !== id) {
      logger.error(`Recording ${id} not found for saving`);
      return currentStatus;
    }

    if (currentStatus.sessionStatus !== 'finalizing') {
      logger.error(
        `Cannot attach artifact in ${currentStatus.sessionStatus} state`
      );
      return currentStatus;
    }

    return {
      ...currentStatus,
      sessionStatus: 'finalized' as const,
      artifact: {
        ...currentStatus.artifact,
        ...artifact,
      },
    };
  }

  private handleFinalizeRecordingFailed(id: number, errorMessage?: string) {
    const currentStatus = this.recordingStatus$.value;

    if (!currentStatus || currentStatus.id !== id) {
      logger.error(`Recording ${id} not found for finalize failure`);
      return currentStatus;
    }

    if (errorMessage) {
      logger.error(`Recording ${id} finalize failed: ${errorMessage}`);
    }

    return {
      ...currentStatus,
      sessionStatus: 'finalize_failed' as const,
      errorMessage,
    };
  }

  private handleAbortRecording(id: number) {
    const currentStatus = this.recordingStatus$.value;

    if (!currentStatus || currentStatus.id !== id) {
      logger.error(`Recording ${id} not found for abort`);
      return currentStatus;
    }

    return {
      ...currentStatus,
      sessionStatus: 'aborted' as const,
      errorMessage: undefined,
    };
  }

  private handleRemoveRecording(id: number) {
    logger.info(`Recording ${id} removed from state machine`);
  }
}

export const recordingStateMachine = new RecordingStateMachine();
