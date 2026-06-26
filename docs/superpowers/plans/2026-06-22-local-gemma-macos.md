# AFFiNE macOS Local Gemma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Apple Silicon macOS 桌面版 AFFiNE `.app` 中，为 pagedoc `/ Ask AI` 与 edgeless/whiteboard AI 问询接入本地 Gemma 3 4B Instruct，并在本地运行不可用时明确回退到现有云端链路。

**Architecture:** 保持现有 editor AI 入口不变，只在共享 request/runtime 层增加 desktop local lane。Electron helper 负责 sidecar 生命周期、模型资源定位与健康检查；renderer 通过集中化的 local runtime client 请求 helper 并在命中条件时直连本地 sidecar 的 OpenAI-compatible 流式接口。服务器侧现有 Gemini 路径继续保留，作为 Web、非 Apple Silicon 与本地异常场景的回退路径。

**Tech Stack:** TypeScript, Electron helper/main/preload IPC, `llama.cpp` sidecar, Fetch streaming, Vitest, Electron Forge, GitHub Actions, macOS codesign/notarization.

---

## 文件结构与职责映射

### 共享 request/runtime 层

- Create: `packages/frontend/core/src/blocksuite/ai/runtime/request/desktop-route-policy.ts`
  - 负责决定 chat 请求是否命中本地 lane。
- Create: `packages/frontend/core/src/blocksuite/ai/runtime/request/local-runtime-client.ts`
  - 负责向 helper 取本地状态并请求 sidecar 流式接口。
- Modify: `packages/frontend/core/src/blocksuite/ai/runtime/request/service.ts`
  - 负责把 chat action 路由到 local 或 server。
- Modify: `packages/frontend/core/src/blocksuite/ai/runtime/request/message-transport.ts`
  - 保持 server transport 不变，仅抽取可复用的小工具。

### Electron helper 本地 AI 层

- Create: `packages/frontend/apps/electron/src/helper/local-ai/types.ts`
  - 本地运行状态、错误原因、状态构造器。
- Create: `packages/frontend/apps/electron/src/helper/local-ai/index.ts`
  - helper namespace 暴露点。
- Create: `packages/frontend/apps/electron/src/helper/local-ai/model-assets.ts`
  - sidecar 与模型文件定位。
- Create: `packages/frontend/apps/electron/src/helper/local-ai/sidecar.ts`
  - sidecar 启动参数与健康检查。
- Create: `packages/frontend/apps/electron/src/helper/local-ai/manager.ts`
  - 单例生命周期管理、状态广播、自动恢复。
- Modify: `packages/frontend/apps/electron/src/helper/exposed.ts`
  - 暴露 `localAI` namespace 到 renderer。

### 模型状态与桌面 UI 层

- Modify: `packages/frontend/core/src/modules/ai-button/services/catalog.ts`
  - 把 Gemma 从 deferred metadata 提升为 desktop-local capable metadata，并提供状态标题函数。
- Modify: `packages/frontend/core/src/modules/ai-button/services/catalog.spec.ts`
  - 校验 Gemma metadata 与状态标题。
- Modify: `packages/frontend/core/src/blocksuite/ai/components/ai-chat-input/preference-popup.ts`
  - 在模型选择菜单中显示 `Local / Starting / Cloud fallback`。

### 打包与发布层

- Create: `packages/frontend/apps/electron/scripts/stage-local-ai-assets.mjs`
  - 在打包前把 sidecar 与模型资源复制到 `resources/local-ai`。
- Modify: `packages/frontend/apps/electron/forge.config.mjs`
  - 把 `resources/local-ai` 纳入 `extraResource`，并在 `prePackage` 中执行 staging。
- Modify: `.github/workflows/release-desktop-platform.yml`
  - 为 macOS arm64 产物注入本地 AI 资源与校验步骤。
- Modify: `docs/building-desktop-client-app.md`
  - 记录本地 AI 资源布局、打包命令与验收命令。

---

## Task 1: 建立 Electron helper 的本地 AI 合同与暴露点

**Files:**

- Create: `packages/frontend/apps/electron/src/helper/local-ai/types.ts`
- Create: `packages/frontend/apps/electron/src/helper/local-ai/index.ts`
- Test: `packages/frontend/apps/electron/src/helper/local-ai/status.spec.ts`
- Modify: `packages/frontend/apps/electron/src/helper/exposed.ts`

- [ ] **Step 1: 先写失败测试，锁定本地状态对象的最小合同**

```ts
import { describe, expect, test } from 'vitest';

import { errorStatus, readyStatus, startingStatus, unsupportedStatus } from './types';

describe('local AI status helpers', () => {
  test('builds unsupported and starting states', () => {
    expect(unsupportedStatus('not_apple_silicon')).toEqual({
      state: 'unsupported',
      canRun: false,
      fallbackToServer: true,
      reason: 'not_apple_silicon',
      modelId: 'gemma-3-4b-it-local',
    });

    expect(startingStatus()).toEqual({
      state: 'starting',
      canRun: false,
      fallbackToServer: true,
      modelId: 'gemma-3-4b-it-local',
    });
  });

  test('builds ready and error states', () => {
    expect(
      readyStatus({
        endpoint: 'http://127.0.0.1:43111',
        pid: 998,
        port: 43111,
      })
    ).toEqual({
      state: 'ready',
      canRun: true,
      fallbackToServer: false,
      modelId: 'gemma-3-4b-it-local',
      endpoint: 'http://127.0.0.1:43111',
      pid: 998,
      port: 43111,
    });

    expect(errorStatus('healthcheck_failed', 'timeout')).toEqual({
      state: 'error',
      canRun: false,
      fallbackToServer: true,
      reason: 'healthcheck_failed',
      detail: 'timeout',
      modelId: 'gemma-3-4b-it-local',
    });
  });
});
```

