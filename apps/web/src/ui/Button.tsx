import { clsx } from 'clsx';
import type { PropsWithChildren } from 'react';

import styles from './Button.module.css';

export const Button = (props: PropsWithChildren) => {
  return <button className={clsx(styles.button)}>{props.children}</button>;
};
