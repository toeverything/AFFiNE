import type { Collection } from '@affine/env/filter';
import { SaveIcon } from '@blocksuite/icons';
import { useState } from 'react';

import { Button, Input, Modal, ModalCloseButton, ModalWrapper } from '../../..';
import { FilterList } from '../filter';
import * as styles from './collection-list.css';

type CreateCollectionProps = {
  title?: string;
  init: Collection;
  onConfirm: (view: Collection) => void;
};
export const EditCollectionModel = ({
  init,
  onConfirm,
  open,
  onClose,
}: {
  init: Collection;
  onConfirm: (view: Collection) => void;
  open: boolean;
  onClose: () => void;
}) => {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalWrapper
        width={560}
        style={{
          padding: '40px',
          background: 'var(--affine-background-primary-color)',
        }}
      >
        <ModalCloseButton
          top={12}
          right={12}
          onClick={onClose}
          hoverColor="var(--affine-icon-color)"
        />
        <EditCollection
          init={init}
          onCancel={onClose}
          onConfirm={view => {
            onConfirm(view);
            onClose();
          }}
        />
      </ModalWrapper>
    </Modal>
  );
};
export const EditCollection = ({
  title,
  init,
  onConfirm,
  onCancel,
}: CreateCollectionProps & { onCancel: () => void }) => {
  const [value, onChange] = useState<Collection>(init);

  return (
    <div>
      <div className={styles.saveTitle}>
        {title ?? 'Save As New Collection'}
      </div>
      <div
        style={{
          backgroundColor: 'var(--affine-hover-color)',
          borderRadius: 8,
          padding: 20,
          marginTop: 20,
        }}
      >
        <FilterList
          value={value.filterList}
          onChange={list => onChange({ ...value, filterList: list })}
        ></FilterList>
      </div>
      <div style={{ marginTop: 20 }}>
        <Input
          placeholder="Untitled Collection"
          value={value.name}
          onChange={text => onChange({ ...value, name: text })}
        />
      </div>
      <div
        style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 40 }}
      >
        <Button className={styles.cancelButton} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          style={{ marginLeft: 20, borderRadius: '8px' }}
          type="primary"
          onClick={() => {
            if (value.name.trim().length > 0) {
              onConfirm(value);
            }
          }}
        >
          Create
        </Button>
      </div>
    </div>
  );
};
export const SaveCollectionButton = ({
  init,
  onConfirm,
}: CreateCollectionProps) => {
  const [show, changeShow] = useState(false);
  return (
    <>
      <Button
        className={styles.saveButton}
        onClick={() => changeShow(true)}
        size="middle"
      >
        <div className={styles.saveButtonContainer}>
          <div className={styles.saveIcon}>
            <SaveIcon />
          </div>
          <div className={styles.saveText}>Save Collection</div>
        </div>
      </Button>
      <EditCollectionModel
        init={init}
        onConfirm={onConfirm}
        open={show}
        onClose={() => changeShow(false)}
      />
    </>
  );
};
