use std::{io, str::Utf8Error, string::FromUtf8Error};

use thiserror::Error;

/**
 * modified from https://github.com/Abraxas-365/langchain-rust/tree/v4.6.0/src/document_loaders
 */
use super::*;

#[derive(Error, Debug)]
pub enum LoaderError {
  #[error("{0}")]
  TextSplitter(#[from] TextSplitterError),

  #[error(transparent)]
  IO(#[from] io::Error),

  #[error(transparent)]
  Utf8(#[from] Utf8Error),

  #[error(transparent)]
  FromUtf8(#[from] FromUtf8Error),

  #[error(transparent)]
  PdfExtract(#[from] pdf_extract::Error),

  #[error(transparent)]
  PdfExtractOutput(#[from] pdf_extract::OutputError),

  #[error(transparent)]
  Readability(#[from] readability::error::Error),

  #[error(transparent)]
  UrlParse(#[from] url::ParseError),

  #[error("Unsupported source language")]
  UnsupportedLanguage,

  #[error("Error: {0}")]
  Other(String),
}

pub type LoaderResult<T> = Result<T, LoaderError>;
