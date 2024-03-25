import type { ReactNode } from 'react';

import { Segment } from './segment';

export interface SegmentsProps {
  level?: number;
  direction?: 'up' | 'down';
  index: number;
  root?: boolean;
  centerIndex: number;
  segments: number;
  content: ReactNode;
}

export function Segments({
  level,
  direction,
  root,
  index,
  centerIndex,
  segments,
  content,
}: SegmentsProps) {
  if (!level) return null;

  const inherits = { centerIndex, segments, content };

  if (root) {
    const up = centerIndex;
    const down = segments - up - 1;
    const vars = {
      '--segments': segments,
      '--segments-up': up,
      '--segments-down': down,
    };
    return (
      <Segment
        data-root={true}
        style={vars}
        index={up}
        content={content}
        isTop={up === 0}
        isBottom={down === 0}
      >
        <Segments index={up - 1} level={up} direction="up" {...inherits} />
        <Segments index={up + 1} level={down} direction="down" {...inherits} />
      </Segment>
    );
  }

  const children =
    level === 1 ? null : (
      <Segments
        direction={direction}
        index={direction === 'up' ? index - 1 : index + 1}
        level={level - 1}
        {...inherits}
      />
    );
  return (
    <Segment
      direction={direction}
      index={index}
      content={content}
      level={level}
    >
      {children}
    </Segment>
  );
}
