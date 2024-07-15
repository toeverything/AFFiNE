import {
  AnimatedFolderIcon,
  type DropTargetDropEvent,
  type DropTargetOptions,
  IconButton,
  MenuIcon,
  MenuItem,
  MenuSeparator,
} from '@affine/component';
import { type FolderNode } from '@affine/core/modules/organize';
import { WorkbenchService } from '@affine/core/modules/workbench';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { Unreachable } from '@affine/env/constant';
import { useI18n } from '@affine/i18n';
import {
  DeleteIcon,
  FolderIcon,
  PlusIcon,
  RemoveFolderIcon,
} from '@blocksuite/icons/rc';
import { DocsService, useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useMemo, useState } from 'react';

import { ExplorerTreeNode, type ExplorerTreeNodeDropEffect } from '../../tree';
import type { NodeOperation } from '../../tree/types';
import { ExplorerCollectionNode } from '../collection';
import { ExplorerDocNode } from '../doc';
import { ExplorerTagNode } from '../tag';
import { FolderEmpty } from './empty';

export const ExplorerFolderNode = ({
  node,
  onDrop,
  defaultRenaming,
  operations,
  dropEffect,
  canDrop,
}: {
  defaultRenaming?: boolean;
  node: FolderNode;
  onDrop?: (node: FolderNode, data: DropTargetDropEvent<AffineDNDData>) => void;
  canDrop?: DropTargetOptions<AffineDNDData>['canDrop'];
  operations?:
    | NodeOperation[]
    | ((type: string, node: FolderNode) => NodeOperation[]);
  dropEffect?: ExplorerTreeNodeDropEffect;
}) => {
  const type = useLiveData(node.type$);
  const data = useLiveData(node.data$);
  const handleDrop = useCallback(
    (data: DropTargetDropEvent<AffineDNDData>) => {
      onDrop?.(node, data);
    },
    [node, onDrop]
  );
  const additionalOperations = useMemo(() => {
    if (typeof operations === 'function') {
      return operations(type, node);
    }
    return operations;
  }, [node, operations, type]);
  if (type === 'folder') {
    return (
      <ExplorerFolderNodeFolder
        node={node}
        onDrop={handleDrop}
        defaultRenaming={defaultRenaming}
        operations={additionalOperations}
        dropEffect={dropEffect}
        canDrop={canDrop}
      />
    );
  } else if (type === 'doc') {
    return (
      data && (
        <ExplorerDocNode
          docId={data}
          location={{
            at: 'explorer:organize:folder-node',
            nodeId: node.id as string,
          }}
          onDrop={handleDrop}
          reorderable
          canDrop={canDrop}
          dropEffect={dropEffect}
          operations={additionalOperations}
        />
      )
    );
  } else if (type === 'collection') {
    return (
      data && (
        <ExplorerCollectionNode
          collectionId={data}
          location={{
            at: 'explorer:organize:folder-node',
            nodeId: node.id as string,
          }}
          onDrop={handleDrop}
          canDrop={canDrop}
          reorderable
          dropEffect={dropEffect}
          operations={additionalOperations}
        />
      )
    );
  } else if (type === 'tag') {
    return (
      data && (
        <ExplorerTagNode
          tagId={data}
          location={{
            at: 'explorer:organize:folder-node',
            nodeId: node.id as string,
          }}
          onDrop={handleDrop}
          canDrop={canDrop}
          reorderable
          dropEffect={dropEffect}
          operations={additionalOperations}
        />
      )
    );
  }

  return 'not-support';
};

