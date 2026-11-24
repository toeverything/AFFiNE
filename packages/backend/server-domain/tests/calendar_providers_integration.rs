use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use server_domain::calendar::caldav::{CaldavCalendarProvider, CalendarCaldavConfig};
use server_domain::calendar::crypto::{decrypt_token, encrypt_token};
use server_domain::calendar::google::encode_path_segment;
use server_domain::calendar::ical::{offset_at_utc_guess, parse_ical_events, try_parse_ical_events};
use server_domain::calendar::oauth::{CalendarOAuthState, CalendarOAuthStore, is_valid_oauth_state};
use server_domain::calendar::{CalendarAccountRecord, CalendarProviderName};
use test_db_harness::redis::TestRedis;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

fn test_runtime() -> tokio::runtime::Runtime {
  tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .expect("build tokio runtime")
}

#[test]
fn calendar_oauth_state_roundtrip_and_single_use_redemption_in_session_redis() {
  let rt = test_runtime();
  rt.block_on(async {
    let redis = TestRedis::from_env_or_docker().expect("test redis");
    let client = redis::Client::open(redis.url()).expect("open redis client");
    let store = CalendarOAuthStore::new(Some(client.clone()), 2).expect("oauth store");

    let token = store
      .save_oauth_state(CalendarOAuthState {
        provider: CalendarProviderName::Google,
        user_id: "user-123".to_owned(),
        redirect_uri: Some("https://app.example.com/calendar".to_owned()),
        token: None,
      })
      .await
      .expect("save oauth state");
    assert!(is_valid_oauth_state(&token));

    // Verify exact Redis key name in DB 2.
    let mut info = client.get_connection_info().clone();
    info.redis.db = 2;
    let db2_client = redis::Client::open(info).expect("db2 client");
    let mut conn = db2_client.get_multiplexed_async_connection().await.expect("db2 conn");
    let raw: Option<String> = redis::cmd("GET")
      .arg(format!("CALENDAR_OAUTH_STATE:{token}"))
      .query_async(&mut conn)
      .await
      .expect("raw redis get");
    assert!(raw.is_some(), "expected CALENDAR_OAUTH_STATE:<UUID> in DB 2");

    // First consume returns state; second consume returns None (single-use redemption).
    let consumed = store
      .consume_oauth_state(&token)
      .await
      .expect("consume")
      .expect("state present");
    assert_eq!(consumed.provider, CalendarProviderName::Google);
    assert_eq!(consumed.user_id, "user-123");
    assert_eq!(consumed.token.as_deref(), Some(token.as_str()));

    let second = store.consume_oauth_state(&token).await.expect("second consume");
    assert!(second.is_none());
  });
}

#[test]
fn calendar_token_encryption_wire_format_and_tamper_rejection() {
  let key = "calendar-provider-secret";
  let encrypted = encrypt_token(key, "refresh-token-1").expect("encrypt");
  let raw = BASE64_STANDARD.decode(&encrypted).expect("base64");
  assert_eq!(raw.len(), 12 + 12 + "refresh-token-1".len());
  assert_eq!(decrypt_token(key, &encrypted).expect("decrypt"), "refresh-token-1");
  assert!(decrypt_token("wrong-key", &encrypted).is_err());

  let mut tampered = raw;
  tampered[12] ^= 0xff;
  assert!(decrypt_token(key, &BASE64_STANDARD.encode(tampered)).is_err());

  // Cross-language Node.js CryptoHelper frozen vector (IV(12) || TAG(12) || CIPHERTEXT).
  let node_ciphertext = "AQIDBAUGBwgJCgsMdQy7oF6QtE9r5H9JyKd196EPp0/msOUUdFsgoc4mgJvMyuSmxw==";
  assert_eq!(
    decrypt_token("node-cross-lang-key-v0275", node_ciphertext).expect("decrypt node vector"),
    "ya29.node-generated-token"
  );
  assert!(encrypt_token("", "secret").is_err());
  assert!(decrypt_token("", node_ciphertext).is_err());
  assert!(decrypt_token(key, &BASE64_STANDARD.encode([0u8; 23])).is_err());

  // Reverse + bidirectional check executing the real frozen v0.27.5 server/src/base/helpers/crypto.ts source.
  let pem_output = std::process::Command::new("node")
    .args([
      "-e",
      "const { generateKeyPairSync } = require('node:crypto'); process.stdout.write(generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }));",
    ])
    .output()
    .expect("generate ephemeral EC PEM via node");
  assert!(pem_output.status.success(), "node pem gen failed");
  let pem_key = String::from_utf8(pem_output.stdout).expect("utf8 pem");
  let rust_ct = encrypt_token(&pem_key, "rust-generated-token").expect("rust encrypt");
  let crypto_ts_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("../server/src/base/helpers/crypto.ts")
    .canonicalize()
    .expect("resolve frozen crypto.ts");
  let node_script = r#"
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const [cryptoTsPath, pemKey, rustCt] = process.argv.slice(1);
let src = fs.readFileSync(cryptoTsPath, 'utf8');
src = src
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*'node:crypto';\s*/g, "const { createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey, createSign, createVerify, generateKeyPairSync, randomBytes, randomInt, sign, timingSafeEqual, verify } = require('node:crypto');\n")
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*'@nestjs\/common';\s*/g, '')
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*'@node-rs\/argon2';\s*/g, 'const hashPassword = async () => "";\n')
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\.\/\.\.\/native';\s*/g, 'const AFFINE_PRO_PUBLIC_KEY = null;\n')
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\.\/event';\s*/g, '')
  .replace(/^\s*@(?:Injectable|Inject|OnEvent)\([^)]*\)\s*$/gm, '')
  .replace(/export\s+class\s+CryptoHelper\s+implements\s+OnModuleInit/, 'class CryptoHelper');
