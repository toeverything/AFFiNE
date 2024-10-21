import {
  AnimatedFolderIcon,
  IconButton,
  MenuItem,
  MenuSeparator,
  MenuSub,
  notify,
} from '@affine/component';
import { usePageHelper } from '@affine/core/components/blocksuite/block-suite-page-list/utils';
import {
  useSelectCollection,
  useSelectDoc,
  useSelectTag,
} from '@affine/core/components/page-list/selector';
import type {
  ExplorerTreeNodeIcon,
  NodeOperation,
} from '@affine/core/modules/explorer';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import {
  type FolderNode,
  OrganizeService,
} from '@affine/core/modules/organize';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import {
  DeleteIcon,
  FolderIcon,
  LayerIcon,
  PageIcon,
  PlusIcon,
  PlusThickIcon,
  RemoveFolderIcon,
  TagsIcon,
} from '@blocksuite/icons/rc';
import {
  FeatureFlagService,
  useLiveData,
  useServices,
  WorkspaceService,
} from '@toeverything/infra';
import { difference } from 'lodash-es';
import { useCallback, useMemo, useState } from 'react';

import { AddItemPlaceholder } from '../../layouts/add-item-placeholder';
import { ExplorerTreeNode } from '../../tree/node';
import { ExplorerCollectionNode } from '../collection';
import { ExplorerDocNode } from '../doc';
import { ExplorerTagNode } from '../tag';
import { FavoriteFolderOperation } from './operations';

export const ExplorerFolderNode = ({
  nodeId,
  defaultRenaming,
  operations,
}: {
  defaultRenaming?: boolean;
  nodeId: string;
  operations?:
    | NodeOperation[]
    | ((type: string, node: FolderNode) => NodeOperation[]);
}) => {
  const { organizeService } = useServices({
    OrganizeService,
  });
  const node = useLiveData(organizeService.folderTree.folderNode$(nodeId));
  const type = useLiveData(node?.type$);
  const data = useLiveData(node?.data$);

  const additionalOperations = useMemo(() => {
    if (!type || !node) {
      return;
    }
    if (typeof operations === 'function') {
      return operations(type, node);
    }
    return operations;
  }, [node, operations, type]);

  if (!node) {
    return;
  }

  if (type === 'folder') {
    return (
      <ExplorerFolderNodeFolder
        node={node}
        defaultRenaming={defaultRenaming}
        operations={additionalOperations}
      />
    );
  }
  if (!data) return null;
  if (type === 'doc') {
    return <ExplorerDocNode docId={data} operations={additionalOperations} />;
  } else if (type === 'collection') {
    return (
      <ExplorerCollectionNode
        collectionId={data}
        operations={additionalOperations}
      />
    );
  } else if (type === 'tag') {
    return <ExplorerTagNode tagId={data} operations={additionalOperations} />;
  }

  return;
};

const ExplorerFolderIcon: ExplorerTreeNodeIcon = ({
  collapsed,
  className,
  draggedOver,
  treeInstruction,
}) => (
  <AnimatedFolderIcon
    className={className}
    open={
      !collapsed || (!!draggedOver && treeInstruction?.type === 'make-child')
    }
  />
);

