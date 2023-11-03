import type { Collection } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { PageMeta, Workspace } from '@blocksuite/store';
import type { DialogContentProps } from '@radix-ui/react-dialog';
import { Button } from '@toeverything/components/button';
import { Modal } from '@toeverything/components/modal';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { RadioButton, RadioButtonGroup } from '../../../../index';
import * as styles from './edit-collection.css';
import { PagesMode } from './pages-mode';
import { RulesMode } from './rules-mode';

export type EditCollectionMode = 'page' | 'rule';

export interface EditCollectionModalProps {
  init?: Collection;
  title?: string;
  open: boolean;
  mode?: EditCollectionMode;
  onOpenChange: (open: boolean) => void;
  onConfirm: (view: Collection) => Promise<void>;
  allPageListConfig: AllPageListConfig;
}

const contentOptions: DialogContentProps = {
  onPointerDownOutside: e => {
    e.preventDefault();
  },
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
      contentOptions={contentOptions}
    >
      {init ? (
        <EditCollection
          title={title}
          onConfirmText={t['com.affine.editCollection.save']()}
          init={init}
          mode={mode}
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
  mode?: EditCollectionMode;
  onCancel: () => void;
  onConfirm: (collection: Collection) => void;
  allPageListConfig: AllPageListConfig;
}

export const EditCollection = ({
  init,
  onConfirm,
  onCancel,
  onConfirmText,
  mode: initMode,
  allPageListConfig,
}: EditCollectionProps) => {
  const t = useAFFiNEI18N();
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
  const switchMode = useMemo(
    () => (
      <RadioButtonGroup
        width={158}
        style={{ height: 32 }}
        value={mode}
        onValueChange={(mode: 'page' | 'rule') => {
          setMode(mode);
        }}
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
        <PagesMode
          collection={value}
          updateCollection={onChange}
          switchMode={switchMode}
          buttons={buttons}
          allPageListConfig={allPageListConfig}
        ></PagesMode>
      ) : (
        <RulesMode
          allPageListConfig={allPageListConfig}
          collection={value}
          switchMode={switchMode}
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
