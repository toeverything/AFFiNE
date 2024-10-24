import * as RadixProgress from '@radix-ui/react-progress';
import * as RadixSlider from '@radix-ui/react-slider';
import clsx from 'clsx';

import * as styles from './progress.css';

export interface ProgressProps {
  /**
   * The value of the progress bar.
   * A value between 0 and 100.
   */
  value: number;
  onChange?: (value: number) => void;
  onBlur?: () => void;
  readonly?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const Progress = ({
  value,
  onChange,
  onBlur,
  readonly,
  className,
  style,
}: ProgressProps) => {
  return (
    <div className={clsx(styles.root, className)} style={style}>
      <RadixProgress.Root className={styles.progress} value={value}>
        <RadixProgress.Indicator
          className={styles.indicator}
          style={{ width: `${value}%` }}
        />
        {!readonly ? (
          <RadixSlider.Root
            className={styles.sliderRoot}
            min={0}
            max={100}
            value={[value]}
            onValueChange={values => onChange?.(values[0])}
            onBlur={onBlur}
          >
            <RadixSlider.Thumb className={styles.thumb} />
          </RadixSlider.Root>
        ) : null}
      </RadixProgress.Root>
      <div className={styles.label}>{value}%</div>
    </div>
  );
};
