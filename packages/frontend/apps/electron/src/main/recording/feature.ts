/* oxlint-disable no-var-requires */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

// Should not load @affine/native for unsupported platforms
import type { ShareableContent as ShareableContentType } from '@affine/native';
import { app, systemPreferences } from 'electron';
import fs from 'fs-extra';
import { debounce } from 'lodash-es';
import {
  BehaviorSubject,
  distinctUntilChanged,
  groupBy,
  interval,
  mergeMap,
  Subject,
  throttleTime,
} from 'rxjs';
import { filter, map, shareReplay } from 'rxjs/operators';

import { isMacOS, isWindows, shallowEqual } from '../../shared/utils';
import { beforeAppQuit } from '../cleanup';
import { logger } from '../logger';
import {
  MeetingSettingsKey,
  MeetingSettingsSchema,
} from '../shared-state-schema';
import { globalStateStorage } from '../shared-storage/storage';
import { getMainWindow } from '../windows-manager';
import { popupManager } from '../windows-manager/popup';
import { isAppNameAllowed } from './allow-list';
import { recordingStateMachine } from './state-machine';
import type {
  AppGroupInfo,
  Recording,
  RecordingStatus,
  TappableAppInfo,
} from './types';

export const MeetingsSettingsState = {
  $: globalStateStorage.watch<MeetingSettingsSchema>(MeetingSettingsKey).pipe(
    map(v => MeetingSettingsSchema.parse(v ?? {})),
    shareReplay(1)
  ),

  get value() {
    return MeetingSettingsSchema.parse(
      globalStateStorage.get(MeetingSettingsKey) ?? {}
    );
  },

  set value(value: MeetingSettingsSchema) {
    globalStateStorage.set(MeetingSettingsKey, value);
  },
};

const subscribers: Subscriber[] = [];

// recordings are saved in the app data directory
// may need a way to clean up old recordings
export const SAVED_RECORDINGS_DIR = path.join(
  app.getPath('sessionData'),
  'recordings'
);

let shareableContent: ShareableContentType | null = null;

function cleanup() {
  shareableContent = null;
  subscribers.forEach(subscriber => {
    try {
      subscriber.unsubscribe();
    } catch {
      // ignore unsubscribe error
    }
  });
}

beforeAppQuit(() => {
  cleanup();
});

export const applications$ = new BehaviorSubject<TappableAppInfo[]>([]);
export const appGroups$ = new BehaviorSubject<AppGroupInfo[]>([]);

export const updateApplicationsPing$ = new Subject<number>();

// recording id -> recording
// recordings will be saved in memory before consumed and created as an audio block to user's doc
const recordings = new Map<number, Recording>();

// there should be only one active recording at a time
// We'll now use recordingStateMachine.status$ instead of our own BehaviorSubject
export const recordingStatus$ = recordingStateMachine.status$;

function createAppGroup(processGroupId: number): AppGroupInfo | undefined {
  // MUST require dynamically to avoid loading @affine/native for unsupported platforms
  const SC: typeof ShareableContentType =
    require('@affine/native').ShareableContent;
  const groupProcess = SC?.applicationWithProcessId(processGroupId);
  if (!groupProcess) {
    return;
  }
  return {
    processGroupId: processGroupId,
    apps: [], // leave it empty for now.
    name: groupProcess.name,
    bundleIdentifier: groupProcess.bundleIdentifier,
    // icon should be lazy loaded
    get icon() {
      try {
        return groupProcess.icon;
      } catch (error) {
        logger.error(`Failed to get icon for ${groupProcess.name}`, error);
        return undefined;
      }
    },
    isRunning: false,
  };
}

// pipe applications$ to appGroups$
function setupAppGroups() {
  subscribers.push(
    applications$.pipe(distinctUntilChanged()).subscribe(apps => {
      const appGroups: AppGroupInfo[] = [];
      apps.forEach(app => {
        let appGroup = appGroups.find(
          group => group.processGroupId === app.processGroupId
        );

        if (!appGroup) {
          appGroup = createAppGroup(app.processGroupId);
          if (appGroup) {
            appGroups.push(appGroup);
          }
        }
        if (appGroup) {
          appGroup.apps.push(app);
        }
      });

      appGroups.forEach(appGroup => {
        appGroup.isRunning = appGroup.apps.some(app => app.isRunning);
      });

      appGroups$.next(appGroups);
    })
  );
}

