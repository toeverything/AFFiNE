import { Button, useConfirmModal } from '@affine/component';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { ArrowRightBigIcon, Logo1Icon } from '@blocksuite/icons/rc';
import { useCallback } from 'react';

import * as styles from './index.css';

export type ModifiedValues = {
  id: string;
  expiredValue: any;
  newValue: any;
};

export const AdminPanelHeader = ({
  modifiedValues,
  onConfirm,
}: {
  modifiedValues: ModifiedValues[];
  onConfirm: () => void;
}) => {
  const { openConfirmModal } = useConfirmModal();
  const { jumpToIndex } = useNavigateHelper();

  const handleJumpToIndex = useCallback(() => jumpToIndex(), [jumpToIndex]);

  return (
    <div className={styles.header}>
      <Logo1Icon className={styles.logo} onClick={handleJumpToIndex} />
      <div className={styles.title}>
        <span>After editing, please click the Save button on the right.</span>
        <ArrowRightBigIcon />
      </div>
      <div>
        <Button
          variant="primary"
          disabled={modifiedValues.length === 0}
          onClick={() => {
            openConfirmModal({
              title: 'Save Runtime Configurations ?',
              description:
                'Are you sure you want to save the following changes?',
              confirmText: 'Save',
              confirmButtonOptions: {
                variant: 'primary',
              },
              onConfirm: onConfirm,
              children:
                modifiedValues.length > 0 ? (
                  <pre className={styles.changedValues}>
                    <p>{'{'}</p>
                    {modifiedValues.map(({ id, expiredValue, newValue }) => (
                      <p key={id}>
                        {'  '} {id}:{' '}
                        <span className={styles.expiredValue}>
                          {JSON.stringify(expiredValue)}
                        </span>
                        <span className={styles.newValue}>
                          {JSON.stringify(newValue)}
                        </span>
                        ,
                      </p>
                    ))}
                    <p>{'}'}</p>
                  </pre>
                ) : (
                  'There is no change.'
                ),
            });
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
};
