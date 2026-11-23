import {
  type FootNoteReferenceParams,
  FootNoteReferenceParamsSchema,
} from '@blocksuite/affine-model';
import {
  type MarkdownAdapterPreprocessor,
  MarkdownPreprocessorExtension,
} from '@blocksuite/affine-shared/adapters';

// Types for footnote parser tokens
type Token = {
  type:
    | 'FOOTNOTE_START'
    | 'REFERENCE'
    | 'SEPARATOR'
    | 'JSON_CONTENT'
    | 'NEWLINE';
  value: string;
};

type FootnoteDefinition = {
  reference: string;
  content: FootNoteReferenceParams;
};

/**
 * Check if a URL is already encoded with encodeURIComponent to avoid markdown link parsing
 * @example
 * https://example.com/path%20with%20spaces should return false
 * https://example.com/ should return false
 * https%3A%2F%2Fexample.com%2F should return true
 */
function isFullyEncoded(uri: string): boolean {
  try {
    // Should check if the components of the URI are fully encoded
    return uri === encodeURIComponent(decodeURIComponent(uri));
  } catch {
    // If decoding fails, the URI contains invalid percent-encoding
    return true;
  }
}

// Format footnote definition with consistent spacing
function formatFootnoteDefinition(reference: string, data: object): string {
  return `[^${reference}]: ${JSON.stringify(data)}`;
}

class FootnoteParser {
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

      // Handle newlines
      if (char === '\n') {
        this.tokens.push({ type: 'NEWLINE', value: '\n' });
        this.pos++;
        continue;
      }

      // Match footnote start [^
      if (char === '[' && this.input[this.pos + 1] === '^') {
        this.tokens.push({ type: 'FOOTNOTE_START', value: '[^' });
        this.pos += 2;
        continue;
      }

      // Match reference content until ]
      if (
        this.tokens.length > 0 &&
        this.tokens[this.tokens.length - 1].type === 'FOOTNOTE_START'
      ) {
        let reference = '';
        while (this.pos < this.input.length && this.input[this.pos] !== ']') {
          reference += this.input[this.pos];
          this.pos++;
        }
        if (reference) {
          this.tokens.push({ type: 'REFERENCE', value: reference });
        }
        this.pos++; // Skip the closing ]
        continue;
      }

      // Match separator ': '
      if (char === ':') {
        let nextPos = this.pos + 1;
        while (nextPos < this.input.length && this.input[nextPos] === ' ') {
          nextPos++;
        }
        this.tokens.push({
          type: 'SEPARATOR',
          value: this.input.slice(this.pos, nextPos),
        });
        this.pos = nextPos;
        continue;
      }

      // Match JSON content
      if (char === '{') {
        let jsonContent = '';
        let braceCount = 1;
        let startPos = this.pos;

        this.pos++; // Move past the opening brace
        let inString = false;
        let escaped = false;
        while (this.pos < this.input.length && braceCount > 0) {
          const char = this.input[this.pos];
          if (!inString) {
            if (char === '{') braceCount++;
            else if (char === '}') braceCount--;
          }
          if (escaped) {
            escaped = false;
          } else {
            if (char === '\\') {
              escaped = true;
            } else if (char === '"') {
              inString = !inString;
            }
          }
          jsonContent += char;
          this.pos++;
        }

        if (braceCount === 0) {
          this.tokens.push({
            type: 'JSON_CONTENT',
            value: '{' + jsonContent,
          });
        } else {
          // Reset position if JSON is malformed
          this.pos = startPos;
          this.pos++;
        }
        continue;
      }

      // Skip other characters
      this.pos++;
    }

    return this.tokens;
  }

  // Parser: Convert tokens into structured data
  private parse(tokens: Token[]): FootnoteDefinition[] {
    const footnotes: FootnoteDefinition[] = [];
    let currentFootnote: Partial<FootnoteDefinition> = {};
    let isParsingFootnote = false;

    for (const token of tokens) {
      switch (token.type) {
        case 'FOOTNOTE_START':
          isParsingFootnote = true;
          currentFootnote = {};
          break;

        case 'REFERENCE':
          if (isParsingFootnote) {
            currentFootnote.reference = token.value;
          }
          break;

        case 'JSON_CONTENT':
          if (isParsingFootnote) {
            try {
              currentFootnote.content = FootNoteReferenceParamsSchema.parse(
                JSON.parse(token.value)
              );
              footnotes.push(currentFootnote as FootnoteDefinition);
            } catch {
              // Invalid JSON, ignore this footnote
            }
            isParsingFootnote = false;
            currentFootnote = {};
          }
          break;

        case 'NEWLINE':
          isParsingFootnote = false;
          currentFootnote = {};
          break;
      }
    }

    return footnotes;
  }

  // Process URLs in footnote content
  private processUrls(footnote: FootnoteDefinition): FootnoteDefinition {
    const content = footnote.content;
    if (content.url && !isFullyEncoded(content.url)) {
      content.url = encodeURIComponent(content.url);
    }
    if (content.favicon && !isFullyEncoded(content.favicon)) {
      content.favicon = encodeURIComponent(content.favicon);
    }
    return footnote;
  }

  // Main processing function
  public process(input: string): string {
    // 1. Tokenize the input
    const tokens = this.tokenize(input);

    // 2. Parse tokens into footnotes
    const footnotes = this.parse(tokens);

    // 3. Process URLs in footnotes
    const processedFootnotes = footnotes.map(fn => this.processUrls(fn));

    // 4. Convert back to original format
    const footnoteMap = new Map(
      processedFootnotes.map(fn => [
        fn.reference,
        formatFootnoteDefinition(fn.reference, fn.content),
      ])
    );

    // 5. Replace in original text
    return input
      .split('\n')
      .map(line => {
        const match = line.match(/^\[\^([^\]]+)\]:/);
        if (match && footnoteMap.has(match[1])) {
          return footnoteMap.get(match[1])!;
        }
        return line;
      })
      .join('\n');
  }
}

/**
 * Preprocessor for footnote url
 * We should encode url in footnote definition to avoid markdown link parsing
 *
 * Example of footnote definition:
 * [^ref]: {"type":"url","url":"https://example.com"}
 */
export function footnoteUrlPreprocessor(content: string): string {
  const parser = new FootnoteParser();
  return parser.process(content);
}

const bookmarkBlockPreprocessor: MarkdownAdapterPreprocessor = {
  name: 'bookmark-block',
  levels: ['block', 'slice', 'doc'],
  preprocess: footnoteUrlPreprocessor,
};

export const BookmarkBlockMarkdownPreprocessorExtension =
  MarkdownPreprocessorExtension(bookmarkBlockPreprocessor);