function setupNewRunningAppGroup() {
  const appGroupRunningChanged$ = appGroups$.pipe(
    mergeMap(groups => groups),
    groupBy(group => group.processGroupId),
    mergeMap(groupStream$ =>
      groupStream$.pipe(
        distinctUntilChanged((prev, curr) => prev.isRunning === curr.isRunning)
      )
    ),
    filter(group => isAppNameAllowed(group.name))
  );

  appGroups$.value.forEach(group => {
    const recordingStatus = recordingStatus$.value;
    if (
      group.isRunning &&
      (!recordingStatus || recordingStatus.status === 'new')
    ) {
      newRecording(group);
    }
  });

  const debounceStartRecording = debounce((appGroup: AppGroupInfo) => {
    // check if the app is running again
    if (appGroup.isRunning) {
      startRecording(appGroup);
    }
  }, 1000);

  subscribers.push(
    appGroupRunningChanged$.subscribe(currentGroup => {
      logger.info(
        'appGroupRunningChanged',
        currentGroup.bundleIdentifier,
        currentGroup.isRunning
      );

      if (MeetingsSettingsState.value.recordingMode === 'none') {
        return;
      }

      const recordingStatus = recordingStatus$.value;

      if (currentGroup.isRunning) {
        // when the app is running and there is no active recording popup
        // we should show a new recording popup
        if (
          !recordingStatus ||
          recordingStatus.status === 'new' ||
          recordingStatus.status === 'create-block-success' ||
          recordingStatus.status === 'create-block-failed'
        ) {
          if (MeetingsSettingsState.value.recordingMode === 'prompt') {
            newRecording(currentGroup);
          } else if (
            MeetingsSettingsState.value.recordingMode === 'auto-start'
          ) {
            // there is a case that the watched app's running state changed rapidly
            // we will schedule the start recording to avoid that
            debounceStartRecording(currentGroup);
          } else {
            // do nothing, skip
          }
        }
      } else {
        // when displaying in "new" state but the app is not running any more
        // we should remove the recording
        if (
          recordingStatus?.status === 'new' &&
          currentGroup.bundleIdentifier ===
            recordingStatus.appGroup?.bundleIdentifier
        ) {
          removeRecording(recordingStatus.id);
        }

        // if the recording is stopped and we are recording it,
        // we should stop the recording
        if (
          recordingStatus?.status === 'recording' &&
          recordingStatus.appGroup?.bundleIdentifier ===
            currentGroup.bundleIdentifier
        ) {
          stopRecording(recordingStatus.id).catch(err => {
            logger.error('failed to stop recording', err);
          });
        }
      }
    })
  );
}

function getSanitizedAppId(bundleIdentifier?: string) {
  if (!bundleIdentifier) {
    return 'unknown';
  }

  return isWindows()
    ? createHash('sha256')
        .update(bundleIdentifier)
        .digest('hex')
        .substring(0, 8)
    : bundleIdentifier;
}

export function createRecording(status: RecordingStatus) {
  let recording = recordings.get(status.id);
  if (recording) {
    return recording;
  }

  const appId = getSanitizedAppId(status.appGroup?.bundleIdentifier);

  const bufferedFilePath = path.join(
    SAVED_RECORDINGS_DIR,
    `${appId}-${status.id}-${status.startTime}.raw`
  );

  fs.ensureDirSync(SAVED_RECORDINGS_DIR);
  const file = fs.createWriteStream(bufferedFilePath);

  function tapAudioSamples(err: Error | null, samples: Float32Array) {
    const recordingStatus = recordingStatus$.getValue();
    if (
      !recordingStatus ||
      recordingStatus.id !== status.id ||
      recordingStatus.status === 'paused'
    ) {
      return;
    }

    if (err) {
      logger.error('failed to get audio samples', err);
    } else {
      // Writing raw Float32Array samples directly to file
      // For stereo audio, samples are interleaved [L,R,L,R,...]
      file.write(Buffer.from(samples.buffer));
    }
  }

  // MUST require dynamically to avoid loading @affine/native for unsupported platforms
  const SC: typeof ShareableContentType =
    require('@affine/native').ShareableContent;

  const stream = status.app
    ? SC.tapAudio(status.app.processId, tapAudioSamples)
    : SC.tapGlobalAudio(null, tapAudioSamples);

  recording = {
    id: status.id,
    startTime: status.startTime,
    app: status.app,
    appGroup: status.appGroup,
    file,
    session: stream,
  };

  recordings.set(status.id, recording);

  return recording;
}

export async function getRecording(id: number) {
  const recording = recordings.get(id);
  if (!recording) {
    logger.error(`Recording ${id} not found`);
    return;
  }
  const rawFilePath = String(recording.file.path);
  return {
    id,
    appGroup: recording.appGroup,
    app: recording.app,
    startTime: recording.startTime,
    filepath: rawFilePath,
    sampleRate: recording.session.sampleRate,
    numberOfChannels: recording.session.channels,
  };
}

