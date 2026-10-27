import { notify } from '@affine/component';
import { ServersService } from '@affine/core/modules/cloud';
import {
  ImportClipperService,
  type ShareDestinationOptions,
} from '@affine/core/modules/import-clipper';
import {
  type WorkspaceMetadata,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { ServerDeploymentType } from '@affine/graphql';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SharePreviewRouteOwner } from './preview-route-owner';
import type {
  PendingShareItem,
  ShareImportTarget,
  ShareInboxEntry,
  ShareInboxProvider,
  ShareWorkspaceMode,
} from './types';

type Page = 'main' | 'workspace' | 'tags' | 'collection' | 'offline';

interface ShareDestinationSelection {
  itemId: string;
  workspaceKey: string;
  tagIds: string[];
  collectionId: string;
}

type ShareImportOutcome = 'pending' | 'completion-failed' | 'completed';

const workspaceKey = (workspace: WorkspaceMetadata) =>
  `${workspace.flavour}:${workspace.id}`;

const selectionFromItem = (
  item: PendingShareItem
): ShareDestinationSelection => ({
  itemId: item.id,
  workspaceKey: item.target
    ? `${item.target.workspaceFlavour}:${item.target.workspaceId}`
    : '',
  tagIds: item.target?.tagIds ?? [],
  collectionId: item.target?.collectionId ?? '',
});

const reconcileShareDestinationSelection = (
  current: ShareDestinationSelection | undefined,
  item: PendingShareItem
) => (current?.itemId === item.id ? current : selectionFromItem(item));

