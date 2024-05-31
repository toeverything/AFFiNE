import { Button, useConfirmModal } from '@affine/component';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { ArrowRightBigIcon, Logo1Icon } from '@blocksuite/icons';
import { useCallback } from 'react';

import * as styles from './index.css';
import { formatValue } from './utils';

export type ModifiedValues = {
  id: string;
  key: string;
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
          type="primary"
          disabled={modifiedValues.length === 0}
          onClick={() => {
            openConfirmModal({
              title: 'Save Runtime Configurations ?',
              description:
                'Are you sure you want to save the following changes?',
              confirmButtonOptions: {
                children: 'Save',
                type: 'primary',
              },
              onConfirm: onConfirm,
              children: (
                <div className={styles.changedValues}>
                  {modifiedValues.length > 0
                    ? modifiedValues.map(
                        ({ id, key, expiredValue, newValue }) => (
                          <div key={id}>
                            {key}: {formatValue(expiredValue)} =&gt;{' '}
                            {formatValue(newValue)}
                          </div>
                        )
                      )
                    : 'There is no change.'}
                </div>
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
