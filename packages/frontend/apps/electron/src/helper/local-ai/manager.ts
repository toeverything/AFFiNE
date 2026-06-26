import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

import { BehaviorSubject } from 'rxjs';

import { logger } from '../logger';
import { mainRPC } from '../main-rpc';
import { resolveLocalAIAssets } from './model-assets';
import { buildSidecarArgs } from './sidecar';
import {
  errorStatus,
  type LocalAIRuntimeStatus,
  readyStatus,
  startingStatus,
  unsupportedStatus,
} from './types';

const HEALTHCHECK_INTERVAL_MS = 500;
const HEALTHCHECK_PROBE_TIMEOUT_MS = 2_000;
const HEALTHCHECK_TIMEOUT_MS = 60_000;
const RECOVERY_RETRY_DELAY_MS = 1_000;
const RECOVERY_RETRY_LIMIT = 2;
const SIDECAR_HOST = '127.0.0.1';
const SIDECAR_PORT = 43111;
const SIDECAR_PORT_SCAN_LIMIT = 10;

const canAccess = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const isPortAvailable = async (port: number, host = SIDECAR_HOST) => {
  return await new Promise<boolean>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', error => {
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.once('listening', () => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve(true);
      });
    });
    server.listen(port, host);
  });
};

const reserveEphemeralPort = async (host = SIDECAR_HOST) => {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.once('listening', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => {
          reject(new Error('Failed to resolve ephemeral port'));
        });
        return;
      }

      const { port } = address;
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.listen(0, host);
  });
};

const sleep = async (ms: number) =>
  await new Promise(resolve => setTimeout(resolve, ms));

const findAvailablePort = async (
  startPort: number,
  host = SIDECAR_HOST,
  maxAttempts = SIDECAR_PORT_SCAN_LIMIT
) => {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = startPort + offset;
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }

  return await reserveEphemeralPort(host);
};

const waitForHealthy = async (
  endpoint: string,
  timeoutMs = HEALTHCHECK_TIMEOUT_MS
) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    const probeTimeoutMs = Math.min(HEALTHCHECK_PROBE_TIMEOUT_MS, remainingMs);

    try {
      const response = await fetch(`${endpoint}/health`, {
        signal: AbortSignal.timeout(probeTimeoutMs),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore transient startup errors until timeout.
    }

    if (Date.now() >= deadline) {
      break;
    }

    await sleep(Math.min(HEALTHCHECK_INTERVAL_MS, deadline - Date.now()));
  }

  throw new Error('Local AI health check timed out');
};

export class LocalAIManager {
  private child: ChildProcessWithoutNullStreams | null = null;

  private readonly status$ = new BehaviorSubject<LocalAIRuntimeStatus>(
    unsupportedStatus('not_packaged')
  );

  private bootPromise: Promise<LocalAIRuntimeStatus> | null = null;

  private restartAttempts = 0;

  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  private queuedRecoveryResolve:
    | ((status: LocalAIRuntimeStatus) => void)
    | null = null;

  private ignoreNextExit = false;

  subscribe(fn: (status: LocalAIRuntimeStatus) => void) {
    const sub = this.status$.subscribe(fn);
    return () => sub.unsubscribe();
  }

  getStatus() {
    return this.status$.value;
  }

  async ensureReady() {
    if (this.status$.value.state === 'ready') {
      return this.status$.value;
    }

    if (!this.bootPromise) {
      this.clearRestartTimer();
      this.bootPromise = this.runStart();
    }

    return await this.bootPromise;
  }

  async dispose() {
    this.cancelQueuedRecovery();

    if (!this.child) {
      return;
    }

    this.ignoreNextExit = this.child.kill();
    this.child = null;
  }

  private clearRestartTimer() {
    if (!this.restartTimer) {
      return;
    }

    clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private cancelQueuedRecovery() {
    this.clearRestartTimer();
    if (!this.queuedRecoveryResolve) {
      return;
    }

    const resolve = this.queuedRecoveryResolve;
    this.queuedRecoveryResolve = null;
    resolve(this.status$.value);
  }

  private runStart() {
    return this.start().finally(() => {
      this.bootPromise = null;
    });
  }

  private scheduleRecovery(code: number | null) {
    if (this.restartAttempts >= RECOVERY_RETRY_LIMIT) {
      this.status$.next(
        errorStatus(
          'crashed',
          `sidecar exited with ${code} after ${RECOVERY_RETRY_LIMIT} recovery attempts`
        )
      );
      return;
    }

    this.restartAttempts += 1;
    this.status$.next(startingStatus());
    this.cancelQueuedRecovery();

    const queuedRecovery = new Promise<LocalAIRuntimeStatus>(resolve => {
      this.queuedRecoveryResolve = resolve;
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        this.queuedRecoveryResolve = null;
        resolve(this.start());
      }, RECOVERY_RETRY_DELAY_MS * this.restartAttempts);
    }).finally(() => {
      if (this.bootPromise === queuedRecovery) {
        this.bootPromise = null;
      }
    });

