import { IconButton } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import type React from 'react';
import type { MouseEventHandler } from 'react';

import * as styles from './index.css';

interface AddPageButtonProps {
  onClick?: MouseEventHandler;
  className?: string;
  style?: React.CSSProperties;
}

const sideBottom = { side: 'bottom' as const };
export function AddPageButton({
  onClick,
  className,
  style,
}: AddPageButtonProps) {
  const t = useI18n();

  return (
    <IconButton
      tooltip={t['New Page']()}
      tooltipOptions={sideBottom}
      data-testid="sidebar-new-page-button"
      style={style}
      className={clsx([styles.root, className])}
      onClick={onClick}
      onAuxClick={onClick}
    >
      <PlusIcon />
    </IconButton>
  );
}
