//! Pure-Rust 1:1 port of `fuse.js@7.1.0` for the exact configuration used by AFFiNE 0.27.5
//! client pickers (tags, collections, members, commands):
//! `{ keys: ['title'], includeMatches: true, includeScore: true, ignoreLocation: true, threshold: 0.0 }`.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::directory::Utf16HighlightSpan;

/// Maximum Bitap word size in `fuse.js@7.1.0` (`MAX_BITS = 32` UTF-16 code units).
const MAX_BITS: usize = 32;

/// Highlight interval generation mode for [`fuse_search_utf16`].
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum FuseHighlightMode {
    /// Exact `fuse.js@7.1.0` bitap `matchMask` behavior (marks every UTF-16 code unit in the
    /// field whose lowercased value appears in the matched chunk alphabet when not an exact
    /// full-field match).
    #[default]
    FuseBitmask,
    /// Contiguous non-overlapping substring occurrences of each matched chunk in the field.
    ContiguousSubstring,
}

/// One ranked match returned by [`fuse_search_utf16`].
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FuseMatch {
    /// Zero-based index of the matched item in the input slice.
    pub ref_index: usize,
    /// `fuse.js@7.1.0` field-norm-weighted score (lower is better).
    pub score: f64,
    /// Half-open UTF-16 code-unit highlight intervals `[start, end)` in the lowercased string
    /// (1:1 with `fuse.js@7.1.0`). Use [`Self::clamped_char_boundary_spans`] to map back to
    /// safe Unicode scalar boundaries in the original title.
    pub indices: Vec<Utf16HighlightSpan>,
}

impl FuseMatch {
    /// Maps [`Self::indices`] (folded UTF-16 offsets from `fuse.js@7.1.0`) back to valid UTF-16
    /// Unicode scalar boundaries of `original_title`.
    ///
    /// Handles multi-code-unit lowercase expansions (such as `'İ' -> "i\u{307}"`) by mapping
    /// folded coordinates through each source scalar's `(orig_u16, fold_u16)` range, and drops
    /// half-surrogate matches (such as `"🔥"` sharing high surrogate `0xD83D` with `"🚀"`).
    pub fn clamped_char_boundary_spans(&self, original_title: &str) -> Vec<Utf16HighlightSpan> {
        let mut char_map: Vec<(usize, usize, usize, usize)> =
            Vec::with_capacity(original_title.len());
        let mut orig_cursor = 0usize;
        let mut fold_cursor = 0usize;
        for ch in original_title.chars() {
            let orig_len = ch.len_utf16();
            // Unicode SpecialCasing `Final_Sigma` preserves UTF-16 length (1 -> 1), so summing
            // `ch.to_lowercase()` UTF-16 lengths equals the scalar's span in `str::to_lowercase()`.
            let fold_len: usize = ch.to_lowercase().map(char::len_utf16).sum();
            char_map.push((
                orig_cursor,
                orig_cursor + orig_len,
                fold_cursor,
                fold_cursor + fold_len,
            ));
            orig_cursor += orig_len;
            fold_cursor += fold_len;
        }

        let mut covered = vec![false; char_map.len()];
        for span in &self.indices {
            if span.start >= span.end {
                continue;
            }
            for (idx, &(orig_start, orig_end, fold_start, fold_end)) in char_map.iter().enumerate()
            {
                if fold_end <= span.start {
                    continue;
                }
                if fold_start >= span.end {
                    break;
                }
                let orig_len = orig_end - orig_start;
                let hits = if orig_len == 2 {
                    // Non-BMP surrogate pair: require full coverage of both UTF-16 code units.
                    span.start <= fold_start && span.end >= fold_end
                } else {
                    // BMP scalar (including multi-char lowercase expansions like 'İ'):
                    // any overlap in folded space maps cleanly to the source scalar.
                    span.start < fold_end && span.end > fold_start
                };
                if hits {
                    covered[idx] = true;
                }
            }
        }

        let mut out: Vec<Utf16HighlightSpan> = Vec::new();
        for (idx, &hit) in covered.iter().enumerate() {
            if !hit {
                continue;
            }
            let (orig_start, orig_end, _, _) = char_map[idx];
            if let Some(last) = out.last_mut()
                && orig_start <= last.end
            {
                last.end = last.end.max(orig_end);
            } else {
                out.push(Utf16HighlightSpan {
                    start: orig_start,
                    end: orig_end,
                });
            }
        }
        out
    }
}

struct PatternChunk<'a> {
    pattern: &'a [u16],
    alphabet: HashSet<u16>,
}

