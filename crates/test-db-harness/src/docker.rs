use std::{
  net::SocketAddr,
  process::{Command, Output},
  time::{Duration, Instant},
};

use crate::{Error, Result, process_run_id};

/// Label on every container the harness starts; `down` and shared-container
/// lookups only ever touch containers carrying it.
pub const OWNER_LABEL: &str = "affine.test.env";
/// `true` on the machine-wide shared container; `false` on private ones.
/// [`Container::remove_owned`] removes only containers labeled `false`.
pub const SHARED_LABEL: &str = "affine.test.shared";
/// Run id of the process that started a private container.
pub const RUN_LABEL: &str = "affine.test.owner";
/// Names a Docker-compatible CLI (e.g. `podman`) to use instead of `docker`.
pub const CONTAINER_CLI_ENV: &str = "AFFINE_TEST_CONTAINER_CLI";

fn cli() -> Command {
  Command::new(std::env::var(CONTAINER_CLI_ENV).unwrap_or_else(|_| "docker".to_owned()))
}

fn run_cli(args: &[&str]) -> Result<Output> {
  cli().args(args).output().map_err(|e| {
    Error::new(format!(
      "cannot run the container CLI ({e}); install Docker or set an explicit test service URL"
    ))
  })
}

fn failure(what: &str, output: &Output) -> Error {
  Error::new(format!(
    "{what} failed ({}): {}",
    output.status,
    String::from_utf8_lossy(&output.stderr).trim()
  ))
}

/// How long [`Container::ensure_shared`] waits for a shared container
/// another caller is starting to come up.
const SHARED_START_TIMEOUT: Duration = Duration::from_secs(10);

/// A container publishing one port on a random `127.0.0.1` port.
///
/// A private container is owned by this run and removed on drop unless
/// [`Container::detach`]ed; a shared one (see [`Container::ensure_shared`])
/// outlives every handle.
#[derive(Debug)]
pub struct Container {
  id: String,
  addr: SocketAddr,
  remove_on_drop: bool,
}

impl Container {
  /// Starts a private `docker run -d --rm` container of `image`, with
  /// `docker_args` before the image and `command` after it, and reads back
  /// the host address assigned to `port`.
  pub fn run(image: &str, port: u16, docker_args: &[&str], command: &[&str]) -> Result<Self> {
    let id = start(image, port, None, docker_args, command)?;
    // From here on, drop removes the container even if the port lookup fails.
    let mut container = Self {
      id,
      addr: SocketAddr::from(([127, 0, 0, 1], 0)),
      remove_on_drop: true,
    };
    container.addr = published_addr(&container.id, port)?;
    Ok(container)
  }

  /// Returns the running machine-wide container named `name`, starting it
  /// when there is none. Concurrent callers converge on one container: a
  /// caller that loses the race for the name waits (short backoff, 10 s
  /// after its own first lookup or start, so an image pull does not count)
  /// until the winner's container runs with its port published. A stopped
  /// leftover of ours is removed and started again; a paused or unknown one
  /// is left alone and reported. The caller checks that the service inside
  /// is ready.
  pub fn ensure_shared(name: &str, image: &str, port: u16, docker_args: &[&str], command: &[&str]) -> Result<Self> {
    let shared = |id: String, addr| Self {
      id,
      addr,
      remove_on_drop: false,
    };
    let mut deadline: Option<Instant> = None;
    let mut backoff = [20, 50, 100]
      .into_iter()
      .chain(std::iter::repeat(100))
      .map(Duration::from_millis);
    let mut last_error = None;
    loop {
      match shared_state(name)? {
        None => match start(image, port, Some(name), docker_args, command) {
          Ok(id) => match published_addr(&id, port) {
            Ok(addr) => return Ok(shared(id, addr)),
            Err(e) => last_error = Some(e),
          },
          // Losing the name race is fine: the next pass finds the winner.
          Err(e) => last_error = Some(e),
        },
        Some((id, state)) => match shared_action(&state) {
          SharedAction::Use => match published_addr(&id, port) {
            Ok(addr) => return Ok(shared(id, addr)),
            Err(e) => last_error = Some(e),
          },
          SharedAction::Wait => {}
          SharedAction::Clear => {
            // Not forced: a container that came back to life is kept.
            if let Ok(output) = run_cli(&["rm", "-v", &id])
              && !output.status.success()
            {
              last_error = Some(failure(&format!("rm {id}"), &output));
            }
          }
          SharedAction::Refuse => {
            return Err(Error::new(format!(
              "shared container {name} ({id}) is in unexpected state {state:?}; unpause or remove it manually"
            )));
          }
        },
      }
      // The window starts once this caller's first lookup or start is done,
      // so pulling the image is not counted against it.
      let deadline = *deadline.get_or_insert_with(|| Instant::now() + SHARED_START_TIMEOUT);
      if Instant::now() >= deadline {
        // One last look, so a container that just came up is not missed.
        if let Some((id, state)) = shared_state(name)?
          && shared_action(&state) == SharedAction::Use
          && let Ok(addr) = published_addr(&id, port)
        {
          return Ok(shared(id, addr));
        }
        return Err(last_error.unwrap_or_else(|| {
          Error::new(format!(
            "shared container {name} not running after {SHARED_START_TIMEOUT:?}"
          ))
        }));
      }
      std::thread::sleep(backoff.next().unwrap_or(Duration::from_millis(100)));
    }
  }

