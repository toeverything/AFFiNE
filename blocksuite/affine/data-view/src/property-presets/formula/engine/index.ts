import { validateFormula } from './analysis.js';
import { type FormulaNode, parseFormula } from './parser.js';
import { FormulaSyntaxError } from './tokenizer.js';

export * from './analysis.js';
export * from './evaluator.js';
export * from './functions.js';
export * from './parser.js';
export * from './tokenizer.js';
export * from './values.js';

export type FormulaCompileResult =
  | { ok: true; ast: FormulaNode }
  | {
      ok: false;
      error: { message: string; start: number; end: number };
    };

export const compileFormula = (source: string): FormulaCompileResult => {
  try {
    const ast = parseFormula(source);
    validateFormula(ast);
    return { ok: true, ast };
  } catch (error) {
    if (error instanceof FormulaSyntaxError) {
      return {
        ok: false,
        error: {
          message: error.message,
          start: error.start,
          end: error.end,
        },
      };
    }
    throw error;
  }
};

const CACHE_LIMIT = 256;
const cache = new Map<string, FormulaCompileResult>();

/**
 * Same as {@link compileFormula}, but reuses the result for sources that
 * were compiled recently. Every cell of a formula column shares the same
 * source, so this avoids parsing it once per row.
 */
export const compileFormulaCached = (source: string): FormulaCompileResult => {
  const cached = cache.get(source);
  if (cached) return cached;
  const result = compileFormula(source);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(source, result);
  return result;
};
