import { MenuItem, SafeArea, usePromptModal } from '@affine/component';
import { usePageHelper } from '@affine/core/blocksuite/block-suite-page-list/utils';
import { NavigationPanelTreeRoot } from '@affine/core/desktop/components/navigation-panel';
import { CollectionService } from '@affine/core/modules/collection';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { FavoriteService } from '@affine/core/modules/favorite';
import { NavigationPanelService } from '@affine/core/modules/navigation-panel';
import { OrganizeService } from '@affine/core/modules/organize';
import { TagService } from '@affine/core/modules/tag';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import {
  AddCollectionIcon,
  AddOrganizeIcon,
  AddTagIcon,
  FolderIcon,
  PageIcon,
  RemoveFolderIcon,
  ToggleRightIcon,
  ViewLayersIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService, useServices } from '@toeverything/infra';
import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type Components,
  type ListRange,
  Virtuoso,
  type VirtuosoHandle,
} from 'react-virtuoso';

import { MobileBackCoordinator } from '../../../modules/back-coordinator';
import {
  MobileNavigationProjection,
  type MobileNavigationRow,
  MobileShellDataProjection,
  type MobileShellNavigationEntry,
} from '../../../modules/navigation-projection';
import { HomeHeader } from '../../../views/home-header';
import { RecentDocs } from '../../../views/recent-docs';
import { AddItemPlaceholder } from '../layouts/add-item-placeholder';
import {
  NavigationPanelCollectionNodeMenu,
  useNavigationPanelCollectionAddDoc,
} from '../nodes/collection/operations';
import {
  NavigationPanelDocNodeMenu,
  useNavigationPanelDocNodeAddLinkedPage,
} from '../nodes/doc/operations';
import { NavigationPanelFolderNodeMenu } from '../nodes/folder';
import { FolderCreateTip, FolderRenameDialog } from '../nodes/folder/dialog';
import { TagRenameDialog } from '../nodes/tag/dialog';
import {
  NavigationPanelTagNodeMenu,
  useNavigationPanelTagNodeNewDoc,
} from '../nodes/tag/operations';
import { NavigationPanelTreeNode } from '../tree/node';
import * as styles from './styles.css';

const sectionTitles = {
  favorites: 'com.affine.rootAppSidebar.favorites',
  organize: 'com.affine.rootAppSidebar.organize',
  collections: 'com.affine.rootAppSidebar.collections',
  tags: 'com.affine.rootAppSidebar.tags',
} as const;

const Header = () => (
  <>
    <HomeHeader />
    <RecentDocs />
  </>
);

const Footer = () => <SafeArea bottom />;

const List = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function NavigationList(props, ref) {
    return <div {...props} ref={ref} role="tree" className={styles.list} />;
  }
);

const virtuosoComponents: Components<MobileNavigationRow> = {
  Footer,
  Header,
  List,
};

const afterNextPaint = (callback: () => void) => {
  let nextFrame = 0;
  const frame = requestAnimationFrame(() => {
    nextFrame = requestAnimationFrame(callback);
  });
  return () => {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(nextFrame);
  };
};

const rowPath = (rowId: string) =>
  rowId.split('/').map(segment => {
    const decoded = decodeURIComponent(segment);
    const separator = decoded.indexOf(':');
    return separator === -1
      ? decoded
      : `${decoded.slice(0, separator)}-${decoded.slice(separator + 1)}`;
  });

const rowIndent = (depth: number) => Math.max(0, depth - 1) * 20;

const RowIcon = ({ entry }: { entry: MobileShellNavigationEntry }) => {
  if (entry.kind === 'collection') return <ViewLayersIcon />;
  if (entry.kind === 'folder') return <FolderIcon />;
  if (entry.kind === 'tag') {
    return (
      <span
        className={styles.tagIcon}
        style={{ backgroundColor: entry.color }}
        data-testid="navigation-panel-tag-icon-dot"
      />
    );
  }
  return <PageIcon />;
};

