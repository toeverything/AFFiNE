import { Button, IconButton, Tooltip } from '@affine/component';
import type { AllPageListConfig } from '@affine/core/components/hooks/affine/use-all-page-list-config';
import {
  AffineShapeIcon,
  FilterList,
  filterPageByRules,
  List,
  type ListItem,
  ListScrollContainer,
} from '@affine/core/components/page-list';
import { DocsService } from '@affine/core/modules/doc';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import type { Collection } from '@affine/env/filter';
import { Trans, useI18n } from '@affine/i18n';
import type { DocMeta } from '@blocksuite/affine/store';
import {
  CloseIcon,
  EdgelessIcon,
  PageIcon,
  ToggleRightIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';

import * as styles from './edit-collection.css';

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
  const t = useI18n();
  const [showPreview, setShowPreview] = useState(true);
  const allowListPages: DocMeta[] = [];
  const rulesPages: DocMeta[] = [];
  const docsService = useService(DocsService);
  const favAdapter = useService(CompatibleFavoriteItemsAdapter);
  const favorites = useLiveData(favAdapter.favorites$);
  allPageListConfig.allPages.forEach(meta => {
    if (meta.trash) {
      return;
    }
    const pageData = {
      meta,
      publicMode: allPageListConfig.getPublicMode(meta.id),
      favorite: favorites.some(f => f.id === meta.id),
    };
    if (
      collection.filterList.length &&
      filterPageByRules(collection.filterList, [], pageData)
    ) {
      rulesPages.push(meta);
    }
    if (collection.allowList.includes(meta.id)) {
      allowListPages.push(meta);
    }
  });
  const [expandInclude, setExpandInclude] = useState(
    collection.allowList.length > 0
  );
  const operationsRenderer = useCallback(
    (item: ListItem) => {
      const page = item as DocMeta;
      return allPageListConfig.favoriteRender(page);
    },
    [allPageListConfig]
  );

  const tips = useMemo(
    () => (
      <Trans
        i18nKey="com.affine.editCollection.rules.tips"
        values={{
          highlight: t['com.affine.editCollection.rules.tips.highlight'](),
        }}
        components={{
          2: <span className={styles.rulesTitleHighlight} />,
        }}
      />
    ),
    [t]
  );

  return (
    <>
      <Tooltip content={tips}>
        <div className={clsx(styles.rulesTitle, styles.ellipsis)}>{tips}</div>
      </Tooltip>

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
                propertiesMeta={allPageListConfig.docCollection.meta.properties}
                value={collection.filterList}
                onChange={useCallback(
                  filterList => updateCollection({ ...collection, filterList }),
                  [collection, updateCollection]
                )}
              />
              <div className={styles.rulesContainerLeftContentInclude}>
                {collection.allowList.length > 0 ? (
                  <div className={styles.includeTitle}>
                    <IconButton
                      onClick={() => setExpandInclude(!expandInclude)}
                      iconStyle={{
                        transform: expandInclude ? 'rotate(90deg)' : undefined,
                      }}
                      icon={<ToggleRightIcon />}
                    />
                    <div style={{ color: cssVar('textSecondaryColor') }}>
                      {t['com.affine.editCollection.rules.include.title']()}
                    </div>
                  </div>
                ) : null}
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
                            {docsService.list.getPrimaryMode(id) ===
                            'edgeless' ? (
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
                        <IconButton
                          size="14"
                          icon={<CloseIcon />}
                          onClick={() => {
                            updateCollection({
                              ...collection,
                              allowList: collection.allowList.filter(
                                v => v !== id
                              ),
                            });
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
        <ListScrollContainer
          className={styles.rulesContainerRight}
          style={{
            display: showPreview ? 'flex' : 'none',
          }}
        >
          {rulesPages.length > 0 ? (
            <List
              hideHeader
              className={styles.resultPages}
              items={rulesPages}
              docCollection={allPageListConfig.docCollection}
              operationsRenderer={operationsRenderer}
            ></List>
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
              <List
                hideHeader
                className={styles.resultPages}
                items={allowListPages}
                docCollection={allPageListConfig.docCollection}
                operationsRenderer={operationsRenderer}
              ></List>
            </div>
          ) : null}
        </ListScrollContainer>
      </div>
      <div className={styles.rulesBottom}>
        <div className={styles.bottomLeft}>
          <Button
            onClick={() => {
              setShowPreview(!showPreview);
            }}
          >
            {t['com.affine.editCollection.rules.preview']()}
          </Button>
          <Button variant="plain" onClick={reset}>
            {t['com.affine.editCollection.rules.reset']()}
          </Button>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {buttons}
        </div>
      </div>
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
  const t = useI18n();
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