const ExplorerFolderNodeFolder = ({
  node,
  onDrop,
  defaultRenaming,
  operations: additionalOperations,
  canDrop,
  dropEffect,
}: {
  defaultRenaming?: boolean;
  node: FolderNode;
  onDrop?: (data: DropTargetDropEvent<AffineDNDData>) => void;
  operations?: NodeOperation[];
  canDrop?: DropTargetOptions<AffineDNDData>['canDrop'];
  dropEffect?: ExplorerTreeNodeDropEffect;
}) => {
  const t = useI18n();
  const { docsService, workbenchService } = useServices({
    DocsService,
    WorkbenchService,
  });
  const name = useLiveData(node.name$);
  const [collapsed, setCollapsed] = useState(true);
  const [newFolderId, setNewFolderId] = useState<string | null>(null);

  const handleDelete = useCallback(() => {
    node.delete();
  }, [node]);

  const children = useLiveData(node.sortedChildren$);

  const dndData = useMemo(() => {
    if (!node.id) {
      throw new Unreachable();
    }
    return {
      draggable: {
        entity: {
          type: 'folder',
          id: node.id,
        },
        from: {
          at: 'explorer:organize:folder-node',
          nodeId: node.id,
        },
      },
      dropTarget: {
        at: 'explorer:organize:folder',
      },
    } satisfies AffineDNDData;
  }, [node.id]);

  const handleRename = useCallback(
    (newName: string) => {
      node.rename(newName);
    },
    [node]
  );

  const handleDropOnFolder = useCallback(
    (data: DropTargetDropEvent<AffineDNDData>) => {
      if (data.treeInstruction?.type === 'make-child') {
        if (data.source.data.from?.at === 'explorer:organize:folder-node') {
          node.moveHere(data.source.data.from.nodeId, node.indexAt('before'));
        } else if (
          data.source.data.entity?.type === 'collection' ||
          data.source.data.entity?.type === 'doc' ||
          data.source.data.entity?.type === 'tag'
        ) {
          node.createLink(
            data.source.data.entity?.type,
            data.source.data.entity.id,
            node.indexAt('before')
          );
        }
      } else {
        onDrop?.(data);
      }
    },
    [node, onDrop]
  );

  const handleDropEffect = useCallback<ExplorerTreeNodeDropEffect>(
    data => {
      if (data.treeInstruction?.type === 'make-child') {
        if (data.source.data.from?.at === 'explorer:organize:folder-node') {
          return 'move';
        } else if (
          data.source.data.entity?.type === 'collection' ||
          data.source.data.entity?.type === 'doc' ||
          data.source.data.entity?.type === 'tag'
        ) {
          return 'link';
        }
      } else {
        return dropEffect?.(data);
      }
      return;
    },
    [dropEffect]
  );

  const handleDropOnPlaceholder = useCallback(
    (data: DropTargetDropEvent<AffineDNDData>) => {
      if (data.source.data.from?.at === 'explorer:organize:folder-node') {
        node.moveHere(data.source.data.from.nodeId, node.indexAt('before'));
      } else if (
        data.source.data.entity?.type === 'collection' ||
        data.source.data.entity?.type === 'doc' ||
        data.source.data.entity?.type === 'tag'
      ) {
        node.createLink(
          data.source.data.entity?.type,
          data.source.data.entity.id,
          node.indexAt('before')
        );
      }
    },
    [node]
  );

  const handleDropOnChildren = useCallback(
    (dropAtNode: FolderNode, data: DropTargetDropEvent<AffineDNDData>) => {
      if (!dropAtNode.id) {
        return;
      }
      if (
        data.treeInstruction?.type === 'reorder-above' ||
        data.treeInstruction?.type === 'reorder-below'
      ) {
        const at =
          data.treeInstruction?.type === 'reorder-below' ? 'after' : 'before';
        if (data.source.data.from?.at === 'explorer:organize:folder-node') {
          node.moveHere(
            data.source.data.from.nodeId,
            node.indexAt(at, dropAtNode.id)
          );
        } else if (
          data.source.data.entity?.type === 'collection' ||
          data.source.data.entity?.type === 'doc' ||
          data.source.data.entity?.type === 'tag'
        ) {
          node.createLink(
            data.source.data.entity?.type,
            data.source.data.entity.id,
            node.indexAt(at, dropAtNode.id)
          );
        }
      } else if (data.treeInstruction?.type === 'reparent') {
        const currentLevel = data.treeInstruction.currentLevel;
        const desiredLevel = data.treeInstruction.desiredLevel;
        if (currentLevel === desiredLevel + 1) {
          onDrop?.({
            ...data,
            treeInstruction: {
              type: 'reorder-below',
              currentLevel,
              indentPerLevel: data.treeInstruction.indentPerLevel,
            },
          });
          return;
        } else {
          onDrop?.({
            ...data,
            treeInstruction: {
              ...data.treeInstruction,
              currentLevel: currentLevel - 1,
            },
          });
        }
      }
    },
    [node, onDrop]
  );

  const handleDropEffectOnChildren = useCallback<ExplorerTreeNodeDropEffect>(
    data => {
      if (
        data.treeInstruction?.type === 'reorder-above' ||
        data.treeInstruction?.type === 'reorder-below'
      ) {
        if (data.source.data.from?.at === 'explorer:organize:folder-node') {
          return 'move';
        } else if (
          data.source.data.entity?.type === 'collection' ||
          data.source.data.entity?.type === 'doc' ||
          data.source.data.entity?.type === 'tag'
        ) {
          return 'link';
        }
      } else if (data.treeInstruction?.type === 'reparent') {
        const currentLevel = data.treeInstruction.currentLevel;
        const desiredLevel = data.treeInstruction.desiredLevel;
        if (currentLevel === desiredLevel + 1) {
          dropEffect?.({
            ...data,
            treeInstruction: {
              type: 'reorder-below',
              currentLevel,
              indentPerLevel: data.treeInstruction.indentPerLevel,
            },
          });
          return;
        } else {
          dropEffect?.({
            ...data,
            treeInstruction: {
              ...data.treeInstruction,
              currentLevel: currentLevel - 1,
            },
          });
        }
      }
      return;
    },
    [dropEffect]
  );

  const handleCanDrop = useMemo<DropTargetOptions<AffineDNDData>['canDrop']>(
    () => args => {
      const entityType = args.source.data.entity?.type;
      return args.treeInstruction?.type !== 'make-child'
        ? (typeof canDrop === 'function' ? canDrop(args) : canDrop) ?? true
        : entityType === 'doc' ||
            entityType === 'collection' ||
            entityType === 'tag' ||
            entityType === 'folder';
    },
    [canDrop]
  );

  const handleNewDoc = useCallback(() => {
    const newDoc = docsService.createDoc();
    node.createLink('doc', newDoc.id, node.indexAt('before'));
    workbenchService.workbench.openDoc(newDoc.id);
    setCollapsed(false);
  }, [docsService, node, workbenchService.workbench]);

  const handleCreateSubfolder = useCallback(() => {
    const newFolderId = node.createFolder(
      t['com.affine.rootAppSidebar.organize.new-folders'](),
      node.indexAt('before')
    );
    setCollapsed(false);
    setNewFolderId(newFolderId);
  }, [node, t]);

  const folderOperations = useMemo(() => {
    return [
      {
        index: 0,
        inline: true,
        view: (
          <IconButton size="small" type="plain" onClick={handleNewDoc}>
            <PlusIcon />
          </IconButton>
        ),
      },
      {
        index: 100,
        view: (
          <MenuItem
            preFix={
              <MenuIcon>
                <FolderIcon />
              </MenuIcon>
            }
            onClick={handleCreateSubfolder}
          >
            {t['com.affine.rootAppSidebar.organize.folder.create-subfolder']()}
          </MenuItem>
        ),
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
            preFix={
              <MenuIcon>
                <DeleteIcon />
              </MenuIcon>
            }
            onClick={handleDelete}
          >
            {t['com.affine.rootAppSidebar.organize.delete']()}
          </MenuItem>
        ),
      },
    ];
  }, [handleCreateSubfolder, handleDelete, handleNewDoc, t]);

  const finalOperations = useMemo(() => {
    if (additionalOperations) {
      return [...additionalOperations, ...folderOperations];
    }
    return folderOperations;
  }, [additionalOperations, folderOperations]);

  const handleDeleteChildren = useCallback((node: FolderNode) => {
    node.delete();
  }, []);

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
                preFix={
                  <MenuIcon>
                    <RemoveFolderIcon />
                  </MenuIcon>
                }
                onClick={() => handleDeleteChildren(node)}
              >
                {t['com.affine.rootAppSidebar.organize.delete-from-folder']()}
              </MenuItem>
            ),
          },
        ] satisfies NodeOperation[];
      }
      return [];
    },
    [handleDeleteChildren, t]
  );

  return (
    <ExplorerTreeNode
      icon={({ draggedOver, className, treeInstruction }) => (
        <AnimatedFolderIcon
          className={className}
          closed={!!draggedOver && treeInstruction?.type === 'make-child'}
        />
      )}
      name={name}
      dndData={dndData}
      onDrop={handleDropOnFolder}
      defaultRenaming={defaultRenaming}
      renameable
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      onRename={handleRename}
      operations={finalOperations}
      canDrop={handleCanDrop}
      childrenPlaceholder={<FolderEmpty onDrop={handleDropOnPlaceholder} />}
      dropEffect={handleDropEffect}
    >
      {children.map((child, i) => (
        <ExplorerFolderNode
          key={child.id + ':' + i}
          node={child}
          defaultRenaming={child.id === newFolderId}
          onDrop={handleDropOnChildren}
          operations={childrenOperations}
          dropEffect={handleDropEffectOnChildren}
        />
      ))}
    </ExplorerTreeNode>
  );
};
