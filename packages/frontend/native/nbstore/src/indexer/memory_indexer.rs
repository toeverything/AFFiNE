use std::collections::{HashMap, HashSet};

use super::{
  tokenizer::tokenize,
  types::{DocData, SnapshotData},
};

type DirtyDoc = (String, String, String, i64);
type DeletedDoc = HashMap<String, HashSet<String>>;

#[derive(Default, Debug)]
pub struct InMemoryIndex {
  pub docs: HashMap<String, HashMap<String, DocData>>,
  pub inverted: HashMap<String, HashMap<String, HashMap<String, i64>>>,
  pub total_lens: HashMap<String, i64>,
  pub dirty: HashMap<String, HashSet<String>>,
  pub deleted: HashMap<String, HashSet<String>>,
}

impl InMemoryIndex {
  pub fn add_doc(&mut self, index_name: &str, doc_id: &str, text: &str, index: bool) {
    let tokens = if index { tokenize(text) } else { vec![] };
    // doc_len should be the number of tokens (including duplicates)
    let doc_len = tokens.len() as i64;

    let mut pos_map: HashMap<String, Vec<(u32, u32)>> = HashMap::new();
    for token in tokens {
      pos_map
        .entry(token.term)
        .or_default()
        .push((token.start as u32, token.end as u32));
    }

    if let Some(docs) = self.docs.get_mut(index_name) {
      if let Some(old_data) = docs.remove(doc_id) {
        *self.total_lens.entry(index_name.to_string()).or_default() -= old_data.doc_len;

        if let Some(inverted) = self.inverted.get_mut(index_name) {
          for (term, _) in old_data.term_pos {
            if let Some(doc_map) = inverted.get_mut(&term) {
              doc_map.remove(doc_id);
              if doc_map.is_empty() {
                inverted.remove(&term);
              }
            }
          }
        }
      }
    }

    let doc_data = DocData {
      content: text.to_string(),
      doc_len,
      term_pos: pos_map.clone(),
    };

    self
      .docs
      .entry(index_name.to_string())
      .or_default()
      .insert(doc_id.to_string(), doc_data);
    *self.total_lens.entry(index_name.to_string()).or_default() += doc_len;

    let inverted = self.inverted.entry(index_name.to_string()).or_default();
    for (term, positions) in pos_map {
      inverted
        .entry(term)
        .or_default()
        .insert(doc_id.to_string(), positions.len() as i64);
    }

    self
      .dirty
      .entry(index_name.to_string())
      .or_default()
      .insert(doc_id.to_string());
    if let Some(deleted) = self.deleted.get_mut(index_name) {
      deleted.remove(doc_id);
    }
  }

  pub fn remove_doc(&mut self, index_name: &str, doc_id: &str) {
    if let Some(docs) = self.docs.get_mut(index_name) {
      if let Some(old_data) = docs.remove(doc_id) {
        *self.total_lens.entry(index_name.to_string()).or_default() -= old_data.doc_len;

        if let Some(inverted) = self.inverted.get_mut(index_name) {
          for (term, _) in old_data.term_pos {
            if let Some(doc_map) = inverted.get_mut(&term) {
              doc_map.remove(doc_id);
              if doc_map.is_empty() {
                inverted.remove(&term);
              }
            }
          }
        }

        self
          .deleted
          .entry(index_name.to_string())
          .or_default()
          .insert(doc_id.to_string());
        if let Some(dirty) = self.dirty.get_mut(index_name) {
          dirty.remove(doc_id);
        }
      }
    }
  }

  pub fn get_doc(&self, index_name: &str, doc_id: &str) -> Option<String> {
    self
      .docs
      .get(index_name)
      .and_then(|docs| docs.get(doc_id))
      .map(|d| d.content.clone())
  }

