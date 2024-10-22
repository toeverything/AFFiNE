import { ExplorerTreeContext } from '@affine/core/modules/explorer';
import { PlusIcon } from '@blocksuite/icons/rc';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import { type HTMLAttributes, useContext } from 'react';

import { levelIndent } from '../tree/node.css';
import * as styles from './add-item-placeholder.css';

export interface AddItemPlaceholderProps
  extends HTMLAttributes<HTMLDivElement> {
  onClick?: () => void;
  label?: string;
  icon?: React.ReactNode;
}

export const AddItemPlaceholder = ({
  onClick,
  label = 'Add Item',
  icon = <PlusIcon />,
  className,
  ...attrs
}: AddItemPlaceholderProps) => {
  const context = useContext(ExplorerTreeContext);
  const level = context?.level ?? 0;

  return (
    <div
      className={styles.root}
      style={assignInlineVars({
        [levelIndent]: level * 20 + 'px',
      })}
    >
      <div
        onClick={onClick}
        className={clsx(styles.wrapper, className)}
        {...attrs}
      >
        <div className={styles.iconWrapper}>{icon}</div>
        <span className={styles.label}>{label}</span>
      </div>
    </div>
  );
};
