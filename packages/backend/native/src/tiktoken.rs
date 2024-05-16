use std::collections::HashSet;

#[napi]
pub struct Tokenizer {
  inner: tiktoken_rs::CoreBPE,
}

#[napi]
pub fn from_model_name(model_name: String) -> Option<Tokenizer> {
  let bpe = tiktoken_rs::get_bpe_from_model(&model_name).ok()?;
  Some(Tokenizer { inner: bpe })
}

#[napi]
impl Tokenizer {
  #[napi]
  pub fn count(&self, content: String, allowed_special: Option<Vec<String>>) -> u32 {
    self
      .inner
      .encode(
        &content,
        if let Some(allowed_special) = &allowed_special {
          HashSet::from_iter(allowed_special.iter().map(|s| s.as_str()))
        } else {
          Default::default()
        },
      )
      .len() as u32
  }
}
