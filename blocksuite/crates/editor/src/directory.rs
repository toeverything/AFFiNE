//! Narrow host port for linked-document discovery, renaming, and creation.
//!
//! Keeps `blocksuite-editor` independent of workspace storage implementations and
//! transport protocols. Production hosts back [`WorkspaceDocDirectory`] with the
//! `affine-store` indexer, while [`InMemoryDocDirectory`] provides deterministic
//! in-memory contiguous substring matching and UTF-16 highlight spans.

use std::{
    collections::BTreeMap,
    fmt,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use serde::{Deserialize, Serialize};

/// Canonical document identifier owned by the editor domain.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct EditorDocId(pub String);

impl EditorDocId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for EditorDocId {
    fn from(value: &str) -> Self {
        Self(value.to_string())
    }
}

impl From<String> for EditorDocId {
    fn from(value: String) -> Self {
        Self(value)
    }
}

impl fmt::Display for EditorDocId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// Primary view mode of a linked document.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EditorDocMode {
    #[default]
    Page,
    Edgeless,
}

/// Lightweight document metadata displayed in linked-doc pickers and reference chips.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct EditorDocSummary {
    pub id: EditorDocId,
    pub title: String,
    pub mode: EditorDocMode,
    pub updated_at_ms: i64,
}

/// Cooperative cancellation token for paginated linked-document queries.
#[derive(Clone, Debug, Default)]
pub struct DocQueryCancelToken {
    cancelled: Arc<AtomicBool>,
}

impl DocQueryCancelToken {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }
}

/// Paginated linked-document query request.
#[derive(Clone, Debug)]
pub struct DocQueryRequest {
    pub query: String,
    pub cursor: Option<String>,
    pub limit: usize,
    pub cancel: DocQueryCancelToken,
}

impl DocQueryRequest {
    pub fn new(query: impl Into<String>, limit: usize) -> Self {
        Self {
            query: query.into(),
            cursor: None,
            limit,
            cancel: DocQueryCancelToken::new(),
        }
    }

    pub fn with_cursor(mut self, cursor: Option<String>) -> Self {
        self.cursor = cursor;
        self
    }

    pub fn with_cancel(mut self, cancel: DocQueryCancelToken) -> Self {
        self.cancel = cancel;
        self
    }
}

/// Half-open UTF-16 code-unit highlight span `[start, end)` within a document title.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Utf16HighlightSpan {
    pub start: usize,
    pub end: usize,
}

/// Ranked query match with its score and UTF-16 highlight intervals.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MatchedDocSummary {
    pub doc: EditorDocSummary,
    /// Lower is better (`0.0` = exact match, `(0.0, 1.0)` = partial substring match).
    pub score: f64,
    pub title_highlights: Vec<Utf16HighlightSpan>,
}

/// One page of linked-document query results.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct DocQueryPage {
    pub items: Vec<MatchedDocSummary>,
    pub next_cursor: Option<String>,
    pub cancelled: bool,
}

/// Error returned by [`WorkspaceDocDirectory`] operations.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DirectoryError {
    NotFound(EditorDocId),
    Cancelled,
    InvalidCursor(String),
    Other(String),
}

impl fmt::Display for DirectoryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound(id) => write!(f, "document not found: {id}"),
            Self::Cancelled => f.write_str("document query cancelled"),
            Self::InvalidCursor(cursor) => write!(f, "invalid query cursor: {cursor}"),
            Self::Other(msg) => f.write_str(msg),
        }
    }
}

impl std::error::Error for DirectoryError {}

/// Narrow host port decoupling `blocksuite-editor` from workspace storage backends.
///
/// Production hosts implement this port on top of `affine-store`'s document indexer;
/// [`InMemoryDocDirectory`] provides a deterministic in-memory adapter for tests and
/// standalone demos.
pub trait WorkspaceDocDirectory {
    /// Queries linked documents matching `req.query` using the host's document search backend.
    fn query_linked_docs(&self, req: &DocQueryRequest) -> Result<DocQueryPage, DirectoryError>;

