use std::collections::HashSet;

use tiktoken_rs::{get_bpe_from_tokenizer, tokenizer::Tokenizer as TiktokenTokenizer};

#[napi]
pub struct Tokenizer {
  inner: tiktoken_rs::CoreBPE,
}

#[napi]
pub fn from_model_name(model_name: String) -> Option<Tokenizer> {
  if model_name.starts_with("gpt-5") {
    let bpe = get_bpe_from_tokenizer(TiktokenTokenizer::O200kBase).ok()?;
    return Some(Tokenizer { inner: bpe });
  }
  let bpe = tiktoken_rs::get_bpe_from_model(&model_name).ok()?;
  Some(Tokenizer { inner: bpe })
}

#[napi]
impl Tokenizer {
  #[napi]
  pub fn count(&self, content: String, allowed_special: Option<Vec<String>>) -> u32 {
    let allowed_special = if let Some(allowed_special) = &allowed_special {
      HashSet::from_iter(allowed_special.iter().map(|s| s.as_str()))
    } else {
      Default::default()
    };

    self.inner.encode(&content, &allowed_special).0.len() as u32
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_tokenizer() {
    let tokenizer = from_model_name("gpt-5".to_string()).unwrap();
    let content = "Hello, world!";
    let count = tokenizer.count(content.to_string(), None);
    assert!(count > 0);
  }
}
