// eslint-disable no-var-requires

// Should not load @affine/native for unsupported platforms

import { shell } from 'electron';

import { isMacOS, resolvePathInBase } from '../../shared/utils';
import { openExternalSafely } from '../security/open-external';
import type { NamespaceHandlers } from '../type';
import {
  askForMeetingPermission,
  checkMeetingPermissions,
  checkRecordingAvailable,
  disableRecordingFeature,
  getRecording,
  readRecordingFile,
  recordingStatus$,
  removeRecording,
  SAVED_RECORDINGS_DIR,
  type SerializedRecordingStatus,
  serializeRecordingStatus,
  setRecordingBlockCreationStatus,
  setupRecordingFeature,
  startRecording,
  stopRecording,
} from './feature';
import type { AppGroupInfo } from './types';

export const recordingHandlers = {
  getRecording: async (_, id: number) => {
    return getRecording(id);
  },
  getCurrentRecording: async () => {
    // not all properties are serializable, so we need to return a subset of the status
    return recordingStatus$.value
      ? serializeRecordingStatus(recordingStatus$.value)
      : null;
  },
  startRecording: async (_, appGroup?: AppGroupInfo | number) => {
    return startRecording(appGroup);
  },
  stopRecording: async (_, id: number) => {
    return stopRecording(id);
  },
  readRecordingFile: async (_, filepath: string) => {
    return readRecordingFile(filepath);
  },
  setRecordingBlockCreationStatus: async (
    _,
    id: number,
    status: 'success' | 'failed',
    errorMessage?: string
  ) => {
    return setRecordingBlockCreationStatus(id, status, errorMessage);
  },
  removeRecording: async (_, id: number) => {
    return removeRecording(id);
  },
  checkRecordingAvailable: async () => {
    return checkRecordingAvailable();
  },
  setupRecordingFeature: async () => {
    return setupRecordingFeature();
  },
  disableRecordingFeature: async () => {
    return disableRecordingFeature();
  },
  checkMeetingPermissions: async () => {
    return checkMeetingPermissions();
  },
  askForMeetingPermission: async (_, type: 'screen' | 'microphone') => {
    return askForMeetingPermission(type);
  },
  showRecordingPermissionSetting: async (_, type: 'screen' | 'microphone') => {
    if (isMacOS()) {
      const urlMap = {
        screen: 'Privacy_ScreenCapture',
        microphone: 'Privacy_Microphone',
      };
      const url = `x-apple.systempreferences:com.apple.preference.security?${urlMap[type]}`;
      return openExternalSafely(url, {
        additionalProtocols: ['x-apple.systempreferences:'],
      });
    }
    // this only available on MacOS
    return false;
  },
  showSavedRecordings: async (_, subpath?: string) => {
    const directory = resolvePathInBase(SAVED_RECORDINGS_DIR, subpath ?? '', {
      label: 'directory',
    });
    return shell.showItemInFolder(directory);
  },
} satisfies NamespaceHandlers;

export const recordingEvents = {
  onRecordingStatusChanged: (
    fn: (status: SerializedRecordingStatus | null) => void
  ) => {
    const sub = recordingStatus$.subscribe(status => {
      fn(status ? serializeRecordingStatus(status) : null);
    });
    return () => {
      try {
        sub.unsubscribe();
      } catch {
        // ignore unsubscribe error
      }
    };
  },
};
