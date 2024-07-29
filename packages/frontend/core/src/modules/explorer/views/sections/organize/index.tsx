import {
  type DropTargetDropEvent,
  type DropTargetOptions,
  IconButton,
  toast,
} from '@affine/component';
import { CategoryDivider } from '@affine/core/components/app-sidebar';
import {
  type ExplorerTreeNodeDropEffect,
  ExplorerTreeRoot,
} from '@affine/core/modules/explorer/views/tree';
import {
  type FolderNode,
  OrganizeService,
} from '@affine/core/modules/organize';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useMemo, useState } from 'react';

import { ExplorerFolderNode } from '../../nodes/folder';
import { RootEmpty } from './empty';
import * as styles from './styles.css';

export const ExplorerOrganize = ({
  defaultCollapsed = false,
}: {
  defaultCollapsed?: boolean;
}) => {
  const { organizeService } = useServices({ OrganizeService });
  const [newFolderId, setNewFolderId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const t = useI18n();

  const rootFolder = organizeService.folderTree.rootFolder;

  const folders = useLiveData(rootFolder.sortedChildren$);

  const handleCreateFolder = useCallback(() => {
    const newFolderId = rootFolder.createFolder(
      'New Folder',
      rootFolder.indexAt('before')
    );
    setNewFolderId(newFolderId);
    setCollapsed(false);
  }, [rootFolder]);

  const handleOnChildrenDrop = useCallback(
    (data: DropTargetDropEvent<AffineDNDData>, node?: FolderNode) => {
      if (!node || !node.id) {
        return; // never happens
      }
      if (
        data.treeInstruction?.type === 'reorder-above' ||
        data.treeInstruction?.type === 'reorder-below'
      ) {
        const at =
          data.treeInstruction?.type === 'reorder-below' ? 'after' : 'before';
        if (data.source.data.entity?.type === 'folder') {
          rootFolder.moveHere(
            data.source.data.entity.id,
            rootFolder.indexAt(at, node.id)
          );
        } else {
          toast(t['com.affine.rootAppSidebar.organize.root-folder-only']());
        }
      } else {
        return; // not supported
      }
    },
    [rootFolder, t]
  );

  const handleChildrenDropEffect = useCallback<ExplorerTreeNodeDropEffect>(
    data => {
      if (
        data.treeInstruction?.type === 'reorder-above' ||
        data.treeInstruction?.type === 'reorder-below'
      ) {
        if (data.source.data.entity?.type === 'folder') {
          return 'move';
        }
      } else {
        return; // not supported
      }
      return;
    },
    []
  );

  const handleChildrenCanDrop = useMemo<
    DropTargetOptions<AffineDNDData>['canDrop']
  >(() => args => args.source.data.entity?.type === 'folder', []);

  return (
    <Collapsible.Root className={styles.container} open={!collapsed}>
      <CategoryDivider
        className={styles.draggedOverHighlight}
        label={t['com.affine.rootAppSidebar.organize']()}
        setCollapsed={setCollapsed}
        collapsed={collapsed}
      >
        <IconButton
          data-testid="explorer-bar-add-organize-button"
          onClick={handleCreateFolder}
          size="small"
        >
          <PlusIcon />
        </IconButton>
      </CategoryDivider>
      <Collapsible.Content>
        <ExplorerTreeRoot
          placeholder={<RootEmpty onClickCreate={handleCreateFolder} />}
        >
          {folders.map(child => (
            <ExplorerFolderNode
              key={child.id}
              nodeId={child.id as string}
              defaultRenaming={child.id === newFolderId}
              onDrop={handleOnChildrenDrop}
              dropEffect={handleChildrenDropEffect}
              canDrop={handleChildrenCanDrop}
              location={{
                at: 'explorer:organize:folder-node',
                nodeId: child.id as string,
              }}
            />
          ))}
        </ExplorerTreeRoot>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
