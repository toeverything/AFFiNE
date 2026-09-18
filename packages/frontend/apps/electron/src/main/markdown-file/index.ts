import { randomUUID } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';

import chokidar, { type FSWatcher } from 'chokidar';
import type { App } from 'electron';
import { Subject } from 'rxjs';

const markdownFileExtensions = new Set(['.md', '.markdown']);
const watcherDebounceMs = 200;

export type MarkdownOpenRequest = {
  requestId: string;
  filePath: string;
  state: 'pending' | 'claimed' | 'failed';
  errorMessage?: string;
};

export type MarkdownFileBinding = {
  filePath: string;
  workspaceId: string;
  docId: string;
  title: string;
  lastContentHash: string;
};

export type MarkdownFileReadResult = {
  filePath: string;
  content: string;
  mtimeMs: number;
};

export type MarkdownFileChangeResult = {
  filePath: string;
  mtimeMs: number;
};

export type MarkdownFileLineInfo = {
  filePath: string;
  lineCount: number;
  size: number;
  mtimeMs: number;
  writable: boolean;
};

export type MarkdownFileLineReadResult = {
  filePath: string;
  startLine: number;
  lineCount: number;
  totalLines: number;
  lines: string[];
  mtimeMs: number;
};

export type MarkdownFileWriteResult = {
  filePath: string;
  mtimeMs: number;
};

type MarkdownFileLineCache = MarkdownFileLineInfo & {
  lines: string[];
};

const openRequests = new Map<string, MarkdownOpenRequest>();
const filePathToRequestId = new Map<string, string>();
const bindings = new Map<string, MarkdownFileBinding>();
const watchers = new Map<string, FSWatcher>();
const watcherTimers = new Map<string, ReturnType<typeof setTimeout>>();
const unavailableTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lineCaches = new Map<string, MarkdownFileLineCache>();

const openRequest$ = new Subject<{ requestId: string; filePath: string }>();
const contentChanged$ = new Subject<MarkdownFileChangeResult>();
const fileUnavailable$ = new Subject<{
  filePath: string;
  reason: 'deleted' | 'unreadable';
}>();
const unavailableDebounceMs = 1000;

async function showMainWindowForMarkdownFile() {
  const { showMainWindow } = await import('../windows-manager');
  await showMainWindow();
}

function logMarkdownFile(message: string, payload?: Record<string, unknown>) {
  import('../logger')
    .then(({ logger }) => {
      logger.info(`[markdown-file] ${message}`, payload);
    })
    .catch(() => {
      console.info(`[markdown-file] ${message}`, payload);
    });
}

export function validateMarkdownFilePath(filePath: string) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    return null;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!markdownFileExtensions.has(ext)) {
    return null;
  }

  return path.resolve(filePath);
}

export function enqueueMarkdownOpenRequest(filePath: string) {
  const normalized = validateMarkdownFilePath(filePath);
  if (!normalized) {
    logMarkdownFile('ignored unsupported open request', { filePath });
    return false;
  }

  const existingRequestId = filePathToRequestId.get(normalized);
  if (existingRequestId) {
    logMarkdownFile('deduplicated open request', {
      filePath: normalized,
      requestId: existingRequestId,
    });
    return openRequests.get(existingRequestId) ?? false;
  }

  const request: MarkdownOpenRequest = {
    requestId: randomUUID(),
    filePath: normalized,
    state: 'pending',
  };
  openRequests.set(request.requestId, request);
  filePathToRequestId.set(normalized, request.requestId);
  logMarkdownFile('enqueued open request', {
    filePath: normalized,
    requestId: request.requestId,
  });

  return request;
}

export function getMarkdownFilePathsFromCommandLine(commandLine: string[]) {
  return commandLine
    .map(argument => validateMarkdownFilePath(argument))
    .filter((filePath): filePath is string => !!filePath);
}

function emitMarkdownOpenRequest(filePath: string) {
  const request = enqueueMarkdownOpenRequest(filePath);
  if (!request) {
    return false;
  }

  openRequest$.next({
    requestId: request.requestId,
    filePath: request.filePath,
  });
  logMarkdownFile('emitted open request', {
    filePath: request.filePath,
    requestId: request.requestId,
  });

  return true;
}

