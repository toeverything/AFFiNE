import { FlexWrapper } from '@affine/component';
import { EmptyCollectionDetail } from '@affine/core/components/affine/empty/collection-detail';
import {
  createDocExplorerContext,
  DocExplorerContext,
} from '@affine/core/components/explorer/context';
import type { DocListItemView } from '@affine/core/components/explorer/docs-view/doc-list-item';
import { DocsExplorer } from '@affine/core/components/explorer/docs-view/docs-list';
import type { ExplorerDisplayPreference } from '@affine/core/components/explorer/types';
import {
  type Collection,
  CollectionService,
} from '@affine/core/modules/collection';
import { CollectionRulesService } from '@affine/core/modules/collection-rules';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import {
  WorkspaceLocalState,
  WorkspaceService,
} from '@affine/core/modules/workspace';
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
import { PageNotFound } from '../../404';
import { AllDocSidebarTabs } from '../layouts/all-doc-sidebar-tabs';
import { CollectionDetailHeader } from './header';
import * as styles from './index.css';
import { CollectionListHeader } from './list-header';

const DefaultDisplayPreference: {
  [key in DocListItemView]: ExplorerDisplayPreference;
} = {
  grid: {
    view: 'grid',
    displayProperties: [
      'system:createdAt',
      'system:updatedAt',
      'system:createdBy',
      'system:tags',
    ],
    orderBy: {
      type: 'system',
      key: 'updatedAt',
      desc: true,
    },
    groupBy: undefined,
    showDocIcon: true,
    showDocPreview: true,
    quickFavorite: true,
    showDragHandle: true,
    showMoreOperation: true,
  },
  masonry: {
    view: 'masonry',
    displayProperties: [
      'system:createdAt',
      'system:updatedAt',
      'system:createdBy',
      'system:tags',
    ],
    orderBy: {
      type: 'system',
      key: 'updatedAt',
      desc: true,
    },
    groupBy: undefined,
    showDocIcon: true,
    showDocPreview: true,
    quickFavorite: true,
    showDragHandle: true,
    showMoreOperation: true,
  },
  list: {
    view: 'list',
    displayProperties: [
      'system:createdAt',
      'system:updatedAt',
      'system:createdBy',
      'system:tags',
    ],
    orderBy: {
      type: 'system',
      key: 'updatedAt',
      desc: true,
    },
    groupBy: {
      type: 'system',
      key: 'updatedAt',
    },
    showDocIcon: true,
    showDocPreview: true,
    quickFavorite: true,
    showDragHandle: true,
    showMoreOperation: true,
  },
};

export const CollectionDetail = ({
  collection,
}: {
  collection: Collection;
}) => {
  const collectionRulesService = useService(CollectionRulesService);

  const permissionService = useService(WorkspacePermissionService);
  const isAdmin = useLiveData(permissionService.permission.isAdmin$);
  const isOwner = useLiveData(permissionService.permission.isOwner$);

  const { viewMode, setViewMode, displayPreference, setDisplayPreference } =
    useCollectionsOptions(collection.id);
  const [explorerContextValue] = useState(
    createDocExplorerContext(displayPreference)
  );

  const groupBy = displayPreference.groupBy;
  const orderBy = displayPreference.orderBy;
  const rules = useLiveData(collection.rules$);
  const allowList = useLiveData(collection.allowList$);

  useEffect(() => {
    explorerContextValue.displayPreference$.next(displayPreference);
  }, [displayPreference, explorerContextValue]);

  useEffect(() => {
    const subscription = collectionRulesService
      .watch({
        filters: rules.filters,
        groupBy,
        orderBy,
        extraAllowList: allowList,
        extraFilters: [
          {
            type: 'system',
            key: 'empty-journal',
            method: 'is',
            value: 'false',
          },
          {
            type: 'system',
            key: 'trash',
            method: 'is',
            value: 'false',
          },
        ],
      })
      .subscribe({
        next: result => {
          explorerContextValue.groups$.next(result.groups);
        },
        error: error => {
          console.error(error);
        },
      });
    return () => {
      subscription.unsubscribe();
    };
  }, [
    allowList,
    collectionRulesService,
    explorerContextValue.groups$,
    groupBy,
    orderBy,
    rules.filters,
  ]);

  return (
    <DocExplorerContext.Provider value={explorerContextValue}>
      <ViewHeader>
        <CollectionDetailHeader
          viewMode={viewMode}
          setViewMode={setViewMode}
          displayPreference={displayPreference}
          onDisplayPreferenceChange={setDisplayPreference}
        />
      </ViewHeader>
      <ViewBody>
        <FlexWrapper flexDirection="column" alignItems="stretch" width="100%">
          <CollectionListHeader collection={collection} />
          <div className={styles.scrollArea}>
            <DocsExplorer disableMultiDelete={!isAdmin && !isOwner} />
          </div>
        </FlexWrapper>
      </ViewBody>
    </DocExplorerContext.Provider>
  );
};

