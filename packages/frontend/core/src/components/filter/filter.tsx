import type { FilterParams } from '@affine/core/modules/collection-rules';
import { CloseIcon } from '@blocksuite/icons/rc';

import { PropertyFilterCondition } from './conditions/property';
import { SystemFilterCondition } from './conditions/system';
import * as styles from './styles.css';

export const Filter = ({
  filter,
  isDraft,
  onDraftCompleted,
  onDelete,
  onChange,
}: {
  filter: FilterParams;
  isDraft?: boolean;
  onDraftCompleted?: () => void;
  onDelete: () => void;
  onChange: (filter: FilterParams) => void;
}) => {
  const type = filter.type;

  const Condition =
    type === 'property'
      ? PropertyFilterCondition
      : type === 'system'
        ? SystemFilterCondition
        : null;

  return (
    <div
      className={styles.filterItemStyle}
      data-draft={isDraft}
      data-type={type}
    >
      {Condition ? (
        <Condition
          isDraft={isDraft}
          filter={filter}
          onChange={onChange}
          onDraftCompleted={onDraftCompleted}
        />
      ) : null}
      <div className={styles.filterItemCloseStyle} onClick={onDelete}>
        <CloseIcon />
      </div>
    </div>
  );
};
