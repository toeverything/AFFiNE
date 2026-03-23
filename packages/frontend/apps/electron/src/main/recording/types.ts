import type { ApplicationInfo } from '@affine/native';

export interface TappableAppInfo {
  info: ApplicationInfo;
  isRunning: boolean;
  processId: number;
  processGroupId: number;
  bundleIdentifier: string;
  name: string;
}

export interface AppGroupInfo {
  processGroupId: number;
  apps: TappableAppInfo[];
  name: string;
  bundleIdentifier: string;
  icon: Buffer | undefined;
  isRunning: boolean;
}

export type RecordingJobPhase =
  | 'new'
  | 'starting'
  | 'recording'
  | 'finalizing'
  | 'recorded'
  | 'importing'
  | 'imported'
  | 'failed'
  | 'aborted';

export type RecordingFailureStage = 'start' | 'finalize' | 'import';

export interface RecordingFailureInfo {
  stage: RecordingFailureStage;
  message: string;
}

export type RecordingImportState =
  | 'pending_import'
  | 'importing'
  | 'imported'
  | 'import_failed';

export interface RecordingArtifactInfo {
  filepath: string;
  sampleRate?: number;
  numberOfChannels?: number;
  durationMs?: number;
  size?: number;
  degraded?: boolean;
  overflowCount?: number;
}

export interface RecordingImportProgress {
  workspaceId?: string;
  docId?: string;
  errorMessage?: string;
  leaseExpiresAt?: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface RecordingJobStatus {
  id: number;
  phase: RecordingJobPhase;
  appName?: string;
  appGroupId?: number;
  bundleIdentifier?: string;
  appProcessId?: number;
  nativeId?: string;
  startTime: number;
  createdAt: number;
  updatedAt: number;
  artifact?: RecordingArtifactInfo;
  import?: RecordingImportProgress;
  error?: RecordingFailureInfo;
  dismissedAt?: number;
}

export interface RecordingImportStatus extends RecordingArtifactInfo {
  id: number;
  appName?: string;
  workspaceId?: string;
  docId?: string;
  startTime: number;
  importStatus: RecordingImportState;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export type RecordingDisplayState =
  | 'new'
  | 'starting'
  | 'start_failed'
  | 'recording'
  | 'finalizing'
  | 'pending_import'
  | 'importing'
  | 'imported'
  | 'import_failed'
  | 'finalize_failed';

export interface RecordingStatus {
  id: number;
  status: RecordingDisplayState;
  appName?: string;
  appGroupId?: number;
  icon?: Buffer;
  startTime: number;
  filepath?: string;
  sampleRate?: number;
  numberOfChannels?: number;
  durationMs?: number;
  size?: number;
  degraded?: boolean;
  overflowCount?: number;
  errorMessage?: string;
}
