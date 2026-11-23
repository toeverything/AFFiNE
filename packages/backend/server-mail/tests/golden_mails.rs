//! Every frozen `v0.27.5` mail snapshot rendered byte-for-byte from its
//! manifest props, plus the branches and escaping rules the snapshots do not
//! exercise.

use std::{collections::BTreeSet, path::PathBuf};

use server_mail::{MailTemplate, RenderedMail};

fn mails_dir() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../tests/oracle-contracts/v0.27.5/mails")
}

fn manifest() -> serde_json::Value {
  serde_json::from_str(&std::fs::read_to_string(mails_dir().join("manifest.json")).expect("read mail manifest"))
    .expect("parse mail manifest")
}

fn render(name: &str, props: serde_json::Value) -> RenderedMail {
  let template: MailTemplate = serde_json::from_value(serde_json::json!({ "name": name, "props": props }))
    .unwrap_or_else(|err| {
      panic!("{name} props do not deserialize: {err}");
    });
  assert_eq!(template.name(), name);
  template.render_with_year(2026)
}

#[test]
fn all_frozen_v0275_mail_snapshots_render_byte_for_byte_with_subjects() {
  let manifest = manifest();
  assert_eq!(
    manifest["clock"], "2026-01-01T00:00:00.000Z",
    "footer year below follows the oracle clock"
  );
  let templates = manifest["templates"].as_array().expect("templates array");
  assert_eq!(templates.len(), 30);

  let mut names = BTreeSet::new();
  let mut mismatches = Vec::new();
  for entry in templates {
    let name = entry["name"].as_str().unwrap();
    names.insert(name);
    let expected_html = std::fs::read_to_string(mails_dir().join(entry["file"].as_str().unwrap())).unwrap();
    let rendered = render(name, entry["props"].clone());
    assert_eq!(rendered.subject, entry["subject"].as_str().unwrap(), "{name} subject");
    if rendered.html != expected_html {
      let at = rendered
        .html
        .bytes()
        .zip(expected_html.bytes())
        .position(|(a, b)| a != b)
        .unwrap_or(rendered.html.len().min(expected_html.len()));
      let from = at.saturating_sub(80);
      mismatches.push(format!(
        "{name} differs at byte {at}:\n  got:  {:?}\n  want: {:?}",
        rendered
          .html
          .get(from..(at + 120).min(rendered.html.len()))
          .unwrap_or(""),
        expected_html
          .get(from..(at + 120).min(expected_html.len()))
          .unwrap_or(""),
      ));
    }
  }
  assert!(mismatches.is_empty(), "{}", mismatches.join("\n"));
  assert_eq!(names.len(), 30, "every manifest template is distinct");
}

#[test]
fn recorded_test_mail_html_matches_parity_fixture() {
  let fixture: serde_json::Value = serde_json::from_str(
    &std::fs::read_to_string(
      PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../tools/parity-harness/tests/fixtures/v0275-self-parity.recorded.json"),
    )
    .unwrap(),
  )
  .unwrap();
  let smtp = &fixture["left"]["effects"]["smtp"][0];
  let rendered = render("TestMail", serde_json::json!({}));
  assert_eq!(smtp["subject"], rendered.subject.as_str());
  assert_eq!(smtp["html"][0], format!("{}\r\n", rendered.html).as_str());
}

/// Template, props, expected subject (if checked), fragments that must and must
/// not appear.
type Case = (
  &'static str,
  serde_json::Value,
  Option<&'static str>,
  Vec<String>,
  Vec<String>,
);

