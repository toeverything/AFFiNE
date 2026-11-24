use thiserror::Error;

pub type SearchResult<T> = Result<T, SearchError>;

#[derive(Debug, Error)]
pub enum SearchError {
  #[error("invalid search configuration: {0}")]
  Config(String),
  #[error("invalid search input: {0}")]
  InvalidInput(String),
  #[error("unsupported search query")]
  UnsupportedQuery,
  #[error("workspace search access denied")]
  WorkspaceDenied,
  #[error("search permission check unavailable")]
  PermissionUnavailable,
  #[error("search provider is unavailable")]
  ProviderUnavailable,
  #[error("search index is not ready")]
  IndexNotReady,
  #[error("search permissions are syncing")]
  PermissionSyncing,
  #[error("search index failed: {0}")]
  IndexFailed(String),
  #[error("search generation is invalid: {0}")]
  GenerationInvalid(String),
  #[error("search source document is invalid: {0}")]
  SourceInvalid(String),
  #[error("{context}: {source}")]
  Database {
    context: &'static str,
    #[source]
    source: sqlx::Error,
  },
  #[error("{context}: {source}")]
  Json {
    context: &'static str,
    #[source]
    source: serde_json::Error,
  },
  #[error("{0}")]
  InvalidState(String),
}

impl SearchError {
  pub fn config(message: impl Into<String>) -> Self {
    Self::Config(message.into())
  }

  pub fn invalid_input(message: impl Into<String>) -> Self {
    Self::InvalidInput(message.into())
  }

  pub fn invalid_state(message: impl Into<String>) -> Self {
    Self::InvalidState(message.into())
  }

  pub fn database(context: &'static str, source: sqlx::Error) -> Self {
    Self::Database { context, source }
  }

  pub fn json(context: &'static str, source: serde_json::Error) -> Self {
    Self::Json { context, source }
  }

  pub fn is_permanent_search_source(&self) -> bool {
    matches!(self, Self::SourceInvalid(_))
  }

  pub fn is_permanent_search_generation(&self) -> bool {
    matches!(self, Self::GenerationInvalid(_))
  }

  pub fn error_code(&self) -> &'static str {
    match self {
      Self::WorkspaceDenied => "workspace_denied",
      Self::InvalidInput(_) => "invalid_request",
      Self::UnsupportedQuery => "unsupported_query",
      Self::ProviderUnavailable => "provider_unavailable",
      Self::IndexNotReady => "index_not_ready",
      Self::PermissionSyncing => "permission_syncing",
      Self::IndexFailed(_) => "index_failed",
      _ => "internal_error",
    }
  }
}
