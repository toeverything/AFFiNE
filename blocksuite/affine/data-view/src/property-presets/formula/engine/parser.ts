import { FormulaSyntaxError, type Token, tokenize } from './tokenizer.js';

export type BinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '^'
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'and'
  | 'or';

export type UnaryOperator = '-' | '+' | 'not';

type Span = { start: number; end: number };

export type FormulaNode = Span &
  (
    | { type: 'number'; value: number }
    | { type: 'text'; value: string }
    | { type: 'boolean'; value: boolean }
    | { type: 'list'; items: FormulaNode[] }
    | { type: 'property'; ref: string }
    | { type: 'call'; name: string; args: FormulaNode[] }
    | { type: 'unary'; operator: UnaryOperator; operand: FormulaNode }
    | {
        type: 'binary';
        operator: BinaryOperator;
        left: FormulaNode;
        right: FormulaNode;
      }
    | {
        type: 'conditional';
        test: FormulaNode;
        consequent: FormulaNode;
        alternate: FormulaNode;
      }
  );

export const MAX_FORMULA_LENGTH = 4000;
const MAX_DEPTH = 64;

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

const COMPARISON: Record<string, BinaryOperator> = {
  '<': '<',
  '<=': '<=',
  '>': '>',
  '>=': '>=',
};

const EQUALITY: Record<string, BinaryOperator> = {
  '==': '==',
  '=': '==',
  '!=': '!=',
};

class Parser {
  private index = 0;
  private depth = 0;

  constructor(private readonly tokens: Token[]) {}

  private get current(): Token {
    return this.tokens[this.index] as Token;
  }

  private next(): Token {
    const token = this.current;
    if (token.type !== 'eof') this.index++;
    return token;
  }

  private isOperator(...values: string[]) {
    const token = this.current;
    return token.type === 'operator' && values.includes(token.value);
  }

  private isPunctuation(value: string) {
    const token = this.current;
    return token.type === 'punctuation' && token.value === value;
  }

  private isKeyword(value: string) {
    const token = this.current;
    return token.type === 'identifier' && token.value.toLowerCase() === value;
  }

  private expectPunctuation(value: string): Token {
    if (!this.isPunctuation(value)) {
      throw this.unexpected(`Expected "${value}"`);
    }
    return this.next();
  }

  private unexpected(message?: string) {
    const token = this.current;
    if (token.type === 'eof') {
      return new FormulaSyntaxError(
        message ? `${message} but the formula ended` : 'Unexpected end',
        token.start,
        token.end
      );
    }
    const text =
      token.type === 'string' ? JSON.stringify(token.value) : token.value;
    return new FormulaSyntaxError(
      message ? `${message} but found ${text}` : `Unexpected ${text}`,
      token.start,
      token.end
    );
  }

  private enter(start: number) {
    if (++this.depth > MAX_DEPTH) {
      throw new FormulaSyntaxError(
        'Formula is nested too deeply',
        start,
        start + 1
      );
    }
  }

  private leave() {
    this.depth--;
  }

  parse(): FormulaNode {
    const node = this.expression();
    if (this.current.type !== 'eof') {
      throw this.unexpected();
    }
    return node;
  }

  private expression(): FormulaNode {
    this.enter(this.current.start);
    try {
      return this.conditional();
    } finally {
      this.leave();
    }
  }

  private conditional(): FormulaNode {
    const test = this.or();
    if (!this.isOperator('?')) return test;
    this.next();
    const consequent = this.expression();
    if (!this.isOperator(':')) {
      throw this.unexpected('Expected ":"');
    }
    this.next();
    const alternate = this.expression();
    return {
      type: 'conditional',
      test,
      consequent,
      alternate,
      start: test.start,
      end: alternate.end,
    };
  }

  private or(): FormulaNode {
    let left = this.and();
    while (this.isOperator('||') || this.isKeyword('or')) {
      this.next();
      const right = this.and();
      left = this.binary('or', left, right);
    }
    return left;
  }

  private and(): FormulaNode {
    let left = this.equality();
    while (this.isOperator('&&') || this.isKeyword('and')) {
      this.next();
      const right = this.equality();
      left = this.binary('and', left, right);
    }
    return left;
  }

  private equality(): FormulaNode {
    let left = this.comparison();
    while (this.isOperator('==', '=', '!=')) {
      const operator = EQUALITY[this.next().value] as BinaryOperator;
      left = this.binary(operator, left, this.comparison());
    }
    return left;
  }

  private comparison(): FormulaNode {
    let left = this.additive();
    while (this.isOperator('<', '<=', '>', '>=')) {
      const operator = COMPARISON[this.next().value] as BinaryOperator;
      left = this.binary(operator, left, this.additive());
    }
    return left;
  }