    this.bootPromise = queuedRecovery;
  }

  private async start() {
    if (process.platform !== 'darwin') {
      const status = unsupportedStatus('not_macos');
      this.status$.next(status);
      return status;
    }

    if (process.arch !== 'arm64') {
      const status = unsupportedStatus('not_apple_silicon');
      this.status$.next(status);
      return status;
    }

    const isPackaged = await mainRPC.isPackaged();
    const resourcesRoot = isPackaged
      ? (process.resourcesPath ?? path.dirname(await mainRPC.getAppPath()))
      : path.join(await mainRPC.getAppPath(), 'resources');
    const { binaryPath, modelPath, dylibPaths, backendPluginPaths } =
      resolveLocalAIAssets(resourcesRoot);
    const [hasBinary, hasModel, dylibChecks, backendPluginChecks] =
      await Promise.all([
        canAccess(binaryPath),
        canAccess(modelPath),
        Promise.all(dylibPaths.map(filePath => canAccess(filePath))),
        Promise.all(backendPluginPaths.map(filePath => canAccess(filePath))),
      ]);
    const missingDylibs = dylibPaths.filter((_, index) => !dylibChecks[index]);
    const missingBackendPlugins = backendPluginPaths.filter(
      (_, index) => !backendPluginChecks[index]
    );

    if (
      !hasBinary ||
      !hasModel ||
      missingDylibs.length > 0 ||
      missingBackendPlugins.length > 0
    ) {
      const status = unsupportedStatus(
        'resources_missing',
        !hasBinary
          ? 'binary missing'
          : !hasModel
            ? 'model missing'
            : missingDylibs.length > 0
              ? `runtime libraries missing: ${missingDylibs
                  .map(filePath => path.basename(filePath))
                  .join(', ')}`
              : `backend plugins missing: ${missingBackendPlugins
                  .map(filePath => path.basename(filePath))
                  .join(', ')}`
      );
      this.status$.next(status);
      return status;
    }

    const port = await findAvailablePort(SIDECAR_PORT);
    const endpoint = `http://${SIDECAR_HOST}:${port}`;
    this.status$.next(startingStatus());

    const binaryDir = path.dirname(binaryPath);
    const libDir = path.join(resourcesRoot, 'local-ai', 'lib');
    const dyldLibraryPath = [libDir, binaryDir, process.env.DYLD_LIBRARY_PATH]
      .filter(Boolean)
      .join(':');

    const child = spawn(binaryPath, buildSidecarArgs({ modelPath, port }), {
      cwd: binaryDir,
      stdio: 'pipe',
      env: {
        ...process.env,
        DYLD_LIBRARY_PATH: dyldLibraryPath,
      },
    });
    this.child = child;

    let exited = false;
    child.on('exit', code => {
      exited = true;
      this.child = null;
      if (this.ignoreNextExit) {
        this.ignoreNextExit = false;
        return;
      }
      if (this.status$.value.state === 'ready') {
        this.scheduleRecovery(code);
      }
    });

    child.stdout.resume();
    child.stderr.on('data', chunk => {
      logger.warn('[local-ai]', String(chunk));
    });

    const childError = new Promise<never>((_, reject) => {
      child.once('error', error => {
        if (error instanceof Error) {
          error.name = 'LocalAISpawnError';
        }
        reject(error);
      });
    });

    const childExitBeforeReady = new Promise<never>((_, reject) => {
      child.once('exit', code => {
        if (this.status$.value.state === 'ready' || this.ignoreNextExit) {
          return;
        }
        const error = new Error(`sidecar exited with ${code}`);
        error.name = 'LocalAIStartupExit';
        reject(error);
      });
    });

    try {
      await Promise.race([
        waitForHealthy(endpoint),
        childError,
        childExitBeforeReady,
      ]);
      if (exited || this.child !== child) {
        const error = new Error(
          `sidecar exited with ${child.exitCode ?? child.signalCode ?? 'unknown'}`
        );
        error.name = 'LocalAIStartupExit';
        throw error;
      }
      this.restartAttempts = 0;
      const status = readyStatus({
        endpoint,
        port,
        pid: child.pid ?? -1,
      });
      this.status$.next(status);
      return status;
    } catch (error) {
      this.ignoreNextExit = child.kill();
      this.child = null;
      const message = error instanceof Error ? error.message : String(error);
      const reason =
        error instanceof Error &&
        (error.name === 'LocalAISpawnError' ||
          error.name === 'LocalAIStartupExit')
          ? 'spawn_failed'
          : 'healthcheck_failed';
      const status = errorStatus(reason, message);
      this.status$.next(status);
      return status;
    }
  }
}

export const localAIManager = new LocalAIManager();

process.once('exit', () => {
  localAIManager.dispose().catch(() => {});
});
