import { PropertyValue } from '@affine/component';

import * as styles from './styles.css';
import type { PropertyValueProps } from './type';

export const LinkValue = ({ value }: PropertyValueProps) => {
  return (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.linkWrapper}
    >
      <PropertyValue className={styles.value}>{value}</PropertyValue>
    </a>
  );
};
