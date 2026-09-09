//! Per-workspace y-octo client id + the write lease that guards it.
//!
//! Every y-octo item carries a `(client, clock)` id, and every peer that ever wrote to a doc stays
//! in its state vector forever. A fresh `DocOptions::new()` mints a new random client id, so a
//! CLI that builds a new `Doc` per invocation adds one permanent state-vector entry per write: an
//! agent that edits a doc a thousand times leaves a thousand dead clients behind in every copy of
//! that doc, and every sync message afterwards carries them.
//!
//! The fix is to behave like one long-lived peer: one client id per workspace, persisted in
//! `affine-cli.client` next to `storage.db` and reused by every write. Clock continuation is
//! safe because y-octo's `DocStore::create_item` starts the clock at the loaded state for that
//! client and every CLI write loads the merged binary first.
//!
//! Reusing an id is only safe for one writer at a time: two processes that load the same base
//! and both create items as client `C` would mint colliding `(C, clock)` ids. So the id file
//! doubles as the lock: a mutating command holds an exclusive advisory `flock` on it for its
//! whole lifetime, and a second CLI process retries briefly and then fails with `"error":"busy"`
//! instead of blocking forever or corrupting the doc. Read-only commands never take the lease.
//!
//! ## How the id reaches the `Doc` constructors
//!
//! `doc_options()` is the single factory every production site uses instead of
//! `DocOptions::new()`. It reads a process-wide id that `WriteLease::acquire` publishes before
//! any `Doc` is built. A process-wide value is the right shape here: `affine-cli` runs exactly
//! one command against exactly one workspace per process, and the alternative - a `client_id`
//! parameter on every function in the vendored `doc_parser` and its `engine` wrappers - would
//! fork that code far from the upstream shape it is kept close to. Read-only commands never
//! publish an id; their docs fall back to a throwaway random one, which never reaches a state
//! vector because a read creates no items.

use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use y_octo::DocOptions;

use crate::error::CliError;
use crate::output;

/// Name of the client-id file inside a workspace directory (sibling of `storage.db`).
pub const CLIENT_FILE: &str = "affine-cli.client";

/// How often, and how many times, a mutating command retries the lock before `error:busy`.
/// 40 x 50ms = 2s: long enough that back-to-back agent invocations queue up transparently,
/// short enough that a wedged writer surfaces as a clear error rather than a hang.
pub const LOCK_RETRY_INTERVAL: Duration = Duration::from_millis(50);
pub const LOCK_RETRY_ATTEMPTS: u32 = 40;

/// The client id published by the current process's write lease, or `UNSET` on a read-only
/// command. `new_client_id` never mints `UNSET`, so it is an unambiguous sentinel.
static PROCESS_CLIENT_ID: AtomicU64 = AtomicU64::new(UNSET);

const UNSET: u64 = 0;

/// The `DocOptions` every production `Doc` in this crate is built from: the workspace's
/// persisted client id when a write lease is held, a throwaway random one otherwise.
pub fn doc_options() -> DocOptions {
    DocOptions::new().with_client_id(match PROCESS_CLIENT_ID.load(Ordering::Relaxed) {
        UNSET => new_client_id(),
        id => id,
    })
}

/// The client id published by this process's write lease, if it holds one.
pub fn current_client_id() -> Option<u64> {
    match PROCESS_CLIENT_ID.load(Ordering::Relaxed) {
        UNSET => None,
        id => Some(id),
    }
}

/// A held write lease: the workspace's CLI client id plus the exclusive lock on its file.
/// The lock is released when the lease is dropped (at the end of the command).
#[derive(Debug)]
pub struct WriteLease {
    client_id: u64,
    _file: File,
}

impl WriteLease {
    /// Lock the client-id file at `path` (creating it on first use) and read the client id out
    /// of it, generating one if the file is new. A file whose contents are not a `u64` is
    /// regenerated and a warning is attached to the command output.
    pub fn acquire(path: &Path) -> Result<Self, CliError> {
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(path)?;
        lock_with_retry(&file, path)?;

        let mut raw = String::new();
        file.read_to_string(&mut raw)?;
        let trimmed = raw.trim();
        // `UNSET` (0) is never minted, so a file holding it is as unusable as a malformed one.
        let client_id = match trimmed.parse::<u64>().ok().filter(|id| *id != UNSET) {
            Some(id) => id,
            None => {
                if !trimmed.is_empty() {
                    output::warn(format!(
                        "client id file {} was unreadable ({:?}); generated a new y-octo client id. Docs written \
                         with the old id keep it in their state vector",
                        path.display(),
                        truncate_for_log(trimmed),
                    ));
                }
                let id = new_client_id();
                file.set_len(0)?;
                file.seek(SeekFrom::Start(0))?;
                file.write_all(format!("{id}\n").as_bytes())?;
                file.sync_all()?;
                id
            }
        };
        PROCESS_CLIENT_ID.store(client_id, Ordering::Relaxed);
        Ok(WriteLease { client_id, _file: file })
    }

