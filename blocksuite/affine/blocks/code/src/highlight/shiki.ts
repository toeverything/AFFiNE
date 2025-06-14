import type { GrammarState, HighlighterCore } from 'shiki';

import type {
  TokenizationResult,
  TokenizerState,
  TokensProvider,
} from '../tokenizer';

class ShikiTokenizerState implements TokenizerState {
  constructor(public readonly grammarState?: GrammarState) {}

  equals(other: TokenizerState): boolean {
    if (!(other instanceof ShikiTokenizerState)) {
      return false;
    }

    const a = this.grammarState?.getInternalStack();
    const b = other.grammarState?.getInternalStack();

    return a !== undefined && b !== undefined && a.equals(b);
  }
}

export class ShikiTokenProvider implements TokensProvider<ShikiTokenizerState> {
  constructor(
    private readonly highlighter: HighlighterCore,
    public readonly lang: string,
    public readonly theme: string
  ) {}

  tokenize(line: string, state?: ShikiTokenizerState): TokenizationResult {
    const res = this.highlighter.codeToTokens(line, {
      lang: this.lang,
      theme: this.theme,
      grammarState: state?.grammarState,
    });

    return {
      lineTokens: res.tokens[0],
      endState: new ShikiTokenizerState(res.grammarState),
    };
  }
}
