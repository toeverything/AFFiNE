import {
  type DropTargetDropEvent,
  IconButton,
  useDropTarget,
} from '@affine/component';
import { usePageHelper } from '@affine/core/components/blocksuite/block-suite-page-list/utils';
import {
  DropEffect,
  ExplorerTreeRoot,
} from '@affine/core/modules/explorer/views/tree';
import type { FavoriteSupportType } from '@affine/core/modules/favorite';
import {
  FavoriteService,
  isFavoriteSupportType,
} from '@affine/core/modules/favorite';
import { WorkbenchService } from '@affine/core/modules/workbench';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { isNewTabTrigger } from '@affine/core/utils';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { PlusIcon } from '@blocksuite/icons/rc';
import {
  useLiveData,
  useServices,
  WorkspaceService,
} from '@toeverything/infra';
import { type MouseEventHandler, useCallback } from 'react';

import { EXPLORER_KEY } from '../../../config';
import { ExplorerService } from '../../../services/explorer';
import { CollapsibleSection } from '../../layouts/collapsible-section';
import { ExplorerCollectionNode } from '../../nodes/collection';
import { ExplorerDocNode } from '../../nodes/doc';
import { ExplorerFolderNode } from '../../nodes/folder';
import { ExplorerTagNode } from '../../nodes/tag';
import {
  favoriteChildrenCanDrop,
  favoriteChildrenDropEffect,
  favoriteRootCanDrop,
  favoriteRootDropEffect,
} from './dnd';
import { RootEmpty } from './empty';

export const ExplorerFavorites = () => {
  const {
    favoriteService,
    workspaceService,
    workbenchService,
    explorerService,
  } = useServices({
    FavoriteService,
    WorkbenchService,
    WorkspaceService,
    ExplorerService,
  });

  const explorerSection = explorerService.sections.favorites;

  const favorites = useLiveData(favoriteService.favoriteList.sortedList$);

  const isLoading = useLiveData(favoriteService.favoriteList.isLoading$);

  const t = useI18n();

  const { createPage } = usePageHelper(
    workspaceService.workspace.docCollection
  );

  const handleDrop = useCallback(
    (data: DropTargetDropEvent<AffineDNDData>) => {
      if (
        data.source.data.entity?.type &&
        isFavoriteSupportType(data.source.data.entity.type)
      ) {
        favoriteService.favoriteList.add(
          data.source.data.entity.type,
          data.source.data.entity.id,
          favoriteService.favoriteList.indexAt('before')
        );
        track.$.navigationPanel.organize.toggleFavorite({
          type: data.source.data.entity.type,
          on: true,
        });
        explorerSection.setCollapsed(false);
      }
    },
    [explorerSection, favoriteService.favoriteList]
  );

  const handleCreateNewFavoriteDoc: MouseEventHandler = useCallback(
    e => {
      const newDoc = createPage();
      favoriteService.favoriteList.add(
        'doc',
        newDoc.id,
        favoriteService.favoriteList.indexAt('before')
      );
      workbenchService.workbench.openDoc(newDoc.id, {
        at: isNewTabTrigger(e) ? 'new-tab' : 'active',
      });
      explorerSection.setCollapsed(false);
    },
    [
      createPage,
      explorerSection,
      favoriteService.favoriteList,
      workbenchService.workbench,
    ]
  );

  const handleOnChildrenDrop = useCallback(
    (
      favorite: { id: string; type: FavoriteSupportType },
      data: DropTargetDropEvent<AffineDNDData>
    ) => {
      if (
        data.treeInstruction?.type === 'reorder-above' ||
        data.treeInstruction?.type === 'reorder-below'
      ) {
        if (
          data.source.data.from?.at === 'explorer:favorite:list' &&
          data.source.data.entity?.type &&
          isFavoriteSupportType(data.source.data.entity.type)
        ) {
          // is reordering
          favoriteService.favoriteList.reorder(
            data.source.data.entity.type,
            data.source.data.entity.id,
            favoriteService.favoriteList.indexAt(
              data.treeInstruction?.type === 'reorder-above'
                ? 'before'
                : 'after',
              favorite
            )
          );
          track.$.navigationPanel.organize.orderOrganizeItem({
            type: data.source.data.entity.type,
          });
        } else if (
          data.source.data.entity?.type &&
          isFavoriteSupportType(data.source.data.entity.type)
        ) {
          favoriteService.favoriteList.add(
            data.source.data.entity.type,
            data.source.data.entity.id,
            favoriteService.favoriteList.indexAt(
              data.treeInstruction?.type === 'reorder-above'
                ? 'before'
                : 'after',
              favorite
            )
          );
          track.$.navigationPanel.organize.toggleFavorite({
            type: data.source.data.entity.type,
            on: true,
          });
        } else {
          return; // not supported
        }
      }
    },
    [favoriteService]
  );

  const { dropTargetRef, draggedOverDraggable, draggedOverPosition } =
    useDropTarget<AffineDNDData>(
      () => ({
        data: {
          at: 'explorer:favorite:root',
        },
        onDrop: handleDrop,
        canDrop: favoriteRootCanDrop,
      }),
      [handleDrop]
    );

  return (
    <CollapsibleSection
      name="favorites"
      title={t['com.affine.rootAppSidebar.favorites']()}
      headerRef={dropTargetRef}
      testId="explorer-favorites"
      headerTestId="explorer-favorite-category-divider"
      actions={
        <>
          <IconButton
            data-testid="explorer-bar-add-favorite-button"
            data-event-props="$.navigationPanel.favorites.createDoc"
            data-event-args-control="addFavorite"
            onClick={handleCreateNewFavoriteDoc}
            onAuxClick={handleCreateNewFavoriteDoc}
            size="16"
            tooltip={t[
              'com.affine.rootAppSidebar.explorer.fav-section-add-tooltip'
            ]()}
          >
            <PlusIcon />
          </IconButton>
          {draggedOverDraggable && (
            <DropEffect
              position={draggedOverPosition}
              dropEffect={favoriteRootDropEffect({
                source: draggedOverDraggable,
                treeInstruction: null,
              })}
            />
          )}
        </>
      }
    >
      <ExplorerTreeRoot
        placeholder={<RootEmpty onDrop={handleDrop} isLoading={isLoading} />}
      >
        {favorites.map(favorite => (
          <ExplorerFavoriteNode
            key={favorite.id}
            favorite={favorite}
            onDrop={handleOnChildrenDrop}
          />
        ))}
      </ExplorerTreeRoot>
    </CollapsibleSection>
  );
};

