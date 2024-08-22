import * as Sliders from '@radix-ui/react-slider';
import { useRef } from 'react';

import * as styles from './index.css';

export interface SliderProps extends Sliders.SliderProps {
  width?: number;
  containerStyle?: React.CSSProperties;
  rootStyle?: React.CSSProperties;
  trackStyle?: React.CSSProperties;
  rangeStyle?: React.CSSProperties;
  thumbStyle?: React.CSSProperties;
  noteStyle?: React.CSSProperties;
  nodes?: number[]; // The values where the nodes should be placed
}

export const Slider = ({
  value,
  min = 0,
  max = 10,
  step,
  width = 250,
  nodes,
  containerStyle,
  rootStyle,
  trackStyle,
  rangeStyle,
  thumbStyle,
  noteStyle,
  ...props
}: SliderProps) => {
  const sliderRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{ ...containerStyle, width: width ? `${width}px` : undefined }}>
      <Sliders.Root
        value={value}
        min={min}
        max={max}
        step={step}
        style={rootStyle}
        {...props}
      >
        <Sliders.Track className={styles.trackStyle} ref={sliderRef}>
          <div className={styles.fakeTrackStyle} style={trackStyle}>
            <Sliders.Range
              className={styles.filledTrackStyle}
              style={rangeStyle}
            />
          </div>

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
                  ...noteStyle,
                }}
              />
            ))}
          <Sliders.Thumb className={styles.thumbStyle} style={thumbStyle} />
        </Sliders.Track>
      </Sliders.Root>
    </div>
  );
};
