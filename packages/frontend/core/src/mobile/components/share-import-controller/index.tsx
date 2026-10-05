import { Button, Modal, SafeArea, Scrollable } from '@affine/component';
import { ImageIcon, LinkIcon, TextIcon } from '@blocksuite/icons/rc';

import { PageHeader } from '../page-header';
import { LinkPreview } from './link-preview';
import { SelectionPage, type SelectionPageOption } from './selection-page';
import * as styles from './style.css';
import type { PendingShareItem, ShareInboxProvider } from './types';
import { useShareImport } from './use-share-import';
export type { ShareInboxProvider } from './types';

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
      return 'The shared attachment is no longer available.';
    case 'attachment-too-large':
      return 'The shared attachment is too large for this workspace.';
    case 'attachment-write-failed':
      return 'AFFiNE could not store this attachment in the selected workspace. Try again or choose another workspace.';
    case 'import-conflict':
      return 'This share conflicts with an existing document and was not changed.';
    case 'completion-failed':
      return 'This share was saved, but AFFiNE could not clear it from the inbox. Try again.';
    default:
      return undefined;
  }
};

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
  if (item.content.kind === 'pdf') {
    return {
      title: item.title,
      detail: item.attachments?.[0]?.fileName ?? 'Shared PDF',
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
    case 'pdf':
      return <TextIcon />;
    case 'text':
      return <TextIcon />;
  }
};

export const ShareImportController = ({
  provider,
}: {
  provider: ShareInboxProvider;
}) => {
  const {
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
  } = useShareImport(provider);
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
    id: `${workspace.flavour}:${workspace.id}`,
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
                    item: {
                      ...current.item,
                      lastError:
                        current.item.lastError === 'completion-failed'
                          ? 'completion-failed'
                          : undefined,
                    },
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
                  key={`${item.id}:${selectedWorkspace?.flavour ?? ''}:${selectedWorkspace?.id ?? ''}:${selectedPreviewServerConfig?.type ?? ''}`}
                  item={item}
                  owner={previewOwner}
                  workspace={selectedWorkspace}
                  servers={servers}
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
