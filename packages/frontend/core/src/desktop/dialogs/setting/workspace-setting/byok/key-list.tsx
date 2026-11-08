import { Button, DragHandle, IconButton } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { DeleteIcon, EditIcon } from '@blocksuite/icons/rc';
import type { DragEvent } from 'react';

import * as styles from './index.css';
import {
  byokT,
  capabilityLabel,
  providerLabels,
  rowDescription,
  storageLabel,
} from './metadata';
import { type ByokKey, ByokStorage } from './types';

export const KeyList = ({
  keys,
  testingKeyId,
  onEdit,
  onDelete,
  onTest,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  keys: ByokKey[];
  testingKeyId: string | null;
  onEdit: (key: ByokKey) => void;
  onDelete: (key: ByokKey) => void;
  onTest: (key: ByokKey) => void;
  onDragStart: (key: ByokKey) => void;
  onDragEnd: () => void;
  onDrop: (key: ByokKey) => void;
}) => {
  const t = useI18n();

  return (
    <div className={styles.rows}>
      {keys.map(key => (
        <div
          className={`${styles.row} ${key.enabled ? '' : styles.rowDisabled}`}
          draggable
          key={`${key.storage}:${key.id}`}
          onDragStart={() => onDragStart(key)}
          onDragEnd={onDragEnd}
          onDragOver={(event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
          }}
          onDrop={event => {
            event.preventDefault();
            onDrop(key);
          }}
        >
          <div className={styles.dragHandle} title={byokT(t, 'action.reorder')}>
            <DragHandle />
          </div>
          <div className={styles.rowMain}>
            <div className={styles.rowTitle}>
              {providerLabels[key.provider]} / {key.name}
              <span className={styles.tag}>{storageLabel(t, key.storage)}</span>
              {!key.enabled ? (
                <span className={`${styles.tag} ${styles.dangerTag}`}>
                  {byokT(t, 'status.disabled-after-failure')}
                </span>
              ) : null}
            </div>
            <div className={styles.rowDescription}>
              {rowDescription(t, key)}
            </div>
            <div className={styles.tags}>
              {key.capabilities.map(capability => (
                <span className={styles.tag} key={capability}>
                  {capabilityLabel(t, capability)}
                </span>
              ))}
            </div>
          </div>
          <div className={styles.rowActions}>
            {key.storage === ByokStorage.server ? (
              <Button
                variant="plain"
                disabled={testingKeyId !== null}
                onClick={() => onTest(key)}
              >
                {byokT(
                  t,
                  testingKeyId === key.id ? 'action.testing' : 'action.test'
                )}
              </Button>
            ) : null}
            <IconButton
              size="20"
              title={byokT(t, 'action.edit')}
              icon={<EditIcon />}
              onClick={() => onEdit(key)}
            />
            <IconButton
              size="20"
              title={byokT(t, 'action.delete')}
              icon={<DeleteIcon />}
              onClick={() => onDelete(key)}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
