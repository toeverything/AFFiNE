use std::{
  collections::BTreeMap,
  sync::{Arc, RwLock},
};

use napi::{
  Status,
  threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use serde::Serialize;

use crate::{permission::PermissionEvaluationOutputV1, runtime::Deployment};

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(in crate::runtime::backend_runtime) enum PermissionTelemetryEvent {
  Evaluation {
    deployment: &'static str,
    action_class: &'static str,
    decision: &'static str,
    reason: String,
    count: u32,
  },
  LicenseVerification {
    deployment: &'static str,
    result: &'static str,
    reason: &'static str,
  },
  LicenseHealth {
    result: &'static str,
    changes: u64,
  },
  QuotaCache {
    deployment: &'static str,
    cache: &'static str,
    event: &'static str,
    result: &'static str,
    count: u64,
    entries: u64,
    bytes: u64,
  },
  QuotaGuard {
    domain: &'static str,
    operation: &'static str,
    result: &'static str,
    reason: &'static str,
  },
  BlobAccess {
    operation: &'static str,
    result: &'static str,
    reason: &'static str,
  },
  BlobRefCache {
    event: &'static str,
    result: &'static str,
    entries: u64,
    bytes: u64,
  },
}

#[cfg(test)]
type TestTelemetrySink = dyn Fn(PermissionTelemetryEvent) + Send + Sync;

enum TelemetrySink {
  Callback(ThreadsafeFunction<String, (), String, Status, true, true, 1024>),
  #[cfg(test)]
  Test(Arc<TestTelemetrySink>),
}

#[derive(Clone, Default)]
pub(in crate::runtime::backend_runtime) struct PermissionTelemetry(Arc<RwLock<Option<TelemetrySink>>>);

impl PermissionTelemetry {
  pub(in crate::runtime::backend_runtime) fn from_threadsafe_function(
    callback: Option<ThreadsafeFunction<String, (), String, Status, true, true, 1024>>,
  ) -> Self {
    Self(Arc::new(RwLock::new(callback.map(TelemetrySink::Callback))))
  }

  #[cfg(test)]
  pub(in crate::runtime::backend_runtime) fn from_sink(
    sink: impl Fn(PermissionTelemetryEvent) + Send + Sync + 'static,
  ) -> Self {
    Self(Arc::new(RwLock::new(Some(TelemetrySink::Test(Arc::new(sink))))))
  }

  pub(in crate::runtime::backend_runtime) fn shutdown(&self) {
    if let Ok(mut sink) = self.0.write() {
      sink.take();
    }
  }

  pub(super) fn evaluations(&self, deployment: Deployment, output: &PermissionEvaluationOutputV1) {
    let mut groups = BTreeMap::<(&'static str, &'static str, String), u32>::new();
    for decision in output
      .workspace
      .decisions
      .iter()
      .chain(output.docs.iter().flat_map(|doc| &doc.decisions))
    {
      let action_class = if decision.action.starts_with("Workspace.") {
        "workspace"
      } else {
        "doc"
      };
      let (result, reason) = if decision.allowed {
        ("allow", "acl_allow".to_string())
      } else {
        (
          "deny",
          decision.restrictions.last().map_or_else(
            || "acl_deny".to_string(),
            |restriction| restriction.restriction_type.to_string(),
          ),
        )
      };
      *groups.entry((action_class, result, reason)).or_default() += 1;
    }
    for ((action_class, decision, reason), count) in groups {
      self.emit(PermissionTelemetryEvent::Evaluation {
        deployment: deployment_name(deployment),
        action_class,
        decision,
        reason,
        count,
      });
    }
  }

  pub(super) fn license_verification(&self, result: &'static str, reason: &'static str) {
    self.emit(PermissionTelemetryEvent::LicenseVerification {
      deployment: "selfhosted",
      result,
      reason,
    });
  }

  pub(in crate::runtime::backend_runtime) fn license_health(&self, result: &'static str, changes: usize) {
    self.emit(PermissionTelemetryEvent::LicenseHealth {
      result,
      changes: changes as u64,
    });
  }

  pub(in crate::runtime::backend_runtime) fn quota_cache(
    &self,
    deployment: Deployment,
    cache: &'static str,
    event: &'static str,
    result: &'static str,
    count: u64,
    snapshot: affine_core::cache::CacheSnapshot,
  ) {
    self.emit(PermissionTelemetryEvent::QuotaCache {
      deployment: deployment_name(deployment),
      cache,
      event,
      result,
      count,
      entries: snapshot.entries as u64,
      bytes: snapshot.bytes as u64,
    });
  }

  pub(in crate::runtime::backend_runtime) fn quota_guard(
    &self,
    domain: &'static str,
    operation: &'static str,
    result: &'static str,
    reason: &'static str,
  ) {
    self.emit(PermissionTelemetryEvent::QuotaGuard {
      domain,
      operation,
      result,
      reason,
    });
  }

  pub(in crate::runtime::backend_runtime) fn blob_access(
    &self,
    operation: &'static str,
    result: &'static str,
    reason: &'static str,
  ) {
    self.emit(PermissionTelemetryEvent::BlobAccess {
      operation,
      result,
      reason,
    });
  }

  pub(in crate::runtime::backend_runtime) fn blob_ref_cache(
    &self,
    event: &'static str,
    result: &'static str,
    entries: usize,
    bytes: usize,
  ) {
    self.emit(PermissionTelemetryEvent::BlobRefCache {
      event,
      result,
      entries: entries as u64,
      bytes: bytes as u64,
    });
  }

  fn emit(&self, event: PermissionTelemetryEvent) {
    if let Ok(sink) = self.0.read() {
      match sink.as_ref() {
        Some(TelemetrySink::Callback(callback)) => {
          if let Ok(event) = serde_json::to_string(&event) {
            let _ = callback.call(Ok(event), ThreadsafeFunctionCallMode::NonBlocking);
          }
        }
        #[cfg(test)]
        Some(TelemetrySink::Test(sink)) => sink(event),
        None => {}
      }
    }
  }
}

fn deployment_name(deployment: Deployment) -> &'static str {
  match deployment {
    Deployment::Cloud => "cloud",
    Deployment::SelfHosted => "selfhosted",
  }
}

