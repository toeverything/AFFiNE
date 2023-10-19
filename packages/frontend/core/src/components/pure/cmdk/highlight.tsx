import {
  cloneElement,
  isValidElement,
  memo,
  type ReactElement,
  type ReactNode,
} from 'react';

import {
  highlightContainer,
  highlightKeyword,
  highlightText,
  labelContent,
  labelTitle,
} from './highlight.css';

type SearchResultLabel = {
  title: string;
  content: string;
};

type HighlightProps = {
  text: string;
  highlight: string;
};

type HighlightLabelProps = {
  label: SearchResultLabel;
  keyword: string;
};

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const Highlight = memo(function Highlight({
  text = '',
  highlight = '',
}: HighlightProps) {
  const regex = highlight.trim()
    ? new RegExp(`(\\s*${escapeRegExp(highlight)}\\s*)`, 'gi')
    : null;

  if (!regex) {
    return <span>{text}</span>;
  }

  const parts = text.split(regex);

  return (
    <div className={highlightContainer}>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <div key={i} className={highlightKeyword}>
            {part}
          </div>
        ) : (
          <div key={i} className={highlightText}>
            {part}
          </div>
        )
      )}
    </div>
  );
});

export const HighlightLabel = memo(function HighlightLabel({
  label,
  keyword,
}: HighlightLabelProps) {
  return (
    <div>
      <div className={labelTitle}>
        <Highlight text={label.title} highlight={keyword} />
      </div>
      <div className={labelContent}>
        <Highlight text={label.content} highlight={keyword} />
      </div>
    </div>
  );
});

export const HighlightNodes = memo(function HighlightNodes({
  element,
  highlight,
}: {
  element: ReactNode;
  highlight: string;
}): ReactNode {
  if (!highlight || !element) {
    return element;
  }
  if (Array.isArray(element)) {
    return element.map((item, index) => {
      if (item.type === 'strong') {
        const children = HighlightNodes({
          element: item.props.children,
          highlight,
        });

        if (children !== item.props.children) {
          return cloneElement(item as ReactElement, {
            children: children,
          });
        }

        return item;
      }

      return <Highlight key={index} text={item} highlight={highlight} />;
    });
  }
  if (isValidElement(element)) {
    const children = HighlightNodes({
      element: element.props.children,
      highlight,
    });

    if (children !== element.props.children) {
      return cloneElement(element as ReactElement, {
        children: children,
      });
    }

    return element;
  }
  if (typeof element === 'string') {
    return <Highlight text={element} highlight={highlight} />;
  }
  return element;
});
