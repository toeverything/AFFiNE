// eslint-disable no-var-requires
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

// Should not load @affine/native for unsupported platforms
import type { ShareableContent as ShareableContentType } from '@affine/native';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { app, shell, systemPreferences } from 'electron';
import fs from 'fs-extra';
import { debounce } from 'lodash-es';
import {
  BehaviorSubject,
  distinctUntilChanged,
  filter,
  groupBy,
  interval,
  map,
  mergeMap,
  Subject,
  throttleTime,
} from 'rxjs';

import { IpcEvent, IpcHandle, IpcScope } from '../../../ipc';
import { shallowEqual } from '../../../shared/utils';
import { beforeAppQuit } from '../cleanup';
import { isMacOS, isWindows } from '../utils';
import { MainWindowManager } from '../windows';
import { PopupManager } from '../windows/popup.service';
import { isAppNameAllowed } from './allow-list';
import { MeetingsSettingsState } from './meetings-settings-state.service';
import { RecordingStateMachine } from './recording-state.service';
import type {
  AppGroupInfo,
  Recording,
  RecordingStatus,
  SerializedRecordingStatus,
  TappableAppInfo,
} from './types';

type Subscriber = {
  unsubscribe: () => void;
};

// recordings are saved in the app data directory
// may need a way to clean up old recordings
export const SAVED_RECORDINGS_DIR = path.join(
  app.getPath('sessionData'),
  'recordings'
);

@Injectable()
export class RecordingManager implements OnModuleInit {
  constructor(
    private readonly meetingsSettingsState: MeetingsSettingsState,
    private readonly state: RecordingStateMachine,
    private readonly mainWindow: MainWindowManager,
    private readonly popupManager: PopupManager,

    private readonly logger: Logger
  ) {}

  context = 'RecordingManager';

  subscribers: Subscriber[] = [];
  shareableContent: ShareableContentType | null = null;

  // recording id -> recording
  // recordings will be saved in memory before consumed and created as an audio block to user's doc
  recordings = new Map<number, Recording>();

  applications$ = new BehaviorSubject<TappableAppInfo[]>([]);
  appGroups$ = new BehaviorSubject<AppGroupInfo[]>([]);

  // there should be only one active recording at a time
  // We'll now use recordingStateMachine.status$ instead of our own BehaviorSubject
  recordingStatus$ = this.state.status$;

  @IpcEvent({ scope: IpcScope.RECORDING })
  recordingStatusChanged$ = this.recordingStatus$.pipe(
    distinctUntilChanged(shallowEqual),
    map(status => (status ? this.serializeRecordingStatus(status) : null))
  );

  updateApplicationsPing$ = new Subject<number>();

  cleanup() {
    this.shareableContent = null;
    this.subscribers.forEach(subscriber => {
      try {
        subscriber.unsubscribe();
      } catch {
        // ignore unsubscribe error
      }
    });
  }

  onModuleInit() {
    this.setupRecordingFeature();
    beforeAppQuit(() => {
      this.cleanup();
    });
  }