/// Splits `pattern_u16` into `MAX_BITS` (32) UTF-16 chunks matching `fuse.js@7.1.0` `BitapSearch`,
/// prebuilding each chunk's alphabet once outside the candidate loop.
fn build_pattern_chunks<'a>(pattern_u16: &'a [u16]) -> Vec<PatternChunk<'a>> {
    let len = pattern_u16.len();
    let mut chunks = Vec::new();
    let mut push_chunk = |slice: &'a [u16]| {
        chunks.push(PatternChunk {
            pattern: slice,
            alphabet: slice.iter().copied().collect(),
        });
    };

    if len > MAX_BITS {
        let remainder = len % MAX_BITS;
        let end = len - remainder;
        let mut i = 0;
        while i < end {
            push_chunk(&pattern_u16[i..i + MAX_BITS]);
            i += MAX_BITS;
        }
        if remainder > 0 {
            push_chunk(&pattern_u16[len - MAX_BITS..len]);
        }
    } else {
        push_chunk(pattern_u16);
    }
    chunks
}

/// Computes `fuse.js@7.1.0` field-length normalization (`norm(weight = 1, mantissa = 3)`).
///
/// Counts whitespace-delimited tokens via `[^ ]+` (matching `const SPACE = /[^ ]+/g`), then
/// rounds `1 / sqrt(num_tokens)` to 3 decimal places.
fn fuse_field_norm(value: &str) -> f64 {
    let num_tokens = value.split(' ').filter(|part| !part.is_empty()).count();
    if num_tokens == 0 {
        return 1.0;
    }
    let raw = 1.0 / (num_tokens as f64).sqrt();
    (raw * 1000.0).round() / 1000.0
}

/// Searches `titles` using `fuse.js@7.1.0` semantics (`threshold: 0.0`, `ignoreLocation: true`,
/// `includeMatches: true`, `includeScore: true`), including `MAX_BITS = 32` chunking for long
/// queries.
///
/// Case folding uses `str::to_lowercase()` (which implements Unicode `Final_Sigma` context rules
/// matching JS `String.prototype.toLowerCase()`), and compares UTF-16 code-unit sequences.
/// Results are sorted ascending by `score`, with ties preserving the original input order.
pub fn fuse_search_utf16(titles: &[&str], query: &str, mode: FuseHighlightMode) -> Vec<FuseMatch> {
    if query.is_empty() {
        return Vec::new();
    }

    let pattern_lower = query.to_lowercase();
    let pattern_u16: Vec<u16> = pattern_lower.encode_utf16().collect();
    if pattern_u16.is_empty() {
        return Vec::new();
    }
    let chunks = build_pattern_chunks(&pattern_u16);

    let mut results = Vec::new();
    for (ref_index, &title) in titles.iter().enumerate() {
        let text_lower = title.to_lowercase();
        let text_u16: Vec<u16> = text_lower.encode_utf16().collect();
        let text_len = text_u16.len();
        let norm = fuse_field_norm(title);

        // Exact full-field match: `BitapSearch.searchIn` short-circuits with raw score 0.0 and
        // single full-field span; outer `computeScore` maps `score === 0 && weight` to `f64::EPSILON`.
        if text_u16 == pattern_u16 {
            let score = f64::EPSILON.powf(norm);
            results.push(FuseMatch {
                ref_index,
                score,
                indices: vec![Utf16HighlightSpan {
                    start: 0,
                    end: text_len,
                }],
            });
            continue;
        }

        let mut all_indices = Vec::new();
        let mut total_score = 0.0_f64;
        let mut has_matches = false;

        for chunk in &chunks {
            let chunk_len = chunk.pattern.len();
            let mut contiguous = Vec::new();
            if chunk_len <= text_len {
                let mut pos = 0usize;
                while pos + chunk_len <= text_len {
                    if text_u16[pos..pos + chunk_len] == chunk.pattern[..] {
                        contiguous.push(Utf16HighlightSpan {
                            start: pos,
                            end: pos + chunk_len,
                        });
                        pos += chunk_len;
                    } else {
                        pos += 1;
                    }
                }
            }

            if contiguous.is_empty() {
                total_score += 1.0;
                continue;
            }

            has_matches = true;
            // `BitapSearch.search` clamps a zero bitap score to `0.001`.
            total_score += 0.001;
            match mode {
                FuseHighlightMode::ContiguousSubstring => all_indices.extend(contiguous),
                FuseHighlightMode::FuseBitmask => {
                    let mut mask = vec![false; text_len];
                    for (k, unit) in text_u16.iter().enumerate() {
                        if chunk.alphabet.contains(unit) {
                            mask[k] = true;
                        }
                    }
                    all_indices.extend(mask_to_spans(&mask));
                }
            }
        }

        if !has_matches {
            continue;
        }

        let raw_score = total_score / (chunks.len() as f64);
        let score = raw_score.powf(norm);

        results.push(FuseMatch {
            ref_index,
            score,
            indices: all_indices,
        });
    }

    results.sort_by(|a, b| {
        a.score
            .total_cmp(&b.score)
            .then_with(|| a.ref_index.cmp(&b.ref_index))
    });
    results
}

