import {
  AffineShapeIcon,
  PageList,
  PageListScrollContainer,
} from '@affine/component/page-list';
import type { Collection, Filter } from '@affine/env/filter';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  CloseIcon,
  EdgelessIcon,
  FilterIcon,
  PageIcon,
  PlusIcon,
  ToggleCollapseIcon,
} from '@blocksuite/icons';
import type { PageMeta, Workspace } from '@blocksuite/store';
import { Button } from '@toeverything/components/button';
import { Menu } from '@toeverything/components/menu';
import { Modal } from '@toeverything/components/modal';
import clsx from 'clsx';
import { type MouseEvent, useEffect } from 'react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { RadioButton, RadioButtonGroup } from '../../..';
import { FilterList } from '../filter';
import { VariableSelect } from '../filter/vars';
import { filterPageByRules } from '../use-collection-manager';
import * as styles from './edit-collection.css';

export interface EditCollectionModalProps {
  init?: Collection;
  title?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (view: Collection) => Promise<void>;
  allPageListConfig: AllPageListConfig;
}

export const EditCollectionModal = ({
  init,
  onConfirm,
  open,
  onOpenChange,
  title,
  allPageListConfig,
}: EditCollectionModalProps) => {
  const t = useAFFiNEI18N();
  const onConfirmOnCollection = useCallback(
    (view: Collection) => {
      onConfirm(view)
        .then(() => {
          onOpenChange(false);
        })
        .catch(err => {
          console.error(err);
        });
    },
    [onConfirm, onOpenChange]
  );
  const onCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      withoutCloseButton
      width="calc(100% - 64px)"
      height="80%"
      contentOptions={{
        style: {
          padding: 0,
          maxWidth: 944,
          backgroundColor: 'var(--affine-white)',
        },
      }}
    >
      {init ? (
        <EditCollection
          title={title}
          onConfirmText={t['com.affine.editCollection.save']()}
          init={init}
          onCancel={onCancel}
          onConfirm={onConfirmOnCollection}
          allPageListConfig={allPageListConfig}
        />
      ) : null}
    </Modal>
  );
};

export interface EditCollectionProps {
  title?: string;
  onConfirmText?: string;
  init: Collection;
  onCancel: () => void;
  onConfirm: (collection: Collection) => void;
  allPageListConfig: AllPageListConfig;
}

export const EditCollection = ({
  init,
  onConfirm,
  onCancel,
  onConfirmText,
  allPageListConfig,
}: EditCollectionProps) => {
  const t = useAFFiNEI18N();
  const [value, onChange] = useState<Collection>(init);
  const isNameEmpty = useMemo(() => value.name.trim().length === 0, [value]);
  const onSaveCollection = useCallback(() => {
    if (!isNameEmpty) {
      onConfirm(value);
    }
  }, [value, isNameEmpty, onConfirm]);
  const reset = useCallback(() => {
    onChange({
      ...value,
      filterList: init.filterList,
      allowList: init.allowList,
    });
  }, [init.allowList, init.filterList, value]);
  const buttons = useMemo(
    () => (
      <>
        <Button size="large" onClick={onCancel}>
          {t['com.affine.editCollection.button.cancel']()}
        </Button>
        <Button
          className={styles.confirmButton}
          size="large"
          data-testid="save-collection"
          type="primary"
          disabled={isNameEmpty}
          onClick={onSaveCollection}
        >
          {onConfirmText ?? t['com.affine.editCollection.button.create']()}
        </Button>
      </>
    ),
    [onCancel, t, isNameEmpty, onSaveCollection, onConfirmText]
  );

  return (
    <div className={styles.collectionEditContainer}>
      {value.mode === 'page' ? (
        <PagesMode
          collection={value}
          updateCollection={onChange}
          buttons={buttons}
          allPageListConfig={allPageListConfig}
        ></PagesMode>
      ) : (
        <RulesMode
          allPageListConfig={allPageListConfig}
          collection={value}
          reset={reset}
          updateCollection={onChange}
          buttons={buttons}
        ></RulesMode>
      )}
    </div>
  );
};