- [ ] **Step 2: 跑测试，确认当前确实失败**

Run: `yarn test packages/frontend/apps/electron/src/helper/local-ai/status.spec.ts --runInBand`

Expected: FAIL，报错 `Cannot find module './types'`。

- [ ] **Step 3: 写最小实现，先把本地状态类型与 stub handler 建起来**

`packages/frontend/apps/electron/src/helper/local-ai/types.ts`

```ts
export type LocalAIModelId = 'gemma-3-4b-it-local';

export type LocalAIUnavailableReason = 'not_macos' | 'not_apple_silicon' | 'resources_missing' | 'not_packaged';

export type LocalAIErrorReason = 'spawn_failed' | 'healthcheck_failed' | 'crashed' | 'oom';

export type LocalAIRuntimeStatus =
  | {
      state: 'unsupported';
      canRun: false;
      fallbackToServer: true;
      reason: LocalAIUnavailableReason;
      detail?: string;
      modelId: LocalAIModelId;
    }
  | {
      state: 'starting';
      canRun: false;
      fallbackToServer: true;
      modelId: LocalAIModelId;
    }
  | {
      state: 'ready';
      canRun: true;
      fallbackToServer: false;
      endpoint: string;
      port: number;
      pid: number;
      modelId: LocalAIModelId;
    }
  | {
      state: 'error';
      canRun: false;
      fallbackToServer: true;
      reason: LocalAIErrorReason;
      detail: string;
      modelId: LocalAIModelId;
    };

const modelId: LocalAIModelId = 'gemma-3-4b-it-local';

export function unsupportedStatus(reason: LocalAIUnavailableReason, detail?: string): LocalAIRuntimeStatus {
  return {
    state: 'unsupported',
    canRun: false,
    fallbackToServer: true,
    reason,
    detail,
    modelId,
  };
}

export function startingStatus(): LocalAIRuntimeStatus {
  return {
    state: 'starting',
    canRun: false,
    fallbackToServer: true,
    modelId,
  };
}

export function readyStatus(input: { endpoint: string; port: number; pid: number }): LocalAIRuntimeStatus {
  return {
    state: 'ready',
    canRun: true,
    fallbackToServer: false,
    modelId,
    endpoint: input.endpoint,
    port: input.port,
    pid: input.pid,
  };
}

export function errorStatus(reason: LocalAIErrorReason, detail: string): LocalAIRuntimeStatus {
  return {
    state: 'error',
    canRun: false,
    fallbackToServer: true,
    reason,
    detail,
    modelId,
  };
}
```

`packages/frontend/apps/electron/src/helper/local-ai/index.ts`

```ts
import { BehaviorSubject } from 'rxjs';

import type { MainEventRegister } from '../type';
import { type LocalAIRuntimeStatus, unsupportedStatus } from './types';

const status$ = new BehaviorSubject<LocalAIRuntimeStatus>(unsupportedStatus('not_packaged'));

export const localAIEvents = {
  onStatusChanged: (fn: (status: LocalAIRuntimeStatus) => void) => {
    const sub = status$.subscribe(fn);
    return () => sub.unsubscribe();
  },
} satisfies Record<string, MainEventRegister>;

export const localAIHandlers = {
  getStatus: async () => status$.value,
  ensureReady: async () => status$.value,
};
```

`packages/frontend/apps/electron/src/helper/exposed.ts`

```ts
import { localAIEvents, localAIHandlers } from './local-ai';

export const handlers = {
  db: dbHandlersV1,
  nbstore: nbstoreHandlers,
  workspace: workspaceHandlers,
  dialog: dialogHandlers,
  preview: previewHandlers,
  localAI: localAIHandlers,
};

export const events = {
  db: dbEventsV1,
  workspace: workspaceEvents,
  localAI: localAIEvents,
};
```

- [ ] **Step 4: 再跑测试，确认状态合同已通过**

Run: `yarn test packages/frontend/apps/electron/src/helper/local-ai/status.spec.ts --runInBand`

Expected: PASS。

- [ ] **Step 5: 提交这一小步，留下可编译的 helper namespace**

```bash
git add packages/frontend/apps/electron/src/helper/local-ai/types.ts \
  packages/frontend/apps/electron/src/helper/local-ai/index.ts \
  packages/frontend/apps/electron/src/helper/local-ai/status.spec.ts \
  packages/frontend/apps/electron/src/helper/exposed.ts
git commit -m "feat: add desktop local ai helper contract"
```

---

## Task 2: 实现 helper sidecar 管理、资源定位与健康检查

**Files:**

- Create: `packages/frontend/apps/electron/src/helper/local-ai/model-assets.ts`
- Create: `packages/frontend/apps/electron/src/helper/local-ai/sidecar.ts`
- Create: `packages/frontend/apps/electron/src/helper/local-ai/manager.ts`
- Test: `packages/frontend/apps/electron/src/helper/local-ai/model-assets.spec.ts`
- Modify: `packages/frontend/apps/electron/src/helper/local-ai/index.ts`

- [ ] **Step 1: 先写失败测试，锁定资源布局与 sidecar 参数**

