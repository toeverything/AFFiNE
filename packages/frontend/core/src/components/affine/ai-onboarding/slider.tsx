import clsx from 'clsx';
import { type HTMLAttributes, type Ref } from 'react';

import * as styles from './slider.css';

export interface SliderProps<T> extends HTMLAttributes<HTMLDivElement> {
  items: T[];
  activeIndex?: number;
  itemRenderer?: (item: T, index: number) => React.ReactNode;
  /**
   * preload next and previous slides
   */
  preload?: number;
  transitionDuration?: number;
  transitionTimingFunction?: string;

  rootRef?: Ref<HTMLDivElement>;
}

/**
 * TODO(@catsjuice): extract to @affine/ui
 * @returns
 */
export const Slider = <T,>({
  rootRef,
  items,
  className,
  preload = 1,
  activeIndex = 0,
  transitionDuration = 300,
  transitionTimingFunction = 'cubic-bezier(.33,.36,0,1)',
  itemRenderer,
  ...attrs
}: SliderProps<T>) => {
  const count = items.length;
  const unit = Math.floor(100 / count);

  return (
    <div ref={rootRef} className={clsx(className, styles.slider)} {...attrs}>
      <div
        className={styles.sliderContent}
        style={{
          width: `${items.length * 100}%`,
          transform: `translateX(-${activeIndex * unit}%)`,
          transition: `transform ${transitionDuration}ms ${transitionTimingFunction}`,
        }}
      >
        {items?.map((item, index) => (
          <div key={index} className={styles.slideItem}>
            {preload === undefined || Math.abs(index - activeIndex) <= preload
              ? itemRenderer?.(item, index)
              : null}
          </div>
        ))}
      </div>
    </div>
  );
};
