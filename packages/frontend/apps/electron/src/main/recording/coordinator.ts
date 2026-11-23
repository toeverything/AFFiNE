import { BehaviorSubject, type Observable } from 'rxjs';

import { logger } from '../logger';
import { globalStateStorage } from '../shared-storage/storage';
import type {
  AppGroupInfo,
  RecordingArtifactInfo,
  RecordingDisplayState,
  RecordingImportStatus,
  RecordingJobStatus,
  RecordingStatus,
} from './types';

const RECORDING_JOBS_KEY = 'recordingJobs:v2';
const IMPORT_LEASE_MS = 30_000;

interface NativeRecordingMeta {
  id: string;
  filepath: string;
  sampleRate: number;
  channels: number;
  startedAt?: number;
}

interface NativeRecordingArtifact {
  id: string;
  filepath: string;
  sampleRate: number;
  channels: number;
  durationMs: number;
  size: number;
  degraded?: boolean;
  overflowCount?: number;
}

export interface NativeRecordingController {
  startRecording(options: {
    appProcessId?: number;
    outputDir: string;
    format: 'opus';
    id: string;
  }): Promise<NativeRecordingMeta>;
  stopRecording(nativeId: string): Promise<NativeRecordingArtifact>;
  abortRecording(nativeId: string): Promise<void>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isArtifactInfo(value: unknown): value is RecordingArtifactInfo {
  if (!isObject(value) || typeof value.filepath !== 'string') {
    return false;
  }
  return (
    (value.sampleRate === undefined || typeof value.sampleRate === 'number') &&
    (value.numberOfChannels === undefined ||
      typeof value.numberOfChannels === 'number') &&
    (value.durationMs === undefined || typeof value.durationMs === 'number') &&
    (value.size === undefined || typeof value.size === 'number') &&
    (value.degraded === undefined || typeof value.degraded === 'boolean') &&
    (value.overflowCount === undefined ||
      typeof value.overflowCount === 'number')
  );
}

function isRecordingJob(value: unknown): value is RecordingJobStatus {
  if (!isObject(value)) {
    return false;
  }

  if (
    typeof value.id !== 'number' ||
    typeof value.phase !== 'string' ||
    typeof value.startTime !== 'number' ||
    typeof value.createdAt !== 'number' ||
    typeof value.updatedAt !== 'number'
  ) {
    return false;
  }

  if (value.appName !== undefined && typeof value.appName !== 'string') {
    return false;
  }
  if (value.appGroupId !== undefined && typeof value.appGroupId !== 'number') {
    return false;
  }
  if (
    value.bundleIdentifier !== undefined &&
    typeof value.bundleIdentifier !== 'string'
  ) {
    return false;
  }
  if (
    value.appProcessId !== undefined &&
    typeof value.appProcessId !== 'number'
  ) {
    return false;
  }
  if (value.nativeId !== undefined && typeof value.nativeId !== 'string') {
    return false;
  }
  if (value.artifact !== undefined && !isArtifactInfo(value.artifact)) {
    return false;
  }

  if (value.import !== undefined) {
    if (!isObject(value.import)) {
      return false;
    }
    if (
      value.import.workspaceId !== undefined &&
      typeof value.import.workspaceId !== 'string'
    ) {
      return false;
    }
    if (
      value.import.docId !== undefined &&
      typeof value.import.docId !== 'string'
    ) {
      return false;
    }
    if (
      value.import.errorMessage !== undefined &&
      typeof value.import.errorMessage !== 'string'
    ) {
      return false;
    }
    if (
      value.import.leaseExpiresAt !== undefined &&
      typeof value.import.leaseExpiresAt !== 'number'
    ) {
      return false;
    }
    if (
      value.import.startedAt !== undefined &&
      typeof value.import.startedAt !== 'number'
    ) {
      return false;
    }
    if (
      value.import.finishedAt !== undefined &&
      typeof value.import.finishedAt !== 'number'
    ) {
      return false;
    }
  }

  if (
    value.error !== undefined &&
    (!isObject(value.error) ||
      typeof value.error.stage !== 'string' ||
      typeof value.error.message !== 'string')
  ) {
    return false;
  }

  if (
    value.dismissedAt !== undefined &&
    typeof value.dismissedAt !== 'number'
  ) {
    return false;
  }

  return true;
}

function loadPersistedJobs() {
  const persisted = globalStateStorage.get(RECORDING_JOBS_KEY);
  if (!Array.isArray(persisted)) {
    return [] as RecordingJobStatus[];
  }

  const now = Date.now();
  return persisted.flatMap(value => {
    if (!isRecordingJob(value)) {
      return [];
    }

    if (
      value.phase === 'new' ||
      value.phase === 'starting' ||
      value.phase === 'recording' ||
      value.phase === 'finalizing' ||
      value.phase === 'aborted'
    ) {
      return [];
    }

    if (value.phase === 'recorded' || value.phase === 'importing') {
      return [
        {
          ...value,
          phase: 'recorded' as const,
          import: {
            ...value.import,
            errorMessage: undefined,
            leaseExpiresAt: undefined,
          },
          updatedAt: now,
          dismissedAt: value.dismissedAt ?? now,
        },
      ];
    }

    if (value.phase === 'imported' || value.phase === 'failed') {
      return [{ ...value, dismissedAt: value.dismissedAt ?? now }];
    }

    return [value];
  });
}

function toImportStatus(job: RecordingJobStatus): RecordingImportStatus | null {
  if (!job.artifact) {
    return null;
  }

  let importStatus: RecordingImportStatus['importStatus'];
  switch (job.phase) {
    case 'recorded':
      importStatus = 'pending_import';
      break;
    case 'importing':
      importStatus = 'importing';
      break;
    case 'imported':
      importStatus = 'imported';
      break;
    case 'failed':
      if (job.error?.stage !== 'import') {
        return null;
      }
      importStatus = 'import_failed';
      break;
    default:
      return null;
  }

  return {
    id: job.id,
    appName: job.appName,
    workspaceId: job.import?.workspaceId,
    docId: job.import?.docId,
    startTime: job.startTime,
    filepath: job.artifact.filepath,
    sampleRate: job.artifact.sampleRate,
    numberOfChannels: job.artifact.numberOfChannels,
    durationMs: job.artifact.durationMs,
    size: job.artifact.size,
    degraded: job.artifact.degraded,
    overflowCount: job.artifact.overflowCount,
    importStatus,
    errorMessage: job.error?.stage === 'import' ? job.error.message : undefined,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function toDisplayStatus(
  job: RecordingJobStatus | undefined
): RecordingStatus | null {
  if (!job || job.dismissedAt) {
    return null;
  }

  let status: RecordingDisplayState | null = null;
  switch (job.phase) {
    case 'new':
    case 'starting':
    case 'recording':
    case 'finalizing':
      status = job.phase;
      break;
    case 'recorded':
      status = 'pending_import';
      break;
    case 'importing':
      status = 'importing';
      break;
    case 'imported':
      status = 'imported';
      break;
    case 'failed':
      if (job.error?.stage === 'start') {
        status = 'start_failed';
      } else if (job.error?.stage === 'finalize') {
        status = 'finalize_failed';
      } else {
        status = 'import_failed';
      }
      break;
    case 'aborted':
      return null;
    default:
      return null;
  }

  return {
    id: job.id,
    status,
    appName: job.appName,
    appGroupId: job.appGroupId,
    startTime: job.startTime,
    filepath: job.artifact?.filepath,
    sampleRate: job.artifact?.sampleRate,
    numberOfChannels: job.artifact?.numberOfChannels,
    durationMs: job.artifact?.durationMs,
    size: job.artifact?.size,
    degraded: job.artifact?.degraded,
    overflowCount: job.artifact?.overflowCount,
    errorMessage: job.error?.message,
  };
}

function buildDocId(jobId: number) {
  return `recording-${jobId}`;
}

export class RecordingCoordinator {
  private readonly jobsSubject$ = new BehaviorSubject<RecordingJobStatus[]>(
    loadPersistedJobs()
  );
  private readonly statusSubject$ = new BehaviorSubject<RecordingStatus | null>(
    null
  );
  private readonly importQueueSubject$ = new BehaviorSubject<
    RecordingImportStatus[]
  >([]);
  private nextId =
    this.jobsSubject$.value.reduce((max, job) => Math.max(max, job.id), -1) + 1;

  constructor(
    private readonly outputDir: string,
    private readonly resolveFilepath: (filepath: string) => Promise<string>,
    private readonly getNativeController: () => Promise<NativeRecordingController>
  ) {
    this.emit();
  }

  get jobs$(): Observable<RecordingJobStatus[]> {
    return this.jobsSubject$.asObservable();
  }

  get status$(): Observable<RecordingStatus | null> {
    return this.statusSubject$.asObservable();
  }

  get importQueue$(): Observable<RecordingImportStatus[]> {
    return this.importQueueSubject$.asObservable();
  }

  get jobs() {
    return this.jobsSubject$.value;
  }

  currentStatus() {
    return this.statusSubject$.value;
  }

  importQueue() {
    return this.importQueueSubject$.value;
  }

  activeJob() {
    return this.jobs.find(
      job =>
        job.phase === 'starting' ||
        job.phase === 'recording' ||
        job.phase === 'finalizing'
    );
  }

  createPrompt(appGroup?: AppGroupInfo) {
    const matchingPrompt = this.jobs.find(
      job =>
        job.phase === 'new' &&
        job.dismissedAt === undefined &&
        job.appGroupId === appGroup?.processGroupId
    );
    if (matchingPrompt) {
      return matchingPrompt;
    }

    const now = Date.now();
    const runningApp = appGroup?.apps.find(app => app.isRunning);
    const job: RecordingJobStatus = {
      id: this.nextId++,
      phase: 'new',
      appName: appGroup?.name,
      appGroupId: appGroup?.processGroupId,
      bundleIdentifier: appGroup?.bundleIdentifier,
      appProcessId: runningApp?.processId,
      startTime: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.setJobs([...this.jobs, job]);
    return job;
  }

  async start(appGroup?: AppGroupInfo) {
    const currentActive = this.activeJob();
    if (currentActive) {
      logger.error(
        'Cannot start a new recording while another session is active'
      );
      return currentActive;
    }

    const now = Date.now();
    const runningApp = appGroup?.apps.find(app => app.isRunning);
    const matchingPrompt = this.jobs.find(
      job =>
        job.phase === 'new' &&
        job.dismissedAt === undefined &&
        job.appGroupId === appGroup?.processGroupId
    );

    const startingJob: RecordingJobStatus = matchingPrompt
      ? {
          ...matchingPrompt,
          phase: 'starting',
          appName: appGroup?.name ?? matchingPrompt.appName,
          appGroupId: appGroup?.processGroupId ?? matchingPrompt.appGroupId,
          bundleIdentifier:
            appGroup?.bundleIdentifier ?? matchingPrompt.bundleIdentifier,
          appProcessId: runningApp?.processId,
          updatedAt: now,
          dismissedAt: undefined,
          error: undefined,
        }
      : {
          id: this.nextId++,
          phase: 'starting',
          appName: appGroup?.name,
          appGroupId: appGroup?.processGroupId,
          bundleIdentifier: appGroup?.bundleIdentifier,
          appProcessId: runningApp?.processId,
          startTime: 0,
          createdAt: now,
          updatedAt: now,
        };

    this.upsertJob(startingJob);

    let nativeId: string | undefined;
    try {
      logger.info(`recording ${startingJob.id} starting`);
      const nativeController = await this.getNativeController();
      const meta = await nativeController.startRecording({
        appProcessId: startingJob.appProcessId,
        outputDir: this.outputDir,
        format: 'opus',
        id: String(startingJob.id),
      });
      nativeId = meta.id;

      const filepath = await this.resolveFilepath(meta.filepath);
      const currentJob = this.findJob(startingJob.id);
      if (!currentJob || currentJob.phase !== 'starting') {
        if (nativeId) {
          await nativeController.abortRecording(nativeId).catch(error => {
            logger.error('failed to cleanup abandoned native recording', error);
          });
        }
        return this.findJob(startingJob.id) ?? currentJob ?? null;
      }

      const nextJob: RecordingJobStatus = {
        ...currentJob,
        phase: 'recording',
        nativeId: meta.id,
        startTime: meta.startedAt ?? Date.now(),
        updatedAt: Date.now(),
        artifact: {
          filepath,
          sampleRate: meta.sampleRate,
          numberOfChannels: meta.channels,
        },
      };
      this.upsertJob(nextJob);
      logger.info(`recording ${startingJob.id} started`, {
        nativeId: meta.id,
        sampleRate: meta.sampleRate,
        channels: meta.channels,
      });
      return nextJob;
    } catch (error) {
      if (nativeId) {
        const nativeController = await this.getNativeController();
        await nativeController.abortRecording(nativeId).catch(cleanupError => {
          logger.error(
            'failed to cleanup abandoned native recording',
            cleanupError
          );
        });
      }

      const currentJob = this.findJob(startingJob.id);
      if (currentJob && currentJob.phase === 'starting') {
        this.upsertJob({
          ...currentJob,
          phase: 'failed',
          updatedAt: Date.now(),
          error: {
            stage: 'start',
            message: error instanceof Error ? error.message : 'failed to start',
          },
        });
      }
      logger.error('failed to start recording', error);
      return this.findJob(startingJob.id) ?? null;
    }
  }

  async stop(id: number) {
    const job = this.findJob(id);
    if (!job || job.phase !== 'recording' || !job.nativeId) {
      logger.error(`stopRecording: Recording ${id} not found`);
      return job ?? null;
    }

    const finalizingJob: RecordingJobStatus = {
      ...job,
      phase: 'finalizing',
      updatedAt: Date.now(),
      error: undefined,
    };
    this.upsertJob(finalizingJob);

    try {
      logger.info(`recording ${id} finalizing`, {
        nativeId: job.nativeId,
      });
      const nativeController = await this.getNativeController();
      const artifact = await nativeController.stopRecording(job.nativeId);
      const filepath = await this.resolveFilepath(artifact.filepath);

      const currentJob = this.findJob(id);
      if (!currentJob || currentJob.phase !== 'finalizing') {
        return currentJob ?? null;
      }

      const nextJob: RecordingJobStatus = {
        ...currentJob,
        phase: 'recorded',
        nativeId: undefined,
        updatedAt: Date.now(),
        artifact: {
          filepath,
          sampleRate: artifact.sampleRate,
          numberOfChannels: artifact.channels,
          durationMs: artifact.durationMs,
          size: artifact.size,
          degraded: artifact.degraded,
          overflowCount: artifact.overflowCount,
        },
        import: {
          ...currentJob.import,
          errorMessage: undefined,
          leaseExpiresAt: undefined,
        },
      };
      this.upsertJob(nextJob);
      logger.info(`recording ${id} finalized`, {
        filepath,
        degraded: artifact.degraded,
        overflowCount: artifact.overflowCount,
      });
      return nextJob;
    } catch (error) {
      logger.error('Failed to stop recording', error);
      const currentJob = this.findJob(id);
      if (currentJob && currentJob.phase === 'finalizing') {
        this.upsertJob({
          ...currentJob,
          phase: 'failed',
          updatedAt: Date.now(),
          error: {
            stage: 'finalize',
            message:
              error instanceof Error ? error.message : 'failed to finalize',
          },
        });
      }
      return this.findJob(id) ?? null;
    }
  }

  async abortActive() {
    const job =
      this.activeJob() ??
      [...this.jobs]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .find(
          entry =>
            !!entry.nativeId &&
            (entry.phase === 'starting' ||
              entry.phase === 'recording' ||
              entry.phase === 'finalizing')
        );
    if (!job) {
      return;
    }

    if (!job.nativeId) {
      this.upsertJob({
        ...job,
        phase: 'aborted',
        updatedAt: Date.now(),
        dismissedAt: Date.now(),
      });
      return;
    }

    const nativeController = await this.getNativeController();
    try {
      await nativeController.abortRecording(job.nativeId);
    } finally {
      this.removeJob(job.id);
    }
  }

  getRecording(id: number) {
    const job = this.findJob(id);
    if (!job) {
      return;
    }

    return {
      id,
      startTime: job.startTime,
      filepath: job.artifact?.filepath,
      sampleRate: job.artifact?.sampleRate,
      numberOfChannels: job.artifact?.numberOfChannels,
      appGroup: job.appGroupId
        ? {
            processGroupId: job.appGroupId,
            apps: [],
            name: job.appName ?? '',
            bundleIdentifier: job.bundleIdentifier ?? '',
            icon: undefined,
            isRunning: false,
          }
        : undefined,
      app:
        job.appProcessId &&
        job.appName &&
        job.appGroupId &&
        job.bundleIdentifier
          ? {
              info: {} as never,
              isRunning: false,
              processId: job.appProcessId,
              processGroupId: job.appGroupId,
              bundleIdentifier: job.bundleIdentifier,
              name: job.appName,
            }
          : undefined,
    };
  }

  claimImport(id: number, workspaceId: string) {
    const now = Date.now();
    let claimed: RecordingJobStatus | null = null;
    this.setJobs(
      this.jobs.map(job => {
        if (job.id !== id || !job.artifact) {
          return job;
        }

        if (job.import?.workspaceId && job.import.workspaceId !== workspaceId) {
          return job;
        }

        if (job.phase === 'recorded') {
          claimed = {
            ...job,
            phase: 'importing',
            updatedAt: now,
            import: {
              ...job.import,
              workspaceId,
              docId: job.import?.docId ?? buildDocId(job.id),
              errorMessage: undefined,
              startedAt: job.import?.startedAt ?? now,
              leaseExpiresAt: now + IMPORT_LEASE_MS,
            },
            dismissedAt: undefined,
          };
          return claimed;
        }

        if (
          job.phase === 'importing' &&
          (!job.import?.leaseExpiresAt || job.import.leaseExpiresAt <= now)
        ) {
          claimed = {
            ...job,
            updatedAt: now,
            import: {
              ...job.import,
              workspaceId,
              docId: job.import?.docId ?? buildDocId(job.id),
              errorMessage: undefined,
              startedAt: job.import?.startedAt ?? now,
              leaseExpiresAt: now + IMPORT_LEASE_MS,
            },
            dismissedAt: undefined,
          };
          return claimed;
        }

        return job;
      })
    );
    return claimed ? toImportStatus(claimed) : null;
  }

  completeImport(id: number) {
    const job = this.findJob(id);
    if (!job || (job.phase !== 'recorded' && job.phase !== 'importing')) {
      logger.error(`Recording import ${id} not found`);
      return null;
    }

    const nextJob: RecordingJobStatus = {
      ...job,
      phase: 'imported',
      updatedAt: Date.now(),
      import: {
        ...job.import,
        errorMessage: undefined,
        leaseExpiresAt: undefined,
        finishedAt: Date.now(),
      },
      error: undefined,
      dismissedAt: undefined,
    };
    this.upsertJob(nextJob);
    return toImportStatus(nextJob);
  }

  failImport(id: number, errorMessage?: string) {
    const job = this.findJob(id);
    if (!job || (job.phase !== 'recorded' && job.phase !== 'importing')) {
      logger.error(`Recording import ${id} not found`);
      return null;
    }

    const nextJob: RecordingJobStatus = {
      ...job,
      phase: 'failed',
      updatedAt: Date.now(),
      import: {
        ...job.import,
        errorMessage,
        leaseExpiresAt: undefined,
      },
      error: {
        stage: 'import',
        message: errorMessage ?? 'failed to import recording',
      },
      dismissedAt: undefined,
    };
    this.upsertJob(nextJob);
    return toImportStatus(nextJob);
  }

  dismiss(id: number) {
    const job = this.findJob(id);
    if (!job) {
      return null;
    }

    if (job.phase === 'imported') {
      this.removeJob(id);
      return this.currentStatus();
    }

    if (
      job.phase === 'new' ||
      (job.phase === 'failed' && job.error?.stage !== 'import')
    ) {
      this.removeJob(id);
      return this.currentStatus();
    }

    this.upsertJob({
      ...job,
      updatedAt: Date.now(),
      dismissedAt: Date.now(),
    });
    return this.currentStatus();
  }

  remove(id: number) {
    this.removeJob(id);
  }

  private findJob(id: number) {
    return this.jobs.find(job => job.id === id) ?? null;
  }

  private upsertJob(job: RecordingJobStatus) {
    const nextJobs = this.jobs.filter(entry => entry.id !== job.id);
    nextJobs.push(job);
    nextJobs.sort((left, right) => left.id - right.id);
    this.setJobs(nextJobs);
  }

  private removeJob(id: number) {
    this.setJobs(this.jobs.filter(job => job.id !== id));
  }

  private setJobs(jobs: RecordingJobStatus[]) {
    this.jobsSubject$.next(jobs);
    globalStateStorage.set(RECORDING_JOBS_KEY, jobs);
    this.emit();
  }

  private emit() {
    const visibleJobs = this.jobs.filter(job => !job.dismissedAt);
    const current =
      visibleJobs.find(
        job =>
          job.phase === 'new' ||
          job.phase === 'starting' ||
          job.phase === 'recording' ||
          job.phase === 'finalizing'
      ) ??
      [...visibleJobs]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .find(
          job =>
            job.phase === 'recorded' ||
            job.phase === 'importing' ||
            job.phase === 'imported' ||
            job.phase === 'failed'
        );

    this.statusSubject$.next(toDisplayStatus(current));
    this.importQueueSubject$.next(
      this.jobs
        .flatMap(job => {
          const status = toImportStatus(job);
          if (!status) {
            return [];
          }
          return status.importStatus === 'pending_import' ||
            status.importStatus === 'importing'
            ? [status]
            : [];
        })
        .sort((left, right) => {
          if (left.updatedAt !== right.updatedAt) {
            return right.updatedAt - left.updatedAt;
          }
          return right.id - left.id;
        })
    );
  }
}
