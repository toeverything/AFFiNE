import { memo } from 'react';

import { useHighlight } from '../../../hooks/affine/use-highlight';
import * as styles from './highlight.css';

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
  // Use regular expression to replace all line breaks and carriage returns in the text
  const cleanedText = text.replace(/\r?\n|\r/g, '');

  const highlights = useHighlight(cleanedText, highlight.toLowerCase());

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
