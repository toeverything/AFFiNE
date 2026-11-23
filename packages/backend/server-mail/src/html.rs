//! Byte-exact port of the `v0.27.5` mail component library
//! (`packages/backend/server/src/mails/components`) as rendered by React 19.2
//! `renderToReadableStream` inside a `Suspense` boundary.
//!
//! The React Fizz rules that shape the output are reproduced here:
//! - text and attribute values use `escapeTextForBrowser` (`" & ' < >` only);
//! - adjacent text nodes are separated by `<!-- -->`, empty text is dropped;
//! - `src`/`href` attributes are omitted when empty and `javascript:` URLs are
//!   replaced by React's blocking stub;
//! - every non-`data:` `<img>` gets one `<link rel="preload" as="image">` in
//!   `<head>`, deduplicated by `src`, in document order;
//! - a `<pre>` whose text starts with `\n` gets an extra leading newline.

use chrono::{DateTime, Datelike, Utc};

use crate::{DocProps, WorkspaceProps};

const DOCTYPE_AND_HEAD_OPEN: &str = r#"<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html dir="ltr" lang="en"><head>"#;
const HEAD_META: &str = r#"<meta content="text/html; charset=UTF-8" http-equiv="Content-Type"/><meta name="x-apple-disable-message-reformatting"/>"#;
const BODY_OPEN: &str = r#"</head><body style="background-color:#f6f7fb"><!--$--><!--html--><!--head--><!--body--><table border="0" width="100%" cellPadding="0" cellSpacing="0" role="presentation" align="center"><tbody><tr><td style="background-color:#f6f7fb;overflow:hidden"><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="max-width:450px;background-color:#fff;margin:32px auto 0;border-radius:16px 16px 0 0;box-shadow:0px 0px 20px 0px rgba(66, 65, 73, 0.04);padding:24px"><tbody><tr style="width:100%"><td><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation"><tbody><tr><td><a href="https://affine.pro" style="color:#067df7;text-decoration-line:none" target="_blank"><img alt="AFFiNE logo" height="32px" src="https://cdn.affine.pro/mail/2023-8-9/affine-logo.png" style="display:block;outline:none;border:none;text-decoration:none"/></a></td></tr></tbody></table>"#;
const LOGO_SRC: &str = "https://cdn.affine.pro/mail/2023-8-9/affine-logo.png";
const MAIN_CONTAINER_CLOSE: &str = "</td></tr></tbody></table>";
const FOOTER_OPEN: &str = r#"<table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="max-width:450px;background-color:#fafafa;margin-top:0;margin-bottom:32px;border-radius:0 0 16px 16px;box-shadow:0px 0px 20px 0px rgba(66, 65, 73, 0.04);padding:24px"><tbody><tr style="width:100%"><td><table align="center" width="auto" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="margin:1px auto"><tbody><tr><td><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation"><tbody style="width:100%"><tr style="width:100%"><td style="padding:0 10px"><a href="https://affine.pro/github" style="color:#067df7;text-decoration-line:none" target="_blank"><img alt="affine github link" height="16px" src="https://cdn.affine.pro/mail/2023-8-9/Github.png" style="display:block;outline:none;border:none;text-decoration:none"/></a></td><td style="padding:0 10px"><a href="https://affine.pro/twitter" style="color:#067df7;text-decoration-line:none" target="_blank"><img alt="affine twitter link" height="16px" src="https://cdn.affine.pro/mail/2023-8-9/Twitter.png" style="display:block;outline:none;border:none;text-decoration:none"/></a></td><td style="padding:0 10px"><a href="https://affine.pro/discord" style="color:#067df7;text-decoration-line:none" target="_blank"><img alt="affine discord link" height="16px" src="https://cdn.affine.pro/mail/2023-8-9/Discord.png" style="display:block;outline:none;border:none;text-decoration:none"/></a></td><td style="padding:0 10px"><a href="https://affine.pro/youtube" style="color:#067df7;text-decoration-line:none" target="_blank"><img alt="affine youtube link" height="16px" src="https://cdn.affine.pro/mail/2023-8-9/Youtube.png" style="display:block;outline:none;border:none;text-decoration:none"/></a></td><td style="padding:0 10px"><a href="https://affine.pro/reddit" style="color:#067df7;text-decoration-line:none" target="_blank"><img alt="affine reddit link" height="16px" src="https://cdn.affine.pro/mail/2023-8-9/Reddit.png" style="display:block;outline:none;border:none;text-decoration:none"/></a></td></tr></tbody></table></td></tr></tbody></table><table align="center" width="auto" border="0" cellPadding="0" cellSpacing="0" role="presentation"><tbody><tr><td><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="font-size:15px;font-weight:400;line-height:24px;font-family:Inter, Arial, Helvetica, sans-serif;margin-top:8px;margin-bottom:0;color:#8e8d91"><tbody style="width:100%"><tr style="width:100%"><td>One hyper-fused platform for wildly creative minds</td></tr></tbody></table></td></tr></tbody></table><table align="center" width="auto" border="0" cellPadding="0" cellSpacing="0" role="presentation"><tbody><tr><td><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="font-size:15px;font-weight:400;line-height:24px;font-family:Inter, Arial, Helvetica, sans-serif;margin-top:8px;margin-bottom:0;color:#8e8d91"><tbody style="width:100%"><tr style="width:100%"><td>Copyright</td><td><img alt="copyright" height="14px" src="https://cdn.affine.pro/mail/2023-8-9/copyright.png" style="display:block;outline:none;border:none;text-decoration:none;vertical-align:middle;margin:0 4px"/></td><td>"#;
const FOOTER_IMAGES: [&str; 6] = [
  "https://cdn.affine.pro/mail/2023-8-9/Github.png",
  "https://cdn.affine.pro/mail/2023-8-9/Twitter.png",
  "https://cdn.affine.pro/mail/2023-8-9/Discord.png",
  "https://cdn.affine.pro/mail/2023-8-9/Youtube.png",
  "https://cdn.affine.pro/mail/2023-8-9/Reddit.png",
  "https://cdn.affine.pro/mail/2023-8-9/copyright.png",
];
const FOOTER_CLOSE: &str = "</td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table><!--/$--></body></html>";

