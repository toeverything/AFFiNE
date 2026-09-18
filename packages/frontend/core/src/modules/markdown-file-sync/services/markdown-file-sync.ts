import { notify } from '@affine/component';
import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';
import { OnEvent, Service } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { Subject } from 'rxjs';

import type { DesktopApiService } from '../../desktop-api';
import type { DocsService } from '../../doc';
import type { GlobalContextService } from '../../global-context';
import { ApplicationStarted } from '../../lifecycle';
import type { WorkbenchService } from '../../workbench';
import {
  getAFFiNEWorkspaceSchema,
  type WorkspaceService,
} from '../../workspace';
import {
  getMarkdownImportComplexity,
  replaceDocWithMarkdown,
  replaceDocWithPlainTextMarkdown,
  shouldUsePlainTextMarkdownImport,
} from './markdown-doc-replace';

type MarkdownOpenRequest = {
  requestId: string;
  filePath: string;
};

export type MarkdownFileBinding = {
  filePath: string;
  workspaceId: string;
  docId: string;
  title: string;
  lastContentHash: string;
};

const routeRequests$ = new Subject<{
  workspaceId: string;
  docId: string;
}>();
const pendingOpenRequestRetryDelays = [0, 250, 750, 1500, 3000];
const plainTextMarkdownBindingHashPrefix = 'plain-text-preview-v3:';

function logMarkdownFileSync(
  message: string,
  payload?: Record<string, unknown>
) {
  console.info(`[markdown-file-sync] ${message}`, payload);
}

export function subscribeMarkdownFileRouteRequests(
  handler: (request: { workspaceId: string; docId: string }) => void
) {
  const sub = routeRequests$.subscribe(handler);
  return () => sub.unsubscribe();
}

function getMarkdownTitle(filePath: string) {
  const fileName = filePath.split(/[\\/]/).pop() ?? 'Untitled';
  return fileName.replace(/\.(md|markdown)$/i, '') || 'Untitled';
}

