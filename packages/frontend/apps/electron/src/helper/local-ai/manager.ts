import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createServer } from 'node:net';
import path from 'node:path';

import { BehaviorSubject } from 'rxjs';

import { logger } from '../logger';
import { mainRPC } from '../main-rpc';
import {
  getDevLocalAIModelPath,
  LOCAL_AI_MODEL_DOWNLOAD_URL,
  LOCAL_AI_MODEL_DOWNLOAD_URLS,
  resolveLocalAIAssets,
} from './model-assets';
import { buildSidecarArgs } from './sidecar';
import {
  downloadErrorStatus,
  downloadingStatus,
  downloadReadyStatus,
  downloadUnavailableStatus,
  errorStatus,
  type LocalAIModelDownloadStatus,
  type LocalAIModelSource,
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
const DOWNLOAD_PROGRESS_UPDATE_INTERVAL_MS = 250;
const DOWNLOAD_REQUEST_TIMEOUT_MS = 30_000;
const DOWNLOAD_REDIRECT_LIMIT = 10;

const canAccess = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const LOCAL_AI_DOWNLOAD_HEADERS = {
  Accept: '*/*',
  'Accept-Encoding': 'identity',
  'User-Agent': `AFFiNE/${typeof BUILD_CONFIG !== 'undefined' ? BUILD_CONFIG.appVersion : 'desktop'} LocalAI`,
};

const getErrorMessage = (error: unknown) => {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause =
    error.cause instanceof Error
      ? error.cause.message
      : typeof error.cause === 'string'
        ? error.cause
        : null;

  return cause && cause !== error.message
    ? `${error.message}: ${cause}`
    : error.message;
};

async function* readWebStreamChunks(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }

      if (value?.length) {
        yield value;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

type ModelDownloadResponse = {
  ok: boolean;
  status: number;
  totalBytes: number | null;
  body: AsyncIterable<Uint8Array>;
};

const emptyBody = {
  async *[Symbol.asyncIterator]() {
    // no-op
  },
} satisfies AsyncIterable<Uint8Array>;

const openModelDownloadResponse = async (
  url: string,
  redirectCount = 0
): Promise<ModelDownloadResponse> => {
  if (redirectCount > DOWNLOAD_REDIRECT_LIMIT) {
    throw new Error('model download redirected too many times');
  }

  const target = new URL(url);
  const request = target.protocol === 'http:' ? httpRequest : httpsRequest;

  return await new Promise<ModelDownloadResponse>((resolve, reject) => {
    const req = request(
      target,
      {
        headers: LOCAL_AI_DOWNLOAD_HEADERS,
      },
      response => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;

        if (location && [301, 302, 303, 307, 308].includes(status)) {
          response.resume();
          void openModelDownloadResponse(
            new URL(location, target).toString(),
            redirectCount + 1
          )
            .then(resolve)
            .catch(reject);
          return;
        }

        const totalBytes = Number(response.headers['content-length']) || null;

        if (status < 200 || status >= 300) {
          response.resume();
          resolve({
            ok: false,
            status,
            totalBytes,
            body: emptyBody,
          });
          return;
        }

        resolve({
          ok: true,
          status,
          totalBytes,
          body: response,
        });
      }
    );

    req.setTimeout(DOWNLOAD_REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error('model download request timed out'));
    });
    req.on('error', reject);
    req.end();
  });
};

const fetchModelDownloadResponse = async (downloadUrl: string) => {
  try {
    const response = await fetch(downloadUrl, {
      headers: LOCAL_AI_DOWNLOAD_HEADERS,
      redirect: 'follow',
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        totalBytes: Number(response.headers.get('content-length')) || null,
        body: emptyBody,
      } satisfies ModelDownloadResponse;
    }

    if (!response.body) {
      throw new Error('model download returned an empty response body');
    }

    return {
      ok: true,
      status: response.status,
      totalBytes: Number(response.headers.get('content-length')) || null,
      body: readWebStreamChunks(response.body),
    } satisfies ModelDownloadResponse;
  } catch (error) {
    logger.warn(
      '[local-ai] fetch download failed, retrying with node request',
      getErrorMessage(error)
    );
    return await openModelDownloadResponse(downloadUrl);
  }
};

type CurlDownloadResult = {
  downloadedBytes: number;
  totalBytes: number | null;
};

