import * as Sliders from '@radix-ui/react-slider';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { clamp } from 'lodash-es';
import { useRef } from 'react';

import * as styles from './index.css';

export interface SliderProps extends Sliders.SliderProps {
  width?: number;
  thumbSize?: number;
  containerStyle?: React.CSSProperties;
  rootStyle?: React.CSSProperties;
  trackStyle?: React.CSSProperties;
  rangeStyle?: React.CSSProperties;
  thumbStyle?: React.CSSProperties;
  noteStyle?: React.CSSProperties;
  nodes?: number[]; // The values where the nodes should be placed
}

// migrate https://github.com/radix-ui/primitives/blob/660060a765634e9cc7bf4513f41e8dabc9824d74/packages/react/slider/src/Slider.tsx#L708 to align step markers with thumbs
function calcStepMarkOffset(
  index: number,
  maxIndex: number,
  thumbSize: number
) {
  const percent = convertValueToPercentage(index, 0, maxIndex);
  const thumbInBoundsOffset = getThumbInBoundsOffset(thumbSize, percent, 1);
  return `calc(${percent}% + ${thumbInBoundsOffset}px)`;

  function convertValueToPercentage(value: number, min: number, max: number) {
    const maxSteps = max - min;
    const percentPerStep = 100 / maxSteps;
    const percentage = percentPerStep * (value - min);
    return clamp(percentage, 0, 100);
  }

  function getThumbInBoundsOffset(
    width: number,
    left: number,
    direction: number
  ) {
    const halfWidth = width / 2;
    const halfPercent = 50;
    const offset = linearScale([0, halfPercent], [0, halfWidth]);
    return (halfWidth - offset(left) * direction) * direction;
  }

  function linearScale(
    input: readonly [number, number],
    output: readonly [number, number]
  ) {
    return (value: number) => {
      if (input[0] === input[1] || output[0] === output[1]) return output[0];
      const ratio = (output[1] - output[0]) / (input[1] - input[0]);
      return output[0] + ratio * (value - input[0]);
    };
  }
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
  thumbSize = 14,
  disabled,
  ...props
}: SliderProps) => {
  const sliderRef = useRef<HTMLDivElement>(null);

  return (
    <div
      style={{
        ...containerStyle,
        ...assignInlineVars({
          [styles.thumbSize]: thumbSize ? `${thumbSize}px` : undefined,
        }),
        width: width ? `${width}px` : undefined,
      }}
    >
      <Sliders.Root
        value={value}
        min={min}
        max={max}
        step={step}
        style={rootStyle}
        className={styles.root}
        {...props}
        disabled={disabled}
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
                data-disabled={disabled}
                style={{
                  left: calcStepMarkOffset(
                    index,
                    nodes.length - 1,
                    thumbSize / 2
                  ),
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
