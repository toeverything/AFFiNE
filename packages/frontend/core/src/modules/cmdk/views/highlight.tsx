import { memo } from 'react';

import * as styles from './highlight.css';
import { useHighlight } from './use-highlight';

type SearchResultLabel = {
  title: string;
  subTitle?: string;
};

type HighlightProps = {
  text: string;
  highlight: string;
};

type HighlightLabelProps = {
  label: SearchResultLabel;
  highlight: string;
};

export const Highlight = memo(function Highlight({
  text = '',
  highlight = '',
}: HighlightProps) {
  const highlights = useHighlight(text, highlight);

  return (
    <div className={styles.highlightContainer}>
      {highlights.map((part, i) => (
        <span
          key={i}
          className={
            part.highlight ? styles.highlightKeyword : styles.highlightText
          }
        >
          {part.text}
        </span>
      ))}
    </div>
  );
});

export const HighlightLabel = memo(function HighlightLabel({
  label,
  highlight,
}: HighlightLabelProps) {
  return (
    <div>
      <div className={styles.labelTitle}>
        <Highlight text={label.title} highlight={highlight} />
      </div>
      {label.subTitle ? (
        <div className={styles.labelContent}>
          <Highlight text={label.subTitle} highlight={highlight} />
        </div>
      ) : null}
    </div>
  );
});
