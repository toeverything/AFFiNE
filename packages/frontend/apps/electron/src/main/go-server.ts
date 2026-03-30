import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, chmod, copyFile, mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

import { app } from 'electron';
import type { Subscription } from 'rxjs';

import { beforeAppQuit } from './cleanup';
import { logger } from './logger';
import { globalStateStorage } from './shared-storage/storage';

type RuntimeConfig = {
  provider: string;
  modelName: string;
  apiKey: string;
  baseUrl: string;
};

const SERVER_PORT = 1570;
const PROVIDER_BASE_URLS: Record<string, string> = {
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  deepseek: 'https://api.deepseek.com',
  kimi: 'https://api.moonshot.cn/v1',
  glm: 'https://open.bigmodel.cn/api/paas/v4',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  hzb: 'https://ark.hzb.com/api/v3',
};

const resolveGoServerBinaryName = (
  targetPlatform: NodeJS.Platform,
  targetArch: NodeJS.Architecture
) => {
  if (targetPlatform === 'darwin' && targetArch === 'arm64') {
    return 'friday-darwin-arm64';
  }
  if (targetPlatform === 'linux' && targetArch === 'x64') {
    return 'friday-linux-amd64';
  }
  if (targetPlatform === 'linux' && targetArch === 'arm64') {
    return 'friday-linux-arm64';
  }
  if (targetPlatform === 'linux' && targetArch === 'ia32') {
    return 'friday-linux-386';
  }
  if (targetPlatform === 'win32' && targetArch === 'x64') {
    return 'friday-windows-amd64.exe';
  }
  return null;
};

const parseJsonString = (raw?: string) => {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed.trim() : '';
  } catch {
    return raw.trim();
  }
};

const normalizeProvider = (rawProvider: string) => {
  return rawProvider.trim().toLowerCase();
};

