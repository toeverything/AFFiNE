import type { ReactNode } from 'react';

import * as styles from './paper.css';
import { Segments } from './segments';

export interface PaperProps {
  segments: number;
  centerIndex: number;
  content: ReactNode;
}

export const Paper = (props: PaperProps) => {
  return (
    <div className={styles.paper}>
      <Segments
        level={props.segments}
        root={true}
        index={props.segments}
        {...props}
      />
    </div>
  );
};
