use jieba_rs::Jieba;
use once_cell::sync::Lazy;
use tiniestsegmenter::tokenize as ts_tokenize;

static JIEBA: Lazy<Jieba> = Lazy::new(Jieba::new);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
  pub term: String,
  pub start: usize,
  pub end: usize,
}

pub fn tokenize(text: &str) -> Vec<Token> {
  let mut tokens = Vec::new();

  // Use jieba for Chinese/English
  // Jieba tokenize returns tokens with offsets
  let jieba_tokens = JIEBA.tokenize(text, jieba_rs::TokenizeMode::Search, false);
  for token in jieba_tokens {
    if token.word.chars().any(|c| c.is_alphanumeric()) {
      tokens.push(Token {
        term: token.word.to_lowercase(),
        start: token.start,
        end: token.end,
      });
    }
  }

  // Use TinySegmenter for Japanese
  // TinySegmenter does not provide offsets, so we have to find them manually
  // This is a simplified approach and might not be perfect for repeated terms
  let mut last_pos = 0;
  for term in ts_tokenize(text) {
    if term.chars().any(|c| c.is_alphanumeric()) {
      if let Some(pos) = text[last_pos..].find(term) {
        let start = last_pos + pos;
        let end = start + term.len();
        tokens.push(Token {
          term: term.to_lowercase(),
          start,
          end,
        });
        last_pos = end;
      }
    }
  }

  // Manually handle Korean bigrams and unigrams
  let chars: Vec<char> = text.chars().collect();
  let mut byte_offset = 0;
  for (i, &c) in chars.iter().enumerate() {
    let char_len = c.len_utf8();
    if is_hangul(c) {
      tokens.push(Token {
        term: c.to_string().to_lowercase(),
        start: byte_offset,
        end: byte_offset + char_len,
      });
      if i + 1 < chars.len() {
        let next = chars[i + 1];
        if is_hangul(next) {
          let next_len = next.len_utf8();
          tokens.push(Token {
            term: format!("{}{}", c, next).to_lowercase(),
            start: byte_offset,
            end: byte_offset + char_len + next_len,
          });
        }
      }
    }
    byte_offset += char_len;
  }

  tokens
}

fn is_hangul(c: char) -> bool {
  // Hangul Syllables
  ('\u{AC00}'..='\u{D7AF}').contains(&c)
    // Hangul Jamo
    || ('\u{1100}'..='\u{11FF}').contains(&c)
    // Hangul Compatibility Jamo
    || ('\u{3130}'..='\u{318F}').contains(&c)
}