export type AllPageListConfig = {
  allPages: PageMeta[];
  workspace: Workspace;
  isEdgeless: (id: string) => boolean;
  getPage: (id: string) => PageMeta | undefined;
  favoriteRender: (page: PageMeta) => ReactNode;
};
const RulesMode = ({
  collection,
  updateCollection,
  reset,
  buttons,
  allPageListConfig,
}: {
  collection: Collection;
  updateCollection: (collection: Collection) => void;
  reset: () => void;
  buttons: ReactNode;
  allPageListConfig: AllPageListConfig;
}) => {
  const t = useAFFiNEI18N();
  const [showPreview, setShowPreview] = useState(true);
  const allowListPages: PageMeta[] = [];
  const rulesPages: PageMeta[] = [];
  const [showTips, setShowTips] = useState(false);
  useEffect(() => {
    setShowTips(!localStorage.getItem('hide-rules-mode-include-page-tips'));
  }, []);
  const hideTips = useCallback(() => {
    setShowTips(false);
    localStorage.setItem('hide-rules-mode-include-page-tips', 'true');
  }, []);
  allPageListConfig.allPages.forEach(v => {
    if (v.trash) {
      return;
    }
    const result = filterPageByRules(
      collection.filterList,
      collection.allowList,
      v
    );
    if (result) {
      if (collection.allowList.includes(v.id)) {
        allowListPages.push(v);
      } else {
        rulesPages.push(v);
      }
    }
  });
  const { node: selectPageNode, open } = useSelectPage({ allPageListConfig });
  const openSelectPage = useCallback(() => {
    open(collection.allowList).then(
      ids => {
        updateCollection({
          ...collection,
          allowList: ids,
        });
      },
      () => {
        //do nothing
      }
    );
  }, [open, updateCollection, collection]);
  const [expandInclude, setExpandInclude] = useState(false);
  const count = allowListPages.length + rulesPages.length;
  return (
    <>
      <div className={clsx(styles.rulesTitle, styles.ellipsis)}>
        <Trans
          i18nKey="com.affine.editCollection.rules.tips"
          values={{
            highlight: t['com.affine.editCollection.rules.tips.highlight'](),
          }}
        >
          Pages that meet the rules will be added to the current collection{' '}
          <span className={styles.rulesTitleHighlight}>highlight</span>.
        </Trans>
      </div>
      <div className={styles.rulesContainer}>
        <div className={styles.rulesContainerLeft}>
          <div className={styles.rulesContainerLeftTab}>
            <RadioButtonGroup
              width={158}
              style={{ height: 32 }}
              value={collection.mode}
              onValueChange={useCallback(
                (mode: 'page' | 'rule') => {
                  updateCollection({
                    ...collection,
                    mode,
                  });
                },
                [collection, updateCollection]
              )}
            >
              <RadioButton
                spanStyle={styles.tabButton}
                value="page"
                data-testid="edit-collection-pages-button"
              >
                {t['com.affine.editCollection.pages']()}
              </RadioButton>
              <RadioButton
                spanStyle={styles.tabButton}
                value="rule"
                data-testid="edit-collection-rules-button"
              >
                {t['com.affine.editCollection.rules']()}
              </RadioButton>
            </RadioButtonGroup>
          </div>
          <div className={styles.rulesContainerLeftContent}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                overflowY: 'auto',
              }}
            >
              <FilterList
                propertiesMeta={allPageListConfig.workspace.meta.properties}
                value={collection.filterList}
                onChange={useCallback(
                  filterList => updateCollection({ ...collection, filterList }),
                  [collection, updateCollection]
                )}
              />
              <div className={styles.rulesContainerLeftContentInclude}>
                <div className={styles.includeTitle}>
                  <ToggleCollapseIcon
                    onClick={() => setExpandInclude(!expandInclude)}
                    className={styles.button}
                    width={24}
                    height={24}
                    style={{
                      transform: expandInclude ? 'rotate(90deg)' : undefined,
                    }}
                  ></ToggleCollapseIcon>
                  <div style={{ color: 'var(--affine-text-secondary-color)' }}>
                    include
                  </div>
                </div>
                <div
                  style={{
                    display: expandInclude ? 'flex' : 'none',
                    flexWrap: 'wrap',
                    gap: '8px 16px',
                  }}
                >
                  {collection.allowList.map(id => {
                    const page = allPageListConfig.allPages.find(
                      v => v.id === id
                    );
                    return (
                      <div className={styles.includeItem} key={id}>
                        <div className={styles.includeItemContent}>
                          <div
                            style={{
                              display: 'flex',
                              gap: 6,
                              alignItems: 'center',
                            }}
                          >
                            {allPageListConfig.isEdgeless(id) ? (
                              <EdgelessIcon style={{ width: 16, height: 16 }} />
                            ) : (
                              <PageIcon style={{ width: 16, height: 16 }} />
                            )}
                            {t[
                              'com.affine.editCollection.rules.include.page'
                            ]()}
                          </div>
                          <div className={styles.includeItemContentIs}>
                            {t['com.affine.editCollection.rules.include.is']()}
                          </div>
                          <div
                            className={clsx(
                              styles.includeItemTitle,
                              styles.ellipsis
                            )}
                          >
                            {page?.title || t['Untitled']()}
                          </div>
                        </div>
                        <CloseIcon
                          className={styles.button}
                          onClick={() => {
                            updateCollection({
                              ...collection,
                              allowList: collection.allowList.filter(
                                v => v !== id
                              ),
                            });
                          }}
                        ></CloseIcon>
                      </div>
                    );
                  })}
                  <div
                    onClick={openSelectPage}
                    className={clsx(styles.button, styles.includeAddButton)}
                  >
                    <PlusIcon></PlusIcon>
                    <div
                      style={{ color: 'var(--affine-text-secondary-color)' }}
                    >
                      {t['com.affine.editCollection.rules.include.add']()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {showTips ? (
              <div
                style={{
                  marginTop: 16,
                  borderRadius: 8,
                  backgroundColor:
                    'var(--affine-background-overlay-panel-color)',
                  padding: 10,
                  fontSize: 12,
                  lineHeight: '20px',
                }}
              >
                <div
                  style={{
                    marginBottom: 14,
                    fontWeight: 600,
                    color: 'var(--affine-text-secondary-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>{t['com.affine.collection.helpInfo']()}</div>
                  <CloseIcon
                    color="var(--affine-icon-color)"
                    onClick={hideTips}
                    className={styles.button}
                    style={{ width: 16, height: 16 }}
                  />
                </div>
                <div style={{ marginBottom: 10, fontWeight: 600 }}>
                  {t['com.affine.editCollection.rules.include.tipsTitle']()}
                </div>
                <div>{t['com.affine.editCollection.rules.include.tips']()}</div>
              </div>
            ) : null}
          </div>
        </div>
        <PageListScrollContainer
          className={styles.rulesContainerRight}
          style={{
            display: showPreview ? 'flex' : 'none',
          }}
        >
          {rulesPages.length > 0 ? (
            <PageList
              hideHeader
              clickMode="select"
              className={styles.resultPages}
              pages={rulesPages}
              groupBy={false}
              blockSuiteWorkspace={allPageListConfig.workspace}
              isPreferredEdgeless={allPageListConfig.isEdgeless}
              pageOperationsRenderer={allPageListConfig.favoriteRender}
            ></PageList>
          ) : null}
          {allowListPages.length > 0 ? (
            <div>
              <div className={styles.includeListTitle}>include</div>
              <PageList
                hideHeader
                clickMode="select"
                className={styles.resultPages}
                pages={allowListPages}
                groupBy={false}
                blockSuiteWorkspace={allPageListConfig.workspace}
                isPreferredEdgeless={allPageListConfig.isEdgeless}
              ></PageList>
            </div>
          ) : null}
        </PageListScrollContainer>
      </div>
      <div className={styles.rulesBottom}>
        <div className={styles.bottomLeft}>
          <div
            className={clsx(
              styles.button,
              styles.bottomButton,
              showPreview && styles.previewActive
            )}
            onClick={() => {
              setShowPreview(!showPreview);
            }}
          >
            {t['com.affine.editCollection.rules.preview']()}
          </div>
          <div
            className={clsx(styles.button, styles.bottomButton)}
            onClick={reset}
          >
            {t['com.affine.editCollection.rules.reset']()}
          </div>
          <div className={styles.previewCountTips}>
            <Trans
              i18nKey={
                count === 0
                  ? 'com.affine.editCollection.rules.countTips.zero'
                  : count === 1
                  ? 'com.affine.editCollection.rules.countTips.one'
                  : 'com.affine.editCollection.rules.countTips.more'
              }
              values={{ count: count }}
            >
              After searching, there are currently
              <span className={styles.previewCountTipsHighlight}>count</span>
              pages.
            </Trans>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>{buttons}</div>
      </div>
      {selectPageNode}
    </>
  );
};
const PagesMode = ({
  collection,
  updateCollection,
  buttons,
  allPageListConfig,
}: {
  collection: Collection;
  updateCollection: (collection: Collection) => void;
  buttons: ReactNode;
  allPageListConfig: AllPageListConfig;
}) => {
  const t = useAFFiNEI18N();
  const {
    showFilter,
    filters,
    updateFilters,
    clickFilter,
    createFilter,
    filteredList,
  } = useFilter(allPageListConfig.allPages);
  const { searchText, updateSearchText, searchedList } =
    useSearch(filteredList);
  const clearSelected = useCallback(() => {
    updateCollection({
      ...collection,
      pages: [],
    });
  }, [collection, updateCollection]);
  const pageOperationsRenderer = useCallback(
    (page: PageMeta) => allPageListConfig.favoriteRender(page),
    [allPageListConfig]
  );
  return (
    <>
      <input
        value={searchText}
        onChange={e => updateSearchText(e.target.value)}
        className={styles.rulesTitle}
        placeholder={t['com.affine.editCollection.search.placeholder']()}
      ></input>
      <div className={styles.pagesList}>
        <div className={styles.pagesTab}>
          <div className={styles.pagesTabContent}>
            <RadioButtonGroup
              width={158}
              style={{ height: 32 }}
              value={collection.mode}
              onValueChange={useCallback(
                (mode: 'page' | 'rule') => {
                  updateCollection({
                    ...collection,
                    mode,
                  });
                },
                [collection, updateCollection]
              )}
            >
              <RadioButton
                spanStyle={styles.tabButton}
                value="page"
                data-testid="edit-collection-pages-button"
              >
                {t['com.affine.editCollection.pages']()}
              </RadioButton>
              <RadioButton
                spanStyle={styles.tabButton}
                value="rule"
                data-testid="edit-collection-rules-button"
              >
                {t['com.affine.editCollection.rules']()}
              </RadioButton>
            </RadioButtonGroup>
            {!showFilter && filters.length === 0 ? (
              <Menu
                items={
                  <VariableSelect
                    propertiesMeta={allPageListConfig.workspace.meta.properties}
                    selected={filters}
                    onSelect={createFilter}
                  />
                }
              >
                <div>
                  <FilterIcon
                    className={clsx(styles.icon, styles.button)}
                    onClick={clickFilter}
                    width={24}
                    height={24}
                  ></FilterIcon>
                </div>
              </Menu>
            ) : (
              <FilterIcon
                className={clsx(styles.icon, styles.button)}
                onClick={clickFilter}
                width={24}
                height={24}
              ></FilterIcon>
            )}
          </div>
          {showFilter ? (
            <div style={{ padding: '12px 16px 16px' }}>
              <FilterList
                propertiesMeta={allPageListConfig.workspace.meta.properties}
                value={filters}
                onChange={updateFilters}
              />
            </div>
          ) : null}
          {searchedList.length ? (
            <PageListScrollContainer>
              <PageList
                clickMode="select"
                className={styles.pageList}
                pages={searchedList}
                groupBy={false}
                blockSuiteWorkspace={allPageListConfig.workspace}
                selectable
                onSelectedPageIdsChange={ids => {
                  updateCollection({
                    ...collection,
                    pages: ids,
                  });
                }}
                pageOperationsRenderer={pageOperationsRenderer}
                selectedPageIds={collection.pages}
                isPreferredEdgeless={allPageListConfig.isEdgeless}
              ></PageList>
            </PageListScrollContainer>
          ) : (
            <EmptyList search={searchText} />
          )}
        </div>
      </div>
      <div className={styles.pagesBottom}>
        <div className={styles.pagesBottomLeft}>
          <div className={styles.selectedCountTips}>
            {t['com.affine.selectPage.selected']()}
            <span
              style={{ marginLeft: 7 }}
              className={styles.previewCountTipsHighlight}
            >
              {collection.pages.length}
            </span>
          </div>
          <div
            className={clsx(styles.button, styles.bottomButton)}
            style={{ fontSize: 12, lineHeight: '20px' }}
            onClick={clearSelected}
          >
            {t['com.affine.editCollection.pages.clear']()}
          </div>
        </div>
        <div>{buttons}</div>
      </div>
    </>
  );
};
const SelectPage = ({
  allPageListConfig,
  init,
  onConfirm,
  onCancel,
}: {
  allPageListConfig: AllPageListConfig;
  init: string[];
  onConfirm: (pageIds: string[]) => void;
  onCancel: () => void;
}) => {
  const t = useAFFiNEI18N();
  const [value, onChange] = useState(init);
  const confirm = useCallback(() => {
    onConfirm(value);
  }, [value, onConfirm]);
  const clearSelected = useCallback(() => {
    onChange([]);
  }, []);
  const {
    clickFilter,
    createFilter,
    filters,
    showFilter,
    updateFilters,
    filteredList,
  } = useFilter(allPageListConfig.allPages);
  const { searchText, updateSearchText, searchedList } =
    useSearch(filteredList);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <input
        className={styles.rulesTitle}
        value={searchText}
        onChange={e => updateSearchText(e.target.value)}
        placeholder={t['com.affine.editCollection.search.placeholder']()}
      ></input>
      <div className={styles.pagesTab}>
        <div className={styles.pagesTabContent}>
          <div style={{ fontSize: 12, lineHeight: '20px', fontWeight: 600 }}>
            {t['com.affine.selectPage.title']()}
          </div>
          {!showFilter && filters.length === 0 ? (
            <Menu
              items={
                <VariableSelect
                  propertiesMeta={allPageListConfig.workspace.meta.properties}
                  selected={filters}
                  onSelect={createFilter}
                />
              }
            >
              <div>
                <FilterIcon
                  className={clsx(styles.icon, styles.button)}
                  onClick={clickFilter}
                  width={24}
                  height={24}
                ></FilterIcon>
              </div>
            </Menu>
          ) : (
            <FilterIcon
              className={clsx(styles.icon, styles.button)}
              onClick={clickFilter}
              width={24}
              height={24}
            ></FilterIcon>
          )}
        </div>
        {showFilter ? (
          <div style={{ padding: '12px 16px 16px' }}>
            <FilterList
              propertiesMeta={allPageListConfig.workspace.meta.properties}
              value={filters}
              onChange={updateFilters}
            />
          </div>
        ) : null}
        {searchedList.length ? (
          <PageListScrollContainer>
            <PageList
              clickMode="select"
              className={styles.pageList}
              pages={searchedList}
              blockSuiteWorkspace={allPageListConfig.workspace}
              selectable
              onSelectedPageIdsChange={onChange}
              selectedPageIds={value}
              isPreferredEdgeless={allPageListConfig.isEdgeless}
              pageOperationsRenderer={allPageListConfig.favoriteRender}
            ></PageList>
          </PageListScrollContainer>
        ) : (
          <EmptyList search={searchText} />
        )}
      </div>
      <div className={styles.pagesBottom}>
        <div className={styles.pagesBottomLeft}>
          <div className={styles.selectedCountTips}>
            {t['com.affine.selectPage.selected']()}
            <span
              style={{ marginLeft: 7 }}
              className={styles.previewCountTipsHighlight}
            >
              {value.length}
            </span>
          </div>
          <div
            className={clsx(styles.button, styles.bottomButton)}
            style={{ fontSize: 12, lineHeight: '20px' }}
            onClick={clearSelected}
          >
            {t['com.affine.editCollection.pages.clear']()}
          </div>
        </div>
        <div>
          <Button size="large" onClick={onCancel}>
            {t['com.affine.editCollection.button.cancel']()}
          </Button>
          <Button
            className={styles.confirmButton}
            size="large"
            data-testid="save-collection"
            type="primary"
            onClick={confirm}
          >
            {t['Confirm']()}
          </Button>
        </div>
      </div>
    </div>
  );
};
const useSelectPage = ({
  allPageListConfig,
}: {
  allPageListConfig: AllPageListConfig;
}) => {
  const [value, onChange] = useState<{
    init: string[];
    onConfirm: (ids: string[]) => void;
  }>();
  const close = useCallback(() => {
    onChange(undefined);
  }, []);
  return {
    node: (
      <Modal
        open={!!value}
        onOpenChange={close}
        withoutCloseButton
        width="calc(100% - 32px)"
        height="80%"
        overlayOptions={{ style: { backgroundColor: 'transparent' } }}
        contentOptions={{
          style: {
            padding: 0,
            transform: 'translate(-50%,calc(-50% + 16px))',
            maxWidth: 976,
            backgroundColor: 'var(--affine-white)',
          },
        }}
      >
        {value ? (
          <SelectPage
            allPageListConfig={allPageListConfig}
            init={value.init}
            onConfirm={value.onConfirm}
            onCancel={close}
          />
        ) : null}
      </Modal>
    ),
    open: (init: string[]): Promise<string[]> =>
      new Promise<string[]>(res => {
        onChange({
          init,
          onConfirm: list => {
            close();
            res(list);
          },
        });
      }),
  };
};
const useFilter = (list: PageMeta[]) => {
  const [filters, changeFilters] = useState<Filter[]>([]);
  const [showFilter, setShowFilter] = useState(false);
  const clickFilter = useCallback(
    (e: MouseEvent) => {
      if (showFilter || filters.length !== 0) {
        e.stopPropagation();
        e.preventDefault();
        setShowFilter(!showFilter);
      }
    },
    [filters.length, showFilter]
  );
  const onCreateFilter = useCallback(
    (filter: Filter) => {
      changeFilters([...filters, filter]);
      setShowFilter(true);
    },
    [filters]
  );
  return {
    showFilter,
    filters,
    updateFilters: changeFilters,
    clickFilter,
    createFilter: onCreateFilter,
    filteredList: list.filter(v => {
      if (v.trash) {
        return false;
      }
      return filterPageByRules(filters, [], v);
    }),
  };
};
const useSearch = (list: PageMeta[]) => {
  const [value, onChange] = useState('');
  return {
    searchText: value,
    updateSearchText: onChange,
    searchedList: value
      ? list.filter(v => v.title.toLowerCase().includes(value.toLowerCase()))
      : list,
  };
};
const EmptyList = ({ search }: { search?: string }) => {
  const t = useAFFiNEI18N();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        flex: 1,
      }}
    >
      <AffineShapeIcon />
      <div
        style={{
          margin: '18px 0',
          fontSize: 20,
          lineHeight: '28px',
          fontWeight: 600,
        }}
      >
        {t['com.affine.selectPage.empty']()}
      </div>
      {search ? (
        <div
          className={styles.ellipsis}
          style={{ maxWidth: 300, fontSize: 15, lineHeight: '24px' }}
        >
          <Trans i18nKey="com.affine.selectPage.empty.tips" values={{ search }}>
            No page titles contain
            <span
              style={{ fontWeight: 600, color: 'var(--affine-primary-color)' }}
            >
              search
            </span>
          </Trans>
        </div>
      ) : null}
    </div>
  );
};
