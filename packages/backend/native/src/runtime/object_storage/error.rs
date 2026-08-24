use reqwest::StatusCode;

#[derive(Debug, thiserror::Error)]
pub(crate) enum ObjectStorageError {
  #[error("ObjectStorage config error: {0}")]
  Config(String),
  #[error("{context}: {source}")]
  Operation {
    context: String,
    #[source]
    source: Box<ObjectStorageError>,
  },
  #[error("ObjectStorage http client build failed: {0}")]
  HttpClientBuild(#[source] reqwest::Error),
  #[error("ObjectStorage http request failed: {0}")]
  HttpRequest(#[source] reqwest::Error),
  #[error("ObjectStorage invalid http header: {0}")]
  InvalidHeader(String),
  #[error("ObjectStorage response body exceeds {limit} bytes")]
  BodyTooLarge { limit: usize },
  #[error("{context}: status={status} body={body}")]
  HttpStatus {
    context: String,
    status: StatusCode,
    body: String,
  },
  #[error("{context}: invalid utf8 response: {source}")]
  InvalidUtf8 {
    context: String,
    #[source]
    source: std::string::FromUtf8Error,
  },
  #[error("{context}: invalid xml response: {source}")]
  InvalidXml {
    context: String,
    #[source]
    source: instant_xml::Error,
  },
  #[error("ObjectStorage invalid input: {0}")]
  InvalidInput(String),
}

impl ObjectStorageError {
  pub(crate) fn is_not_found(&self) -> bool {
    match self {
      Self::Operation { source, .. } => source.is_not_found(),
      Self::HttpStatus { status, body, .. } => {
        *status == StatusCode::NOT_FOUND
          && (body.contains("NoSuchKey") || body.contains("NoSuchUpload") || body.contains("NotFound"))
      }
      _ => false,
    }
  }

  pub(crate) fn is_retryable_http_status(&self) -> bool {
    match self {
      Self::Operation { source, .. } => source.is_retryable_http_status(),
      Self::HttpStatus { status, .. } => *status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error(),
      _ => false,
    }
  }
}

pub(crate) type ObjectStorageResult<T> = std::result::Result<T, ObjectStorageError>;