const EntityRowShell = ({
  row,
  entry,
  menuTarget,
  toggle,
}: {
  row: MobileNavigationRow;
  entry: MobileShellNavigationEntry;
  menuTarget?: ReactNode;
  toggle: () => void;
}) => {
  const to =
    entry.kind === 'doc'
      ? `/${entry.id}`
      : entry.kind === 'collection'
        ? `/collection/${entry.id}`
        : entry.kind === 'tag'
          ? `/tag/${entry.id}`
          : undefined;
  const Icon = useCallback(() => <RowIcon entry={entry} />, [entry]);
  return (
    <div
      className={styles.row}
      style={{ paddingLeft: rowIndent(row.depth) }}
      data-navigation-row-id={row.id}
      tabIndex={-1}
    >
      <NavigationPanelTreeRoot>
        <NavigationPanelTreeNode
          icon={Icon}
          name={entry.name}
          to={to}
          active={entry.active}
          collapsed={!row.expanded}
          setCollapsed={toggle}
          menuTarget={menuTarget}
          data-testid={`navigation-panel-${entry.kind}-${entry.id}`}
          data-role={`navigation-panel-${entry.kind}`}
          role="treeitem"
          aria-label={entry.name}
          aria-level={row.depth + 1}
          aria-expanded={row.expandable ? row.expanded : undefined}
        />
      </NavigationPanelTreeRoot>
    </div>
  );
};

const DocRow = ({
  row,
  entry,
  toggle,
}: {
  row: MobileNavigationRow;
  entry: MobileShellNavigationEntry;
  toggle: () => void;
}) => {
  const expand = useCallback(() => {
    if (!row.expanded) toggle();
  }, [row.expanded, toggle]);
  const handleAddLinkedPage = useNavigationPanelDocNodeAddLinkedPage(
    entry.id,
    expand
  );
  const menuTarget = useMemo(
    () => (
      <NavigationPanelDocNodeMenu
        docId={entry.id}
        handleAddLinkedPage={handleAddLinkedPage}
        additionalOperations={
          row.relationId
            ? [
                {
                  index: 999,
                  view: (
                    <RemoveFromFolderMenuItem relationId={row.relationId} />
                  ),
                },
              ]
            : undefined
        }
      />
    ),
    [entry.id, handleAddLinkedPage, row.relationId]
  );
  return (
    <EntityRowShell
      row={row}
      entry={entry}
      toggle={toggle}
      menuTarget={menuTarget}
    />
  );
};

const CollectionRow = ({
  row,
  entry,
  toggle,
}: {
  row: MobileNavigationRow;
  entry: MobileShellNavigationEntry;
  toggle: () => void;
}) => {
  const { collectionService, workspaceDialogService } = useServices({
    CollectionService,
    WorkspaceDialogService,
  });
  const expand = useCallback(() => {
    if (!row.expanded) toggle();
  }, [row.expanded, toggle]);
  const handleAdd = useNavigationPanelCollectionAddDoc(entry.id, expand);
  const handleEdit = useCallback(() => {
    const collection = collectionService.collection$(entry.id).value;
    if (collection) {
      workspaceDialogService.open('collection-editor', {
        collectionId: entry.id,
      });
    }
  }, [collectionService, entry.id, workspaceDialogService]);
  const menuTarget = useMemo(
    () => (
      <NavigationPanelCollectionNodeMenu
        collectionId={entry.id}
        handleAddDocToCollection={handleAdd}
        onOpenEdit={handleEdit}
        additionalOperations={
          row.relationId
            ? [
                {
                  index: 999,
                  view: (
                    <RemoveFromFolderMenuItem relationId={row.relationId} />
                  ),
                },
              ]
            : undefined
        }
      />
    ),
    [entry.id, handleAdd, handleEdit, row.relationId]
  );
  return (
    <EntityRowShell
      row={row}
      entry={entry}
      toggle={toggle}
      menuTarget={menuTarget}
    />
  );
};

const TagRow = ({
  row,
  entry,
  toggle,
}: {
  row: MobileNavigationRow;
  entry: MobileShellNavigationEntry;
  toggle: () => void;
}) => {
  const expand = useCallback(() => {
    if (!row.expanded) toggle();
  }, [row.expanded, toggle]);
  const handleNewDoc = useNavigationPanelTagNodeNewDoc(entry.id, expand);
  const menuTarget = useMemo(
    () => (
      <NavigationPanelTagNodeMenu
        tagId={entry.id}
        handleNewDoc={handleNewDoc}
        additionalOperations={
          row.relationId
            ? [
                {
                  index: 999,
                  view: (
                    <RemoveFromFolderMenuItem relationId={row.relationId} />
                  ),
                },
              ]
            : undefined
        }
      />
    ),
    [entry.id, handleNewDoc, row.relationId]
  );
  return (
    <EntityRowShell
      row={row}
      entry={entry}
      toggle={toggle}
      menuTarget={menuTarget}
    />
  );
};