  private readonly createAppGroup = (
    processGroupId: number
  ): AppGroupInfo | undefined => {
    // MUST require dynamically to avoid loading @affine/native for unsupported platforms
    const SC: typeof ShareableContentType =
      require('@affine/native').ShareableContent;
    const groupProcess = SC?.applicationWithProcessId(processGroupId);
    if (!groupProcess) {
      return;
    }
    const logger = this.logger;
    const context = this.context;
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
          logger.error(
            `Failed to get icon for ${groupProcess.name}`,
            error,
            context
          );
          return undefined;
        }
      },
      isRunning: false,
    };
  };

  private readonly setupAppGroups = () => {
    this.subscribers.push(
      this.applications$.pipe(distinctUntilChanged()).subscribe(apps => {
        const appGroups: AppGroupInfo[] = [];
        apps.forEach(app => {
          let appGroup = appGroups.find(
            group => group.processGroupId === app.processGroupId
          );

          if (!appGroup) {
            appGroup = this.createAppGroup(app.processGroupId);
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

        this.appGroups$.next(appGroups);
      })
    );
  };

  private readonly setupNewRunningAppGroup = () => {
    const appGroupRunningChanged$ = this.appGroups$.pipe(
      mergeMap(groups => groups),
      groupBy(group => group.processGroupId),
      mergeMap(groupStream$ =>
        groupStream$.pipe(
          distinctUntilChanged(
            (prev, curr) => prev.isRunning === curr.isRunning
          )
        )
      ),
      filter(group => isAppNameAllowed(group.name))
    );

    this.appGroups$.value.forEach(group => {
      const recordingStatus = this.recordingStatus$.value;
      if (
        group.isRunning &&
        (!recordingStatus || recordingStatus.status === 'new')
      ) {
        this.newRecording(group);
      }
    });

    const debounceStartRecording = debounce((appGroup: AppGroupInfo) => {
      // check if the app is running again
      if (appGroup.isRunning) {
        this.startRecording(appGroup);
      }
    }, 1000);

    this.subscribers.push(
      appGroupRunningChanged$.subscribe(currentGroup => {
        this.logger.log(
          'appGroupRunningChanged',
          currentGroup.bundleIdentifier,
          currentGroup.isRunning,
          this.context
        );

        if (this.meetingsSettingsState.value.recordingMode === 'none') {
          return;
        }

        const recordingStatus = this.recordingStatus$.value;

        if (currentGroup.isRunning) {
          // when the app is running and there is no active recording popup
          // we should show a new recording popup
          if (
            !recordingStatus ||
            recordingStatus.status === 'new' ||
            recordingStatus.status === 'create-block-success' ||
            recordingStatus.status === 'create-block-failed'
          ) {
            if (this.meetingsSettingsState.value.recordingMode === 'prompt') {
              this.newRecording(currentGroup);
            } else if (
              this.meetingsSettingsState.value.recordingMode === 'auto-start'
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
            this.removeRecording(recordingStatus.id);
          }

          // if the recording is stopped and we are recording it,
          // we should stop the recording
          if (
            recordingStatus?.status === 'recording' &&
            recordingStatus.appGroup?.bundleIdentifier ===
              currentGroup.bundleIdentifier
          ) {
            this.stopRecording(recordingStatus.id).catch(err => {
              this.logger.error('failed to stop recording', err, this.context);
            });
          }
        }
      })
    );
  };

  // recording popup status
  // new: recording is started, popup is shown
  // recording: recording is started, popup is shown
  // stopped: recording is stopped, popup showing processing status
  // create-block-success: recording is ready, show "open app" button
  // create-block-failed: recording is failed, show "failed to save" button
  // null: hide popup
  private readonly setupRecordingListeners = () => {
    this.subscribers.push(
      this.recordingStatus$
        .pipe(distinctUntilChanged(shallowEqual))
        .subscribe(status => {
          const popup = this.popupManager.get('recording');

          if (status && !popup.showing) {
            popup.show().catch(err => {
              this.logger.error('failed to show recording popup', err);
            });
          }

          if (status?.status === 'recording') {
            let recording = this.recordings.get(status.id);
            // create a recording if not exists
            if (!recording) {
              recording = this.createRecording(status);
            }
          } else if (status?.status === 'stopped') {
            const recording = this.recordings.get(status.id);
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
                  (this.recordingStatus$.value?.status ===
                    'create-block-success' ||
                    this.recordingStatus$.value?.status ===
                      'create-block-failed') &&
                  this.recordingStatus$.value.id === status.id
                ) {
                  popup.hide().catch(err => {
                    this.logger.error(
                      'failed to hide recording popup',
                      err,
                      this.context
                    );
                  });
                }
              },
              status?.status === 'create-block-failed' ? 30_000 : 10_000
            );
          } else if (!status) {
            // status is removed, we should hide the popup
            this.popupManager
              .get('recording')
              .hide()
              .catch(err => {
                this.logger.error(
                  'failed to hide recording popup',
                  err,
                  this.context
                );
              });
          }
        })
    );
  };

  private readonly setupMediaListeners = () => {
    const ShareableContent = require('@affine/native').ShareableContent;

    this.applications$.next(this.getAllApps());
    this.subscribers.push(
      interval(3000).subscribe(() => {
        this.updateApplicationsPing$.next(Date.now());
      }),
      ShareableContent.onApplicationListChanged(() => {
        this.updateApplicationsPing$.next(Date.now());
      }),
      this.updateApplicationsPing$
        .pipe(distinctUntilChanged(), throttleTime(3000))
        .subscribe(() => {
          this.applications$.next(this.getAllApps());
        })
    );

    let appStateSubscribers: Subscriber[] = [];

    this.subscribers.push(
      this.applications$.subscribe(apps => {
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
                this.updateApplicationsPing$.next(Date.now());
              })
            );
          } catch (error) {
            this.logger.error(
              `Failed to set up app state listener for ${app.name}`,
              error,
              this.context
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
  };

  @IpcHandle({ scope: IpcScope.RECORDING })
  setupRecordingFeature() {
    if (
      !this.meetingsSettingsState.value.enabled ||
      !this.checkCanRecordMeeting()
    ) {
      return;
    }

    try {
      const ShareableContent = require('@affine/native').ShareableContent;
      if (!this.shareableContent) {
        this.shareableContent = new ShareableContent();
        this.setupMediaListeners();
      }
      // reset all states
      this.recordingStatus$.next(null);
      this.setupAppGroups();
      this.setupNewRunningAppGroup();
      this.setupRecordingListeners();
      return true;
    } catch (error) {
      this.logger.error(
        'failed to setup recording feature',
        error,
        this.context
      );
      return false;
    }
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  askForScreenRecordingPermission() {
    if (!isMacOS()) {
      return false;
    }
    try {
      const ShareableContent = require('@affine/native').ShareableContent;
      // this will trigger the permission prompt
      new ShareableContent();
      return true;
    } catch (error) {
      this.logger.error(
        'failed to ask for screen recording permission',
        error,
        this.context
      );
    }
    return false;
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  getRecording(id: number) {
    return this.recordings.get(id);
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  getCurrentRecording() {
    const status = this.recordingStatus$.value;
    return status ? this.serializeRecordingStatus(status) : null;
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  startRecording(appGroup?: AppGroupInfo | number): RecordingStatus | null {
    const state = this.state.dispatch(
      {
        type: 'START_RECORDING',
        appGroup: this.normalizeAppGroupInfo(appGroup),
      },
      false
    );

    if (state?.status === 'recording') {
      this.createRecording(state);
    }

    this.state.status$.next(state);

    return state;
  }

  getSanitizedAppId(bundleIdentifier?: string) {
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

  createRecording(status: RecordingStatus) {
    let recording = this.recordings.get(status.id);
    if (recording) {
      return recording;
    }

    const appId = this.getSanitizedAppId(status.appGroup?.bundleIdentifier);

    const bufferedFilePath = path.join(
      SAVED_RECORDINGS_DIR,
      `${appId}-${status.id}-${status.startTime}.raw`
    );

    fs.ensureDirSync(SAVED_RECORDINGS_DIR);
    const file = fs.createWriteStream(bufferedFilePath);

    const tapAudioSamples = (err: Error | null, samples: Float32Array) => {
      const recordingStatus = this.recordingStatus$.value;
      if (
        !recordingStatus ||
        recordingStatus.id !== status.id ||
        recordingStatus.status === 'paused'
      ) {
        return;
      }

      if (err) {
        this.logger.error('failed to get audio samples', err, this.context);
      } else {
        // Writing raw Float32Array samples directly to file
        // For stereo audio, samples are interleaved [L,R,L,R,...]
        file.write(Buffer.from(samples.buffer));
      }
    };

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

    this.recordings.set(status.id, recording);

    return recording;
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  async stopRecording(id: number) {
    const recording = this.recordings.get(id);
    if (!recording) {
      this.logger.error(
        `stopRecording: Recording ${id} not found`,
        this.context
      );
      return;
    }

    if (!recording.file.path) {
      this.logger.error(`Recording ${id} has no file path`, this.context);
      return;
    }

    const { file, session: stream } = recording;

    // First stop the audio stream to prevent more data coming in
    try {
      stream.stop();
    } catch (err) {
      this.logger.error('Failed to stop audio stream', err, this.context);
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

      const recordingStatus = this.state.dispatch({
        type: 'STOP_RECORDING',
        id,
      });

      if (!recordingStatus) {
        this.logger.error('No recording status to stop', this.context);
        return;
      }
      return this.serializeRecordingStatus(recordingStatus);
    } catch (error: unknown) {
      this.logger.error('Failed to stop recording', error, this.context);
      const recordingStatus = this.state.dispatch({
        type: 'CREATE_BLOCK_FAILED',
        id,
        error: error instanceof Error ? error : undefined,
      });
      if (!recordingStatus) {
        this.logger.error('No recording status to stop', this.context);
        return;
      }
      return this.serializeRecordingStatus(recordingStatus);
    } finally {
      // Clean up the file stream if it's still open
      if (!file.closed) {
        file.destroy();
      }
    }
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  pauseRecording(id: number) {
    return this.state.dispatch({
      type: 'PAUSE_RECORDING',
      id,
    });
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  resumeRecording(id: number) {
    return this.state.dispatch({
      type: 'RESUME_RECORDING',
      id,
    });
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  removeRecording(id: number) {
    this.recordings.delete(id);
    this.state.dispatch({ type: 'REMOVE_RECORDING', id });
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  async readyRecording(id: number, buffer: Uint8Array) {
    this.logger.log('readyRecording', id);

    const recordingStatus = this.recordingStatus$.value;
    const recording = this.recordings.get(id);
    if (!recordingStatus || recordingStatus.id !== id || !recording) {
      this.logger.error(
        `readyRecording: Recording ${id} not found`,
        this.context
      );
      return;
    }

    const rawFilePath = String(recording.file.path);

    const filepath = rawFilePath.replace('.raw', '.opus');

    if (!filepath) {
      this.logger.error(
        `readyRecording: Recording ${id} has no filepath`,
        this.context
      );
      return;
    }

    await fs.writeFile(filepath, Buffer.from(buffer));

    // can safely remove the raw file now
    this.logger.log('remove raw file', rawFilePath);
    if (rawFilePath) {
      try {
        await fs.unlink(rawFilePath);
      } catch (err) {
        this.logger.error('failed to remove raw file', err, this.context);
      }
    }
    // Update the status through the state machine
    this.state.dispatch({
      type: 'SAVE_RECORDING',
      id,
      filepath,
    });

    // bring up the window
    await this.mainWindow.show();
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  handleBlockCreationSuccess(id: number) {
    this.state.dispatch({
      type: 'CREATE_BLOCK_SUCCESS',
      id,
    });
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  handleBlockCreationFailed(id: number, error?: Error) {
    this.state.dispatch({
      type: 'CREATE_BLOCK_FAILED',
      id,
      error,
    });
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  disableRecordingFeature() {
    this.recordingStatus$.next(null);
    this.cleanup();
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  async getRawAudioBuffers(
    id: number,
    cursor?: number
  ): Promise<{
    buffer: Buffer;
    nextCursor: number;
  }> {
    const recording = this.recordings.get(id);
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

  normalizeAppGroupInfo(
    appGroup?: AppGroupInfo | number
  ): AppGroupInfo | undefined {
    return typeof appGroup === 'number'
      ? this.appGroups$.value.find(group => group.processGroupId === appGroup)
      : appGroup;
  }

  newRecording(appGroup?: AppGroupInfo | number): RecordingStatus | null {
    return this.state.dispatch({
      type: 'NEW_RECORDING',
      appGroup: this.normalizeAppGroupInfo(appGroup),
    });
  }

  serializeRecordingStatus(status: RecordingStatus): SerializedRecordingStatus {
    const recording = this.recordings.get(status.id);
    return {
      id: status.id,
      status: status.status,
      appName: status.appGroup?.name,
      appGroupId: status.appGroup?.processGroupId,
      icon: status.appGroup?.icon,
      startTime: status.startTime,
      filepath:
        status.filepath ??
        (recording ? String(recording.file.path) : undefined),
      sampleRate: recording?.session.sampleRate,
      numberOfChannels: recording?.session.channels,
    };
  }

  getAllApps(): TappableAppInfo[] {
    if (!this.shareableContent) {
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
        this.logger.error('failed to get app info', error, this.context);
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

  getMacOSVersion() {
    try {
      const stdout = execSync('sw_vers -productVersion').toString();
      const [major, minor, patch] = stdout.trim().split('.').map(Number);
      return { major, minor, patch };
    } catch (error) {
      this.logger.error('Failed to get MacOS version', error, this.context);
      return { major: 0, minor: 0, patch: 0 };
    }
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  checkRecordingAvailable() {
    if (isMacOS()) {
      const version = this.getMacOSVersion();
      return (version.major === 14 && version.minor >= 2) || version.major > 14;
    }
    if (isWindows()) {
      return true;
    }
    return false;
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  checkMeetingPermissions() {
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
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  checkCanRecordMeeting() {
    const features = this.checkMeetingPermissions();
    return (
      this.checkRecordingAvailable() &&
      features &&
      Object.values(features).every(feature => feature)
    );
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  async askForMeetingPermission(type: 'microphone' | 'screen') {
    if (isWindows()) {
      return {
        screen: true,
        microphone: true,
      };
    }
    if (!isMacOS()) {
      return false;
    }
    if (type === 'screen') {
      return this.askForScreenRecordingPermission();
    }
    return systemPreferences.askForMediaAccess(type);
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  async showRecordingPermissionSetting({
    type,
  }: {
    type: 'screen' | 'microphone';
  }) {
    if (isMacOS()) {
      const urlMap = {
        screen: 'Privacy_ScreenCapture',
        microphone: 'Privacy_Microphone',
      };
      const url = `x-apple.systempreferences:com.apple.preference.security?${urlMap[type]}`;
      return shell.openExternal(url);
    }
    // this only available on MacOS
    return false;
  }

  @IpcHandle({ scope: IpcScope.RECORDING })
  showSavedRecordings(subpath?: string) {
    const normalizedDir = path.normalize(
      path.join(SAVED_RECORDINGS_DIR, subpath ?? '')
    );
    const normalizedBase = path.normalize(SAVED_RECORDINGS_DIR);

    if (!normalizedDir.startsWith(normalizedBase)) {
      throw new Error('Invalid directory');
    }
    return shell.showItemInFolder(normalizedDir);
  }
}
