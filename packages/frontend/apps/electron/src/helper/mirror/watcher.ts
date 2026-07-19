import { type FSWatcher, watch as watchFilesystem } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { nanoid } from 'nanoid';

import { inspectTarget } from './mirror';

const QUIET_WINDOW_MS = 750;

type MirrorChangedListener = (event: {
  watcherId: string;
  workspaceId: string;
}) => void;

type MirrorWatcher = {
  key: string;
  workspaceId: string;
  handles: Set<FSWatcher>;
  timer: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
};

const watchers = new Map<string, MirrorWatcher>();
const listeners = new Set<MirrorChangedListener>();

function emitChanged(watcher: MirrorWatcher) {
  if (watcher.stopped) return;
  for (const listener of listeners) {
    listener({ watcherId: watcher.key, workspaceId: watcher.workspaceId });
  }
}

function scheduleChanged(watcher: MirrorWatcher, immediate = false) {
  if (watcher.stopped) return;
  if (watcher.timer) clearTimeout(watcher.timer);
  watcher.timer = setTimeout(
    () => {
      watcher.timer = null;
      emitChanged(watcher);
    },
    immediate ? 0 : QUIET_WINDOW_MS
  );
}

async function watchDirectory(watcher: MirrorWatcher, path: string) {
  try {
    const stat = await lstat(path);
    if (!stat.isDirectory()) return;
  } catch {
    return;
  }
  if (watcher.stopped) return;
  const handle = watchFilesystem(path, () => {
    // Event paths are deliberately ignored. Editors commonly write by rename,
    // and platform watcher events may be coalesced or omitted.
    scheduleChanged(watcher);
  });
  handle.on('error', () => scheduleChanged(watcher));
  watcher.handles.add(handle);
}

export async function startMirrorWatcher(input: {
  projectRoot: string;
  workspaceId: string;
}) {
  const inspection = await inspectTarget(input);
  if (inspection.state !== 'owned' || !inspection.manifest) {
    throw new Error('Mirror target is not owned by this workspace');
  }
  const key = nanoid();
  const watcher: MirrorWatcher = {
    key,
    workspaceId: input.workspaceId,
    handles: new Set(),
    timer: null,
    stopped: false,
  };
  watchers.set(key, watcher);
  const directories = new Set([inspection.mirrorPath]);
  for (const path of Object.keys(inspection.manifest.files)) {
    directories.add(resolve(inspection.mirrorPath, path, '..'));
  }
  for (const directory of directories) await watchDirectory(watcher, directory);
  // A start is also a rescan hint, covering missed events and app restarts.
  scheduleChanged(watcher, true);
  return { watcherId: key } as const;
}

export function stopMirrorWatcher(input: { watcherId: string }) {
  const watcher = watchers.get(input.watcherId);
  if (!watcher) return;
  watcher.stopped = true;
  if (watcher.timer) clearTimeout(watcher.timer);
  watcher.timer = null;
  for (const handle of watcher.handles) handle.close();
  watcher.handles.clear();
  watchers.delete(input.watcherId);
}

export function stopAllMirrorWatchers() {
  for (const watcher of watchers.values()) {
    stopMirrorWatcher({ watcherId: watcher.key });
  }
}

export const mirrorEvents = {
  changed(listener: MirrorChangedListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