const SECTION_OPEN: &str = r#"<table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation"><tbody><tr><td>"#;
const SECTION_CLOSE: &str = "</td></tr></tbody></table>";
const ROW_OPEN: &str = r#"<table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation"><tbody style="width:100%"><tr style="width:100%">"#;
const ROW_CLOSE: &str = "</tr></tbody></table>";

const TITLE_OPEN: &str = r#"<p style="font-size:20px;line-height:28px;font-weight:600;font-family:Inter, Arial, Helvetica, sans-serif;margin-top:24px;margin-bottom:0;color:#141414">"#;
const P_OPEN: &str = r#"<p style="font-size:15px;line-height:24px;font-weight:400;font-family:Inter, Arial, Helvetica, sans-serif;margin-top:24px;margin-bottom:0;color:#141414">"#;
const TEXT_OPEN: &str = r#"<span style="font-size:15px;font-weight:400;line-height:24px;font-family:Inter, Arial, Helvetica, sans-serif;margin-top:24px;margin-bottom:0;color:#141414">"#;
const SECONDARY_TEXT_OPEN: &str = r#"<span style="font-size:14px;font-weight:400;line-height:22px;font-family:Inter, Arial, Helvetica, sans-serif;margin-top:24px;margin-bottom:0;color:#7A7A7A">"#;
const BOLD_OPEN: &str = r#"<span style="font-weight:600">"#;
const CODE_BLOCK_OPEN: &str = r#"<pre style="font-size:15px;font-weight:400;line-height:24px;font-family:Inter, Arial, Helvetica, sans-serif;margin-top:24px;margin-bottom:0;color:#141414;white-space:nowrap;border:1px solid rgba(0,0,0,.1);padding:8px 10px;border-radius:4px;background-color:#F5F5F5">"#;
const LINK_ATTRS: &str = r#" style="color:#067df7;text-decoration-line:none" target="_blank">"#;
const BUTTON_ATTRS: &str = r#" style="line-height:24px;text-decoration:none;display:inline-block;max-width:100%;mso-padding-alt:0px;font-size:15px;font-weight:600;font-family:Inter, Arial, Helvetica, sans-serif;margin-top:24px;margin-bottom:0;color:#FFFFFF;background-color:#1E96EB;padding:8px 18px;border-radius:8px;border:1px solid rgba(0,0,0,.1);margin-right:4px;padding-top:8px;padding-right:18px;padding-bottom:8px;padding-left:18px" target="_blank"><span><!--[if mso]><i style="mso-font-width:450%;mso-text-raise:12" hidden>&#8202;&#8202;</i><![endif]--></span><span style="max-width:100%;display:inline-block;line-height:120%;mso-padding-alt:0px;mso-text-raise:6px">"#;
const BUTTON_CLOSE: &str =
  r#"</span><span><!--[if mso]><i style="mso-font-width:450%" hidden>&#8202;&#8202;&#8203;</i><![endif]--></span></a>"#;

