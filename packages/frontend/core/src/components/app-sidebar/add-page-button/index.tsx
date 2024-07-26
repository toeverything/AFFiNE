import { Button, Tooltip } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import type React from 'react';

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
  const t = useI18n();

  return (
    <Tooltip content={t['New Page']()} side="bottom">
      <Button
        data-testid="sidebar-new-page-button"
        style={style}
        className={clsx([styles.root, className])}
        onClick={onClick}
      >
        <PlusIcon className={styles.icon} />
      </Button>
    </Tooltip>
  );
}
