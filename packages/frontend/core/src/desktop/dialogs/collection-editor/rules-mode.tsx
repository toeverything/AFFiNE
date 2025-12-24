import {
  Button,
  IconButton,
  Masonry,
  type MasonryGroup,
  Tooltip,
} from '@affine/component';
import {
  createDocExplorerContext,
  DocExplorerContext,
} from '@affine/core/components/explorer/context';
import { DocListItemComponent } from '@affine/core/components/explorer/docs-view/docs-list';
import { Filters } from '@affine/core/components/filter';
import { AffineShapeIcon } from '@affine/core/components/page-list';
import type { CollectionInfo } from '@affine/core/modules/collection';
import { CollectionRulesService } from '@affine/core/modules/collection-rules';
import { DocsService } from '@affine/core/modules/doc';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { Trans, useI18n } from '@affine/i18n';
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
import { memo, useEffect, useMemo, useState } from 'react';

import * as styles from './edit-collection.css';

export const RulesMode = ({
  collection,
  updateCollection,
  reset,
  buttons,
  switchMode,
}: {
  collection: CollectionInfo;
  updateCollection: (collection: CollectionInfo) => void;
  reset: () => void;
  buttons: ReactNode;
  switchMode: ReactNode;
}) => {
  const t = useI18n();
  const [showPreview, setShowPreview] = useState(true);
  const docsService = useService(DocsService);
  const collectionRulesService = useService(CollectionRulesService);
  const [rulesPageIds, setRulesPageIds] = useState<string[]>([]);
  const [docExplorerContextValue] = useState(() =>
    createDocExplorerContext({
      displayProperties: ['createdAt', 'updatedAt', 'tags'],
      showDragHandle: false,
      showMoreOperation: false,
      quickFavorite: true,
      groupBy: undefined,
      orderBy: undefined,
    })
  );

  useEffect(() => {
    const subscription = collectionRulesService
      .watch({
        filters: collection.rules.filters,
        extraFilters: [
          {
            type: 'system',
            key: 'trash',
            method: 'is',
            value: 'false',
          },
          {
            type: 'system',
            key: 'empty-journal',
            method: 'is',
            value: 'false',
          },
        ],
        orderBy: {
          type: 'system',
          key: 'updatedAt',
          desc: true,
        },
      })
      .subscribe(rules => {
        setRulesPageIds(rules.groups.flatMap(group => group.items));
      });
    return () => {
      subscription.unsubscribe();
    };
  }, [collection, collectionRulesService]);

  const masonryItems = useMemo(
    () =>
      [
        {
          id: 'rules-group',
          height: 0,
          children: null,
          items: rulesPageIds.length
            ? rulesPageIds.map(docId => {
                return {
                  id: docId,
                  height: 42,
                  Component: DocListItemComponent,
                };
              })
            : [
                {
                  id: 'rules-empty',
                  height: 300,
                  children: (
                    <RulesEmpty
                      noRules={collection.rules.filters.length === 0}
                      fullHeight
                    />
                  ),
                },
              ],
        },
        {
          id: 'allow-list-group',
          height: 30,
          children: (
            <div className={styles.includeListTitle}>
              {t['com.affine.editCollection.rules.include.title']()}
            </div>
          ),
          className: styles.includeListGroup,
          items: collection.allowList.map(docId => {
            return {
              id: docId,
              height: 42,
              Component: DocListItemComponent,
            };
          }),
        },
      ] satisfies MasonryGroup[],
    [collection.allowList, collection.rules.filters.length, rulesPageIds, t]
  );

  const [expandInclude, setExpandInclude] = useState(
    collection.allowList.length > 0
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
              <Filters
                filters={collection.rules.filters}
                onChange={filters => {
                  updateCollection({
                    ...collection,
                    rules: {
                      ...collection.rules,
                      filters,
                    },
                  });
                }}
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
                          <DocTitle id={id} />
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
        <div className={styles.rulesContainerRight}>
          <DocExplorerContext.Provider value={docExplorerContextValue}>
            <Masonry
              items={masonryItems}
              columns={1}
              gapY={12}
              virtualScroll
              paddingX={12}
              groupHeaderGapWithItems={12}
              groupsGap={12}
            />
          </DocExplorerContext.Provider>
        </div>
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
                selectedCount: collection.allowList.length,
                filteredCount: rulesPageIds.length,
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

const DocTitle = memo(function DocTitle({ id }: { id: string }) {
  const docDisplayMetaService = useService(DocDisplayMetaService);
  const docsService = useService(DocsService);
  const doc = useLiveData(docsService.list.doc$(id));
  const trash = useLiveData(doc?.trash$);
  const title = useLiveData(docDisplayMetaService.title$(id));

  return (
    <div
      className={clsx(
        styles.includeItemTitle,
        trash && styles.trashTitle,
        styles.ellipsis
      )}
    >
      {title}
    </div>
  );
});
