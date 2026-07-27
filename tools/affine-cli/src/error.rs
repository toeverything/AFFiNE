//! Unified CLI error that serializes to a stable JSON envelope.
//!
//! The engine returns `crate::doc_parser::ParseError`; the store returns
//! `affine_nbstore::error::Error` (which itself has `Parse(#[from] ParseError)`); the
//! y-octo merge primitives return `JwstCodecError`. All collapse into `CliError` here so
//! `main` can print one `{ "error": ... }` shape and exit non-zero.

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum CliError {
    /// Reserved for not-yet-implemented subcommands. Phase 2 wires every arm, so nothing
    /// constructs this today, but the variant (and its envelope `phase` marker) is kept stable.
    #[allow(dead_code)]
    #[error("not_implemented")]
    NotImplemented,

    #[error("config error: {0}")]
    Config(String),

    /// The target workspace database is currently open in another process (typically the
    /// AFFiNE app). Distinct from `Config` so agents can pattern-match `"error":"locked"`
    /// and decide to retry later or pass `--force`.
    #[error("{0}")]
    Locked(String),

    #[error("store error: {0}")]
    Store(#[from] affine_nbstore::error::Error),

    #[error("parse error: {0}")]
    Parse(#[from] crate::doc_parser::ParseError),

    #[error("crdt error: {0}")]
    Crdt(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Other(String),
}

impl CliError {
    pub fn config(msg: impl Into<String>) -> Self {
        CliError::Config(msg.into())
    }

    pub fn other(msg: impl Into<String>) -> Self {
        CliError::Other(msg.into())
    }

    /// A short, machine-friendly code for the JSON envelope.
    pub fn code(&self) -> &'static str {
        match self {
            CliError::NotImplemented => "not_implemented",
            CliError::Config(_) => "config",
            CliError::Locked(_) => "locked",
            CliError::Store(_) => "store",
            CliError::Parse(_) => "parse",
            CliError::Crdt(_) => "crdt",
            CliError::Io(_) => "io",
            CliError::Other(_) => "error",
        }
    }
}

// y-octo's error type (JwstCodecError) does not implement std::error::Error in a way we
// rely on, so capture its Display.
impl From<y_octo::JwstCodecError> for CliError {
    fn from(e: y_octo::JwstCodecError) -> Self {
        CliError::Crdt(e.to_string())
    }
}

impl From<anyhow::Error> for CliError {
    fn from(e: anyhow::Error) -> Self {
        CliError::Other(e.to_string())
    }
}

/// The error payload emitted to stdout for a failed command.
#[derive(Serialize)]
pub struct ErrorEnvelope<'a> {
    pub ok: bool,
    pub error: &'a str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<&'a str>,
}

impl CliError {
    pub fn to_envelope(&self) -> ErrorEnvelope<'_> {
        let phase = matches!(self, CliError::NotImplemented).then_some("0");
        ErrorEnvelope {
            ok: false,
            error: self.code(),
            message: self.to_string(),
            phase,
        }
    }
}
