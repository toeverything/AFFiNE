import { Input } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { Modal } from '@toeverything/components/modal';
import { useCallback, useState } from 'react';

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
  return (
    <div>
      <div className={styles.content}>
        <div className={styles.label}>Name</div>
        <Input
          autoFocus
          value={value}
          placeholder="New Collection"
          onChange={useCallback((value: string) => onChange(value), [onChange])}
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
          disabled={value.trim().length === 0}
          onClick={useCallback(() => onConfirm(value), [onConfirm, value])}
        >
          {onConfirmText ?? t['com.affine.editCollection.button.create']()}
        </Button>
      </div>
    </div>
  );
};