const RemoveFromFolderMenuItem = ({ relationId }: { relationId: string }) => {
  const t = useI18n();
  const organizeService = useService(OrganizeService);
  return (
    <MenuItem
      type="danger"
      prefixIcon={<RemoveFolderIcon />}
      onClick={() =>
        organizeService.folderTree.folderNode$(relationId).value?.delete()
      }
    >
      {t['com.affine.rootAppSidebar.organize.delete-from-folder']()}
    </MenuItem>
  );
};

const useFolderNewDoc = (folderId: string, onCreated?: () => void) => {
  const { organizeService, workspaceService } = useServices({
    OrganizeService,
    WorkspaceService,
  });
  const { createPage } = usePageHelper(
    workspaceService.workspace.docCollection
  );
  return useCallback(() => {
    const folder = organizeService.folderTree.folderNode$(folderId).value;
    if (!folder) return;
    const doc = createPage();
    folder.createLink('doc', doc.id, folder.indexAt('before'));
    track.$.navigationPanel.folders.createDoc();
    track.$.navigationPanel.organize.createOrganizeItem({
      type: 'link',
      target: 'doc',
    });
    onCreated?.();
  }, [createPage, folderId, onCreated, organizeService.folderTree]);
};

const FolderRow = ({
  row,
  entry,
  toggle,
}: {
  row: MobileNavigationRow;
  entry: MobileShellNavigationEntry;
  toggle: () => void;
}) => {
  const t = useI18n();
  const expand = useCallback(() => {
    if (!row.expanded) toggle();
  }, [row.expanded, toggle]);
  const handleNewDoc = useFolderNewDoc(entry.id, expand);
  const menuTarget = useMemo(
    () => (
      <NavigationPanelFolderNodeMenu
        nodeId={entry.id}
        additionalOperations={[
          {
            index: 0,
            view: (
              <MenuItem prefixIcon={<PageIcon />} onClick={handleNewDoc}>
                {t['com.affine.rootAppSidebar.organize.folder.new-doc']()}
              </MenuItem>
            ),
          },
        ]}
      />
    ),
    [entry.id, handleNewDoc, t]
  );
  return (
    <EntityRowShell
      row={row}
      entry={entry}
      toggle={toggle}
      menuTarget={menuTarget}
    />
  );
};

const EntityRow = ({
  row,
  entry,
  toggle,
}: {
  row: MobileNavigationRow;
  entry: MobileShellNavigationEntry;
  toggle: () => void;
}) => {
  if (entry.kind === 'doc') {
    return <DocRow row={row} entry={entry} toggle={toggle} />;
  }
  if (entry.kind === 'collection') {
    return <CollectionRow row={row} entry={entry} toggle={toggle} />;
  }
  if (entry.kind === 'tag') {
    return <TagRow row={row} entry={entry} toggle={toggle} />;
  }
  return <FolderRow row={row} entry={entry} toggle={toggle} />;
};

const FolderNewDocAction = ({ row }: { row: MobileNavigationRow }) => {
  const t = useI18n();
  const handleCreate = useFolderNewDoc(row.entityId ?? '');
  return (
    <div
      className={styles.row}
      style={{ paddingLeft: rowIndent(row.depth) }}
      data-navigation-row-id={row.id}
      role="treeitem"
      aria-level={row.depth + 1}
      tabIndex={-1}
    >
      <AddItemPlaceholder
        label={t['com.affine.rootAppSidebar.organize.folder.new-doc']()}
        onClick={handleCreate}
        data-testid="new-folder-in-folder-button"
      />
    </div>
  );
};

const DocNewLinkedActionEnabled = ({
  row,
  docId,
}: {
  row: MobileNavigationRow;
  docId: string;
}) => {
  const t = useI18n();
  const keepExpanded = useCallback(() => {}, []);
  const handleCreate = useNavigationPanelDocNodeAddLinkedPage(
    docId,
    keepExpanded
  );
  return (
    <div
      className={styles.row}
      style={{ paddingLeft: rowIndent(row.depth) }}
      data-navigation-row-id={row.id}
      role="treeitem"
      aria-level={row.depth + 1}
      tabIndex={-1}
    >
      <AddItemPlaceholder
        label={t['com.affine.rootAppSidebar.explorer.doc-add-tooltip']()}
        onClick={handleCreate}
        data-testid="navigation-panel-doc-add-linked-page"
      />
    </div>
  );
};