const downloadModelWithCurl = async (
  downloadUrl: string,
  tempPath: string,
  onProgress: (downloadedBytes: number, totalBytes: number | null) => void
): Promise<CurlDownloadResult> => {
  return await new Promise<CurlDownloadResult>((resolve, reject) => {
    const args = [
      '--location',
      '--fail',
      '--output',
      tempPath,
      '--dump-header',
      '-',
      '--user-agent',
      LOCAL_AI_DOWNLOAD_HEADERS['User-Agent'],
      '--connect-timeout',
      '30',
      '--retry',
      '2',
      '--retry-delay',
      '1',
      '--write-out',
      '\nAFFINE_CURL_STATUS:%{http_code}\nAFFINE_CURL_SIZE:%{size_download}\n',
      downloadUrl,
    ];

    const child = spawn('curl', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let totalBytes: number | null = null;
    let polling = false;
    const pollTimer = setInterval(() => {
      if (polling) {
        return;
      }

      polling = true;
      void fs
        .stat(tempPath)
        .then(stat => {
          onProgress(stat.size, totalBytes);
        })
        .catch(() => {})
        .finally(() => {
          polling = false;
        });
    }, DOWNLOAD_PROGRESS_UPDATE_INTERVAL_MS);

    const stopPolling = () => {
      clearInterval(pollTimer);
    };

    child.stdout.on('data', chunk => {
      stdout += String(chunk);
      const contentLengthMatches = stdout.match(/content-length:\s*(\d+)/gi);
      const lastMatch = contentLengthMatches?.at(-1)?.match(/(\d+)/);
      if (lastMatch) {
        totalBytes = Number(lastMatch[1]) || totalBytes;
      }
    });

    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });

    child.once('error', error => {
      stopPolling();
      reject(error);
    });

    child.once('exit', code => {
      stopPolling();

      const statusMatch = stdout.match(/AFFINE_CURL_STATUS:(\d+)/);
      const sizeMatch = stdout.match(/AFFINE_CURL_SIZE:(\d+(?:\.\d+)?)/);
      const status = Number(statusMatch?.[1] ?? 0);
      const downloadedBytes = sizeMatch ? Math.round(Number(sizeMatch[1])) : 0;

      if (code !== 0) {
        reject(new Error(stderr.trim() || `curl exited with ${code}`));
        return;
      }

      if (status < 200 || status >= 300) {
        reject(new Error(`model download failed with status ${status}`));
        return;
      }

      resolve({
        downloadedBytes,
        totalBytes,
      });
    });
  });
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

type LocalAIPaths = Awaited<ReturnType<LocalAIManager['resolvePaths']>>;
type LocalAIResolvedResources = LocalAIPaths & {
  hasBinary: boolean;
  modelPath: string | null;
  modelSource: LocalAIModelSource | null;
  missingDylibs: string[];
  missingBackendPlugins: string[];
};

export class LocalAIManager {
  private child: ChildProcessWithoutNullStreams | null = null;

  private readonly status$ = new BehaviorSubject<LocalAIRuntimeStatus>(
    unsupportedStatus('not_packaged')
  );

  private readonly downloadStatus$ =
    new BehaviorSubject<LocalAIModelDownloadStatus>(
      downloadUnavailableStatus({
        reason: 'initializing',
        downloadUrl: LOCAL_AI_MODEL_DOWNLOAD_URL,
        targetPath: '',
      })
    );

  private bootPromise: Promise<LocalAIRuntimeStatus> | null = null;

  private downloadPromise: Promise<LocalAIModelDownloadStatus> | null = null;

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

  subscribeDownload(fn: (status: LocalAIModelDownloadStatus) => void) {
    const sub = this.downloadStatus$.subscribe(fn);
    return () => sub.unsubscribe();
  }

  getStatus() {
    return this.status$.value;
  }