function emitMarkdownOpenRequests(filePaths: string[]) {
  let emitted = false;
  for (const filePath of filePaths) {
    emitted = emitMarkdownOpenRequest(filePath) || emitted;
  }
  return emitted;
}

export function getPendingMarkdownOpenRequests() {
  return Array.from(openRequests.values())
    .filter(request => request.state === 'pending')
    .map(({ requestId, filePath }) => ({ requestId, filePath }));
}

export function claimMarkdownOpenRequest(requestId: string) {
  const request = openRequests.get(requestId);
  if (!request || request.state !== 'pending') {
    logMarkdownFile('claim skipped', {
      requestId,
      state: request?.state,
    });
    return null;
  }

  request.state = 'claimed';
  logMarkdownFile('claimed open request', {
    requestId: request.requestId,
    filePath: request.filePath,
  });
  return { requestId: request.requestId, filePath: request.filePath };
}

export function failMarkdownOpenRequest(
  requestId: string,
  errorMessage?: string
) {
  const request = openRequests.get(requestId);
  if (!request || request.state !== 'claimed') {
    return;
  }

  request.state = 'failed';
  request.errorMessage = errorMessage;
  filePathToRequestId.delete(request.filePath);
  logMarkdownFile('failed open request', {
    requestId,
    filePath: request.filePath,
    errorMessage,
  });
}

export function completeMarkdownOpenRequest(
  binding: MarkdownFileBinding & {
    requestId: string;
  }
) {
  const request = openRequests.get(binding.requestId);
  const normalized = validateMarkdownFilePath(binding.filePath);
  if (
    !request ||
    request.state !== 'claimed' ||
    !normalized ||
    request.filePath !== normalized
  ) {
    logMarkdownFile('complete skipped', {
      requestId: binding.requestId,
      filePath: binding.filePath,
      requestState: request?.state,
      requestFilePath: request?.filePath,
    });
    return false;
  }

  openRequests.delete(binding.requestId);
  filePathToRequestId.delete(request.filePath);
  bindings.set(normalized, {
    filePath: normalized,
    workspaceId: binding.workspaceId,
    docId: binding.docId,
    title: binding.title,
    lastContentHash: binding.lastContentHash,
  });
  logMarkdownFile('completed open request', {
    requestId: binding.requestId,
    filePath: normalized,
    workspaceId: binding.workspaceId,
    docId: binding.docId,
  });
  return true;
}

export function updateMarkdownFileBinding(binding: MarkdownFileBinding) {
  const normalized = validateMarkdownFilePath(binding.filePath);
  if (!normalized) {
    return false;
  }
  const existing = bindings.get(normalized);
  if (
    !existing ||
    existing.workspaceId !== binding.workspaceId ||
    existing.docId !== binding.docId
  ) {
    logMarkdownFile('binding update skipped', {
      filePath: normalized,
      workspaceId: binding.workspaceId,
      docId: binding.docId,
    });
    return false;
  }

  bindings.set(normalized, {
    filePath: normalized,
    workspaceId: binding.workspaceId,
    docId: binding.docId,
    title: binding.title,
    lastContentHash: binding.lastContentHash,
  });
  logMarkdownFile('updated binding', {
    filePath: normalized,
    workspaceId: binding.workspaceId,
    docId: binding.docId,
  });

  return true;
}

export function getMarkdownFileBinding(filePath: string) {
  const normalized = validateMarkdownFilePath(filePath);
  if (!normalized) {
    return null;
  }

  return bindings.get(normalized) ?? null;
}

export function getMarkdownFileBindingByDocId(docId: string) {
  return (
    Array.from(bindings.values()).find(binding => binding.docId === docId) ??
    null
  );
}

function hasOpenRequestForFilePath(filePath: string) {
  return Array.from(openRequests.values()).some(
    request =>
      request.filePath === filePath &&
      (request.state === 'pending' || request.state === 'claimed')
  );
}

function assertAuthorizedMarkdownFilePath(
  filePath: string,
  options: { allowOpenRequest?: boolean } = {}
) {
  const normalized = validateMarkdownFilePath(filePath);
  if (!normalized) {
    throw new Error('Expected an absolute Markdown file path');
  }
  if (
    bindings.has(normalized) ||
    (options.allowOpenRequest && hasOpenRequestForFilePath(normalized))
  ) {
    return normalized;
  }

  throw new Error('Markdown file is not linked to an open request or binding');
}