```ts
import { describe, expect, test } from 'vitest';

import { resolveLocalAIAssets } from './model-assets';
import { buildSidecarArgs } from './sidecar';

describe('local AI assets', () => {
  test('resolves macOS arm64 runtime layout', () => {
    expect(resolveLocalAIAssets('/Applications/AFFiNE.app/Contents/Resources')).toEqual({
      binaryPath: '/Applications/AFFiNE.app/Contents/Resources/local-ai/bin/llama-server',
      modelPath: '/Applications/AFFiNE.app/Contents/Resources/local-ai/models/gemma-3-4b-it.gguf',
    });
  });

  test('builds llama.cpp server arguments', () => {
    expect(
      buildSidecarArgs({
        modelPath: '/tmp/gemma-3-4b-it.gguf',
        port: 43111,
      })
    ).toEqual(['--model', '/tmp/gemma-3-4b-it.gguf', '--host', '127.0.0.1', '--port', '43111', '--ctx-size', '8192', '--n-gpu-layers', '99']);
  });
});
```

- [ ] **Step 2: 跑测试，确认还没实现这些 helper**

Run: `yarn test packages/frontend/apps/electron/src/helper/local-ai/model-assets.spec.ts --runInBand`

Expected: FAIL，报错 `Cannot find module './model-assets'` 或导出不存在。

- [ ] **Step 3: 写最小实现，先把资源路径与 sidecar 参数变成纯函数**

`packages/frontend/apps/electron/src/helper/local-ai/model-assets.ts`

```ts
import path from 'node:path';

export function resolveLocalAIAssets(resourcesRoot: string) {
  return {
    binaryPath: path.join(resourcesRoot, 'local-ai', 'bin', 'llama-server'),
    modelPath: path.join(resourcesRoot, 'local-ai', 'models', 'gemma-3-4b-it.gguf'),
  };
}
```

`packages/frontend/apps/electron/src/helper/local-ai/sidecar.ts`

```ts
export function buildSidecarArgs(input: { modelPath: string; port: number }) {
  return ['--model', input.modelPath, '--host', '127.0.0.1', '--port', String(input.port), '--ctx-size', '8192', '--n-gpu-layers', '99'];
}
```

- [ ] **Step 4: 在 helper 中接入真正的 manager，实现启动、健康检查、状态广播**

`packages/frontend/apps/electron/src/helper/local-ai/manager.ts`

```ts
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { app } from 'electron';
import { BehaviorSubject } from 'rxjs';

import { logger } from '../logger';
import { errorStatus, readyStatus, startingStatus, type LocalAIRuntimeStatus, unsupportedStatus } from './types';
import { resolveLocalAIAssets } from './model-assets';
import { buildSidecarArgs } from './sidecar';

async function canAccess(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitForHealthy(endpoint: string, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${endpoint}/health`);
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Local AI health check timed out');
}

export class LocalAIManager {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly status$ = new BehaviorSubject<LocalAIRuntimeStatus>(unsupportedStatus('not_packaged'));
  private bootPromise: Promise<LocalAIRuntimeStatus> | null = null;

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
    if (this.bootPromise) {
      return await this.bootPromise;
    }
    this.bootPromise = this.start();
    try {
      return await this.bootPromise;
    } finally {
      this.bootPromise = null;
    }
  }

  async dispose() {
    this.child?.kill();
    this.child = null;
  }

  private async start(): Promise<LocalAIRuntimeStatus> {
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

    const resourcesRoot = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources');
    const { binaryPath, modelPath } = resolveLocalAIAssets(resourcesRoot);
    const hasBinary = await canAccess(binaryPath);
    const hasModel = await canAccess(modelPath);
    if (!hasBinary || !hasModel) {
      const status = unsupportedStatus('resources_missing', `${hasBinary ? 'model' : 'binary'} missing`);
      this.status$.next(status);
      return status;
    }

    const port = 43111;
    const endpoint = `http://127.0.0.1:${port}`;
    this.status$.next(startingStatus());
    const child = spawn(binaryPath, buildSidecarArgs({ modelPath, port }), {
      stdio: 'pipe',
      env: process.env,
    });
    this.child = child;

    child.once('exit', code => {
      if (this.status$.value.state !== 'ready') return;
      this.status$.next(errorStatus('crashed', `sidecar exited with ${code}`));
    });
    child.stderr.on('data', chunk => {
      logger.warn('[local-ai]', String(chunk));
    });

    try {
      await waitForHealthy(endpoint);
      const status = readyStatus({
        endpoint,
        port,
        pid: child.pid ?? -1,
      });
      this.status$.next(status);
      return status;
    } catch (error) {
      child.kill();
      const status = errorStatus('healthcheck_failed', error instanceof Error ? error.message : String(error));
      this.status$.next(status);
      return status;
    }
  }
}

export const localAIManager = new LocalAIManager();

process.once('exit', () => {
  void localAIManager.dispose();
});
```

`packages/frontend/apps/electron/src/helper/local-ai/index.ts`

```ts
import type { MainEventRegister } from '../type';

import { localAIManager } from './manager';

export const localAIEvents = {
  onStatusChanged: (fn: (status: ReturnType<typeof localAIManager.getStatus>) => void) => {
    return localAIManager.subscribe(fn);
  },
} satisfies Record<string, MainEventRegister>;

