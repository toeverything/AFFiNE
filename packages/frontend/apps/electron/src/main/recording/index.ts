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
  claimRecordingImport,
  completeRecordingImport,
  disableRecordingFeature,
  dismissRecordingStatus,
  failRecordingImport,
  getCurrentRecordingStatus,
  getRecording,
  getRecordingImportQueue,
  readRecordingFile,
  recordingImportQueue$,
  recordingStatus$,
  removeRecording,
  SAVED_RECORDINGS_DIR,
  type SerializedRecordingImportStatus,
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
    const status = getCurrentRecordingStatus();
    return status ? serializeRecordingStatus(status) : null;
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
  getRecordingImportQueue: async () => {
    return getRecordingImportQueue();
  },
  claimRecordingImport: async (_, id: number, workspaceId: string) => {
    return claimRecordingImport(id, workspaceId);
  },
  completeRecordingImport: async (_, id: number) => {
    return completeRecordingImport(id);
  },
  dismissRecordingStatus: async (_, id: number) => {
    return dismissRecordingStatus(id);
  },
  failRecordingImport: async (_, id: number, errorMessage?: string) => {
    return failRecordingImport(id, errorMessage);
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
  onRecordingImportQueueChanged: (
    fn: (queue: SerializedRecordingImportStatus[]) => void
  ) => {
    const sub = recordingImportQueue$.subscribe(queue => {
      fn(
        queue.map(item => ({
          id: item.id,
          appName: item.appName,
          workspaceId: item.workspaceId,
          docId: item.docId,
          startTime: item.startTime,
          filepath: item.filepath,
          sampleRate: item.sampleRate,
          numberOfChannels: item.numberOfChannels,
          durationMs: item.durationMs,
          size: item.size,
          degraded: item.degraded,
          overflowCount: item.overflowCount,
          importStatus: item.importStatus,
          errorMessage: item.errorMessage,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }))
      );
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
