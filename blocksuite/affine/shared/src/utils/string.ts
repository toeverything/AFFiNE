function escapeRegExp(input: string) {
  // escape regex characters in the input string to prevent regex format errors
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if the name is a fuzzy match of the query.
 *
 * @example
 * ```ts
 * const name = 'John Smith';
 * const query = 'js';
 * const isMatch = isFuzzyMatch(name, query);
 * // isMatch: true
 * ```
 */
export function isFuzzyMatch(name: string, query: string) {
  const pureName = name
    .trim()
    .toLowerCase()
    .split('')
    .filter(char => char !== ' ')
    .join('');

  const regex = new RegExp(
    query
      .split('')
      .filter(char => char !== ' ')
      .map(item => `${escapeRegExp(item)}.*`)
      .join(''),
    'i'
  );
  return regex.test(pureName);
}

/**
 * Calculate the score of the substring match.
 * s = [0.5, 1] if the query is a substring of the name
 * s = (0, 0.5) if there exists a common non-maximal length substring
 * s = 0 if there is no match
 *
 * s is greater if the query has a longer substring.
 */
export function substringMatchScore(name: string, query: string) {
  if (query.length === 0) return 0;
  if (name.length === 0) return 0;
  if (query.length > name.length) return 0;

  query = query.toLowerCase();
  name = name.toLocaleLowerCase();

  let score;
  if (name.includes(query)) {
    score = 1 + query.length / name.length;
  } else {
    let maxMatchLength = 0;
    for (let i = 0; i < query.length; i++) {
      for (let j = 0; j < name.length; j++) {
        let matchLength = 0;
        while (
          i + matchLength < query.length &&
          j + matchLength < name.length &&
          query[i + matchLength] === name[j + matchLength]
        ) {
          matchLength++;
        }
        maxMatchLength = Math.max(maxMatchLength, matchLength);
      }
    }
    score = maxMatchLength / name.length;
  }

  // normalize
  return 0.5 * score;
}
