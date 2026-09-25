import { getFormulaFunction, unifyFormulaTypes } from './functions.js';
import type { FormulaNode } from './parser.js';
import { FormulaSyntaxError, tokenize } from './tokenizer.js';
import type { FormulaType } from './values.js';

const children = (node: FormulaNode): FormulaNode[] => {
  switch (node.type) {
    case 'list':
      return node.items;
    case 'call':
      return node.args;
    case 'unary':
      return [node.operand];
    case 'binary':
      return [node.left, node.right];
    case 'conditional':
      return [node.test, node.consequent, node.alternate];
    default:
      return [];
  }
};

const walk = (node: FormulaNode, visit: (node: FormulaNode) => void) => {
  visit(node);
  children(node).forEach(child => walk(child, visit));
};

/**
 * Checks that every function exists and is called with a valid number of
 * arguments. Throws a {@link FormulaSyntaxError} pointing at the call.
 */
export const validateFormula = (root: FormulaNode) => {
  walk(root, node => {
    if (node.type !== 'call') return;
    const fn = getFormulaFunction(node.name);
    if (!fn) {
      throw new FormulaSyntaxError(
        `Unknown function "${node.name}"`,
        node.start,
        node.end
      );
    }
    const count = node.args.length;
    if (count < fn.minArgs || count > fn.maxArgs) {
      const expected =
        fn.minArgs === fn.maxArgs
          ? `${fn.minArgs}`
          : fn.maxArgs === Infinity
            ? `at least ${fn.minArgs}`
            : `${fn.minArgs} to ${fn.maxArgs}`;
      throw new FormulaSyntaxError(
        `${fn.name} expects ${expected} argument${expected === '1' ? '' : 's'}, got ${count}. Usage: ${fn.signature}`,
        node.start,
        node.end
      );
    }
  });
};

export const collectPropertyRefs = (root: FormulaNode): string[] => {
  const refs = new Set<string>();
  walk(root, node => {
    if (node.type === 'property') refs.add(node.ref);
  });
  return [...refs];
};

export const inferFormulaType = (
  node: FormulaNode,
  propertyType: (ref: string) => FormulaType
): FormulaType => {
  const infer = (node: FormulaNode): FormulaType => {
    switch (node.type) {
      case 'number':
        return 'number';
      case 'text':
        return 'text';
      case 'boolean':
        return 'boolean';
      case 'list':
        return 'list';
      case 'property':
        return propertyType(node.ref);
      case 'unary':
        return node.operator === 'not' ? 'boolean' : 'number';
      case 'conditional':
        return unifyFormulaTypes([
          infer(node.consequent),
          infer(node.alternate),
        ]);
      case 'binary': {
        switch (node.operator) {
          case '+': {
            const left = infer(node.left);
            const right = infer(node.right);
            if (left === 'text' || right === 'text') return 'text';
            if (left === 'number' && right === 'number') return 'number';
            return 'unknown';
          }
          case '-':
          case '*':
          case '/':
          case '%':
          case '^':
            return 'number';
          default:
            return 'boolean';
        }
      }
      case 'call': {
        const fn = getFormulaFunction(node.name);
        if (!fn) return 'unknown';
        return typeof fn.returns === 'function'
          ? fn.returns(node.args.map(infer))
          : fn.returns;
      }
    }
  };
  return infer(node);
};

const quote = (value: string) =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * Rewrites the argument of every `prop("...")` in the source while keeping
 * the rest of the text untouched. Used to store property ids instead of
 * names, so formulas survive renaming a property.
 *
 * Returns the source unchanged when it cannot be tokenized.
 */
export const rewritePropertyRefs = (
  source: string,
  map: (ref: string) => string
): string => {
  let tokens;
  try {
    tokens = tokenize(source);
  } catch {
    return source;
  }
  let result = '';
  let last = 0;
  for (let i = 0; i + 3 < tokens.length; i++) {
    const [name, open, arg, close] = tokens.slice(i, i + 4);
    if (
      name?.type === 'identifier' &&
      name.value.toLowerCase() === 'prop' &&
      open?.type === 'punctuation' &&
      open.value === '(' &&
      arg?.type === 'string' &&
      close?.type === 'punctuation' &&
      close.value === ')'
    ) {
      const next = map(arg.value);
      if (next !== arg.value) {
        result += source.slice(last, arg.start) + quote(next);
        last = arg.end;
      }
      i += 3;
    }
  }
  return result + source.slice(last);
};