export const localAIHandlers = {
  getStatus: async () => localAIManager.getStatus(),
  ensureReady: async () => localAIManager.ensureReady(),
};
```

- [ ] **Step 5: 重跑纯函数测试，再做一次 helper smoke test**

Run: `yarn test packages/frontend/apps/electron/src/helper/local-ai/model-assets.spec.ts --runInBand`

Expected: PASS。

Run: `yarn test packages/frontend/apps/electron/src/helper/local-ai/status.spec.ts --runInBand`

Expected: PASS。

- [ ] **Step 6: 提交 sidecar 管理这一层**

```bash
git add packages/frontend/apps/electron/src/helper/local-ai/model-assets.ts \
  packages/frontend/apps/electron/src/helper/local-ai/sidecar.ts \
  packages/frontend/apps/electron/src/helper/local-ai/manager.ts \
  packages/frontend/apps/electron/src/helper/local-ai/model-assets.spec.ts \
  packages/frontend/apps/electron/src/helper/local-ai/index.ts
git commit -m "feat: add desktop local ai sidecar manager"
```

---

## Task 3: 实现 renderer 侧本地路由策略与流式客户端

**Files:**

- Create: `packages/frontend/core/src/blocksuite/ai/runtime/request/desktop-route-policy.ts`
- Create: `packages/frontend/core/src/blocksuite/ai/runtime/request/desktop-route-policy.spec.ts`
- Create: `packages/frontend/core/src/blocksuite/ai/runtime/request/local-runtime-client.ts`
- Create: `packages/frontend/core/src/blocksuite/ai/runtime/request/local-runtime-client.spec.ts`

- [ ] **Step 1: 先写失败测试，锁定本地 lane 选择边界**

```ts
import { describe, expect, test } from 'vitest';

import { resolveDesktopChatLane } from './desktop-route-policy';

describe('resolveDesktopChatLane', () => {
  test('selects local lane only for Gemma chat on ready desktop runtime', async () => {
    await expect(
      resolveDesktopChatLane({
        requestAction: 'chat',
        modelId: 'gemma-3-4b-it',
        retry: false,
        localStatus: {
          state: 'ready',
          canRun: true,
          fallbackToServer: false,
          endpoint: 'http://127.0.0.1:43111',
          port: 43111,
          pid: 321,
          modelId: 'gemma-3-4b-it-local',
        },
      })
    ).resolves.toEqual({
      lane: 'local',
      reason: 'desktop_gemma_ready',
    });
  });

  test('falls back to server for retry and unavailable runtime', async () => {
    await expect(
      resolveDesktopChatLane({
        requestAction: 'chat',
        modelId: 'gemma-3-4b-it',
        retry: true,
        localStatus: {
          state: 'ready',
          canRun: true,
          fallbackToServer: false,
          endpoint: 'http://127.0.0.1:43111',
          port: 43111,
          pid: 321,
          modelId: 'gemma-3-4b-it-local',
        },
      })
    ).resolves.toEqual({
      lane: 'server',
      reason: 'retry_not_supported_locally',
    });
  });
});
```

- [ ] **Step 2: 先跑测试，确认 route policy 还不存在**

Run: `yarn test packages/frontend/core/src/blocksuite/ai/runtime/request/desktop-route-policy.spec.ts --runInBand`

Expected: FAIL。

- [ ] **Step 3: 写 route policy 最小实现，把“何时本地”集中到一个文件里**

`packages/frontend/core/src/blocksuite/ai/runtime/request/desktop-route-policy.ts`

```ts
import type { ClientHandler } from '@affine/electron-api';

type LocalStatus = Awaited<ReturnType<ClientHandler['localAI']['getStatus']>>;

export async function resolveDesktopChatLane(input: { requestAction?: string; modelId?: string; retry?: boolean; localStatus: LocalStatus | null }) {
  if (input.requestAction !== 'chat') {
    return { lane: 'server' as const, reason: 'non_chat_action' };
  }
  if (!input.modelId?.toLowerCase().includes('gemma')) {
    return { lane: 'server' as const, reason: 'non_gemma_model' };
  }
  if (input.retry) {
    return {
      lane: 'server' as const,
      reason: 'retry_not_supported_locally',
    };
  }
  if (!input.localStatus || input.localStatus.state !== 'ready') {
    return { lane: 'server' as const, reason: 'local_runtime_unavailable' };
  }
  return { lane: 'local' as const, reason: 'desktop_gemma_ready' };
}
```

- [ ] **Step 4: 写本地流式 client，把 localhost 请求收口到一个文件里**

`packages/frontend/core/src/blocksuite/ai/runtime/request/local-runtime-client.ts`

```ts
import { apis, type ClientHandler } from '@affine/electron-api';

import type { TextToTextOptions } from './message-transport';

type LocalStatus = Awaited<ReturnType<ClientHandler['localAI']['ensureReady']>>;

async function blobToDataUrl(blob: Blob | File) {
  const buffer = await blob.arrayBuffer();
  const base64 = btoa(Array.from(new Uint8Array(buffer), byte => String.fromCharCode(byte)).join(''));
  return `data:${blob.type || 'image/jpeg'};base64,${base64}`;
}

async function buildUserContent(options: TextToTextOptions) {
  const parts: Array<Record<string, unknown>> = [];
  if (options.content) {
    parts.push({ type: 'text', text: options.content });
  }
  if (options.params?.docs) {
    parts.push({
      type: 'text',
      text: `Referenced docs:\n${JSON.stringify(options.params.docs)}`,
    });
  }
  if (options.params?.files) {
    parts.push({
      type: 'text',
      text: `Referenced files:\n${JSON.stringify(options.params.files)}`,
    });
  }
  if (options.params?.selectedMarkdown) {
    parts.push({
      type: 'text',
      text: `Selected markdown:\n${String(options.params.selectedMarkdown)}`,
    });
  }
  if (options.params?.selectedSnapshot) {
    parts.push({
      type: 'text',
      text: `Selected snapshot:\n${JSON.stringify(options.params.selectedSnapshot)}`,
    });
  }
  if (options.params?.html) {
    parts.push({ type: 'text', text: `Selected html:\n${String(options.params.html)}` });
  }
  for (const attachment of options.attachments ?? []) {
    if (typeof attachment === 'string') continue;
    parts.push({
      type: 'image_url',
      image_url: { url: await blobToDataUrl(attachment) },
    });
  }
  return parts;
}

