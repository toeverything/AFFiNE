pub(crate) fn spawn<T: Send + 'static>(
  guard: impl Send + 'static,
  task: impl FnOnce() -> T + Send + 'static,
) -> tokio::task::JoinHandle<T> {
  tokio::task::spawn_blocking(move || {
    let _guard = guard;
    task()
  })
}

#[cfg(test)]
mod tests {
  use std::sync::Arc;

  use tokio::sync::Semaphore;

  use super::*;

  #[tokio::test]
  async fn permit_outlives_the_caller() {
    for cancel in [false, true] {
      let slots = Arc::new(Semaphore::new(1));
      let permit = slots.clone().try_acquire_owned().unwrap();
      let (started, entered) = tokio::sync::oneshot::channel();
      let (release, blocked) = std::sync::mpsc::channel();
      let (finished, exited) = tokio::sync::oneshot::channel();
      let validation = tokio::spawn(async move {
        let task = spawn(permit, move || {
          started.send(()).unwrap();
          blocked.recv().unwrap();
          finished.send(()).unwrap();
        });
        if cancel {
          task.await.unwrap();
          false
        } else {
          tokio::time::timeout(std::time::Duration::from_millis(10), task)
            .await
            .is_err()
        }
      });
      entered.await.unwrap();
      if cancel {
        validation.abort();
        assert!(validation.await.unwrap_err().is_cancelled());
      } else {
        assert!(validation.await.unwrap());
      }
      assert!(slots.clone().try_acquire_owned().is_err());
      release.send(()).unwrap();
      exited.await.unwrap();
      let permit = tokio::time::timeout(std::time::Duration::from_secs(1), slots.acquire_owned())
        .await
        .unwrap()
        .unwrap();
      assert_eq!(spawn(permit, || 42).await.unwrap(), 42);
    }
  }
}
