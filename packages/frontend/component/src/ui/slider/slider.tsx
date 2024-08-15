import * as Sliders from '@radix-ui/react-slider';
import { useRef } from 'react';

import * as styles from './index.css';

export interface SliderProps extends Sliders.SliderProps {
  nodes?: number[]; // The values where the nodes should be placed
}

export const Slider = ({
  value,
  min,
  max,
  step,
  nodes,
  ...props
}: SliderProps) => {
  const sliderRef = useRef<HTMLDivElement>(null);

  return (
    <Sliders.Root
      value={value}
      min={min}
      max={max}
      step={step}
      className={styles.sliderContainerStyle}
      {...props}
    >
      <Sliders.Track className={styles.trackStyle} ref={sliderRef}>
        <Sliders.Range className={styles.filledTrackStyle} />
        {!!nodes &&
          nodes.map((nodeValue, index) => (
            <div
              key={index}
              className={styles.nodeStyle}
              data-active={value && value[0] >= nodeValue}
              style={{
                left: `${((nodeValue - (min !== undefined ? min : 0)) / (max !== undefined ? max - (min !== undefined ? min : 0) : 1)) * 100}%`,
                transform:
                  index === 0
                    ? 'translateY(-50%)'
                    : index === nodes.length - 1
                      ? 'translateY(-50%) translateX(-100%)'
                      : undefined,
              }}
            />
          ))}
        <Sliders.Thumb className={styles.thumbStyle} />
      </Sliders.Track>
    </Sliders.Root>
  );
};
