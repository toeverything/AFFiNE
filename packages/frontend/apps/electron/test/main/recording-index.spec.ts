import { BehaviorSubject } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';

const recordingStatus$ = new BehaviorSubject(null);
const recordingImportQueue$ = new BehaviorSubject([
  {
    id: 7,
    appName: 'Zoom',
    workspaceId: 'workspace-1',
    docId: 'recording-7',
    startTime: 1000,
    filepath: '/tmp/meeting.opus',
    importStatus: 'importing' as const,
    createdAt: 1,
    updatedAt: 1,
  },
]);

vi.mock('electron', () => ({
  shell: {
    showItemInFolder: vi.fn(),
  },
}));

vi.mock('../../src/shared/utils', () => ({
  isMacOS: () => false,
  resolvePathInBase: vi.fn((_base: string, subpath: string) => subpath),
}));

vi.mock('../../src/main/security/open-external', () => ({
  openExternalSafely: vi.fn(),
}));

vi.mock('../../src/main/recording/feature', () => ({
  askForMeetingPermission: vi.fn(),
  checkMeetingPermissions: vi.fn(),
  checkRecordingAvailable: vi.fn(),
  claimRecordingImport: vi.fn(),
  completeRecordingImport: vi.fn(),
  disableRecordingFeature: vi.fn(),
  dismissRecordingStatus: vi.fn(),
  failRecordingImport: vi.fn(),
  getCurrentRecordingStatus: vi.fn(),
  getRecording: vi.fn(),
  getRecordingImportQueue: vi.fn(),
  readRecordingFile: vi.fn(),
  recordingImportQueue$,
  recordingStatus$,
  removeRecording: vi.fn(),
  SAVED_RECORDINGS_DIR: '/tmp',
  serializeRecordingStatus: vi.fn(),
  setupRecordingFeature: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
}));

describe('recording index events', () => {
  test('onRecordingImportQueueChanged preserves workspace binding metadata', async () => {
    const { recordingEvents } = await import('../../src/main/recording');
    const handler = vi.fn();

    const unsubscribe = recordingEvents.onRecordingImportQueueChanged(handler);

    expect(handler).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 7,
        workspaceId: 'workspace-1',
        docId: 'recording-7',
        importStatus: 'importing',
      }),
    ]);

    unsubscribe();
  });
});
