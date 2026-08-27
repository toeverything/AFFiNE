import { Button, Modal, notify, SafeArea, Scrollable } from '@affine/component';
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
import { SelectionPage, type SelectionPageOption } from './selection-page';
import * as styles from './style.css';
import type {
  PendingShareItem,
  ShareImportTarget,
  ShareInboxProvider,
} from './types';

export type { ShareInboxProvider } from './types';

type Page = 'main' | 'workspace' | 'tags' | 'collection' | 'offline';

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
    default:
      return undefined;
  }
};

const workspaceKey = (workspace: WorkspaceMetadata) =>
  `${workspace.flavour}:${workspace.id}`;

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
  const importer = useService(ImportClipperService);
  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const [item, setItem] = useState<PendingShareItem>();
  const [page, setPage] = useState<Page>('main');
  const [selectedWorkspaceKey, setSelectedWorkspaceKey] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [collectionId, setCollectionId] = useState('');
  const [destinations, setDestinations] = useState<ShareDestinationOptions>();
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<string>();
  const refreshing = useRef(false);

  const selectedWorkspace = workspaces.find(
    workspace => workspaceKey(workspace) === selectedWorkspaceKey
  );
  const selectedWorkspaceName = selectedWorkspace
    ? workspacesService.getProfile(selectedWorkspace).name$.value ||
      selectedWorkspace.id
    : undefined;

  const setManualItem = useCallback((next: PendingShareItem) => {
    setItem(next);
    setPage('main');
    setSelectedWorkspaceKey(
      next.target
        ? `${next.target.workspaceFlavour}:${next.target.workspaceId}`
        : ''
    );
    setTagIds(next.target?.tagIds ?? []);
    setCollectionId(next.target?.collectionId ?? '');
  }, []);

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
      const attachmentUrl =
        pending.content.kind === 'image'
          ? await provider.resolveAttachment(pending.id)
          : undefined;
      if (pending.content.kind === 'image' && !attachmentUrl) {
        await provider.setError(pending.id, 'attachment-missing');
        return false;
      }

      const result = await importer.importShareToWorkspace(
        workspace,
        {
          documentId: pending.documentId,
          title: pending.title,
          content: pending.content,
          attachmentUrl,
          tagIds: target.tagIds,
          collectionId: target.collectionId,
        },
        { allowOffline }
      );
      if (result.status !== 'imported') {
        await provider.setError(pending.id, result.status);
        return false;
      }
      await provider.complete(pending.id, result.docId);
      return true;
    },
    [importer, provider, workspacesService]
  );

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const pending = await provider.listPending();
      let importedCount = 0;
      for (const candidate of pending) {
        if (candidate.target && !candidate.lastError) {
          const imported = await importItem(candidate, candidate.target, false);
          if (imported) {
            importedCount += 1;
            continue;
          }
          const latest = await provider.listPending();
          const updated = latest.find(item => item.id === candidate.id);
          if (importedCount > 0) {
            notify.success({ title: `${importedCount} shared item saved` });
          }
          if (updated) setManualItem(updated);
          return;
        }
        if (importedCount > 0) {
          notify.success({ title: `${importedCount} shared item saved` });
        }
        setManualItem(candidate);
        return;
      }
      if (importedCount > 0) {
        notify.success({ title: `${importedCount} shared item saved` });
      }
      setItem(undefined);
    } finally {
      refreshing.current = false;
    }
  }, [importItem, provider, setManualItem]);

  useEffect(() => {
    void refresh().catch(console.error);
    const handleRefresh = () => {
      void refresh().catch(console.error);
    };
    window.addEventListener('affine:share-inbox', handleRefresh);
    return () =>
      window.removeEventListener('affine:share-inbox', handleRefresh);
  }, [refresh]);

  useEffect(() => {
    let active = true;
    setAttachmentPreview(undefined);
    if (item?.content.kind === 'image') {
      void provider
        .resolveAttachment(item.id)
        .then(preview => {
          if (active) setAttachmentPreview(preview);
        })
        .catch(console.error);
    }
    return () => {
      active = false;
    };
  }, [item?.content.kind, item?.id, provider]);

  useEffect(() => {
    if (!selectedWorkspace) {
      setDestinations(undefined);
      return;
    }
    let active = true;
    setDestinations(undefined);
    setIsLoadingDestinations(true);
    void importer
      .getShareDestinationOptions(selectedWorkspace)
      .then(async options => {
        if (!active) return;
        if (!options) {
          if (item) {
            await provider.setError(item.id, 'workspace-not-found');
            setItem(current =>
              current
                ? { ...current, lastError: 'workspace-not-found' }
                : current
            );
          }
          return;
        }
        setDestinations(options);
        const validTags = new Set(options.tags.map(tag => tag.id));
        setTagIds(ids => ids.filter(id => validTags.has(id)));
        setCollectionId(id =>
          id && options.collections.some(collection => collection.id === id)
            ? id
            : ''
        );
      })
      .catch(console.error)
      .finally(() => {
        if (active) setIsLoadingDestinations(false);
      });
    return () => {
      active = false;
    };
  }, [importer, item, provider, selectedWorkspace]);

  const save = async (allowOffline: boolean) => {
    if (!item || !selectedWorkspace || isSaving) return;
    setIsSaving(true);
    try {
      const imported = await importItem(
        item,
        {
          workspaceId: selectedWorkspace.id,
          workspaceFlavour: selectedWorkspace.flavour,
          tagIds,
          collectionId: collectionId || undefined,
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

  if (!item) return null;

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
            setSelectedWorkspaceKey(id);
            setTagIds([]);
            setCollectionId('');
            setItem(current =>
              current ? { ...current, lastError: undefined } : current
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
            setTagIds(ids =>
              ids.includes(id)
                ? ids.filter(current => current !== id)
                : [...ids, id]
            )
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
            setCollectionId(id);
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
            <Button variant="plain" onClick={() => setItem(undefined)}>
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
      onOpenChange={() => setItem(undefined)}
      contentOptions={{ style: { padding: 0 } }}
    >
      {content}
    </Modal>
  );
};
