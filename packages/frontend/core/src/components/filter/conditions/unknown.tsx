import type { FilterParams } from '@affine/core/modules/collection-rules';
import { WarningIcon } from '@blocksuite/icons/rc';
import { useEffect } from 'react';

import { Condition } from './condition';
import * as styles from './styles.css';

export const UnknownFilterCondition = ({
  filter,
  isDraft,
  onDraftCompleted,
}: {
  filter: FilterParams;
  isDraft?: boolean;
  onDraftCompleted?: () => void;
}) => {
  useEffect(() => {
    if (isDraft) {
      // should not reach here
      onDraftCompleted?.();
    }
  }, [isDraft, onDraftCompleted]);

  return (
    <Condition
      filter={filter}
      icon={<WarningIcon className={styles.filterTypeIconUnknownStyle} />}
      name={<span className={styles.filterTypeUnknownNameStyle}>Unknown</span>}
    />
  );
};