const DocNewLinkedAction = ({ row }: { row: MobileNavigationRow }) => {
  const dataProjection = useService(MobileShellDataProjection);
  const docId = row.entityId ?? '';
  const entry = useLiveData(dataProjection.navigationEntry$('doc', docId));
  return entry?.canUpdate === true ? (
    <DocNewLinkedActionEnabled row={row} docId={docId} />
  ) : null;
};

const CollectionNewDocAction = ({ row }: { row: MobileNavigationRow }) => {
  const t = useI18n();
  const keepExpanded = useCallback(() => {}, []);
  const handleCreate = useNavigationPanelCollectionAddDoc(
    row.entityId ?? '',
    keepExpanded
  );
  return (
    <div
      className={styles.row}
      style={{ paddingLeft: rowIndent(row.depth) }}
      data-navigation-row-id={row.id}
      role="treeitem"
      aria-level={row.depth + 1}
      tabIndex={-1}
    >
      <AddItemPlaceholder
        label={t['New Page']()}
        onClick={handleCreate}
        data-testid="navigation-panel-collection-add-page"
      />
    </div>
  );
};

const TagNewDocAction = ({ row }: { row: MobileNavigationRow }) => {
  const t = useI18n();
  const keepExpanded = useCallback(() => {}, []);
  const handleCreate = useNavigationPanelTagNodeNewDoc(
    row.entityId ?? '',
    keepExpanded
  );
  return (
    <div
      className={styles.row}
      style={{ paddingLeft: rowIndent(row.depth) }}
      data-navigation-row-id={row.id}
      role="treeitem"
      aria-level={row.depth + 1}
      tabIndex={-1}
    >
      <AddItemPlaceholder
        label={t['New Page']()}
        onClick={handleCreate}
        data-testid="navigation-panel-tag-add-page"
      />
    </div>
  );
};

const ProjectedEntityRow = ({
  row,
  toggle,
}: {
  row: MobileNavigationRow;
  toggle: () => void;
}) => {
  const dataProjection = useService(MobileShellDataProjection);
  const entry = useLiveData(
    dataProjection.navigationEntry$(
      row.kind as MobileShellNavigationEntry['kind'],
      row.entityId ?? ''
    )
  );
  const t = useI18n();
  if (!entry) return null;
  if (entry.kind === 'doc' && entry.canRead !== true) {
    return (
      <div
        className={styles.permission}
        style={{ paddingLeft: rowIndent(row.depth) }}
        data-navigation-row-id={row.id}
        role="treeitem"
        aria-level={row.depth + 1}
        tabIndex={-1}
      >
        {entry.canRead === false
          ? t['com.affine.no-permission']()
          : t['Loading']()}
      </div>
    );
  }
  return <EntityRow row={row} entry={entry} toggle={toggle} />;
};

const FavoritesAction = () => {
  const t = useI18n();
  const { favoriteService, workspaceService } = useServices({
    FavoriteService,
    WorkspaceService,
  });
  const { createPage } = usePageHelper(
    workspaceService.workspace.docCollection
  );
  const handleCreate = useCallback(() => {
    const doc = createPage();
    favoriteService.favoriteList.add(
      'doc',
      doc.id,
      favoriteService.favoriteList.indexAt('before')
    );
  }, [createPage, favoriteService.favoriteList]);
  return (
    <AddItemPlaceholder
      data-testid="navigation-panel-bar-add-favorite-button"
      label={t['New Page']()}
      onClick={handleCreate}
    />
  );
};

const OrganizeAction = () => {
  const t = useI18n();
  const organizeService = useService(OrganizeService);
  const [open, setOpen] = useState(false);
  const root = organizeService.folderTree.rootFolder;
  const handleCreate = useCallback(
    (name: string) => {
      const id = root.createFolder(name, root.indexAt('before'));
      track.$.navigationPanel.organize.createOrganizeItem({ type: 'folder' });
      return id;
    },
    [root]
  );
  return (
    <>
      <AddItemPlaceholder
        icon={<AddOrganizeIcon />}
        data-testid="navigation-panel-bar-add-organize-button"
        label={t['com.affine.rootAppSidebar.organize.add-folder']()}
        onClick={() => setOpen(true)}
      />
      <FolderRenameDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={handleCreate}
        descRenderer={FolderCreateTip}
      />
    </>
  );
};