  private additive(): FormulaNode {
    let left = this.multiplicative();
    while (this.isOperator('+', '-')) {
      const operator = this.next().value as BinaryOperator;
      left = this.binary(operator, left, this.multiplicative());
    }
    return left;
  }

  private multiplicative(): FormulaNode {
    let left = this.unary();
    while (this.isOperator('*', '/', '%')) {
      const operator = this.next().value as BinaryOperator;
      left = this.binary(operator, left, this.unary());
    }
    return left;
  }

  private unary(): FormulaNode {
    const token = this.current;
    let operator: UnaryOperator | undefined;
    if (this.isOperator('-', '+')) {
      operator = token.value as UnaryOperator;
    } else if (this.isOperator('!') || this.isKeyword('not')) {
      // `not(x)` is a function call, `not x` is the operator.
      const following = this.tokens[this.index + 1];
      const isCall =
        token.type === 'identifier' &&
        following?.type === 'punctuation' &&
        following.value === '(';
      if (!isCall) operator = 'not';
    }
    if (!operator) return this.power();
    this.next();
    this.enter(token.start);
    try {
      const operand = this.unary();
      return {
        type: 'unary',
        operator,
        operand,
        start: token.start,
        end: operand.end,
      };
    } finally {
      this.leave();
    }
  }

  private power(): FormulaNode {
    const base = this.primary();
    if (!this.isOperator('^')) return base;
    this.next();
    // Right associative, and `2 ^ -1` is allowed.
    return this.binary('^', base, this.unary());
  }

  private primary(): FormulaNode {
    const token = this.current;
    switch (token.type) {
      case 'number': {
        this.next();
        return {
          type: 'number',
          value: Number(token.value),
          start: token.start,
          end: token.end,
        };
      }
      case 'string': {
        this.next();
        return {
          type: 'text',
          value: token.value,
          start: token.start,
          end: token.end,
        };
      }
      case 'identifier':
        return this.identifier();
      case 'punctuation': {
        if (token.value === '(') {
          this.next();
          const node = this.expression();
          const close = this.expectPunctuation(')');
          return { ...node, start: token.start, end: close.end };
        }
        if (token.value === '[') {
          this.next();
          const items = this.list(']');
          const close = this.expectPunctuation(']');
          return {
            type: 'list',
            items,
            start: token.start,
            end: close.end,
          };
        }
        break;
      }
    }
    throw this.unexpected();
  }

  private identifier(): FormulaNode {
    const token = this.next();
    const name = token.value;
    const lower = name.toLowerCase();
    if (!this.isPunctuation('(')) {
      if (lower === 'true' || lower === 'false') {
        return {
          type: 'boolean',
          value: lower === 'true',
          start: token.start,
          end: token.end,
        };
      }
      const constant = CONSTANTS[lower];
      if (constant != null) {
        return {
          type: 'number',
          value: constant,
          start: token.start,
          end: token.end,
        };
      }
      throw new FormulaSyntaxError(
        `Unknown name "${name}". Use prop("${name}") to reference a property`,
        token.start,
        token.end
      );
    }
    this.next();
    if (lower === 'prop') {
      const ref = this.current;
      if (ref.type !== 'string') {
        throw this.unexpected('Expected a property name in quotes');
      }
      this.next();
      const close = this.expectPunctuation(')');
      return {
        type: 'property',
        ref: ref.value,
        start: token.start,
        end: close.end,
      };
    }
    const args = this.list(')');
    const close = this.expectPunctuation(')');
    return {
      type: 'call',
      name: lower,
      args,
      start: token.start,
      end: close.end,
    };
  }

  private list(close: string): FormulaNode[] {
    const items: FormulaNode[] = [];
    if (this.isPunctuation(close)) return items;
    items.push(this.expression());
    while (this.isPunctuation(',')) {
      this.next();
      items.push(this.expression());
    }
    return items;
  }

  private binary(
    operator: BinaryOperator,
    left: FormulaNode,
    right: FormulaNode
  ): FormulaNode {
    return {
      type: 'binary',
      operator,
      left,
      right,
      start: left.start,
      end: right.end,
    };
  }
}

export const parseFormula = (source: string): FormulaNode => {
  if (source.length > MAX_FORMULA_LENGTH) {
    throw new FormulaSyntaxError(
      `Formula is too long (max ${MAX_FORMULA_LENGTH} characters)`,
      MAX_FORMULA_LENGTH,
      source.length
    );
  }
  return new Parser(tokenize(source)).parse();
};
