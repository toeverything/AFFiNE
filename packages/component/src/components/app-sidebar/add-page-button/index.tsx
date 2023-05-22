import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { PlusIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import type React from 'react';

import { Spotlight } from '../spolight';
import * as styles from './index.css';

interface AddPageButtonProps {
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function AddPageButton({
  onClick,
  className,
  style,
}: AddPageButtonProps) {
  const t = useAFFiNEI18N();

  return (
    <button
      data-testid="new-page-button"
      style={style}
      className={clsx([styles.root, className])}
      onClick={onClick}
    >
      <PlusIcon className={styles.icon} /> {t['New Page']()}
      <Spotlight />
    </button>
  );
}
