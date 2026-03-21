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

export interface RecordingStatus {
  id: number; // corresponds to the recording id
  // an app group is detected and waiting for user confirmation
  // recording: the native recorder is running
  // processing: recording has stopped and the artifact is being prepared/imported
  // ready: the post-processing result has been settled
  status: 'new' | 'recording' | 'processing' | 'ready';
  app?: TappableAppInfo;
  appGroup?: AppGroupInfo;
  startTime: number; // 0 means not started yet
  filepath?: string; // encoded file path
  nativeId?: string;
  sampleRate?: number;
  numberOfChannels?: number;
  blockCreationStatus?: 'success' | 'failed';
}