export function forgetMarkdownFileBinding(filePath: string) {
  const normalized = validateMarkdownFilePath(filePath);
  if (!normalized) {
    return;
  }

  bindings.delete(normalized);
}

export function getFailedMarkdownOpenRequestsForTesting() {
  return Array.from(openRequests.values())
    .filter(request => request.state === 'failed')
    .map(({ requestId, filePath, errorMessage }) => ({
      requestId,
      filePath,
      errorMessage,
    }));
}

async function readMarkdownFile(
  filePath: string
): Promise<MarkdownFileReadResult> {
  const normalized = validateMarkdownFilePath(filePath);
  if (!normalized) {
    throw new Error('Expected an absolute Markdown file path');
  }

  const stat = await fs.stat(normalized);
  if (!stat.isFile()) {
    throw new Error('Expected a Markdown file');
  }

  const content = await fs.readFile(normalized, 'utf8');
  return {
    filePath: normalized,
    content,
    mtimeMs: stat.mtimeMs,
  };
}

async function writeMarkdownFile(
  filePath: string,
  content: string,
  expectedMtimeMs?: number
): Promise<MarkdownFileWriteResult> {
  const normalized = validateMarkdownFilePath(filePath);
  if (!normalized) {
    throw new Error('Expected an absolute Markdown file path');
  }
  if (typeof content !== 'string') {
    throw new Error('Expected Markdown content');
  }

  const stat = await fs.stat(normalized).catch(() => null);
  if (!stat?.isFile()) {
    throw new Error('Expected a Markdown file');
  }
  if (
    typeof expectedMtimeMs === 'number' &&
    Math.abs(stat.mtimeMs - expectedMtimeMs) > 1
  ) {
    throw new Error('Markdown file changed on disk before save');
  }

  await fs.writeFile(normalized, content, 'utf8');

  lineCaches.delete(normalized);
  const nextStat = await fs.stat(normalized);
  logMarkdownFile('wrote markdown file', {
    filePath: normalized,
    size: nextStat.size,
  });

  return {
    filePath: normalized,
    mtimeMs: nextStat.mtimeMs,
  };
}

async function getMarkdownLineCache(
  filePath: string
): Promise<MarkdownFileLineCache> {
  const normalized = validateMarkdownFilePath(filePath);
  if (!normalized) {
    throw new Error('Expected an absolute Markdown file path');
  }

  const stat = await fs.stat(normalized);
  if (!stat.isFile()) {
    throw new Error('Expected a Markdown file');
  }

  const cached = lineCaches.get(normalized);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    cached.writable = await fs
      .access(normalized, constants.W_OK)
      .then(() => true)
      .catch(() => false);
    return cached;
  }

  const content = await fs.readFile(normalized, 'utf8');
  const writable = await fs
    .access(normalized, constants.W_OK)
    .then(() => true)
    .catch(() => false);
  const lines = content.split(/\r\n|\n|\r/);
  const cache: MarkdownFileLineCache = {
    filePath: normalized,
    lines,
    lineCount: lines.length,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    writable,
  };
  lineCaches.set(normalized, cache);
  return cache;
}

async function getMarkdownFileLineInfo(
  filePath: string
): Promise<MarkdownFileLineInfo> {
  const { lines: _, ...info } = await getMarkdownLineCache(filePath);
  return info;
}

async function readMarkdownFileLines(
  filePath: string,
  startLine: number,
  lineCount: number
): Promise<MarkdownFileLineReadResult> {
  const cache = await getMarkdownLineCache(filePath);
  const safeStartLine = Math.max(0, Math.floor(startLine));
  const safeLineCount = Math.max(0, Math.min(1000, Math.floor(lineCount)));
  const lines = cache.lines.slice(safeStartLine, safeStartLine + safeLineCount);

  return {
    filePath: cache.filePath,
    startLine: safeStartLine,
    lineCount: lines.length,
    totalLines: cache.lineCount,
    lines,
    mtimeMs: cache.mtimeMs,
  };
}