export async function hashMarkdownContent(content: string) {
  const cryptoImpl = globalThis.crypto;
  if (cryptoImpl?.subtle) {
    const digest = await cryptoImpl.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(content)
    );
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash * 31 + content.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

async function getMarkdownBindingHash(content: string) {
  const hash = await hashMarkdownContent(content);
  return shouldUsePlainTextMarkdownImport(content)
    ? `${plainTextMarkdownBindingHashPrefix}${hash}`
    : hash;
}

export function isPlainTextMarkdownBinding(
  binding?: Pick<MarkdownFileBinding, 'lastContentHash'> | null
) {
  return (
    binding?.lastContentHash.startsWith(plainTextMarkdownBindingHashPrefix) ??
    false
  );
}

@OnEvent(ApplicationStarted, service => service.setup)
export class MarkdownFileSyncService extends Service {
  private readonly contentHashes = new Map<string, string>();
  private readonly externalReplaceInProgress = new Map<string, number>();
  private setupStarted = false;

  constructor(
    private readonly desktopApi: DesktopApiService,
    private readonly docsService: DocsService,
    private readonly workspaceService: WorkspaceService,
    private readonly workbenchService: WorkbenchService,
    private readonly globalContextService: GlobalContextService
  ) {
    super();
  }

  private openMarkdownDoc(docId: string, replaceHistory = false) {
    this.workbenchService.workbench.openDoc(
      {
        docId,
        refreshKey: nanoid(),
      },
      {
        at: 'active',
        replaceHistory,
      }
    );
  }

  setup() {
    if (this.setupStarted) {
      logMarkdownFileSync(
        'setup already started; processing pending requests',
        {
          workspaceId: this.workspaceService.workspace.id,
        }
      );
      this.schedulePendingOpenRequestRetries();
      return;
    }
    this.setupStarted = true;
    logMarkdownFileSync('setup started', {
      workspaceId: this.workspaceService.workspace.id,
    });

    const unsubscribe = this.desktopApi.events.markdownFile.onOpenRequest(
      () => {
        logMarkdownFileSync('received open request event', {
          workspaceId: this.workspaceService.workspace.id,
        });
        this.processPendingOpenRequests().catch(console.error);
      }
    );
    this.disposables.push(unsubscribe);
    const unsubscribeContentChanged =
      this.desktopApi.events.markdownFile.onContentChanged(payload => {
        this.handleContentChanged(payload).catch(console.error);
      });
    this.disposables.push(unsubscribeContentChanged);
    const unsubscribeFileUnavailable =
      this.desktopApi.events.markdownFile.onFileUnavailable(payload => {
        this.handleFileUnavailable(payload);
      });
    this.disposables.push(unsubscribeFileUnavailable);
    this.schedulePendingOpenRequestRetries();
  }

  private schedulePendingOpenRequestRetries() {
    for (const delay of pendingOpenRequestRetryDelays) {
      const timer = setTimeout(() => {
        this.processPendingOpenRequests().catch(console.error);
      }, delay);
      this.disposables.push(() => clearTimeout(timer));
    }
  }

  subscribeRouteRequests(
    handler: (request: { workspaceId: string; docId: string }) => void
  ) {
    return subscribeMarkdownFileRouteRequests(handler);
  }

  async processPendingOpenRequests() {
    if (!(await this.desktopApi.handler.ui.isActiveTab())) {
      logMarkdownFileSync('skipped pending requests: inactive tab', {
        workspaceId: this.workspaceService.workspace.id,
      });
      return;
    }
    if (
      this.globalContextService.globalContext.workspaceId.get() !==
      this.workspaceService.workspace.id
    ) {
      logMarkdownFileSync('skipped pending requests: workspace mismatch', {
        serviceWorkspaceId: this.workspaceService.workspace.id,
        globalWorkspaceId:
          this.globalContextService.globalContext.workspaceId.get(),
      });
      return;
    }

    const requests =
      await this.desktopApi.handler.markdownFile.getPendingOpenRequests();
    logMarkdownFileSync('loaded pending requests', {
      workspaceId: this.workspaceService.workspace.id,
      count: requests.length,
    });
    for (const request of requests) {
      const claimed =
        await this.desktopApi.handler.markdownFile.claimOpenRequest(
          request.requestId
        );
      if (!claimed) {
        continue;
      }

      logMarkdownFileSync('processing open request', {
        workspaceId: this.workspaceService.workspace.id,
        requestId: claimed.requestId,
        filePath: claimed.filePath,
      });
      await this.processOpenRequest(claimed);
    }
  }

  async processOpenRequest(request: MarkdownOpenRequest) {
    try {
      const existing = await this.desktopApi.handler.markdownFile.getBinding(
        request.filePath
      );
      if (existing) {
        const { content } = await this.desktopApi.handler.markdownFile.read(
          request.filePath
        );
        const nextHash = await getMarkdownBindingHash(content);
        if (
          existing.workspaceId === this.workspaceService.workspace.id &&
          existing.lastContentHash !== nextHash
        ) {
          const updatedBinding = await this.replaceExistingBindingContent({
            binding: existing,
            markdown: content,
            lastContentHash: nextHash,
          });
          await this.openExistingBinding(updatedBinding);
          await this.desktopApi.handler.markdownFile.completeOpenRequest({
            requestId: request.requestId,
            ...updatedBinding,
          });
          return;
        }
        await this.openExistingBinding(existing);
        await this.desktopApi.handler.markdownFile.completeOpenRequest({
          requestId: request.requestId,
          ...existing,
        });
        return;
      }

      const { content } = await this.desktopApi.handler.markdownFile.read(
        request.filePath
      );
      const title = getMarkdownTitle(request.filePath);
      const docId = await this.importMarkdownAsDoc({
        markdown: content,
        title,
        filePath: request.filePath,
      });
      if (!docId) {
        throw new Error('Failed to import Markdown file');
      }

      const binding: MarkdownFileBinding = {
        filePath: request.filePath,
        workspaceId: this.workspaceService.workspace.id,
        docId,
        title,
        lastContentHash: await getMarkdownBindingHash(content),
      };
      this.contentHashes.set(binding.filePath, binding.lastContentHash);
      await this.desktopApi.handler.markdownFile.completeOpenRequest({
        requestId: request.requestId,
        ...binding,
      });
      await this.desktopApi.handler.markdownFile.watch(request.filePath);
      this.openMarkdownDoc(docId);
      logMarkdownFileSync('imported markdown file', {
        workspaceId: binding.workspaceId,
        docId,
        filePath: binding.filePath,
      });
    } catch (error) {
      await this.desktopApi.handler.markdownFile.failOpenRequest(
        request.requestId,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  private async importMarkdownToNewDoc(options: {
    markdown: string;
    title: string;
  }) {
    const docRecord = this.docsService.createDoc({
      title: options.title,
    });
    await replaceDocWithMarkdown({
      workspace: this.workspaceService.workspace,
      docId: docRecord.id,
      markdown: options.markdown,
    });
    return docRecord.id;
  }

  private async importMarkdownAsDoc(options: {
    markdown: string;
    title: string;
    filePath?: string;
  }) {
    if (shouldUsePlainTextMarkdownImport(options.markdown)) {
      const complexity = getMarkdownImportComplexity(options.markdown);
      logMarkdownFileSync('using plain-text markdown compatibility import', {
        title: options.title,
        ...complexity,
      });
      return this.importMarkdownAsPlainTextDoc(options);
    }

    return MarkdownTransformer.importMarkdownToDoc({
      collection: this.workspaceService.workspace.docCollection,
      schema: getAFFiNEWorkspaceSchema(),
      markdown: options.markdown,
      fileName: options.title,
      extensions: getStoreManager().config.init().value.get('store'),
    }).then(importedDocId => {
      if (importedDocId) {
        return importedDocId;
      }
      return this.importMarkdownToNewDoc(options);
    });
  }

  private async importMarkdownAsPlainTextDoc(options: {
    markdown: string;
    title: string;
    filePath?: string;
  }) {
    const docRecord = this.docsService.createDoc({
      title: options.title,
    });
    await replaceDocWithPlainTextMarkdown({
      workspace: this.workspaceService.workspace,
      docId: docRecord.id,
      markdown: options.markdown,
      sourceFilePath: options.filePath,
    });
    return docRecord.id;
  }

  private async replaceExistingBindingContent(options: {
    binding: MarkdownFileBinding;
    markdown: string;
    lastContentHash: string;
  }) {
    this.incrementExternalReplace(options.binding.docId);
    try {
      if (shouldUsePlainTextMarkdownImport(options.markdown)) {
        await replaceDocWithPlainTextMarkdown({
          workspace: this.workspaceService.workspace,
          docId: options.binding.docId,
          markdown: options.markdown,
          sourceFilePath: options.binding.filePath,
        });
      } else {
        await replaceDocWithMarkdown({
          workspace: this.workspaceService.workspace,
          docId: options.binding.docId,
          markdown: options.markdown,
        });
      }
    } finally {
      this.decrementExternalReplace(options.binding.docId);
    }

    this.contentHashes.set(options.binding.filePath, options.lastContentHash);
    const updatedBinding = {
      ...options.binding,
      lastContentHash: options.lastContentHash,
    };
    await this.desktopApi.handler.markdownFile.updateBinding(updatedBinding);
    logMarkdownFileSync('replaced existing markdown binding content', {
      workspaceId: options.binding.workspaceId,
      docId: options.binding.docId,
      filePath: options.binding.filePath,
    });

    return updatedBinding;
  }

  private async openExistingBinding(binding: MarkdownFileBinding) {
    this.contentHashes.set(binding.filePath, binding.lastContentHash);
    if (binding.workspaceId === this.workspaceService.workspace.id) {
      this.openMarkdownDoc(binding.docId);
      logMarkdownFileSync('opened existing binding', {
        workspaceId: binding.workspaceId,
        docId: binding.docId,
        filePath: binding.filePath,
      });
      return;
    }

    routeRequests$.next({
      workspaceId: binding.workspaceId,
      docId: binding.docId,
    });
  }

  async handleContentChanged(payload: {
    filePath: string;
    content?: string;
    mtimeMs: number;
  }) {
    const binding = await this.desktopApi.handler.markdownFile.getBinding(
      payload.filePath
    );
    if (
      !binding ||
      binding.workspaceId !== this.workspaceService.workspace.id
    ) {
      return;
    }

    const content =
      payload.content ??
      (await this.desktopApi.handler.markdownFile.read(payload.filePath))
        .content;
    const nextHash = await getMarkdownBindingHash(content);
    const currentHash =
      this.contentHashes.get(payload.filePath) ?? binding.lastContentHash;
    if (nextHash === currentHash) {
      return;
    }

    const updatedBinding = await this.replaceExistingBindingContent({
      binding,
      markdown: content,
      lastContentHash: nextHash,
    });
    if (!isPlainTextMarkdownBinding(updatedBinding)) {
      this.openMarkdownDoc(updatedBinding.docId, true);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.markdownFileSyncTick = String(
        Date.now()
      );
      document.body.getBoundingClientRect();
    }
    await this.desktopApi.handler.markdownFile.syncRendered({
      filePath: payload.filePath,
      docId: updatedBinding.docId,
      mtimeMs: payload.mtimeMs,
    });
  }

  async writeMarkdownBindingContent(
    binding: MarkdownFileBinding,
    markdown: string,
    expectedMtimeMs?: number
  ) {
    const nextHash = await getMarkdownBindingHash(markdown);
    const currentHash =
      this.contentHashes.get(binding.filePath) ?? binding.lastContentHash;
    if (nextHash === currentHash) {
      return;
    }

    const writeResult = await this.desktopApi.handler.markdownFile.write(
      binding.filePath,
      markdown,
      expectedMtimeMs
    );
    this.contentHashes.set(binding.filePath, nextHash);
    await this.desktopApi.handler.markdownFile.updateBinding({
      ...binding,
      lastContentHash: nextHash,
    });
    await this.desktopApi.handler.markdownFile.syncRendered({
      filePath: binding.filePath,
      docId: binding.docId,
      mtimeMs: writeResult.mtimeMs,
    });
  }

  hashContentForTesting(content: string) {
    return hashMarkdownContent(content);
  }

  shouldIgnoreExternalReplaceWriteback(docId: string) {
    return (this.externalReplaceInProgress.get(docId) ?? 0) > 0;
  }

  private incrementExternalReplace(docId: string) {
    this.externalReplaceInProgress.set(
      docId,
      (this.externalReplaceInProgress.get(docId) ?? 0) + 1
    );
  }

  private decrementExternalReplace(docId: string) {
    const nextCount = (this.externalReplaceInProgress.get(docId) ?? 0) - 1;
    if (nextCount > 0) {
      this.externalReplaceInProgress.set(docId, nextCount);
      return;
    }
    this.externalReplaceInProgress.delete(docId);
  }

  handleFileUnavailable(payload: {
    filePath: string;
    reason: 'deleted' | 'unreadable';
  }) {
    notify.warning({
      title: 'Markdown file sync paused',
      message: payload.filePath,
    });
    logMarkdownFileSync('kept paused markdown binding for recovery', {
      filePath: payload.filePath,
      reason: payload.reason,
    });
  }
}
