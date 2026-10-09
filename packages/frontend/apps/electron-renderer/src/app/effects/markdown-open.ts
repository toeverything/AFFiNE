import { notify } from '@affine/component';
import { router } from '@affine/core/desktop/router';
import { GlobalDialogService } from '@affine/core/modules/dialogs';
import { DocsService } from '@affine/core/modules/doc';
import { WorkspacesService } from '@affine/core/modules/workspace';
import {
  getDiskSyncEnabled,
  getDiskSyncFolderPath,
  getDiskSyncSourceFilePath,
  setDiskSyncEnabled,
  setDiskSyncFolderPath,
  setDiskSyncSourceFilePath,
} from '@affine/core/modules/workspace-engine/impls/disk-config';
import { apis, events } from '@affine/electron-api';
import type { FrameworkProvider } from '@toeverything/infra';
import { filter, firstValueFrom, fromEvent, takeUntil } from 'rxjs';

import {
  findWorkspaceForMarkdownFile,
  getMarkdownParentDirectory,
  getWorkspaceIdFromDiskSession,
  markdownPathsEqual,
  workspaceNeedsMarkdownSource,
} from './markdown-open-path';
import { waitForMarkdownDocumentSync } from './markdown-open-sync';

type MarkdownOpenRequest = {
  requestId: string;
  filePath: string;
};

function configuredWorkspaceFolders(frameworkProvider: FrameworkProvider) {
  const workspaces =
    frameworkProvider.get(WorkspacesService).list.workspaces$.value;
  return workspaces
    .filter(workspace => workspace.flavour === 'local')
    .flatMap(workspace => {
      const folderPath = getDiskSyncFolderPath(workspace.id);
      return folderPath
        ? [
            {
              workspaceId: workspace.id,
              folderPath,
              sourceFile: getDiskSyncSourceFilePath(workspace.id),
            },
          ]
        : [];
    });
}