function emitContentChanged(filePath: string) {
  const existingTimer = watcherTimers.get(filePath);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  watcherTimers.set(
    filePath,
    setTimeout(() => {
      watcherTimers.delete(filePath);
      const unavailableTimer = unavailableTimers.get(filePath);
      if (unavailableTimer) {
        clearTimeout(unavailableTimer);
        unavailableTimers.delete(filePath);
      }
      readMarkdownFile(filePath)
        .then(result => {
          lineCaches.delete(result.filePath);
          logMarkdownFile('detected content change', { filePath });
          contentChanged$.next({
            filePath: result.filePath,
            mtimeMs: result.mtimeMs,
          });
        })
        .catch(() => {
          lineCaches.delete(filePath);
          emitFileUnavailable(filePath, 'unreadable');
        });
    }, watcherDebounceMs)
  );
}

function emitFileUnavailable(
  filePath: string,
  reason: 'deleted' | 'unreadable'
) {
  const existingTimer = unavailableTimers.get(filePath);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  unavailableTimers.set(
    filePath,
    setTimeout(() => {
      unavailableTimers.delete(filePath);
      fs.stat(filePath)
        .then(stat => {
          if (stat.isFile()) {
            emitContentChanged(filePath);
            return;
          }
          fileUnavailable$.next({ filePath, reason });
        })
        .catch(() => {
          lineCaches.delete(filePath);
          fileUnavailable$.next({ filePath, reason });
        });
    }, unavailableDebounceMs)
  );
}

async function watchMarkdownFile(filePath: string) {
  const normalized = validateMarkdownFilePath(filePath);
  if (!normalized) {
    throw new Error('Expected an absolute Markdown file path');
  }

  if (watchers.has(normalized)) {
    return;
  }

  const watcher = chokidar.watch(normalized, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 50,
    },
  });

  watcher.on('change', () => {
    emitContentChanged(normalized);
  });
  watcher.on('add', () => {
    emitContentChanged(normalized);
  });
  watcher.on('unlink', () => {
    emitFileUnavailable(normalized, 'deleted');
  });
  watcher.on('error', () => {
    emitFileUnavailable(normalized, 'unreadable');
  });

  watchers.set(normalized, watcher);
  logMarkdownFile('watching markdown file', { filePath: normalized });
}

async function unwatchMarkdownFile(filePath: string) {
  const normalized = validateMarkdownFilePath(filePath);
  if (!normalized) {
    return;
  }

  const timer = watcherTimers.get(normalized);
  if (timer) {
    clearTimeout(timer);
    watcherTimers.delete(normalized);
  }
  const unavailableTimer = unavailableTimers.get(normalized);
  if (unavailableTimer) {
    clearTimeout(unavailableTimer);
    unavailableTimers.delete(normalized);
  }

  const watcher = watchers.get(normalized);
  if (!watcher) {
    return;
  }

  watchers.delete(normalized);
  lineCaches.delete(normalized);
  await watcher.close();
  logMarkdownFile('stopped watching markdown file', { filePath: normalized });
}

