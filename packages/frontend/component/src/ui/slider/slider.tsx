import type { KeyboardEvent, MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import * as styles from './index.css';

export interface SliderProps {
  value?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  nodes?: number[]; // The values where the nodes should be placed
}

export const Slider = ({
  value: propValue = 50,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  nodes = [20, 40, 60, 80],
}: SliderProps) => {
  const [value, setValue] = useState(propValue);
  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(propValue);
  }, [propValue]);

  const handleThumbMove = useCallback(
    (e: MouseEvent) => {
      if (!sliderRef.current) return;

      const sliderRect = sliderRef.current.getBoundingClientRect();
      const newValue =
        ((e.clientX - sliderRect.left) / sliderRect.width) * (max - min) + min;
      const clampedValue = Math.min(
        max,
        Math.max(min, Math.round(newValue / step) * step)
      );

      setValue(clampedValue);
      if (onChange) {
        onChange(clampedValue);
      }
    },
    [max, min, onChange, step]
  );

  const handleThumbKeyDown = useCallback(
    (e: KeyboardEvent) => {
      let newValue = value;
      if (e.key === 'ArrowLeft') {
        newValue = Math.max(min, value - step);
      } else if (e.key === 'ArrowRight') {
        newValue = Math.min(max, value + step);
      }
      setValue(newValue);
      if (onChange) {
        onChange(newValue);
      }
    },
    [max, min, onChange, step, value]
  );
  const thumbPosition = useMemo(
    () => ((value - min) / (max - min)) * 100,
    [max, min, value]
  );
  return (
    <div className={styles.sliderContainerStyle}>
      <div
        className={styles.trackStyle}
        ref={sliderRef}
        onMouseDown={handleThumbMove}
      >
        <div
          className={styles.filledTrackStyle}
          style={{ width: `${thumbPosition}%` }}
        />
        {nodes.map((nodeValue, index) => (
          <div
            key={index}
            className={styles.nodeStyle}
            data-active={value >= nodeValue}
            style={{
              left: `${((nodeValue - min) / (max - min)) * 100}%`,
            }}
          />
        ))}
        <div
          className={styles.thumbStyle}
          style={{ left: `${thumbPosition}%` }}
          onMouseDown={e => e.stopPropagation()}
          onMouseMove={handleThumbMove}
          onKeyDown={handleThumbKeyDown}
          tabIndex={0}
        />
      </div>
    </div>
  );
};
