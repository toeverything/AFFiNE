import { realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { EventBasedChannel } from 'async-call-rpc';

export function getTime() {
  return Date.now();
}

export const isMacOS = () => {
  return process.platform === 'darwin';
};

export const isWindows = () => {
  return process.platform === 'win32';
};

export const isLinux = () => {
  return process.platform === 'linux';
};

interface MessagePortLike {
  postMessage: (data: unknown) => void;
  addListener: (event: 'message', listener: (...args: any[]) => void) => void;
  removeListener: (
    event: 'message',
    listener: (...args: any[]) => void
  ) => void;
}

export class MessageEventChannel implements EventBasedChannel {
  constructor(private readonly worker: MessagePortLike) {}

  on(listener: (data: unknown) => void) {
    const f = (data: unknown) => {
      listener(data);
    };
    this.worker.addListener('message', f);
    return () => {
      this.worker.removeListener('message', f);
    };
  }

  send(data: unknown) {
    this.worker.postMessage(data);
  }
}

export const resourcesPath = join(__dirname, `../resources`);

function normalizeComparedPath(path: string, caseInsensitive: boolean) {
  return caseInsensitive ? path.toLowerCase() : path;
}

export function isPathInsideBase(
  basePath: string,
  targetPath: string,
  options: { caseInsensitive?: boolean } = {}
) {
  const { caseInsensitive = false } = options;
  const normalizedBase = normalizeComparedPath(
    resolve(basePath),
    caseInsensitive
  );
  const normalizedTarget = normalizeComparedPath(
    resolve(targetPath),
    caseInsensitive
  );
  const rel = relative(normalizedBase, normalizedTarget);

  return (
    rel === '' ||
    (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
  );
}

export function resolvePathInBase(
  basePath: string,
  targetPath: string,
  options: { caseInsensitive?: boolean; label?: string } = {}
) {
  const resolvedBase = resolve(basePath);
  const resolvedTarget = resolve(resolvedBase, targetPath);

  if (!isPathInsideBase(resolvedBase, resolvedTarget, options)) {
    throw new Error(
      options.label ? `Invalid ${options.label}` : 'Invalid path'
    );
  }

  return resolvedTarget;
}

export async function resolveExistingPath(targetPath: string) {
  try {
    return await realpath(targetPath);
  } catch {
    return resolve(targetPath);
  }
}

export async function resolveExistingPathInBase(
  basePath: string,
  targetPath: string,
  options: { caseInsensitive?: boolean; label?: string } = {}
) {
  const [resolvedBase, resolvedTarget] = await Promise.all([
    resolveExistingPath(basePath),
    resolveExistingPath(targetPath),
  ]);

  if (!isPathInsideBase(resolvedBase, resolvedTarget, options)) {
    throw new Error(
      options.label ? `Invalid ${options.label}` : 'Invalid path'
    );
  }

  return resolvedTarget;
}

export function assertPathComponent(
  value: string,
  label: string = 'path component'
) {
  if (!value || value === '.' || value === '..' || /[/\\]/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value;
}

// credit: https://github.com/facebook/fbjs/blob/main/packages/fbjs/src/core/shallowEqual.js
export function shallowEqual<T>(objA: T, objB: T) {
  if (Object.is(objA, objB)) {
    return true;
  }

  if (
    typeof objA !== 'object' ||
    objA === null ||
    typeof objB !== 'object' ||
    objB === null
  ) {
    return false;
  }

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) {
    return false;
  }

  // Test for A's keys different from B.
  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(objB, key) ||
      !Object.is(objA[key as keyof T], objB[key as keyof T])
    ) {
      return false;
    }
  }

  return true;
}
