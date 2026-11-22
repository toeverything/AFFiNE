use std::{
  net::SocketAddr,
  process::{Command, Output},
};

use crate::{Error, Result, process_run_id};

/// Label on every container the harness starts; `down` and shared-container
/// lookups only ever touch containers carrying it.
pub const OWNER_LABEL: &str = "affine.test.env";
/// `true` on the machine-wide shared container, which
/// [`Container::remove_owned`] never removes; `false` on private ones.
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

/// A container publishing one port on a random `127.0.0.1` port.
///
/// A private container is removed on drop unless [`Container::detach`]ed; a
/// shared one (see [`Container::ensure_shared`]) outlives every handle.
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
  /// name conflict means another process started it first. The caller checks
  /// that the service inside is ready.
  pub fn ensure_shared(name: &str, image: &str, port: u16, docker_args: &[&str], command: &[&str]) -> Result<Self> {
    let id = match running_labeled(name)? {
      Some(id) => id,
      None => match start(image, port, Some(name), docker_args, command) {
        Ok(id) => id,
        Err(e) => running_labeled(name)?.ok_or(e)?,
      },
    };
    Ok(Self {
      addr: published_addr(&id, port)?,
      id,
      remove_on_drop: false,
    })
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
  /// its id for a later [`Container::remove`].
  pub fn detach(mut self) -> String {
    self.remove_on_drop = false;
    std::mem::take(&mut self.id)
  }

  /// Force-removes a private container started by this harness, given its
  /// full 64-hex id. See [`Container::remove_owned`].
  pub fn remove(id: &str) -> Result<()> {
    Self::remove_owned(id, None)
  }

  /// Force-removes a private container started by this harness. Refused,
  /// never removed: anything but a full 64-hex container id (names and
  /// prefixes could match another container), a container whose id differs,
  /// one without the harness label, the shared container, and, when
  /// `expected_owner` is given, a container another run started.
  pub fn remove_owned(id: &str, expected_owner: Option<&str>) -> Result<()> {
    let refuse = |why: String| Error::new(format!("refusing to remove container {id:?}: {why}"));
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
    if shared == "true" {
      return Err(refuse("it is the machine-wide shared container".into()));
    }
    if let Some(expected) = expected_owner
      && expected != owner
    {
      return Err(refuse(format!("it belongs to run {owner:?}, not {expected:?}")));
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
      let _ = Self::remove(&self.id);
    }
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

/// Id of the running, harness-labeled shared container named exactly `name`.
fn running_labeled(name: &str) -> Result<Option<String>> {
  let output = run_cli(&[
    "ps",
    "--no-trunc",
    "--filter",
    &format!("label={OWNER_LABEL}=true"),
    "--filter",
    &format!("label={SHARED_LABEL}=true"),
    "--filter",
    &format!("name=^{name}$"),
    "--filter",
    "status=running",
    "--format",
    "{{.ID}}",
  ])?;
  if !output.status.success() {
    return Err(failure("ps", &output));
  }
  Ok(
    String::from_utf8_lossy(&output.stdout)
      .lines()
      .map(str::trim)
      .find(|l| !l.is_empty())
      .map(str::to_owned),
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
