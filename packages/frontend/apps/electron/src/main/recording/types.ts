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

export type RecordingSessionState =
  | 'new'
  | 'starting'
  | 'recording'
  | 'finalizing'
  | 'finalized'
  | 'finalize_failed'
  | 'aborted';

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

export interface RecordingSessionStatus {
  id: number; // corresponds to the recording id
  sessionStatus: RecordingSessionState;
  app?: TappableAppInfo;
  appGroup?: AppGroupInfo;
  startTime: number; // 0 means not started yet
  nativeId?: string;
  artifact?: RecordingArtifactInfo;
  errorMessage?: string;
}

export interface RecordingImportStatus extends RecordingArtifactInfo {
  id: number;
  appName?: string;
  startTime: number;
  importStatus: RecordingImportState;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export type RecordingDisplayState =
  | 'new'
  | 'starting'
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
