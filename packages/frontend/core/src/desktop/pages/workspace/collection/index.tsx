import { notify } from '@affine/component';
import { EmptyCollectionDetail } from '@affine/core/components/affine/empty/collection-detail';
import { VirtualizedPageList } from '@affine/core/components/page-list';
import { CollectionService } from '@affine/core/modules/collection';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { WorkspaceService } from '@affine/core/modules/workspace';
import type { Collection } from '@affine/env/filter';
import { useI18n } from '@affine/i18n';
import { ViewLayersIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService, useServices } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useNavigateHelper } from '../../../../components/hooks/use-navigate-helper';
import {
  useIsActiveView,
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
} from '../../../../modules/workbench';
import { AllDocSidebarTabs } from '../layouts/all-doc-sidebar-tabs';
import { CollectionDetailHeader } from './header';

export const CollectionDetail = ({
  collection,
}: {
  collection: Collection;
}) => {
  const { workspaceDialogService } = useServices({
    WorkspaceDialogService,
  });
  const permissionService = useService(WorkspacePermissionService);
  const isAdmin = useLiveData(permissionService.permission.isAdmin$);
  const isOwner = useLiveData(permissionService.permission.isOwner$);
  const [hideHeaderCreateNew, setHideHeaderCreateNew] = useState(true);

  const handleEditCollection = useCallback(() => {
    workspaceDialogService.open('collection-editor', {
      collectionId: collection.id,
    });
  }, [collection, workspaceDialogService]);

  return (
    <>
      <ViewHeader>
        <CollectionDetailHeader
          showCreateNew={!hideHeaderCreateNew}
          onCreate={handleEditCollection}
        />
      </ViewHeader>
      <ViewBody>
        <VirtualizedPageList
          collection={collection}
          setHideHeaderCreateNewPage={setHideHeaderCreateNew}
          disableMultiDelete={!isAdmin && !isOwner}
        />
      </ViewBody>
    </>
  );
};

export const Component = function CollectionPage() {
  const { collectionService, globalContextService } = useServices({
    CollectionService,
    GlobalContextService,
  });
  const globalContext = globalContextService.globalContext;

  const collections = useLiveData(collectionService.collections$);
  const navigate = useNavigateHelper();
  const params = useParams();
  const workspace = useService(WorkspaceService).workspace;
  const collection = collections.find(v => v.id === params.collectionId);
  const isActiveView = useIsActiveView();

  const notifyCollectionDeleted = useCallback(() => {
    navigate.jumpToPage(workspace.id, 'all');
    const collection = collectionService.collectionsTrash$.value.find(
      v => v.collection.id === params.collectionId
    );
    let text = 'Collection does not exist';
    if (collection) {
      if (collection.userId) {
        text = `${collection.collection.name} has been deleted by ${collection.userName}`;
      } else {
        text = `${collection.collection.name} has been deleted`;
      }
    }
    return notify.error({ title: text });
  }, [collectionService, navigate, params.collectionId, workspace.id]);

  useEffect(() => {
    if (isActiveView && collection) {
      globalContext.collectionId.set(collection.id);
      globalContext.isCollection.set(true);

      return () => {
        globalContext.collectionId.set(null);
        globalContext.isCollection.set(false);
      };
    }
    return;
  }, [collection, globalContext, isActiveView]);

  useEffect(() => {
    if (!collection) {
      notifyCollectionDeleted();
    }
  }, [collection, notifyCollectionDeleted]);

  if (!collection) {
    return null;
  }
  const inner = isEmptyCollection(collection) ? (
    <Placeholder collection={collection} />
  ) : (
    <CollectionDetail collection={collection} />
  );

  return (
    <>
      <ViewIcon icon="collection" />
      <ViewTitle title={collection.name} />
      <AllDocSidebarTabs />
      {inner}
    </>
  );
};

const Placeholder = ({ collection }: { collection: Collection }) => {
  const workspace = useService(WorkspaceService).workspace;
  const { jumpToCollections } = useNavigateHelper();
  const t = useI18n();

  const handleJumpToCollections = useCallback(() => {
    jumpToCollections(workspace.id);
  }, [jumpToCollections, workspace]);

  return (
    <>
      <ViewHeader>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 'var(--affine-font-xs)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              color: 'var(--affine-text-secondary-color)',
              ['WebkitAppRegion' as string]: 'no-drag',
            }}
            onClick={handleJumpToCollections}
          >
            <ViewLayersIcon
              style={{ color: 'var(--affine-icon-color)' }}
              fontSize={14}
            />
            {t['com.affine.collection.allCollections']()}
            <div>/</div>
          </div>
          <div
            data-testid="collection-name"
            style={{
              fontWeight: 600,
              color: 'var(--affine-text-primary-color)',
              ['WebkitAppRegion' as string]: 'no-drag',
            }}
          >
            {collection.name}
          </div>
          <div style={{ flex: 1 }} />
        </div>
      </ViewHeader>
      <ViewBody>
        <EmptyCollectionDetail
          collection={collection}
          style={{ height: '100%' }}
        />
      </ViewBody>
    </>
  );
};

export const isEmptyCollection = (collection: Collection) => {
  return (
    collection.allowList.length === 0 && collection.filterList.length === 0
  );
};
