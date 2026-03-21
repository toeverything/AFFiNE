import { BehaviorSubject } from 'rxjs';

import { logger } from '../logger';
import { globalStateStorage } from '../shared-storage/storage';
import type {
  RecordingArtifactInfo,
  RecordingImportState,
  RecordingImportStatus,
  RecordingSessionStatus,
} from './types';

const RECORDING_IMPORT_REGISTRY_KEY = 'recordingImportRegistry:v1';

function isImportState(value: unknown): value is RecordingImportState {
  return (
    value === 'pending_import' ||
    value === 'importing' ||
    value === 'imported' ||
    value === 'import_failed'
  );
}

function isArtifactInfo(value: unknown): value is RecordingArtifactInfo {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const artifact = value as Partial<RecordingArtifactInfo>;
  return (
    typeof artifact.filepath === 'string' &&
    (artifact.sampleRate === undefined ||
      typeof artifact.sampleRate === 'number') &&
    (artifact.numberOfChannels === undefined ||
      typeof artifact.numberOfChannels === 'number') &&
    (artifact.durationMs === undefined ||
      typeof artifact.durationMs === 'number') &&
    (artifact.size === undefined || typeof artifact.size === 'number') &&
    (artifact.degraded === undefined ||
      typeof artifact.degraded === 'boolean') &&
    (artifact.overflowCount === undefined ||
      typeof artifact.overflowCount === 'number')
  );
}

function isRecordingImportStatus(
  value: unknown
): value is RecordingImportStatus {
  if (!isArtifactInfo(value) || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<RecordingImportStatus>;
  return (
    typeof item.id === 'number' &&
    typeof item.startTime === 'number' &&
    typeof item.createdAt === 'number' &&
    typeof item.updatedAt === 'number' &&
    isImportState(item.importStatus) &&
    (item.appName === undefined || typeof item.appName === 'string') &&
    (item.errorMessage === undefined || typeof item.errorMessage === 'string')
  );
}

function loadPersistedImports() {
  const persisted = globalStateStorage.get(RECORDING_IMPORT_REGISTRY_KEY);
  if (!Array.isArray(persisted)) {
    return [] as RecordingImportStatus[];
  }
  return persisted.filter(isRecordingImportStatus);
}

export class RecordingArtifactRegistry {
  private readonly imports$ = new BehaviorSubject<RecordingImportStatus[]>(
    loadPersistedImports()
  );

  get entries$() {
    return this.imports$;
  }

  get entries() {
    return this.imports$.value;
  }

  private setEntries(
    updater:
      | RecordingImportStatus[]
      | ((entries: RecordingImportStatus[]) => RecordingImportStatus[])
  ) {
    const nextEntries =
      typeof updater === 'function' ? updater(this.imports$.value) : updater;
    this.imports$.next(nextEntries);
    globalStateStorage.set(RECORDING_IMPORT_REGISTRY_KEY, nextEntries);
    return nextEntries;
  }

  enqueueFromSession(
    session: RecordingSessionStatus,
    artifact: RecordingArtifactInfo
  ) {
    const now = Date.now();
    return this.setEntries(entries => {
      const next = entries.filter(entry => entry.id !== session.id);
      next.push({
        id: session.id,
        appName: session.appGroup?.name,
        startTime: session.startTime,
        importStatus: 'pending_import',
        createdAt: now,
        updatedAt: now,
        ...artifact,
      });
      next.sort((left, right) => left.createdAt - right.createdAt);
      return next;
    }).find(entry => entry.id === session.id);
  }

  claim(id: number) {
    let claimed: RecordingImportStatus | null = null;
    this.setEntries(entries =>
      entries.map(entry => {
        if (entry.id !== id) {
          return entry;
        }
        if (
          entry.importStatus !== 'pending_import' &&
          entry.importStatus !== 'import_failed'
        ) {
          return entry;
        }
        claimed = {
          ...entry,
          importStatus: 'importing',
          errorMessage: undefined,
          updatedAt: Date.now(),
        };
        return claimed;
      })
    );
    return claimed;
  }

  markImported(id: number) {
    return this.updateState(id, 'imported');
  }

  markFailed(id: number, errorMessage?: string) {
    return this.updateState(id, 'import_failed', errorMessage);
  }

  remove(id: number) {
    this.setEntries(entries => entries.filter(entry => entry.id !== id));
  }

  latest() {
    return [...this.entries].sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt - left.updatedAt;
      }
      return right.id - left.id;
    })[0];
  }

  private updateState(
    id: number,
    importStatus: RecordingImportState,
    errorMessage?: string
  ) {
    let updated: RecordingImportStatus | null = null;
    this.setEntries(entries =>
      entries.map(entry => {
        if (entry.id !== id) {
          return entry;
        }
        updated = {
          ...entry,
          importStatus,
          errorMessage,
          updatedAt: Date.now(),
        };
        return updated;
      })
    );
    if (!updated) {
      logger.error(`Recording import ${id} not found`);
    }
    return updated;
  }
}

export const recordingArtifactRegistry = new RecordingArtifactRegistry();
