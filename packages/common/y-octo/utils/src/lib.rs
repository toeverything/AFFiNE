mod doc;

#[cfg(feature = "fuzz")]
pub mod doc_operation;

#[cfg(feature = "fuzz")]
pub use doc_operation::*;
