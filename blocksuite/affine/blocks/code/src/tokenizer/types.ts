export interface TokenizerState {
  equals(other: TokenizerState): boolean;
}

export type LineKey = {
  lineContent: string;
  lineIndex: number;
};

export type Token = {
  content: string;
  offset: number;
  color?: string;
};

export type TokenizationResult = {
  lineTokens: Token[];
  endState: TokenizerState;
};

export interface TokensProvider<State extends TokenizerState = TokenizerState> {
  initial(): State;
  tokenize(line: string, state: State): TokenizationResult;
}
