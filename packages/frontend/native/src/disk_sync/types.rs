#[derive(Clone, Debug, Default)]
pub(crate) struct FrontmatterMeta {
  pub(crate) id: Option<String>,
  pub(crate) title: Option<String>,
  pub(crate) tags: Option<Vec<String>>,
  pub(crate) favorite: Option<bool>,
  pub(crate) trash: Option<bool>,
}

impl FrontmatterMeta {
  pub(crate) fn with_id(mut self, id: String) -> Self {
    self.id = Some(id);
    self
  }
}

#[derive(Clone)]
pub(crate) struct SourceCheckpoint {
  pub(crate) snapshot: Vec<u8>,
  pub(crate) markdown: String,
  pub(crate) scope: String,
  pub(crate) profile: u32,
  pub(crate) meta_hash: String,
}
