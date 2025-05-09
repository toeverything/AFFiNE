import type { FilterParams } from '@affine/core/modules/collection-rules';
import { WarningIcon } from '@blocksuite/icons/rc';

import { Condition } from './condition';
import * as styles from './styles.css';

export const UnknownFilterCondition = ({
  filter,
}: {
  filter: FilterParams;
}) => {
  return (
    <Condition
      filter={filter}
      icon={<WarningIcon className={styles.filterTypeIconUnknownStyle} />}
      name={<span className={styles.filterTypeUnknownNameStyle}>Unknown</span>}
    />
  );
};