async function parseOpenAIStream(response: Response) {
  if (!response.body) {
    throw new Error('Local AI returned an empty body');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') return;
          const json = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const text = json.choices?.[0]?.delta?.content;
          if (text) {
            yield text;
          }
        }
        if (done) return;
      }
    },
  };
}

export async function streamDesktopLocalChat(options: TextToTextOptions) {
  const status = (await apis?.localAI.ensureReady()) as LocalStatus | undefined;
  if (!status || status.state !== 'ready') {
    throw new Error('Desktop local AI is not ready');
  }

  const body = {
    model: status.modelId,
    stream: true,
    messages: [
      {
        role: 'system',
        content: 'You are the local AFFiNE desktop AI assistant. Answer directly and keep formatting useful for the editor.',
      },
      {
        role: 'user',
        content: await buildUserContent(options),
      },
    ],
  };

  const response = await fetch(`${status.endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`Local AI request failed with ${response.status}`);
  }
  return await parseOpenAIStream(response);
}
```

- [ ] **Step 5: 为本地 client 写解析测试，确保流式输出可被 chat runtime 消费**

`packages/frontend/core/src/blocksuite/ai/runtime/request/local-runtime-client.spec.ts`

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, expect, test, vi } from 'vitest';

import { streamDesktopLocalChat } from './local-runtime-client';

vi.mock('@affine/electron-api', () => ({
  apis: {
    localAI: {
      ensureReady: vi.fn().mockResolvedValue({
        state: 'ready',
        canRun: true,
        fallbackToServer: false,
        endpoint: 'http://127.0.0.1:43111',
        port: 43111,
        pid: 222,
        modelId: 'gemma-3-4b-it-local',
      }),
    },
  },
}));

describe('streamDesktopLocalChat', () => {
  test('yields delta text from OpenAI-style SSE stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n' + 'data: {"choices":[{"delta":{"content":" world"}}]}\n\n' + 'data: [DONE]\n\n')));

    const stream = await streamDesktopLocalChat({
      client: {} as never,
      sessionId: 'session-1',
      content: 'Say hello',
      stream: true,
    });

    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['hello', ' world']);
  });
});
```

- [ ] **Step 6: 跑测试，确认策略与流式适配器稳定**

Run: `yarn test packages/frontend/core/src/blocksuite/ai/runtime/request/desktop-route-policy.spec.ts --runInBand`

Expected: PASS。

Run: `yarn test packages/frontend/core/src/blocksuite/ai/runtime/request/local-runtime-client.spec.ts --runInBand`

Expected: PASS。

- [ ] **Step 7: 提交 renderer 侧路由与流式能力**

```bash
git add packages/frontend/core/src/blocksuite/ai/runtime/request/desktop-route-policy.ts \
  packages/frontend/core/src/blocksuite/ai/runtime/request/desktop-route-policy.spec.ts \
  packages/frontend/core/src/blocksuite/ai/runtime/request/local-runtime-client.ts \
  packages/frontend/core/src/blocksuite/ai/runtime/request/local-runtime-client.spec.ts
git commit -m "feat: add desktop local gemma route policy"
```

---

## Task 4: 把 chat action 接到本地 lane，并保留明确的 server fallback

**Files:**

- Modify: `packages/frontend/core/src/blocksuite/ai/runtime/request/service.ts`
- Modify: `packages/frontend/core/src/blocksuite/ai/runtime/request/service.spec.ts`
- Test: `packages/frontend/core/src/blocksuite/ai/runtime/chat/runtime.spec.ts`

- [ ] **Step 1: 先写失败测试，锁定“chat 走 local，失败回退 server”**

在 `packages/frontend/core/src/blocksuite/ai/runtime/request/service.spec.ts` 里追加：

```ts
const streamDesktopLocalChat = vi.hoisted(() => vi.fn());
const resolveDesktopChatLane = vi.hoisted(() => vi.fn());

vi.mock('./desktop-route-policy', () => ({
  resolveDesktopChatLane,
}));

vi.mock('./local-runtime-client', () => ({
  streamDesktopLocalChat,
}));

test('routes gemma chat to desktop local runtime', async () => {
  resolveDesktopChatLane.mockResolvedValue({
    lane: 'local',
    reason: 'desktop_gemma_ready',
  });
  streamDesktopLocalChat.mockResolvedValue({
    async *[Symbol.asyncIterator]() {
      yield 'local result';
    },
  });

  const client = createClient();
  const service = new AIRequestService(client);
  const chunks: string[] = [];

  const stream = (await service.executeAction('chat', {
    workspaceId: 'workspace-1',
    input: 'hello',
    stream: true,
    modelId: 'gemma-3-4b-it',
  })) as AsyncIterable<string>;

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  expect(chunks).toEqual(['local result']);
  expect(streamDesktopLocalChat).toHaveBeenCalled();
  expect(client.chatTextStream).not.toHaveBeenCalled();
});