#[test]
fn unsnapshotted_branches_and_escaping_follow_react_rendering() {
  let workspace = serde_json::json!({ "name": "Test Workspace", "avatar": "https://app.affine.pro/favicon-192.png" });
  let preload = |src: &str| format!(r#"<link rel="preload" as="image" href="{src}"/>"#);
  let blocked = "javascript:throw new Error(&#x27;React has blocked a javascript: URL as a security precaution.&#x27;)";

  let cases: Vec<Case> = vec![
    (
      "SignIn",
      serde_json::json!({ "url": "https://x.test/?a=1&b=2", "otp": "\n<b>", "serverName": "Team & Co" }),
      Some("Sign in to AFFiNE"),
      vec![
        "Sign in to Team &amp; Co</p>".into(),
        "background-color:#F5F5F5\">\n\n&lt;b&gt;</pre>".into(),
        r#"<a href="https://x.test/?a=1&amp;b=2" style="line-height:24px"#.into(),
      ],
      vec![],
    ),
    (
      "SignUp",
      serde_json::json!({ "url": "https://x.test", "otp": "1", "serverName": "" }),
      Some("Your AFFiNE account is waiting for you!"),
      vec![
        "Sign up to </p>".into(),
        "You are signing up to AFFiNE. Here is your code:".into(),
      ],
      vec![],
    ),
    (
      "TeamWorkspaceUpgraded",
      serde_json::json!({ "workspace": workspace, "isOwner": false, "url": "https://app.affine.pro" }),
      Some("A workspace has been upgraded to team workspace! 🎉"),
      vec![
        "color:#141414\">Great news! <img src=\"https://app.affine.pro/favicon-192.png\"".into(),
        "</span> has been upgraded to team workspace by the workspace owner.<br/>You now have access to the \
         following enhanced features:<br/> ✓ 100 GB initial storage + 20 GB per seat"
          .into(),
      ],
      vec![],
    ),
    (
      "MemberInvitation",
      serde_json::json!({
        "user": { "email": "\"evil\"@x.test" },
        "workspace": { "name": "<script>alert('x')</script>", "size": 32 },
        "url": "javascript:alert(1)",
      }),
      None,
      vec![
        "<span style=\"font-weight:600\">&quot;evil&quot;@x.test</span> invited you to join <span \
         style=\"font-weight:600\">&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;</span>"
          .into(),
        format!("<a href=\"{blocked}\" style=\"line-height:24px"),
      ],
      vec!["<script>".into(), "alt=\"avatar\"".into()],
    ),
    (
      "MemberLeave",
      serde_json::json!({
        "user": { "email": "a@b.c" },
        "workspace": { "name": "W", "avatar": "https://cdn.test/a.png", "size": 40 },
      }),
      None,
      vec![
        "Member left <img src=\"https://cdn.test/a.png\" alt=\"avatar\" style=\"width:24px;height:24px;".into(),
        "has left workspace<!-- --> <img src=\"https://cdn.test/a.png\" alt=\"avatar\" style=\"width:40px;height:40px;"
          .into(),
        format!("affine-logo.png\"/>{}<link", preload("https://cdn.test/a.png")),
      ],
      vec![format!("{0}{0}", preload("https://cdn.test/a.png"))],
    ),
    (
      "OwnershipReceived",
      serde_json::json!({ "workspace": { "name": "W", "avatar": "data:image/png;base64,AAAA" } }),
      None,
      vec!["owner of<img src=\"data:image/png;base64,AAAA\"".into()],
      vec![preload("data:image/png;base64,AAAA")],
    ),
    (
      "OwnershipTransferred",
      serde_json::json!({ "workspace": { "name": "W", "avatar": "" } }),
      None,
      vec!["ownership of <span style=\"font-weight:600\">W</span>. You".into()],
      vec!["alt=\"avatar\"".into()],
    ),
    (
      "Comment",
      serde_json::json!({ "user": { "email": "a@b.c" }, "doc": { "title": "", "url": "" } }),
      None,
      vec![
        "commented on <a style=\"color:#067df7;text-decoration-line:none\" target=\"_blank\"><span \
         style=\"font-weight:600\">Untitled</span></a>."
          .into(),
        "<a style=\"line-height:24px".into(),
      ],
      vec!["href=\"\"".into()],
    ),
    (
      "TeamWorkspaceExpired",
      serde_json::json!({ "workspace": workspace, "expirationDate": "2024-02-29T23:59:59.999Z", "url": "u" }),
      None,
      vec!["expired on<!-- --> <span style=\"font-weight:600\">2024-02-29</span>. Your workspace".into()],
      vec![],
    ),
  ];

  for (name, props, subject, present, absent) in cases {
    let rendered = render(name, props);
    if let Some(subject) = subject {
      assert_eq!(rendered.subject, subject, "{name} subject");
    }
    for fragment in present {
      assert!(
        rendered.html.contains(&fragment),
        "{name} lacks {fragment:?}\n{}",
        rendered.html
      );
    }
    for fragment in absent {
      assert!(
        !rendered.html.contains(&fragment),
        "{name} contains {fragment:?}\n{}",
        rendered.html
      );
    }
  }
}

#[test]
fn footer_copyright_year_is_a_separate_text_node() {
  let html = MailTemplate::TestMail(Default::default()).render_with_year(2031).html;
  assert!(html.contains("<td>2023-<!-- -->2031<!-- --> ToEverything</td>"));
}