    /// Renames a document title in the host directory.
    fn rename_doc_title(
        &mut self,
        id: &EditorDocId,
        title: &str,
    ) -> Result<EditorDocSummary, DirectoryError>;

    /// Creates a new linked document with `title` and `mode`.
    ///
    /// When `intent_id` is `Some`, retrying with the same `intent_id` is idempotent and returns
    /// the previously created document summary if it still exists.
    fn create_linked_doc(
        &mut self,
        title: &str,
        mode: EditorDocMode,
        intent_id: Option<&str>,
    ) -> Result<EditorDocSummary, DirectoryError>;

    /// Returns `true` if `intent_id` is already registered in the directory (linked or pending).
    fn has_create_intent(&self, intent_id: &str) -> bool;

    /// Returns `true` once the caller has durably inserted the source reference chip for `intent_id`.
    ///
    /// Once marked linked, the intent stays linked permanently so replaying the same create intent
    /// after a user manually undoes the reference chip does not insert a duplicate chip.
    fn is_create_intent_linked(&self, intent_id: &str) -> bool;

    /// Marks `intent_id`'s source reference chip as inserted so subsequent replays do not duplicate it.
    fn mark_create_intent_linked(&mut self, intent_id: &str);

    /// Marks `id` as durably registered in the workspace root page list so that a subsequent
    /// directory refresh where `id` is absent treats `id` as deleted rather than still-pending.
    fn mark_doc_root_registered(&mut self, id: &EditorDocId);
}

/// Pure-Rust contiguous substring matcher returning `(score, utf16_highlights)`.
///
/// Uses full-string `str::to_lowercase()` (context-aware Unicode `Final_Sigma` folding) and
/// maps each folded character back to its original UTF-16 code-unit range. Enforces scalar
/// boundaries on multi-char lowercase expansions (such as `'İ' -> 'i' + '\u{307}'`) so a
/// query cannot match half of a single source scalar.
pub fn match_exact_substring_utf16(
    title: &str,
    query: &str,
) -> Option<(f64, Vec<Utf16HighlightSpan>)> {
    if query.is_empty() {
        return Some((0.0, Vec::new()));
    }

    // Full-string `str::to_lowercase()` applies Unicode SpecialCasing context rules
    // (including Greek `Final_Sigma`: `"ΟΣ" -> "ος"` vs `"ΟΣΑ" -> "οσα"`). Every scalar
    // produces the same number of chars as `ch.to_lowercase().count()` (`'Σ'` always
    // maps to 1 char, either `'σ'` or `'ς'`), letting us track exact UTF-16 ranges.
    let lower_title = title.to_lowercase();
    let mut lower_iter = lower_title.chars();
    let mut hay_chars: Vec<char> = Vec::with_capacity(lower_title.len());
    let mut hay_utf16_ranges: Vec<(usize, usize)> = Vec::with_capacity(lower_title.len());
    let mut utf16_cursor = 0usize;
    for ch in title.chars() {
        let ch_utf16_len = ch.len_utf16();
        let start_u16 = utf16_cursor;
        let end_u16 = utf16_cursor + ch_utf16_len;
        let folded_count = ch.to_lowercase().count();
        for _ in 0..folded_count {
            if let Some(lower) = lower_iter.next() {
                hay_chars.push(lower);
                hay_utf16_ranges.push((start_u16, end_u16));
            }
        }
        utf16_cursor = end_u16;
    }

    let needle_chars: Vec<char> = query.to_lowercase().chars().collect();
    let n = needle_chars.len();
    let h = hay_chars.len();
    if n == 0 {
        return Some((0.0, Vec::new()));
    }
    if n > h {
        return None;
    }

    let mut spans = Vec::new();
    let mut i = 0usize;
    while i + n <= h {
        let at_start_boundary = i == 0 || hay_utf16_ranges[i - 1] != hay_utf16_ranges[i];
        let at_end_boundary = i + n == h || hay_utf16_ranges[i + n - 1] != hay_utf16_ranges[i + n];
        if at_start_boundary && at_end_boundary && hay_chars[i..i + n] == needle_chars[..] {
            let start = hay_utf16_ranges[i].0;
            let end = hay_utf16_ranges[i + n - 1].1;
            if let Some(last) = spans.last_mut() {
                let last: &mut Utf16HighlightSpan = last;
                if start <= last.end {
                    last.end = last.end.max(end);
                } else {
                    spans.push(Utf16HighlightSpan { start, end });
                }
            } else {
                spans.push(Utf16HighlightSpan { start, end });
            }
            i += n;
        } else {
            i += 1;
        }
    }

    if spans.is_empty() {
        return None;
    }

    // Exact full-title match has score 0.0; partial contiguous substring matches rank
    // monotonically by coverage ratio (position-independent).
    let score = if n == h {
        0.0
    } else {
        let ratio = (n as f64) / (h as f64);
        ((1.0 - ratio) * 0.5).clamp(1e-6, 0.5)
    };
    Some((score, spans))
}

