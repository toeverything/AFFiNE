export class FormulaSyntaxError extends Error {
  constructor(
    message: string,
    readonly start: number,
    readonly end: number
  ) {
    super(message);
    this.name = 'FormulaSyntaxError';
  }
}

export type TokenType =
  | 'number'
  | 'string'
  | 'identifier'
  | 'operator'
  | 'punctuation'
  | 'eof';

export type Token = {
  type: TokenType;
  /**
   * For string tokens this is the unescaped content, for every other token
   * it is the source text.
   */
  value: string;
  start: number;
  end: number;
};

// Longest operators first so `<=` wins over `<`.
const OPERATORS = [
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '+',
  '-',
  '*',
  '/',
  '%',
  '^',
  '<',
  '>',
  '=',
  '!',
  '?',
  ':',
];

const PUNCTUATION = new Set(['(', ')', ',', '[', ']']);

// Smart quotes are accepted because they are easy to type by accident on
// systems with automatic quote substitution.
const STRING_QUOTES: Record<string, string> = {
  '"': '"',
  "'": "'",
  '“': '”',
  '‘': '’',
};

const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
};

const isDigit = (char: string | undefined) =>
  char != null && char >= '0' && char <= '9';

const isIdentifierStart = (char: string | undefined) =>
  char != null && /[A-Za-z_]/.test(char);

const isIdentifierPart = (char: string | undefined) =>
  char != null && /[A-Za-z0-9_]/.test(char);

const readNumber = (source: string, start: number): Token => {
  let index = start;
  while (isDigit(source[index])) index++;
  if (source[index] === '.') {
    index++;
    while (isDigit(source[index])) index++;
  }
  if (source[index] === 'e' || source[index] === 'E') {
    let exponent = index + 1;
    if (source[exponent] === '+' || source[exponent] === '-') exponent++;
    if (isDigit(source[exponent])) {
      index = exponent;
      while (isDigit(source[index])) index++;
    }
  }
  return {
    type: 'number',
    value: source.slice(start, index),
    start,
    end: index,
  };
};

const readString = (source: string, start: number, close: string): Token => {
  let index = start + 1;
  let value = '';
  while (index < source.length) {
    const char = source[index] as string;
    if (char === close) {
      return { type: 'string', value, start, end: index + 1 };
    }
    if (char === '\\' && index + 1 < source.length) {
      const next = source[index + 1] as string;
      value += ESCAPES[next] ?? next;
      index += 2;
      continue;
    }
    value += char;
    index++;
  }
  throw new FormulaSyntaxError('Unterminated text', start, source.length);
};

export const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index] as string;
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (isDigit(char) || (char === '.' && isDigit(source[index + 1]))) {
      const token = readNumber(source, index);
      tokens.push(token);
      index = token.end;
      continue;
    }
    const close = STRING_QUOTES[char];
    if (close) {
      const token = readString(source, index, close);
      tokens.push(token);
      index = token.end;
      continue;
    }
    if (isIdentifierStart(char)) {
      let end = index + 1;
      while (isIdentifierPart(source[end])) end++;
      tokens.push({
        type: 'identifier',
        value: source.slice(index, end),
        start: index,
        end,
      });
      index = end;
      continue;
    }
    if (PUNCTUATION.has(char)) {
      tokens.push({
        type: 'punctuation',
        value: char,
        start: index,
        end: index + 1,
      });
      index++;
      continue;
    }
    const operator = OPERATORS.find(op => source.startsWith(op, index));
    if (operator) {
      tokens.push({
        type: 'operator',
        value: operator,
        start: index,
        end: index + operator.length,
      });
      index += operator.length;
      continue;
    }
    throw new FormulaSyntaxError(
      `Unexpected character "${char}"`,
      index,
      index + 1
    );
  }
  tokens.push({
    type: 'eof',
    value: '',
    start: source.length,
    end: source.length,
  });
  return tokens;
};
