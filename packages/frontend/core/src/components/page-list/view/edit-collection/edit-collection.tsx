import { Button, Modal, RadioGroup } from '@affine/component';
import { useAllPageListConfig } from '@affine/core/components/hooks/affine/use-all-page-list-config';
import type { Collection } from '@affine/env/filter';
import { useI18n } from '@affine/i18n';
import type { DocCollection, DocMeta } from '@blocksuite/store';
import type { DialogContentProps } from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';

import * as styles from './edit-collection.css';
import { RulesMode } from './rules-mode';
import { SelectPage } from './select-page';

export type EditCollectionMode = 'page' | 'rule';

export interface EditCollectionModalProps {
  init?: Collection;
  title?: string;
  open: boolean;
  mode?: EditCollectionMode;
  onOpenChange: (open: boolean) => void;
  onConfirm: (view: Collection) => void;
}

const contentOptions: DialogContentProps = {
  style: {
    padding: 0,
    maxWidth: 944,
    backgroundColor: 'var(--affine-background-primary-color)',
  },
};
export const EditCollectionModal = ({
  init,
  onConfirm,
  open,
  onOpenChange,
  title,
  mode,
}: EditCollectionModalProps) => {
  const t = useI18n();
  const onConfirmOnCollection = useCallback(
    (view: Collection) => {
      onConfirm(view);
      onOpenChange(false);
    },
    [onConfirm, onOpenChange]
  );
  const onCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  if (!(open && init)) {
    return null;
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      withoutCloseButton
      width="calc(100% - 64px)"
      height="80%"
      contentOptions={contentOptions}
      persistent
    >
      <EditCollection
        title={title}
        onConfirmText={t['com.affine.editCollection.save']()}
        init={init}
        mode={mode}
        onCancel={onCancel}
        onConfirm={onConfirmOnCollection}
      />
    </Modal>
  );
};

export interface EditCollectionProps {
  title?: string;
  onConfirmText?: string;
  init: Collection;
  mode?: EditCollectionMode;
  onCancel: () => void;
  onConfirm: (collection: Collection) => void;
}

export const EditCollection = ({
  init,
  onConfirm,
  onCancel,
  onConfirmText,
  mode: initMode,
}: EditCollectionProps) => {
  const t = useI18n();
  const config = useAllPageListConfig();
  const [value, onChange] = useState<Collection>(init);
  const [mode, setMode] = useState<'page' | 'rule'>(
    initMode ?? (init.filterList.length === 0 ? 'page' : 'rule')
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
      filterList: init.filterList,
      allowList: init.allowList,
    });
  }, [init.allowList, init.filterList, value]);
  const onIdsChange = useCallback(
    (ids: string[]) => {
      onChange({ ...value, allowList: ids });
    },
    [value]
  );
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
          init={value.allowList}
          onChange={onIdsChange}
          header={switchMode}
          buttons={buttons}
        />
      ) : (
        <RulesMode
          allPageListConfig={config}
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

export type AllPageListConfig = {
  allPages: DocMeta[];
  docCollection: DocCollection;
  /**
   * Return `undefined` if the page is not public
   */
  getPublicMode: (id: string) => undefined | 'page' | 'edgeless';
  getPage: (id: string) => DocMeta | undefined;
  favoriteRender: (page: DocMeta) => ReactNode;
};
