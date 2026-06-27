import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const originalResourcesPath = process.resourcesPath;

const {
  accessMock,
  createServerMock,
  fetchMock,
  loggerWarnMock,
  mainRPCMock,
  spawnMock,
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
  spawnMock: vi.fn(),
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

async function loadManagerModule() {
  vi.resetModules();
  return await import('../../src/helper/local-ai/manager');
}

describe('local AI manager lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    accessMock.mockReset();
    mainRPCMock.getAppPath.mockReset();
    mainRPCMock.getPath.mockReset();
    mainRPCMock.isPackaged.mockReset();
    createServerMock.mockReset();
    fetchMock.mockReset();
    loggerWarnMock.mockReset();
    spawnMock.mockReset();

    accessMock.mockResolvedValue(undefined);
    mainRPCMock.getAppPath.mockResolvedValue('/mock-app');
    mainRPCMock.getPath.mockResolvedValue('/mock-user-data');
    mainRPCMock.isPackaged.mockResolvedValue(false);
    process.resourcesPath = '/mock-resources';
    createServerMock.mockImplementation(() => createAvailablePortServer());
    fetchMock.mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.resourcesPath = originalResourcesPath;
    vi.resetModules();
  });

  test('returns resources_missing when runtime libraries are missing', async () => {
    accessMock.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('libllama-server-impl.dylib')) {
        throw new Error('missing dylib');
      }
    });

    const { LocalAIManager } = await loadManagerModule();
    const manager = new LocalAIManager();

    await expect(manager.ensureReady()).resolves.toMatchObject({
      state: 'unsupported',
      reason: 'resources_missing',
      detail: expect.stringContaining('libllama-server-impl.dylib'),
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  test('reports a downloaded model as ready for download status checks', async () => {
    accessMock.mockImplementation(async (filePath: string) => {
      if (filePath === '/mock-user-data/local-ai/models/gemma-3-4b-it.gguf') {
        return;
      }
      throw new Error('missing');
    });

    const { LocalAIManager } = await loadManagerModule();
    const manager = new LocalAIManager();

    await expect(manager.getDownloadStatus()).resolves.toMatchObject({
      state: 'ready',
      source: 'downloaded',
      targetPath: '/mock-user-data/local-ai/models/gemma-3-4b-it.gguf',
    });
  });

  test('ignores bundled model when computing download status', async () => {
    accessMock.mockImplementation(async (filePath: string) => {
      if (
        filePath === '/mock-app/resources/local-ai/models/gemma-3-4b-it.gguf'
      ) {
        return;
      }
      throw new Error('missing');
    });

    const { LocalAIManager } = await loadManagerModule();
    const manager = new LocalAIManager();

    await expect(manager.getDownloadStatus()).resolves.toMatchObject({
      state: 'unavailable',
      reason: 'model_missing',
    });
  });

  test('does not start sidecar from bundled model path alone', async () => {
    accessMock.mockImplementation(async (filePath: string) => {
      if (filePath.includes('/mock-user-data/local-ai/models/')) {
        throw new Error('missing downloaded model');
      }
      return;
    });

    const { LocalAIManager } = await loadManagerModule();
    const manager = new LocalAIManager();

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

    const { LocalAIManager } = await loadManagerModule();
    const manager = new LocalAIManager();

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

    const { LocalAIManager } = await loadManagerModule();
    const manager = new LocalAIManager();

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

    const { LocalAIManager } = await loadManagerModule();
    const manager = new LocalAIManager();

    await expect(manager.ensureReady()).resolves.toMatchObject({
      state: 'ready',
      endpoint: 'http://127.0.0.1:43111',
      modelSource: 'downloaded',
    });

    expect(mainRPCMock.isPackaged).toHaveBeenCalled();
    expect(mainRPCMock.getAppPath).not.toHaveBeenCalled();
  });

  test('dispose prevents a queued crash recovery restart from spawning again', async () => {
    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);

    const { LocalAIManager } = await loadManagerModule();
    const manager = new LocalAIManager();

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
