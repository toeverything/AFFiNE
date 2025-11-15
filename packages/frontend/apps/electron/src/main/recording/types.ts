import type { WriteStream } from 'node:fs';

import type { ApplicationInfo, AudioCaptureSession } from '@affine/native';

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

export interface Recording {
  id: number;
  // the app may not be available if the user choose to record system audio
  app?: TappableAppInfo;
  appGroup?: AppGroupInfo;
  // the buffered file that is being recorded streamed to
  file: WriteStream;
  session: AudioCaptureSession;
  startTime: number;
  filepath?: string; // the filepath of the recording (only available when status is ready)
}

export interface RecordingStatus {
  id: number; // corresponds to the recording id
  // the status of the recording in a linear state machine
  // new: an new app group is listening. note, if there are any active recording, the current recording will not change
  // recording: the recording is ongoing
  // paused: the recording is paused
  // stopped: the recording is stopped (processing audio file for use in the editor)
  // ready: the recording is ready to be used
  // create-block-success: the recording is successfully created as a block
  // create-block-failed: creating block failed
  status:
    | 'new'
    | 'recording'
    | 'paused'
    | 'stopped'
    | 'ready'
    | 'create-block-success'
    | 'create-block-failed';
  app?: TappableAppInfo;
  appGroup?: AppGroupInfo;
  startTime: number; // 0 means not started yet
  filepath?: string; // encoded file path
}