const stripped = stripTypeScriptTypes(src, { mode: 'transform' })
  .replace(/\bexport\s+const\s+/g, 'const ');
const mod = { exports: {} };
const fn = vm.runInThisContext(`(function(require, module, exports) { ${stripped}\n module.exports = CryptoHelper; })`);
fn(require, mod, mod.exports);
const CryptoHelper = mod.exports;
const helper = new CryptoHelper({ nodeCryptoPrivateKey: () => pemKey });
helper.onConfigInit();
const dec = helper.decrypt(rustCt);
if (dec !== 'rust-generated-token') {
  throw new Error('unexpected decrypted text: ' + dec);
}
process.stdout.write(helper.encrypt('node-generated-from-real-crypto-ts'));
"#;
  let output = std::process::Command::new("node")
    .args(["-e", node_script, crypto_ts_path.to_str().unwrap(), &pem_key, &rust_ct])
    .output()
    .expect("run real crypto.ts CryptoHelper via node");
  assert!(
    output.status.success(),
    "real crypto.ts execution failed: {}",
    String::from_utf8_lossy(&output.stderr)
  );
  let node_ct = String::from_utf8(output.stdout).expect("utf8 node ciphertext");
  assert_eq!(
    decrypt_token(&pem_key, &node_ct).expect("rust decrypt real CryptoHelper.encrypt"),
    "node-generated-from-real-crypto-ts"
  );
}

#[test]
fn calendar_oauth_store_recovers_after_redis_connection_drop() {
  let rt = test_runtime();
  rt.block_on(async {
    let redis = TestRedis::from_env_or_docker().expect("test redis");
    let parsed = url::Url::parse(redis.url()).expect("parse redis url");
    let upstream_host = parsed.host_str().unwrap_or("127.0.0.1").to_owned();
    let upstream_port = parsed.port().unwrap_or(6379);
    let upstream_addr = format!("{upstream_host}:{upstream_port}");

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.expect("bind proxy");
    let proxy_addr = listener.local_addr().expect("proxy addr");
    let (drop_tx, drop_rx) = tokio::sync::oneshot::channel::<()>();
    let (closed_tx, closed_rx) = tokio::sync::oneshot::channel::<()>();

    let accept_task = tokio::spawn(async move {
      let mut drop_rx_opt = Some(drop_rx);
      let mut closed_tx_opt = Some(closed_tx);
      while let Ok((mut client_stream, _)) = listener.accept().await {
        let upstream = upstream_addr.clone();
        let drop_once = drop_rx_opt.take();
        let closed_once = closed_tx_opt.take();
        tokio::spawn(async move {
          if let Ok(mut server_stream) = tokio::net::TcpStream::connect(&upstream).await {
            if let Some(rx) = drop_once {
              tokio::select! {
                _ = tokio::io::copy_bidirectional(&mut client_stream, &mut server_stream) => {}
                _ = rx => {}
              }
              drop(client_stream);
              drop(server_stream);
              if let Some(tx) = closed_once {
                let _ = tx.send(());
              }
            } else {
              let _ = tokio::io::copy_bidirectional(&mut client_stream, &mut server_stream).await;
            }
          }
        });
      }
    });

    let mut proxy_url = parsed.clone();
    proxy_url.set_host(Some("127.0.0.1")).expect("set proxy host");
    proxy_url.set_port(Some(proxy_addr.port())).expect("set proxy port");
    let client = redis::Client::open(proxy_url.as_str()).expect("open proxy redis client");
    let store = CalendarOAuthStore::new(Some(client), 2).expect("oauth store");

    let token = store
      .save_oauth_state(CalendarOAuthState {
        provider: CalendarProviderName::Google,
        user_id: "reconnect-user".to_owned(),
        redirect_uri: None,
        token: None,
      })
      .await
      .expect("initial save");

    let _ = drop_tx.send(());
    let _ = closed_rx.await;

    let first_after_drop = store.get_oauth_state(&token).await;
    assert!(
      first_after_drop.is_err(),
      "expected dead cached connection to fail and reset"
    );

    let recovered = store
      .get_oauth_state(&token)
      .await
      .expect("reconnect after reset")
      .expect("state still in redis");
    assert_eq!(recovered.user_id, "reconnect-user");

    let _ = store.delete_oauth_state(&token).await;
    accept_task.abort();
  });
}