  async getDownloadStatus() {
    return await this.syncDownloadStatus();
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

  async startDownload() {
    const status = await this.syncDownloadStatus();
    if (status.state === 'ready') {
      return status;
    }

    if (status.state === 'unavailable' && !status.canDownload) {
      return status;
    }

    if (!this.downloadPromise) {
      this.downloadPromise = this.downloadModel().finally(() => {
        this.downloadPromise = null;
      });
    }

    return await this.downloadPromise;
  }

  async dispose() {
    this.cancelQueuedRecovery();

    if (!this.child) {
      return;
    }

    this.ignoreNextExit = this.child.kill();
    this.child = null;
  }

  private async resolvePaths() {
    const isPackaged = await mainRPC.isPackaged();
    const resourcesRoot = isPackaged
      ? (process.resourcesPath ?? path.dirname(await mainRPC.getAppPath()))
      : path.join(await mainRPC.getAppPath(), 'resources');
    const userDataPath = await mainRPC.getPath('userData');

    return {
      resourcesRoot,
      userDataPath,
      ...resolveLocalAIAssets(resourcesRoot, userDataPath),
    };
  }

  private async resolveRuntimeResources(): Promise<LocalAIResolvedResources> {
    const paths = await this.resolvePaths();
    const { binaryPath, downloadedModelPath, dylibPaths, backendPluginPaths } =
      paths;
    const devModelPath = getDevLocalAIModelPath();

    const [
      hasBinary,
      hasDownloadedModel,
      hasDevModel,
      dylibChecks,
      backendPluginChecks,
    ] = await Promise.all([
      canAccess(binaryPath),
      canAccess(downloadedModelPath),
      devModelPath ? canAccess(devModelPath) : Promise.resolve(false),
      Promise.all(dylibPaths.map(filePath => canAccess(filePath))),
      Promise.all(backendPluginPaths.map(filePath => canAccess(filePath))),
    ]);

    const missingDylibs = dylibPaths.filter((_, index) => !dylibChecks[index]);
    const missingBackendPlugins = backendPluginPaths.filter(
      (_, index) => !backendPluginChecks[index]
    );

    const modelPath = hasDownloadedModel
      ? downloadedModelPath
      : hasDevModel && devModelPath
        ? devModelPath
        : null;
    const modelSource = hasDownloadedModel
      ? 'downloaded'
      : hasDevModel
        ? 'bundled'
        : null;

    return {
      ...paths,
      hasBinary,
      modelPath,
      modelSource,
      missingDylibs,
      missingBackendPlugins,
    };
  }

  private async syncDownloadStatus() {
    const current = this.downloadStatus$.value;
    if (current.state === 'downloading') {
      return current;
    }

    const nextStatus = await this.computeDownloadStatus();
    this.downloadStatus$.next(nextStatus);
    return nextStatus;
  }

  private async computeDownloadStatus(): Promise<LocalAIModelDownloadStatus> {
    const current = this.downloadStatus$.value;

    if (process.platform !== 'darwin') {
      return downloadUnavailableStatus({
        reason: 'not_macos',
        downloadUrl: LOCAL_AI_MODEL_DOWNLOAD_URL,
        targetPath: '',
      });
    }

    if (process.arch !== 'arm64') {
      return downloadUnavailableStatus({
        reason: 'not_apple_silicon',
        downloadUrl: LOCAL_AI_MODEL_DOWNLOAD_URL,
        targetPath: '',
      });
    }

    const { downloadedModelPath } = await this.resolvePaths();
    const hasDownloadedModel = await canAccess(downloadedModelPath);

    if (hasDownloadedModel) {
      return downloadReadyStatus({
        downloadUrl: LOCAL_AI_MODEL_DOWNLOAD_URL,
        targetPath: downloadedModelPath,
        source: 'downloaded',
      });
    }

    if (current.state === 'error') {
      return {
        ...current,
        downloadUrl: LOCAL_AI_MODEL_DOWNLOAD_URL,
        targetPath: downloadedModelPath,
      };
    }

    return downloadUnavailableStatus({
      reason: 'model_missing',
      downloadUrl: LOCAL_AI_MODEL_DOWNLOAD_URL,
      targetPath: downloadedModelPath,
    });
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

  private async downloadModel() {
    const initialStatus = await this.syncDownloadStatus();
    if (initialStatus.state === 'ready') {
      return initialStatus;
    }

    if (initialStatus.state === 'unavailable' && !initialStatus.canDownload) {
      return initialStatus;
    }

    const { downloadedModelPath, modelDirectory } = await this.resolvePaths();
    const tempPath = `${downloadedModelPath}.download`;

    await fs.mkdir(modelDirectory, { recursive: true });
    await fs.rm(tempPath, { force: true }).catch(() => {});

    let downloadedBytes = 0;
    let totalBytes: number | null = null;
    let progress = 0;
    let fileHandle: Awaited<ReturnType<typeof fs.open>> | null = null;
    let activeDownloadUrl = LOCAL_AI_MODEL_DOWNLOAD_URL;
    const attemptErrors: string[] = [];

    this.downloadStatus$.next(
      downloadingStatus({
        downloadUrl: activeDownloadUrl,
        targetPath: downloadedModelPath,
        progress,
        downloadedBytes,
        totalBytes,
      })
    );

    const emitProgress = () => {
      this.downloadStatus$.next(
        downloadingStatus({
          downloadUrl: activeDownloadUrl,
          targetPath: downloadedModelPath,
          progress,
          downloadedBytes,
          totalBytes,
        })
      );
    };

    try {
      for (const downloadUrl of LOCAL_AI_MODEL_DOWNLOAD_URLS) {
        activeDownloadUrl = downloadUrl;
        downloadedBytes = 0;
        totalBytes = null;
        progress = 0;
        emitProgress();

        try {
          try {
            const response = await fetchModelDownloadResponse(downloadUrl);

            if (!response.ok) {
              throw new Error(
                `model download failed with status ${response.status}`
              );
            }

            totalBytes = response.totalBytes;
            fileHandle = await fs.open(tempPath, 'w');
            let lastProgressEmitAt = 0;

            for await (const chunk of response.body) {
              if (!chunk?.length) {
                continue;
              }

              await fileHandle.write(chunk);
              downloadedBytes += chunk.byteLength;
              progress = totalBytes
                ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100))
                : progress;

              const now = Date.now();
              if (
                now - lastProgressEmitAt >=
                DOWNLOAD_PROGRESS_UPDATE_INTERVAL_MS
              ) {
                lastProgressEmitAt = now;
                emitProgress();
              }
            }

            await fileHandle.sync();
            await fileHandle.close();
            fileHandle = null;
          } catch (primaryDownloadError) {
            logger.warn(
              '[local-ai] stream download failed, retrying with curl',
              getErrorMessage(primaryDownloadError)
            );

            if (fileHandle) {
              await fileHandle.close().catch(() => {});
              fileHandle = null;
            }
            await fs.rm(tempPath, { force: true }).catch(() => {});

            downloadedBytes = 0;
            totalBytes = null;
            progress = 0;
            emitProgress();

            const curlResult = await downloadModelWithCurl(
              downloadUrl,
              tempPath,
              (nextDownloadedBytes, nextTotalBytes) => {
                downloadedBytes = nextDownloadedBytes;
                totalBytes = nextTotalBytes;
                progress = totalBytes
                  ? Math.min(
                      99,
                      Math.round((downloadedBytes / totalBytes) * 100)
                    )
                  : downloadedBytes > 0
                    ? Math.max(progress, 1)
                    : progress;
                emitProgress();
              }
            );

            downloadedBytes = curlResult.downloadedBytes;
            totalBytes = curlResult.totalBytes;
            progress = 100;
          }

          await fs.rm(downloadedModelPath, { force: true }).catch(() => {});
          await fs.rename(tempPath, downloadedModelPath);

          const readyDownloadStatus = downloadReadyStatus({
            downloadUrl: activeDownloadUrl,
            targetPath: downloadedModelPath,
            source: 'downloaded',
            downloadedBytes,
            totalBytes,
          });
          this.downloadStatus$.next(readyDownloadStatus);

          void this.ensureReady().catch(() => {});

          return readyDownloadStatus;
        } catch (attemptError) {
          await fs.rm(tempPath, { force: true }).catch(() => {});
          attemptErrors.push(
            `${downloadUrl}: ${getErrorMessage(attemptError)}`
          );
        }
      }

      throw new Error(attemptErrors.join(' | '));
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => {});

      const message = getErrorMessage(error);
      const failureStatus = downloadErrorStatus({
        downloadUrl: activeDownloadUrl,
        targetPath: downloadedModelPath,
        detail: message,
        progress,
        downloadedBytes,
        totalBytes,
      });
      this.downloadStatus$.next(failureStatus);
      return failureStatus;
    }
  }

  private async start() {
    if (process.platform !== 'darwin') {
      const status = unsupportedStatus('not_macos');
      this.status$.next(status);
      void this.syncDownloadStatus().catch(() => {});
      return status;
    }

    if (process.arch !== 'arm64') {
      const status = unsupportedStatus('not_apple_silicon');
      this.status$.next(status);
      void this.syncDownloadStatus().catch(() => {});
      return status;
    }

    const {
      binaryPath,
      modelPath,
      modelSource,
      missingDylibs,
      missingBackendPlugins,
      hasBinary,
      resourcesRoot,
    } = await this.resolveRuntimeResources();

    if (
      !hasBinary ||
      !modelPath ||
      !modelSource ||
      missingDylibs.length > 0 ||
      missingBackendPlugins.length > 0
    ) {
      const status = unsupportedStatus(
        'resources_missing',
        !hasBinary
          ? 'binary missing'
          : !modelPath
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
      void this.syncDownloadStatus().catch(() => {});
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
        modelSource,
      });
      this.status$.next(status);
      void this.syncDownloadStatus().catch(() => {});
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
      void this.syncDownloadStatus().catch(() => {});
      return status;
    }
  }
}

export const localAIManager = new LocalAIManager();

process.once('exit', () => {
  localAIManager.dispose().catch(() => {});
});
