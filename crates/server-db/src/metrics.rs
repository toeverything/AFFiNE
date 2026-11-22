//! Task-local query scope counters for deterministic DB budget assertions.

use std::{
  future::Future,
  sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
  },
};

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
pub struct QueryCountersSnapshot {
  pub queries: u64,
  pub transactions: u64,
  pub pool_acquires: u64,
}

impl QueryCountersSnapshot {
  /// Asserts that all counters stay within the given ceilings.
  pub fn assert_within(&self, max_queries: u64, max_transactions: u64, max_pool_acquires: u64) -> Result<(), String> {
    if self.queries > max_queries || self.transactions > max_transactions || self.pool_acquires > max_pool_acquires {
      return Err(format!(
        "query budget exceeded: queries={}/{max_queries}, transactions={}/{max_transactions}, pool_acquires={}/{max_pool_acquires}",
        self.queries, self.transactions, self.pool_acquires
      ));
    }
    Ok(())
  }
}

#[derive(Default)]
struct QueryScopeCounters {
  queries: AtomicU64,
  transactions: AtomicU64,
  pool_acquires: AtomicU64,
}

impl QueryScopeCounters {
  fn snapshot(&self) -> QueryCountersSnapshot {
    QueryCountersSnapshot {
      queries: self.queries.load(Ordering::Relaxed),
      transactions: self.transactions.load(Ordering::Relaxed),
      pool_acquires: self.pool_acquires.load(Ordering::Relaxed),
    }
  }
}

tokio::task_local! {
  static QUERY_SCOPE: Arc<QueryScopeCounters>;
}

/// Runs `fut` inside an isolated task-local query counting scope and returns
/// its output along with the final [`QueryCountersSnapshot`].
pub async fn with_query_scope<F: Future>(fut: F) -> (F::Output, QueryCountersSnapshot) {
  let counters = Arc::new(QueryScopeCounters::default());
  let out = QUERY_SCOPE.scope(Arc::clone(&counters), fut).await;
  (out, counters.snapshot())
}

/// Increments the active task-local `queries` counter if inside a scope.
pub fn record_query() {
  let _ = QUERY_SCOPE.try_with(|c| {
    c.queries.fetch_add(1, Ordering::Relaxed);
  });
}

/// Increments the active task-local `transactions` counter if inside a scope.
pub(crate) fn record_transaction() {
  let _ = QUERY_SCOPE.try_with(|c| {
    c.transactions.fetch_add(1, Ordering::Relaxed);
  });
}

/// Increments the active task-local `pool_acquires` counter if inside a scope.
pub(crate) fn record_pool_acquire() {
  let _ = QUERY_SCOPE.try_with(|c| {
    c.pool_acquires.fetch_add(1, Ordering::Relaxed);
  });
}

/// Returns a snapshot of the active task-local scope counters, if any.
pub fn current_query_counters() -> Option<QueryCountersSnapshot> {
  QUERY_SCOPE.try_with(|c| c.snapshot()).ok()
}
