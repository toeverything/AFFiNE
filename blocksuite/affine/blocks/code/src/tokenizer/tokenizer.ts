import type {
  LineKey,
  Token,
  TokenizationResult,
  TokenizerState,
  TokensProvider,
} from './types';

type HighlightedLine<State extends TokenizerState> = {
  content: string;
  //  == previous line's end state
  startState?: State;

  token: TokenizationResult;
};

export class CodeTokenizer<State extends TokenizerState = TokenizerState> {
  private readonly _tokenizedLines: Map<number, HighlightedLine<State>> =
    new Map();

  constructor(public readonly provider: TokensProvider<State>) {}

  clearCache(): void {
    this._tokenizedLines.clear();
  }

  private _tryGetCachedTokens(key: LineKey): Token[] | null {
    const curLine = this._tokenizedLines.get(key.lineIndex);

    if (!curLine) {
      return null;
    }

    if (key.lineIndex === 0 && curLine.content === key.lineContent) {
      return curLine.token.lineTokens;
    }

    if (curLine.content !== key.lineContent) {
      return null;
    }

    const prevLine = this._tokenizedLines.get(key.lineIndex - 1);

    if (!prevLine || !curLine.startState || !prevLine.token.endState) {
      return null;
    }

    const prevLineEndState = prevLine.token.endState;
    const curLineStartState = curLine.startState;

    if (prevLineEndState.equals(curLineStartState)) {
      return curLine.token.lineTokens;
    }

    return null;
  }

  private _tokenizeAndCache(key: LineKey, state?: State): Token[] {
    const token = this.provider.tokenize(
      key.lineContent,
      state ?? this.provider.initial()
    );

    this._tokenizedLines.set(key.lineIndex, {
      content: key.lineContent,
      startState: state,
      token,
    });

    return token.lineTokens;
  }

  private _guessStateForLine(lineIndex: number): State | undefined {
    while (lineIndex > 0) {
      const prevLineCache = this._tokenizedLines.get(lineIndex - 1);
      if (prevLineCache && prevLineCache.token.endState) {
        return prevLineCache.token.endState as State;
      }
      lineIndex--;
    }

    return undefined;
  }

  forceTokenizeLine(key: LineKey): Token[] {
    const guess = this._guessStateForLine(key.lineIndex);
    return this._tokenizeAndCache(key, guess);
  }

  getLineTokens(index: number): Token[] {
    if (index < 0) {
      throw new Error('Line number cannot be negative');
    }
    return this._tokenizedLines.get(index)?.token.lineTokens ?? [];
  }

  tokenizeLine(key: LineKey): Token[] {
    if (key.lineIndex < 0) {
      throw new Error('Line number cannot be negative');
    }
    return this._tryGetCachedTokens(key) ?? this.forceTokenizeLine(key);
  }
}
