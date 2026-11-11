use memory_indexer::{MemoryIndex, Query, Result, SearchOptions, SearchResult};

const PAGE_LIMIT: usize = 10_000;

/// Adapt nbstore's large limit/offset API to memory-indexer's bounded windows.
/// Caller holds the index read lock throughout, so the cursor sees one snapshot.
pub(super) fn search_window(index: &MemoryIndex, query: &Query, mut options: SearchOptions) -> Result<SearchResult> {
  if options.limit <= PAGE_LIMIT && options.offset.saturating_add(options.limit) <= PAGE_LIMIT {
    return index.search(query, options);
  }
  // NativeIndexSearchOptions does not expose an initial cursor. Preserve native
  // validation if a future caller supplies one instead of interpreting its
  // offset and total as an unpositioned query.
  if options.after.is_some() {
    return index.search(query, options);
  }
  let requested_offset = options.offset;
  let requested_limit = options.limit;
  let mut count_options = options.clone();
  count_options.limit = 0;
  count_options.offset = 0;
  let total = index.search(query, count_options)?.total;
  let wanted = requested_limit.min(total.saturating_sub(requested_offset));
  let mut hits = Vec::new();
  let mut skip = requested_offset;
  options.offset = 0;
  while hits.len() < wanted {
    options.limit = PAGE_LIMIT.min(skip.saturating_add(wanted - hits.len()));
    let page = index.search(query, options.clone())?;
    let Some(last) = page.hits.last() else {
      return Err(memory_indexer::Error::InvalidQuery(
        "search cursor ended before the requested result window".into(),
      ));
    };
    let next = last.sort_values.clone();
    if next.is_empty() || options.after.as_ref() == Some(&next) {
      return Err(memory_indexer::Error::InvalidQuery(
        "search cursor did not advance".into(),
      ));
    }
    let discard = skip.min(page.hits.len());
    skip -= discard;
    hits.extend(page.hits.into_iter().skip(discard).take(wanted - hits.len()));
    options.after = Some(next);
  }
  Ok(SearchResult { total, hits })
}

#[cfg(test)]
mod tests {
  use super::*;
  use memory_indexer::{Document, FieldOptions, Schema, Sort, SortOrder};

  #[test]
  /// Reproduce the native unlimited-window rejection and verify complete, duplicate-free paging.
  fn reproduces_original_limit_and_returns_all_25005_without_duplicates() {
    let schema = Schema::builder().build().unwrap();
    let mut index = MemoryIndex::new(schema);
    for i in 0..25_005 {
      index.upsert(Document::new(format!("doc-{i:05}"))).unwrap();
    }
    assert!(
      index
        .search(&Query::All, SearchOptions::new(u32::MAX as usize))
        .is_err()
    );
    let result = search_window(&index, &Query::All, SearchOptions::new(u32::MAX as usize)).unwrap();
    assert_eq!(result.total, 25_005);
    assert_eq!(result.hits.len(), 25_005);
    for (i, hit) in result.hits.iter().enumerate() {
      assert_eq!(hit.id, format!("doc-{i:05}"));
    }
  }

  #[test]
  /// Compare bounded and deep windows with the expected filtered order, including ties and stored fields.
  fn offsets_limits_counts_fields_and_tie_breaking_match_full_order() {
    let mut builder = Schema::builder();
    let rank = builder.i64("rank", FieldOptions::indexed_stored().sortable());
    let group = builder.keyword("group", FieldOptions::indexed_stored());
    let mut index = MemoryIndex::new(builder.build().unwrap());
    for i in 0..21_123 {
      let mut doc = Document::new(format!("doc-{i:05}"));
      doc.add(rank, (i % 7) as i64);
      doc.add(group, if i % 2 == 0 { "even" } else { "odd" });
      index.upsert(doc).unwrap();
    }
    let query = Query::term(group, "even");
    let mut all_options = SearchOptions::new(u32::MAX as usize);
    all_options.sort = vec![Sort::Field {
      field: rank,
      order: SortOrder::Desc,
    }];
    all_options.stored_fields = vec![rank, group];
    let all = search_window(&index, &query, all_options.clone()).unwrap();
    let mut expected = (0..21_123).filter(|i| i % 2 == 0).collect::<Vec<_>>();
    expected.sort_by_key(|i| (std::cmp::Reverse(i % 7), *i));
    assert_eq!(
      all.hits.iter().map(|h| h.id.clone()).collect::<Vec<_>>(),
      expected.iter().map(|i| format!("doc-{i:05}")).collect::<Vec<_>>()
    );
    assert!(all.hits.iter().all(|h| h.fields.len() == 2));
    for (offset, limit) in [
      (0, 0),
      (0, 10),
      (0, 9999),
      (0, 10000),
      (0, 10001),
      (9999, 10),
      (10000, 500),
      (10001, 10000),
      (11000, 50),
      (25000, 100),
      (25000, 0),
      (usize::MAX, 2),
    ] {
      let mut options = all_options.clone();
      options.offset = offset;
      options.limit = limit;
      let result = search_window(&index, &query, options).unwrap();
      let want = all
        .hits
        .iter()
        .skip(offset)
        .take(limit)
        .map(|h| h.id.clone())
        .collect::<Vec<_>>();
      assert_eq!(result.total, all.total, "offset={offset} limit={limit}");
      assert_eq!(
        result.hits.iter().map(|h| h.id.clone()).collect::<Vec<_>>(),
        want,
        "offset={offset} limit={limit}"
      );
    }
  }
}
