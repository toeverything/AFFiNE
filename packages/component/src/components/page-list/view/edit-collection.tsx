import type { Collection, Filter, PropertiesMeta } from '@affine/env/filter';
import type { GetPageInfoById } from '@affine/env/page-info';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { FilterIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { Menu } from '@toeverything/components/menu';
import { Modal } from '@toeverything/components/modal';
import clsx from 'clsx';
import type { MouseEvent } from 'react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { RadioButton, RadioButtonGroup } from '../../..';
import { FilterList } from '../filter';
import { VariableSelect } from '../filter/vars';
import * as styles from './edit-collection.css';

export interface EditCollectionModalProps {
  init?: Collection;
  title?: string;
  open: boolean;
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
  onOpenChange: (open: boolean) => void;
  onConfirm: (view: Collection) => Promise<void>;
}

export const EditCollectionModal = ({
  init,
  onConfirm,
  open,
  onOpenChange,
  getPageInfo,
  propertiesMeta,
  title,
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
      contentOptions={{ style: { padding: 0 } }}
    >
      {init ? (
        <EditCollection
          propertiesMeta={propertiesMeta}
          title={title}
          onConfirmText={t['com.affine.editCollection.save']()}
          init={init}
          getPageInfo={getPageInfo}
          onCancel={onCancel}
          onConfirm={onConfirmOnCollection}
        />
      ) : null}
    </Modal>
  );
};

export interface EditCollectionProps {
  title?: string;
  onConfirmText?: string;
  init: Collection;
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
  onCancel: () => void;
  onConfirm: (collection: Collection) => void;
}

export const EditCollection = ({
  init,
  onConfirm,
  onCancel,
  onConfirmText,
  propertiesMeta,
}: EditCollectionProps) => {
  const t = useAFFiNEI18N();
  const [value, onChange] = useState<Collection>(init);
  // const removeFromAllowList = useCallback(
  //   (id: string) => {
  //     onChange({
  //       ...value,
  //       allowList: value.allowList?.filter(v => v !== id),
  //     });
  //   },
  //   [value]
  // );
  const isNameEmpty = useMemo(() => value.name.trim().length === 0, [value]);
  const onSaveCollection = useCallback(() => {
    if (!isNameEmpty) {
      onConfirm(value);
    }
  }, [value, isNameEmpty, onConfirm]);
  const reset = useCallback(() => {
    onChange(init);
  }, [init]);
  const buttons = useMemo(
    () => (
      <>
        <Button size="large" onClick={onCancel}>
          {t['com.affine.editCollection.button.cancel']()}
        </Button>
        <Button
          style={{
            marginLeft: 20,
          }}
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
    <div
      style={{
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {value.mode === 'page' ? (
        <PagesMode
          propertiesMeta={propertiesMeta}
          collection={value}
          reset={reset}
          updateCollection={onChange}
          buttons={buttons}
        ></PagesMode>
      ) : (
        <RulesMode
          propertiesMeta={propertiesMeta}
          collection={value}
          reset={reset}
          updateCollection={onChange}
          buttons={buttons}
        ></RulesMode>
      )}
    </div>
  );
};

const RulesMode = ({
  collection,
  updateCollection,
  reset,
  propertiesMeta,
  buttons,
}: {
  collection: Collection;
  updateCollection: (collection: Collection) => void;
  reset: () => void;
  propertiesMeta: PropertiesMeta;
  buttons: ReactNode;
}) => {
  const t = useAFFiNEI18N();
  const [showPreview, setShowPreview] = useState(true);

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
      <div style={{ display: 'flex' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              alignItems: 'center',
              padding: '16px 16px 8px 16px',
            }}
          >
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
          <div style={{ padding: '12px 16px 16px' }}>
            <FilterList
              propertiesMeta={propertiesMeta}
              value={collection.filterList}
              onChange={filterList =>
                updateCollection({ ...collection, filterList })
              }
            />
          </div>
        </div>
        <div style={{ flex: 2, display: showPreview ? 'flex' : 'none' }}>
          list
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderTop: '1px solid var(--affine-border-color)',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
            <span className={styles.previewCountTipsHighlight}>13</span> pages.
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
  reset,
  propertiesMeta,
  buttons,
}: {
  collection: Collection;
  updateCollection: (collection: Collection) => void;
  reset: () => void;
  propertiesMeta: PropertiesMeta;
  buttons: ReactNode;
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
  return (
    <>
      <input
        className={styles.rulesTitle}
        placeholder={t['com.affine.editCollection.search.placeholder']()}
      ></input>
      <div style={{ display: 'flex' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              alignItems: 'center',
              padding: '16px 16px 8px 16px',
            }}
          >
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
                    propertiesMeta={propertiesMeta}
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
                propertiesMeta={propertiesMeta}
                value={filters}
                onChange={changeFilters}
              />
            </div>
          ) : null}
          <div>List</div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderTop: '1px solid var(--affine-border-color)',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className={styles.previewCountTips}>
            Selected{' '}
            <span className={styles.previewCountTipsHighlight}>13</span>
          </div>
          <div
            className={clsx(styles.button, styles.bottomButton)}
            onClick={reset}
          >
            {t['com.affine.editCollection.pages.clear']()}
          </div>
        </div>
        <div>{buttons}</div>
      </div>
    </>
  );
};