const ExplorerFolderNodeFolder = ({
  node,
  defaultRenaming,
  operations: additionalOperations,
}: {
  defaultRenaming?: boolean;
  node: FolderNode;
  operations?: NodeOperation[];
}) => {
  const t = useI18n();
  const { workspaceService, featureFlagService } = useServices({
    WorkspaceService,
    CompatibleFavoriteItemsAdapter,
    FeatureFlagService,
  });
  const openDocsSelector = useSelectDoc();
  const openTagsSelector = useSelectTag();
  const openCollectionsSelector = useSelectCollection();
  const name = useLiveData(node.name$);
  const enableEmojiIcon = useLiveData(
    featureFlagService.flags.enable_emoji_folder_icon.$
  );
  const [collapsed, setCollapsed] = useState(true);
  const [newFolderId, setNewFolderId] = useState<string | null>(null);

  const { createPage } = usePageHelper(
    workspaceService.workspace.docCollection
  );
  const handleDelete = useCallback(() => {
    node.delete();
    track.$.navigationPanel.organize.deleteOrganizeItem({
      type: 'folder',
    });
    notify.success({
      title: t['com.affine.rootAppSidebar.organize.delete.notify-title']({
        name,
      }),
      message: t['com.affine.rootAppSidebar.organize.delete.notify-message'](),
    });
  }, [name, node, t]);

  const children = useLiveData(node.sortedChildren$);

  const handleRename = useCallback(
    (newName: string) => {
      node.rename(newName);
    },
    [node]
  );

  const handleNewDoc = useCallback(() => {
    const newDoc = createPage();
    node.createLink('doc', newDoc.id, node.indexAt('before'));
    track.$.navigationPanel.folders.createDoc();
    track.$.navigationPanel.organize.createOrganizeItem({
      type: 'link',
      target: 'doc',
    });
    setCollapsed(false);
  }, [createPage, node]);

  const handleCreateSubfolder = useCallback(() => {
    const newFolderId = node.createFolder(
      t['com.affine.rootAppSidebar.organize.new-folders'](),
      node.indexAt('before')
    );
    track.$.navigationPanel.organize.createOrganizeItem({ type: 'folder' });
    setCollapsed(false);
    setNewFolderId(newFolderId);
  }, [node, t]);

  const handleAddToFolder = useCallback(
    (type: 'doc' | 'collection' | 'tag') => {
      const initialIds = children
        .filter(node => node.type$.value === type)
        .map(node => node.data$.value)
        .filter(Boolean) as string[];
      const selector =
        type === 'doc'
          ? openDocsSelector
          : type === 'collection'
            ? openCollectionsSelector
            : openTagsSelector;
      selector(initialIds)
        .then(selectedIds => {
          const newItemIds = difference(selectedIds, initialIds);
          const removedItemIds = difference(initialIds, selectedIds);
          const removedItems = children.filter(
            node =>
              !!node.data$.value && removedItemIds.includes(node.data$.value)
          );

          newItemIds.forEach(id => {
            node.createLink(type, id, node.indexAt('after'));
          });
          removedItems.forEach(node => node.delete());
          const updated = newItemIds.length + removedItems.length;
          updated && setCollapsed(false);
        })
        .catch(err => {
          console.error(`Unexpected error while selecting ${type}`, err);
        });
      track.$.navigationPanel.organize.createOrganizeItem({
        type: 'link',
        target: type,
      });
    },
    [
      children,
      node,
      openCollectionsSelector,
      openDocsSelector,
      openTagsSelector,
    ]
  );

  const folderOperations = useMemo(() => {
    return [
      {
        index: 0,
        inline: true,
        view: (
          <IconButton
            size="16"
            onClick={handleNewDoc}
            tooltip={t[
              'com.affine.rootAppSidebar.explorer.organize-add-tooltip'
            ]()}
          >
            <PlusIcon />
          </IconButton>
        ),
      },
      {
        index: 100,
        view: (
          <MenuItem prefixIcon={<FolderIcon />} onClick={handleCreateSubfolder}>
            {t['com.affine.rootAppSidebar.organize.folder.create-subfolder']()}
          </MenuItem>
        ),
      },
      {
        index: 101,
        view: (
          <MenuItem
            prefixIcon={<PageIcon />}
            onClick={() => handleAddToFolder('doc')}
          >
            {t['com.affine.rootAppSidebar.organize.folder.add-docs']()}
          </MenuItem>
        ),
      },
      {
        index: 102,
        view: (
          <MenuSub
            triggerOptions={{
              prefixIcon: <PlusThickIcon />,
            }}
            items={
              <>
                <MenuItem
                  onClick={() => handleAddToFolder('tag')}
                  prefixIcon={<TagsIcon />}
                >
                  {t['com.affine.rootAppSidebar.organize.folder.add-tags']()}
                </MenuItem>
                <MenuItem
                  onClick={() => handleAddToFolder('collection')}
                  prefixIcon={<LayerIcon />}
                >
                  {t[
                    'com.affine.rootAppSidebar.organize.folder.add-collections'
                  ]()}
                </MenuItem>
              </>
            }
          >
            {t['com.affine.rootAppSidebar.organize.folder.add-others']()}
          </MenuSub>
        ),
      },

      {
        index: 200,
        view: node.id ? <FavoriteFolderOperation id={node.id} /> : null,
      },

      {
        index: 9999,
        view: <MenuSeparator key="menu-separator" />,
      },
      {
        index: 10000,
        view: (
          <MenuItem
            type={'danger'}
            prefixIcon={<DeleteIcon />}
            onClick={handleDelete}
          >
            {t['com.affine.rootAppSidebar.organize.delete']()}
          </MenuItem>
        ),
      },
    ];
  }, [
    handleAddToFolder,
    handleCreateSubfolder,
    handleDelete,
    handleNewDoc,
    node,
    t,
  ]);

  const finalOperations = useMemo(() => {
    if (additionalOperations) {
      return [...additionalOperations, ...folderOperations];
    }
    return folderOperations;
  }, [additionalOperations, folderOperations]);

  const childrenOperations = useCallback(
    // eslint-disable-next-line @typescript-eslint/ban-types
    (type: string, node: FolderNode) => {
      if (type === 'doc' || type === 'collection' || type === 'tag') {
        return [
          {
            index: 999,
            view: (
              <MenuItem
                type={'danger'}
                prefixIcon={<RemoveFolderIcon />}
                data-event-props="$.navigationPanel.organize.deleteOrganizeItem"
                data-event-args-type={node.type$.value}
                onClick={() => node.delete()}
              >
                {t['com.affine.rootAppSidebar.organize.delete-from-folder']()}
              </MenuItem>
            ),
          },
        ] satisfies NodeOperation[];
      }
      return [];
    },
    [t]
  );

  const handleCollapsedChange = useCallback((collapsed: boolean) => {
    if (collapsed) {
      setNewFolderId(null); // reset new folder id to clear the renaming state
      setCollapsed(true);
    } else {
      setCollapsed(false);
    }
  }, []);

  return (
    <ExplorerTreeNode
      icon={ExplorerFolderIcon}
      name={name}
      defaultRenaming={defaultRenaming}
      renameable
      extractEmojiAsIcon={enableEmojiIcon}
      collapsed={collapsed}
      setCollapsed={handleCollapsedChange}
      onRename={handleRename}
      operations={finalOperations}
      data-testid={`explorer-folder-${node.id}`}
    >
      {children.map(child => (
        <ExplorerFolderNode
          key={child.id}
          nodeId={child.id as string}
          defaultRenaming={child.id === newFolderId}
          operations={childrenOperations}
        />
      ))}
      <AddItemPlaceholder
        label={t['com.affine.rootAppSidebar.organize.folder.add-docs']()}
        onClick={() => handleAddToFolder('doc')}
      />
    </ExplorerTreeNode>
  );
};