const normalizeBaseUrl = (rawBaseUrl: string) => {
  let value = rawBaseUrl.trim();
  value = value.replace(/^['"`]+/, '').replace(/['"`]+$/, '');
  value = value.replace(/,+$/, '');
  return value.trim();
};

const killProcessesOnPort = async (port: number) => {
  if (process.platform === 'win32') {
    const output = spawnSync('netstat', ['-ano', '-p', 'tcp'], {
      encoding: 'utf-8',
    });
    const text = output.stdout ?? '';
    const pids = new Set<string>();
    for (const line of text.split('\n')) {
      if (!line.includes(`:${port}`)) continue;
      if (!/LISTENING/i.test(line)) continue;
      const match = line.trim().match(/(\d+)\s*$/);
      if (match?.[1]) {
        pids.add(match[1]);
      }
    }
    for (const pid of pids) {
      if (pid === String(process.pid)) continue;
      spawnSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' });
    }
    return;
  }

  const output = spawnSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf-8' });
  if (output.status !== 0) {
    return;
  }
  const pids = output.stdout
    .split(/\s+/)
    .map(it => it.trim())
    .filter(Boolean);
  for (const pid of pids) {
    if (pid === String(process.pid)) continue;
    spawnSync('kill', ['-9', pid], { stdio: 'ignore' });
  }
};

const resolveBundledServerSourcePath = async (binaryName: string) => {
  const archiveName = `${binaryName}.gz`;
  const candidates = [
    path.join(process.resourcesPath, archiveName),
    path.join(process.resourcesPath, 'go-server', archiveName),
    path.join(process.resourcesPath, binaryName),
    path.join(process.resourcesPath, 'go-server', binaryName),
    path.join(
      __dirname,
      '../resources/go-server',
      archiveName
    ),
    path.join(
      __dirname,
      '../resources/go-server',
      binaryName
    ),
    path.join(
      process.cwd(),
      'packages/frontend/apps/electron/resources/go-server',
      archiveName
    ),
    path.join(
      process.cwd(),
      'packages/frontend/apps/electron/resources/go-server',
      binaryName
    ),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }

  return null;
};

const ensureLocalGoServerBinary = async (binaryName: string) => {
  const sourcePath = await resolveBundledServerSourcePath(binaryName);
  if (!sourcePath) {
    logger.warn('go-server resource not found', { binaryName });
    return null;
  }

  const targetDir = path.join(
    app.getPath('userData'),
    'go-server'
  );
  const targetPath = path.join(targetDir, binaryName);
  await mkdir(targetDir, { recursive: true });

  let shouldCopy = true;
  try {
    const [sourceStat, targetStat] = await Promise.all([
      stat(sourcePath),
      stat(targetPath),
    ]);
    if (sourcePath.endsWith('.gz')) {
      shouldCopy = sourceStat.mtimeMs > targetStat.mtimeMs;
    } else {
      shouldCopy =
        sourceStat.size !== targetStat.size || sourceStat.mtimeMs > targetStat.mtimeMs;
    }
  } catch {
    shouldCopy = true;
  }

  if (shouldCopy) {
    const tempTargetPath = `${targetPath}.tmp`;
    if (sourcePath.endsWith('.gz')) {
      await pipeline(
        createReadStream(sourcePath),
        createGunzip(),
        createWriteStream(tempTargetPath)
      );
    } else {
      await copyFile(sourcePath, tempTargetPath);
    }
    await chmod(tempTargetPath, 0o755);
    await rename(tempTargetPath, targetPath);
  } else {
    await chmod(targetPath, 0o755);
  }

  return targetPath;
};

class GoServerManager {
  private child: ChildProcess | null = null;
  private binaryPath: string | null = null;
  private runtimeDir: string | null = null;
  private lastFingerprint: string | null = null;
  private applyTimer: NodeJS.Timeout | null = null;
  private subscription: Subscription | null = null;
  private disposed = false;

  async setup() {
    const binaryName = resolveGoServerBinaryName(process.platform, process.arch);
    if (!binaryName) {
      logger.warn('go-server is not supported on current platform', {
        platform: process.platform,
        arch: process.arch,
      });
      return;
    }
    this.binaryPath = await ensureLocalGoServerBinary(binaryName);
    if (!this.binaryPath) return;
    this.runtimeDir = path.join(app.getPath('userData'), 'go-server', 'runtime');
    await mkdir(this.runtimeDir, { recursive: true });

    const initial = globalStateStorage.get<Record<string, string>>('editor-setting');
    this.scheduleApply(initial ?? {});

    this.subscription = globalStateStorage
      .watch<Record<string, string>>('editor-setting')
      .subscribe(settings => {
        this.scheduleApply(settings ?? {});
      });

    beforeAppQuit(() => {
      this.dispose();
    });
  }

  private scheduleApply(settings: Record<string, string>) {
    if (this.disposed) return;
    if (this.applyTimer) {
      clearTimeout(this.applyTimer);
    }
    this.applyTimer = setTimeout(() => {
      this.apply(settings).catch(error => {
        logger.error('failed to apply go-server config', error);
      });
    }, 400);
  }

  private parseRuntimeConfig(settings: Record<string, string>): RuntimeConfig | null {
    const provider = normalizeProvider(parseJsonString(settings.aiModelProvider));
    const modelName = parseJsonString(settings.aiModelName);
    const apiKey = parseJsonString(settings.aiModelKey);

    if (!modelName || !apiKey) {
      logger.info('go-server skipped due to incomplete ai settings', {
        hasModelName: Boolean(modelName),
        hasApiKey: Boolean(apiKey),
      });
      return null;
    }

    const baseUrl = PROVIDER_BASE_URLS[provider];
    if (!baseUrl) {
      logger.warn('unsupported ai model provider for go-server', { provider });
      return null;
    }

    return { provider, modelName, apiKey, baseUrl: normalizeBaseUrl(baseUrl) };
  }

  private async apply(settings: Record<string, string>) {
    if (this.disposed || !this.binaryPath) return;

    const config = this.parseRuntimeConfig(settings);
    if (!config) {
      await this.stop();
      this.lastFingerprint = null;
      return;
    }

    const fingerprint = `${this.binaryPath}|${config.provider}|${config.modelName}|${config.apiKey}`;
    if (
      this.child &&
      this.child.exitCode === null &&
      !this.child.killed &&
      fingerprint === this.lastFingerprint
    ) {
      return;
    }

    this.lastFingerprint = fingerprint;
    await this.restart(config);
  }

  private async restart(config: RuntimeConfig) {
    await this.stop();
    await killProcessesOnPort(SERVER_PORT);

    const child = spawn(
      this.binaryPath as string,
      [
        '--base_url',
        config.baseUrl,
        '--model',
        config.modelName,
        '--api_key',
        config.apiKey,
        '--port',
        `:${SERVER_PORT}`,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: this.runtimeDir ?? app.getPath('userData'),
      }
    );
    child.unref();
    child.stdout?.on('data', chunk => {
      logger.info('go-server stdout', String(chunk).trim());
    });
    child.stderr?.on('data', chunk => {
      logger.error('go-server stderr', String(chunk).trim());
    });
    child.once('error', error => {
      logger.error('go-server process error', error);
    });
    child.once('exit', (code, signal) => {
      logger.info('go-server process exited', { code, signal });
      if (this.child === child) {
        this.child = null;
      }
    });
    this.child = child;
    logger.info('go-server process started', {
      pid: child.pid,
      modelName: config.modelName,
      provider: config.provider,
    });
  }

  private async stop() {
    if (!this.child) return;
    try {
      this.child.kill('SIGKILL');
    } catch (error) {
      logger.warn('failed to kill go-server process', error);
    }
    this.child = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.applyTimer) {
      clearTimeout(this.applyTimer);
      this.applyTimer = null;
    }
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.stop().catch(error => {
      logger.warn('failed to stop go-server on dispose', error);
    });
  }
}

let manager: GoServerManager | null = null;

export async function setupGoServerManager() {
  if (!manager) {
    manager = new GoServerManager();
    await manager.setup();
  }
}
