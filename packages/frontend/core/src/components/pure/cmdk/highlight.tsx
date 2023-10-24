import { escapeRegExp } from 'lodash-es';
import { memo } from 'react';

import {
  highlightContainer,
  highlightKeyword,
  highlightText,
  labelContent,
  labelTitle,
} from './highlight.css';

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
  //Regex is used to ignore case
  const regex = highlight.trim()
    ? new RegExp(`(${escapeRegExp(highlight)})`, 'ig')
    : null;

  if (!regex) {
    return <span>{text}</span>;
  }
  const parts = text.split(regex);

  return (
    <div className={highlightContainer}>
      {parts.map((part, i) => {
        if (regex.test(part)) {
          return (
            <span key={i} className={highlightKeyword}>
              {part}
            </span>
          );
        } else {
          return (
            <span key={i} className={highlightText}>
              {part}
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
      <div className={labelTitle}>
        <Highlight text={label.title} highlight={highlight} />
      </div>
      {label.subTitle ? (
        <div className={labelContent}>
          <Highlight text={label.subTitle} highlight={highlight} />
        </div>
      ) : null}
    </div>
  );
});
