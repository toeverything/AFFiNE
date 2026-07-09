import { EventEmitter } from 'node:events';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const originalResourcesPath = process.resourcesPath;
const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(
  process,
  'platform'
);
const originalArchDescriptor = Object.getOwnPropertyDescriptor(process, 'arch');

const mockLocalAIPlatform = () => {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: 'darwin',
  });
  Object.defineProperty(process, 'arch', {
    configurable: true,
    value: 'arm64',
  });
};

const restoreLocalAIPlatform = () => {
  if (originalPlatformDescriptor) {
    Object.defineProperty(process, 'platform', originalPlatformDescriptor);
  }
  if (originalArchDescriptor) {
    Object.defineProperty(process, 'arch', originalArchDescriptor);
  }
};

const mockAppPath = path.join(path.sep, 'mock-app');
const mockUserDataPath = path.join(path.sep, 'mock-user-data');
const downloadedModelPath = path.join(
  mockUserDataPath,
  'local-ai',
  'models',
  'gemma-3-4b-it.gguf'
);
const bundledModelPath = path.join(
  mockAppPath,
  'resources',
  'local-ai',
  'models',
  'gemma-3-4b-it.gguf'
);
const downloadedModelsDir = path.dirname(downloadedModelPath);

const {
  accessMock,
  createServerMock,
  fetchMock,
  loggerWarnMock,
  mainRPCMock,
  mkdirMock,
  openMock,
  renameMock,
  rmMock,
  spawnMock,
  statMock,
} = vi.hoisted(() => ({
  accessMock: vi.fn(),
  createServerMock: vi.fn(),
  fetchMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  mainRPCMock: {
    getAppPath: vi.fn(async () => '/mock-app'),
    getPath: vi.fn(async () => '/mock-user-data'),
    isPackaged: vi.fn(async () => false),
  },
  mkdirMock: vi.fn(),
  openMock: vi.fn(),
  renameMock: vi.fn(),
  rmMock: vi.fn(),
  spawnMock: vi.fn(),
  statMock: vi.fn(),
}));

vi.mock('../../src/helper/main-rpc', () => ({
  mainRPC: mainRPCMock,
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('node:fs/promises', () => ({
  default: {
    access: accessMock,
    mkdir: mkdirMock,
    open: openMock,
    rename: renameMock,
    rm: rmMock,
    stat: statMock,
  },
}));

vi.mock('node:net', () => ({
  createServer: createServerMock,
}));

vi.mock('../../src/helper/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: loggerWarnMock,
  },
}));

class MockChildProcess extends EventEmitter {
  pid = 1234;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  stdout = {
    resume: vi.fn(),
  };
  stderr = new EventEmitter();
  kill = vi.fn(() => true);
}

const createGGUFHeader = (version = 3) => {
  const buffer = Buffer.alloc(8);
  buffer.write('GGUF', 0, 'ascii');
  buffer.writeUInt32LE(version, 4);
  return buffer;
};

const createMockFileHandle = (buffer = createGGUFHeader()) => ({
  read: vi.fn(async (target: Buffer, offset: number, length: number) => {
    buffer.copy(target, offset, 0, length);
    return { bytesRead: Math.min(length, buffer.length), buffer: target };
  }),
  write: vi.fn(async () => ({ bytesWritten: buffer.length, buffer })),
  sync: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
});

const createAvailablePortServer = () => {
  const server = new EventEmitter() as EventEmitter & {
    close: (cb?: (error?: Error) => void) => void;
    listen: (port: number, host: string) => void;
    unref: () => void;
  };

  server.unref = vi.fn();
  server.listen = vi.fn(() => {
    queueMicrotask(() => {
      server.emit('listening');
    });
  });
  server.close = vi.fn(cb => {
    cb?.();
  });

  return server;
};

const createInUsePortServer = () => {
  const server = new EventEmitter() as EventEmitter & {
    close: (cb?: (error?: Error) => void) => void;
    listen: (port: number, host: string) => void;
    unref: () => void;
  };

  server.unref = vi.fn();
  server.listen = vi.fn(() => {
    queueMicrotask(() => {
      server.emit(
        'error',
        Object.assign(new Error('in use'), { code: 'EADDRINUSE' })
      );
    });
  });
  server.close = vi.fn(cb => {
    cb?.();
  });

  return server;
};

const createEphemeralPortServer = (port: number) => {
  const server = new EventEmitter() as EventEmitter & {
    close: (cb?: (error?: Error) => void) => void;
    listen: (port: number, host: string) => void;
    unref: () => void;
    address: () => { port: number } | null;
  };

  server.unref = vi.fn();
  server.listen = vi.fn((_port: number, _host: string) => {
    queueMicrotask(() => {
      server.emit('listening');
    });
  });
  server.address = vi.fn(() => ({ port }));
  server.close = vi.fn(cb => {
    cb?.();
  });

  return server;
};

const trackedManagers: Array<{ dispose: () => Promise<void> }> = [];

async function loadManagerModule() {
  vi.resetModules();
  return await import('../../src/helper/local-ai/manager');
}

