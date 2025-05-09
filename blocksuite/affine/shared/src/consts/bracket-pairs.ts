interface BracketPair {
  name: string;
  left: string;
  right: string;
}

export const BRACKET_PAIRS: BracketPair[] = [
  {
    name: 'parenthesis',
    left: '(',
    right: ')',
  },
  {
    name: 'square bracket',
    left: '[',
    right: ']',
  },
  {
    name: 'curly bracket',
    left: '{',
    right: '}',
  },
  {
    name: 'single quote',
    left: "'",
    right: "'",
  },
  {
    name: 'double quote',
    left: '"',
    right: '"',
  },
  {
    name: 'fullwidth single quote',
    left: '‘',
    right: '’',
  },
  {
    name: 'fullwidth double quote',
    left: '“',
    right: '”',
  },
  {
    name: 'fullwidth parenthesis',
    left: '（',
    right: '）',
  },
  {
    name: 'fullwidth square bracket',
    left: '【',
    right: '】',
  },
  {
    name: 'fullwidth angle bracket',
    left: '《',
    right: '》',
  },
  {
    name: 'corner bracket',
    left: '「',
    right: '」',
  },
  {
    name: 'white corner bracket',
    left: '『',
    right: '』',
  },
];