  pub fn search(&self, index_name: &str, query: &str) -> Vec<(String, f64)> {
    if query == "*" || query.is_empty() {
      if let Some(docs) = self.docs.get(index_name) {
        return docs.keys().map(|k| (k.clone(), 1.0)).collect();
      }
      return vec![];
    }

    let query_terms = tokenize(query);
    if query_terms.is_empty() {
      return vec![];
    }

    let inverted = match self.inverted.get(index_name) {
      Some(i) => i,
      None => return vec![],
    };

    let mut candidates: Option<HashSet<String>> = None;

    for token in &query_terms {
      if let Some(doc_map) = inverted.get(&token.term) {
        let docs: HashSet<String> = doc_map.keys().cloned().collect();
        match candidates {
          None => candidates = Some(docs),
          Some(ref mut c) => {
            c.retain(|id| docs.contains(id));
          }
        }
        if candidates.as_ref().unwrap().is_empty() {
          return vec![];
        }
      } else {
        return vec![];
      }
    }

    let candidates = candidates.unwrap_or_default();
    if candidates.is_empty() {
      return vec![];
    }

    let docs = self.docs.get(index_name).unwrap();
    let total_len = *self.total_lens.get(index_name).unwrap_or(&0);
    let n = docs.len() as f64;
    let avgdl = if n > 0.0 { total_len as f64 / n } else { 0.0 };

    let k1 = 1.2;
    let b = 0.75;

    let mut scores: Vec<(String, f64)> = Vec::with_capacity(candidates.len());

    let mut idfs = HashMap::new();
    for token in &query_terms {
      let n_q = inverted.get(&token.term).map(|m| m.len()).unwrap_or(0) as f64;
      let idf = ((n - n_q + 0.5) / (n_q + 0.5) + 1.0).ln();
      idfs.insert(&token.term, idf);
    }

    for doc_id in candidates {
      let doc_data = docs.get(&doc_id).unwrap();
      let mut score = 0.0;

      for token in &query_terms {
        if let Some(positions) = doc_data.term_pos.get(&token.term) {
          let freq = positions.len() as f64;
          let idf = idfs.get(&token.term).unwrap();
          let numerator = freq * (k1 + 1.0);
          let denominator = freq + k1 * (1.0 - b + b * (doc_data.doc_len as f64 / avgdl));
          score += idf * (numerator / denominator);
        }
      }
      scores.push((doc_id, score));
    }

    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    scores
  }

  pub fn take_dirty_and_deleted(&mut self) -> (Vec<DirtyDoc>, DeletedDoc) {
    let dirty = std::mem::take(&mut self.dirty);
    let deleted = std::mem::take(&mut self.deleted);

    let mut dirty_data = Vec::new();
    for (index_name, doc_ids) in &dirty {
      if let Some(docs) = self.docs.get(index_name) {
        for doc_id in doc_ids {
          if let Some(data) = docs.get(doc_id) {
            dirty_data.push((
              index_name.clone(),
              doc_id.clone(),
              data.content.clone(),
              data.doc_len,
            ));
          }
        }
      }
    }
    (dirty_data, deleted)
  }

  pub fn get_matches(&self, index_name: &str, doc_id: &str, query: &str) -> Vec<(u32, u32)> {
    let mut matches = Vec::new();
    if let Some(docs) = self.docs.get(index_name) {
      if let Some(doc_data) = docs.get(doc_id) {
        let query_tokens = tokenize(query);
        for token in query_tokens {
          if let Some(positions) = doc_data.term_pos.get(&token.term) {
            matches.extend(positions.iter().cloned());
          }
        }
      }
    }
    matches.sort_by(|a, b| a.0.cmp(&b.0));
    matches
  }

  pub fn load_snapshot(&mut self, index_name: &str, snapshot: SnapshotData) {
    let docs = self.docs.entry(index_name.to_string()).or_default();
    let inverted = self.inverted.entry(index_name.to_string()).or_default();
    let total_len = self.total_lens.entry(index_name.to_string()).or_default();

    for (doc_id, doc_data) in snapshot.docs {
      *total_len += doc_data.doc_len;

      for (term, positions) in &doc_data.term_pos {
        inverted
          .entry(term.clone())
          .or_default()
          .insert(doc_id.clone(), positions.len() as i64);
      }

      docs.insert(doc_id, doc_data);
    }
  }

  pub fn get_snapshot_data(&self, index_name: &str) -> Option<SnapshotData> {
    self
      .docs
      .get(index_name)
      .map(|docs| SnapshotData { docs: docs.clone() })
  }
}
