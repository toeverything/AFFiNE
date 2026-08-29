import { Button, Modal, notify, SafeArea, Scrollable } from '@affine/component';
import { type Server, ServersService } from '@affine/core/modules/cloud';
import {
  ImportClipperService,
  type ShareDestinationOptions,
} from '@affine/core/modules/import-clipper';
import {
  type WorkspaceMetadata,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { ImageIcon, LinkIcon, TextIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PageHeader } from '../page-header';
import { LinkPreview, resolveShareTitle } from './link-preview';
import {
  resolveShareWorkspaceMode,
  SharePreviewRouteOwner,
  type SharePreviewState,
} from './preview-route-owner';
import { SelectionPage, type SelectionPageOption } from './selection-page';
import * as styles from './style.css';
import type {
  PendingShareItem,
  ShareInboxEntry,
  ShareImportTarget,
  ShareInboxProvider,
} from './types';

export type { ShareInboxProvider } from './types';

type Page = 'main' | 'workspace' | 'tags' | 'collection' | 'offline';

interface ShareDestinationSelection {
  itemId: string;
  workspaceKey: string;
  tagIds: string[];
  collectionId: string;
}

const errorMessage = (error?: string) => {
  switch (error) {
    case 'workspace-not-found':
      return 'The selected workspace is no longer available. Choose another workspace.';
    case 'permission-denied':
      return 'You no longer have permission to create documents in this workspace.';
    case 'destination-not-found':
      return 'One or more selected tags or the collection no longer exist.';
    case 'offline-confirmation-required':
      return 'AFFiNE could not confirm the latest workspace state.';
    case 'attachment-missing':
      return 'The shared image is no longer available.';
    case 'import-conflict':
      return 'This share conflicts with an existing document and was not changed.';
    default:
      return undefined;
  }
};

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

const sourceDetails = (item: PendingShareItem) => {
  if (item.content.kind === 'url') {
    return {
      title: item.title,
      detail: item.content.url?.replace(/^https?:\/\//, '').split('/')[0],
    };
  }
  if (item.content.kind === 'image') {
    return {
      title: item.title,
      detail: item.attachments?.[0]?.fileName ?? 'Shared image',
    };
  }
  return {
    title: item.title,
    detail: `${item.content.text?.length ?? 0} characters`,
  };
};

export async function previewForImport(
  item: PendingShareItem,
  workspace: WorkspaceMetadata,
  current: SharePreviewState | undefined,
  currentOwner: SharePreviewRouteOwner | undefined,
  servers: Server[]
) {
  if (item.content.kind !== 'url') return undefined;
  const owner = currentOwner ?? new SharePreviewRouteOwner(item);
  owner.selectWorkspace(workspace, servers);
  const selectedWorkspaceKey = workspaceKey(workspace);
  const generation = owner.generation;
  if (
    current?.itemId === item.id &&
    current.workspaceKey === selectedWorkspaceKey &&
    current.generation === generation
  ) {
    return current.value;
  }
  const controller = new AbortController();
  const request = owner.load(controller.signal);
  if (!request) return undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const preview = await Promise.race([
      request.catch(() => undefined),
      new Promise<undefined>(resolve => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(undefined);
        }, 1200);
      }),
    ]);
    return owner.workspaceKey === selectedWorkspaceKey &&
      owner.generation === generation
      ? preview
      : undefined;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

const SourceIcon = ({
  kind,
}: {
  kind: PendingShareItem['content']['kind'];
}) => {
  switch (kind) {
    case 'url':
      return <LinkIcon />;
    case 'image':
      return <ImageIcon />;
    case 'text':
      return <TextIcon />;
  }
};

