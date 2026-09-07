use std::time::Duration;

use tokio::task::JoinHandle;

use super::BackendRuntime;

const LICENSE_HEALTH_INTERVAL: Duration = Duration::from_secs(10 * 60);

pub(in crate::runtime::backend_runtime) struct LicenseHealthWorker {
  task: JoinHandle<()>,
}

impl LicenseHealthWorker {
  pub(in crate::runtime::backend_runtime) fn start(runtime: BackendRuntime) -> Self {
    let task = tokio::spawn(async move {
      let mut interval = tokio::time::interval(LICENSE_HEALTH_INTERVAL);
      interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
      interval.tick().await;
      loop {
        interval.tick().await;
        match runtime.check_licenses_v1().await {
          Ok(changes) => runtime.permission_telemetry.license_health("success", changes.len()),
          Err(_) => runtime.permission_telemetry.license_health("error", 0),
        }
      }
    });
    Self { task }
  }

  pub(in crate::runtime::backend_runtime) async fn stop(self) {
    self.task.abort();
    let _ = self.task.await;
  }
}
