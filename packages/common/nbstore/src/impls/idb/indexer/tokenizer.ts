import Graphemer from 'graphemer';

export interface Tokenizer {
  tokenize(text: string): Token[];
}

export interface Token {
  term: string;
  start: number;
  end: number;
}

export class SimpleTokenizer implements Tokenizer {
  tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    let start = 0;
    let end = 0;
    let inWord = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c.match(/[\n\r\p{Z}\p{P}]/u)) {
        if (inWord) {
          end = i;
          tokens.push({
            term: text.substring(start, end).toLowerCase(),
            start,
            end,
          });
          inWord = false;
        }
      } else {
        if (!inWord) {
          start = i;
          end = i;
          inWord = true;
        }
      }
    }
    if (inWord) {
      tokens.push({
        term: text.substring(start).toLowerCase(),
        start,
        end: text.length,
      });
    }
    return tokens;
  }
}

export class NGramTokenizer implements Tokenizer {
  constructor(private readonly n: number) {}

  tokenize(text: string): Token[] {
    const splitted: Token[] = [];
    for (let i = 0; i < text.length; ) {
      const nextBreak = Graphemer.nextBreak(text, i);
      const c = text.substring(i, nextBreak);

      splitted.push({
        term: c,
        start: i,
        end: nextBreak,
      });

      i = nextBreak;
    }
    const tokens: Token[] = [];
    for (let i = 0; i < splitted.length - this.n + 1; i++) {
      tokens.push(
        splitted.slice(i, i + this.n).reduce(
          (acc, t) => ({
            term: acc.term + t.term,
            start: Math.min(acc.start, t.start),
            end: Math.max(acc.end, t.end),
          }),
          { term: '', start: Infinity, end: -Infinity }
        )
      );
    }
    return tokens;
  }
}

export class GeneralTokenizer implements Tokenizer {
  constructor() {}

  tokenizeWord(word: string, lang: string): Token[] {
    if (lang === 'en') {
      return [{ term: word.toLowerCase(), start: 0, end: word.length }];
    } else if (lang === 'cjk') {
      if (word.length < 3) {
        return [{ term: word, start: 0, end: word.length }];
      }
      return new NGramTokenizer(2).tokenize(word);
    } else if (lang === 'emoji') {
      return new NGramTokenizer(1).tokenize(word);
    } else if (lang === '-') {
      return [];
    }

    throw new Error('Not implemented');
  }

  testLang(c: string): string {
    if (c.match(/[\p{Emoji}]/u)) {
      return 'emoji';
    } else if (c.match(/[\p{sc=Han}\p{scx=Hira}\p{scx=Kana}\p{sc=Hang}]/u)) {
      return 'cjk';
    } else if (c.match(/[\n\r\p{Z}\p{P}]/u)) {
      return '-';
    } else {
      return 'en';
    }
  }

  tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    let start = 0;
    let end = 0;
    let lang: string | null = null;

    for (let i = 0; i < text.length; ) {
      const nextBreak = Graphemer.nextBreak(text, i);
      const c = text.substring(i, nextBreak);

      const l = this.testLang(c);
      if (lang !== l) {
        if (lang !== null) {
          end = i;
          tokens.push(
            ...this.tokenizeWord(text.substring(start, end), lang).map(
              token => ({
                ...token,
                start: token.start + start,
                end: token.end + start,
              })
            )
          );
        }

        start = i;
        end = i;
        lang = l;
      }

      i = nextBreak;
    }
    if (lang !== null) {
      tokens.push(
        ...this.tokenizeWord(text.substring(start, text.length), lang).map(
          token => ({
            ...token,
            start: token.start + start,
            end: token.end + start,
          })
        )
      );
    }

    return tokens;
  }
}