const BLOCKED_JAVASCRIPT_URL: &str =
  "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')";

/// React `escapeTextForBrowser`: escapes exactly `"`, `&`, `'`, `<` and `>`.
pub(crate) fn escape_into(out: &mut String, text: &str) {
  for ch in text.chars() {
    match ch {
      '"' => out.push_str("&quot;"),
      '&' => out.push_str("&amp;"),
      '\'' => out.push_str("&#x27;"),
      '<' => out.push_str("&lt;"),
      '>' => out.push_str("&gt;"),
      other => out.push(other),
    }
  }
}

/// React `sanitizeURL`: `^[\u0000-\u001F ]*j[\r\n\t]*a...t[\r\n\t]*:` (case-insensitive).
pub(crate) fn sanitize_url(url: &str) -> &str {
  let mut chars = url.chars().peekable();
  while chars.next_if(|c| *c <= '\u{1F}' || *c == ' ').is_some() {}
  for (idx, expected) in "javascript".chars().enumerate() {
    if idx > 0 {
      while chars.next_if(|c| matches!(c, '\r' | '\n' | '\t')).is_some() {}
    }
    if !chars.next().is_some_and(|c| c.eq_ignore_ascii_case(&expected)) {
      return url;
    }
  }
  while chars.next_if(|c| matches!(c, '\r' | '\n' | '\t')).is_some() {}
  if chars.next() == Some(':') {
    BLOCKED_JAVASCRIPT_URL
  } else {
    url
  }
}

/// Fizz-style HTML writer for one mail body.
pub(crate) struct Html {
  out: String,
  last_text: bool,
  preloads: Vec<String>,
}

impl Html {
  pub(crate) fn new() -> Self {
    Self {
      out: String::with_capacity(8 * 1024),
      last_text: false,
      preloads: vec![LOGO_SRC.to_owned()],
    }
  }

  fn raw(&mut self, chunk: &str) {
    self.out.push_str(chunk);
    self.last_text = false;
  }

  pub(crate) fn text(&mut self, text: &str) {
    if text.is_empty() {
      return;
    }
    if self.last_text {
      self.out.push_str("<!-- -->");
    }
    escape_into(&mut self.out, text);
    self.last_text = true;
  }

  fn url_attr(&mut self, name: &str, url: &str) {
    if url.is_empty() {
      return;
    }
    self.out.push(' ');
    self.out.push_str(name);
    self.out.push_str("=\"");
    escape_into(&mut self.out, sanitize_url(url));
    self.out.push('"');
  }

  fn preload_image(&mut self, src: &str) {
    let is_data = src.len() > 4 && src.as_bytes()[4] == b':' && src[..4].eq_ignore_ascii_case("data");
    if !src.is_empty() && !is_data && !self.preloads.iter().any(|seen| seen == src) {
      self.preloads.push(src.to_owned());
    }
  }

  fn wrap(&mut self, open: &str, close: &str, children: impl FnOnce(&mut Self)) {
    self.raw(open);
    children(self);
    self.raw(close);
  }

  /// `<Title>`, which `Template` places in its own `<Section>`.
  pub(crate) fn title(&mut self, children: impl FnOnce(&mut Self)) {
    self.raw(SECTION_OPEN);
    self.wrap(TITLE_OPEN, "</p>", children);
    self.raw(SECTION_CLOSE);
  }

  /// `<Content>` in its `<Section>`: an array of children is wrapped in one
  /// `<Row>` each, a single element child is rendered as is.
  pub(crate) fn content(&mut self, children: &[&dyn Fn(&mut Self)]) {
    self.raw(SECTION_OPEN);
    if let [only] = children {
      only(self);
    } else {
      for child in children {
        self.wrap(ROW_OPEN, ROW_CLOSE, |h| child(h));
      }
    }
    self.raw(SECTION_CLOSE);
  }

  pub(crate) fn p(&mut self, children: impl FnOnce(&mut Self)) {
    self.wrap(P_OPEN, "</p>", children);
  }

  pub(crate) fn text_span(&mut self, children: impl FnOnce(&mut Self)) {
    self.wrap(TEXT_OPEN, "</span>", children);
  }

  pub(crate) fn secondary_text(&mut self, children: impl FnOnce(&mut Self)) {
    self.wrap(SECONDARY_TEXT_OPEN, "</span>", children);
  }

  /// `<Bold>`, also used by `<Name>` and `<User>`.
  pub(crate) fn bold(&mut self, text: &str) {
    self.wrap(BOLD_OPEN, "</span>", |h| h.text(text));
  }