  pub fn id(&self) -> &str {
    &self.id
  }

  pub fn addr(&self) -> SocketAddr {
    self.addr
  }

  /// Whether this handle owns the container (it is private and removed on
  /// drop) rather than sharing a machine-wide one.
  pub fn is_private(&self) -> bool {
    self.remove_on_drop
  }

  /// Leaves the container running after this handle is dropped and returns
  /// its id. Remove it later with [`Container::remove_owned`] and this
  /// run's [`crate::process_run_id`], its owner.
  pub fn detach(mut self) -> String {
    self.remove_on_drop = false;
    std::mem::take(&mut self.id)
  }

  /// Force-removes a private container this harness started for run
  /// `expected_owner`. Refused, never removed: an empty owner, anything but
  /// a full 64-hex container id (names and prefixes could match another
  /// container), a container whose id differs, one without the harness
  /// label, one not labeled private (the shared container, and containers
  /// without the shared label), and a container another run started.
  pub fn remove_owned(id: &str, expected_owner: &str) -> Result<()> {
    let refuse = |why: String| Error::new(format!("refusing to remove container {id:?}: {why}"));
    if expected_owner.is_empty() {
      return Err(refuse("no expected owner run given".into()));
    }
    if id.len() != 64 || !id.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
      return Err(refuse("expected a full 64-hex container id".into()));
    }
    let format = format!(
      "{{{{.Id}}}}|{{{{index .Config.Labels \"{OWNER_LABEL}\"}}}}|{{{{index .Config.Labels \"{SHARED_LABEL}\"}}}}|{{{{index .Config.Labels \"{RUN_LABEL}\"}}}}"
    );
    let inspect = run_cli(&["inspect", "--type", "container", "--format", &format, id])?;
    if !inspect.status.success() {
      let stderr = String::from_utf8_lossy(&inspect.stderr).to_ascii_lowercase();
      if stderr.contains("no such") {
        return Ok(());
      }
      return Err(failure(&format!("inspect {id}"), &inspect));
    }
    let text = String::from_utf8_lossy(&inspect.stdout).trim().to_owned();
    let [full, env, shared, owner] = text.split('|').collect::<Vec<_>>()[..] else {
      return Err(refuse(format!("unexpected inspect output {text:?}")));
    };
    if full != id {
      return Err(refuse(format!("inspect resolved it to {full}")));
    }
    if env != "true" {
      return Err(refuse(format!("it lacks the {OWNER_LABEL}=true label")));
    }
    if shared != "false" {
      return Err(refuse(format!(
        "it is not labeled {SHARED_LABEL}=false (the machine-wide shared container, or an unknown one)"
      )));
    }
    if owner != expected_owner {
      return Err(refuse(format!("it belongs to run {owner:?}, not {expected_owner:?}")));
    }
    let output = run_cli(&["rm", "-f", "-v", id])?;
    if output.status.success() {
      Ok(())
    } else {
      Err(failure(&format!("rm -f {id}"), &output))
    }
  }
}

