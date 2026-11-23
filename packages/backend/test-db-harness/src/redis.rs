//! Test Redis: an explicit URL isolated by a per-run key prefix, or a
//! disposable container on a random loopback port.

use std::{
  io::{BufRead, BufReader, Read, Write},
  net::TcpStream,
  time::{Duration, Instant},
};

use crate::{Container, Error, Result, process_run_id};

/// Pinned by digest (multi-arch index) so every machine runs the same image.
pub const REDIS_IMAGE: &str =
  "docker.io/library/redis:7-alpine@sha256:7f7d30b7fdd09467bac58198a1f166dd69789d348d4fe859cccb20e0cf287fbe";
pub const REDIS_URL_ENV: &str = "AFFINE_TEST_REDIS_URL";
const READY_TIMEOUT: Duration = Duration::from_secs(30);
const IO_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug)]
pub struct TestRedis {
  url: String,
  key_prefix: String,
  container: Option<Container>,
}

impl TestRedis {
  /// Reuses `AFFINE_TEST_REDIS_URL` when set, otherwise starts a container.
  pub fn from_env_or_docker() -> Result<Self> {
    match std::env::var(REDIS_URL_ENV) {
      Ok(url) if !url.trim().is_empty() => Self::attach(&url),
      _ => Self::start_docker(),
    }
  }

  /// Uses a shared Redis; every key this run writes must start with
  /// [`TestRedis::key_prefix`].
  pub fn attach(url: &str) -> Result<Self> {
    let redis = Self {
      url: url.to_owned(),
      key_prefix: format!("test:{}:", process_run_id()),
      container: None,
    };
    redis.connect()?.ping()?;
    Ok(redis)
  }

  /// Runs `docker run -d --rm -p 127.0.0.1::6379 redis:7-alpine` without
  /// persistence and waits until it answers PING.
  pub fn start_docker() -> Result<Self> {
    let container = Container::run(
      REDIS_IMAGE,
      6379,
      &[],
      &["redis-server", "--save", "", "--appendonly", "no"],
    )?;
    let redis = Self {
      url: format!("redis://{}", container.addr()),
      key_prefix: format!("test:{}:", process_run_id()),
      container: Some(container),
    };
    let deadline = Instant::now() + READY_TIMEOUT;
    loop {
      match redis.connect().and_then(|mut c| c.ping()) {
        Ok(()) => return Ok(redis),
        Err(e) if Instant::now() >= deadline => {
          return Err(Error::new(format!("redis at {} not ready: {e}", redis.url)));
        }
        Err(_) => std::thread::sleep(Duration::from_millis(50)),
      }
    }
  }

  pub fn url(&self) -> &str {
    &self.url
  }

  pub fn key_prefix(&self) -> &str {
    &self.key_prefix
  }

  /// Keeps a harness-started container running after drop; returns its id.
  pub fn detach_container(&mut self) -> Option<String> {
    self.container.take().map(Container::detach)
  }

  pub fn connect(&self) -> Result<RedisConn> {
    RedisConn::open(&self.url)
  }
}

/// Reply of the RESP2 protocol.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Reply {
  Status(String),
  Int(i64),
  Bulk(Option<Vec<u8>>),
  Array(Option<Vec<Reply>>),
}

/// Minimal blocking RESP2 client, enough for readiness and isolation checks.
pub struct RedisConn {
  reader: BufReader<TcpStream>,
}

impl RedisConn {
  /// Opens `redis://[[user]:password@]host:port[/db]`.
  pub fn open(url: &str) -> Result<Self> {
    let target = parse_url(url)?;
    let stream = TcpStream::connect(&target.addr)?;
    stream.set_read_timeout(Some(IO_TIMEOUT))?;
    stream.set_write_timeout(Some(IO_TIMEOUT))?;
    let mut conn = Self {
      reader: BufReader::new(stream),
    };
    if let Some(password) = &target.password {
      match &target.user {
        Some(user) => conn.cmd(&["AUTH", user, password])?,
        None => conn.cmd(&["AUTH", password])?,
      };
    }
    if let Some(db) = target.db {
      conn.cmd(&["SELECT", &db.to_string()])?;
    }
    Ok(conn)
  }

