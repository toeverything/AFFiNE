import {
  type DropTargetDropEvent,
  type DropTargetOptions,
  IconButton,
  toast,
} from '@affine/component';
import { NavigationPanelService } from '@affine/core/modules/navigation-panel';
import {
  type FolderNode,
  OrganizeService,
} from '@affine/core/modules/organize';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { AddOrganizeIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CollapsibleSection } from '../../layouts/collapsible-section';
import { NavigationPanelFolderNode } from '../../nodes/folder';
import { NavigationPanelTreeRoot } from '../../tree';
import { organizeChildrenDropEffect } from './dnd';
import { RootEmpty } from './empty';

export const NavigationPanelOrganize = () => {
  const { organizeService, navigationPanelService } = useServices({
    OrganizeService,
    NavigationPanelService,
  });
  const path = useMemo(() => ['organize'], []);
  const collapsed = useLiveData(navigationPanelService.collapsed$(path));
  const [newFolderId, setNewFolderId] = useState<string | null>(null);
  const t = useI18n();

  const folderTree = organizeService.folderTree;
  const rootFolder = folderTree.rootFolder;

  const folders = useLiveData(rootFolder.sortedChildren$);
  const isLoading = useLiveData(folderTree.isLoading$);

  const handleCreateFolder = useCallback(() => {
    const newFolderId = rootFolder.createFolder(
      'New Folder',
      rootFolder.indexAt('before')
    );
    track.$.navigationPanel.organize.createOrganizeItem({ type: 'folder' });
    setNewFolderId(newFolderId);
    navigationPanelService.setCollapsed(path, false);
    return newFolderId;
  }, [navigationPanelService, path, rootFolder]);

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
          track.$.navigationPanel.organize.moveOrganizeItem({ type: 'folder' });
        } else {
          toast(t['com.affine.rootAppSidebar.organize.root-folder-only']());
        }
      } else {
        return; // not supported
      }
    },
    [rootFolder, t]
  );

  const createFolderAndDrop = useCallback(
    (data: DropTargetDropEvent<AffineDNDData>) => {
      const newFolderId = handleCreateFolder();
      setNewFolderId(null);
      const newFolder$ = folderTree.folderNode$(newFolderId);

      const entity = data.source.data.entity;
      if (!entity) return;
      const { type, id } = entity;
      if (type !== 'doc' && type !== 'tag' && type !== 'collection') return;

      const folder = newFolder$.value;
      if (!folder) return;
      folder.createLink(type, id, folder.indexAt('after'));
    },
    [folderTree, handleCreateFolder]
  );

  const handleChildrenCanDrop = useMemo<
    DropTargetOptions<AffineDNDData>['canDrop']
  >(() => args => args.source.data.entity?.type === 'folder', []);

  useEffect(() => {
    if (collapsed) setNewFolderId(null); // reset new folder id to clear the renaming state
  }, [collapsed]);

  return (
    <CollapsibleSection
      path={path}
      title={t['com.affine.rootAppSidebar.organize']()}
      actions={
        <IconButton
          data-testid="navigation-panel-bar-add-organize-button"
          onClick={handleCreateFolder}
          size="16"
          tooltip={t[
            'com.affine.rootAppSidebar.explorer.organize-section-add-tooltip'
          ]()}
        >
          <AddOrganizeIcon />
        </IconButton>
      }
    >
      <NavigationPanelTreeRoot
        placeholder={
          <RootEmpty
            onClickCreate={handleCreateFolder}
            isLoading={isLoading}
            onDrop={createFolderAndDrop}
          />
        }
      >
        {folders.map(child => (
          <NavigationPanelFolderNode
            key={child.id}
            nodeId={child.id as string}
            defaultRenaming={child.id === newFolderId}
            onDrop={handleOnChildrenDrop}
            dropEffect={organizeChildrenDropEffect}
            canDrop={handleChildrenCanDrop}
            location={{
              at: 'navigation-panel:organize:folder-node',
              nodeId: child.id as string,
            }}
            parentPath={path}
          />
        ))}
      </NavigationPanelTreeRoot>
    </CollapsibleSection>
  );
};
