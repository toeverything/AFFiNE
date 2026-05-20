/* oxlint-disable no-var-requires */
import { execSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type * as NativeModuleType from '@affine/native';
import { app, systemPreferences } from 'electron';
import fs from 'fs-extra';
import { debounce } from 'lodash-es';
import {
  BehaviorSubject,
  distinctUntilChanged,
  groupBy,
  interval,
  mergeMap,
  type Observable,
  Subject,
  throttleTime,
} from 'rxjs';
import { filter, map, shareReplay } from 'rxjs/operators';

import {
  isMacOS,
  isWindows,
  resolveExistingPathInBase,
  shallowEqual,
} from '../../shared/utils';
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
import { RecordingCoordinator } from './coordinator';
import type {
  AppGroupInfo,
  RecordingImportStatus,
  RecordingJobStatus,
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

type Subscriber = {
  unsubscribe: () => void;
};

const subscribers: Subscriber[] = [];
let appStateSubscribers: Subscriber[] = [];

export const SAVED_RECORDINGS_DIR = path.join(
  app.getPath('sessionData'),
  'recordings'
);

type NativeModule = typeof NativeModuleType;
type ShareableContentType = InstanceType<NativeModule['ShareableContent']>;
type ShareableContentStatic = NativeModule['ShareableContent'];

let shareableContent: ShareableContentType | null = null;
let nativeModuleOverride: NativeModule | null = null;

function getNativeModule(): NativeModule {
  return nativeModuleOverride ?? (require('@affine/native') as NativeModule);
}

async function getNativeModuleAsync(): Promise<NativeModule> {
  if (nativeModuleOverride) {
    return nativeModuleOverride;
  }
  return (await import('@affine/native')) as NativeModule;
}

async function assertRecordingFilepath(filepath: string) {
  return await resolveExistingPathInBase(SAVED_RECORDINGS_DIR, filepath, {
    caseInsensitive: isWindows(),
    label: 'recording filepath',
  });
}

const recordingCoordinator = new RecordingCoordinator(
  SAVED_RECORDINGS_DIR,
  assertRecordingFilepath,
  async () => {
    const nativeModule = await getNativeModuleAsync();
    return {
      startRecording: nativeModule.startRecording,
      stopRecording: nativeModule.stopRecording,
      abortRecording: nativeModule.abortRecording,
    };
  }
);

export function setRecordingNativeModuleForTesting(
  nativeModule: NativeModule | null
) {
  nativeModuleOverride = nativeModule;
}

function resetFeatureSubscriptions() {
  appStateSubscribers.forEach(subscriber => {
    try {
      subscriber.unsubscribe();
    } catch {
      // ignore unsubscribe error
    }
  });
  appStateSubscribers = [];
  subscribers.forEach(subscriber => {
    try {
      subscriber.unsubscribe();
    } catch {
      // ignore unsubscribe error
    }
  });
  subscribers.length = 0;
  shareableContent = null;
  applications$.next([]);
  appGroups$.next([]);
}

async function abortActiveRecording() {
  try {
    await recordingCoordinator.abortActive();
  } catch (error) {
    logger.error('failed to cleanup abandoned native recording', error);
  }
}

beforeAppQuit(() => {
  void abortActiveRecording().catch(() => undefined);
  resetFeatureSubscriptions();
});

export const applications$ = new BehaviorSubject<TappableAppInfo[]>([]);
export const appGroups$ = new BehaviorSubject<AppGroupInfo[]>([]);
export const updateApplicationsPing$ = new Subject<number>();

export const recordingStatus$: Observable<RecordingStatus | null> =
  recordingCoordinator.status$;
export const recordingImportQueue$: Observable<RecordingImportStatus[]> =
  recordingCoordinator.importQueue$;

export function getCurrentRecordingStatus() {
  return recordingCoordinator.currentStatus();
}

function hasActivePopupStatus(status: RecordingStatus | null | undefined) {
  return (
    status?.status === 'starting' ||
    status?.status === 'recording' ||
    status?.status === 'finalizing'
  );
}

function isTerminalPopupStatus(
  status: RecordingStatus | null | undefined
): status is RecordingStatus & {
  status: 'imported' | 'import_failed' | 'start_failed' | 'finalize_failed';
} {
  return (
    status?.status === 'imported' ||
    status?.status === 'import_failed' ||
    status?.status === 'start_failed' ||
    status?.status === 'finalize_failed'
  );
}

function createAppGroup(processGroupId: number): AppGroupInfo | undefined {
  const SC: ShareableContentStatic = getNativeModule().ShareableContent;
  const groupProcess = SC?.applicationWithProcessId(processGroupId);
  if (!groupProcess) {
    return;
  }
  return {
    processGroupId,
    apps: [],
    name: groupProcess.name,
    bundleIdentifier: groupProcess.bundleIdentifier,
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

function setupAppGroups() {
  subscribers.push(
    applications$.pipe(distinctUntilChanged()).subscribe(apps => {
      const groups: AppGroupInfo[] = [];
      apps.forEach(appInfo => {
        let group = groups.find(
          entry => entry.processGroupId === appInfo.processGroupId
        );
        if (!group) {
          group = createAppGroup(appInfo.processGroupId);
          if (group) {
            groups.push(group);
          }
        }
        if (group) {
          group.apps.push(appInfo);
        }
      });

      groups.forEach(group => {
        group.isRunning = group.apps.some(app => app.isRunning);
      });

      appGroups$.next(groups);
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
    const recordingStatus = getCurrentRecordingStatus();
    if (
      group.isRunning &&
      (!recordingStatus || recordingStatus.status === 'new')
    ) {
      newRecording(group);
    }
  });

  const debounceStartRecording = debounce((appGroup: AppGroupInfo) => {
    const currentGroup = appGroups$.value.find(
      group => group.processGroupId === appGroup.processGroupId
    );
    if (currentGroup?.isRunning) {
      void startRecording(currentGroup).catch(err => {
        logger.error('failed to start recording', err);
      });
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

      const recordingStatus = getCurrentRecordingStatus();

      if (currentGroup.isRunning) {
        if (
          !recordingStatus ||
          recordingStatus.status === 'new' ||
          !hasActivePopupStatus(recordingStatus)
        ) {
          if (MeetingsSettingsState.value.recordingMode === 'prompt') {
            newRecording(currentGroup);
          } else if (
            MeetingsSettingsState.value.recordingMode === 'auto-start'
          ) {
            debounceStartRecording(currentGroup);
          }
        }
      } else {
        if (
          recordingStatus?.status === 'new' &&
          recordingStatus.appGroupId === currentGroup.processGroupId
        ) {
          removeRecording(recordingStatus.id);
        }

        if (
          recordingStatus?.status === 'recording' &&
          recordingStatus.appGroupId === currentGroup.processGroupId
        ) {
          void stopRecording(recordingStatus.id).catch(err => {
            logger.error('failed to stop recording', err);
          });
        }
      }
    })
  );
}

export async function getRecording(id: number) {
  return recordingCoordinator.getRecording(id);
}

function setupRecordingListeners() {
  subscribers.push(
    recordingStatus$
      .pipe(distinctUntilChanged(shallowEqual))
      .subscribe(status => {
        const popup = popupManager.get('recording');

        if (status && !popup.showing) {
          void popup.show().catch(err => {
            logger.error('failed to show recording popup', err);
          });
        }

        if (isTerminalPopupStatus(status)) {
          setTimeout(
            () => {
              const currentStatus = getCurrentRecordingStatus();
              if (
                isTerminalPopupStatus(currentStatus) &&
                currentStatus.id === status.id
              ) {
                void popup.hide().catch(err => {
                  logger.error('failed to hide recording popup', err);
                });
                dismissRecordingStatus(status.id);
              }
            },
            status.status === 'import_failed' ||
              status.status === 'start_failed' ||
              status.status === 'finalize_failed'
              ? 30_000
              : 10_000
          );
        } else if (!status) {
          void popupManager
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

  const { ShareableContent } = getNativeModule();
  const apps = ShareableContent.applications().map(appInfo => {
    try {
      const isRunning = ShareableContent.isUsingMicrophone(appInfo.processId);
      return {
        info: appInfo,
        processId: appInfo.processId,
        processGroupId: appInfo.processGroupId,
        bundleIdentifier: appInfo.bundleIdentifier,
        name: appInfo.name,
        isRunning,
      };
    } catch (error) {
      logger.error('failed to get app info', error);
      return null;
    }
  });

  return apps.filter(
    (value): value is TappableAppInfo =>
      value !== null &&
      !value.bundleIdentifier.startsWith('com.apple') &&
      !value.bundleIdentifier.startsWith('pro.affine') &&
      value.processId !== process.pid
  );
}

function setupMediaListeners() {
  const ShareableContent = getNativeModule().ShareableContent;
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

  subscribers.push(
    applications$.subscribe(apps => {
      appStateSubscribers.forEach(subscriber => {
        try {
          subscriber.unsubscribe();
        } catch {
          // ignore unsubscribe error
        }
      });

      appStateSubscribers = apps.flatMap(appInfo => {
        try {
          return [
            ShareableContent.onAppStateChanged(appInfo.info, () => {
              updateApplicationsPing$.next(Date.now());
            }),
          ];
        } catch (error) {
          logger.error(
            `Failed to set up app state listener for ${appInfo.name}`,
            error
          );
          return [];
        }
      });
    })
  );
}

function askForScreenRecordingPermission() {
  if (!isMacOS()) {
    return false;
  }
  try {
    const ShareableContent = getNativeModule().ShareableContent;
    new ShareableContent();
    return true;
  } catch (error) {
    logger.error('failed to ask for screen recording permission', error);
  }
  return false;
}

export function setupRecordingFeature() {
  if (!MeetingsSettingsState.value.enabled || !checkCanRecordMeeting()) {
    return;
  }

  try {
    const ShareableContent = getNativeModule().ShareableContent;
    if (!shareableContent) {
      shareableContent = new ShareableContent();
      setupMediaListeners();
    }
    setupAppGroups();
    setupNewRunningAppGroup();
    setupRecordingListeners();
    return true;
  } catch (error) {
    logger.error('failed to setup recording feature', error);
    return false;
  }
}

export async function disableRecordingFeature() {
  await abortActiveRecording();
  resetFeatureSubscriptions();
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
  recordingCoordinator.createPrompt(normalizeAppGroupInfo(appGroup));
  return serializeRecordingStatus(getCurrentRecordingStatus());
}

export async function startRecording(
  appGroup?: AppGroupInfo | number
): Promise<RecordingStatus | null> {
  fs.ensureDirSync(SAVED_RECORDINGS_DIR);
  const job = await recordingCoordinator.start(normalizeAppGroupInfo(appGroup));
  return serializeJob(job);
}

export async function stopRecording(id: number) {
  const job = await recordingCoordinator.stop(id);
  if (job?.phase === 'recorded') {
    void getMainWindow()
      .then(mainWindow => {
        if (mainWindow) {
          mainWindow.show();
        }
      })
      .catch(err => {
        logger.error('failed to bring up the window', err);
      });
  }
  return serializeRecordingStatus(getCurrentRecordingStatus());
}

export async function readRecordingFile(filepath: string) {
  const normalizedPath = await assertRecordingFilepath(filepath);
  return fsp.readFile(normalizedPath);
}

export function getRecordingImportQueue() {
  return recordingCoordinator.importQueue().flatMap(status => {
    const serialized = serializeRecordingImportStatus(status);
    return serialized ? [serialized] : [];
  });
}

export function claimRecordingImport(id: number, workspaceId: string) {
  return serializeRecordingImportStatus(
    recordingCoordinator.claimImport(id, workspaceId)
  );
}

export function completeRecordingImport(id: number) {
  logger.info(`recording import ${id} completed`);
  return serializeRecordingImportStatus(
    recordingCoordinator.completeImport(id)
  );
}

export function failRecordingImport(id: number, errorMessage?: string) {
  logger.error(`recording import ${id} failed`, errorMessage);
  return serializeRecordingImportStatus(
    recordingCoordinator.failImport(id, errorMessage)
  );
}

export function dismissRecordingStatus(id: number) {
  return serializeRecordingStatus(recordingCoordinator.dismiss(id));
}

export function removeRecording(id: number) {
  recordingCoordinator.remove(id);
}

export interface SerializedRecordingStatus {
  id: number;
  status: RecordingStatus['status'];
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

function serializeJob(job: RecordingJobStatus | null | undefined) {
  if (!job) {
    return null;
  }
  return serializeRecordingStatus(recordingCoordinator.currentStatus());
}

export function serializeRecordingStatus(
  status: RecordingStatus | null | undefined
): SerializedRecordingStatus | null {
  if (!status) {
    return null;
  }

  return {
    id: status.id,
    status: status.status,
    appName: status.appName,
    appGroupId: status.appGroupId,
    icon: status.icon,
    startTime: status.startTime,
    filepath: status.filepath,
    sampleRate: status.sampleRate,
    numberOfChannels: status.numberOfChannels,
    durationMs: status.durationMs,
    size: status.size,
    degraded: status.degraded,
    overflowCount: status.overflowCount,
    errorMessage: status.errorMessage,
  };
}

export interface SerializedRecordingImportStatus {
  id: number;
  appName?: string;
  workspaceId?: string;
  docId?: string;
  startTime: number;
  filepath: string;
  sampleRate?: number;
  numberOfChannels?: number;
  durationMs?: number;
  size?: number;
  degraded?: boolean;
  overflowCount?: number;
  importStatus: RecordingImportStatus['importStatus'];
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export function serializeRecordingImportStatus(
  status: RecordingImportStatus | null | undefined
): SerializedRecordingImportStatus | null {
  if (!status) {
    return null;
  }

  return {
    id: status.id,
    appName: status.appName,
    workspaceId: status.workspaceId,
    docId: status.docId,
    startTime: status.startTime,
    filepath: status.filepath,
    sampleRate: status.sampleRate,
    numberOfChannels: status.numberOfChannels,
    durationMs: status.durationMs,
    size: status.size,
    degraded: status.degraded,
    overflowCount: status.overflowCount,
    importStatus: status.importStatus,
    errorMessage: status.errorMessage,
    createdAt: status.createdAt,
    updatedAt: status.updatedAt,
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