impl Drop for Container {
  fn drop(&mut self) {
    if self.remove_on_drop && !self.id.is_empty() {
      let _ = Self::remove_owned(&self.id, process_run_id());
    }
  }
}

/// What [`Container::ensure_shared`] does with a shared container found in
/// a given Docker or Podman state.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum SharedAction {
  Use,
  /// Another caller is creating, restarting or stopping it.
  Wait,
  /// Stopped for good: remove it and start again.
  Clear,
  /// Paused or unknown: it may still hold other runs' databases.
  Refuse,
}

fn shared_action(state: &str) -> SharedAction {
  match state {
    "running" => SharedAction::Use,
    "created" | "configured" | "initialized" | "restarting" | "removing" | "stopping" => SharedAction::Wait,
    "exited" | "dead" | "stopped" => SharedAction::Clear,
    _ => SharedAction::Refuse,
  }
}

/// With `name`, the shared container; without, a private one owned by this
/// run.
fn start(image: &str, port: u16, name: Option<&str>, docker_args: &[&str], command: &[&str]) -> Result<String> {
  let publish = format!("127.0.0.1::{port}");
  let env_label = format!("{OWNER_LABEL}=true");
  let shared_label = format!("{SHARED_LABEL}={}", name.is_some());
  let run_label = format!("{RUN_LABEL}={}", process_run_id());
  let mut args = vec![
    "run",
    "-d",
    "--rm",
    "--label",
    &env_label,
    "--label",
    &shared_label,
    "-p",
    &publish,
  ];
  match name {
    Some(name) => args.extend(["--name", name]),
    None => args.extend(["--label", &run_label]),
  }
  args.extend(docker_args);
  args.push(image);
  args.extend(command);
  let output = run_cli(&args)?;
  if !output.status.success() {
    return Err(failure(&format!("run {image}"), &output));
  }
  Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

/// Id and state (`running`, `created`, `exited`, ...) of the harness-labeled
/// shared container named exactly `name`, in any state.
fn shared_state(name: &str) -> Result<Option<(String, String)>> {
  let output = run_cli(&[
    "ps",
    "-a",
    "--no-trunc",
    "--filter",
    &format!("label={OWNER_LABEL}=true"),
    "--filter",
    &format!("label={SHARED_LABEL}=true"),
    "--filter",
    &format!("name=^{name}$"),
    "--format",
    "{{.ID}}|{{.State}}",
  ])?;
  if !output.status.success() {
    return Err(failure("ps", &output));
  }
  Ok(
    String::from_utf8_lossy(&output.stdout)
      .lines()
      .filter_map(|l| l.trim().split_once('|'))
      .map(|(id, state)| (id.to_owned(), state.trim().to_ascii_lowercase()))
      .next(),
  )
}

fn published_addr(id: &str, port: u16) -> Result<SocketAddr> {
  let output = run_cli(&["port", id, &format!("{port}/tcp")])?;
  if !output.status.success() {
    return Err(failure(&format!("port {id}"), &output));
  }
  let text = String::from_utf8_lossy(&output.stdout);
  text
    .lines()
    .filter_map(|line| line.trim().parse::<SocketAddr>().ok())
    .find(SocketAddr::is_ipv4)
    .ok_or_else(|| Error::new(format!("port {id} {port}/tcp returned no IPv4 address: {text:?}")))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn shared_container_states_map_to_actions() {
    let cases = [
      ("running", SharedAction::Use),
      ("created", SharedAction::Wait),
      ("configured", SharedAction::Wait),
      ("initialized", SharedAction::Wait),
      ("restarting", SharedAction::Wait),
      ("removing", SharedAction::Wait),
      ("stopping", SharedAction::Wait),
      ("exited", SharedAction::Clear),
      ("dead", SharedAction::Clear),
      ("stopped", SharedAction::Clear),
      ("paused", SharedAction::Refuse),
      ("unknown", SharedAction::Refuse),
      ("", SharedAction::Refuse),
    ];
    for (state, action) in cases {
      assert_eq!(shared_action(state), action, "{state:?}");
    }
  }
}