  pub(crate) fn br(&mut self) {
    self.raw("<br/>");
  }

  pub(crate) fn li(&mut self, children: impl FnOnce(&mut Self)) {
    self.wrap("<li>", "</li>", children);
  }

  /// `<OnelineCodeBlock>`.
  pub(crate) fn code_block(&mut self, text: &str) {
    self.raw(CODE_BLOCK_OPEN);
    if text.starts_with('\n') {
      self.out.push('\n');
    }
    self.text(text);
    self.raw("</pre>");
  }

  /// `<Button href>` (primary).
  pub(crate) fn button(&mut self, href: &str, label: &str) {
    self.raw("<a");
    self.url_attr("href", href);
    self.wrap(BUTTON_ATTRS, BUTTON_CLOSE, |h| h.text(label));
  }

  /// `<Workspace>`: optional avatar (`size ?? 20` px) followed by the bold name.
  pub(crate) fn workspace(&mut self, workspace: &WorkspaceProps, size: Option<f64>) {
    if let Some(avatar) = workspace.avatar.as_deref().filter(|avatar| !avatar.is_empty()) {
      let size = size.or(workspace.size).unwrap_or(20.0);
      self.preload_image(avatar);
      self.raw("<img");
      self.url_attr("src", avatar);
      self.raw(" alt=\"avatar\" style=\"");
      let dimension = format!("{size}px");
      self.out.push_str("width:");
      escape_into(&mut self.out, &dimension);
      self.out.push_str(";height:");
      escape_into(&mut self.out, &dimension);
      self
        .out
        .push_str(";border-radius:12px;object-fit:cover;vertical-align:middle\"/>");
    }
    self.bold(&workspace.name);
  }

  /// `<Doc>`: a link around the bold title (`'Untitled'` when empty).
  pub(crate) fn doc(&mut self, doc: &DocProps) {
    self.raw("<a");
    self.url_attr("href", &doc.url);
    self.raw(LINK_ATTRS);
    self.bold(if doc.title.is_empty() { "Untitled" } else { &doc.title });
    self.raw("</a>");
  }

  /// `<IOSDate>`: `YYYY-MM-DD` of the date (the reference server runs in UTC).
  pub(crate) fn iso_date(&mut self, value: &DateTime<Utc>) {
    self.bold(&format!("{:04}-{:02}-{:02}", value.year(), value.month(), value.day()));
  }

  /// Wraps the rendered title and content in the `Template` document shell.
  pub(crate) fn finish(mut self, copyright_year: i32) -> String {
    let body = std::mem::take(&mut self.out);
    for src in FOOTER_IMAGES {
      self.preload_image(src);
    }
    let mut out = String::with_capacity(body.len() + 6 * 1024);
    out.push_str(DOCTYPE_AND_HEAD_OPEN);
    for src in &self.preloads {
      out.push_str(r#"<link rel="preload" as="image" href=""#);
      escape_into(&mut out, sanitize_url(src));
      out.push_str("\"/>");
    }
    out.push_str(HEAD_META);
    out.push_str(BODY_OPEN);
    out.push_str(&body);
    out.push_str(MAIN_CONTAINER_CLOSE);
    self.out = out;
    self.raw(FOOTER_OPEN);
    self.text("2023-");
    self.text(&copyright_year.to_string());
    self.text(" ToEverything");
    self.raw(FOOTER_CLOSE);
    self.out
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn escaping_and_url_sanitizing_follow_react() {
    for (input, escaped) in [
      ("plain", "plain"),
      (
        r#"<script>alert("x" & 'y')</script>"#,
        "&lt;script&gt;alert(&quot;x&quot; &amp; &#x27;y&#x27;)&lt;/script&gt;",
      ),
      ("https://a.b/c?d=1&e=2", "https://a.b/c?d=1&amp;e=2"),
    ] {
      let mut out = String::new();
      escape_into(&mut out, input);
      assert_eq!(out, escaped, "{input}");
    }
    for (url, blocked) in [
      ("javascript:alert(1)", true),
      (" \u{1}JaVaScRiPt:alert(1)", true),
      ("java\tscr\nipt\r:alert(1)", true),
      ("javascript\t:alert(1)", true),
      ("x javascript:alert(1)", false),
      ("https://app.affine.pro", false),
      ("javascrip:alert(1)", false),
      ("javascript", false),
    ] {
      assert_eq!(sanitize_url(url) == BLOCKED_JAVASCRIPT_URL, blocked, "{url:?}");
    }
  }
}