  pub fn ping(&mut self) -> Result<()> {
    match self.cmd(&["PING"])? {
      Reply::Status(s) if s == "PONG" => Ok(()),
      other => Err(Error::new(format!("unexpected PING reply {other:?}"))),
    }
  }

  /// Sends one command; a Redis error reply becomes `Err`.
  pub fn cmd(&mut self, args: &[&str]) -> Result<Reply> {
    let mut frame = format!("*{}\r\n", args.len()).into_bytes();
    for arg in args {
      frame.extend_from_slice(format!("${}\r\n", arg.len()).as_bytes());
      frame.extend_from_slice(arg.as_bytes());
      frame.extend_from_slice(b"\r\n");
    }
    self.reader.get_mut().write_all(&frame)?;
    self.read_reply()
  }

  fn read_reply(&mut self) -> Result<Reply> {
    let mut line = String::new();
    if self.reader.read_line(&mut line)? == 0 {
      return Err(Error::new("redis closed the connection"));
    }
    let line = line.trim_end_matches(['\r', '\n']);
    let (kind, body) = line.split_at(line.len().min(1));
    let int = |s: &str| {
      s.parse::<i64>()
        .map_err(|_| Error::new(format!("bad RESP integer {s:?}")))
    };
    match kind {
      "+" => Ok(Reply::Status(body.to_owned())),
      "-" => Err(Error::new(format!("redis: {body}"))),
      ":" => Ok(Reply::Int(int(body)?)),
      "$" => match int(body)? {
        n if n < 0 => Ok(Reply::Bulk(None)),
        n => {
          let mut buf = vec![0; n as usize + 2];
          self.reader.read_exact(&mut buf)?;
          buf.truncate(n as usize);
          Ok(Reply::Bulk(Some(buf)))
        }
      },
      "*" => match int(body)? {
        n if n < 0 => Ok(Reply::Array(None)),
        n => (0..n)
          .map(|_| self.read_reply())
          .collect::<Result<Vec<_>>>()
          .map(|items| Reply::Array(Some(items))),
      },
      _ => Err(Error::new(format!("bad RESP line {line:?}"))),
    }
  }
}

#[derive(Debug, Eq, PartialEq)]
struct RedisTarget {
  addr: String,
  user: Option<String>,
  password: Option<String>,
  db: Option<u32>,
}

fn parse_url(url: &str) -> Result<RedisTarget> {
  let rest = url
    .strip_prefix("redis://")
    .ok_or_else(|| Error::new(format!("expected a redis:// URL, got {url:?}")))?;
  let (auth, host_path) = match rest.rfind('@') {
    Some(at) => (Some(&rest[..at]), &rest[at + 1..]),
    None => (None, rest),
  };
  let (host, path) = host_path.split_once('/').unwrap_or((host_path, ""));
  let path = path.split('?').next().unwrap_or("");
  let (user, password) = match auth {
    None => (None, None),
    Some(a) => match a.split_once(':') {
      Some((u, p)) => ((!u.is_empty()).then(|| u.to_owned()), Some(p.to_owned())),
      None => (None, Some(a.to_owned())),
    },
  };
  let db = match path {
    "" => None,
    n => Some(n.parse().map_err(|_| Error::new(format!("bad redis db index {n:?}")))?),
  };
  let addr = if host.contains(':') {
    host.to_owned()
  } else {
    format!("{host}:6379")
  };
  Ok(RedisTarget {
    addr,
    user,
    password,
    db,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parse_url_cases() {
    let t = |addr: &str, user: Option<&str>, password: Option<&str>, db: Option<u32>| RedisTarget {
      addr: addr.to_owned(),
      user: user.map(str::to_owned),
      password: password.map(str::to_owned),
      db,
    };
    let cases = [
      ("redis://127.0.0.1:6380", t("127.0.0.1:6380", None, None, None)),
      ("redis://localhost", t("localhost:6379", None, None, None)),
      ("redis://:pw@h:1/3", t("h:1", None, Some("pw"), Some(3))),
      ("redis://u:pw@h:1/0?x=y", t("h:1", Some("u"), Some("pw"), Some(0))),
    ];
    for (url, expected) in cases {
      assert_eq!(parse_url(url).unwrap(), expected, "{url}");
    }
    for bad in ["http://h", "redis://h/notanumber"] {
      assert!(parse_url(bad).is_err(), "{bad}");
    }
  }
}