#[test]
fn ical_floating_time_dst_utc_guess_google_path_and_oauth_state_parity() {
  if let Ok(mode) = std::env::var("AFFINE_CAL_TZ_SUBPROC_TEST") {
    let cases: &[(&str, &str)] = match mode.as_str() {
      "utc" => &[
        ("2026-07-01T10:20:30", "2026-07-01T10:20:30.000Z"),
        ("2026T10:20", "2026-01-01T10:20:00.000Z"),
        ("2026-07T10:20", "2026-07-01T10:20:00.000Z"),
        ("9999-12-30T23:00:00", "9999-12-30T23:00:00.000Z"),
        ("9999-12-30T23:00:00Z", "9999-12-30T23:00:00.000Z"),
      ],
      "ny" => &[
        ("2026-07-01T10:20:30", "2026-07-01T14:20:30.000Z"),
        ("2026T10:20", "2026-01-01T15:20:00.000Z"),
        ("2026-07T10:20", "2026-07-01T14:20:00.000Z"),
        ("2026-03-08T02:30:00", "2026-03-08T07:30:00.000Z"),
        ("2026-11-01T01:30:00", "2026-11-01T05:30:00.000Z"),
        ("9999-12-30T23:00:00", "9999-12-31T04:00:00.000Z"),
        ("9999-12-30T23:00:00Z", "9999-12-30T23:00:00.000Z"),
      ],
      other => panic!("unexpected AFFINE_CAL_TZ_SUBPROC_TEST={other}"),
    };
    for &(input, expected) in cases {
      assert_eq!(
        server_domain::calendar::ical::parse_js_iso_millis(input)
          .map(server_domain::calendar::ical::format_epoch_millis_iso)
          .as_deref(),
        Some(expected),
        "mode={mode} input={input:?}"
      );
      assert!(
        server_domain::calendar::ical::parse_js_iso_datetime(input).is_some(),
        "parse_js_iso_datetime({input:?}) mode={mode}"
      );
    }
    return;
  }
  // Floating time (no Z, no TZID) must omit .000 to match caldav.ts:335.
  let ical = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:flt-1\r\nSUMMARY:Float\r\nDTSTART:20260701T090000\r\nDTEND:20260701T100000\r\nRECURRENCE-ID:20260701T090000\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:dst-guess\r\nSUMMARY:DST Guess\r\nDTSTART;TZID=America/New_York:20260308T040000\r\nDTEND;TZID=America/New_York:20260308T050000\r\nEND:VEVENT\r\nEND:VCALENDAR";
  let evts = parse_ical_events(ical, "/cal/flt.ics", None);
  assert_eq!(evts.len(), 2);
  assert_eq!(evts[0].start.date_time.as_deref(), Some("2026-07-01T09:00:00Z"));
  assert_eq!(
    evts[0]
      .original_start_time
      .as_ref()
      .and_then(|t| t.date_time.as_deref()),
    Some("2026-07-01T09:00:00Z")
  );
  // America/New_York 20260308T040000 sampled at UTC guess 04:00Z (EST -05:00) -> 09:00:00.000Z.
  assert_eq!(evts[1].start.date_time.as_deref(), Some("2026-03-08T09:00:00.000Z"));
  assert_eq!(
    offset_at_utc_guess(2026, 9, 27, 0, 0, 0, Some("Pacific/Auckland"))
      .unwrap()
      .to_rfc3339(),
    "2026-09-26T11:00:00+00:00"
  );

  // Google path segment encoding aligns with JS encodeURIComponent.
  assert_eq!(encode_path_segment("(team)!").unwrap(), "(team)!");
  assert_eq!(encode_path_segment("a/b@c").unwrap(), "a%2Fb%40c");
  assert!(encode_path_segment("").is_err());
  assert!(encode_path_segment(".").is_err());
  assert!(encode_path_segment("..").is_err());

  // is_valid_oauth_state checks UTF-16 length == 36 without trimming.
  assert!(is_valid_oauth_state(&" ".repeat(36)));
  assert!(!is_valid_oauth_state(&" ".repeat(35)));

  // Unknown TZID must not silently fall back to UTC and must return Err from try_parse_ical_events.
  assert!(offset_at_utc_guess(2026, 7, 1, 9, 0, 0, Some("Mars/Olympus_Mons")).is_none());
  let bad_tz_ical = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:bad-tz-1\r\nSUMMARY:Mars Meeting\r\nDTSTART;TZID=Mars/Olympus_Mons:20260701T090000\r\nDTEND;TZID=Mars/Olympus_Mons:20260701T100000\r\nEND:VEVENT\r\nEND:VCALENDAR";
  assert!(try_parse_ical_events(bad_tz_ical, "/cal/mars.ics", None).is_err());
  assert!(parse_ical_events(bad_tz_ical, "/cal/mars.ics", None).is_empty());
}

