import { memo, useMemo } from 'react';

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

function useHighlight(text: string, query: string) {
  return useMemo(() => {
    const highlights = [];

    const lowerCaseText = text.toLowerCase();
    let startIndex = lowerCaseText.indexOf(query);

    if (startIndex !== -1) {
      // Full match found, highlight it
      if (startIndex > 0) {
        highlights.push({
          text: text.substring(0, startIndex),
          highlight: false,
        });
      }

      highlights.push({
        text: text.substring(startIndex, startIndex + query.length),
        highlight: true,
      });

      if (startIndex + query.length < text.length) {
        highlights.push({
          text: text.substring(startIndex + query.length),
          highlight: false,
        });
      }
    } else {
      // No full match found, so we proceed to partial matching
      startIndex = 0;
      for (const char of query) {
        const pos = text.toLowerCase().indexOf(char, startIndex);
        if (pos !== -1) {
          if (pos > startIndex) {
            highlights.push({
              text: text.substring(startIndex, pos),
              highlight: false,
            });
          }
          highlights.push({
            text: text.substring(pos, pos + 1),
            highlight: true,
          });
          startIndex = pos + 1;
        }
      }
      if (startIndex < text.length) {
        highlights.push({
          text: text.substring(startIndex),
          highlight: false,
        });
      }
    }
    return highlights;
  }, [text, query]);
}

export const Highlight = memo(function Highlight({
  text = '',
  highlight = '',
}: HighlightProps) {
  // Use regular expression to replace all line breaks and carriage returns in the text
  const cleanedText = text.replace(/\r?\n|\r/g, '');

  const highlights = useHighlight(cleanedText, highlight.toLowerCase());

  return (
    <div className={styles.highlightContainer}>
      {highlights.map((part, i) => {
        if (part.highlight) {
          return (
            <span key={i} className={styles.highlightKeyword}>
              {part.text}
            </span>
          );
        } else {
          return (
            <span key={i} className={styles.highlightText}>
              {part.text}
            </span>
          );
        }
      })}
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