async function createManager() {
  const { LocalAIManager } = await loadManagerModule();
  const manager = new LocalAIManager();
  trackedManagers.push(manager);
  return manager;
}

describe('local AI manager lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockLocalAIPlatform();
    accessMock.mockReset();
    mainRPCMock.getAppPath.mockReset();
    mainRPCMock.getPath.mockReset();
    mainRPCMock.isPackaged.mockReset();
    createServerMock.mockReset();
    fetchMock.mockReset();
    loggerWarnMock.mockReset();
    mkdirMock.mockReset();
    openMock.mockReset();
    renameMock.mockReset();
    rmMock.mockReset();
    spawnMock.mockReset();
    statMock.mockReset();

    accessMock.mockResolvedValue(undefined);
    mainRPCMock.getAppPath.mockResolvedValue(mockAppPath);
    mainRPCMock.getPath.mockResolvedValue(mockUserDataPath);
    mainRPCMock.isPackaged.mockResolvedValue(false);
    mkdirMock.mockResolvedValue(undefined);
    openMock.mockResolvedValue(createMockFileHandle());
    renameMock.mockResolvedValue(undefined);
    rmMock.mockResolvedValue(undefined);
    statMock.mockResolvedValue({ size: 1024 * 1024 * 1024 });
    process.resourcesPath = '/mock-resources';
    createServerMock.mockImplementation(() => createAvailablePortServer());
    fetchMock.mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    await Promise.allSettled(
      trackedManagers.splice(0).map(manager => manager.dispose())
    );
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.resourcesPath = originalResourcesPath;
    restoreLocalAIPlatform();
    vi.resetModules();
  });

  test('returns resources_missing when runtime libraries are missing', async () => {
    accessMock.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('libllama-server-impl.dylib')) {
        throw new Error('missing dylib');
      }
    });

    const manager = await createManager();

    await expect(manager.ensureReady()).resolves.toMatchObject({
      state: 'unsupported',
      reason: 'resources_missing',
      detail: expect.stringContaining('libllama-server-impl.dylib'),
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test('reports a downloaded model as ready for download status checks', async () => {
    accessMock.mockImplementation(async (filePath: string) => {
      if (filePath === downloadedModelPath) {
        return;
      }
      throw new Error('missing');
    });

    const manager = await createManager();

    await expect(manager.getDownloadStatus()).resolves.toMatchObject({
      state: 'ready',
      source: 'downloaded',
      targetPath: downloadedModelPath,
    });
  });

  test('marks an invalid downloaded model as an error instead of ready', async () => {
    accessMock.mockImplementation(async (filePath: string) => {
      if (filePath === downloadedModelPath) {
        return;
      }
      throw new Error('missing');
    });
    openMock.mockResolvedValue(createMockFileHandle(Buffer.from('not-gguf')));
    statMock.mockResolvedValue({ size: 1024 });

    const manager = await createManager();

    await expect(manager.getDownloadStatus()).resolves.toMatchObject({
      state: 'error',
      detail: expect.stringContaining('downloaded model verification failed'),
      targetPath: downloadedModelPath,
    });
  });

  test('verifies the temp download before publishing the final model path', async () => {
    const tempPath = `${downloadedModelPath}.download`;
    const fileStore = new Map<string, Buffer>();
    const downloadedModel = Buffer.concat([
      createGGUFHeader(),
      Buffer.from('verified-model-payload'),
    ]);
    const verifiedTempReadMarker = vi.fn();

    accessMock.mockImplementation(async (filePath: string) => {
      if (fileStore.has(filePath)) {
        return;
      }
      throw new Error('missing');
    });
    mkdirMock.mockResolvedValue(undefined);
    rmMock.mockImplementation(async (filePath: string) => {
      fileStore.delete(filePath);
    });
    renameMock.mockImplementation(async (fromPath: string, toPath: string) => {
      const buffer = fileStore.get(fromPath);
      if (!buffer) {
        throw new Error(`missing file: ${fromPath}`);
      }
      fileStore.set(toPath, buffer);
      fileStore.delete(fromPath);
    });
    statMock.mockImplementation(async (filePath: string) => {
      const buffer = fileStore.get(filePath);
      if (!buffer) {
        throw new Error(`missing file: ${filePath}`);
      }
      return { size: buffer.length };
    });
    openMock.mockImplementation(async (filePath: string, flags: string) => {
      if (flags === 'w') {
        return {
          write: vi.fn(async (chunk: Uint8Array) => {
            const nextChunk = Buffer.from(chunk);
            const current = fileStore.get(filePath) ?? Buffer.alloc(0);
            const buffer = Buffer.concat([current, nextChunk]);
            fileStore.set(filePath, buffer);
            return { bytesWritten: nextChunk.length, buffer: nextChunk };
          }),
          sync: vi.fn(async () => {}),
          close: vi.fn(async () => {}),
        };
      }

      if (filePath === tempPath) {
        verifiedTempReadMarker();
      }

      return {
        read: vi.fn(async (target: Buffer, offset: number, length: number) => {
          const buffer = fileStore.get(filePath) ?? Buffer.alloc(0);
          buffer.copy(target, offset, 0, length);
          return { bytesRead: Math.min(length, buffer.length), buffer: target };
        }),
        close: vi.fn(async () => {}),
      };
    });
    fetchMock.mockResolvedValue({
      ok: true,
      headers: {
        get: (header: string) =>
          header === 'content-length' ? String(downloadedModel.length) : null,
      },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.from(downloadedModel));
          controller.close();
        },
      }),
    });

    const manager = await createManager();

    await expect(manager.startDownload()).resolves.toMatchObject({
      state: 'ready',
      targetPath: downloadedModelPath,
      downloadedBytes: downloadedModel.length,
    });

    expect(verifiedTempReadMarker).toHaveBeenCalledTimes(1);
    expect(renameMock).toHaveBeenCalledWith(tempPath, downloadedModelPath);
    expect(verifiedTempReadMarker.mock.invocationCallOrder[0]).toBeLessThan(
      renameMock.mock.invocationCallOrder[0]
    );
    expect(fileStore.get(downloadedModelPath)).toEqual(downloadedModel);
    expect(fileStore.has(tempPath)).toBe(false);
  });

  test('ignores bundled model when computing download status', async () => {
    accessMock.mockImplementation(async (filePath: string) => {
      if (filePath === bundledModelPath) {
        return;
      }
      throw new Error('missing');
    });

    const manager = await createManager();

    await expect(manager.getDownloadStatus()).resolves.toMatchObject({
      state: 'unavailable',
      reason: 'model_missing',
    });
  });

  test('does not start sidecar from bundled model path alone', async () => {
    accessMock.mockImplementation(async (filePath: string) => {
      if (filePath.startsWith(downloadedModelsDir)) {
        throw new Error('missing downloaded model');
      }
      return;
    });

    const manager = await createManager();

    await expect(manager.ensureReady()).resolves.toMatchObject({
      state: 'unsupported',
      detail: 'model missing',
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test('uses the next available port when the default local AI port is already occupied', async () => {
    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);
    createServerMock
      .mockImplementationOnce(() => createInUsePortServer())
      .mockImplementation(() => createAvailablePortServer());

    const manager = await createManager();

    await expect(manager.ensureReady()).resolves.toMatchObject({
      state: 'ready',
      port: 43112,
      endpoint: 'http://127.0.0.1:43112',
      modelSource: 'downloaded',
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['--port', '43112']),
      expect.any(Object)
    );
  });

  test('falls back to an ephemeral port when the reserved local AI port range is exhausted', async () => {
    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);
    createServerMock
      .mockImplementationOnce(() => createInUsePortServer())
      .mockImplementationOnce(() => createInUsePortServer())
      .mockImplementationOnce(() => createInUsePortServer())
      .mockImplementationOnce(() => createInUsePortServer())
      .mockImplementationOnce(() => createInUsePortServer())
      .mockImplementationOnce(() => createInUsePortServer())
      .mockImplementationOnce(() => createInUsePortServer())
      .mockImplementationOnce(() => createInUsePortServer())
      .mockImplementationOnce(() => createInUsePortServer())
      .mockImplementationOnce(() => createInUsePortServer())
      .mockImplementationOnce(() => createEphemeralPortServer(47001));

    const manager = await createManager();

    await expect(manager.ensureReady()).resolves.toMatchObject({
      state: 'ready',
      port: 47001,
      endpoint: 'http://127.0.0.1:47001',
      modelSource: 'downloaded',
    });
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['--port', '47001']),
      expect.any(Object)
    );
  });

  test('reads packaging metadata from main RPC instead of electron.app in helper process', async () => {
    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);
    mainRPCMock.isPackaged.mockResolvedValue(true);

    const manager = await createManager();

    await expect(manager.ensureReady()).resolves.toMatchObject({
      state: 'ready',
      endpoint: 'http://127.0.0.1:43111',
      modelSource: 'downloaded',
    });

    expect(mainRPCMock.isPackaged).toHaveBeenCalled();
    expect(mainRPCMock.getAppPath).not.toHaveBeenCalled();
  });

  test('reports startup exits with the terminating signal when the sidecar dies before ready', async () => {
    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);
    fetchMock.mockImplementation(
      () => new Promise(() => {}) as Promise<Response>
    );

    const manager = await createManager();
    const pending = manager.ensureReady();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (child.listenerCount('exit') >= 2) {
        break;
      }
      await Promise.resolve();
    }
    expect(child.listenerCount('exit')).toBeGreaterThanOrEqual(2);

    child.signalCode = 'SIGKILL';
    child.emit('exit', null, 'SIGKILL');

    await expect(pending).resolves.toMatchObject({
      state: 'error',
      reason: 'spawn_failed',
      detail: 'sidecar exited with signal SIGKILL',
    });
  });

  test('dispose prevents a queued crash recovery restart from spawning again', async () => {
    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);

    const manager = await createManager();

    await expect(manager.ensureReady()).resolves.toMatchObject({
      state: 'ready',
      modelSource: 'downloaded',
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);

    child.exitCode = 1;
    child.emit('exit', 1);

    expect(manager.getStatus()).toMatchObject({
      state: 'starting',
    });

    await manager.dispose();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});