const CollectionsAction = () => {
  const t = useI18n();
  const { collectionService, workbenchService } = useServices({
    CollectionService,
    WorkbenchService,
  });
  const { openPromptModal } = usePromptModal();
  const handleCreate = useCallback(() => {
    openPromptModal({
      title: t['com.affine.editCollection.saveCollection'](),
      label: t['com.affine.editCollectionName.name'](),
      inputOptions: {
        placeholder: t['com.affine.editCollectionName.name.placeholder'](),
      },
      confirmText: t['com.affine.editCollection.save'](),
      cancelText: t['com.affine.editCollection.button.cancel'](),
      onConfirm(name) {
        const id = collectionService.createCollection({ name });
        workbenchService.workbench.openCollection(id);
      },
    });
  }, [collectionService, openPromptModal, t, workbenchService.workbench]);
  return (
    <AddItemPlaceholder
      icon={<AddCollectionIcon />}
      data-testid="navigation-panel-bar-add-collection-button"
      label={t['com.affine.rootAppSidebar.collection.new']()}
      onClick={handleCreate}
    />
  );
};

const TagsAction = () => {
  const t = useI18n();
  const tagService = useService(TagService);
  const [open, setOpen] = useState(false);
  const handleCreate = useCallback(
    (name: string, color: string) => {
      tagService.tagList.createTag(name, color);
      setOpen(false);
    },
    [tagService.tagList]
  );
  return (
    <>
      <AddItemPlaceholder
        icon={<AddTagIcon />}
        data-testid="navigation-panel-add-tag-button"
        label={t[
          'com.affine.rootAppSidebar.explorer.tag-section-add-tooltip'
        ]()}
        onClick={() => setOpen(true)}
      />
      <TagRenameDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={handleCreate}
        enableAnimation
      />
    </>
  );
};

const SectionAction = ({ section }: { section: string }) => {
  if (section === 'favorites') return <FavoritesAction />;
  if (section === 'organize') return <OrganizeAction />;
  if (section === 'collections') return <CollectionsAction />;
  if (section === 'tags') return <TagsAction />;
  return null;
};

const NavigationAction = ({ row }: { row: MobileNavigationRow }) => {
  if (row.action === 'section') {
    return (
      <div
        className={styles.row}
        data-navigation-row-id={row.id}
        role="treeitem"
        aria-level={2}
        tabIndex={-1}
      >
        <SectionAction section={row.entityId ?? ''} />
      </div>
    );
  }
  if (row.action === 'folder-new-doc') return <FolderNewDocAction row={row} />;
  if (row.action === 'doc-new-linked') return <DocNewLinkedAction row={row} />;
  if (row.action === 'collection-new-doc') {
    return <CollectionNewDocAction row={row} />;
  }
  if (row.action === 'tag-new-doc') return <TagNewDocAction row={row} />;
  return null;
};

