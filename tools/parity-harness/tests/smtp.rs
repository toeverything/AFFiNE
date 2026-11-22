use parity_harness::sinks::SmtpSink;
use serde_json::json;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::TcpStream,
};
#[tokio::test]
async fn smtp_waits_for_inflight_plain_mail_and_canonicalizes_extended_envelopes() {
    let sink = SmtpSink::bind("127.0.0.1:0").await.unwrap();
    let stream = TcpStream::connect(sink.address).await.unwrap();
    let (read, mut write) = stream.into_split();
    let mut read = BufReader::new(read);
    let mut line = String::new();
    read.read_line(&mut line).await.unwrap();
    let sender = tokio::spawn(async move {
        for command in [
            "HELO test\r\n",
            "MAIL FROM:<sender@example.test> SIZE=123 BODY=8BITMIME\r\n",
            "RCPT TO:<user@example.test> NOTIFY=FAILURE\r\n",
            "DATA\r\n",
        ] {
            write.write_all(command.as_bytes()).await.unwrap();
            line.clear();
            read.read_line(&mut line).await.unwrap();
        }
        tokio::time::sleep(std::time::Duration::from_millis(60)).await;
        write.write_all(b"Subject: Plain\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nplain body\r\n.\r\n").await.unwrap();
        line.clear();
        read.read_line(&mut line).await.unwrap();
        write.write_all(b"QUIT\r\n").await.unwrap();
        line.clear();
        read.read_line(&mut line).await.unwrap();
    });
    let result = sink
        .snapshot(Some(1), std::time::Duration::from_secs(2))
        .await
        .unwrap();
    sender.await.unwrap();
    assert_eq!(
        result,
        json!([{"from":"sender@example.test","recipients":["user@example.test"],"subject":"Plain","html":[],"text":["plain body\r\n"]}])
    );
}