export const ShareImportController = ({
  provider,
}: {
  provider: ShareInboxProvider;
}) => {
  const workspacesService = useService(WorkspacesService);
  const serversService = useService(ServersService);
  const importer = useService(ImportClipperService);
  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const serverAccounts = useLiveData(serversService.serversWithAccount$);
  const servers = useLiveData(serversService.servers$);
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
  const [linkPreview, setLinkPreview] = useState<SharePreviewState>();
  const linkPreviewRef = useRef<SharePreviewState | undefined>(undefined);
  const refreshing = useRef(false);
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

  useEffect(() => {
    const signedIn = serverAccounts.filter(({ account }) => !!account);
    const mode = resolveShareWorkspaceMode(servers, signedIn.length > 0);
    void provider.updateWorkspaceMode(mode).catch(console.error);
  }, [provider, serverAccounts, servers]);

  const activeSelection = selection?.itemId === itemId ? selection : undefined;
  const selectedWorkspaceKey = activeSelection?.workspaceKey ?? '';
  const selectedWorkspace = workspaces.find(
    workspace => workspaceKey(workspace) === selectedWorkspaceKey
  );
  const selectedWorkspaceAvailable = !!selectedWorkspace;
  const selectedWorkspaceName = selectedWorkspace
    ? workspacesService.getProfile(selectedWorkspace).name$.value ||
      selectedWorkspace.id
    : undefined;
  const updateLinkPreview = useCallback(
    (next: SharePreviewState | undefined) => {
      if (
        next &&
        (next.itemId !== itemId || next.workspaceKey !== selectedWorkspaceKey)
      ) {
        return;
      }
      linkPreviewRef.current = next;
      setLinkPreview(next);
    },
    [itemId, selectedWorkspaceKey]
  );
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

  const importItem = useCallback(
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
        return false;
      }
      const attachment =
        pending.content.kind === 'image'
          ? attachmentRef.current?.itemId === pending.id
            ? attachmentRef.current.file
            : await provider.resolveAttachment(pending.id)
          : undefined;
      if (pending.content.kind === 'image' && !attachment) {
        await provider.setError(pending.id, 'attachment-missing');
        return false;
      }
      const preview = await previewForImport(
        pending,
        workspace,
        pending.id === item?.id
          ? (linkPreviewRef.current ?? linkPreview)
          : undefined,
        pending.id === item?.id ? previewOwner : undefined,
        servers
      );

      const result = await importer.importShareToWorkspace(
        workspace,
        {
          documentId: pending.documentId,
          importAttemptId: pending.importAttemptId,
          title: resolveShareTitle(
            pending.title,
            preview?.title,
            pending.title
          ),
          content: pending.content,
          preview,
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
        return false;
      }
      await provider.complete(pending.id, result.docId);
      return true;
    },
    [
      importer,
      item?.id,
      linkPreview,
      previewOwner,
      provider,
      servers,
      workspacesService,
    ]
  );

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
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
          const imported = await importItem(
            pendingItem,
            pendingItem.target,
            false
          );
          if (imported) {
            importedCount += 1;
            continue;
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
    }
  }, [importItem, provider, setManualItem]);

  const refreshRef = useRef(refresh);
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
    updateLinkPreview(undefined);
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
  }, [item?.content.kind, item?.id, provider, updateLinkPreview]);

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
      const imported = await importItem(
        item,
        {
          workspaceId: selectedWorkspace.id,
          workspaceFlavour: selectedWorkspace.flavour,
          tagIds: activeSelection?.tagIds ?? [],
          collectionId: activeSelection?.collectionId || undefined,
        },
        allowOffline
      );
      if (imported) {
        notify.success({ title: 'Shared content saved' });
      }
      await refresh();
    } finally {
      setIsSaving(false);
    }
  };

  if (!entry) return null;

  if (entry.status === 'unsupported-version') {
    return (
      <Modal
        fullScreen
        animation="slideBottom"
        open
        withoutCloseButton
        onOpenChange={() => setEntry(undefined)}
        contentOptions={{ style: { padding: 0 } }}
      >
        <div className={styles.page}>
          <PageHeader
            suffix={
              <Button variant="plain" onClick={() => setEntry(undefined)}>
                Not now
              </Button>
            }
          >
            <span className={styles.headerTitle}>Update required</span>
          </PageHeader>
          <main className={styles.main}>
            <div className={styles.warning}>
              Update AFFiNE to import this shared item. It will stay in your
              inbox until then.
            </div>
          </main>
        </div>
      </Modal>
    );
  }

  if (!item) return null;

  const tagIds = activeSelection?.tagIds ?? [];
  const collectionId = activeSelection?.collectionId ?? '';

  const workspaceOptions: SelectionPageOption[] = workspaces.map(workspace => ({
    id: workspaceKey(workspace),
    label: workspacesService.getProfile(workspace).name$.value || workspace.id,
    detail: workspace.flavour === 'local' ? 'On this device' : 'Cloud',
  }));
  const tagOptions: SelectionPageOption[] =
    destinations?.tags.map(tag => ({
      id: tag.id,
      label: tag.name,
      color: tag.color,
    })) ?? [];
  const collectionOptions: SelectionPageOption[] = [
    { id: '', label: 'No collection' },
    ...(destinations?.collections.map(collection => ({
      id: collection.id,
      label: collection.name,
    })) ?? []),
  ];

  const selectedTagNames =
    destinations?.tags
      .filter(tag => tagIds.includes(tag.id))
      .map(tag => tag.name) ?? [];
  const collectionName =
    destinations?.collections.find(collection => collection.id === collectionId)
      ?.name ?? 'None';
  const requiresOfflineConfirmation =
    item.lastError === 'offline-confirmation-required' ||
    destinations?.verification === 'unavailable';
  const source = sourceDetails(item);

  const content = (() => {
    if (page === 'workspace') {
      return (
        <SelectionPage
          title="Workspace"
          options={workspaceOptions}
          selectedIds={selectedWorkspaceKey ? [selectedWorkspaceKey] : []}
          onBack={() => setPage('main')}
          onSelect={id => {
            if (id !== selectedWorkspaceKey) updateLinkPreview(undefined);
            updateSelection(current =>
              current.workspaceKey === id
                ? current
                : {
                    ...current,
                    workspaceKey: id,
                    tagIds: [],
                    collectionId: '',
                  }
            );
            setEntry(current =>
              current?.status === 'ready'
                ? {
                    status: 'ready',
                    item: { ...current.item, lastError: undefined },
                  }
                : current
            );
            setPage('main');
          }}
        />
      );
    }
    if (page === 'tags') {
      return (
        <SelectionPage
          title="Tags"
          multiple
          options={tagOptions}
          selectedIds={tagIds}
          onBack={() => setPage('main')}
          onSelect={id =>
            updateSelection(current => ({
              ...current,
              tagIds: current.tagIds.includes(id)
                ? current.tagIds.filter(currentId => currentId !== id)
                : [...current.tagIds, id],
            }))
          }
          onConfirm={() => setPage('main')}
        />
      );
    }
    if (page === 'collection') {
      return (
        <SelectionPage
          title="Collection"
          options={collectionOptions}
          selectedIds={[collectionId]}
          onBack={() => setPage('main')}
          onSelect={id => {
            updateSelection(current => ({ ...current, collectionId: id }));
            setPage('main');
          }}
        />
      );
    }
    if (page === 'offline') {
      return (
        <div className={styles.page}>
          <PageHeader back backAction={() => setPage('main')}>
            <span className={styles.headerTitle}>
              Use local workspace data?
            </span>
          </PageHeader>
          <main className={styles.confirmation}>
            <h2 className={styles.confirmationTitle}>
              {selectedWorkspaceName}
            </h2>
            <p className={styles.confirmationText}>
              AFFiNE could not confirm that this workspace, your permissions,
              and its destinations are current online. Saving will use the most
              recent data available on this device.
            </p>
          </main>
          <SafeArea bottom className={styles.footer}>
            <Button
              className={styles.action}
              variant="primary"
              disabled={isSaving}
              onClick={() => void save(true).catch(console.error)}
            >
              {isSaving ? 'Saving…' : 'Save using local data'}
            </Button>
          </SafeArea>
        </div>
      );
    }

    return (
      <div className={styles.page}>
        <PageHeader
          suffix={
            <Button variant="plain" onClick={() => setEntry(undefined)}>
              Not now
            </Button>
          }
        >
          <span className={styles.headerTitle}>Choose where to save</span>
        </PageHeader>

        <Scrollable.Root className={styles.scrollArea}>
          <Scrollable.Scrollbar />
          <Scrollable.Viewport>
            <main className={styles.main}>
              {item.content.kind === 'url' && previewOwner ? (
                <LinkPreview
                  item={item}
                  owner={previewOwner}
                  workspace={selectedWorkspace}
                  servers={servers}
                  onPreview={updateLinkPreview}
                />
              ) : (
                <section className={styles.source}>
                  <div className={styles.sourceIcon}>
                    {attachmentPreview ? (
                      <img
                        className={styles.sourceImage}
                        src={attachmentPreview}
                        alt=""
                      />
                    ) : (
                      <SourceIcon kind={item.content.kind} />
                    )}
                  </div>
                  <div className={styles.sourceContent}>
                    <div className={styles.sourceTitle}>{source.title}</div>
                    {source.detail ? (
                      <div className={styles.sourceDetail}>{source.detail}</div>
                    ) : null}
                  </div>
                </section>
              )}

              <section className={styles.destinationGroup}>
                <button
                  className={styles.destinationRow}
                  type="button"
                  onClick={() => setPage('workspace')}
                >
                  <span className={styles.rowLabel}>Workspace</span>
                  <span className={styles.rowValue}>
                    {selectedWorkspaceName ?? 'Choose'}
                    <span className={styles.rowArrow}>›</span>
                  </span>
                </button>

                <button
                  className={styles.destinationRow}
                  type="button"
                  disabled={!destinations || isLoadingDestinations}
                  onClick={() => setPage('tags')}
                >
                  <span className={styles.rowLabel}>
                    Tags <span className={styles.optional}>Optional</span>
                  </span>
                  <span className={styles.rowValue}>
                    {selectedTagNames.length
                      ? `${selectedTagNames.length} selected`
                      : 'None'}
                    <span className={styles.rowArrow}>›</span>
                  </span>
                </button>

                <button
                  className={styles.destinationRow}
                  type="button"
                  disabled={!destinations || isLoadingDestinations}
                  onClick={() => setPage('collection')}
                >
                  <span className={styles.rowLabel}>
                    Collection <span className={styles.optional}>Optional</span>
                  </span>
                  <span className={styles.rowValue}>
                    {collectionName}
                    <span className={styles.rowArrow}>›</span>
                  </span>
                </button>
              </section>

              {isLoadingDestinations ? (
                <div className={styles.status}>Checking workspace…</div>
              ) : requiresOfflineConfirmation ? (
                <div className={styles.warning}>
                  The latest online workspace state could not be confirmed.
                </div>
              ) : null}

              {errorMessage(item.lastError) ? (
                <div className={styles.error}>
                  {errorMessage(item.lastError)}
                </div>
              ) : null}
            </main>
          </Scrollable.Viewport>
        </Scrollable.Root>

        <SafeArea bottom className={styles.footer}>
          <Button
            className={styles.action}
            variant="primary"
            disabled={
              !selectedWorkspace ||
              !destinations ||
              isSaving ||
              isLoadingDestinations
            }
            onClick={() => {
              if (requiresOfflineConfirmation) {
                setPage('offline');
              } else {
                void save(false).catch(console.error);
              }
            }}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </SafeArea>
      </div>
    );
  })();

  return (
    <Modal
      fullScreen
      animation="slideBottom"
      open
      withoutCloseButton
      onOpenChange={() => setEntry(undefined)}
      contentOptions={{ style: { padding: 0 } }}
    >
      {content}
    </Modal>
  );
};