export function setupMarkdownOpenEvents(frameworkProvider: FrameworkProvider) {
  const pending = new Map<string, MarkdownOpenRequest>();
  const awaitingDiscovery = new Map<string, MarkdownOpenRequest>();
  const openingRequests = new Set<string>();
  const activeDocuments = new Map<
    string,
    { request: MarkdownOpenRequest; timeout: ReturnType<typeof setTimeout> }
  >();
  let activeDialogRequestId: string | null = null;

  const documentKey = (workspaceId: string, docId: string) =>
    `${workspaceId}:${docId}`;

  const complete = async (requestId: string) => {
    pending.delete(requestId);
    awaitingDiscovery.delete(requestId);
    await apis?.markdownOpen.complete(requestId);
  };

  const completeAndContinue = async (requestId: string) => {
    try {
      await complete(requestId);
    } catch (error) {
      console.error('Failed to complete Markdown request:', error);
    } finally {
      processNextUnboundRequest();
    }
  };

  const openResolvedMarkdown = async (
    request: MarkdownOpenRequest,
    workspaceId: string,
    docId: string
  ) => {
    if (openingRequests.has(request.requestId)) {
      return;
    }
    openingRequests.add(request.requestId);

    try {
      await waitForMarkdownDocumentSync(
        id =>
          frameworkProvider
            .get(WorkspacesService)
            .openByWorkspaceId(id, 'local'),
        workspaceId,
        docId,
        async (workspace, targetDocId, abort) => {
          await firstValueFrom(
            workspace.scope
              .get(DocsService)
              .list.doc$(targetDocId)
              .pipe(filter(Boolean), takeUntil(fromEvent(abort, 'abort')))
          );
          if (abort.aborted) {
            throw abort.reason;
          }
        },
        path => router.navigate(path)
      );
      const key = documentKey(workspaceId, docId);
      const previous = activeDocuments.get(key);
      if (previous) {
        clearTimeout(previous.timeout);
      }
      activeDocuments.set(key, {
        request,
        timeout: setTimeout(() => activeDocuments.delete(key), 60_000),
      });
      await complete(request.requestId);
    } catch (error) {
      console.error('Failed to open Markdown file:', error);
      notify.error({
        title: 'Failed to open Markdown file',
        message: request.filePath,
      });
      await complete(request.requestId);
    } finally {
      openingRequests.delete(request.requestId);
      processNextUnboundRequest();
    }
  };

  const resolveExistingBinding = async (
    request: MarkdownOpenRequest,
    workspaceId: string,
    syncFolder: string
  ) => {
    for (let attempt = 0; attempt < 240; attempt++) {
      if (
        !pending.has(request.requestId) ||
        openingRequests.has(request.requestId)
      ) {
        return;
      }
      const docId = await apis?.diskSync.resolveSourceDocId(
        workspaceId,
        syncFolder,
        request.filePath
      );
      if (docId) {
        await openResolvedMarkdown(request, workspaceId, docId);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    if (
      pending.has(request.requestId) &&
      !openingRequests.has(request.requestId)
    ) {
      notify.error({
        title: 'Failed to open Markdown file',
        message: 'The synced document was not found.',
      });
      await complete(request.requestId);
      processNextUnboundRequest();
    }
  };

  function processNextUnboundRequest() {
    if (activeDialogRequestId) {
      return;
    }
    const request = [...pending.values()].find(
      item => !awaitingDiscovery.has(item.requestId)
    );
    if (!request) {
      return;
    }

    if (getDiskSyncEnabled()) {
      const workspaceId = findWorkspaceForMarkdownFile(
        request.filePath,
        configuredWorkspaceFolders(frameworkProvider)
      );
      if (workspaceId) {
        awaitingDiscovery.set(request.requestId, request);
        const syncFolder = getDiskSyncFolderPath(workspaceId);
        const sourceFile = getDiskSyncSourceFilePath(workspaceId);
        if (syncFolder) {
          if (workspaceNeedsMarkdownSource(request.filePath, sourceFile)) {
            void Promise.resolve(
              setDiskSyncSourceFilePath(workspaceId, request.filePath)
            )
              .then(() => router.navigate(`/workspace/${workspaceId}/all`))
              .then(() => window.location.reload())
              .catch(async (error: unknown) => {
                awaitingDiscovery.delete(request.requestId);
                console.error('Failed to select Markdown source file:', error);
                notify.error({
                  title: 'Failed to open Markdown file',
                  message: request.filePath,
                });
                await completeAndContinue(request.requestId);
              });
            return;
          }
          void router
            .navigate(`/workspace/${workspaceId}/all`)
            .then(() =>
              resolveExistingBinding(request, workspaceId, syncFolder)
            )
            .catch(async error => {
              console.error('Failed to open Markdown workspace:', error);
              notify.error({
                title: 'Failed to open Markdown file',
                message: request.filePath,
              });
              await completeAndContinue(request.requestId);
            });
        }
        return;
      }
    }

    activeDialogRequestId = request.requestId;
    const folderPath = getMarkdownParentDirectory(request.filePath);
    frameworkProvider
      .get(GlobalDialogService)
      .open(
        'bind-markdown-folder',
        { filePath: request.filePath, folderPath },
        result => {
          activeDialogRequestId = null;
          if (!result) {
            void complete(request.requestId)
              .catch(error => {
                console.error('Failed to complete Markdown request:', error);
              })
              .finally(processNextUnboundRequest);
            return;
          }

          void Promise.all([
            setDiskSyncFolderPath(result.workspaceId, folderPath),
            setDiskSyncSourceFilePath(result.workspaceId, request.filePath),
            setDiskSyncEnabled(true),
          ])
            .then(() => router.navigate(`/workspace/${result.workspaceId}/all`))
            .then(() => window.location.reload())
            .catch(async error => {
              console.error('Failed to configure Markdown workspace:', error);
              notify.error({
                title: 'Failed to open Markdown file',
                message: request.filePath,
              });
              await completeAndContinue(request.requestId);
            });
        }
      );
  }

  const acceptRequest = (request: MarkdownOpenRequest) => {
    pending.set(request.requestId, request);
    processNextUnboundRequest();
  };

  events?.markdownOpen.onOpenRequest(acceptRequest);

  events?.diskSync.onEvent(payload => {
    const { event, sessionId } = payload;
    const workspaceId = getWorkspaceIdFromDiskSession(sessionId);
    if (!workspaceId) {
      return;
    }

    if (event.type === 'error' && event.docId) {
      const key = documentKey(workspaceId, event.docId);
      const active = activeDocuments.get(key);
      if (!active) {
        return;
      }
      clearTimeout(active.timeout);
      activeDocuments.delete(key);
      notify.error({
        title: 'Failed to open Markdown file',
        message: event.message,
      });
      void router.navigate(`/workspace/${workspaceId}/all`).catch(error => {
        console.error('Failed to leave broken Markdown document:', error);
      });
      return;
    }

    if (event.type === 'doc-update') {
      const key = documentKey(workspaceId, event.update.docId);
      const active = activeDocuments.get(key);
      if (active) {
        clearTimeout(active.timeout);
        activeDocuments.delete(key);
      }
      return;
    }

    if (event.type !== 'source-discovered' || !event.filePath) {
      return;
    }

    const filePath = event.filePath;
    const request = [...awaitingDiscovery.values()].find(item =>
      markdownPathsEqual(item.filePath, filePath)
    );
    if (!request) {
      return;
    }

    const configuredWorkspaceId = findWorkspaceForMarkdownFile(
      request.filePath,
      configuredWorkspaceFolders(frameworkProvider)
    );
    if (configuredWorkspaceId !== workspaceId) {
      return;
    }

    const syncFolder = getDiskSyncFolderPath(workspaceId);
    if (!syncFolder) {
      return;
    }

    // Resolve from the requested absolute path instead of trusting whichever
    // document id happened to arrive with a folder scan event.
    void resolveExistingBinding(request, workspaceId, syncFolder).catch(
      error => {
        console.error('Failed to resolve Markdown open request:', error);
      }
    );
  });

  apis?.markdownOpen
    .getPending()
    .then(requests => requests.forEach(acceptRequest))
    .catch(error => {
      console.error('Failed to restore Markdown open requests:', error);
    });
}
