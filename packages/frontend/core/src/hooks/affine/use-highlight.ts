import { useMemo } from 'react';

function* highlightTextFragmentsGenerator(text: string, query: string) {
  const lowerCaseText = text.toLowerCase();
  let startIndex = lowerCaseText.indexOf(query);

  if (startIndex !== -1) {
    if (startIndex > 0) {
      yield { text: text.substring(0, startIndex), highlight: false };
    }

    yield {
      text: text.substring(startIndex, startIndex + query.length),
      highlight: true,
    };

    if (startIndex + query.length < text.length) {
      yield {
        text: text.substring(startIndex + query.length),
        highlight: false,
      };
    }
  } else {
    startIndex = 0;
    for (const char of query) {
      const pos = text.toLowerCase().indexOf(char, startIndex);
      if (pos !== -1) {
        if (pos > startIndex) {
          yield {
            text: text.substring(startIndex, pos),
            highlight: false,
          };
        }
        yield { text: text.substring(pos, pos + 1), highlight: true };
        startIndex = pos + 1;
      }
    }
    if (startIndex < text.length) {
      yield { text: text.substring(startIndex), highlight: false };
    }
  }
}

export function highlightTextFragments(text: string, query: string) {
  return Array.from(highlightTextFragmentsGenerator(text, query));
}

export function useHighlight(text: string, query: string) {
  return useMemo(() => highlightTextFragments(text, query), [text, query]);
}
