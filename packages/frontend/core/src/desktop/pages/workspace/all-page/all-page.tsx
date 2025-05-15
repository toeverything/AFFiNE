import {
  Button,
  Masonry,
  type MasonryGroup,
  useConfirmModal,
  usePromptModal,
} from '@affine/component';
import {
  createDocExplorerContext,
  DocExplorerContext,
} from '@affine/core/components/explorer/context';
import { DocListItem } from '@affine/core/components/explorer/docs-view/doc-list-item';
import { Filters } from '@affine/core/components/filter';
import { ListFloatingToolbar } from '@affine/core/components/page-list/components/list-floating-toolbar';
import { WorkspacePropertyTypes } from '@affine/core/components/workspace-property-types';
import {
  CollectionService,
  PinnedCollectionService,
} from '@affine/core/modules/collection';
import { CollectionRulesService } from '@affine/core/modules/collection-rules';
import type { FilterParams } from '@affine/core/modules/collection-rules/types';
import { DocsService } from '@affine/core/modules/doc';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import { Trans, useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
} from '../../../../modules/workbench';
import { AllPage as AllPageOld } from '../all-page-old/all-page';
import { AllDocSidebarTabs } from '../layouts/all-doc-sidebar-tabs';
import * as styles from './all-page.css';
import { AllDocsHeader } from './all-page-header';
import { MigrationAllDocsDataNotification } from './migration-data';
import { PinnedCollections } from './pinned-collections';

const GroupHeader = memo(function GroupHeader({
  groupId,
  collapsed,
  onCollapse,
  itemCount,
}: {
  groupId: string;
  collapsed?: boolean;
  onCollapse: (collapsed: boolean) => void;
  itemCount: number;
}) {
  const contextValue = useContext(DocExplorerContext);
  const propertyService = useService(WorkspacePropertyService);
  const allProperties = useLiveData(propertyService.sortedProperties$);
  const groupBy = useLiveData(contextValue.groupBy$);

  const groupType = groupBy?.type;
  const groupKey = groupBy?.key;

  const header = useMemo(() => {
    if (groupType === 'property') {
      const property = allProperties.find(p => p.id === groupKey);
      if (!property) return null;

      const config = WorkspacePropertyTypes[property.type];
      if (!config?.groupHeader) return null;
      return (
        <config.groupHeader
          groupId={groupId}
          docCount={itemCount}
          collapsed={!!collapsed}
          onCollapse={onCollapse}
        />
      );
    } else {
      return '// TODO: ' + groupType;
    }
  }, [
    allProperties,
    collapsed,
    groupId,
    groupKey,
    groupType,
    itemCount,
    onCollapse,
  ]);

  if (!groupType) {
    return null;
  }

  return header;
});

const calcCardHeightById = (id: string) => {
  const max = 5;
  const min = 1;
  const code = id.charCodeAt(0);
  const value = Math.floor((code % (max - min)) + min);
  return 250 + value * 10;
};

const DocListItemComponent = memo(function DocListItemComponent({
  itemId,
  groupId,
}: {
  groupId: string;
  itemId: string;
}) {
  return <DocListItem docId={itemId} groupId={groupId} />;
});

