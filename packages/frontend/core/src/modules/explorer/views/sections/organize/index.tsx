import {
  type DropTargetDropEvent,
  type DropTargetOptions,
  IconButton,
  toast,
} from '@affine/component';
import { mixpanel } from '@affine/core/mixpanel';
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
import { useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ExplorerService } from '../../../services/explorer';
import { CollapsibleSection } from '../../layouts/collapsible-section';
import { ExplorerFolderNode } from '../../nodes/folder';
import { RootEmpty } from './empty';
import * as styles from './styles.css';

export const ExplorerOrganize = () => {
  const { organizeService, explorerService } = useServices({
    OrganizeService,
    ExplorerService,
  });
  const explorerSection = explorerService.sections.organize;
  const collapsed = useLiveData(explorerSection.collapsed$);
  const [newFolderId, setNewFolderId] = useState<string | null>(null);

  const t = useI18n();

  const rootFolder = organizeService.folderTree.rootFolder;

  const folders = useLiveData(rootFolder.sortedChildren$);
  const isLoading = useLiveData(organizeService.folderTree.isLoading$);

  const handleCreateFolder = useCallback(() => {
    const newFolderId = rootFolder.createFolder(
      'New Folder',
      rootFolder.indexAt('before')
    );
    mixpanel.track('FolderCreated', {
      page: 'sidebar',
      module: 'organize',
      control: 'new folder',
    });
    setNewFolderId(newFolderId);
    explorerSection.setCollapsed(false);
  }, [explorerSection, rootFolder]);

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
          mixpanel.track('FolderMoved', {
            page: 'sidebar',
            module: 'organize',
            control: 'drop at root',
            type: 'folder',
            id: node.id,
          });
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

  useEffect(() => {
    if (collapsed) setNewFolderId(null); // reset new folder id to clear the renaming state
  }, [collapsed]);

  return (
    <CollapsibleSection
      name="organize"
      headerClassName={styles.draggedOverHighlight}
      title={t['com.affine.rootAppSidebar.organize']()}
      actions={
        <IconButton
          data-testid="explorer-bar-add-organize-button"
          onClick={handleCreateFolder}
          size="16"
          tooltip={t[
            'com.affine.rootAppSidebar.explorer.organize-section-add-tooltip'
          ]()}
        >
          <PlusIcon />
        </IconButton>
      }
    >
      <ExplorerTreeRoot
        placeholder={
          <RootEmpty onClickCreate={handleCreateFolder} isLoading={isLoading} />
        }
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
    </CollapsibleSection>
  );
};
