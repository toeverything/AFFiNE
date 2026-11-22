//! `run.json`: the report every test lane writes.

use std::{collections::BTreeMap, path::Path};

use serde::{Deserialize, Serialize};

use crate::Result;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RunStatus {
  Passed,
  Failed,
  Skipped,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SkippedTarget {
  pub target: String,
  pub reason: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RunReport {
  pub run_id: String,
  pub sha: String,
  pub lane: String,
  pub selected_targets: Vec<String>,
  pub skipped_targets_with_reason: Vec<SkippedTarget>,
  pub timings_ms: BTreeMap<String, u64>,
  pub status: RunStatus,
}

impl RunReport {
  /// Writes pretty JSON with a trailing newline, atomically (temp file in the
  /// same directory, then rename), creating parent directories.
  pub fn write(&self, path: &Path) -> Result<()> {
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
      std::fs::create_dir_all(parent)?;
    }
    let mut json = serde_json::to_vec_pretty(self)?;
    json.push(b'\n');
    let tmp = path.with_extension(format!("json.tmp-{}", std::process::id()));
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
  }

  pub fn read(path: &Path) -> Result<Self> {
    Ok(serde_json::from_slice(&std::fs::read(path)?)?)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn run_report_schema_round_trips_through_file() {
    let report = RunReport {
      run_id: "r1".into(),
      sha: "abc".into(),
      lane: "server-harness".into(),
      selected_targets: vec!["test-db-harness".into()],
      skipped_targets_with_reason: vec![SkippedTarget {
        target: "frontend".into(),
        reason: "no frontend paths changed".into(),
      }],
      timings_ms: BTreeMap::from([("clippy".into(), 12), ("test".into(), 34)]),
      status: RunStatus::Passed,
    };
    let value = serde_json::to_value(&report).unwrap();
    assert_eq!(
      value,
      serde_json::json!({
        "run_id": "r1",
        "sha": "abc",
        "lane": "server-harness",
        "selected_targets": ["test-db-harness"],
        "skipped_targets_with_reason": [{ "target": "frontend", "reason": "no frontend paths changed" }],
        "timings_ms": { "clippy": 12, "test": 34 },
        "status": "passed"
      })
    );

    let path = std::env::temp_dir()
      .join(format!("tdh-report-{}", crate::process_run_id()))
      .join("nested/run.json");
    report.write(&path).unwrap();
    assert_eq!(RunReport::read(&path).unwrap(), report);
    std::fs::remove_dir_all(path.parent().unwrap().parent().unwrap()).unwrap();

    let unknown = r#"{"run_id":"r","sha":"s","lane":"l","selected_targets":[],"skipped_targets_with_reason":[],"timings_ms":{},"status":"passed","extra":1}"#;
    assert!(
      serde_json::from_str::<RunReport>(unknown).is_err(),
      "unknown fields rejected"
    );
  }
}
