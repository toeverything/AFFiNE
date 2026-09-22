use chrono::NaiveDateTime;

#[derive(Clone)]
pub(crate) struct Baseline {
  pub(crate) base_clock: String,
  pub(crate) base_vector: String,
  pub(crate) md_hash: String,
  pub(crate) meta_hash: String,
  pub(crate) synced_at: NaiveDateTime,
}

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
