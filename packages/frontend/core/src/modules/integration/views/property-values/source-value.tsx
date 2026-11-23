import { PropertyValue } from '@affine/component';
import { DualLinkIcon } from '@blocksuite/icons/rc';

import { IntegrationTypeIcon } from '../icon';
import * as styles from './styles.css';
import type { PropertyValueProps } from './type';

export const SourceValue = ({ value, integration }: PropertyValueProps) => {
  return (
    <a
      href={value}
      target="_blank"
      rel="noreferrer"
      className={styles.linkWrapper}
    >
      <PropertyValue className={styles.sourceValue}>
        <div className={styles.sourceValueIcon}>
          <IntegrationTypeIcon type={integration} />
        </div>
        {value}
        <DualLinkIcon className={styles.sourceValueLinkIcon} />
      </PropertyValue>
    </a>
  );
};
