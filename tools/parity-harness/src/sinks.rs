use anyhow::{Context, Result, bail, ensure};
use futures_util::StreamExt;
use mailparse::MailHeaderMap;
use serde_json::{Value, json};
use std::{
    net::SocketAddr,
    sync::{
        Arc,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::{TcpListener, TcpStream},
    sync::{Mutex, Notify, watch},
    task::JoinHandle,
};

pub const CHANNELS: [&str; 2] = [
    "affine:backend-runtime:invalidation:v1",
    "affine:eventbus:v1",
];

pub struct SmtpSink {
    pub address: SocketAddr,
    mails: Arc<Mutex<Vec<Value>>>,
    errors: Arc<Mutex<Vec<String>>>,
    active: Arc<AtomicUsize>,
    changed: Arc<Notify>,
    task: JoinHandle<()>,
}
impl SmtpSink {
    pub async fn bind(address: &str) -> Result<Self> {
        let listener = TcpListener::bind(address).await?;
        let address = listener.local_addr()?;
        let mails = Arc::new(Mutex::new(Vec::new()));
        let errors = Arc::new(Mutex::new(Vec::new()));
        let active = Arc::new(AtomicUsize::new(0));
        let changed = Arc::new(Notify::new());
        let inflight = active.clone();
        let activity = changed.clone();
        let captured = mails.clone();
        let failures = errors.clone();
        let task = tokio::spawn(async move {
            let mut connections = tokio::task::JoinSet::new();
            loop {
                tokio::select! {
                    accepted=listener.accept()=>match accepted {
                        Ok((stream,_))=>{
                            let captured=captured.clone();let changed=activity.clone();
                            inflight.fetch_add(1,Ordering::SeqCst);
                            connections.spawn(async move {smtp_connection(stream,&captured,&changed).await});
                        }
                        Err(e)=>{failures.lock().await.push(e.to_string());break;}
                    },
                    completed=connections.join_next(), if !connections.is_empty()=>{
                        match completed.expect("nonempty connection set") {
                            Ok(Ok(()))=>{},
                            Ok(Err(e))=>failures.lock().await.push(e.to_string()),
                            Err(e)=>failures.lock().await.push(e.to_string()),
                        }
                        inflight.fetch_sub(1,Ordering::SeqCst);activity.notify_waiters();
                    }
                }
            }
        });
        Ok(Self {
            address,
            mails,
            errors,
            active,
            changed,
            task,
        })
    }
    pub async fn snapshot(
        &self,
        expected: Option<usize>,
        timeout: std::time::Duration,
    ) -> Result<Value> {
        let deadline = tokio::time::Instant::now() + timeout;
        loop {
            let changed = self.changed.notified();
            let complete = self.active.load(Ordering::SeqCst) == 0;
            let count = self.mails.lock().await.len();
            if complete && expected.is_none_or(|n| count >= n) {
                break;
            }
            if tokio::time::timeout_at(deadline, changed).await.is_err() {
                break;
            }
        }
        ensure!(
            self.active.load(Ordering::SeqCst) == 0,
            "SMTP connections still in flight at capture deadline"
        );
        let errors = self.errors.lock().await.clone();
        ensure!(errors.is_empty(), "SMTP capture errors: {errors:?}");
        Ok(json!(self.mails.lock().await.clone()))
    }
}
impl Drop for SmtpSink {
    fn drop(&mut self) {
        self.task.abort();
    }
}
fn envelope_address(input: &str) -> Result<String> {
    let input = input.trim();
    if let Some(rest) = input.strip_prefix('<') {
        return Ok(rest
            .split_once('>')
            .context("SMTP envelope missing >")?
            .0
            .trim()
            .to_owned());
    }
    Ok(input.split_whitespace().next().unwrap_or("").to_owned())
}
async fn smtp_connection(
    stream: TcpStream,
    mails: &Arc<Mutex<Vec<Value>>>,
    changed: &Notify,
) -> Result<()> {
    let (read, mut write) = stream.into_split();
    let mut read = BufReader::new(read);
    write.write_all(b"220 parity-harness ESMTP\r\n").await?;
    let mut from = String::new();
    let mut recipients = Vec::new();
    loop {
        let mut line = String::new();
        if read.read_line(&mut line).await? == 0 {
            return Ok(());
        }
        ensure!(line.len() <= 65536, "SMTP command too long");
        let command = line.trim_end_matches(['\r', '\n']);
        let upper = command.to_ascii_uppercase();
        let reply = if upper.starts_with("EHLO") {
            "250-parity-harness\r\n250 SIZE 10485760\r\n"
        } else if upper.starts_with("HELO") || upper == "NOOP" {
            "250 OK\r\n"
        } else if upper.starts_with("MAIL FROM:") {
            from = envelope_address(&command[10..])?;
            recipients.clear();
            "250 OK\r\n"
        } else if upper.starts_with("RCPT TO:") {
            recipients.push(envelope_address(&command[8..])?);
            "250 OK\r\n"
        } else if upper == "RSET" {
            from.clear();
            recipients.clear();
            "250 OK\r\n"
        } else if upper == "DATA" {
            write
                .write_all(b"354 End data with <CRLF>.<CRLF>\r\n")
                .await?;
            let mut bytes = Vec::new();
            loop {
                let mut line = Vec::new();
                ensure!(
                    read.read_until(b'\n', &mut line).await? > 0,
                    "SMTP EOF in DATA"
                );
                if line == b".\r\n" || line == b".\n" {
                    break;
                }
                if line.starts_with(b"..") {
                    line.remove(0);
                }
                bytes.extend(line);
                ensure!(bytes.len() <= 10 * 1024 * 1024, "SMTP DATA exceeds 10MiB");
            }
            let parsed = mailparse::parse_mail(&bytes)?;
            fn parts_of(mail: &mailparse::ParsedMail<'_>, mime: &str) -> Result<Vec<String>> {
                let mut parts = Vec::new();
                if mail.ctype.mimetype == mime {
                    parts.push(mail.get_body()?);
                }
                for sub in &mail.subparts {
                    parts.extend(parts_of(sub, mime)?);
                }
                Ok(parts)
            }
            let message = json!({"from":from,"recipients":recipients,"subject":parsed.headers.get_first_value("Subject"),"html":parts_of(&parsed,"text/html")?,"text":parts_of(&parsed,"text/plain")?});
            mails.lock().await.push(message);
            changed.notify_waiters();
            from.clear();
            recipients.clear();
            "250 queued\r\n"
        } else if upper == "QUIT" {
            write.write_all(b"221 Bye\r\n").await?;
            return Ok(());
        } else {
            "502 Unsupported command\r\n"
        };
        write.write_all(reply.as_bytes()).await?;
    }
}

static REDIS_DRAIN_CHANNEL: AtomicU64 = AtomicU64::new(1);
pub struct RedisSink {
    client: redis::Client,
    drain_channel: String,
    next_drain: AtomicU64,
    drained: watch::Receiver<(u64, Vec<Value>)>,
    task: JoinHandle<Result<()>>,
}
impl RedisSink {
    pub async fn subscribe(url: &str) -> Result<Self> {
        let client = redis::Client::open(url)?;
        let mut subscription = client.get_async_pubsub().await?;
        // Await SUBSCRIBE acknowledgements before any scenario action can publish.
        for channel in CHANNELS {
            subscription.subscribe(channel).await?;
        }
        let drain_channel = format!(
            "parity-harness:drain:{}:{}",
            std::process::id(),
            REDIS_DRAIN_CHANNEL.fetch_add(1, Ordering::Relaxed)
        );
        subscription.subscribe(&drain_channel).await?;
        let observed_drain_channel = drain_channel.clone();
        let (drain_finished, drained) = watch::channel((0, Vec::new()));
        let task = tokio::spawn(async move {
            let mut events = Vec::new();
            let mut messages = subscription.on_message();
            while let Some(message) = messages.next().await {
                if message.get_channel_name() == observed_drain_channel {
                    let sequence: u64 = message.get_payload()?;
                    drain_finished.send_if_modified(|seen| {
                        if sequence > seen.0 {
                            *seen = (sequence, events.clone());
                            true
                        } else {
                            false
                        }
                    });
                    continue;
                }
                let payload: String = message.get_payload()?;
                let payload = crate::tagged_json_payload(&payload, "invalid_json");
                events.push(json!({"channel":message.get_channel_name(),"payload":payload}));
            }
            bail!("Redis Pub/Sub connection ended before capture finished")
        });
        Ok(Self {
            client,
            drain_channel,
            next_drain: AtomicU64::new(1),
            drained,
            task,
        })
    }
    pub async fn snapshot(&self) -> Result<Value> {
        ensure!(
            !self.task.is_finished(),
            "Redis capture task stopped unexpectedly"
        );
        // A PUBLISH acknowledgement only proves acceptance by Redis. Fence the
        // subscribed stream itself so its preceding business messages have been
        // decoded and stored, regardless of TCP batching or scheduler latency.
        let sequence = self.next_drain.fetch_add(1, Ordering::Relaxed);
        let mut drained = self.drained.clone();
        let mut publisher = self.client.get_multiplexed_async_connection().await?;
        let _: i64 = redis::cmd("PUBLISH")
            .arg(&self.drain_channel)
            .arg(sequence)
            .query_async(&mut publisher)
            .await?;
        while drained.borrow_and_update().0 < sequence {
            drained
                .changed()
                .await
                .context("Redis capture stopped before drain acknowledgement")?;
        }
        Ok(json!(drained.borrow().1.clone()))
    }
}
impl Drop for RedisSink {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// A read-only, repeatable-read transaction gives each side a coherent terminal
/// snapshot. Never writes, migrates, or truncates either supplied database.
struct PgConnectionTask(JoinHandle<std::result::Result<(), tokio_postgres::Error>>);
impl Drop for PgConnectionTask {
    fn drop(&mut self) {
        self.0.abort();
    }
}
pub async fn postgres_snapshot(url: &str, ignore_tables: &[String]) -> Result<Value> {
    let (mut client, connection) = tokio_postgres::connect(url, tokio_postgres::NoTls).await?;
    let _connection = PgConnectionTask(tokio::spawn(connection));
    let transaction = client
        .build_transaction()
        .isolation_level(tokio_postgres::IsolationLevel::RepeatableRead)
        .read_only(true)
        .start()
        .await?;
    let tables=transaction.query("SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_toast%' ORDER BY schemaname, tablename",&[]).await?;
    let mut result = serde_json::Map::new();
    for table in tables {
        let schema: String = table.get(0);
        let name: String = table.get(1);
        if ignore_tables
            .iter()
            .any(|ignored| ignored == &name || ignored == &format!("{schema}.{name}"))
        {
            continue;
        }
        let quote = |s: &str| format!("\"{}\"", s.replace('"', "\"\""));
        let query = format!(
            "SELECT to_jsonb(t) FROM {}.{} AS t",
            quote(&schema),
            quote(&name)
        );
        let rows = transaction
            .query(&query, &[])
            .await
            .with_context(|| format!("snapshot {schema}.{name}"))?;
        result.insert(
            format!("{schema}.{name}"),
            json!(
                rows.iter()
                    .map(|r| r.get::<_, Value>(0))
                    .collect::<Vec<_>>()
            ),
        );
    }
    transaction.commit().await?;
    Ok(Value::Object(result))
}

#[cfg(test)]
mod smtp_contract_tests {
    use super::*;
    #[test]
    fn canonicalizes_esmtp_envelopes_without_extension_parameters() {
        assert_eq!(
            envelope_address(" <a@example.test> SIZE=1234 BODY=8BITMIME").unwrap(),
            "a@example.test"
        );
        assert_eq!(
            envelope_address("a@example.test").unwrap(),
            "a@example.test"
        );
        assert_eq!(envelope_address("<> SIZE=10").unwrap(), "");
    }
}
