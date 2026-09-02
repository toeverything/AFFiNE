import {
  type MarkdownAdapterPreprocessor,
  MarkdownPreprocessorExtension,
} from '@blocksuite/affine-shared/adapters';

/**
 * Check if a string is a URL
 * @param str
 * @returns
 */
function isUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

// Types for footnote parser tokens
type Token = {
  type: 'TEXT' | 'FOOTNOTE_REF' | 'SPACE';
  value: string;
};

class FootnoteReferenceParser {
  private pos: number = 0;
  private input: string = '';
  private tokens: Token[] = [];

  // Lexer: Convert input string into tokens
  private tokenize(input: string): Token[] {
    this.input = input;
    this.pos = 0;
    this.tokens = [];

    while (this.pos < this.input.length) {
      const char = this.input[this.pos];

      // Handle spaces
      if (char === ' ') {
        this.tokens.push({ type: 'SPACE', value: ' ' });
        this.pos++;
        continue;
      }

      // Match footnote reference [^...]
      if (char === '[' && this.input[this.pos + 1] === '^') {
        let footnoteRef = '[^';
        this.pos += 2;

        while (this.pos < this.input.length && this.input[this.pos] !== ']') {
          footnoteRef += this.input[this.pos];
          this.pos++;
        }

        if (this.pos < this.input.length) {
          footnoteRef += ']';
          this.pos++;
          // Only add as footnote reference if it's not followed by ':'
          if (this.pos >= this.input.length || this.input[this.pos] !== ':') {
            this.tokens.push({ type: 'FOOTNOTE_REF', value: footnoteRef });
          } else {
            this.tokens.push({ type: 'TEXT', value: footnoteRef });
          }
        } else {
          // If we didn't find a closing bracket, treat it as regular text
          this.tokens.push({ type: 'TEXT', value: footnoteRef });
        }
        continue;
      }

      // Handle regular text
      let text = '';
      while (
        this.pos < this.input.length &&
        this.input[this.pos] !== ' ' &&
        !(this.input[this.pos] === '[' && this.input[this.pos + 1] === '^')
      ) {
        text += this.input[this.pos];
        this.pos++;
      }
      if (text) {
        this.tokens.push({ type: 'TEXT', value: text });
      }
    }

    return this.tokens;
  }

  // Process tokens to add spaces after URLs
  private processTokens(tokens: Token[]): string {
    let result = '';
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      if (token.type === 'TEXT') {
        result += token.value;

        // Check if next token is a footnote reference
        if (
          i + 1 < tokens.length &&
          tokens[i + 1].type === 'FOOTNOTE_REF' &&
          isUrl(token.value)
        ) {
          result += ' ';
        }
      } else {
        result += token.value;
      }

      i++;
    }

    return result;
  }

  // Main processing function
  public process(input: string): string {
    const tokens = this.tokenize(input);
    return this.processTokens(tokens);
  }
}

/**
 * Preprocess footnote references to avoid markdown link parsing
 * Only add space when footnote reference follows a URL
 * @param content
 * @returns
 * @example
 * ```md
 * https://example.com[^label] -> https://example.com [^label]
 * normal text[^label] -> normal text[^label]
 * ```
 */
export function preprocessFootnoteReference(content: string) {
  const parser = new FootnoteReferenceParser();
  return parser.process(content);
}

const footnoteReferencePreprocessor: MarkdownAdapterPreprocessor = {
  name: 'footnote-reference',
  levels: ['block', 'slice', 'doc'],
  preprocess: content => {
    return preprocessFootnoteReference(content);
  },
};

export const FootnoteReferenceMarkdownPreprocessorExtension =
  MarkdownPreprocessorExtension(footnoteReferencePreprocessor);
