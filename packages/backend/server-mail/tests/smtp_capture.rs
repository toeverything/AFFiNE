//! Delivers the test mail to a local plaintext SMTP capture server (the same
//! protocol handling and MIME parsing as `tools/parity-harness`) and compares
//! the captured envelope, subject and MIME parts with the recorded `v0.27.5`
//! fixture; a permanent RCPT rejection is classified like the reference.

use std::{path::PathBuf, sync::Arc};

use mailparse::MailHeaderMap;
use server_mail::{MailSendResult, MailTemplate, SmtpConfig, SmtpMailer};
use tokio::{
  io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
  net::TcpListener,
  sync::Mutex,
};

fn envelope_address(input: &str) -> String {
  let input = input.trim();
  match input.strip_prefix('<') {
    Some(rest) => rest.split_once('>').expect("envelope >").0.trim().to_owned(),
    None => input.split_whitespace().next().unwrap_or("").to_owned(),
  }
}

/// Accepts connections until the test ends; `rcpt_reply` answers every RCPT.
async fn capture_server(rcpt_reply: &'static str) -> (u16, Arc<Mutex<Vec<serde_json::Value>>>) {
  let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
  let port = listener.local_addr().unwrap().port();
  let mails = Arc::new(Mutex::new(Vec::new()));
  let captured = Arc::clone(&mails);
  tokio::spawn(async move {
    loop {
      let (stream, _) = listener.accept().await.unwrap();
      let captured = Arc::clone(&captured);
      tokio::spawn(async move {
        let (read, mut write) = stream.into_split();
        let mut read = BufReader::new(read);
        write.write_all(b"220 capture ESMTP\r\n").await.unwrap();
        let (mut from, mut recipients) = (String::new(), Vec::new());
        loop {
          let mut line = String::new();
          if read.read_line(&mut line).await.unwrap() == 0 {
            return;
          }
          let command = line.trim_end_matches(['\r', '\n']);
          let upper = command.to_ascii_uppercase();
          let reply = if upper.starts_with("EHLO") {
            "250-capture\r\n250 SIZE 10485760\r\n"
          } else if upper.starts_with("MAIL FROM:") {
            from = envelope_address(&command[10..]);
            "250 OK\r\n"
          } else if upper.starts_with("RCPT TO:") {
            recipients.push(envelope_address(&command[8..]));
            rcpt_reply
          } else if upper == "DATA" {
            write.write_all(b"354 End data with <CRLF>.<CRLF>\r\n").await.unwrap();
            let mut bytes = Vec::new();
            loop {
              let mut line = Vec::new();
              assert!(read.read_until(b'\n', &mut line).await.unwrap() > 0, "EOF in DATA");
              if line == b".\r\n" {
                break;
              }
              if line.starts_with(b"..") {
                line.remove(0);
              }
              bytes.extend(line);
            }
            let parsed = mailparse::parse_mail(&bytes).unwrap();
            let parts = |mime: &str| -> Vec<String> {
              std::iter::once(&parsed)
                .chain(parsed.subparts.iter())
                .filter(|part| part.ctype.mimetype == mime)
                .map(|part| part.get_body().unwrap())
                .collect()
            };
            captured.lock().await.push(serde_json::json!({
              "from": from,
              "recipients": recipients,
              "subject": parsed.headers.get_first_value("Subject"),
              "html": parts("text/html"),
              "text": parts("text/plain"),
            }));
            "250 queued\r\n"
          } else if upper == "QUIT" {
            write.write_all(b"221 Bye\r\n").await.unwrap();
            return;
          } else if upper.starts_with("RSET") || upper == "NOOP" {
            "250 OK\r\n"
          } else {
            "502 Unsupported command\r\n"
          };
          write.write_all(reply.as_bytes()).await.unwrap();
        }
      });
    }
  });
  (port, mails)
}

fn mailer(port: u16) -> SmtpMailer {
  SmtpMailer::new(&SmtpConfig {
    name: "parity.local".into(),
    host: "127.0.0.1".into(),
    port,
    sender: "AFFiNE Parity <noreply@affine.test>".into(),
    ..SmtpConfig::default()
  })
  .expect("plaintext local mailer")
}

#[tokio::test]
async fn plaintext_test_mail_capture_matches_recorded_v0275_smtp_effect() {
  let fixture: serde_json::Value = serde_json::from_str(
    &std::fs::read_to_string(
      PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../tools/parity-harness/tests/fixtures/v0275-self-parity.recorded.json"),
    )
    .unwrap(),
  )
  .unwrap();
  let recorded = &fixture["left"]["effects"]["smtp"];

  let (port, mails) = capture_server("250 OK\r\n").await;
  let mailer = mailer(port);
  assert!(mailer.verify().await.expect("verify plaintext server"));
  let mail = MailTemplate::TestMail(Default::default()).render_with_year(2026);
  match mailer.send("parity-admin@affine.test", &mail).await {
    MailSendResult::Accepted {
      message_id,
      provider_response,
    } => {
      assert!(message_id.starts_with('<') && message_id.ends_with('>'));
      assert_eq!(provider_response, "250 queued");
    }
    other => panic!("expected Accepted, got {other:?}"),
  }
  assert_eq!(serde_json::Value::Array(mails.lock().await.clone()), *recorded);
}

#[tokio::test]
async fn rejected_and_malformed_recipients_are_classified_like_reference() {
  let (port, mails) = capture_server("550 no such user\r\n").await;
  let mailer = mailer(port);
  let mail = MailTemplate::TestMail(Default::default()).render_with_year(2026);
  match mailer.send("missing@affine.test", &mail).await {
    MailSendResult::Rejected {
      error_code: "provider_rejected",
      provider_response: Some(response),
    } => assert!(response.contains("no such user"), "{response}"),
    other => panic!("expected provider rejection, got {other:?}"),
  }
  for to in ["no-at-sign", "a@b@c", "trailing@"] {
    assert_eq!(
      mailer.send(to, &mail).await,
      MailSendResult::Rejected {
        provider_response: None,
        error_code: "invalid_recipient"
      },
      "{to}"
    );
  }
  assert!(mails.lock().await.is_empty());
}
