import {
  type DropTargetDropEvent,
  type DropTargetOptions,
  IconButton,
  useDropTarget,
} from '@affine/component';
import { CategoryDivider } from '@affine/core/components/app-sidebar';
import {
  DropEffect,
  type ExplorerTreeNodeDropEffect,
  ExplorerTreeRoot,
} from '@affine/core/modules/explorer/views/tree';
import type { FavoriteSupportType } from '@affine/core/modules/favorite';
import {
  FavoriteService,
  isFavoriteSupportType,
} from '@affine/core/modules/favorite';
import { WorkbenchService } from '@affine/core/modules/workbench';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons/rc';
import { DocsService, useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { ExplorerCollectionNode } from '../../nodes/collection';
import { ExplorerDocNode } from '../../nodes/doc';
import { ExplorerFolderNode } from '../../nodes/folder';
import { ExplorerTagNode } from '../../nodes/tag';
import { RootEmpty } from './empty';
import * as styles from './styles.css';

export const ExplorerFavorites = () => {
  const { favoriteService, docsService, workbenchService } = useServices({
    FavoriteService,
    DocsService,
    WorkbenchService,
  });

  const favorites = useLiveData(favoriteService.favoriteList.sortedList$);

  const t = useI18n();

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
      }
    },
    [favoriteService]
  );

  const handleDropEffect = useCallback<ExplorerTreeNodeDropEffect>(data => {
    if (
      data.source.data.entity?.type &&
      isFavoriteSupportType(data.source.data.entity.type)
    ) {
      return 'link';
    }
    return;
  }, []);

  const handleCanDrop = useMemo<DropTargetOptions<AffineDNDData>['canDrop']>(
    () => data => {
      return data.source.data.entity?.type
        ? isFavoriteSupportType(data.source.data.entity.type)
        : false;
    },
    []
  );

  const handleCreateNewFavoriteDoc = useCallback(() => {
    const newDoc = docsService.createDoc();
    favoriteService.favoriteList.add(
      'doc',
      newDoc.id,
      favoriteService.favoriteList.indexAt('before')
    );
    workbenchService.workbench.openDoc(newDoc.id);
  }, [docsService, favoriteService, workbenchService]);

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
        } else {
          return; // not supported
        }
      }
    },
    [favoriteService]
  );

  const handleChildrenDropEffect = useCallback<ExplorerTreeNodeDropEffect>(
    data => {
      if (
        data.treeInstruction?.type === 'reorder-above' ||
        data.treeInstruction?.type === 'reorder-below'
      ) {
        if (
          data.source.data.from?.at === 'explorer:favorite:list' &&
          data.source.data.entity?.type &&
          isFavoriteSupportType(data.source.data.entity.type)
        ) {
          return 'move';
        } else if (
          data.source.data.entity?.type &&
          isFavoriteSupportType(data.source.data.entity.type)
        ) {
          return 'link';
        }
      }
      return; // not supported
    },
    []
  );

  const handleChildrenCanDrop = useMemo<
    DropTargetOptions<AffineDNDData>['canDrop']
  >(
    () => args =>
      args.source.data.entity?.type
        ? isFavoriteSupportType(args.source.data.entity.type)
        : false,
    []
  );

  const { dropTargetRef, draggedOverDraggable, draggedOverPosition } =
    useDropTarget<AffineDNDData>(
      () => ({
        data: {
          at: 'explorer:favorite:root',
        },
        onDrop: handleDrop,
        canDrop: handleCanDrop,
      }),
      [handleCanDrop, handleDrop]
    );

  return (
    <div className={styles.container} data-testid="explorer-favorites">
      <CategoryDivider
        className={styles.draggedOverHighlight}
        label={t['com.affine.rootAppSidebar.favorites']()}
        ref={dropTargetRef}
        data-testid="explorer-favorite-category-divider"
      >
        <IconButton
          data-testid="explorer-bar-add-favorite-button"
          onClick={handleCreateNewFavoriteDoc}
          size="small"
        >
          <PlusIcon />
        </IconButton>
        {draggedOverDraggable && (
          <DropEffect
            position={{
              x: draggedOverPosition.relativeX,
              y: draggedOverPosition.relativeY,
            }}
            dropEffect={handleDropEffect({
              source: draggedOverDraggable,
              treeInstruction: null,
            })}
          />
        )}
      </CategoryDivider>
      <ExplorerTreeRoot
        placeholder={
          <RootEmpty
            onDrop={handleDrop}
            canDrop={handleCanDrop}
            dropEffect={handleDropEffect}
          />
        }
      >
        {favorites.map(favorite => (
          <ExplorerFavoriteNode
            key={favorite.id}
            favorite={favorite}
            onDrop={handleOnChildrenDrop}
            dropEffect={handleChildrenDropEffect}
            canDrop={handleChildrenCanDrop}
          />
        ))}
      </ExplorerTreeRoot>
    </div>
  );
};

const childLocation = {
  at: 'explorer:favorite:list' as const,
};
const ExplorerFavoriteNode = ({
  favorite,
  onDrop,
  canDrop,
  dropEffect,
}: {
  favorite: {
    id: string;
    type: FavoriteSupportType;
  };
  canDrop?: DropTargetOptions<AffineDNDData>['canDrop'];
  onDrop: (
    favorite: {
      id: string;
      type: FavoriteSupportType;
    },
    data: DropTargetDropEvent<AffineDNDData>
  ) => void;
  dropEffect: ExplorerTreeNodeDropEffect;
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
      dropEffect={dropEffect}
      canDrop={canDrop}
    />
  ) : favorite.type === 'tag' ? (
    <ExplorerTagNode
      key={favorite.id}
      tagId={favorite.id}
      location={childLocation}
      onDrop={handleOnChildrenDrop}
      dropEffect={dropEffect}
      canDrop={canDrop}
    />
  ) : favorite.type === 'folder' ? (
    <ExplorerFolderNode
      key={favorite.id}
      nodeId={favorite.id}
      location={childLocation}
      onDrop={handleOnChildrenDrop}
      dropEffect={dropEffect}
      canDrop={canDrop}
    />
  ) : (
    <ExplorerCollectionNode
      key={favorite.id}
      collectionId={favorite.id}
      location={childLocation}
      onDrop={handleOnChildrenDrop}
      dropEffect={dropEffect}
      canDrop={canDrop}
    />
  );
};