export const Component = function CollectionPage() {
  const { collectionService, globalContextService } = useServices({
    CollectionService,
    GlobalContextService,
  });
  const globalContext = globalContextService.globalContext;
  const t = useI18n();
  const params = useParams();
  const collection = useLiveData(
    params.collectionId
      ? collectionService.collection$(params.collectionId)
      : null
  );
  const name = useLiveData(collection?.name$);
  const isActiveView = useIsActiveView();

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

  const info = useLiveData(collection?.info$);

  if (!collection) {
    return <PageNotFound />;
  }
  const inner =
    info?.allowList.length === 0 && info?.rules.filters.length === 0 ? (
      <Placeholder collection={collection} />
    ) : (
      <CollectionDetail collection={collection} />
    );

  return (
    <>
      <ViewIcon icon="collection" />
      <ViewTitle title={name ?? t['Untitled']()} />
      <AllDocSidebarTabs />
      {inner}
    </>
  );
};

const Placeholder = ({ collection }: { collection: Collection }) => {
  const workspace = useService(WorkspaceService).workspace;
  const { jumpToCollections } = useNavigateHelper();
  const t = useI18n();
  const name = useLiveData(collection?.name$);

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
            {name ?? t['Untitled']()}
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

const useCollectionsOptions = (collectionId: string) => {
  const workspaceLocalState = useService(WorkspaceLocalState);
  const viewModeKey = `collection${collectionId}Mode`;
  const displayPreferenceKey = `collection${collectionId}DisplayPreference:`;

  const readSavedViewMode = useCallback(() => {
    const saved = workspaceLocalState.get<DocListItemView>(viewModeKey);
    return saved ?? 'list';
  }, [workspaceLocalState, viewModeKey]);

  const readSavedDisplayPreference = useCallback(
    (mode: DocListItemView) => {
      const saved = workspaceLocalState.get<ExplorerDisplayPreference>(
        displayPreferenceKey + mode
      );
      return {
        ...DefaultDisplayPreference[mode],
        ...saved,
        view: mode,
      };
    },
    [workspaceLocalState, displayPreferenceKey]
  );

  const [viewMode, setViewMode] =
    useState<DocListItemView>(readSavedViewMode());

  const [displayPreference, setDisplayPreference] =
    useState<ExplorerDisplayPreference>(
      readSavedDisplayPreference(readSavedViewMode())
    );

  const handleViewModeChange = useCallback(
    (mode: DocListItemView) => {
      workspaceLocalState.set(viewModeKey, mode);
      setViewMode(mode);
      setDisplayPreference(readSavedDisplayPreference(mode));
    },
    [workspaceLocalState, readSavedDisplayPreference, viewModeKey]
  );

  const handleDisplayPreferenceChange = useCallback(
    (displayPreference: ExplorerDisplayPreference) => {
      workspaceLocalState.set(
        displayPreferenceKey + viewMode,
        displayPreference
      );
      setDisplayPreference(readSavedDisplayPreference(viewMode));
    },
    [
      viewMode,
      workspaceLocalState,
      displayPreferenceKey,
      readSavedDisplayPreference,
    ]
  );

  useEffect(() => {
    const view = readSavedViewMode();
    setViewMode(view);
    setDisplayPreference(readSavedDisplayPreference(view));
  }, [collectionId, readSavedViewMode, readSavedDisplayPreference]);

  return {
    viewMode,
    setViewMode: handleViewModeChange,
    displayPreference,
    setDisplayPreference: handleDisplayPreferenceChange,
  };
};