export const MobileNavigationVirtualScroller = () => {
  const t = useI18n();
  const dataProjection = useService(MobileShellDataProjection);
  const navigationPanelService = useService(NavigationPanelService);
  const backCoordinator = useService(MobileBackCoordinator);
  const sections = useLiveData(dataProjection.navigationSections$);
  const projection = useMemo(() => new MobileNavigationProjection(), []);
  const restoredSnapshot = useMemo(
    () => backCoordinator.snapshot('home'),
    [backCoordinator]
  );
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    if (restoredSnapshot) return new Set(restoredSnapshot.expanded);
    const initial = new Set<string>();
    let previousSize = -1;
    while (previousSize !== initial.size) {
      previousSize = initial.size;
      for (const row of projection.flatten(sections, initial)) {
        if (
          row.expandable &&
          !navigationPanelService.collapsed$(rowPath(row.id)).value
        ) {
          initial.add(row.id);
        }
      }
    }
    return initial;
  });
  const listRef = useRef<VirtuosoHandle>(null);
  const restoredAnchor = useRef(false);
  const restoredFocus = useRef(false);
  const [visibleRange, setVisibleRange] = useState<ListRange>({
    startIndex: 0,
    endIndex: 30,
  });
  const rows = useMemo(
    () => projection.flatten(sections, expanded),
    [expanded, projection, sections]
  );

  const hydratedRows = useRef(new Set<string>());
  useEffect(() => {
    if (restoredSnapshot) return;
    setExpanded(current => {
      const next = new Set(current);
      let changed = false;
      for (const row of rows) {
        if (!row.expandable || hydratedRows.current.has(row.id)) continue;
        hydratedRows.current.add(row.id);
        if (!navigationPanelService.collapsed$(rowPath(row.id)).value) {
          changed = !next.has(row.id) || changed;
          next.add(row.id);
        }
      }
      return changed ? next : current;
    });
  }, [navigationPanelService, restoredSnapshot, rows]);

  useEffect(() => {
    const cancel = afterNextPaint(() => dataProjection.visible$.next(true));
    return () => {
      cancel();
      dataProjection.setExpandedVisibleDocIds([]);
      dataProjection.visible$.next(false);
    };
  }, [dataProjection]);

  useEffect(() => {
    return afterNextPaint(() => {
      const visibleExpandedDocs = rows
        .slice(visibleRange.startIndex, visibleRange.endIndex + 1)
        .filter(
          row =>
            row.kind === 'doc' && row.expanded && row.entityId !== undefined
        )
        .map(row => row.entityId as string);
      dataProjection.setExpandedVisibleDocIds(visibleExpandedDocs);
    });
  }, [dataProjection, rows, visibleRange]);

  useEffect(() => {
    if (restoredAnchor.current || !restoredSnapshot?.anchor) return;
    const index = rows.findIndex(row => row.id === restoredSnapshot.anchor);
    if (index === -1) return;
    restoredAnchor.current = true;
    listRef.current?.scrollToIndex({ index, align: 'start' });
  }, [restoredSnapshot?.anchor, rows]);

  useEffect(() => {
    if (restoredFocus.current || !restoredSnapshot?.focus) return;
    const element = document.querySelector<HTMLElement>(
      `[data-navigation-row-id="${CSS.escape(restoredSnapshot.focus)}"]`
    );
    if (element) {
      restoredFocus.current = true;
      element.focus({ preventScroll: true });
      return;
    }
    const index = rows.findIndex(row => row.id === restoredSnapshot.focus);
    if (index !== -1)
      listRef.current?.scrollToIndex({ index, align: 'center' });
  }, [restoredSnapshot?.focus, rows, visibleRange]);

  const saveSnapshot = useCallback(() => {
    listRef.current?.getState(listState => {
      const anchor = rows[visibleRange.startIndex]?.id;
      backCoordinator.setSnapshot('home', {
        anchor,
        expanded: [...expanded],
        focus: document.activeElement?.closest<HTMLElement>(
          '[data-navigation-row-id]'
        )?.dataset.navigationRowId,
        listState,
      });
    });
  }, [backCoordinator, expanded, rows, visibleRange.startIndex]);

  useEffect(() => afterNextPaint(saveSnapshot), [saveSnapshot]);

  const toggle = useCallback(
    (row: MobileNavigationRow) => {
      if (!row.expandable) return;
      setExpanded(current => {
        const next = new Set(current);
        if (next.has(row.id)) next.delete(row.id);
        else next.add(row.id);
        return next;
      });
      navigationPanelService.setCollapsed(rowPath(row.id), !!row.expanded);
    },
    [navigationPanelService]
  );

  return (
    <div className={styles.scroller}>
      <Virtuoso
        ref={listRef}
        className={styles.virtuoso}
        data={rows}
        restoreStateFrom={restoredSnapshot?.listState}
        overscan={{ main: 600, reverse: 300 }}
        computeItemKey={(_, row) => row.id}
        rangeChanged={setVisibleRange}
        onFocusCapture={() => {
          afterNextPaint(saveSnapshot);
        }}
        components={virtuosoComponents}
        itemContent={(_, row) => {
          if (row.kind === 'section') {
            const section = row.entityId as keyof typeof sectionTitles;
            return (
              <div
                className={styles.section}
                data-first-section={section === 'favorites'}
                data-navigation-row-id={row.id}
                data-collapsible
                data-collapsed={!row.expanded}
                data-testid={`navigation-panel-${section}`}
                role="treeitem"
                aria-level={1}
                aria-expanded={row.expanded}
                tabIndex={-1}
              >
                <button
                  type="button"
                  className={styles.sectionButton}
                  onClick={() => toggle(row)}
                >
                  {t[sectionTitles[section]]()}
                  <ToggleRightIcon className={styles.sectionCollapseIcon} />
                </button>
              </div>
            );
          }
          if (row.kind === 'placeholder') {
            return (
              <div
                className={styles.permission}
                data-navigation-row-id={row.id}
                style={{ paddingLeft: rowIndent(row.depth) }}
                role="treeitem"
                aria-level={row.depth + 1}
                tabIndex={-1}
              >
                {row.blocked === 'denied'
                  ? t['com.affine.no-permission']()
                  : t['Loading']()}
              </div>
            );
          }
          if (row.kind === 'action') {
            return <NavigationAction row={row} />;
          }
          return <ProjectedEntityRow row={row} toggle={() => toggle(row)} />;
        }}
      />
    </div>
  );
};