export const AllPage = () => {
  const t = useI18n();
  const docsService = useService(DocsService);
  const collectionService = useService(CollectionService);
  const pinnedCollectionService = useService(PinnedCollectionService);

  const isCollectionDataReady = useLiveData(
    collectionService.collectionDataReady$
  );

  const isPinnedCollectionDataReady = useLiveData(
    pinnedCollectionService.pinnedCollectionDataReady$
  );

  const pinnedCollections = useLiveData(
    pinnedCollectionService.pinnedCollections$
  );

  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | null
  >(null);
  const selectedCollection = useLiveData(
    selectedCollectionId
      ? collectionService.collection$(selectedCollectionId)
      : null
  );

  useEffect(() => {
    // if selected collection is not in pinned collections, set selected collection id to null
    if (
      isPinnedCollectionDataReady &&
      selectedCollectionId &&
      !pinnedCollections.some(c => c.collectionId === selectedCollectionId)
    ) {
      setSelectedCollectionId(null);
    }
  }, [isPinnedCollectionDataReady, pinnedCollections, selectedCollectionId]);

  useEffect(() => {
    // if selected collection is not found, set selected collection id to null
    if (!selectedCollection && selectedCollectionId && isCollectionDataReady) {
      setSelectedCollectionId(null);
    }
  }, [isCollectionDataReady, selectedCollection, selectedCollectionId]);

  const selectedCollectionInfo = useLiveData(
    selectedCollection ? selectedCollection.info$ : null
  );

  const [tempFilters, setTempFilters] = useState<FilterParams[] | null>(null);

  const [explorerContextValue] = useState(createDocExplorerContext);

  const view = useLiveData(explorerContextValue.view$);
  const groupBy = useLiveData(explorerContextValue.groupBy$);
  const orderBy = useLiveData(explorerContextValue.orderBy$);
  const groups = useLiveData(explorerContextValue.groups$);
  const selectedDocIds = useLiveData(explorerContextValue.selectedDocIds$);
  const selectMode = useLiveData(explorerContextValue.selectMode$);

  const { openPromptModal } = usePromptModal();
  const { openConfirmModal } = useConfirmModal();
  const masonryItems = useMemo(() => {
    const items = groups.map((group: any) => {
      return {
        id: group.key,
        items: group.items.map((docId: string) => {
          return {
            id: docId,
          };
        }),
      } satisfies MasonryGroup;
    });
    return items;
  }, [groups]);

  const collectionRulesService = useService(CollectionRulesService);
  useEffect(() => {
    const subscription = collectionRulesService
      .watch(
        selectedCollectionInfo
          ? {
              filters: tempFilters ?? selectedCollectionInfo.rules.filters,
              groupBy,
              orderBy,
              extraAllowList: selectedCollectionInfo.allowList,
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
            }
          : {
              filters:
                tempFilters && tempFilters.length > 0
                  ? tempFilters
                  : [
                      // if no filters are present, match all non-trash documents
                      {
                        type: 'system',
                        key: 'trash',
                        method: 'is',
                        value: 'false',
                      },
                    ],
              groupBy,
              orderBy,
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
            }
      )
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
    collectionRulesService,
    explorerContextValue,
    groupBy,
    orderBy,
    selectedCollection,
    selectedCollectionInfo,
    tempFilters,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        explorerContextValue.selectMode$.next(false);
        explorerContextValue.selectedDocIds$.next([]);
        explorerContextValue.prevCheckAnchorId$.next(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [explorerContextValue]);

  const handleFilterChange = useCallback((filters: FilterParams[]) => {
    setTempFilters(filters);
  }, []);

  const handleCloseFloatingToolbar = useCallback(() => {
    explorerContextValue.selectMode$.next(false);
    explorerContextValue.selectedDocIds$.next([]);
  }, [explorerContextValue]);

  const handleMultiDelete = useCallback(() => {
    if (selectedDocIds.length === 0) {
      return;
    }

    openConfirmModal({
      title: t['com.affine.moveToTrash.confirmModal.title.multiple']({
        number: selectedDocIds.length.toString(),
      }),
      description: t[
        'com.affine.moveToTrash.confirmModal.description.multiple'
      ]({
        number: selectedDocIds.length.toString(),
      }),
      cancelText: t['com.affine.confirmModal.button.cancel'](),
      confirmText: t.Delete(),
      confirmButtonOptions: {
        variant: 'error',
      },
      onConfirm: () => {
        for (const docId of selectedDocIds) {
          const doc = docsService.list.doc$(docId).value;
          doc?.moveToTrash();
        }
      },
    });
  }, [docsService.list, openConfirmModal, selectedDocIds, t]);

  const handleSelectCollection = useCallback((collectionId: string) => {
    setSelectedCollectionId(collectionId);
    setTempFilters(null);
  }, []);

  const handleEditCollection = useCallback(
    (collectionId: string) => {
      const collection = collectionService.collection$(collectionId).value;
      if (!collection) {
        return;
      }
      setSelectedCollectionId(collectionId);
      setTempFilters(collection.info$.value.rules.filters);
    },
    [collectionService]
  );

  const handleSaveFilters = useCallback(() => {
    if (selectedCollectionId) {
      collectionService.updateCollection(selectedCollectionId, {
        rules: {
          filters: tempFilters ?? [],
        },
      });
      setTempFilters(null);
    } else {
      openPromptModal({
        title: t['com.affine.editCollection.saveCollection'](),
        label: t['com.affine.editCollectionName.name'](),
        inputOptions: {
          placeholder: t['com.affine.editCollectionName.name.placeholder'](),
        },
        children: t['com.affine.editCollectionName.createTips'](),
        confirmText: t['com.affine.editCollection.save'](),
        cancelText: t['com.affine.editCollection.button.cancel'](),
        confirmButtonOptions: {
          variant: 'primary',
        },
        onConfirm(name) {
          const id = collectionService.createCollection({
            name,
            rules: {
              filters: tempFilters ?? [],
            },
          });
          pinnedCollectionService.addPinnedCollection({
            collectionId: id,
            index: pinnedCollectionService.indexAt('after'),
          });
          setTempFilters(null);
          setSelectedCollectionId(id);
        },
      });
    }
  }, [
    collectionService,
    openPromptModal,
    pinnedCollectionService,
    selectedCollectionId,
    t,
    tempFilters,
  ]);

  const handleNewTempFilter = useCallback((params: FilterParams) => {
    setSelectedCollectionId(null);
    setTempFilters([params]);
  }, []);

  return (
    <DocExplorerContext.Provider value={explorerContextValue}>
      <ViewTitle title={t['All pages']()} />
      <ViewIcon icon="allDocs" />
      <ViewHeader>
        <AllDocsHeader />
      </ViewHeader>
      <ViewBody>
        <div className={styles.body}>
          <MigrationAllDocsDataNotification />
          <div className={styles.pinnedCollection}>
            <PinnedCollections
              activeCollectionId={selectedCollectionId}
              onActiveAll={() => setSelectedCollectionId(null)}
              onActiveCollection={handleSelectCollection}
              onAddFilter={handleNewTempFilter}
              onEditCollection={handleEditCollection}
              hiddenAdd={tempFilters !== null}
            />
          </div>
          {tempFilters !== null && (
            <div className={styles.filterArea}>
              <Filters
                className={styles.filters}
                filters={tempFilters}
                onChange={handleFilterChange}
              />
              <Button
                variant="plain"
                onClick={() => {
                  setTempFilters(null);
                }}
              >
                {t['Cancel']()}
              </Button>
              <Button onClick={handleSaveFilters}>{t['save']()}</Button>
            </div>
          )}
          <div className={styles.scrollArea}>
            <Masonry
              items={masonryItems}
              gapY={12}
              gapX={12}
              groupsGap={12}
              groupHeaderGapWithItems={12}
              columns={view === 'list' ? 1 : undefined}
              itemWidthMin={220}
              preloadHeight={100}
              itemWidth={'stretch'}
              virtualScroll
              groupComponent={GroupHeader}
              itemComponent={DocListItemComponent}
              groupClassName={styles.groupHeader}
              itemClassName={styles.docItem}
              paddingX={useCallback(
                (w: number) => (w > 500 ? 24 : w > 393 ? 20 : 16),
                []
              )}
              groupHeight={groupBy ? 24 : 0}
              itemHeight={useMemo(
                () =>
                  view === 'list'
                    ? 42
                    : view === 'grid'
                      ? 280
                      : item => calcCardHeightById(item.id),
                [view]
              )}
            />
          </div>
        </div>
        <ListFloatingToolbar
          open={selectMode}
          onDelete={handleMultiDelete}
          onClose={handleCloseFloatingToolbar}
          content={
            <Trans
              i18nKey="com.affine.page.toolbar.selected"
              count={selectedDocIds.length}
            >
              <div style={{ color: cssVarV2.text.secondary }}>
                {{ count: selectedDocIds.length } as any}
              </div>
              selected
            </Trans>
          }
        />
      </ViewBody>
      <AllDocSidebarTabs />
    </DocExplorerContext.Provider>
  );
};

export const Component = () => {
  const featureFlagService = useService(FeatureFlagService);
  const enableNewAllDocsPage = useLiveData(
    featureFlagService.flags.enable_new_all_docs_page.$
  );

  return enableNewAllDocsPage ? <AllPage /> : <AllPageOld />;
};
