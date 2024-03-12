import { useMemo } from 'react';

function* highlightTextFragmentsGenerator(text: string, query: string) {
  const cleanedText = text.replace(/\r?\n|\r|\t/g, '');
  const lowerCaseText = cleanedText.toLowerCase();
  query = query.toLowerCase();
  let startIndex = lowerCaseText.indexOf(query);

  if (startIndex !== -1) {
    if (startIndex > 0) {
      yield { text: cleanedText.substring(0, startIndex), highlight: false };
    }

    yield {
      text: cleanedText.substring(startIndex, startIndex + query.length),
      highlight: true,
    };

    if (startIndex + query.length < cleanedText.length) {
      yield {
        text: cleanedText.substring(startIndex + query.length),
        highlight: false,
      };
    }
  } else {
    startIndex = 0;
    for (const char of query) {
      const pos = cleanedText.toLowerCase().indexOf(char, startIndex);
      if (pos !== -1) {
        if (pos > startIndex) {
          yield {
            text: cleanedText.substring(startIndex, pos),
            highlight: false,
          };
        }
        yield { text: cleanedText.substring(pos, pos + 1), highlight: true };
        startIndex = pos + 1;
      }
    }
    if (startIndex < cleanedText.length) {
      yield { text: cleanedText.substring(startIndex), highlight: false };
    }
  }
}

export function highlightTextFragments(text: string, query: string) {
  return Array.from(highlightTextFragmentsGenerator(text, query));
}

export function useHighlight(text: string, query: string) {
  return useMemo(() => highlightTextFragments(text, query), [text, query]);
}
