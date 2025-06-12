import type { GrammarState, HighlighterCore, ThemedToken } from 'shiki';

export type LineKey = {
  /**
   * text content of the line to be tokenized
   */
  lineContent: string;
  /**
   * first line should be 0
   */
  lineIndex: number;
};

type HighlightedLineCache = {
  content: string;

  prevLineEndState?: GrammarState;

  token: TokenizationResult;
};

export type TokenizationResult = {
  lineTokens: ThemedToken[];
  endState?: GrammarState;
};

export interface TokensProvider {
  tokenize(line: string, state?: GrammarState): TokenizationResult;
}

export class CodeTokenizer {
  private readonly _cache: Map<number, HighlightedLineCache> = new Map();

  constructor(public readonly provider: TokensProvider) {}

  clearCache(): void {
    this._cache.clear();
  }

  private _getPreviousLineCache(
    lineNumber: number
  ): HighlightedLineCache | undefined {
    return this._cache.get(lineNumber - 1);
  }

  private _tryGetCachedTokens(key: LineKey): ThemedToken[] | null {
    const curLine = this._cache.get(key.lineIndex);

    if (!curLine) {
      return null;
    }

    if (key.lineIndex === 0 && curLine.content === key.lineContent) {
      return curLine.token.lineTokens;
    }

    const prevLine = this._cache.get(key.lineIndex - 1);

    if (!prevLine || !curLine.prevLineEndState || !prevLine.token.endState) {
      return null;
    }

    const prevLineState = prevLine.token.endState.getInternalStack();
    const curLineState = curLine.prevLineEndState.getInternalStack();

    if (!prevLineState || !curLineState) {
      return null;
    }

    if (
      prevLineState.equals(curLineState) &&
      prevLine.content === key.lineContent
    ) {
      return curLine.token.lineTokens;
    }

    return null;
  }

  private _tokenizeAndCache(key: LineKey, state?: GrammarState): ThemedToken[] {
    const token = this.provider.tokenize(key.lineContent, state);

    this._cache.set(key.lineIndex, {
      content: key.lineContent,
      prevLineEndState: state,
      token,
    });

    return token.lineTokens;
  }

  private _guessStateForLine(lineIndex: number): GrammarState | undefined {
    while (lineIndex >= 0) {
      const prevLineCache = this._getPreviousLineCache(lineIndex);
      if (prevLineCache && prevLineCache.token.endState) {
        return prevLineCache.token.endState;
      }
      lineIndex--;
    }

    return undefined;
  }

  forceTokenizeLine(key: LineKey): ThemedToken[] {
    const guess = this._guessStateForLine(key.lineIndex);
    return this._tokenizeAndCache(key, guess);
  }

  getLineTokens(index: number): ThemedToken[] {
    if (index < 0) {
      throw new Error('Line number cannot be negative');
    }
    return this._cache.get(index)?.token.lineTokens ?? [];
  }

  tokenizeLine(key: LineKey): ThemedToken[] {
    if (key.lineIndex < 0) {
      throw new Error('Line number cannot be negative');
    }
    return this._tryGetCachedTokens(key) ?? this.forceTokenizeLine(key);
  }
}

export class ShikiTokenProvider implements TokensProvider {
  constructor(
    private readonly highlighter: HighlighterCore,
    public readonly lang: string,
    public readonly theme: string
  ) {}

  tokenize(line: string, grammarState?: GrammarState): TokenizationResult {
    const res = this.highlighter.codeToTokens(line, {
      lang: this.lang,
      theme: this.theme,
      grammarState,
    });

    return {
      lineTokens: res.tokens[0],
      endState: res.grammarState,
    };
  }
}

export function createCodeTokenizer(
  highlighter: HighlighterCore,
  lang: string,
  theme: string
): CodeTokenizer {
  return new CodeTokenizer(new ShikiTokenProvider(highlighter, lang, theme));
}
