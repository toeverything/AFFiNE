//! Minimal HTML escaping for the handful of raw HTML tags the markdown adapter emits
//! (`<img>` captions, database option `<span>`s) and reads back (`parse_html_attrs`).
//!
//! Only the five named character references are handled; that is enough to keep document text
//! containing `"`, `<`, `>`, or `&` from breaking out of an attribute or text node, and to make
//! the write -> read round trip lossless.

use std::borrow::Cow;

/// Escape `&`, `<`, `>`, `"`, and `'` so `s` can sit inside a double-quoted attribute or a text node.
pub(crate) fn escape_html(s: &str) -> Cow<'_, str> {
    if !s.contains(['&', '<', '>', '"', '\'']) {
        return Cow::Borrowed(s);
    }
    let mut out = String::with_capacity(s.len() + 8);
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            other => out.push(other),
        }
    }
    Cow::Owned(out)
}

/// Inverse of [`escape_html`]: decode the named references it emits (plus `&apos;`).
/// Unknown references are left untouched.
pub(crate) fn unescape_html(s: &str) -> Cow<'_, str> {
    if !s.contains('&') {
        return Cow::Borrowed(s);
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(pos) = rest.find('&') {
        out.push_str(&rest[..pos]);
        rest = &rest[pos..];
        let mut matched = false;
        for (entity, ch) in [
            ("&amp;", '&'),
            ("&lt;", '<'),
            ("&gt;", '>'),
            ("&quot;", '"'),
            ("&#39;", '\''),
            ("&apos;", '\''),
        ] {
            if let Some(tail) = rest.strip_prefix(entity) {
                out.push(ch);
                rest = tail;
                matched = true;
                break;
            }
        }
        if !matched {
            out.push('&');
            rest = &rest[1..];
        }
    }
    out.push_str(rest);
    Cow::Owned(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_and_unescape_round_trip() {
        let raw = r#"a "quoted" <b> & c's"#;
        let escaped = escape_html(raw);
        assert_eq!(escaped, "a &quot;quoted&quot; &lt;b&gt; &amp; c&#39;s");
        assert_eq!(unescape_html(&escaped), raw);
    }

    #[test]
    fn unescape_leaves_unknown_references_alone() {
        assert_eq!(unescape_html("x &nbsp; &y"), "x &nbsp; &y");
        assert!(matches!(unescape_html("plain"), Cow::Borrowed(_)));
    }
}
