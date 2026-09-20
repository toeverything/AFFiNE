import {
  getNativeImportSessionHandlers,
  type NativeImportSessionHandlers,
} from '@affine/core/modules/import/runtime-config';
import type {
  NativeImportBrowserSource,
  NativeImportFormat,
} from '@affine/electron-api';
import type {
  ImportBatch,
  ImportCommitResult,
} from '@blocksuite/affine/widgets/linked-doc';

import type { ImportCommitService } from './commit-service';

const NATIVE_IMPORT_BATCH_LIMITS = {
  maxDocs: 20,
  maxBlobs: 20,
  maxBlobBytes: 10 * 1024 * 1024,
};

export async function commitNativeImport(
  format: NativeImportFormat,
  source: File | File[],
  commitService: ImportCommitService,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: { completed: number; total: number }) => void;
  } = {}
): Promise<ImportCommitResult> {
  const native = await getNativeImporter();
  if (options.signal?.aborted) {
    throw new DOMException('Import cancelled', 'AbortError');
  }
  const sessionId = await native.createImportSession({
    format,
    source: getNativeImportSource(source),
    batchLimits: NATIVE_IMPORT_BATCH_LIMITS,
  });

  const docIds: string[] = [];
  const warnings: ImportCommitResult['warnings'] = [];
  let entryId: string | undefined;
  let isWorkspaceFile = false;
  let rootFolderId: string | undefined;
  let cancelled = false;

  try {
    for (;;) {
      if (options.signal?.aborted) {
        cancelled = true;
        try {
          await native.cancelImportSession(sessionId);
        } catch {
          // Preserve the AbortError reported to callers.
        }
        throw new DOMException('Import cancelled', 'AbortError');
      }
      const payload = await native.nextImportBatch(sessionId);
      if (!payload) break;
      const batch = JSON.parse(payload) as ImportBatch;
      options.onProgress?.(batch.progress ?? { completed: 0, total: 0 });
      const result = await commitService.commitBatch(batch);
      docIds.push(...result.docIds);
      warnings.push(...result.warnings);
      entryId ??= batch.entryId;
      isWorkspaceFile ||= !!batch.isWorkspaceFile;
      rootFolderId ??= result.rootFolderId;
    }
  } catch (error) {
    if (!cancelled) {
      try {
        await native.cancelImportSession(sessionId);
      } catch {
        // Preserve the original import error.
      }
    }
    throw error;
  } finally {
    await native.disposeImportSession(sessionId);
  }

  if (!docIds.length && !isWorkspaceFile) {
    throw new Error('No importable documents were found in the selected file.');
  }

  return {
    docIds,
    entryId,
    isWorkspaceFile,
    rootFolderId,
    warnings,
  };
}

async function getNativeImporter(): Promise<NativeImportSessionHandlers> {
  const registered = getNativeImportSessionHandlers();
  if (registered) {
    return registered;
  }
  throw new Error('Native import session handlers are not registered');
}

function getNativeImportSource(
  source: File | File[]
): NativeImportBrowserSource {
  if (Array.isArray(source)) {
    return { kind: 'directory', files: source };
  }
  return { kind: 'file', file: source };
}
