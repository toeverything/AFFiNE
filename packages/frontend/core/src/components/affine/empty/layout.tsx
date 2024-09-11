import { ThemedImg, withUnit } from '@affine/component';
import clsx from 'clsx';

import * as styles from './style.css';
import type { EmptyLayoutProps } from './types';

export const EmptyLayout = ({
  className,
  illustrationLight,
  illustrationDark,
  illustrationWidth = 300,
  title,
  description,
  action,
  absoluteCenter,
  ...attrs
}: EmptyLayoutProps) => {
  return (
    <div
      className={clsx(
        styles.root,
        absoluteCenter ? styles.absoluteCenter : null,
        className
      )}
      {...attrs}
    >
      <ThemedImg
        style={{ width: withUnit(illustrationWidth, 'px') }}
        draggable={false}
        className={styles.illustration}
        lightSrc={illustrationLight}
        darkSrc={illustrationDark}
      />

      {title || description ? (
        <div>
          <p className={styles.title}>{title}</p>
          <p className={styles.description}>{description}</p>
        </div>
      ) : null}

      {action}
    </div>
  );
};
