import { PageList } from '@affine/component/page-list';
import type { Collection, Filter } from '@affine/env/filter';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  CloseIcon,
  FilterIcon,
  PlusIcon,
  ToggleCollapseIcon,
} from '@blocksuite/icons';
import type { PageMeta, Workspace } from '@blocksuite/store';
import { Button } from '@toeverything/components/button';
import { Menu } from '@toeverything/components/menu';
import { Modal } from '@toeverything/components/modal';
import clsx from 'clsx';
import type { MouseEvent } from 'react';
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
      width={944}
      height="80%"
      contentOptions={{ style: { padding: 0 } }}
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
  allPageListConfig.allPages.forEach(v => {
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

  return (
    <>
      <div className={styles.rulesTitle}>
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
                  width={24}
                  height={24}
                  style={{ transform: 'rotate(90deg)' }}
                ></ToggleCollapseIcon>
                <div style={{ color: 'var(--affine-text-secondary-color)' }}>
                  include
                </div>
              </div>
              {collection.allowList.map(id => {
                const page = allPageListConfig.allPages.find(v => v.id === id);
                return (
                  <div className={styles.includeItem} key={id}>
                    <div className={styles.includeItemContent}>
                      <div>Page</div>
                      <div className={styles.includeItemContentIs}>is</div>
                      <div className={styles.includeItemTitle}>
                        {page?.title || 'Untitled'}
                      </div>
                    </div>
                    <CloseIcon
                      className={styles.button}
                      onClick={() => {
                        updateCollection({
                          ...collection,
                          allowList: collection.allowList.filter(v => v !== id),
                        });
                      }}
                    ></CloseIcon>
                  </div>
                );
              })}
              <div className={clsx(styles.button, styles.includeAddButton)}>
                <PlusIcon></PlusIcon>
                <div style={{ color: 'var(--affine-text-secondary-color)' }}>
                  Add include page
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          className={styles.rulesContainerRight}
          style={{
            display: showPreview ? 'flex' : 'none',
          }}
        >
          <PageList
            className={styles.resultPages}
            pages={rulesPages}
            blockSuiteWorkspace={allPageListConfig.workspace}
            isPreferredEdgeless={allPageListConfig.isEdgeless}
          ></PageList>
          {allowListPages.length > 0 ? (
            <div>
              <div className={styles.includeListTitle}>include</div>
              <PageList
                className={styles.resultPages}
                pages={allowListPages}
                blockSuiteWorkspace={allPageListConfig.workspace}
                isPreferredEdgeless={allPageListConfig.isEdgeless}
              ></PageList>
            </div>
          ) : null}
        </div>
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
            Preview
          </div>
          <div
            className={clsx(styles.button, styles.bottomButton)}
            onClick={reset}
          >
            Reset
          </div>
          <div className={styles.previewCountTips}>
            After searching, there are currently{' '}
            <span className={styles.previewCountTipsHighlight}>
              {allowListPages.length + rulesPages.length}
            </span>{' '}
            pages.
          </div>
        </div>
        <div>{buttons}</div>
      </div>
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
  const clearSelected = useCallback(() => {
    updateCollection({
      ...collection,
      pages: [],
    });
  }, [collection, updateCollection]);
  const filteredPages = allPageListConfig.allPages.filter(v => {
    return filterPageByRules(filters, [], v);
  });
  return (
    <>
      <input
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
                    onSelect={onCreateFilter}
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
                onChange={changeFilters}
              />
            </div>
          ) : null}
          <div style={{ overflowY: 'auto' }}>
            <PageList
              className={styles.pageList}
              pages={filteredPages}
              blockSuiteWorkspace={allPageListConfig.workspace}
              selectable
              onSelectedPageIdsChange={ids => {
                updateCollection({
                  ...collection,
                  pages: ids,
                });
              }}
              selectedPageIds={collection.pages}
              isPreferredEdgeless={allPageListConfig.isEdgeless}
            ></PageList>
          </div>
        </div>
      </div>
      <div className={styles.pagesBottom}>
        <div className={styles.pagesBottomLeft}>
          <div className={styles.previewCountTips}>
            Selected{' '}
            <span className={styles.previewCountTipsHighlight}>
              {collection.pages.length}
            </span>
          </div>
          <div
            className={clsx(styles.button, styles.bottomButton)}
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
// const SelectPage = (
//   {
//     allPageListConfig,
//     init,
//     onConfirm,
//     onCancel,
//   }: {
//     allPageListConfig: AllPageListConfig;
//     init: string[]
//     onConfirm: (pageIds: string[]) => void;
//     onCancel:()=>void;
//   }) => {
//   const t = useAFFiNEI18N()
//   const [value, onChange] = useState(init);
//   const confirm = useCallback(()=>{
//     onConfirm(value)
//   },[value,onConfirm])
//   return <div>
//     <PageList
//       pages={allPageListConfig.allPages}
//       blockSuiteWorkspace={allPageListConfig.workspace}
//       isPreferredEdgeless={allPageListConfig.isEdgeless}
//       selectable
//       selectedPageIds={value}
//       onSelectedPageIdsChange={onChange}
//     />
//     <div>
//       <Button size='large' onClick={onCancel}>
//         {t['com.affine.editCollection.button.cancel']()}
//       </Button>
//       <Button
//         className={styles.confirmButton}
//         size='large'
//         data-testid='save-collection'
//         type='primary'
//         onClick={confirm}
//       >
//         {t['com.affine.editCollection.button.create']()}
//       </Button>
//     </div>
//   </div>;
// };