#[cfg(test)]
mod tests {
  use std::sync::Mutex;

  use super::*;
  use crate::permission::{PermissionDecisionRestrictionV1, PermissionDecisionV1};

  #[test]
  fn aggregates_evaluations_without_resource_labels() {
    let events = Arc::new(Mutex::new(Vec::new()));
    let captured = Arc::clone(&events);
    let telemetry = PermissionTelemetry::from_sink(move |event| captured.lock().unwrap().push(event));
    let output = PermissionEvaluationOutputV1 {
      version: 1,
      workspace: crate::permission::PermissionWorkspaceEvaluationOutputV1 {
        effective_role: Some("member".to_string()),
        preview_exposure: None,
        preview_basis: None,
        decisions: vec![PermissionDecisionV1 {
          action: "Workspace.Read".to_string(),
          allowed: true,
          sources: Vec::new(),
          restrictions: Vec::new(),
        }],
      },
      docs: vec![crate::permission::PermissionDocEvaluationOutputV1 {
        doc_id: "not-emitted".to_string(),
        effective_role: None,
        preview_exposure: None,
        preview_basis: None,
        decisions: vec![PermissionDecisionV1 {
          action: "Doc.Read".to_string(),
          allowed: false,
          sources: Vec::new(),
          restrictions: vec![PermissionDecisionRestrictionV1 {
            restriction_type: "active_member_required",
            reason: None,
          }],
        }],
      }],
    };
    telemetry.evaluations(Deployment::Cloud, &output);
    assert_eq!(
      *events.lock().unwrap(),
      vec![
        PermissionTelemetryEvent::Evaluation {
          deployment: "cloud",
          action_class: "doc",
          decision: "deny",
          reason: "active_member_required".to_string(),
          count: 1,
        },
        PermissionTelemetryEvent::Evaluation {
          deployment: "cloud",
          action_class: "workspace",
          decision: "allow",
          reason: "acl_allow".to_string(),
          count: 1,
        },
      ]
    );
  }

  #[test]
  fn quota_cache_event_contains_only_bounded_dimensions() {
    let events = Arc::new(Mutex::new(Vec::new()));
    let captured = Arc::clone(&events);
    let telemetry = PermissionTelemetry::from_sink(move |event| captured.lock().unwrap().push(event));
    telemetry.quota_cache(
      Deployment::Cloud,
      "storage",
      "db_load",
      "success",
      1,
      affine_core::cache::CacheSnapshot {
        entries: 3,
        bytes: 96,
        flights: 0,
      },
    );
    assert_eq!(
      *events.lock().unwrap(),
      vec![PermissionTelemetryEvent::QuotaCache {
        deployment: "cloud",
        cache: "storage",
        event: "db_load",
        result: "success",
        count: 1,
        entries: 3,
        bytes: 96,
      }]
    );
  }

  #[test]
  fn quota_guard_event_contains_only_bounded_dimensions() {
    let events = Arc::new(Mutex::new(Vec::new()));
    let captured = Arc::clone(&events);
    let telemetry = PermissionTelemetry::from_sink(move |event| captured.lock().unwrap().push(event));
    telemetry.quota_guard("storage", "finalize", "mismatch", "reservation_fence");
    assert_eq!(
      *events.lock().unwrap(),
      vec![PermissionTelemetryEvent::QuotaGuard {
        domain: "storage",
        operation: "finalize",
        result: "mismatch",
        reason: "reservation_fence",
      }]
    );
  }

  #[test]
  fn blob_access_event_contains_only_bounded_dimensions() {
    let events = Arc::new(Mutex::new(Vec::new()));
    let captured = Arc::clone(&events);
    let telemetry = PermissionTelemetry::from_sink(move |event| captured.lock().unwrap().push(event));
    telemetry.blob_access("open", "deny", "reference");
    assert_eq!(
      *events.lock().unwrap(),
      vec![PermissionTelemetryEvent::BlobAccess {
        operation: "open",
        result: "deny",
        reason: "reference",
      }]
    );
  }

  #[test]
  fn blob_ref_cache_event_contains_only_bounded_dimensions() {
    let events = Arc::new(Mutex::new(Vec::new()));
    let captured = Arc::clone(&events);
    let telemetry = PermissionTelemetry::from_sink(move |event| captured.lock().unwrap().push(event));
    telemetry.blob_ref_cache("parse", "success", 2, 128);
    assert_eq!(
      *events.lock().unwrap(),
      vec![PermissionTelemetryEvent::BlobRefCache {
        event: "parse",
        result: "success",
        entries: 2,
        bytes: 128,
      }]
    );
  }
}