export const markdownFileHandlers = {
  read: async (_: Electron.IpcMainInvokeEvent, filePath: string) => {
    return readMarkdownFile(
      assertAuthorizedMarkdownFilePath(filePath, { allowOpenRequest: true })
    );
  },
  write: async (
    _: Electron.IpcMainInvokeEvent,
    filePath: string,
    content: string,
    expectedMtimeMs?: number
  ) => {
    return writeMarkdownFile(
      assertAuthorizedMarkdownFilePath(filePath),
      content,
      expectedMtimeMs
    );
  },
  watch: async (_: Electron.IpcMainInvokeEvent, filePath: string) => {
    await watchMarkdownFile(assertAuthorizedMarkdownFilePath(filePath));
  },
  unwatch: async (_: Electron.IpcMainInvokeEvent, filePath: string) => {
    await unwatchMarkdownFile(filePath);
  },
  getPendingOpenRequests: async () => {
    return getPendingMarkdownOpenRequests();
  },
  claimOpenRequest: async (
    _: Electron.IpcMainInvokeEvent,
    requestId: string
  ) => {
    return claimMarkdownOpenRequest(requestId);
  },
  completeOpenRequest: async (
    _: Electron.IpcMainInvokeEvent,
    binding: MarkdownFileBinding & { requestId: string }
  ) => {
    return completeMarkdownOpenRequest(binding);
  },
  updateBinding: async (
    _: Electron.IpcMainInvokeEvent,
    binding: MarkdownFileBinding
  ) => {
    return updateMarkdownFileBinding(binding);
  },
  failOpenRequest: async (
    _: Electron.IpcMainInvokeEvent,
    requestId: string,
    errorMessage?: string
  ) => {
    failMarkdownOpenRequest(requestId, errorMessage);
  },
  getBinding: async (_: Electron.IpcMainInvokeEvent, filePath: string) => {
    return getMarkdownFileBinding(filePath);
  },
  getBindingByDocId: async (_: Electron.IpcMainInvokeEvent, docId: string) => {
    return getMarkdownFileBindingByDocId(docId);
  },
  forgetBinding: async (_: Electron.IpcMainInvokeEvent, filePath: string) => {
    forgetMarkdownFileBinding(filePath);
  },
  getLineInfo: async (_: Electron.IpcMainInvokeEvent, filePath: string) => {
    return getMarkdownFileLineInfo(assertAuthorizedMarkdownFilePath(filePath));
  },
  readLines: async (
    _: Electron.IpcMainInvokeEvent,
    filePath: string,
    startLine: number,
    lineCount: number
  ) => {
    return readMarkdownFileLines(
      assertAuthorizedMarkdownFilePath(filePath),
      startLine,
      lineCount
    );
  },
  syncRendered: async (
    event: Electron.IpcMainInvokeEvent,
    payload: { filePath: string; docId: string; mtimeMs: number }
  ) => {
    logMarkdownFile('renderer applied content change', payload);
    try {
      event.sender.setBackgroundThrottling(false);
      event.sender.invalidate();
    } catch {
      // best-effort repaint hint for unfocused/fullscreen windows
    }
  },
};

export const markdownFileEvents = {
  onOpenRequest: (
    emit: (payload: { requestId: string; filePath: string }) => void
  ) => {
    const sub = openRequest$.subscribe(emit);
    return () => sub.unsubscribe();
  },
  onContentChanged: (emit: (payload: MarkdownFileChangeResult) => void) => {
    const sub = contentChanged$.subscribe(emit);
    return () => sub.unsubscribe();
  },
  onFileUnavailable: (
    emit: (payload: {
      filePath: string;
      reason: 'deleted' | 'unreadable';
    }) => void
  ) => {
    const sub = fileUnavailable$.subscribe(emit);
    return () => sub.unsubscribe();
  },
};

export function setupMarkdownFileOpen(app: App) {
  app.on('open-file', (event, filePath) => {
    if (!validateMarkdownFilePath(filePath)) {
      return;
    }

    event.preventDefault();
    logMarkdownFile('received open-file event', { filePath });
    emitMarkdownOpenRequest(filePath);
    app.whenReady().then(showMainWindowForMarkdownFile).catch(console.error);
  });

  app.on('second-instance', (_event, commandLine) => {
    const filePaths = getMarkdownFilePathsFromCommandLine(commandLine);
    logMarkdownFile('received second-instance event', {
      markdownFileCount: filePaths.length,
      argumentCount: commandLine.length,
    });
    if (filePaths.length === 0) {
      return;
    }

    showMainWindowForMarkdownFile()
      .then(() => {
        emitMarkdownOpenRequests(filePaths);
      })
      .catch(error => {
        console.error(
          'Failed to handle markdown file from second instance',
          error
        );
      });
  });

  app.on('ready', () => {
    const filePaths = getMarkdownFilePathsFromCommandLine(process.argv);
    logMarkdownFile('inspected ready argv', {
      markdownFileCount: filePaths.length,
      argumentCount: process.argv.length,
    });
    if (filePaths.length === 0) {
      return;
    }

    emitMarkdownOpenRequests(filePaths);
  });
}

export async function resetMarkdownFileStateForTesting() {
  openRequests.clear();
  filePathToRequestId.clear();
  bindings.clear();
  lineCaches.clear();

  for (const timer of watcherTimers.values()) {
    clearTimeout(timer);
  }
  watcherTimers.clear();
  for (const timer of unavailableTimers.values()) {
    clearTimeout(timer);
  }
  unavailableTimers.clear();

  await Promise.all(
    Array.from(watchers.values()).map(watcher => watcher.close())
  );
  watchers.clear();
}