test('falls back to server when desktop local runtime throws', async () => {
  resolveDesktopChatLane.mockResolvedValue({
    lane: 'local',
    reason: 'desktop_gemma_ready',
  });
  streamDesktopLocalChat.mockRejectedValue(new Error('boot failed'));

  const client = createClient();
  const service = new AIRequestService(client);

  await drainActionResult(
    (await service.executeAction('chat', {
      workspaceId: 'workspace-1',
      input: 'hello',
      stream: true,
      modelId: 'gemma-3-4b-it',
    })) as AsyncIterable<unknown>
  );

  expect(client.chatTextStream).toHaveBeenCalled();
});
```

- [ ] **Step 2: 跑测试，确认 service 还没接 local path**

Run: `yarn test packages/frontend/core/src/blocksuite/ai/runtime/request/service.spec.ts --runInBand`

Expected: FAIL，`streamDesktopLocalChat` 未被调用。

- [ ] **Step 3: 在 request service 中加一个单独的本地 chat 分支**

在 `packages/frontend/core/src/blocksuite/ai/runtime/request/service.ts` 中加入：

```ts
import { resolveDesktopChatLane } from './desktop-route-policy';
import { streamDesktopLocalChat } from './local-runtime-client';
```

并把 `executeAction` 的中段改成：

```ts
const transportOptions = {
  ...options,
  client: this.client,
  sessionId,
  content: definition.buildContent?.(options) ?? options.input,
  params: definition.buildParams?.(options),
  timeout: definition.timeout,
  endpoint: definition.endpoint,
  actionId,
  actionVersion,
};

if (id === 'chat' && definition.responseType === 'text') {
  const decision = await resolveDesktopChatLane({
    requestAction: id,
    modelId: options.modelId,
    retry: options.retry,
    localStatus: null,
  });
  if (decision.lane === 'local') {
    try {
      const localStream = await streamDesktopLocalChat(transportOptions);
      return this.wrapTextStream(localStream, id, options);
    } catch (error) {
      console.warn('Desktop local AI failed, falling back to server', error);
    }
  }
}

const stream = definition.responseType === 'image' ? toImage(transportOptions) : textToText(transportOptions);
return this.wrapTextStream(stream as AsyncIterable<string>, id, options);
```

随后把 `decision` 输入改成真正读取 helper 状态：

```ts
import { apis } from '@affine/electron-api';

const decision = await resolveDesktopChatLane({
  requestAction: id,
  modelId: options.modelId,
  retry: options.retry,
  localStatus: (await apis?.localAI.getStatus()) ?? null,
});
```

- [ ] **Step 4: 补一个 runtime 层 smoke test，证明 pagedoc / edgeless 共用 chat runtime 时不会被改坏**

在 `packages/frontend/core/src/blocksuite/ai/runtime/chat/runtime.spec.ts` 里追加：

```ts
test('chat runtime still dispatches through request.executeAction', async () => {
  const request = createRequest({
    executeAction: vi.fn().mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield 'hello';
      },
    }),
  });

  const runtime = createRuntime(request);
  await runtime.dispatch({ type: 'send', input: 'hello', modelId: 'gemma-3-4b-it' });

  expect(request.executeAction).toHaveBeenCalledWith(
    'chat',
    expect.objectContaining({
      input: 'hello',
      modelId: 'gemma-3-4b-it',
      stream: true,
    })
  );
});
```

- [ ] **Step 5: 重跑 request + runtime 测试，确认 local lane 只影响共享路径，不影响 UI 入口语义**

Run: `yarn test packages/frontend/core/src/blocksuite/ai/runtime/request/service.spec.ts --runInBand`

Expected: PASS。

Run: `yarn test packages/frontend/core/src/blocksuite/ai/runtime/chat/runtime.spec.ts --runInBand`

Expected: PASS。

- [ ] **Step 6: 提交真正的“本地优先 + 明确 fallback”能力**

```bash
git add packages/frontend/core/src/blocksuite/ai/runtime/request/service.ts \
  packages/frontend/core/src/blocksuite/ai/runtime/request/service.spec.ts \
  packages/frontend/core/src/blocksuite/ai/runtime/chat/runtime.spec.ts
git commit -m "feat: route desktop gemma chat locally"
```

---

## Task 5: 在模型选择 UI 中明确显示 Local / Starting / Cloud fallback

**Files:**

- Modify: `packages/frontend/core/src/modules/ai-button/services/catalog.ts`
- Modify: `packages/frontend/core/src/modules/ai-button/services/catalog.spec.ts`
- Modify: `packages/frontend/core/src/blocksuite/ai/components/ai-chat-input/preference-popup.ts`

- [ ] **Step 1: 先写失败测试，锁定 Gemma 的 desktop metadata 文案**

在 `packages/frontend/core/src/modules/ai-button/services/catalog.spec.ts` 里追加：

```ts
import { appleLocalInferenceStateTitle, executionLaneTitle, privacyStateTitle } from './catalog';