#[derive(Clone, Debug)]
struct IntentRecord {
    doc_id: EditorDocId,
    root_registered: bool,
    deleted_from_root: bool,
    source_linked: bool,
}

/// In-memory [`WorkspaceDocDirectory`] adapter for `playground` and deterministic unit tests.
#[derive(Clone, Debug)]
pub struct InMemoryDocDirectory {
    docs: BTreeMap<EditorDocId, EditorDocSummary>,
    intents: BTreeMap<String, IntentRecord>,
    pending_root_docs: std::collections::BTreeSet<EditorDocId>,
    id_prefix: String,
    next_id: u64,
    clock_ms: i64,
}

impl Default for InMemoryDocDirectory {
    fn default() -> Self {
        Self {
            docs: BTreeMap::new(),
            intents: BTreeMap::new(),
            pending_root_docs: std::collections::BTreeSet::new(),
            id_prefix: "doc:linked".to_string(),
            next_id: 0,
            clock_ms: 0,
        }
    }
}

impl InMemoryDocDirectory {
    pub fn new() -> Self {
        Self::default()
    }

    /// Creates an in-memory directory whose newly generated document IDs use `prefix`
    /// (`"{prefix}-{n}"`), avoiding cross-replica ID collisions before sync.
    pub fn with_namespace(prefix: impl Into<String>) -> Self {
        Self {
            id_prefix: prefix.into(),
            ..Self::default()
        }
    }

    pub fn with_docs(docs: impl IntoIterator<Item = EditorDocSummary>) -> Self {
        let mut dir = Self::new();
        for doc in docs {
            dir.upsert(doc);
        }
        dir
    }

    pub fn upsert(&mut self, doc: EditorDocSummary) {
        self.clock_ms = self.clock_ms.max(doc.updated_at_ms);
        self.docs.insert(doc.id.clone(), doc);
    }

    /// Synchronizes the directory's documents with `docs` while preserving `next_id`,
    /// existing `intents` entries whose target documents remain present, and existing
    /// `mode` / non-zero `updated_at_ms` metadata.
    pub fn retain_and_upsert_docs(&mut self, docs: impl IntoIterator<Item = EditorDocSummary>) {
        let mut incoming = BTreeMap::new();
        for mut doc in docs {
            if let Some(existing) = self.docs.get(&doc.id) {
                doc.mode = existing.mode;
                if existing.title == doc.title {
                    doc.updated_at_ms = existing.updated_at_ms;
                } else {
                    self.clock_ms = self.clock_ms.max(existing.updated_at_ms) + 1;
                    doc.updated_at_ms = self.clock_ms;
                }
            } else {
                self.clock_ms = self.clock_ms.max(doc.updated_at_ms);
            }
            incoming.insert(doc.id.clone(), doc);
        }
        for doc_id in incoming.keys() {
            self.pending_root_docs.remove(doc_id);
        }
        for rec in self.intents.values_mut() {
            if incoming.contains_key(&rec.doc_id) {
                rec.root_registered = true;
                rec.deleted_from_root = false;
            } else if rec.root_registered {
                rec.deleted_from_root = true;
            }
        }
        for id in &self.pending_root_docs {
            if !incoming.contains_key(id)
                && let Some(pending_doc) = self.docs.get(id)
            {
                incoming.insert(id.clone(), pending_doc.clone());
            }
        }
        self.docs = incoming;
    }

