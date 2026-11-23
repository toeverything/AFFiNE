mod catalog;
mod contract;

pub use catalog::copilot_action_recipe;
pub(crate) use contract::{TranscriptGeneratedResult, TranscriptInputContract, TranscriptResult};