    /// The y-octo client id every write in this command must use.
    pub fn client_id(&self) -> u64 {
        self.client_id
    }
}

/// Mint a client id from the same skewed-small distribution y-octo uses for its own default.
///
/// y-octo's `prefer_small_random` (doc/utils.rs) draws an `Exp(1/65535)` sample and scales it by
/// 65535, which keeps most ids short in the varint encoding every item id is written with. It is
/// not re-exported from the crate root, so this reproduces it by inverse-CDF sampling
/// (`-65535^2 * ln(u)`) rather than pulling in `rand_distr`. `u` is clamped away from zero so the
/// logarithm stays finite, and the result is never `UNSET`.
fn new_client_id() -> u64 {
    const SCALE: f64 = u16::MAX as f64;
    let u: f64 = rand::random::<f64>().max(f64::MIN_POSITIVE);
    ((-SCALE * SCALE * u.ln()) as u64).max(1)
}

fn truncate_for_log(s: &str) -> String {
    const MAX: usize = 32;
    if s.chars().count() <= MAX {
        s.to_string()
    } else {
        format!("{}...", s.chars().take(MAX).collect::<String>())
    }
}

/// Take the exclusive advisory lock, retrying a bounded number of times, then fail with
/// `CliError::Busy`.
#[cfg(unix)]
fn lock_with_retry(file: &File, path: &Path) -> Result<(), CliError> {
    for attempt in 0..LOCK_RETRY_ATTEMPTS {
        if try_lock_exclusive(file)? {
            return Ok(());
        }
        if attempt + 1 < LOCK_RETRY_ATTEMPTS {
            std::thread::sleep(LOCK_RETRY_INTERVAL);
        }
    }
    Err(CliError::Busy(format!(
        "another affine-cli process is writing to this workspace (lock on {} still held after {:?}); \
         retry when it finishes",
        path.display(),
        LOCK_RETRY_INTERVAL * LOCK_RETRY_ATTEMPTS
    )))
}

/// `flock(LOCK_EX | LOCK_NB)`: `Ok(true)` when acquired, `Ok(false)` when another open file
/// description holds it. BSD `flock` locks are per open file description, so a second `open` of
/// the same path conflicts even inside one process, which is what lets the tests exercise it.
#[cfg(unix)]
fn try_lock_exclusive(file: &File) -> Result<bool, CliError> {
    use std::os::fd::AsRawFd;
    let rc = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
    if rc == 0 {
        return Ok(true);
    }
    let err = std::io::Error::last_os_error();
    match err.raw_os_error() {
        Some(code) if code == libc::EWOULDBLOCK || code == libc::EAGAIN => Ok(false),
        Some(libc::EINTR) => Ok(false),
        _ => Err(CliError::Io(err)),
    }
}

/// Non-unix (Windows) fallback: no advisory lock is taken, so two concurrent CLI writers could
/// mint colliding item ids. Mirrors `store::InUseProbe::Unsupported`: the write proceeds and the
/// JSON output carries a warning; `error:busy` never fires on this platform.
#[cfg(not(unix))]
fn lock_with_retry(_file: &File, _path: &Path) -> Result<(), CliError> {
    output::warn(
        "the workspace write lock is not implemented on this platform; do not run two affine-cli \
         writes against the same workspace at once",
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "affine-cli-lease-{tag}-{}-{}",
            std::process::id(),
            nanoid::nanoid!(6)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(CLIENT_FILE)
    }

    #[test]
    fn first_acquire_creates_id_and_second_reuses_it() {
        let path = temp_file("reuse");
        let first = WriteLease::acquire(&path).unwrap().client_id();
        let on_disk: u64 = std::fs::read_to_string(&path).unwrap().trim().parse().unwrap();
        assert_eq!(first, on_disk);
        let second = WriteLease::acquire(&path).unwrap().client_id();
        assert_eq!(first, second);
    }

    #[test]
    fn malformed_file_is_regenerated_with_a_warning() {
        let path = temp_file("malformed");
        std::fs::write(&path, "not-a-number\n").unwrap();
        let _ = output::take_warnings();
        let lease = WriteLease::acquire(&path).unwrap();
        let on_disk: u64 = std::fs::read_to_string(&path).unwrap().trim().parse().unwrap();
        assert_eq!(lease.client_id(), on_disk);
        let warnings = output::take_warnings();
        assert!(
            warnings
                .iter()
                .any(|w| w.contains("client id file") && w.contains("not-a-number")),
            "expected a regeneration warning, got {warnings:?}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn held_lock_makes_second_acquire_busy() {
        let path = temp_file("busy");
        let held = WriteLease::acquire(&path).unwrap();
        let err = WriteLease::acquire(&path).expect_err("second lease must not be granted");
        assert_eq!(err.code(), "busy");
        drop(held);
        WriteLease::acquire(&path).expect("lease is free again after drop");
    }
}
