const COMMAND = 0;
const NUMBER = 1;
const EOD = 2;
type TokenType = 0 | 1 | 2;

interface PathToken {
  type: TokenType;
  text: string;
}

export interface Segment {
  key: string;
  data: number[];
}

const PARAMS: Record<string, number> = {
  A: 7,
  a: 7,
  C: 6,
  c: 6,
  H: 1,
  h: 1,
  L: 2,
  l: 2,
  M: 2,
  m: 2,
  Q: 4,
  q: 4,
  S: 4,
  s: 4,
  T: 2,
  t: 2,
  V: 1,
  v: 1,
  Z: 0,
  z: 0,
};

function tokenize(d: string): PathToken[] {
  const tokens: PathToken[] = [];
  let match: RegExpMatchArray | null;

  while (d !== '') {
    match = d.match(/^([ \t\r\n,]+)/);
    if (match) {
      d = d.slice(match[0].length);
      continue;
    }
    match = d.match(/^([aAcChHlLmMqQsStTvVzZ])/);
    if (match) {
      tokens.push({ type: COMMAND, text: match[0] });
      d = d.slice(match[0].length);
      continue;
    }
    match = d.match(
      /^(([-+]?[0-9]+(\.[0-9]*)?|[-+]?\.[0-9]+)([eE][-+]?[0-9]+)?)/
    );
    if (match) {
      tokens.push({ type: NUMBER, text: `${parseFloat(match[0])}` });
      d = d.slice(match[0].length);
    } else {
      return [];
    }
  }
  tokens.push({ type: EOD, text: '' });
  return tokens;
}

function isType(token: PathToken, type: number) {
  return token.type === type;
}

export function parsePath(d: string): Segment[] {
  const segments: Segment[] = [];
  const tokens = tokenize(d);
  let mode = 'BOD';
  let index = 0;
  let token = tokens[index];
  while (!isType(token, EOD)) {
    let paramsCount = 0;
    const params: number[] = [];
    if (mode === 'BOD') {
      if (token.text === 'M' || token.text === 'm') {
        index++;
        paramsCount = PARAMS[token.text];
        mode = token.text;
      } else {
        return parsePath('M0,0' + d);
      }
    } else if (isType(token, NUMBER)) {
      paramsCount = PARAMS[mode];
    } else {
      index++;
      paramsCount = PARAMS[token.text];
      mode = token.text;
    }
    if (index + paramsCount < tokens.length) {
      for (let i = index; i < index + paramsCount; i++) {
        const numbeToken = tokens[i];
        if (isType(numbeToken, NUMBER)) {
          params[params.length] = +numbeToken.text;
        } else {
          throw new Error(
            'Param not a number: ' + mode + ',' + numbeToken.text
          );
        }
      }
      if (typeof PARAMS[mode] === 'number') {
        const segment: Segment = { key: mode, data: params };
        segments.push(segment);
        index += paramsCount;
        token = tokens[index];
        if (mode === 'M') mode = 'L';
        if (mode === 'm') mode = 'l';
      } else {
        throw new Error('Bad segment: ' + mode);
      }
    } else {
      throw new Error('Path data ended short');
    }
  }
  return segments;
}

export function serialize(segments: Segment[]): string {
  const tokens: (string | number)[] = [];
  for (const { key, data } of segments) {
    tokens.push(key);
    switch (key) {
      case 'C':
      case 'c':
        tokens.push(
          data[0],
          `${data[1]},`,
          data[2],
          `${data[3]},`,
          data[4],
          data[5]
        );
        break;
      case 'S':
      case 's':
      case 'Q':
      case 'q':
        tokens.push(data[0], `${data[1]},`, data[2], data[3]);
        break;
      default:
        tokens.push(...data);
        break;
    }
  }
  return tokens.join(' ');
}