    pub fn get(&self, id: &EditorDocId) -> Option<&EditorDocSummary> {
        self.docs.get(id)
    }

    pub fn len(&self) -> usize {
        self.docs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.docs.is_empty()
    }
}

impl WorkspaceDocDirectory for InMemoryDocDirectory {
    fn query_linked_docs(&self, req: &DocQueryRequest) -> Result<DocQueryPage, DirectoryError> {
        if req.cancel.is_cancelled() {
            return Ok(DocQueryPage {
                items: Vec::new(),
                next_cursor: None,
                cancelled: true,
            });
        }

        let offset: usize = match &req.cursor {
            None => 0,
            Some(raw) => raw
                .parse::<usize>()
                .map_err(|_| DirectoryError::InvalidCursor(raw.clone()))?,
        };

        let mut matches = Vec::new();
        for doc in self.docs.values() {
            if req.cancel.is_cancelled() {
                return Ok(DocQueryPage {
                    items: Vec::new(),
                    next_cursor: None,
                    cancelled: true,
                });
            }
            if let Some((score, title_highlights)) =
                match_exact_substring_utf16(&doc.title, &req.query)
            {
                matches.push(MatchedDocSummary {
                    doc: doc.clone(),
                    score,
                    title_highlights,
                });
            }
        }

        matches.sort_by(|a, b| {
            a.score
                .total_cmp(&b.score)
                .then_with(|| b.doc.updated_at_ms.cmp(&a.doc.updated_at_ms))
                .then_with(|| a.doc.id.cmp(&b.doc.id))
        });

        let limit = req.limit.max(1);
        let start = offset.min(matches.len());
        let end = (start + limit).min(matches.len());
        let next_cursor = (end < matches.len()).then(|| end.to_string());

        Ok(DocQueryPage {
            items: matches[start..end].to_vec(),
            next_cursor,
            cancelled: false,
        })
    }

    fn rename_doc_title(
        &mut self,
        id: &EditorDocId,
        title: &str,
    ) -> Result<EditorDocSummary, DirectoryError> {
        let Some(doc) = self.docs.get_mut(id) else {
            return Err(DirectoryError::NotFound(id.clone()));
        };
        self.clock_ms += 1;
        doc.title = title.to_string();
        doc.updated_at_ms = self.clock_ms;
        Ok(doc.clone())
    }

    fn create_linked_doc(
        &mut self,
        title: &str,
        mode: EditorDocMode,
        intent_id: Option<&str>,
    ) -> Result<EditorDocSummary, DirectoryError> {
        if let Some(intent) = intent_id
            && let Some(rec) = self.intents.get(intent)
        {
            if rec.deleted_from_root {
                return Err(DirectoryError::NotFound(rec.doc_id.clone()));
            }
            if let Some(existing) = self.docs.get(&rec.doc_id) {
                return Ok(existing.clone());
            }
            self.clock_ms += 1;
            let summary = EditorDocSummary {
                id: rec.doc_id.clone(),
                title: title.to_string(),
                mode,
                updated_at_ms: self.clock_ms,
            };
            self.docs.insert(rec.doc_id.clone(), summary.clone());
            self.pending_root_docs.insert(rec.doc_id.clone());
            return Ok(summary);
        }

        let id = loop {
            self.next_id += 1;
            let candidate = EditorDocId::new(format!("{}-{}", self.id_prefix, self.next_id));
            if !self.docs.contains_key(&candidate)
                && !self.intents.values().any(|r| r.doc_id == candidate)
            {
                break candidate;
            }
        };
        self.clock_ms += 1;
        let summary = EditorDocSummary {
            id: id.clone(),
            title: title.to_string(),
            mode,
            updated_at_ms: self.clock_ms,
        };
        self.docs.insert(id.clone(), summary.clone());
        self.pending_root_docs.insert(id.clone());
        if let Some(intent) = intent_id {
            self.intents.insert(
                intent.to_string(),
                IntentRecord {
                    doc_id: id,
                    root_registered: false,
                    deleted_from_root: false,
                    source_linked: false,
                },
            );
        }
        Ok(summary)
    }