test('maps desktop local inference states to visible labels', () => {
  expect(appleLocalInferenceStateTitle('deferred_candidate')).toBe('Bundled local candidate');
  expect(appleLocalInferenceStateTitle('not_applicable')).toBe('Not applicable');
  expect(executionLaneTitle('local')).toBe('Local');
  expect(privacyStateTitle('local_private')).toBe('Local private');
});
```

- [ ] **Step 2: 跑测试，确认 catalog 还没有这个文案函数**

Run: `yarn test packages/frontend/core/src/modules/ai-button/services/catalog.spec.ts --runInBand`

Expected: FAIL，报 `appleLocalInferenceStateTitle is not exported`。

- [ ] **Step 3: 在 catalog 中补充本地推理状态标题函数**

在 `packages/frontend/core/src/modules/ai-button/services/catalog.ts` 中加入：

```ts
export function appleLocalInferenceStateTitle(state: AppleLocalInferenceState): string {
  switch (state) {
    case 'deferred_candidate':
      return 'Bundled local candidate';
    default:
      return 'Not applicable';
  }
}
```

并保留 Gemma 的 metadata 为：

```ts
  [ByokProvider.gemma]: {
    provider: ByokProvider.gemma,
    label: 'Gemma',
    capabilities: ['Text', 'Image input'],
    executionLane: 'server',
    privacyState: 'cloud',
    localCapable: true,
    appleLocalInferenceState: 'deferred_candidate',
  },
```

这里先不把静态 metadata 直接改成 `local`，因为 Web 与非 Apple Silicon 仍然会走 server；真正的 `Local / Starting / Cloud fallback` 由桌面 helper 实时状态覆盖。

- [ ] **Step 4: 在模型弹层里读取 helper 状态，并把状态可视化**

在 `packages/frontend/core/src/blocksuite/ai/components/ai-chat-input/preference-popup.ts` 中加入：

```ts
import { apis } from '@affine/electron-api';
import { property, state } from 'lit/decorators.js';
```

如果文件里已经有 `import { property } from 'lit/decorators.js';`，直接替换为上面这一行。

在类里加入：

```ts
  @state()
  accessor localStatusLabel = '';

  override connectedCallback() {
    super.connectedCallback();
    void this.refreshLocalStatus();
  }

  private async refreshLocalStatus() {
    const status = await apis?.localAI.getStatus();
    this.localStatusLabel =
      status?.state === 'ready'
        ? 'Local'
        : status?.state === 'starting'
          ? 'Starting'
          : this.model.value?.localCapable
            ? 'Cloud fallback'
            : '';
  }
```

再把模型子菜单 postfix 调整成：

```ts
        postfix: html`
          <span class="ai-active-model-name">
            ${this.model.value?.name}
            ${this.localStatusLabel ? ` • ${this.localStatusLabel}` : ''}
          </span>
        `,
```

并把每个 model item 的 `info` 改成：

```ts
              info: html`
                <span class="ai-model-version">${model.version}</span>
                ${model.localCapable
                  ? html`<span class="ai-model-version"> • ${this.localStatusLabel || 'Cloud fallback'}</span>`
                  : ''}
              `,
```

- [ ] **Step 5: 重跑 catalog 测试，并做一次桌面 UI 手工验收**

Run: `yarn test packages/frontend/core/src/modules/ai-button/services/catalog.spec.ts --runInBand`

Expected: PASS。

Run: `yarn dev`

Expected: 在桌面 chat 输入框的模型下拉中，Gemma 选项会出现 `Local`、`Starting` 或 `Cloud fallback` 其一；没有 silent downgrade。

- [ ] **Step 6: 提交 UI 可见状态这一层**

```bash
git add packages/frontend/core/src/modules/ai-button/services/catalog.ts \
  packages/frontend/core/src/modules/ai-button/services/catalog.spec.ts \
  packages/frontend/core/src/blocksuite/ai/components/ai-chat-input/preference-popup.ts
git commit -m "feat: surface desktop local ai status"
```

---

## Task 6: 把 sidecar 与模型资源纳入 macOS 打包、CI 与文档

**Files:**

- Create: `packages/frontend/apps/electron/scripts/stage-local-ai-assets.mjs`
- Modify: `packages/frontend/apps/electron/forge.config.mjs`
- Modify: `.github/workflows/release-desktop-platform.yml`
- Modify: `docs/building-desktop-client-app.md`

- [ ] **Step 1: 先写一个会失败的 staging smoke command，确认资源目录现在还没被打进去**

Run: `test -d packages/frontend/apps/electron/resources/local-ai || echo "missing local-ai resources"`

Expected: 输出 `missing local-ai resources`。

- [ ] **Step 2: 写 staging 脚本，把 sidecar 与模型从 vendor 目录复制到 Electron resources**

`packages/frontend/apps/electron/scripts/stage-local-ai-assets.mjs`

```js
#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..');
const vendorRoot = path.join(repoRoot, 'vendor', 'local-ai', 'darwin-arm64');
const outputRoot = path.join(repoRoot, 'packages', 'frontend', 'apps', 'electron', 'resources', 'local-ai');

const entries = [
  {
    from: path.join(vendorRoot, 'llama-server'),
    to: path.join(outputRoot, 'bin', 'llama-server'),
  },
  {
    from: path.join(vendorRoot, 'gemma-3-4b-it.gguf'),
    to: path.join(outputRoot, 'models', 'gemma-3-4b-it.gguf'),
  },
];

for (const entry of entries) {
  await fs.mkdir(path.dirname(entry.to), { recursive: true });
  await fs.copyFile(entry.from, entry.to);
}
await fs.chmod(path.join(outputRoot, 'bin', 'llama-server'), 0o755);
console.log('[local-ai] staged resources into', outputRoot);
```

- [ ] **Step 3: 把 staging 脚本接到 Forge 打包流程，并把资源放进 `extraResource`**

在 `packages/frontend/apps/electron/forge.config.mjs` 中加入：

```js
import { execFileSync } from 'node:child_process';
```

然后修改 `extraResource`：

```js
    extraResource: [
      './resources/app-update.yml',
      ...(platform === 'darwin' && arch === 'arm64'
        ? ['./resources/local-ai']
        : []),
      ...(platform === 'linux' ? ['./resources/affine.metainfo.xml'] : []),
    ],
