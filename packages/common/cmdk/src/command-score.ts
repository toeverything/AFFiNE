/* eslint-disable */
// @ts-nocheck

// The scores are arranged so that a continuous match of characters will
// result in a total score of 1.
//
// The best case, this character is a match, and either this is the start
// of the string, or the previous character was also a match.
var SCORE_CONTINUE_MATCH = 1,
  // A new match at the start of a word scores better than a new match
  // elsewhere as it's more likely that the user will type the starts
  // of fragments.
  // NOTE: We score word jumps between spaces slightly higher than slashes, brackets
  // hyphens, etc.
  SCORE_SPACE_WORD_JUMP = 0.9,
  SCORE_NON_SPACE_WORD_JUMP = 0.8,
  // Any other match isn't ideal, but we include it for completeness.
  SCORE_CHARACTER_JUMP = 0.17,
  // If the user transposed two letters, it should be significantly penalized.
  //
  // i.e. "ouch" is more likely than "curtain" when "uc" is typed.
  SCORE_TRANSPOSITION = 0.1,
  // The goodness of a match should decay slightly with each missing
  // character.
  //
  // i.e. "bad" is more likely than "bard" when "bd" is typed.
  //
  // This will not change the order of suggestions based on SCORE_* until
  // 100 characters are inserted between matches.
  PENALTY_SKIPPED = 0.999,
  // The goodness of an exact-case match should be higher than a
  // case-insensitive match by a small amount.
  //
  // i.e. "HTML" is more likely than "haml" when "HM" is typed.
  //
  // This will not change the order of suggestions based on SCORE_* until
  // 1000 characters are inserted between matches.
  PENALTY_CASE_MISMATCH = 0.9999,
  // Match higher for letters closer to the beginning of the word
  PENALTY_DISTANCE_FROM_START = 0.9,
  // If the word has more characters than the user typed, it should
  // be penalised slightly.
  //
  // i.e. "html" is more likely than "html5" if I type "html".
  //
  // However, it may well be the case that there's a sensible secondary
  // ordering (like alphabetical) that it makes sense to rely on when
  // there are many prefix matches, so we don't make the penalty increase
  // with the number of tokens.
  PENALTY_NOT_COMPLETE = 0.99;

var IS_GAP_REGEXP = /[\\\/_+.#"@\[\(\{&]/,
  COUNT_GAPS_REGEXP = /[\\\/_+.#"@\[\(\{&]/g,
  IS_SPACE_REGEXP = /[\s-]/,
  COUNT_SPACE_REGEXP = /[\s-]/g;

function commandScoreInner(
  string,
  abbreviation,
  lowerString,
  lowerAbbreviation,
  stringIndex,
  abbreviationIndex,
  memoizedResults
) {
  if (abbreviationIndex === abbreviation.length) {
    if (stringIndex === string.length) {
      return SCORE_CONTINUE_MATCH;
    }
    return PENALTY_NOT_COMPLETE;
  }

  var memoizeKey = `${stringIndex},${abbreviationIndex}`;
  if (memoizedResults[memoizeKey] !== undefined) {
    return memoizedResults[memoizeKey];
  }

  var abbreviationChar = lowerAbbreviation.charAt(abbreviationIndex);
  var index = lowerString.indexOf(abbreviationChar, stringIndex);
  var highScore = 0;

  var score, transposedScore, wordBreaks, spaceBreaks;

  while (index >= 0) {
    score = commandScoreInner(
      string,
      abbreviation,
      lowerString,
      lowerAbbreviation,
      index + 1,
      abbreviationIndex + 1,
      memoizedResults
    );
    if (score > highScore) {
      if (index === stringIndex) {
        score *= SCORE_CONTINUE_MATCH;
      } else if (IS_GAP_REGEXP.test(string.charAt(index - 1))) {
        score *= SCORE_NON_SPACE_WORD_JUMP;
        wordBreaks = string
          .slice(stringIndex, index - 1)
          .match(COUNT_GAPS_REGEXP);
        if (wordBreaks && stringIndex > 0) {
          score *= Math.pow(PENALTY_SKIPPED, wordBreaks.length);
        }
      } else if (IS_SPACE_REGEXP.test(string.charAt(index - 1))) {
        score *= SCORE_SPACE_WORD_JUMP;
        spaceBreaks = string
          .slice(stringIndex, index - 1)
          .match(COUNT_SPACE_REGEXP);
        if (spaceBreaks && stringIndex > 0) {
          score *= Math.pow(PENALTY_SKIPPED, spaceBreaks.length);
        }
      } else {
        score *= SCORE_CHARACTER_JUMP;
        if (stringIndex > 0) {
          score *= Math.pow(PENALTY_SKIPPED, index - stringIndex);
        }
      }

      if (string.charAt(index) !== abbreviation.charAt(abbreviationIndex)) {
        score *= PENALTY_CASE_MISMATCH;
      }
    }

    if (
      (score < SCORE_TRANSPOSITION &&
        lowerString.charAt(index - 1) ===
          lowerAbbreviation.charAt(abbreviationIndex + 1)) ||
      (lowerAbbreviation.charAt(abbreviationIndex + 1) ===
        lowerAbbreviation.charAt(abbreviationIndex) && // allow duplicate letters. Ref #7428
        lowerString.charAt(index - 1) !==
          lowerAbbreviation.charAt(abbreviationIndex))
    ) {
      transposedScore = commandScoreInner(
        string,
        abbreviation,
        lowerString,
        lowerAbbreviation,
        index + 1,
        abbreviationIndex + 2,
        memoizedResults
      );

      if (transposedScore * SCORE_TRANSPOSITION > score) {
        score = transposedScore * SCORE_TRANSPOSITION;
      }
    }

    if (score > highScore) {
      highScore = score;
    }

    index = lowerString.indexOf(abbreviationChar, index + 1);
  }

  memoizedResults[memoizeKey] = highScore;
  return highScore;
}

function formatInput(string) {
  // convert all valid space characters to space so they match each other
  return string.toLowerCase().replace(COUNT_SPACE_REGEXP, ' ');
}

export function commandScore(string: string, abbreviation: string): number {
  /* NOTE:
   * in the original, we used to do the lower-casing on each recursive call, but this meant that toLowerCase()
   * was the dominating cost in the algorithm, passing both is a little ugly, but considerably faster.
   */
  return commandScoreInner(
    string,
    abbreviation,
    formatInput(string),
    formatInput(abbreviation),
    0,
    0,
    {}
  );
}