    fn has_create_intent(&self, intent_id: &str) -> bool {
        self.intents.contains_key(intent_id)
    }

    fn is_create_intent_linked(&self, intent_id: &str) -> bool {
        self.intents
            .get(intent_id)
            .is_some_and(|rec| rec.source_linked)
    }

    fn mark_create_intent_linked(&mut self, intent_id: &str) {
        if let Some(rec) = self.intents.get_mut(intent_id) {
            rec.source_linked = true;
        }
    }

    fn mark_doc_root_registered(&mut self, id: &EditorDocId) {
        self.pending_root_docs.remove(id);
        for rec in self.intents.values_mut() {
            if rec.doc_id == *id {
                rec.root_registered = true;
                rec.deleted_from_root = false;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_substring_matcher_handles_ascii_unicode_and_emoji_utf16_spans() {
        let cases: &[(&str, &str, Option<&[(usize, usize)]>)] = &[
            // ASCII case folding
            ("Project Roadmap", "roadmap", Some(&[(8, 15)])),
            ("Alpha Beta Alpha", "ALPHA", Some(&[(0, 5), (11, 16)])),
            // Exact match vs non-match (threshold: 0 rejects fuzzy typos)
            ("Architecture", "architecture", Some(&[(0, 12)])),
            ("Architecture", "archtecture", None),
            // Unicode case folding (German umlaut, Greek, Cyrillic)
            ("Überblick & Änderung", "änder", Some(&[(12, 17)])),
            ("Ελλάδα Notes", "ελλάδα", Some(&[(0, 6)])),
            // Context-aware Greek Final_Sigma folding: positive & negative cases
            ("ΟΣ", "ος", Some(&[(0, 2)])),
            ("ος", "ΟΣ", Some(&[(0, 2)])),
            ("ΟΔΟΣ", "ΟΣ", Some(&[(2, 4)])),
            ("Τέλος Notes", "ΤΈΛΟΣ", Some(&[(0, 5)])),
            ("Τελος Notes", "ΤΕΛΟΣ", Some(&[(0, 5)])),
            ("ΟΣ", "οσ", None),
            ("ΟΔΟΣ", "οσ", None),
            ("ς", "σ", None),
            ("σ", "ς", None),
            // Emoji surrogate pairs: "🚀" is 2 UTF-16 code units; " " is 1 -> "Launch" starts at 3
            ("🚀 Launch Plan", "launch", Some(&[(3, 9)])),
            ("🚀 Launch 🚀", "🚀", Some(&[(0, 2), (10, 12)])),
            // ZWJ family emoji: 4 code points (2 each) + 3 ZWJs (1 each) = 11 UTF-16 units
            ("👨‍👩‍👧‍👦 Family", "family", Some(&[(12, 18)])),
            // Trailing/leading whitespace is preserved verbatim (no trimming)
            ("Foo Bar", "Foo ", Some(&[(0, 4)])),
            ("Foobar", "Foo ", None),
            ("Anything", "   ", None),
            // Empty query matches all with empty highlights
            ("Anything", "", Some(&[])),
            // Multi-char lowercase expansion ('İ' -> 'i' + '\u{307}') enforces scalar boundaries
            ("İx", "i", None),
            ("İx", "İ", Some(&[(0, 1)])),
            ("İx", "i\u{307}x", Some(&[(0, 2)])),
        ];

        for &(title, query, expected) in cases {
            let actual = match_exact_substring_utf16(title, query);
            match (actual, expected) {
                (None, None) => {}
                (Some((score, spans)), Some(exp)) => {
                    let got: Vec<(usize, usize)> = spans.iter().map(|s| (s.start, s.end)).collect();
                    assert_eq!(got, exp, "title={title:?} query={query:?}");
                    assert!(
                        (0.0..=0.5).contains(&score),
                        "unexpected score {score} for title={title:?} query={query:?}"
                    );
                }
                (got, exp) => {
                    panic!("title={title:?} query={query:?}: got {got:?}, expected {exp:?}")
                }
            }
        }
    }

    #[test]
    fn in_memory_directory_supports_pagination_cancellation_rename_and_create() {
        let mut dir = InMemoryDocDirectory::with_docs([
            EditorDocSummary {
                id: EditorDocId::from("doc:1"),
                title: "Design".into(),
                mode: EditorDocMode::Page,
                updated_at_ms: 100,
            },
            EditorDocSummary {
                id: EditorDocId::from("doc:2"),
                title: "Design System".into(),
                mode: EditorDocMode::Page,
                updated_at_ms: 200,
            },
            EditorDocSummary {
                id: EditorDocId::from("doc:3"),
                title: "Mobile Design Spec".into(),
                mode: EditorDocMode::Edgeless,
                updated_at_ms: 300,
            },
        ]);

        // Exact match ("Design") ranks before longer partial matches regardless of position.
        let p1 = dir
            .query_linked_docs(&DocQueryRequest::new("design", 2))
            .expect("page 1");
        assert_eq!(p1.items.len(), 2);
        assert_eq!(p1.items[0].doc.id, EditorDocId::from("doc:1"));
        assert_eq!(p1.items[0].score, 0.0);
        assert_eq!(p1.items[1].doc.id, EditorDocId::from("doc:2"));
        assert!(p1.next_cursor.is_some());

        let p2 = dir
            .query_linked_docs(&DocQueryRequest::new("design", 2).with_cursor(p1.next_cursor))
            .expect("page 2");
        assert_eq!(p2.items.len(), 1);
        assert_eq!(p2.items[0].doc.id, EditorDocId::from("doc:3"));
        assert_eq!(p2.next_cursor, None);

        // Cancelled token returns empty page with cancelled=true.
        let cancel = DocQueryCancelToken::new();
        cancel.cancel();
        let cancelled = dir
            .query_linked_docs(&DocQueryRequest::new("design", 10).with_cancel(cancel))
            .expect("cancelled query");
        assert!(cancelled.cancelled);
        assert!(cancelled.items.is_empty());

        // Rename & create
        let renamed = dir
            .rename_doc_title(&EditorDocId::from("doc:1"), "Design v2")
            .expect("rename");
        assert_eq!(renamed.title, "Design v2");

        let created = dir
            .create_linked_doc("🚀 Release Checklist", EditorDocMode::Page, None)
            .expect("create");
        assert_eq!(created.title, "🚀 Release Checklist");
        assert_eq!(dir.len(), 4);
    }

    #[test]
    fn create_linked_doc_skips_preexisting_ids_and_replays_intent_idempotently() {
        let mut dir = InMemoryDocDirectory::with_docs([EditorDocSummary {
            id: EditorDocId::from("doc:linked-1"),
            title: "Original".into(),
            mode: EditorDocMode::Page,
            updated_at_ms: 100,
        }]);

        let first = dir
            .create_linked_doc("Different", EditorDocMode::Page, Some("intent-1"))
            .expect("first create");
        assert_eq!(first.id, EditorDocId::from("doc:linked-2"));
        assert_eq!(first.title, "Different");
        assert_eq!(dir.len(), 2);
        assert_eq!(
            dir.get(&EditorDocId::from("doc:linked-1"))
                .map(|doc| doc.title.as_str()),
            Some("Original")
        );

        let replayed = dir
            .create_linked_doc("Different", EditorDocMode::Page, Some("intent-1"))
            .expect("idempotent replay");
        assert_eq!(replayed, first);
        assert_eq!(dir.len(), 2);
    }

    #[test]
    fn retain_and_upsert_separates_root_registration_from_source_link_ledger() {
        // Probe 1: completed intent survives transient empty refresh and keeps original doc ID
        // + linked=true across re-appearance.
        let mut dir = InMemoryDocDirectory::new();
        let alpha = dir
            .create_linked_doc("Alpha", EditorDocMode::Page, Some("intent-1"))
            .expect("create Alpha");
        dir.mark_create_intent_linked("intent-1");
        dir.retain_and_upsert_docs([alpha.clone()]);
        dir.retain_and_upsert_docs([]);
        dir.retain_and_upsert_docs([alpha.clone()]);
        let replayed = dir
            .create_linked_doc("Alpha", EditorDocMode::Page, Some("intent-1"))
            .expect("replay Alpha");
        assert_eq!(replayed.id, alpha.id);
        assert!(dir.is_create_intent_linked("intent-1"));

        // Probe 2: unlinked doc that appeared in a valid root list and was later deleted from
        // the root list must disappear from `query_linked_docs` immediately.
        let draft = dir
            .create_linked_doc("Draft", EditorDocMode::Page, Some("intent-2"))
            .expect("create Draft");
        assert!(!dir.is_create_intent_linked("intent-2"));
        dir.retain_and_upsert_docs([alpha.clone(), draft.clone()]);
        dir.retain_and_upsert_docs([]);
        let query = dir
            .query_linked_docs(&DocQueryRequest::new("Draft", 10))
            .expect("query Draft");
        assert!(
            query.items.is_empty(),
            "deleted Draft doc must disappear from query_linked_docs: {:?}",
            query.items
        );

        // Probe 3: once a doc was confirmed in a valid root list and then deleted from it,
        // replaying its original intent MUST return Err(NotFound) without reviving it (both
        // for unlinked and source-linked intents).
        for (source_linked, intent) in [(false, "intent-del-unlinked"), (true, "intent-del-linked")]
        {
            let mut dir = InMemoryDocDirectory::new();
            let alpha = dir
                .create_linked_doc("Alpha", EditorDocMode::Page, Some(intent))
                .expect("create Alpha");
            if source_linked {
                dir.mark_create_intent_linked(intent);
            }
            dir.retain_and_upsert_docs([alpha.clone()]);
            dir.retain_and_upsert_docs([]);
            let err = dir
                .create_linked_doc("Alpha", EditorDocMode::Page, Some(intent))
                .expect_err("deleted doc must not be revived by replaying old intent");
            assert_eq!(err, DirectoryError::NotFound(alpha.id.clone()));
            let after = dir
                .query_linked_docs(&DocQueryRequest::new("Alpha", 10))
                .expect("query Alpha after rejected replay");
            assert!(
                after.items.is_empty(),
                "source_linked={source_linked}: rejected replay must not revive Alpha in picker: {:?}",
                after.items
            );
        }

        // Probe 4: mark_doc_root_registered closes the deletion window before any intermediate
        // retain_and_upsert_docs([doc]) refresh has occurred.
        let mut dir = InMemoryDocDirectory::new();
        let immediate = dir
            .create_linked_doc(
                "Immediate",
                EditorDocMode::Page,
                Some("intent-immediate-del"),
            )
            .expect("create Immediate");
        dir.mark_doc_root_registered(&immediate.id);
        dir.retain_and_upsert_docs([]);
        let query = dir
            .query_linked_docs(&DocQueryRequest::new("Immediate", 10))
            .expect("query Immediate after delete");
        assert!(query.items.is_empty());
        let err = dir
            .create_linked_doc(
                "Immediate",
                EditorDocMode::Page,
                Some("intent-immediate-del"),
            )
            .expect_err("deleted doc after mark_doc_root_registered must not revive");
        assert_eq!(err, DirectoryError::NotFound(immediate.id));
    }
}
