export function highlighter(
  originText: string,
  before: string,
  after: string,
  matches: [number, number][],
  {
    maxLength = 50,
    maxPrefix = 20,
  }: { maxLength?: number; maxPrefix?: number } = {}
) {
  const merged = mergeRanges(matches);

  if (merged.length === 0) {
    return null;
  }

  const firstMatch = merged[0][0];
  const start = Math.max(
    0,
    Math.min(firstMatch - maxPrefix, originText.length - maxLength)
  );
  const end = Math.min(start + maxLength, originText.length);
  const text = originText.substring(start, end);

  let result = '';

  let pointer = 0;
  for (const match of merged) {
    const matchStart = match[0] - start;
    const matchEnd = match[1] - start;
    if (matchStart >= text.length) {
      break;
    }
    result += text.substring(pointer, matchStart);
    pointer = matchStart;
    const highlighted = text.substring(matchStart, matchEnd);

    if (highlighted.length === 0) {
      continue;
    }

    result += `${before}${highlighted}${after}`;
    pointer = matchEnd;
  }
  result += text.substring(pointer);

  if (start > 0) {
    result = `...${result}`;
  }

  if (end < originText.length) {
    result = `${result}...`;
  }

  return result;
}

function mergeRanges(intervals: [number, number][]) {
  if (intervals.length === 0) return [];

  intervals.sort((a, b) => a[0] - b[0]);

  const merged = [intervals[0]];

  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    const current = intervals[i];

    if (current[0] <= last[1]) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push(current);
    }
  }

  return merged;
}
