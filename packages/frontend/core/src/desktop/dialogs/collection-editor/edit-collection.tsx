import { Button, RadioGroup } from '@affine/component';
import { SelectPage } from '@affine/core/components/page-list/docs/select-page';
import type { CollectionInfo } from '@affine/core/modules/collection';
import { useI18n } from '@affine/i18n';
import { useCallback, useMemo, useState } from 'react';

import * as styles from './edit-collection.css';
import { RulesMode } from './rules-mode';

export type EditCollectionMode = 'page' | 'rule';

export interface EditCollectionProps {
  onConfirmText?: string;
  init: CollectionInfo;
  mode?: EditCollectionMode;
  onCancel: () => void;
  onConfirm: (collection: CollectionInfo) => void;
}

export const EditCollection = ({
  init,
  onConfirm,
  onCancel,
  onConfirmText,
  mode: initMode,
}: EditCollectionProps) => {
  const t = useI18n();
  const [value, onChange] = useState<CollectionInfo>(init);
  const [mode, setMode] = useState<'page' | 'rule'>(
    initMode ?? (init.rules.filters.length === 0 ? 'page' : 'rule')
  );
  const isNameEmpty = useMemo(() => value.name.trim().length === 0, [value]);
  const onSaveCollection = useCallback(() => {
    if (!isNameEmpty) {
      onConfirm(value);
    }
  }, [value, isNameEmpty, onConfirm]);
  const reset = useCallback(() => {
    onChange({
      ...value,
      rules: init.rules,
      allowList: init.allowList,
    });
  }, [init, value]);
  const onIdsChange = useCallback((ids: string[]) => {
    onChange(prev => ({ ...prev, allowList: ids }));
  }, []);
  const buttons = useMemo(
    () => (
      <>
        <Button onClick={onCancel} className={styles.actionButton}>
          {t['com.affine.editCollection.button.cancel']()}
        </Button>
        <Button
          className={styles.actionButton}
          data-testid="save-collection"
          variant="primary"
          disabled={isNameEmpty}
          onClick={onSaveCollection}
        >
          {onConfirmText ?? t['com.affine.editCollection.button.create']()}
        </Button>
      </>
    ),
    [onCancel, t, isNameEmpty, onSaveCollection, onConfirmText]
  );
  const switchMode = useMemo(
    () => (
      <RadioGroup
        key="mode-switcher"
        style={{ minWidth: 158 }}
        value={mode}
        onChange={setMode}
        items={[
          {
            value: 'page',
            label: t['com.affine.editCollection.pages'](),
            testId: 'edit-collection-pages-button',
          },
          {
            value: 'rule',
            label: t['com.affine.editCollection.rules'](),
            testId: 'edit-collection-rules-button',
          },
        ]}
      />
    ),
    [mode, t]
  );
  return (
    <div
      onKeyDown={e => {
        if (e.key === 'Escape') {
          return;
        }
        e.stopPropagation();
      }}
      className={styles.collectionEditContainer}
    >
      {mode === 'page' ? (
        <SelectPage
          init={init.allowList}
          onChange={onIdsChange}
          header={switchMode}
          buttons={buttons}
        />
      ) : (
        <RulesMode
          collection={value}
          switchMode={switchMode}
          reset={reset}
          updateCollection={onChange}
          buttons={buttons}
        />
      )}
    </div>
  );
};
