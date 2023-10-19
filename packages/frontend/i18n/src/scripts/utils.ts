export interface TranslationRes {
  [x: string]: string | TranslationRes;
}

/**
 * Recursively flattens a JSON object using dot notation.
 *
 * NOTE: input must be an object as described by JSON spec. Arbitrary
 * JS objects (e.g. {a: () => 42}) may result in unexpected output.
 * MOREOVER, it removes keys with empty objects/arrays as value (see
 * examples bellow).
 *
 * @example
 * flattenTranslation({a: 1, b: [{c: 2, d: {e: 3}}, 4]})
 * // {a: 1, b.0.c: 2, b.0.d.e: 3, b.1: 4}
 * flattenTranslation({a: 1, b: [{c: 2, d: {e: [true, false, {f: 1}]}}]})
 * // {a: 1, b.0.c: 2, b.0.d.e.0: true, b.0.d.e.1: false, b.0.d.e.2.f: 1}
 * flattenTranslation({a: 1, b: [], c: {}})
 * // {a: 1}
 *
 * @param obj item to be flattened
 */
export const flattenTranslation = (
  obj: string | TranslationRes,
  path?: string
): TranslationRes => {
  if (!(obj instanceof Object)) return { [path ?? '']: obj };

  return Object.keys(obj).reduce((output, key) => {
    return {
      ...output,
      ...flattenTranslation(obj[key], path ? path + '.' + key : key),
    };
  }, {});
};
