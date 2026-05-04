import { shallowEqual } from '@affine/component';
import type { TranscriptionBlockProps } from '@affine/core/blocksuite/ai/blocks/transcription-block/model';
import { DebugLogger } from '@affine/debug';
import { UserFriendlyError } from '@affine/error';
import { AiJobStatus } from '@affine/graphql';
import { Entity, LiveData } from '@toeverything/infra';

import type { DefaultServerService, WorkspaceServerService } from '../../cloud';
import { AuthService } from '../../cloud/services/auth';
import { AudioTranscriptionJobStore } from './audio-transcription-job-store';
import { buildTranscriptionResult } from './transcription-result';
import type { TranscriptionResult } from './types';

// The UI status of the transcription job
export type TranscriptionStatus =
  | { status: 'waiting-for-job' }
  | { status: 'started' }
  | { status: AiJobStatus.pending }
  | { status: AiJobStatus.running }
  | {
      status: AiJobStatus.failed;
      error: UserFriendlyError; // <<- this is not visible on UI yet
    }
  | { status: AiJobStatus.finished }
  | { status: 'settled'; result: TranscriptionResult };

const logger = new DebugLogger('audio-transcription-job');

function hasSettledTranscriptResult(
  job: {
    status: AiJobStatus;
    normalizedTranscript?: string | null;
    transcription?: unknown[] | null;
  } | null
) {
  return (
    job?.status === AiJobStatus.finished &&
    (!!job.normalizedTranscript || !!job.transcription?.length)
  );
}

// facts on transcription job ownership
// 1. jobid + blobid is unique for a given user
// 2. only the creator can settle/unlock the task result
// 3. all users can query the settled result
// 4. settlement requires AI credits
export class AudioTranscriptionJob extends Entity<{
  readonly blockProps: TranscriptionBlockProps;
  readonly blobId: string;
  readonly getAudioTranscriptionInput: () => Promise<{
    files: File[];
    input?: Record<string, unknown>;
  }>;
}> {
  constructor(
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly defaultServerService: DefaultServerService
  ) {
    super();
    this.disposables.push(() => {
      this.disposed = true;
    });
  }

  disposed = false;

  private readonly _status$ = new LiveData<TranscriptionStatus>({
    status: 'waiting-for-job',
  });

  private readonly store = this.framework.createEntity(
    AudioTranscriptionJobStore,
    {
      blobId: this.props.blobId,
      getAudioTranscriptionInput: this.props.getAudioTranscriptionInput,
    }
  );

  status$ = this._status$.distinctUntilChanged(shallowEqual);
  transcribing$ = this.status$.map(status => {
    return (
      status.status === 'started' ||
      status.status === AiJobStatus.pending ||
      status.status === AiJobStatus.running ||
      status.status === AiJobStatus.finished
    );
  });

  error$ = this.status$.map(status => {
    if (status.status === AiJobStatus.failed) {
      return status.error;
    }
    return null;
  });

  // check if we can kick start the transcription job
  readonly preflightCheck = async () => {
    // if the job id is given, check if the job exists
    if (this.props.blockProps.jobId) {
      const existingJob = await this.store.getTranscriptTask(
        this.props.blobId,
        this.props.blockProps.jobId
      );

      if (hasSettledTranscriptResult(existingJob)) {
        // if job exists, anyone can query it
        return;
      }

      if (
        !existingJob &&
        this.props.blockProps.createdBy &&
        this.props.blockProps.createdBy !== this.currentUserId
      ) {
        return {
          error: 'created-by-others',
          userId: this.props.blockProps.createdBy,
        };
      }
    }

    // if no job id, anyone can start a new job
    return;
  };

  async start() {
    if (this.disposed) {
      logger.debug('Job already disposed, cannot start');
      throw new Error('Job already disposed');
    }

    this._status$.value = {
      status: 'started',
    };

    try {
      // firstly check if there is a job already
      logger.debug('Checking for existing transcription job', {
        blobId: this.props.blobId,
        jobId: this.props.blockProps.jobId,
      });
      let job: {
        id: string;
        status: AiJobStatus;
      } | null = await this.store.getTranscriptTask(
        this.props.blobId,
        this.props.blockProps.jobId
      );

      if (!job) {
        logger.debug('No existing job found, submitting new transcription job');
        job = await this.store.submitTranscriptTask();
      } else if (job.status === AiJobStatus.failed) {
        logger.debug('Found existing failed job, retrying', {
          jobId: job.id,
        });
        job = await this.store.retryTranscriptTask(job.id);
      } else {
        logger.debug('Found existing job', {
          jobId: job.id,
          status: job.status,
        });
      }
      if (!job) {
        throw UserFriendlyError.fromAny('failed to submit transcription');
      }

      this.props.blockProps.jobId = job.id;
      this.props.blockProps.createdBy = this.currentUserId;

      if (job.status !== AiJobStatus.failed) {
        this._status$.value = {
          status: AiJobStatus.pending,
        };
      } else {
        logger.debug('Job submission failed');
        throw UserFriendlyError.fromAny('failed to submit transcription');
      }

      await this.untilTaskReadyOrSettled();
      await this.settle();
    } catch (err) {
      logger.debug('Error during job submission', { error: err });
      this._status$.value = {
        status: AiJobStatus.failed,
        error: UserFriendlyError.fromAny(err),
      };
    }
    return this.status$.value;
  }

  private async untilTaskReadyOrSettled() {
    while (
      !this.disposed &&
      this.props.blockProps.jobId &&
      this.props.blockProps.createdBy === this.currentUserId
    ) {
      logger.debug('Polling job status', {
        jobId: this.props.blockProps.jobId,
      });
      const job = await this.store.getTranscriptTask(
        this.props.blobId,
        this.props.blockProps.jobId
      );

      if (!job || job?.status === 'failed') {
        logger.debug('Job failed during polling', {
          jobId: this.props.blockProps.jobId,
        });
        throw UserFriendlyError.fromAny('Transcription job failed');
      }

      if (job?.status === AiJobStatus.finished) {
        logger.debug('Transcript task is ready to settle', {
          jobId: this.props.blockProps.jobId,
        });
        this._status$.value = {
          status: AiJobStatus.finished,
        };
        return;
      }

      // Add delay between polling attempts
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  async settle() {
    if (this.disposed) {
      logger.debug('Job already disposed, cannot settle');
      throw new Error('Job already disposed');
    }

    logger.debug('Attempting to settle transcript task', {
      jobId: this.props.blockProps.jobId,
    });

    if (!this.props.blockProps.jobId) {
      logger.debug('No job id found, cannot settle');
      throw new Error('No job id found');
    }

    const settledTask = await this.store.settleTranscriptTask(
      this.props.blockProps.jobId
    );

    if (settledTask) {
      logger.debug('Successfully settled transcript task', {
        jobId: this.props.blockProps.jobId,
      });
      const result: TranscriptionResult = buildTranscriptionResult(settledTask);

      this._status$.value = {
        status: 'settled',
        result,
      };
    } else {
      throw new Error('Failed to settle transcription result');
    }
  }

  isCreator() {
    return (
      this.props.blockProps.jobId &&
      this.props.blockProps.createdBy &&
      this.props.blockProps.createdBy === this.currentUserId
    );
  }

  private get serverService() {
    return (
      this.workspaceServerService.server || this.defaultServerService.server
    );
  }

  get currentUserId() {
    const authService = this.serverService?.scope.getOptional(AuthService);
    if (!authService) {
      return;
    }
    return authService.session.account$.value?.id;
  }
}