const childLocation = {
  at: 'explorer:favorite:list' as const,
};
const ExplorerFavoriteNode = ({
  favorite,
  onDrop,
}: {
  favorite: {
    id: string;
    type: FavoriteSupportType;
  };
  onDrop: (
    favorite: {
      id: string;
      type: FavoriteSupportType;
    },
    data: DropTargetDropEvent<AffineDNDData>
  ) => void;
}) => {
  const handleOnChildrenDrop = useCallback(
    (data: DropTargetDropEvent<AffineDNDData>) => {
      onDrop(favorite, data);
    },
    [favorite, onDrop]
  );

  return favorite.type === 'doc' ? (
    <ExplorerDocNode
      key={favorite.id}
      docId={favorite.id}
      location={childLocation}
      onDrop={handleOnChildrenDrop}
      dropEffect={favoriteChildrenDropEffect}
      canDrop={favoriteChildrenCanDrop}
      explorerKey={EXPLORER_KEY.favorites}
    />
  ) : favorite.type === 'tag' ? (
    <ExplorerTagNode
      key={favorite.id}
      tagId={favorite.id}
      location={childLocation}
      onDrop={handleOnChildrenDrop}
      dropEffect={favoriteChildrenDropEffect}
      canDrop={favoriteChildrenCanDrop}
      explorerKey={EXPLORER_KEY.favorites}
    />
  ) : favorite.type === 'folder' ? (
    <ExplorerFolderNode
      key={favorite.id}
      nodeId={favorite.id}
      location={childLocation}
      onDrop={handleOnChildrenDrop}
      dropEffect={favoriteChildrenDropEffect}
      canDrop={favoriteChildrenCanDrop}
      explorerKey={EXPLORER_KEY.favorites}
    />
  ) : (
    <ExplorerCollectionNode
      key={favorite.id}
      collectionId={favorite.id}
      location={childLocation}
      onDrop={handleOnChildrenDrop}
      dropEffect={favoriteChildrenDropEffect}
      canDrop={favoriteChildrenCanDrop}
      explorerKey={EXPLORER_KEY.favorites}
    />
  );
};
