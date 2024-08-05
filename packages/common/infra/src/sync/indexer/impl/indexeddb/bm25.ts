/**
 * Parameters of the BM25+ scoring algorithm. Customizing these is almost never
 * necessary, and finetuning them requires an understanding of the BM25 scoring
 * model.
 *
 * Some information about BM25 (and BM25+) can be found at these links:
 *
 *   - https://en.wikipedia.org/wiki/Okapi_BM25
 *   - https://opensourceconnections.com/blog/2015/10/16/bm25-the-next-generation-of-lucene-relevation/
 */
export type BM25Params = {
  /** Term frequency saturation point.
   *
   * Recommended values are between `1.2` and `2`. Higher values increase the
   * difference in score between documents with higher and lower term
   * frequencies. Setting this to `0` or a negative value is invalid. Defaults
   * to `1.2`
   */
  k: number;

  /**
   * Length normalization impact.
   *
   * Recommended values are around `0.75`. Higher values increase the weight
   * that field length has on scoring. Setting this to `0` (not recommended)
   * means that the field length has no effect on scoring. Negative values are
   * invalid. Defaults to `0.7`.
   */
  b: number;

  /**
   * BM25+ frequency normalization lower bound (usually called δ).
   *
   * Recommended values are between `0.5` and `1`. Increasing this parameter
   * increases the minimum relevance of one occurrence of a search term
   * regardless of its (possibly very long) field length. Negative values are
   * invalid. Defaults to `0.5`.
   */
  d: number;
};

const defaultBM25params: BM25Params = { k: 1.2, b: 0.7, d: 0.5 };

export const bm25 = (
  termFreq: number,
  matchingCount: number,
  totalCount: number,
  fieldLength: number,
  avgFieldLength: number,
  bm25params: BM25Params = defaultBM25params
): number => {
  const { k, b, d } = bm25params;
  const invDocFreq = Math.log(
    1 + (totalCount - matchingCount + 0.5) / (matchingCount + 0.5)
  );
  return (
    invDocFreq *
    (d +
      (termFreq * (k + 1)) /
        (termFreq + k * (1 - b + b * (fieldLength / avgFieldLength))))
  );
};