fn mask_to_spans(mask: &[bool]) -> Vec<Utf16HighlightSpan> {
    let mut spans = Vec::new();
    let mut start: Option<usize> = None;
    for (i, &matched) in mask.iter().enumerate() {
        if matched && start.is_none() {
            start = Some(i);
        } else if !matched && let Some(s) = start.take() {
            spans.push(Utf16HighlightSpan { start: s, end: i });
        }
    }
    if let Some(s) = start {
        spans.push(Utf16HighlightSpan {
            start: s,
            end: mask.len(),
        });
    }
    spans
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    struct OracleFixture {
        fuse_version: String,
        cases: Vec<OracleCase>,
    }

    #[derive(Deserialize)]
    struct OracleCase {
        label: String,
        titles: Vec<String>,
        query: String,
        results: Vec<OracleResult>,
    }

    #[derive(Deserialize)]
    struct OracleResult {
        title: String,
        ref_index: usize,
        score: f64,
        indices: Vec<[usize; 2]>,
    }

    #[test]
    fn fuse_search_matches_frozen_fuse_v710_oracle_100_percent() {
        let fixture: OracleFixture =
            serde_json::from_str(include_str!("../tests/fixtures/fuse_v710_oracle.json"))
                .expect("valid fuse v7.1.0 oracle JSON");
        assert_eq!(fixture.fuse_version, "7.1.0");
        assert!(fixture.cases.len() >= 25);

        for case in &fixture.cases {
            let titles: Vec<&str> = case.titles.iter().map(String::as_str).collect();
            let actual = fuse_search_utf16(&titles, &case.query, FuseHighlightMode::FuseBitmask);
            assert_eq!(
                actual.len(),
                case.results.len(),
                "case {} (query={:?}): hit count mismatch",
                case.label,
                case.query
            );
            for (got, exp) in actual.iter().zip(&case.results) {
                assert_eq!(
                    got.ref_index, exp.ref_index,
                    "case {}: ref_index mismatch",
                    case.label
                );
                assert_eq!(
                    titles[got.ref_index], exp.title,
                    "case {}: title order mismatch",
                    case.label
                );
                assert!(
                    (got.score - exp.score).abs() < 1e-12,
                    "case {}: score mismatch got={} expected={}",
                    case.label,
                    got.score,
                    exp.score
                );
                let got_spans: Vec<[usize; 2]> =
                    got.indices.iter().map(|s| [s.start, s.end]).collect();
                assert_eq!(
                    got_spans, exp.indices,
                    "case {}: indices mismatch",
                    case.label
                );
            }
        }
    }

    #[test]
    fn fuse_contiguous_mode_returns_exact_substring_spans() {
        let hits = fuse_search_utf16(
            &["Engineering", "Project Roadmap"],
            "gin",
            FuseHighlightMode::ContiguousSubstring,
        );
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].ref_index, 0);
        assert_eq!(
            hits[0].indices,
            vec![Utf16HighlightSpan { start: 2, end: 5 }]
        );
    }

    #[test]
    fn clamped_char_boundary_spans_maps_folded_offsets_accurately_and_drops_half_surrogates() {
        let cases: &[(&str, &str, &[(usize, usize)])] = &[
            // 'İ' expands to 2 UTF-16 units in lowercase ("i\u{307}"); mapping back hits 'a' [1, 2), NOT 'b'!
            ("İab", "a", &[(1, 2)]),
            ("İx", "x", &[(1, 2)]),
            ("İstanbul", "bul", &[(5, 8)]),
            ("İstanbul", "i", &[(0, 1)]),
            // "🔥" and "🚀" share high surrogate 0xD83D; half-surrogate at [0, 1) is dropped.
            ("🔥 🚀", "🚀", &[(3, 5)]),
        ];

        for &(title, query, expected) in cases {
            let hits = fuse_search_utf16(&[title], query, FuseHighlightMode::FuseBitmask);
            assert_eq!(hits.len(), 1, "title={title:?} query={query:?}");
            let safe = hits[0].clamped_char_boundary_spans(title);
            let got: Vec<(usize, usize)> = safe.iter().map(|s| (s.start, s.end)).collect();
            assert_eq!(got, expected, "title={title:?} query={query:?}");
            let orig_u16: Vec<u16> = title.encode_utf16().collect();
            for span in &safe {
                assert!(span.start < span.end && span.end <= orig_u16.len());
                assert!(String::from_utf16(&orig_u16[span.start..span.end]).is_ok());
            }
        }
    }
}
