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
      let mut delay = LICENSE_HEALTH_INTERVAL;
      loop {
        tokio::time::sleep(delay).await;
        match runtime.check_licenses_v1().await {
          Ok(result) => {
            runtime.permission_telemetry.license_health(
              if result.transient_failure { "partial" } else { "success" },
              result.changes.len(),
            );
            delay = if result.transient_failure {
              Duration::from_secs(30)
            } else {
              LICENSE_HEALTH_INTERVAL
            };
          }
          Err(_) => {
            runtime.permission_telemetry.license_health("error", 0);
            delay = Duration::from_secs(30);
          }
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
