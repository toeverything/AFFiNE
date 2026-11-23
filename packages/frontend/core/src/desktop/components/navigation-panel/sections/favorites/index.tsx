import {
  type DropTargetDropEvent,
  IconButton,
  useDropTarget,
} from '@affine/component';
import { usePageHelper } from '@affine/core/blocksuite/block-suite-page-list/utils';
import type { FavoriteSupportTypeUnion } from '@affine/core/modules/favorite';
import {
  FavoriteService,
  isFavoriteSupportType,
} from '@affine/core/modules/favorite';
import { NavigationPanelService } from '@affine/core/modules/navigation-panel';
import { WorkspaceService } from '@affine/core/modules/workspace';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { inferOpenMode } from '@affine/core/utils';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { PlusIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { type MouseEventHandler, useCallback, useMemo } from 'react';

import { CollapsibleSection } from '../../layouts/collapsible-section';
import { NavigationPanelCollectionNode } from '../../nodes/collection';
import { NavigationPanelDocNode } from '../../nodes/doc';
import { NavigationPanelFolderNode } from '../../nodes/folder';
import { NavigationPanelTagNode } from '../../nodes/tag';
import { DropEffect, NavigationPanelTreeRoot } from '../../tree';
import {
  favoriteChildrenCanDrop,
  favoriteChildrenDropEffect,
  favoriteRootCanDrop,
  favoriteRootDropEffect,
} from './dnd';
import { RootEmpty } from './empty';

export const NavigationPanelFavorites = () => {
  const { favoriteService, workspaceService, navigationPanelService } =
    useServices({
      FavoriteService,
      WorkspaceService,
      NavigationPanelService,
    });

  const path = useMemo(() => ['favorites'], []);

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
        track.$.navigationPanel.favorites.drop({
          type: data.source.data.entity.type,
        });
        navigationPanelService.setCollapsed(path, false);
      }
    },
    [navigationPanelService, favoriteService.favoriteList, path]
  );

  const handleCreateNewFavoriteDoc: MouseEventHandler = useCallback(
    e => {
      const newDoc = createPage(undefined, { at: inferOpenMode(e) });
      favoriteService.favoriteList.add(
        'doc',
        newDoc.id,
        favoriteService.favoriteList.indexAt('before')
      );
      navigationPanelService.setCollapsed(path, false);
    },
    [createPage, navigationPanelService, favoriteService.favoriteList, path]
  );

  const handleOnChildrenDrop = useCallback(
    (
      favorite: { id: string; type: FavoriteSupportTypeUnion },
      data: DropTargetDropEvent<AffineDNDData>
    ) => {
      if (
        data.treeInstruction?.type === 'reorder-above' ||
        data.treeInstruction?.type === 'reorder-below'
      ) {
        if (
          data.source.data.from?.at === 'navigation-panel:favorite:list' &&
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
          track.$.navigationPanel.favorites.drop({
            type: data.source.data.entity.type,
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
          at: 'navigation-panel:favorite:root',
        },
        onDrop: handleDrop,
        canDrop: favoriteRootCanDrop,
        allowExternal: true,
      }),
      [handleDrop]
    );

  return (
    <CollapsibleSection
      path={path}
      title={t['com.affine.rootAppSidebar.favorites']()}
      headerRef={dropTargetRef}
      testId="navigation-panel-favorites"
      headerTestId="navigation-panel-favorite-category-divider"
      actions={
        <>
          <IconButton
            data-testid="navigation-panel-bar-add-favorite-button"
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
      <NavigationPanelTreeRoot
        placeholder={<RootEmpty onDrop={handleDrop} isLoading={isLoading} />}
      >
        {favorites.map(favorite => (
          <NavigationPanelFavoriteNode
            key={favorite.id}
            favorite={favorite}
            onDrop={handleOnChildrenDrop}
            parentPath={path}
          />
        ))}
      </NavigationPanelTreeRoot>
    </CollapsibleSection>
  );
};

const childLocation = {
  at: 'navigation-panel:favorite:list' as const,
};
const NavigationPanelFavoriteNode = ({
  favorite,
  onDrop,
  parentPath,
}: {
  favorite: {
    id: string;
    type: FavoriteSupportTypeUnion;
  };
  parentPath: string[];
  onDrop: (
    favorite: {
      id: string;
      type: FavoriteSupportTypeUnion;
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
    <NavigationPanelDocNode
      key={favorite.id}
      docId={favorite.id}
      location={childLocation}
      onDrop={handleOnChildrenDrop}
      dropEffect={favoriteChildrenDropEffect}
      canDrop={favoriteChildrenCanDrop}
      parentPath={parentPath}
    />
  ) : favorite.type === 'tag' ? (
    <NavigationPanelTagNode
      key={favorite.id}
      tagId={favorite.id}
      location={childLocation}
      onDrop={handleOnChildrenDrop}
      dropEffect={favoriteChildrenDropEffect}
      canDrop={favoriteChildrenCanDrop}
      parentPath={parentPath}
    />
  ) : favorite.type === 'folder' ? (
    <NavigationPanelFolderNode
      key={favorite.id}
      nodeId={favorite.id}
      location={childLocation}
      onDrop={handleOnChildrenDrop}
      dropEffect={favoriteChildrenDropEffect}
      canDrop={favoriteChildrenCanDrop}
      parentPath={parentPath}
    />
  ) : (
    <NavigationPanelCollectionNode
      key={favorite.id}
      collectionId={favorite.id}
      location={childLocation}
      onDrop={handleOnChildrenDrop}
      dropEffect={favoriteChildrenDropEffect}
      canDrop={favoriteChildrenCanDrop}
      parentPath={parentPath}
    />
  );
};
