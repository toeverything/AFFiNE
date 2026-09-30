import { getFormulaFunction } from './functions.js';
import type { BinaryOperator, FormulaNode } from './parser.js';
import {
  checkNumber,
  checkText,
  describeType,
  expectNumber,
  FormulaRuntimeError,
  type FormulaValue,
  isTruthy,
  typeOfValue,
  valuesEqual,
  valueToText,
} from './values.js';

export type FormulaEvaluationContext = {
  /**
   * Returns the value of a property of the current row. `ref` is a property
   * id or name. Throws a {@link FormulaRuntimeError} when it cannot be read.
   */
  property: (ref: string) => FormulaValue;
  now: () => Date;
};

export type FormulaEvaluationResult =
  | { ok: true; value: FormulaValue }
  | { ok: false; error: string };

const compare = (
  operator: BinaryOperator,
  left: FormulaValue,
  right: FormulaValue
): boolean => {
  if (left == null || right == null) return false;
  let a: number | string;
  let b: number | string;
  if (
    (typeof left === 'number' && typeof right === 'number') ||
    (typeof left === 'string' && typeof right === 'string')
  ) {
    a = left;
    b = right;
  } else if (left instanceof Date && right instanceof Date) {
    a = left.getTime();
    b = right.getTime();
  } else {
    throw new FormulaRuntimeError(
      `Cannot compare ${describeType(typeOfValue(left))} with ${describeType(typeOfValue(right))}`
    );
  }
  switch (operator) {
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    default:
      return a >= b;
  }
};

const arithmetic = (
  operator: BinaryOperator,
  left: FormulaValue,
  right: FormulaValue
): FormulaValue => {
  if (
    operator === '+' &&
    (typeof left === 'string' || typeof right === 'string')
  ) {
    return checkText(valueToText(left) + valueToText(right));
  }
  // Adding or subtracting an empty cell treats it as 0, so totals work on
  // partially filled rows. Every other operation with an empty cell stays
  // empty instead of producing zeros or division errors.
  if (left == null || right == null) {
    if (operator !== '+' && operator !== '-') return null;
    if (left == null && right == null) return null;
  }
  const a = expectNumber(left, `"${operator}"`);
  const b = expectNumber(right, `"${operator}"`);
  switch (operator) {
    case '+':
      return checkNumber(a + b);
    case '-':
      return checkNumber(a - b);
    case '*':
      return checkNumber(a * b);
    case '/':
      if (b === 0) throw new FormulaRuntimeError('Division by zero');
      return checkNumber(a / b);
    case '%':
      if (b === 0) throw new FormulaRuntimeError('Division by zero');
      return checkNumber(a % b);
    default:
      return checkNumber(a ** b);
  }
};

class Evaluator {
  constructor(private readonly ctx: FormulaEvaluationContext) {}

  evaluate(node: FormulaNode): FormulaValue {
    switch (node.type) {
      case 'number':
      case 'text':
      case 'boolean':
        return node.value;
      case 'list':
        return node.items.map(item => this.evaluate(item));
      case 'property':
        return this.ctx.property(node.ref);
      case 'unary': {
        const value = this.evaluate(node.operand);
        if (node.operator === 'not') return !isTruthy(value);
        if (value == null) return null;
        const number = expectNumber(value, `"${node.operator}"`);
        return node.operator === '-' ? -number : number;
      }
      case 'conditional':
        return isTruthy(this.evaluate(node.test))
          ? this.evaluate(node.consequent)
          : this.evaluate(node.alternate);
      case 'binary':
        return this.binary(node.operator, node.left, node.right);
      case 'call':
        return this.call(node.name, node.args);
    }
  }

  private binary(
    operator: BinaryOperator,
    leftNode: FormulaNode,
    rightNode: FormulaNode
  ): FormulaValue {
    if (operator === 'and') {
      return (
        isTruthy(this.evaluate(leftNode)) && isTruthy(this.evaluate(rightNode))
      );
    }
    if (operator === 'or') {
      return (
        isTruthy(this.evaluate(leftNode)) || isTruthy(this.evaluate(rightNode))
      );
    }
    const left = this.evaluate(leftNode);
    const right = this.evaluate(rightNode);
    switch (operator) {
      case '==':
        return valuesEqual(left, right);
      case '!=':
        return !valuesEqual(left, right);
      case '<':
      case '<=':
      case '>':
      case '>=':
        return compare(operator, left, right);
      default:
        return arithmetic(operator, left, right);
    }
  }

  private call(name: string, args: FormulaNode[]): FormulaValue {
    switch (name) {
      case 'if': {
        const [test, consequent, alternate] = args;
        if (!test || !consequent) return null;
        if (isTruthy(this.evaluate(test))) return this.evaluate(consequent);
        return alternate ? this.evaluate(alternate) : null;
      }
      case 'ifs': {
        let index = 0;
        for (; index + 1 < args.length; index += 2) {
          if (isTruthy(this.evaluate(args[index] as FormulaNode))) {
            return this.evaluate(args[index + 1] as FormulaNode);
          }
        }
        const fallback = args[index];
        return fallback ? this.evaluate(fallback) : null;
      }
      case 'and':
        return args.every(arg => isTruthy(this.evaluate(arg)));
      case 'or':
        return args.some(arg => isTruthy(this.evaluate(arg)));
    }
    const fn = getFormulaFunction(name);
    if (!fn?.call) {
      throw new FormulaRuntimeError(`Unknown function "${name}"`);
    }
    return fn.call(
      args.map(arg => this.evaluate(arg)),
      this.ctx
    );
  }
}

export const evaluateFormula = (
  node: FormulaNode,
  ctx: FormulaEvaluationContext
): FormulaEvaluationResult => {
  try {
    return { ok: true, value: new Evaluator(ctx).evaluate(node) };
  } catch (error) {
    if (error instanceof FormulaRuntimeError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof RangeError) {
      // e.g. call stack overflow on pathological input
      return { ok: false, error: 'The formula could not be calculated' };
    }
    throw error;
  }
};