export function useShareImport(provider: ShareInboxProvider) {
  const workspacesService = useService(WorkspacesService);
  const serversService = useService(ServersService);
  const importer = useService(ImportClipperService);
  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const servers = useLiveData(serversService.servers$);
  const accounts = useLiveData(serversService.serversWithAccount$);
  useEffect(() => {
    const update = () => {
      const types = servers.map(server => server.config$.value?.type);
      const mode: ShareWorkspaceMode = types.includes(
        ServerDeploymentType.Selfhosted
      )
        ? 'selfHostedPresent'
        : types.some(type => !type)
          ? 'unknown'
          : accounts.some(({ account }) => !!account)
            ? 'cloudOnly'
            : 'signedOut';
      void provider.updateWorkspaceMode(mode).catch(console.error);
    };
    update();
    const subscriptions = servers.map(server =>
      server.config$.subscribe(update)
    );
    return () =>
      subscriptions.forEach(subscription => subscription.unsubscribe());
  }, [accounts, provider, servers]);
  const [entry, setEntry] = useState<ShareInboxEntry>();
  const item = entry?.status === 'ready' ? entry.item : undefined;
  const [page, setPage] = useState<Page>('main');
  const [selection, setSelection] = useState<ShareDestinationSelection>();
  const [destinations, setDestinations] = useState<ShareDestinationOptions>();
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<string>();
  const attachmentRef = useRef<{ itemId: string; file: File } | undefined>(
    undefined
  );
  const attachmentGeneration = useRef(0);
  const refreshing = useRef(false);
  const refreshRequested = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const importOperations = useRef(
    new Map<string, Promise<ShareImportOutcome>>()
  );
  const itemId = item?.id;
  const activeItemIdRef = useRef(itemId);
  activeItemIdRef.current = itemId;
  const previewOwnerRef = useRef<
    | {
        itemId: string;
        owner: SharePreviewRouteOwner;
      }
    | undefined
  >(undefined);
  if (item && previewOwnerRef.current?.itemId !== item.id) {
    previewOwnerRef.current = {
      itemId: item.id,
      owner: new SharePreviewRouteOwner(item),
    };
  }
  const previewOwnerEntry = previewOwnerRef.current;
  const previewOwner =
    previewOwnerEntry && previewOwnerEntry.itemId === item?.id
      ? previewOwnerEntry.owner
      : undefined;

  const activeSelection = selection?.itemId === itemId ? selection : undefined;
  const selectedWorkspaceKey = activeSelection?.workspaceKey ?? '';
  const selectedWorkspace = workspaces.find(
    workspace => workspaceKey(workspace) === selectedWorkspaceKey
  );
  const selectedPreviewServer = servers.find(
    server => server.id === selectedWorkspace?.flavour
  );
  const selectedPreviewServerConfig = useLiveData(
    selectedPreviewServer?.config$
  );
  const selectedWorkspaceAvailable = !!selectedWorkspace;
  const selectedWorkspaceName = selectedWorkspace
    ? workspacesService.getProfile(selectedWorkspace).name$.value ||
      selectedWorkspace.id
    : undefined;
  const setManualItem = useCallback((next: PendingShareItem) => {
    const isCurrentItem = activeItemIdRef.current === next.id;
    activeItemIdRef.current = next.id;
    setEntry({ status: 'ready', item: next });
    if (!isCurrentItem) setPage('main');
    setSelection(current => reconcileShareDestinationSelection(current, next));
  }, []);
  const updateSelection = useCallback(
    (
      update: (current: ShareDestinationSelection) => ShareDestinationSelection
    ) => {
      setSelection(current => {
        if (!current || current.itemId !== itemId) return current;
        return update(current);
      });
    },
    [itemId]
  );

  const performImportItem = useCallback(
    async (
      pending: PendingShareItem,
      target: ShareImportTarget,
      allowOffline: boolean
    ) => {
      await provider.updateTarget(pending.id, target);
      const workspace = workspacesService.list.workspaces$.value.find(
        metadata =>
          metadata.id === target.workspaceId &&
          metadata.flavour === target.workspaceFlavour
      );
      if (!workspace) {
        await provider.setError(pending.id, 'workspace-not-found');
        return 'pending' as const;
      }
      const attachment =
        pending.content.kind === 'image' || pending.content.kind === 'pdf'
          ? attachmentRef.current?.itemId === pending.id
            ? attachmentRef.current.file
            : await provider.resolveAttachment(pending.id)
          : undefined;
      if (
        (pending.content.kind === 'image' || pending.content.kind === 'pdf') &&
        !attachment
      ) {
        await provider.setError(pending.id, 'attachment-missing');
        return 'pending' as const;
      }
      const result = await importer.importShareToWorkspace(
        workspace,
        {
          documentId: pending.documentId,
          importAttemptId: pending.importAttemptId,
          title: pending.title,
          content: pending.content,
          attachment,
          tagIds: target.tagIds,
          collectionId: target.collectionId,
        },
        { allowOffline }
      );
      if (
        result.status !== 'imported' &&
        result.status !== 'committed-replay'
      ) {
        await provider.setError(pending.id, result.status);
        return 'pending' as const;
      }
      if (
        result.status === 'imported' &&
        result.warning === 'destination-not-found'
      ) {
        notify.warning({
          title:
            'Content saved. Some selected tags or the collection are no longer available.',
        });
      }
      try {
        await provider.complete(pending.id, result.docId);
      } catch {
        return 'completion-failed' as const;
      }
      return 'completed' as const;
    },
    [importer, provider, workspacesService]
  );

  const importItem = useCallback(
    async (
      pending: PendingShareItem,
      target: ShareImportTarget,
      allowOffline: boolean
    ) => {
      const existing = importOperations.current.get(pending.id);
      if (existing) {
        return { outcome: await existing, ownsOperation: false };
      }
      const operation = performImportItem(pending, target, allowOffline);
      importOperations.current.set(pending.id, operation);
      try {
        return { outcome: await operation, ownsOperation: true };
      } finally {
        if (importOperations.current.get(pending.id) === operation) {
          importOperations.current.delete(pending.id);
        }
      }
    },
    [performImportItem]
  );

  const refresh = useCallback(async () => {
    if (refreshing.current) {
      refreshRequested.current = true;
      return;
    }
    refreshing.current = true;
    try {
      const pending = await provider.listPending();
      let importedCount = 0;
      let nextEntry: ShareInboxEntry | undefined;
      for (const candidate of pending) {
        if (candidate.status === 'unsupported-version') {
          nextEntry = candidate;
          break;
        }
        const pendingItem = candidate.item;
        if (pendingItem.target && !pendingItem.lastError) {
          const { outcome, ownsOperation } = await importItem(
            pendingItem,
            pendingItem.target,
            false
          );
          if (outcome === 'completed') {
            if (ownsOperation) importedCount += 1;
            continue;
          }
          if (outcome === 'completion-failed') {
            nextEntry = {
              status: 'ready',
              item: { ...pendingItem, lastError: 'completion-failed' },
            };
            break;
          }
          const latest = await provider.listPending();
          nextEntry = latest.find(
            entry =>
              entry.status === 'ready' && entry.item.id === pendingItem.id
          );
          break;
        }
        nextEntry = candidate;
        break;
      }
      if (importedCount > 0) {
        notify.success({
          title: `${importedCount} shared ${importedCount === 1 ? 'item' : 'items'} saved`,
        });
      }
      if (nextEntry?.status === 'ready') {
        setManualItem(nextEntry.item);
      } else if (nextEntry) {
        setEntry(nextEntry);
      } else {
        setEntry(undefined);
      }
    } finally {
      refreshing.current = false;
      if (refreshRequested.current) {
        refreshRequested.current = false;
        queueMicrotask(() => {
          void refreshRef.current().catch(console.error);
        });
      }
    }
  }, [importItem, provider, setManualItem]);

  refreshRef.current = refresh;

  useEffect(() => {
    const requestRefresh = () => {
      void refreshRef.current().catch(console.error);
    };
    requestRefresh();
    const handleRefresh = () => {
      requestRefresh();
    };
    window.addEventListener('affine:share-inbox', handleRefresh);
    return () =>
      window.removeEventListener('affine:share-inbox', handleRefresh);
  }, [provider]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const generation = ++attachmentGeneration.current;
    const expectedItemId = item?.id;
    setAttachmentPreview(undefined);
    if (item?.content.kind === 'image') {
      void provider
        .resolveAttachment(item.id)
        .then(file => {
          if (
            !file ||
            !active ||
            attachmentGeneration.current !== generation ||
            activeItemIdRef.current !== expectedItemId
          ) {
            return;
          }
          attachmentRef.current = { itemId: item.id, file };
          objectUrl = URL.createObjectURL(file);
          setAttachmentPreview(objectUrl);
        })
        .catch(console.error);
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (attachmentRef.current?.itemId === item?.id) {
        attachmentRef.current = undefined;
      }
    };
  }, [item?.content.kind, item?.id, provider]);

  useEffect(() => {
    if (!selectedWorkspaceKey) {
      setDestinations(undefined);
      setIsLoadingDestinations(false);
      return;
    }
    const workspace = workspacesService.list.workspaces$.value.find(
      workspace => workspaceKey(workspace) === selectedWorkspaceKey
    );
    if (!workspace) {
      setDestinations(undefined);
      setIsLoadingDestinations(false);
      return;
    }
    let active = true;
    setDestinations(undefined);
    setIsLoadingDestinations(true);
    void importer
      .getShareDestinationOptions(workspace)
      .then(async options => {
        if (!active) return;
        if (!options) {
          if (itemId) {
            await provider.setError(itemId, 'workspace-not-found');
            setEntry(current =>
              current?.status === 'ready' &&
              current.item.id === itemId &&
              current.item.lastError !== 'workspace-not-found'
                ? {
                    status: 'ready',
                    item: {
                      ...current.item,
                      lastError: 'workspace-not-found',
                    },
                  }
                : current
            );
          }
          return;
        }
        setDestinations(options);
        const validTags = new Set(options.tags.map(tag => tag.id));
        updateSelection(current => ({
          ...current,
          tagIds: current.tagIds.filter(id => validTags.has(id)),
          collectionId:
            current.collectionId &&
            options.collections.some(
              collection => collection.id === current.collectionId
            )
              ? current.collectionId
              : '',
        }));
      })
      .catch(console.error)
      .finally(() => {
        if (active) setIsLoadingDestinations(false);
      });
    return () => {
      active = false;
    };
  }, [
    importer,
    itemId,
    provider,
    selectedWorkspaceKey,
    selectedWorkspaceAvailable,
    updateSelection,
    workspacesService,
  ]);

  const save = async (allowOffline: boolean) => {
    if (!item || !selectedWorkspace || isSaving) return;
    setIsSaving(true);
    try {
      let pendingItem = item;
      let target: ShareImportTarget = {
        workspaceId: selectedWorkspace.id,
        workspaceFlavour: selectedWorkspace.flavour,
        tagIds: activeSelection?.tagIds ?? [],
        collectionId: activeSelection?.collectionId || undefined,
      };
      if (item.lastError === 'completion-failed') {
        const latest = await provider.listPending();
        const retryEntry = latest.find(
          entry => entry.status === 'ready' && entry.item.id === item.id
        );
        if (!retryEntry || retryEntry.status !== 'ready') {
          setEntry(undefined);
          notify.success({ title: 'Shared content saved' });
          await refresh();
          return;
        }
        pendingItem = retryEntry.item;
        if (!pendingItem.target) {
          await refresh();
          return;
        }
        target = pendingItem.target;
      }
      const { outcome, ownsOperation } = await importItem(
        pendingItem,
        target,
        allowOffline
      );
      if (outcome === 'completed') {
        if (ownsOperation) notify.success({ title: 'Shared content saved' });
      } else if (outcome === 'completion-failed') {
        setManualItem({ ...item, lastError: 'completion-failed' });
        return;
      }
      await refresh();
    } finally {
      setIsSaving(false);
    }
  };

  return {
    entry,
    setEntry,
    item,
    page,
    setPage,
    activeSelection,
    destinations,
    isLoadingDestinations,
    isSaving,
    attachmentPreview,
    selectedWorkspace,
    selectedWorkspaceName,
    selectedWorkspaceKey,
    selectedPreviewServerConfig,
    previewOwner,
    servers,
    workspaces,
    workspacesService,
    updateSelection,
    save,
  };
}