// recording popup status
// new: recording is started, popup is shown
// recording: recording is started, popup is shown
// stopped: recording is stopped, popup showing processing status
// create-block-success: recording is ready, show "open app" button
// create-block-failed: recording is failed, show "failed to save" button
// null: hide popup
function setupRecordingListeners() {
  subscribers.push(
    recordingStatus$
      .pipe(distinctUntilChanged(shallowEqual))
      .subscribe(status => {
        const popup = popupManager.get('recording');

        if (status && !popup.showing) {
          popup.show().catch(err => {
            logger.error('failed to show recording popup', err);
          });
        }

        if (status?.status === 'recording') {
          let recording = recordings.get(status.id);
          // create a recording if not exists
          if (!recording) {
            recording = createRecording(status);
          }
        } else if (status?.status === 'stopped') {
          const recording = recordings.get(status.id);
          if (recording) {
            recording.session.stop();
          }
        } else if (
          status?.status === 'create-block-success' ||
          status?.status === 'create-block-failed'
        ) {
          // show the popup for 10s
          setTimeout(
            () => {
              // check again if current status is still ready
              if (
                (recordingStatus$.value?.status === 'create-block-success' ||
                  recordingStatus$.value?.status === 'create-block-failed') &&
                recordingStatus$.value.id === status.id
              ) {
                popup.hide().catch(err => {
                  logger.error('failed to hide recording popup', err);
                });
              }
            },
            status?.status === 'create-block-failed' ? 30_000 : 10_000
          );
        } else if (!status) {
          // status is removed, we should hide the popup
          popupManager
            .get('recording')
            .hide()
            .catch(err => {
              logger.error('failed to hide recording popup', err);
            });
        }
      })
  );
}

function getAllApps(): TappableAppInfo[] {
  if (!shareableContent) {
    return [];
  }

  // MUST require dynamically to avoid loading @affine/native for unsupported platforms
  const { ShareableContent } = require('@affine/native') as {
    ShareableContent: typeof ShareableContentType;
  };

  const apps = ShareableContent.applications().map(app => {
    try {
      // Check if this process is actively using microphone/audio
      const isRunning = ShareableContent.isUsingMicrophone(app.processId);

      return {
        info: app,
        processId: app.processId,
        processGroupId: app.processGroupId,
        bundleIdentifier: app.bundleIdentifier,
        name: app.name,
        isRunning,
      };
    } catch (error) {
      logger.error('failed to get app info', error);
      return null;
    }
  });

  const filteredApps = apps.filter(
    (v): v is TappableAppInfo =>
      v !== null &&
      !v.bundleIdentifier.startsWith('com.apple') &&
      !v.bundleIdentifier.startsWith('pro.affine') &&
      v.processId !== process.pid
  );
  return filteredApps;
}

type Subscriber = {
  unsubscribe: () => void;
};

function setupMediaListeners() {
  const ShareableContent = require('@affine/native').ShareableContent;
  applications$.next(getAllApps());
  subscribers.push(
    interval(3000).subscribe(() => {
      updateApplicationsPing$.next(Date.now());
    }),
    ShareableContent.onApplicationListChanged(() => {
      updateApplicationsPing$.next(Date.now());
    }),
    updateApplicationsPing$
      .pipe(distinctUntilChanged(), throttleTime(3000))
      .subscribe(() => {
        applications$.next(getAllApps());
      })
  );

  let appStateSubscribers: Subscriber[] = [];

  subscribers.push(
    applications$.subscribe(apps => {
      appStateSubscribers.forEach(subscriber => {
        try {
          subscriber.unsubscribe();
        } catch {
          // ignore unsubscribe error
        }
      });
      const _appStateSubscribers: Subscriber[] = [];

      apps.forEach(app => {
        try {
          const applicationInfo = app.info;
          _appStateSubscribers.push(
            ShareableContent.onAppStateChanged(applicationInfo, () => {
              updateApplicationsPing$.next(Date.now());
            })
          );
        } catch (error) {
          logger.error(
            `Failed to set up app state listener for ${app.name}`,
            error
          );
        }
      });

      appStateSubscribers = _appStateSubscribers;
      return () => {
        _appStateSubscribers.forEach(subscriber => {
          try {
            subscriber.unsubscribe();
          } catch {
            // ignore unsubscribe error
          }
        });
      };
    })
  );
}

