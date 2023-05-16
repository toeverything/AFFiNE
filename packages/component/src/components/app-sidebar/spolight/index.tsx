import { assignInlineVars } from '@vanilla-extract/dynamic';
import { useTheme } from 'next-themes';
import React, { useEffect, useRef } from 'react';

import * as styles from './index.css';

function useMouseOffset() {
  const [offset, setOffset] = React.useState<{ x: number; y: number }>();
  const [outside, setOutside] = React.useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.parentElement) {
      const el = ref.current.parentElement;
      const bound = el.getBoundingClientRect();

      // debounce?
      const onMouseMove = (e: MouseEvent) => {
        setOffset({ x: e.clientX - bound.x, y: e.clientY - bound.y });
        setOutside(false);
      };

      const onMouseLeave = () => {
        setOutside(true);
      };
      el.addEventListener('mousemove', onMouseMove);
      el.addEventListener('mouseleave', onMouseLeave);
      return () => {
        el.removeEventListener('mousemove', onMouseMove);
        el.removeEventListener('mouseleave', onMouseLeave);
      };
    }
  }, []);

  return [offset, outside, ref] as const;
}

export function Spotlight() {
  const [offset, outside, ref] = useMouseOffset();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const offsetVars = assignInlineVars({
    [styles.spotlightX]: (offset?.x ?? 0) + 'px',
    [styles.spotlightY]: (offset?.y ?? 0) + 'px',
    [styles.spotlightOpacity]: outside ? '0' : isDark ? '.1' : '0.07',
  });

  return <div style={offsetVars} ref={ref} className={styles.spotlight} />;
}
