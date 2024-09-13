import { Button, Input, Modal } from '@affine/component';
import { useCatchEventCallback } from '@affine/core/components/hooks/use-catch-event-hook';
import { useI18n } from '@affine/i18n';
import type { KeyboardEvent } from 'react';
import { useCallback, useMemo, useState } from 'react';

import * as styles from './create-collection.css';

export interface CreateCollectionModalProps {
  title?: string;
  onConfirmText?: string;
  init: string;
  onConfirm: (title: string) => void;
  open: boolean;
  showTips?: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateCollectionModal = ({
  init,
  onConfirm,
  open,
  showTips,
  onOpenChange,
  title,
}: CreateCollectionModalProps) => {
  const t = useI18n();
  const onConfirmTitle = useCallback(
    (title: string) => {
      onConfirm(title);
      onOpenChange(false);
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
          showTips={showTips}
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
  showTips?: boolean;
  onCancel: () => void;
  onConfirm: (title: string) => void;
}

export const CreateCollection = ({
  onConfirmText,
  init,
  showTips,
  onCancel,
  onConfirm,
}: CreateCollectionProps) => {
  const t = useI18n();
  const [value, onChange] = useState(init);
  const isNameEmpty = useMemo(() => value.trim().length === 0, [value]);
  const save = useCallback(() => {
    if (isNameEmpty) {
      return;
    }
    onConfirm(value);
  }, [onConfirm, value, isNameEmpty]);
  const onKeyDown = useCatchEventCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        if (isNameEmpty) {
          return;
        } else {
          e.currentTarget.blur();
        }
      }
    },
    [isNameEmpty]
  );
  return (
    <div data-testid="edit-collection-modal">
      <div className={styles.content}>
        <div className={styles.label}>
          {t['com.affine.editCollectionName.name']()}
        </div>
        <Input
          autoFocus
          value={value}
          data-testid="input-collection-title"
          placeholder={t['com.affine.editCollectionName.name.placeholder']()}
          onChange={useCallback((value: string) => onChange(value), [onChange])}
          onEnter={save}
          onKeyDown={onKeyDown}
        ></Input>
        {showTips ? (
          <div className={styles.createTips}>
            {t['com.affine.editCollectionName.createTips']()}
          </div>
        ) : null}
      </div>
      <div className={styles.footer}>
        <Button size="large" onClick={onCancel}>
          {t['com.affine.editCollection.button.cancel']()}
        </Button>
        <Button
          size="large"
          data-testid="save-collection"
          variant="primary"
          disabled={isNameEmpty}
          onClick={save}
        >
          {onConfirmText ?? t['com.affine.editCollection.button.create']()}
        </Button>
      </div>
    </div>
  );
};