function askForScreenRecordingPermission() {
  if (!isMacOS()) {
    return false;
  }
  try {
    const ShareableContent = require('@affine/native').ShareableContent;
    // this will trigger the permission prompt
    new ShareableContent();
    return true;
  } catch (error) {
    logger.error('failed to ask for screen recording permission', error);
  }
  return false;
}

// will be called when the app is ready or when the user has enabled the recording feature in settings
export function setupRecordingFeature() {
  if (!MeetingsSettingsState.value.enabled || !checkCanRecordMeeting()) {
    return;
  }

  try {
    const ShareableContent = require('@affine/native').ShareableContent;
    if (!shareableContent) {
      shareableContent = new ShareableContent();
      setupMediaListeners();
    }
    // reset all states
    recordingStatus$.next(null);
    setupAppGroups();
    setupNewRunningAppGroup();
    setupRecordingListeners();
    return true;
  } catch (error) {
    logger.error('failed to setup recording feature', error);
    return false;
  }
}

export function disableRecordingFeature() {
  recordingStatus$.next(null);
  cleanup();
}

function normalizeAppGroupInfo(
  appGroup?: AppGroupInfo | number
): AppGroupInfo | undefined {
  return typeof appGroup === 'number'
    ? appGroups$.value.find(group => group.processGroupId === appGroup)
    : appGroup;
}

export function newRecording(
  appGroup?: AppGroupInfo | number
): RecordingStatus | null {
  return recordingStateMachine.dispatch({
    type: 'NEW_RECORDING',
    appGroup: normalizeAppGroupInfo(appGroup),
  });
}

export function startRecording(
  appGroup?: AppGroupInfo | number
): RecordingStatus | null {
  const state = recordingStateMachine.dispatch(
    {
      type: 'START_RECORDING',
      appGroup: normalizeAppGroupInfo(appGroup),
    },
    false
  );

  if (state?.status === 'recording') {
    createRecording(state);
  }

  recordingStateMachine.status$.next(state);

  return state;
}

export function pauseRecording(id: number) {
  return recordingStateMachine.dispatch({ type: 'PAUSE_RECORDING', id });
}

export function resumeRecording(id: number) {
  return recordingStateMachine.dispatch({ type: 'RESUME_RECORDING', id });
}

export async function stopRecording(id: number) {
  const recording = recordings.get(id);
  if (!recording) {
    logger.error(`stopRecording: Recording ${id} not found`);
    return;
  }

  if (!recording.file.path) {
    logger.error(`Recording ${id} has no file path`);
    return;
  }

  const { file, session: stream } = recording;

  // First stop the audio stream to prevent more data coming in
  try {
    stream.stop();
  } catch (err) {
    logger.error('Failed to stop audio stream', err);
  }

  // End the file with a timeout
  file.end();

  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        file.on('finish', () => {
          // check if the file is empty
          const stats = fs.statSync(file.path);
          if (stats.size === 0) {
            reject(new Error('Recording is empty'));
            return;
          }
          resolve();
        });

        file.on('error', err => {
          reject(err);
        });
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('File writing timeout')), 10000)
      ),
    ]);

    const recordingStatus = recordingStateMachine.dispatch({
      type: 'STOP_RECORDING',
      id,
    });

    if (!recordingStatus) {
      logger.error('No recording status to stop');
      return;
    }
    return serializeRecordingStatus(recordingStatus);
  } catch (error: unknown) {
    logger.error('Failed to stop recording', error);
    const recordingStatus = recordingStateMachine.dispatch({
      type: 'CREATE_BLOCK_FAILED',
      id,
      error: error instanceof Error ? error : undefined,
    });
    if (!recordingStatus) {
      logger.error('No recording status to stop');
      return;
    }
    return serializeRecordingStatus(recordingStatus);
  } finally {
    // Clean up the file stream if it's still open
    if (!file.closed) {
      file.destroy();
    }
  }
}

export async function getRawAudioBuffers(
  id: number,
  cursor?: number
): Promise<{
  buffer: Buffer;
  nextCursor: number;
}> {
  const recording = recordings.get(id);
  if (!recording) {
    throw new Error(`getRawAudioBuffers: Recording ${id} not found`);
  }
  const start = cursor ?? 0;
  const file = await fsp.open(recording.file.path, 'r');
  const stats = await file.stat();
  const buffer = Buffer.alloc(stats.size - start);
  const result = await file.read(buffer, 0, buffer.length, start);
  await file.close();

  return {
    buffer,
    nextCursor: start + result.bytesRead,
  };
}

function assertRecordingFilepath(filepath: string) {
  const normalizedPath = path.normalize(filepath);
  const normalizedBase = path.normalize(SAVED_RECORDINGS_DIR + path.sep);

  if (!normalizedPath.toLowerCase().startsWith(normalizedBase.toLowerCase())) {
    throw new Error('Invalid recording filepath');
  }

  return normalizedPath;
}

