import type { Collection } from '@affine/env/filter';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  CloseIcon,
  EdgelessIcon,
  PageIcon,
  PlusIcon,
  ToggleCollapseIcon,
} from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import clsx from 'clsx';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { FilterList } from '../../filter';
import { PageList, PageListScrollContainer } from '../../page-list';
import { filterPageByRules } from '../../use-collection-manager';
import { AffineShapeIcon } from '../affine-shape';
import type { AllPageListConfig } from './edit-collection';
import * as styles from './edit-collection.css';
import { useSelectPage } from './hooks';

export const RulesMode = ({
  collection,
  updateCollection,
  reset,
  buttons,
  switchMode,
  allPageListConfig,
}: {
  collection: Collection;
  updateCollection: (collection: Collection) => void;
  reset: () => void;
  buttons: ReactNode;
  switchMode: ReactNode;
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
    if (
      collection.filterList.length &&
      filterPageByRules(collection.filterList, [], v)
    ) {
      rulesPages.push(v);
    }
    if (collection.allowList.includes(v.id)) {
      allowListPages.push(v);
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
  const [expandInclude, setExpandInclude] = useState(
    collection.allowList.length > 0
  );
  return (
    <>
      {/*prevents modal autofocus to the first input*/}
      <input
        type="text"
        style={{ width: 0, height: 0 }}
        onFocus={e => requestAnimationFrame(() => e.target.blur())}
      />
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
          <div className={styles.rulesContainerLeftTab}>{switchMode}</div>
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
                    {t['com.affine.editCollection.rules.include.title']()}
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
              className={styles.resultPages}
              pages={rulesPages}
              groupBy={false}
              blockSuiteWorkspace={allPageListConfig.workspace}
              isPreferredEdgeless={allPageListConfig.isEdgeless}
              pageOperationsRenderer={allPageListConfig.favoriteRender}
            ></PageList>
          ) : (
            <RulesEmpty
              noRules={collection.filterList.length === 0}
              fullHeight={allowListPages.length === 0}
            />
          )}
          {allowListPages.length > 0 ? (
            <div>
              <div className={styles.includeListTitle}>
                {t['com.affine.editCollection.rules.include.title']()}
              </div>
              <PageList
                hideHeader
                className={styles.resultPages}
                pages={allowListPages}
                groupBy={false}
                blockSuiteWorkspace={allPageListConfig.workspace}
                isPreferredEdgeless={allPageListConfig.isEdgeless}
                pageOperationsRenderer={allPageListConfig.favoriteRender}
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
              i18nKey="com.affine.editCollection.rules.countTips"
              values={{
                selectedCount: allowListPages.length,
                filteredCount: rulesPages.length,
              }}
            >
              Selected
              <span className={styles.previewCountTipsHighlight}>count</span>,
              filtered
              <span className={styles.previewCountTipsHighlight}>count</span>
            </Trans>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>{buttons}</div>
      </div>
      {selectPageNode}
    </>
  );
};
const RulesEmpty = ({
  noRules,
  fullHeight,
}: {
  noRules: boolean;
  fullHeight: boolean;
}) => {
  const t = useAFFiNEI18N();
  return (
    <div
      style={{
        height: fullHeight ? '100%' : '70%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: '48px 0',
      }}
    >
      <AffineShapeIcon />
      <strong style={{ fontSize: 20, lineHeight: '28px' }}>
        {noRules
          ? t['com.affine.editCollection.rules.empty.noRules']()
          : t['com.affine.editCollection.rules.empty.noResults']()}
      </strong>
      <div
        style={{
          width: '389px',
          textAlign: 'center',
          fontSize: 15,
          lineHeight: '24px',
        }}
      >
        {noRules ? (
          <Trans i18nKey="com.affine.editCollection.rules.empty.noRules.tips">
            Please <strong>add rules</strong> to save this collection or switch
            to <strong>Pages</strong>, use manual selection mode
          </Trans>
        ) : (
          t['com.affine.editCollection.rules.empty.noResults.tips']()
        )}
      </div>
    </div>
  );
};
