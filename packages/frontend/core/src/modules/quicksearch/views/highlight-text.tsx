import { Fragment, useMemo } from 'react';

import * as styles from './highlight-text.css';

type HighlightProps = {
  text: string;
  start: string;
  end: string;
};

export const HighlightText = ({ text = '', end, start }: HighlightProps) => {
  const parts = useMemo(
    () =>
      text.split(start).flatMap(part => {
        if (part.includes(end)) {
          const [highlighted, ...ending] = part.split(end);

          return [
            {
              h: highlighted,
            },
            ending.join(),
          ];
        } else {
          return part;
        }
      }),
    [end, start, text]
  );

  return (
    <span className={styles.highlightText}>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <Fragment key={i}>{part}</Fragment>
        ) : (
          <span key={i} className={styles.highlightKeyword}>
            {part.h}
          </span>
        )
      )}
    </span>
  );
};