export async function readRecordingFile(filepath: string) {
  const normalizedPath = assertRecordingFilepath(filepath);
  return fsp.readFile(normalizedPath);
}

export async function readyRecording(id: number, buffer: Buffer) {
  logger.info('readyRecording', id);

  const recordingStatus = recordingStatus$.value;
  const recording = recordings.get(id);
  if (!recordingStatus || recordingStatus.id !== id || !recording) {
    logger.error(`readyRecording: Recording ${id} not found`);
    return;
  }

  const rawFilePath = String(recording.file.path);

  const filepath = rawFilePath.replace('.raw', '.opus');

  if (!filepath) {
    logger.error(`readyRecording: Recording ${id} has no filepath`);
    return;
  }

  await fs.writeFile(filepath, buffer);

  // can safely remove the raw file now
  logger.info('remove raw file', rawFilePath);
  if (rawFilePath) {
    try {
      await fs.unlink(rawFilePath);
    } catch (err) {
      logger.error('failed to remove raw file', err);
    }
  }
  // Update the status through the state machine
  recordingStateMachine.dispatch({
    type: 'SAVE_RECORDING',
    id,
    filepath,
  });

  // bring up the window
  getMainWindow()
    .then(mainWindow => {
      if (mainWindow) {
        mainWindow.show();
      }
    })
    .catch(err => {
      logger.error('failed to bring up the window', err);
    });
}

export async function handleBlockCreationSuccess(id: number) {
  recordingStateMachine.dispatch({
    type: 'CREATE_BLOCK_SUCCESS',
    id,
  });
}

export async function handleBlockCreationFailed(id: number, error?: Error) {
  recordingStateMachine.dispatch({
    type: 'CREATE_BLOCK_FAILED',
    id,
    error,
  });
}

export function removeRecording(id: number) {
  recordings.delete(id);
  recordingStateMachine.dispatch({ type: 'REMOVE_RECORDING', id });
}

export interface SerializedRecordingStatus {
  id: number;
  status: RecordingStatus['status'];
  appName?: string;
  // if there is no app group, it means the recording is for system audio
  appGroupId?: number;
  icon?: Buffer;
  startTime: number;
  filepath?: string;
  sampleRate?: number;
  numberOfChannels?: number;
}

export function serializeRecordingStatus(
  status: RecordingStatus
): SerializedRecordingStatus | null {
  const recording = recordings.get(status.id);
  return {
    id: status.id,
    status: status.status,
    appName: status.appGroup?.name,
    appGroupId: status.appGroup?.processGroupId,
    icon: status.appGroup?.icon,
    startTime: status.startTime,
    filepath:
      status.filepath ?? (recording ? String(recording.file.path) : undefined),
    sampleRate: recording?.session.sampleRate,
    numberOfChannels: recording?.session.channels,
  };
}

export const getMacOSVersion = () => {
  try {
    const stdout = execSync('sw_vers -productVersion').toString();
    const [major, minor, patch] = stdout.trim().split('.').map(Number);
    return { major, minor, patch };
  } catch (error) {
    logger.error('Failed to get MacOS version', error);
    return { major: 0, minor: 0, patch: 0 };
  }
};

// check if the system is MacOS and the version is >= 14.2
export const checkRecordingAvailable = () => {
  if (isMacOS()) {
    const version = getMacOSVersion();
    return (version.major === 14 && version.minor >= 2) || version.major > 14;
  }
  if (isWindows()) {
    return true;
  }
  return false;
};

export const checkMeetingPermissions = () => {
  if (isWindows()) {
    return {
      screen: true,
      microphone: true,
    };
  }

  if (!isMacOS()) {
    return undefined;
  }
  const mediaTypes = ['screen', 'microphone'] as const;
  return Object.fromEntries(
    mediaTypes.map(mediaType => [
      mediaType,
      systemPreferences.getMediaAccessStatus(mediaType) === 'granted',
    ])
  ) as Record<(typeof mediaTypes)[number], boolean>;
};

export const askForMeetingPermission = async (
  type: 'microphone' | 'screen'
) => {
  if (!isMacOS()) {
    return false;
  }
  if (type === 'screen') {
    return askForScreenRecordingPermission();
  }
  return systemPreferences.askForMediaAccess(type);
};

export const checkCanRecordMeeting = () => {
  const features = checkMeetingPermissions();
  return (
    checkRecordingAvailable() &&
    features &&
    Object.values(features).every(feature => feature)
  );
};
