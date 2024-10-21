import { Skeleton } from '@affine/component';
import {
  ExplorerService,
  ExplorerTreeRoot,
} from '@affine/core/modules/explorer';
import { OrganizeService } from '@affine/core/modules/organize';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import { AddItemPlaceholder } from '../../layouts/add-item-placeholder';
import { CollapsibleSection } from '../../layouts/collapsible-section';
import { ExplorerFolderNode } from '../../nodes/folder';

export const ExplorerOrganize = () => {
  const { organizeService, explorerService } = useServices({
    OrganizeService,
    ExplorerService,
  });
  const explorerSection = explorerService.sections.organize;
  const collapsed = useLiveData(explorerSection.collapsed$);
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
    explorerSection.setCollapsed(false);
    return newFolderId;
  }, [explorerSection, rootFolder]);

  useEffect(() => {
    if (collapsed) setNewFolderId(null); // reset new folder id to clear the renaming state
  }, [collapsed]);

  return (
    <CollapsibleSection
      name="organize"
      title={t['com.affine.rootAppSidebar.organize']()}
    >
      {/* TODO(@CatsJuice): Organize loading UI */}
      <ExplorerTreeRoot placeholder={isLoading ? <Skeleton /> : null}>
        {folders.map(child => (
          <ExplorerFolderNode
            key={child.id}
            nodeId={child.id as string}
            defaultRenaming={child.id === newFolderId}
          />
        ))}
        <AddItemPlaceholder
          data-testid="explorer-bar-add-organize-button"
          label={t['com.affine.rootAppSidebar.organize.add-folder']()}
          onClick={handleCreateFolder}
        />
      </ExplorerTreeRoot>
    </CollapsibleSection>
  );
};