#[test]
fn caldav_list_events_propagates_unknown_tzid_error_for_calendar_query_and_sync_collection() {
  let rt = test_runtime();
  rt.block_on(async {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
      .await
      .expect("bind mock caldav");
    let addr = listener.local_addr().expect("addr");
    let srv = tokio::spawn(async move {
      let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/cal/ok.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"e1"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:ok-1
SUMMARY:NY Event
DTSTART;TZID=America/New_York:20260701T090000
DTEND;TZID=America/New_York:20260701T100000
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/cal/mars.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"e2"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:bad-1
SUMMARY:Mars Event
DTSTART;TZID=Mars/Olympus_Mons:20260701T090000
DTEND;TZID=Mars/Olympus_Mons:20260701T100000
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:sync-token>https://caldav.example/sync/2</D:sync-token>
</D:multistatus>"#;
      let resp = format!(
        "HTTP/1.1 207 Multi-Status\r\nContent-Type: application/xml\r\nContent-Length: {}\r\n\r\n{}",
        xml.len(),
        xml
      );
      while let Ok((mut sock, _)) = listener.accept().await {
        let resp = resp.clone();
        tokio::spawn(async move {
          let mut buf = vec![0u8; 8192];
          let _ = sock.read(&mut buf).await;
          let _ = sock.write_all(resp.as_bytes()).await;
          let _ = sock.shutdown().await;
        });
      }
    });

    let cfg = CalendarCaldavConfig {
      enabled: true,
      allow_insecure_http: Some(true),
      block_private_network: Some(false),
      request_timeout_ms: Some(5_000),
      ..CalendarCaldavConfig::default()
    };
    let provider = CaldavCalendarProvider::new(cfg);
    let cal_url = format!("http://{addr}/cal/");
    let now = chrono::Utc::now();
    let account = CalendarAccountRecord {
      id: "acct-1".to_owned(),
      user_id: "user-1".to_owned(),
      provider: CalendarProviderName::CalDAV,
      provider_account_id: "pa-1".to_owned(),
      display_name: None,
      email: None,
      provider_preset_id: None,
      server_url: Some(format!("http://{addr}")),
      principal_url: None,
      calendar_home_url: None,
      username: Some("u".to_owned()),
      auth_type: Some("basic".to_owned()),
      access_token_encrypted: None,
      refresh_token_encrypted: None,
      expires_at: None,
      scope: None,
      status: "active".to_owned(),
      last_error: None,
      refresh_interval_minutes: 30,
      calendars_count: 1,
      created_at: now,
      updated_at: now,
    };

    let err_query = provider
      .list_events(&account, "p", &cal_url, None, None, None)
      .await
      .expect_err("calendar-query must fail on unknown TZID");
    assert!(err_query.to_string().contains("Mars/Olympus_Mons"));

    let err_sync = provider
      .list_events(&account, "p", &cal_url, Some("sync-1"), None, None)
      .await
      .expect_err("sync-collection must fail on unknown TZID");
    assert!(err_sync.to_string().contains("Mars/Olympus_Mons"));

    srv.abort();

    // LAST-MODIFIED / DTSTAMP ignore TZID parameter (unknown TZID on UTC value or non-UTC TZID on floating value).
    let ok_listener = tokio::net::TcpListener::bind("127.0.0.1:0")
      .await
      .expect("bind ok mock caldav");
    let ok_addr = ok_listener.local_addr().expect("ok addr");
    let ok_srv = tokio::spawn(async move {
      let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/cal/lm-utc.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"e3"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:lm-1
SUMMARY:LM UTC
DTSTART;TZID=America/New_York:20260701T090000
DTEND;TZID=America/New_York:20260701T100000
LAST-MODIFIED;TZID=Mars/Olympus_Mons:20260701T080000Z
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/cal/lm-float.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"e4"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:lm-2
SUMMARY:LM Float
DTSTART;TZID=America/New_York:20260701T110000
DTEND;TZID=America/New_York:20260701T120000
LAST-MODIFIED;TZID=America/New_York:20260701T080000
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:sync-token>https://caldav.example/sync/ok</D:sync-token>
</D:multistatus>"#;
      let resp = format!(
        "HTTP/1.1 207 Multi-Status\r\nContent-Type: application/xml\r\nContent-Length: {}\r\n\r\n{}",
        xml.len(),
        xml
      );
      while let Ok((mut sock, _)) = ok_listener.accept().await {
        let resp = resp.clone();
        tokio::spawn(async move {
          let mut buf = vec![0u8; 8192];
          let _ = sock.read(&mut buf).await;
          let _ = sock.write_all(resp.as_bytes()).await;
          let _ = sock.shutdown().await;
        });
      }
    });
    let mut ok_account = account;
    ok_account.server_url = Some(format!("http://{ok_addr}"));
    let ok_res = provider
      .list_events(
        &ok_account,
        "p",
        &format!("http://{ok_addr}/cal/"),
        Some("sync-prev"),
        None,
        None,
      )
      .await
      .expect("LAST-MODIFIED TZID must be ignored");
    assert_eq!(
      ok_res.next_sync_token.as_deref(),
      Some("https://caldav.example/sync/ok")
    );
    assert_eq!(ok_res.events.len(), 2);
    assert_eq!(ok_res.events[0].updated.as_deref(), Some("2026-07-01T08:00:00.000Z"));
    assert_eq!(ok_res.events[1].updated.as_deref(), Some("2026-07-01T08:00:00Z"));
    ok_srv.abort();

    // Invalid calendar date in Z/offset LAST-MODIFIED (20261301T080000Z) must fail both calendar-query and sync-collection,
    // while non-matching format (LAST-MODIFIED:not-a-date) returns updated: None cleanly.
    let non_date = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:nd-1\r\nSUMMARY:Ok\r\nDTSTART:20260701T090000Z\r\nDTEND:20260701T100000Z\r\nLAST-MODIFIED:not-a-date\r\nEND:VEVENT\r\nEND:VCALENDAR";
    let nd_events = try_parse_ical_events(non_date, "/cal/nd.ics", None).expect("non-date LAST-MODIFIED ok");
    assert_eq!(nd_events.len(), 1);
    assert!(nd_events[0].updated.is_none());

    let bad_lm_listener = tokio::net::TcpListener::bind("127.0.0.1:0")
      .await
      .expect("bind bad lm mock");
    let bad_lm_addr = bad_lm_listener.local_addr().expect("bad lm addr");
    let bad_lm_srv = tokio::spawn(async move {
      let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/cal/bad-lm.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"e5"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:bad-lm-1
SUMMARY:Bad LM
DTSTART:20260701T090000Z
DTEND:20260701T100000Z
LAST-MODIFIED:20261301T080000Z
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:sync-token>https://caldav.example/sync/should-not-advance</D:sync-token>
</D:multistatus>"#;
      let resp = format!(
        "HTTP/1.1 207 Multi-Status\r\nContent-Type: application/xml\r\nContent-Length: {}\r\n\r\n{}",
        xml.len(),
        xml
      );
      while let Ok((mut sock, _)) = bad_lm_listener.accept().await {
        let resp = resp.clone();
        tokio::spawn(async move {
          let mut buf = vec![0u8; 8192];
          let _ = sock.read(&mut buf).await;
          let _ = sock.write_all(resp.as_bytes()).await;
          let _ = sock.shutdown().await;
        });
      }
    });
    let mut bad_lm_account = ok_account;
    bad_lm_account.server_url = Some(format!("http://{bad_lm_addr}"));
    let bad_lm_url = format!("http://{bad_lm_addr}/cal/");
    assert!(
      provider
        .list_events(&bad_lm_account, "p", &bad_lm_url, None, None, None)
        .await
        .is_err(),
      "calendar-query must reject invalid Z LAST-MODIFIED"
    );
    assert!(
      provider
        .list_events(&bad_lm_account, "p", &bad_lm_url, Some("sync-prev"), None, None)
        .await
        .is_err(),
      "sync-collection must reject invalid Z LAST-MODIFIED"
    );
    bad_lm_srv.abort();

    // V8 ISO-8601 overflow days (Feb 30 -> Mar 2) and 24:00:00 normalization (+0100 -> 23:00:00Z).
    let rollover_ical = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:r1\r\nSUMMARY:Rollover\r\nDTSTART:20260230T080000Z\r\nDTEND:20260231T080000Z\r\nLAST-MODIFIED:20260701T240000+0100\r\nEND:VEVENT\r\nEND:VCALENDAR";
    let rollover_events = try_parse_ical_events(rollover_ical, "/cal/r1.ics", None).expect("rollover ok");
    assert_eq!(rollover_events.len(), 1);
    assert_eq!(
      rollover_events[0].start.date_time.as_deref(),
      Some("2026-03-02T08:00:00.000Z")
    );
    assert_eq!(
      rollover_events[0].end.date_time.as_deref(),
      Some("2026-03-03T08:00:00.000Z")
    );
    assert_eq!(
      rollover_events[0].updated.as_deref(),
      Some("2026-07-01T23:00:00.000Z")
    );

    // Event missing DTSTART or with explicit invalid DTEND (with invalid LAST-MODIFIED) must be skipped
    // without failing sibling events or sync_token, while omitted DTEND still defaults to DTSTART.
    let no_dtend_ical =
      "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:no-end\r\nSUMMARY:No End\r\nDTSTART:20260701T090000Z\r\nEND:VEVENT\r\nEND:VCALENDAR";
    let no_dtend_events = try_parse_ical_events(no_dtend_ical, "/cal/no-end.ics", None).expect("omitted DTEND ok");
    assert_eq!(no_dtend_events.len(), 1);
    assert_eq!(
      no_dtend_events[0].end.date_time.as_deref(),
      Some("2026-07-01T09:00:00.000Z")
    );

    // Extended ECMAScript 6-digit year formatting outside 0000..=9999.
    let ext_year_ical = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:ey-1\r\nSUMMARY:ExtYear\r\nDTSTART:99991231T240000Z\r\nDTEND:99991231T233000-0100\r\nLAST-MODIFIED:00000101T000000+0100\r\nEND:VEVENT\r\nEND:VCALENDAR";
    let ext_year_events = try_parse_ical_events(ext_year_ical, "/cal/ey.ics", None).expect("extended year ok");
    assert_eq!(ext_year_events.len(), 1);
    assert_eq!(
      ext_year_events[0].start.date_time.as_deref(),
      Some("+010000-01-01T00:00:00.000Z")
    );
    assert_eq!(
      ext_year_events[0].end.date_time.as_deref(),
      Some("+010000-01-01T00:30:00.000Z")
    );
    assert_eq!(
      ext_year_events[0].updated.as_deref(),
      Some("-000001-12-31T23:00:00.000Z")
    );

    let mixed_listener = tokio::net::TcpListener::bind("127.0.0.1:0")
      .await
      .expect("bind mixed mock");
    let mixed_addr = mixed_listener.local_addr().expect("mixed addr");
    let mixed_srv = tokio::spawn(async move {
      let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/cal/mixed.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"e6"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:broken-no-dtstart
SUMMARY:Skip me
LAST-MODIFIED:20261301T080000Z
END:VEVENT
BEGIN:VEVENT
UID:broken-bad-dtend
SUMMARY:Skip bad dtend
DTSTART:20260701T090000Z
DTEND:not-a-date
LAST-MODIFIED:20261301T080000Z
END:VEVENT
BEGIN:VEVENT
UID:good-sibling
SUMMARY:Good sibling
DTSTART:20260701T090000Z
DTEND:20260701T100000Z
LAST-MODIFIED:20260701T080000Z
END:VEVENT
BEGIN:VEVENT
UID:all-day-feb30
SUMMARY:All day Feb30
DTSTART;VALUE=DATE:20260228
DTEND;VALUE=DATE:20260230
END:VEVENT
BEGIN:VEVENT
UID:floating-24h
SUMMARY:Floating 24h
DTSTART:20260701T090000
DTEND:20260701T240000
END:VEVENT
BEGIN:VEVENT
UID:tz-fixed-hhmm
SUMMARY:TZ +0800
DTSTART;TZID=+0800:20260701T090000
END:VEVENT
BEGIN:VEVENT
UID:tz-fixed-hh
SUMMARY:TZ +08
DTSTART;TZID=+08:20260701T090000
END:VEVENT
BEGIN:VEVENT
UID:tz-year-9999
SUMMARY:TZ 9999 UTC
DTSTART;TZID=UTC:99991231T230000
END:VEVENT
BEGIN:VEVENT
UID:tz-year-0100-ny
SUMMARY:TZ 0100 NY
DTSTART;TZID=America/New_York:01000101T010000
END:VEVENT
BEGIN:VEVENT
UID:tz-year-2401-ny-dst
SUMMARY:TZ 2401 NY DST
DTSTART;TZID=America/New_York:24010320T120000
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:sync-token>https://caldav.example/sync/mixed-ok</D:sync-token>
</D:multistatus>"#;
      let resp = format!(
        "HTTP/1.1 207 Multi-Status\r\nContent-Type: application/xml\r\nContent-Length: {}\r\n\r\n{}",
        xml.len(),
        xml
      );
      while let Ok((mut sock, _)) = mixed_listener.accept().await {
        let resp = resp.clone();
        tokio::spawn(async move {
          let mut buf = vec![0u8; 8192];
          let _ = sock.read(&mut buf).await;
          let _ = sock.write_all(resp.as_bytes()).await;
          let _ = sock.shutdown().await;
        });
      }
    });
    let mut mixed_account = bad_lm_account;
    mixed_account.server_url = Some(format!("http://{mixed_addr}"));
    let mixed_url = format!("http://{mixed_addr}/cal/");
    let mixed_res = provider
      .list_events(&mixed_account, "p", &mixed_url, Some("sync-prev"), None, None)
      .await
      .expect("missing-DTSTART / invalid-DTEND events must be skipped while regex-valid DATE/floating/ECMA-402 TZID events stay");
    assert_eq!(mixed_res.events.len(), 8);
    assert_eq!(mixed_res.events[0].summary.as_deref(), Some("Good sibling"));
    assert_eq!(mixed_res.events[1].summary.as_deref(), Some("All day Feb30"));
    assert_eq!(mixed_res.events[1].end.date.as_deref(), Some("2026-02-30"));
    assert_eq!(mixed_res.events[2].summary.as_deref(), Some("Floating 24h"));
    assert_eq!(
      mixed_res.events[2].end.date_time.as_deref(),
      Some("2026-07-01T24:00:00Z")
    );
    assert_eq!(
      mixed_res.events[3].start.date_time.as_deref(),
      Some("2026-07-01T01:00:00.000Z")
    );
    assert_eq!(
      mixed_res.events[4].start.date_time.as_deref(),
      Some("2026-07-01T01:00:00.000Z")
    );
    assert_eq!(
      mixed_res.events[5].start.date_time.as_deref(),
      Some("9999-12-31T23:00:00.000Z")
    );
    assert_eq!(
      mixed_res.events[6].start.date_time.as_deref(),
      Some("-001800-01-02T05:56:02.000Z")
    );
    assert_eq!(
      mixed_res.events[7].start.date_time.as_deref(),
      Some("2401-03-20T16:00:00.000Z")
    );
    assert_eq!(
      mixed_res.next_sync_token.as_deref(),
      Some("https://caldav.example/sync/mixed-ok")
    );
    mixed_srv.abort();

    // Whitespace-padded or malformed fixed-offset TZIDs must still fail.
    for bad_tz in [" America/New_York ", "+8", "+2400", "Invalid/Zone"] {
      let ical = format!(
        "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:bt\r\nDTSTART;TZID={bad_tz}:20260701T090000\r\nEND:VEVENT\r\nEND:VCALENDAR"
      );
      assert!(
        try_parse_ical_events(&ical, "/cal/bt.ics", None).is_err(),
        "TZID={bad_tz:?} must error"
      );
    }
    assert!(server_domain::calendar::ical::try_offset_at_utc_guess(2026, 7, 1, 9, 0, 0, Some("+24:00")).is_err());
    assert!(server_domain::calendar::ical::try_offset_at_utc_guess(2026, 7, 1, 9, 0, 0, Some("+23:60")).is_err());
    assert_eq!(
      server_domain::calendar::ical::try_offset_at_utc_guess(2026, 7, 1, 9, 0, 0, Some("+08:00"))
        .unwrap()
        .map(server_domain::calendar::ical::format_utc_millis)
        .as_deref(),
      Some("2026-07-01T01:00:00.000Z")
    );

    // Preserved unit checks: DST conversion, non-ASCII safety, VALARM ignore, XML depth cap, serde(skip) overrides.
    let dst_ical = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:dst-1\r\nSUMMARY:NY Summer\r\nDTSTART;TZID=America/New_York:20260701T090000\r\nDTEND;TZID=America/New_York:20260701T100000\r\nRECURRENCE-ID;TZID=America/New_York:20260701T090000\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:dst-2\r\nSUMMARY:NY Winter\r\nDTSTART;TZID=America/New_York:20260115T090000\r\nDTEND;TZID=America/New_York:20260115T100000\r\nEND:VEVENT\r\nEND:VCALENDAR";
    let dst_evts = server_domain::calendar::ical::parse_ical_events(dst_ical, "/cal/dst.ics", None);
    assert_eq!(dst_evts.len(), 2);
    assert_eq!(dst_evts[0].start.date_time.as_deref(), Some("2026-07-01T13:00:00.000Z"));
    assert_eq!(
      dst_evts[0].original_start_time.as_ref().and_then(|t| t.date_time.as_deref()),
      Some("2026-07-01T13:00:00.000Z")
    );
    assert_eq!(dst_evts[1].start.date_time.as_deref(), Some("2026-01-15T14:00:00.000Z"));
    let non_ascii_ical = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:na\nDTSTART:aaa\u{00e9}0101T00000+0000\nEND:VEVENT\nBEGIN:VEVENT\nUID:alarm-1\nSUMMARY:Real Event\nDESCRIPTION:Real Desc\nDTSTART:20261125T090000Z\nDTEND:20261125T100000Z\nBEGIN:VALARM\nACTION:DISPLAY\nSUMMARY:Alarm Title\nDESCRIPTION:Alarm Desc\nEND:VALARM\nEND:VEVENT\nEND:VCALENDAR";
    let alarm_evts = server_domain::calendar::ical::parse_ical_events(non_ascii_ical, "/cal/a.ics", None);
    assert_eq!(alarm_evts.len(), 1);
    assert_eq!(alarm_evts[0].summary.as_deref(), Some("Real Event"));
    assert_eq!(alarm_evts[0].description.as_deref(), Some("Real Desc"));
    let amps = "&".repeat(50_000);
    assert_eq!(server_domain::calendar::ical::decode_xml_entities(&amps).len(), 50_000);
    let deep = format!("{}<d:sync-token>t</d:sync-token>{}", "<a>".repeat(80), "</a>".repeat(80));
    assert!(server_domain::calendar::ical::parse_multistatus(&deep).sync_token.is_none());
    // JS ISO parser layer (parse_js_iso_millis + format_epoch_millis_iso) vs Chrono/PG persistence bounds.
    for (input, expected) in [
      ("2026-07-01T24:00:00.000Z", "2026-07-02T00:00:00.000Z"),
      ("2026-07-01t10:20:30z", "2026-07-01T10:20:30.000Z"),
      ("2026-07-01T10:20:30+0800", "2026-07-01T02:20:30.000Z"),
      ("2026-07-01T10:20Z", "2026-07-01T10:20:00.000Z"),
      ("2026T10:20Z", "2026-01-01T10:20:00.000Z"),
      ("2026-07T10:20Z", "2026-07-01T10:20:00.000Z"),
      ("2026-07-01T24:00Z", "2026-07-02T00:00:00.000Z"),
      ("+262142-12-31T24:00:00Z", "+262143-01-01T00:00:00.000Z"),
      ("-262143-01-01T00:00:00+23:59", "-262144-12-31T00:01:00.000Z"),
      ("+275760-09-13T00:00:00.000Z", "+275760-09-13T00:00:00.000Z"),
      ("-271821-04-20T00:00:00.000Z", "-271821-04-20T00:00:00.000Z"),
    ] {
      assert_eq!(
        server_domain::calendar::ical::parse_js_iso_millis(input)
          .map(server_domain::calendar::ical::format_epoch_millis_iso)
          .as_deref(),
        Some(expected),
        "parse_js_iso_millis({input:?})"
      );
    }
    for bad_js_iso in [
      "+275760-09-13T00:00:00.001Z",
      "-271821-04-19T23:59:59.999Z",
      "-000000-07-01T10:20:30Z",
      "2026-+7-01T10:20:30Z",
      "2026-07-01T24:00:00.001Z",
      "2026-07-01T23:59:60Z",
      "2026-07-01T10:20.5Z",
      "2026-07-01T10:20:30+08",
    ] {
      assert!(
        server_domain::calendar::ical::parse_js_iso_millis(bad_js_iso).is_none(),
        "parse_js_iso_millis({bad_js_iso:?}) must return None"
      );
    }
    // Chrono/PG persistence bounds: within +-262142..262143 returns Some, beyond returns None without panicking.
    assert!(server_domain::calendar::ical::parse_js_iso_datetime("+262142-12-31T23:59:59.999Z").is_some());
    assert!(server_domain::calendar::ical::parse_js_iso_datetime("-262143-01-01T00:00:00.000Z").is_some());
    assert!(server_domain::calendar::ical::parse_js_iso_datetime("+262142-12-31T24:00:00Z").is_none());
    assert!(server_domain::calendar::ical::parse_js_iso_datetime("-262143-01-01T00:00:00+23:59").is_none());
    assert_eq!(
      server_domain::calendar::ical::try_offset_at_utc_guess_i32(
        i32::MIN,
        i32::MIN,
        i32::MIN,
        i32::MIN,
        i32::MIN,
        i32::MIN,
        Some("UTC"),
      )
      .unwrap(),
      None
    );
    for (mode, tz) in [("utc", "UTC"), ("ny", "America/New_York")] {
      let status = std::process::Command::new(std::env::current_exe().expect("current_exe"))
        .arg("--exact")
        .arg("ical_floating_time_dst_utc_guess_google_path_and_oauth_state_parity")
        .env("AFFINE_CAL_TZ_SUBPROC_TEST", mode)
        .env("TZ", tz)
        .status()
        .expect("spawn TZ subprocess");
      assert!(status.success(), "TZ={tz} subprocess failed");
    }
    let raw_g = serde_json::json!({
      "enabled": true, "clientId": "cid", "clientSecret": "csec",
      "authEndpointOverride": "http://127.0.0.1:9999/auth",
      "tokenEndpointOverride": "http://169.254.169.254/token",
      "userinfoEndpointOverride": "http://127.0.0.1:9999/me",
      "apiBaseOverride": "http://127.0.0.1:9999/v3"
    });
    let parsed_g: server_domain::calendar::google::CalendarGoogleConfig =
      serde_json::from_value(raw_g).expect("deserialize");
    assert!(parsed_g.auth_endpoint_override.is_none());
    assert!(parsed_g.token_endpoint_override.is_none());
    assert!(parsed_g.userinfo_endpoint_override.is_none());
    assert!(parsed_g.api_base_override.is_none());
    let dbg = format!("{parsed_g:?}");
    assert!(!dbg.contains("csec") && dbg.contains("[REDACTED]"));
  });
}
