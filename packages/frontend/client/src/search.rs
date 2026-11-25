//! `threshold: 0` exact substring weighted search engine with UTF-16 highlight spans.

use blocksuite_editor::{Utf16HighlightSpan, match_exact_substring_utf16};
use serde::{Deserialize, Serialize};

/// Field weights applied when combining exact substring match scores.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct SearchWeights {
    pub title: f64,
    pub tags: f64,
    pub body: f64,
}

impl Default for SearchWeights {
    fn default() -> Self {
        Self {
            title: 3.0,
            tags: 2.0,
            body: 1.0,
        }
    }
}

/// Indexable document input for [`WeightedSearchEngine`].
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct SearchDocument {
    pub id: String,
    pub title: String,
    pub tags: Vec<String>,
    pub body_preview: String,
    pub updated_at_ms: i64,
}

/// Ranked search result from [`WeightedSearchEngine::search`].
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SearchHit {
    pub doc_id: String,
    pub title: String,
    /// Higher score ranks first (`title` > `tags` > `body` exact substring matches).
    pub score: f64,
    pub title_highlights: Vec<Utf16HighlightSpan>,
    pub matched_tags: Vec<String>,
    pub body_highlights: Vec<Utf16HighlightSpan>,
    pub updated_at_ms: i64,
}

/// Exact substring (`threshold: 0`, zero fuzzy typos) weighted document search engine.
#[derive(Clone, Debug)]
pub struct WeightedSearchEngine {
    weights: SearchWeights,
}

impl Default for WeightedSearchEngine {
    fn default() -> Self {
        Self::new(SearchWeights::default())
    }
}

impl WeightedSearchEngine {
    pub fn new(weights: SearchWeights) -> Self {
        Self { weights }
    }

    pub fn search(&self, docs: &[SearchDocument], query: &str, limit: usize) -> Vec<SearchHit> {
        let mut hits = Vec::new();

        for doc in docs {
            if query.is_empty() {
                hits.push(SearchHit {
                    doc_id: doc.id.clone(),
                    title: doc.title.clone(),
                    score: 0.0,
                    title_highlights: Vec::new(),
                    matched_tags: Vec::new(),
                    body_highlights: Vec::new(),
                    updated_at_ms: doc.updated_at_ms,
                });
                continue;
            }

            let mut total_score = 0.0;
            let mut matched = false;

            let title_highlights =
                if let Some((dist, spans)) = match_exact_substring_utf16(&doc.title, query) {
                    matched = true;
                    total_score += self.weights.title * (1.0 - dist);
                    spans
                } else {
                    Vec::new()
                };

            let mut matched_tags = Vec::new();
            for tag in &doc.tags {
                if let Some((dist, _)) = match_exact_substring_utf16(tag, query) {
                    matched = true;
                    total_score += self.weights.tags * (1.0 - dist);
                    matched_tags.push(tag.clone());
                }
            }

            let body_highlights = if let Some((dist, spans)) =
                match_exact_substring_utf16(&doc.body_preview, query)
            {
                matched = true;
                total_score += self.weights.body * (1.0 - dist);
                spans
            } else {
                Vec::new()
            };

            if matched {
                hits.push(SearchHit {
                    doc_id: doc.id.clone(),
                    title: doc.title.clone(),
                    score: total_score,
                    title_highlights,
                    matched_tags,
                    body_highlights,
                    updated_at_ms: doc.updated_at_ms,
                });
            }
        }

        hits.sort_by(|a, b| {
            b.score
                .total_cmp(&a.score)
                .then_with(|| b.updated_at_ms.cmp(&a.updated_at_ms))
                .then_with(|| a.doc_id.cmp(&b.doc_id))
        });

        if limit > 0 && hits.len() > limit {
            hits.truncate(limit);
        }
        hits
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_substring_weighted_search_rejects_typos_and_ranks_title_above_body() {
        let engine = WeightedSearchEngine::default();
        let docs = vec![
            SearchDocument {
                id: "d-body".into(),
                title: "Notes".into(),
                tags: vec![],
                body_preview: "Contains sync protocol spec".into(),
                updated_at_ms: 200,
            },
            SearchDocument {
                id: "d-tag".into(),
                title: "Misc".into(),
                tags: vec!["sync".into()],
                body_preview: "Unrelated".into(),
                updated_at_ms: 150,
            },
            SearchDocument {
                id: "d-title".into(),
                title: "Sync".into(),
                tags: vec![],
                body_preview: "".into(),
                updated_at_ms: 100,
            },
        ];

        // threshold: 0 -> fuzzy typo "snyc" matches zero documents.
        assert!(engine.search(&docs, "snyc", 10).is_empty());

        let hits = engine.search(&docs, "sync", 10);
        let ids: Vec<&str> = hits.iter().map(|h| h.doc_id.as_str()).collect();
        assert_eq!(ids, vec!["d-title", "d-tag", "d-body"]);
        assert_eq!(hits[0].title_highlights.len(), 1);
    }
}
