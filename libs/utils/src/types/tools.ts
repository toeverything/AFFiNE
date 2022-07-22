/**
 * get all value`s type of a object
 *
 * @example
 * ```ts
 * // except: type Values = 1 | '2'
 * type Values = ValueOf<{a: 1, b: '2'}>
 * ```
 */
export type ValueOf<X extends Record<string, unknown>> = X[keyof X];

/**
 * get type of a array by index
 *
 * @example
 * ```ts
 * // except: type FirstType = string;
 * type FirstType = First<[string], 0>
 * ```
 */
export type IndexOf<X extends unknown[], I extends number> = X[I];

/**
 * get first type of a array
 *
 * @example
 * ```ts
 * // except: type FirstType = string;
 * type FirstType = First<[string]>
 * ```
 */
export type First<X extends unknown[]> = IndexOf<X, 0>;
