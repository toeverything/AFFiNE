import { createEmptyCollection } from '@affine/component/page-list';
import type { Collection } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SaveIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { Modal } from '@toeverything/components/modal';
import { nanoid } from 'nanoid';
import { useCallback, useMemo, useState } from 'react';

import Input from '../../../ui/input';
import * as styles from './create-collection.css';

export interface CreateCollectionModalProps {
  title?: string;
  onConfirmText?: string;
  init: string;
  onConfirm: (title: string) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateCollectionModal = ({
  init,
  onConfirm,
  open,
  onOpenChange,
  title,
}: CreateCollectionModalProps) => {
  const t = useAFFiNEI18N();
  const onConfirmTitle = useCallback(
    (title: string) => {
      onConfirm(title)
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
    <Modal open={open} title={title} onOpenChange={onOpenChange} width={480}>
      {init != null ? (
        <CreateCollection
          onConfirmText={t['com.affine.editCollection.save']()}
          init={init}
          onConfirm={onConfirmTitle}
          onCancel={onCancel}
        />
      ) : null}
    </Modal>
  );
};

export interface CreateCollectionProps {
  onConfirmText?: string;
  init: string;
  onCancel: () => void;
  onConfirm: (title: string) => void;
}

export const CreateCollection = ({
  onConfirmText,
  init,
  onCancel,
  onConfirm,
}: CreateCollectionProps) => {
  const t = useAFFiNEI18N();
  const [value, onChange] = useState(init);
  const isNameEmpty = useMemo(() => value.trim().length === 0, [value]);
  const save = useCallback(() => {
    if (isNameEmpty) {
      return;
    }
    onConfirm(value);
  }, [onConfirm, value, isNameEmpty]);
  return (
    <div>
      <div className={styles.content}>
        <div className={styles.label}>Name</div>
        <Input
          autoFocus
          value={value}
          placeholder="New Collection"
          onChange={useCallback((value: string) => onChange(value), [onChange])}
          onEnter={save}
        ></Input>
        <div className={styles.createTips}>
          Collection is a smart folder where you can manually add pages or
          automatically add pages through rules.
        </div>
      </div>
      <div className={styles.footer}>
        <Button size="large" onClick={onCancel}>
          {t['com.affine.editCollection.button.cancel']()}
        </Button>
        <Button
          size="large"
          data-testid="save-collection"
          type="primary"
          disabled={isNameEmpty}
          onClick={save}
        >
          {onConfirmText ?? t['com.affine.editCollection.button.create']()}
        </Button>
      </div>
    </div>
  );
};

interface SaveAsCollectionButtonProps {
  onConfirm: (collection: Collection) => Promise<void>;
}

export const SaveAsCollectionButton = ({
  onConfirm,
}: SaveAsCollectionButtonProps) => {
  const [show, changeShow] = useState(false);
  const handleClick = useCallback(() => {
    changeShow(true);
  }, [changeShow]);
  const t = useAFFiNEI18N();
  const createCollection = useCallback(
    (title: string) => {
      return onConfirm(createEmptyCollection(nanoid(), { name: title }));
    },
    [onConfirm]
  );
  return (
    <>
      <Button
        onClick={handleClick}
        data-testid="save-as-collection"
        icon={<SaveIcon />}
        size="large"
        style={{ padding: '7px 8px' }}
      >
        {t['com.affine.editCollection.saveCollection']()}
      </Button>
      <CreateCollectionModal
        title={t['com.affine.editCollection.saveCollection']()}
        init=""
        onConfirm={createCollection}
        open={show}
        onOpenChange={changeShow}
      />
    </>
  );
};
