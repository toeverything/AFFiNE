// eslint-disable no-var-requires

// Should not load @affine/native for unsupported platforms

import path from 'node:path';

import { shell } from 'electron';

import { isMacOS } from '../../shared/utils';
import { openExternalSafely } from '../security/open-external';
import type { NamespaceHandlers } from '../type';
import {
  askForMeetingPermission,
  checkMeetingPermissions,
  checkRecordingAvailable,
  disableRecordingFeature,
  getRawAudioBuffers,
  getRecording,
  handleBlockCreationFailed,
  handleBlockCreationSuccess,
  pauseRecording,
  readRecordingFile,
  readyRecording,
  recordingStatus$,
  removeRecording,
  SAVED_RECORDINGS_DIR,
  type SerializedRecordingStatus,
  serializeRecordingStatus,
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
  pauseRecording: async (_, id: number) => {
    return pauseRecording(id);
  },
  stopRecording: async (_, id: number) => {
    return stopRecording(id);
  },
  getRawAudioBuffers: async (_, id: number, cursor?: number) => {
    return getRawAudioBuffers(id, cursor);
  },
  readRecordingFile: async (_, filepath: string) => {
    return readRecordingFile(filepath);
  },
  // save the encoded recording buffer to the file system
  readyRecording: async (_, id: number, buffer: Uint8Array) => {
    return readyRecording(id, Buffer.from(buffer));
  },
  handleBlockCreationSuccess: async (_, id: number) => {
    return handleBlockCreationSuccess(id);
  },
  handleBlockCreationFailed: async (_, id: number, error?: Error) => {
    return handleBlockCreationFailed(id, error);
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
    const normalizedDir = path.normalize(
      path.join(SAVED_RECORDINGS_DIR, subpath ?? '')
    );
    const normalizedBase = path.normalize(SAVED_RECORDINGS_DIR);

    if (!normalizedDir.startsWith(normalizedBase)) {
      throw new Error('Invalid directory');
    }
    return shell.showItemInFolder(normalizedDir);
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