```

并在 `prePackage` hook 里追加：

```js
if (platform === 'darwin' && arch === 'arm64') {
  execFileSync('node', ['./scripts/stage-local-ai-assets.mjs'], {
    cwd: __dirname,
    stdio: 'inherit',
  });
}
```

- [ ] **Step 4: 把 macOS 发布工作流补成“带本地 AI 资源”的 arm64 产物**

在 `.github/workflows/release-desktop-platform.yml` 的 macOS arm64 job 中加入：

```yaml
- name: Verify bundled local AI assets
  if: runner.os == 'macOS' && matrix.arch == 'arm64'
  run: |
    test -f packages/frontend/apps/electron/resources/local-ai/bin/llama-server
    test -f packages/frontend/apps/electron/resources/local-ai/models/gemma-3-4b-it.gguf

- name: Build macOS desktop with bundled local AI
  if: runner.os == 'macOS' && matrix.arch == 'arm64'
  run: |
    yarn workspace @affine/electron make
```

- [ ] **Step 5: 把开发者文档补齐，写清楚资源布局与验收命令**

在 `docs/building-desktop-client-app.md` 中追加这一段：

````md
## Bundled local AI resources for Apple Silicon builds

Apple Silicon macOS builds now bundle a local Gemma runtime for desktop chat-first AI flows.

Expected staged resources:

- `packages/frontend/apps/electron/resources/local-ai/bin/llama-server`
- `packages/frontend/apps/electron/resources/local-ai/models/gemma-3-4b-it.gguf`

Before packaging, run:

```bash
node packages/frontend/apps/electron/scripts/stage-local-ai-assets.mjs
```

After producing the `.app`, verify:

```bash
APP_PATH="out/AFFiNE-darwin-arm64/AFFiNE.app"
test -f "$APP_PATH/Contents/Resources/local-ai/bin/llama-server"
test -f "$APP_PATH/Contents/Resources/local-ai/models/gemma-3-4b-it.gguf"
spctl --assess --type exec -vv "$APP_PATH"
```
````

- [ ] **Step 6: 运行打包与验收命令，确认本地 AI 资源真的随 `.app` 交付**

Run: `node packages/frontend/apps/electron/scripts/stage-local-ai-assets.mjs`

Expected: 输出 `[local-ai] staged resources into .../resources/local-ai`。

Run: `yarn workspace @affine/electron package`

Expected: `out/.../AFFiNE.app/Contents/Resources/local-ai/...` 存在。

Run: `spctl --assess --type exec -vv "out/AFFiNE-darwin-arm64/AFFiNE.app"`

Expected: Gatekeeper assessment passes。

- [ ] **Step 7: 提交打包、CI 与文档更新**

```bash
git add packages/frontend/apps/electron/scripts/stage-local-ai-assets.mjs \
  packages/frontend/apps/electron/forge.config.mjs \
  .github/workflows/release-desktop-platform.yml \
  docs/building-desktop-client-app.md
git commit -m "build: bundle local gemma assets for macos"
```

---

## 最终联调顺序

- [ ] 运行 helper/core/electron 的定向测试：

```bash
yarn test packages/frontend/apps/electron/src/helper/local-ai/status.spec.ts --runInBand
yarn test packages/frontend/apps/electron/src/helper/local-ai/model-assets.spec.ts --runInBand
yarn test packages/frontend/core/src/blocksuite/ai/runtime/request/desktop-route-policy.spec.ts --runInBand
yarn test packages/frontend/core/src/blocksuite/ai/runtime/request/local-runtime-client.spec.ts --runInBand
yarn test packages/frontend/core/src/blocksuite/ai/runtime/request/service.spec.ts --runInBand
yarn test packages/frontend/core/src/modules/ai-button/services/catalog.spec.ts --runInBand
```

Expected: 全部 PASS。

- [ ] 启动桌面开发环境，验证两个入口都还是走共享 chat runtime：

```bash
yarn dev
```

Expected:

- pagedoc `/ Ask AI` 选 Gemma 时优先走本地。
- edgeless 选区 Ask AI 选 Gemma 时优先走本地。
- local runtime 故障时，模型菜单显示 `Cloud fallback`，请求仍然可完成。

- [ ] 打包 arm64 macOS 产物并做资源检查：

```bash
node packages/frontend/apps/electron/scripts/stage-local-ai-assets.mjs
yarn workspace @affine/electron package
APP_PATH="out/AFFiNE-darwin-arm64/AFFiNE.app"
test -f "$APP_PATH/Contents/Resources/local-ai/bin/llama-server"
test -f "$APP_PATH/Contents/Resources/local-ai/models/gemma-3-4b-it.gguf"
spctl --assess --type exec -vv "$APP_PATH"
```

Expected:

- `.app` 自带 sidecar 和模型。
- Gatekeeper 校验通过。
- 不需要额外下载模型就能启动本地 AI。

---

## 范围边界（本计划刻意不做）

- 不在首轮打穿服务器侧 `lane-router.ts` / `local-inference.ts`。
- 不在首轮支持非 chat action 的本地执行。
- 不在首轮承诺本地 transcript / indexing / image generation。
- 不在首轮支持 retry 的本地无状态复现；retry 先走 server fallback。

这四条边界和设计 spec 保持一致，避免首轮把问题扩大成完整多 provider / 多 lane 平台重构。
