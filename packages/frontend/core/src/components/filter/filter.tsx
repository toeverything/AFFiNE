import type { FilterParams } from '@affine/core/modules/collection-rules';
import { CloseIcon } from '@blocksuite/icons/rc';

import { PropertyFilterCondition } from './conditions/property';
import { SystemFilterCondition } from './conditions/system';
import * as styles from './styles.css';

export const Filter = ({
  filter,
  onDelete,
  onChange,
}: {
  filter: FilterParams;
  onDelete: () => void;
  onChange: (filter: FilterParams) => void;
}) => {
  const type = filter.type;
  return (
    <div className={styles.filterItemStyle}>
      {type === 'property' ? (
        <PropertyFilterCondition filter={filter} onChange={onChange} />
      ) : type === 'system' ? (
        <SystemFilterCondition filter={filter} onChange={onChange} />
      ) : null}
      <div className={styles.filterItemCloseStyle} onClick={onDelete}>
        <CloseIcon />
      </div>
    </div>
  );
};
